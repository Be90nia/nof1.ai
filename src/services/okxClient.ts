/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * OKX API 客户端封装
 * 实现ExchangeClient接口
 */
import * as ccxt from "ccxt";
import { createLogger } from "../utils/loggerUtils";
import { RISK_PARAMS } from "../config/riskParams";
import {
  ExchangeClient,
  ExchangeType,
  ExchangeConfig,
  BaseAccount,
  BasePosition,
  BaseTicker,
  BaseOrder,
  BaseCandle,
  BaseContract,
  BaseFundingRate,
  BaseOrderBook,
  BaseTrade,
  BasePositionHistory,
  OkxAccount,
  OkxPosition,
  OkxTicker,
  OkxOrder,
  OkxCandle,
  OkxContract,
  OkxFundingRate,
} from "../types/exchange";

const logger = createLogger({
  name: "okx-client",
  level: "info",
});

/**
 * OKX交易所客户端实现类
 * OKX Exchange Client Implementation Class
 */
export class OkxClient implements ExchangeClient {
  private readonly client: ccxt.okx;
  private readonly settle = "USDT"; // 使用 USDT 结算

  /**
   * 构造函数
   * Constructor
   * @param config 交易所配置 Exchange configuration
   */
  constructor(config: ExchangeConfig) {
    // 初始化CCXT OKX客户端
    this.client = new ccxt.okx({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      password: config.passphrase || "",
      sandbox: config.sandbox || false,
      enableRateLimit: true,
      options: {
        defaultType: "swap", // 默认使用永续合约
      },
    });

    // 根据配置决定使用测试网还是正式网
    if (config.sandbox) {
      logger.info("使用 OKX 测试网");
    } else {
      logger.info("使用 OKX 正式网");
    }

    logger.info("OKX API 客户端初始化完成");
  }

  /**
   * Convert Gate.io symbol format to OKX symbol format
   * 将Gate.io交易对格式转换为OKX格式
   * @param symbol Gate.io symbol (e.g., "BTC_USDT") or OKX symbol (e.g., "BTC-USDT-SWAP")
   * @returns OKX symbol (e.g., "BTC/USDT:USDT" for futures, "BTC-USDT-SWAP" for swap)
   */
  private gateToOkxSymbol(symbol: string): string {
    if (!symbol) return "";

    // 如果已经是OKX格式，直接返回
    if (symbol.includes("-") && symbol.includes("SWAP")) {
      return symbol;
    }

    // 将 Gate.io 格式 "BTC_USDT" 转换为 OKX 格式
    if (symbol.includes("_")) {
      const parts = symbol.split("_");
      if (parts.length === 2) {
        const base = parts[0];
        const quote = parts[1];
        // 返回OKX永续合约格式
        return `${base}-${quote}-SWAP`;
      }
    }

    return symbol;
  }

  /**
   * 获取期货账户信息
   * Get futures account information
   * @param retries 重试次数 Retry count
   * @returns 账户信息 Account information
   */
  async getFuturesAccount(retries: number = 3): Promise<BaseAccount> {
    let lastError: any;

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用CCXT获取账户信息
        const accountInfo = await this.client.fetchBalance({
          type: "swap", // 获取永续合约账户信息
        });

        // 获取账户详情数据
        const accountData = accountInfo.info?.data?.[0];
        const accountDetails = accountData?.details?.[0];

        // 转换为标准格式
        const okxAccount: OkxAccount = {
          // 基本信息
          totalEquity: accountData?.totalEq || "0",
          availableBalance: accountDetails?.availEq || "0",
          usedBalance: accountDetails?.usedEq || "0",
          margin: accountDetails?.imr || "0",
          unrealizedPnl: accountDetails?.upl || "0",

          // 风险信息
          marginRatio: accountDetails?.mgnRatio || "0",
          maintenanceMargin: accountDetails?.mmr || "0",

          // 账户状态
          accountState: accountData?.st || "normal",

          // 其他信息
          currency: this.settle,
          updateTime: accountData?.uTime || Date.now().toString(),
        };

        return okxAccount;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取账户余额失败，重试 ${i + 1}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }

    logger.error(`获取账户余额失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取持仓信息
   * Get position information
   * @param retries 重试次数 Retry count
   * @returns 持仓信息列表 Position information list
   */
  async getPositions(retries: number = 3): Promise<BasePosition[]> {
    let lastError: any;

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用CCXT获取持仓信息
        const positions = await this.client.fetchPositions(
          undefined,
          undefined
        );

        // 过滤：只保留有持仓的合约和允许的币种
        const allowedSymbols = RISK_PARAMS.TRADING_SYMBOLS;
        const filteredPositions = positions
          .filter((p: any) => {
            // 只保留有持仓的合约
            if (parseFloat(p.contracts) === 0) {
              return false;
            }

            // 从交易对中提取币种名称
            const symbol = p.symbol?.split("/")[0];
            return symbol && allowedSymbols.includes(symbol);
          })
          .map((p: any) => {
            // 转换为标准格式
            const okxPosition: OkxPosition = {
              // 基本信息
              symbol: p.symbol,
              contract: p.symbol?.replace("/", "_")?.replace(":", "_") || "",
              side: p.side,
              size: parseFloat(p.contracts || "0"), // 使用 contracts 属性而不是 size
              notional:
                parseFloat(p.contracts || "0") * parseFloat(p.markPrice || "0"),

              // 价格信息
              entryPrice: parseFloat(p.entryPrice || "0"),
              markPrice: parseFloat(p.markPrice || "0"),
              indexPrice: parseFloat(p.indexPrice || "0"),

              // 盈亏信息
              unrealizedPnl: parseFloat(p.unrealizedPnl || "0"),
              percentage: parseFloat(p.percentage || "0"),

              // 保证金信息
              initialMargin: parseFloat(p.initialMargin || "0"),
              maintenanceMargin: parseFloat(p.maintenanceMargin || "0"),

              // 杠杆信息
              leverage: parseFloat(p.leverage || "1"),
              marginMode: p.marginMode || "cross",

              // 其他信息
              liquidationPrice: parseFloat(p.liquidationPrice || "0"),
              updateTime: p.timestamp || Date.now(),
            };

            return okxPosition;
          });

        return filteredPositions;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取持仓失败，重试 ${i + 1}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }

    logger.error(`获取持仓失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取期货行情信息
   * Get futures ticker information
   * @param contract 合约代码 Contract symbol
   * @param retries 重试次数 Retry count
   * @returns 行情信息 Ticker information
   */
  async getFuturesTicker(
    contract: string,
    retries: number = 3
  ): Promise<BaseTicker> {
    let lastError: any;

    // 转换交易对格式
    const okxSymbol = this.gateToOkxSymbol(contract);

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用CCXT获取行情信息
        const ticker = await this.client.fetchTicker(okxSymbol, undefined);

        // 转换为标准格式
        const okxTicker: OkxTicker = {
          // 基本信息
          symbol: ticker.symbol,
          contract: contract,

          // 价格信息
          last: parseFloat(ticker.last?.toString() || "0").toString(),
          bid: parseFloat(ticker.bid?.toString() || "0").toString(),
          ask: parseFloat(ticker.ask?.toString() || "0").toString(),
          high: parseFloat(ticker.high?.toString() || "0").toString(),
          low: parseFloat(ticker.low?.toString() || "0").toString(),
          open: parseFloat(ticker.open?.toString() || "0").toString(),
          close: parseFloat(ticker.close?.toString() || "0").toString(),

          // 成交信息
          volume: parseFloat(ticker.baseVolume?.toString() || "0").toString(),
          quoteVolume: parseFloat(
            ticker.quoteVolume?.toString() || "0"
          ).toString(),

          // 时间信息
          timestamp: ticker.timestamp || Date.now(),
          datetime: ticker.datetime || new Date().toISOString(),

          // 其他信息
          previousClose: parseFloat(
            ticker.previousClose?.toString() || "0"
          ).toString(),
          change: parseFloat(ticker.change?.toString() || "0").toString(),
          percentage: parseFloat(
            ticker.percentage?.toString() || "0"
          ).toString(),
          average: parseFloat(ticker.average?.toString() || "0").toString(),
          vwap: parseFloat(ticker.vwap?.toString() || "0").toString(),

          // 资金费率信息
          fundingRate: parseFloat(ticker.info?.fundingRate || "0").toString(),
          nextFundingTime: parseInt(ticker.info?.nextFundingTime || "0"),
          markPrice: parseFloat(ticker.info?.markPx || "0").toString(),
        };

        return okxTicker;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取 ${contract} 价格失败，重试 ${i + 1}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }

    logger.error(`获取 ${contract} 价格失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取期货K线数据
   * Get futures candlestick data
   * @param contract 合约代码 Contract symbol
   * @param interval 时间间隔 Time interval
   * @param limit 数据条数 Number of data points
   * @param retries 重试次数 Retry count
   * @returns K线数据列表 Candlestick data list
   */
  async getFuturesCandles(
    contract: string,
    interval: string = "5m",
    limit: number = 100,
    retries: number = 3
  ): Promise<BaseCandle[]> {
    let lastError: any;

    // 转换交易对格式
    const okxSymbol = this.gateToOkxSymbol(contract);

    // 转换时间间隔格式
    const timeframe = this.convertTimeframe(interval);

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用CCXT获取K线数据
        const candles = await this.client.fetchOHLCV(
          okxSymbol,
          timeframe,
          undefined,
          limit,
          {
            type: "swap", // 获取永续合约K线
          }
        );

        // 转换为标准格式
        const okxCandles: OkxCandle[] = candles.map((candle: any) => {
          const [timestamp, open, high, low, close, volume] = candle;

          return {
            // 基本信息
            symbol: okxSymbol,
            contract: contract,
            timeframe: interval,

            // OHLCV数据
            open: parseFloat(open),
            high: parseFloat(high),
            low: parseFloat(low),
            close: parseFloat(close),
            volume: parseFloat(volume),

            // 时间信息
            timestamp,
            datetime: new Date(timestamp).toISOString(),
          };
        });

        return okxCandles;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(
            `获取 ${contract} K线数据失败，重试 ${i + 1}/${retries}...`
          );
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }

    logger.error(
      `获取 ${contract} K线数据失败（${retries}次重试）:`,
      lastError
    );
    throw lastError;
  }

  /**
   * 转换时间间隔格式
   * Convert timeframe format
   * @param interval Gate格式的时间间隔 Gate format timeframe
   * @returns CCXT格式的时间间隔 CCXT format timeframe
   */
  private convertTimeframe(interval: string): string {
    // Gate.io 和 OKX 的时间间隔格式基本一致，直接返回
    return interval;
  }

  /**
   * 下单
   * Place order
   * @param params 下单参数 Order parameters
   * @returns 订单信息 Order information
   */
  async placeOrder(params: {
    contract: string;
    size: number;
    price?: number;
    type?: string;
    side?: string;
    tif?: string;
    reduceOnly?: boolean;
    autoSize?: string;
    stopLoss?: number;
    takeProfit?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    posSide?: "long" | "short" | "net"; // 持仓方向，用于OKX合约交易，支持"long"、"short"和"net"
  }): Promise<BaseOrder> {
    try {
      // 判断合约格式并转换
      let okxSymbol: string;
      let contractForInfo: string;

      // 如果已经是OKX格式（包含-和SWAP），直接使用
      if (params.contract.includes("-") && params.contract.includes("SWAP")) {
        okxSymbol = params.contract;
        contractForInfo = params.contract;
      } else {
        // 否则从Gate.io格式转换
        okxSymbol = this.gateToOkxSymbol(params.contract);
        contractForInfo = params.contract;
      }

      // 获取合约信息以验证数量和价格
      const contractInfo = await this.getContractInfo(params.contract);

      // 验证并调整数量
      let adjustedSize = params.size;
      const absSize = Math.abs(params.size);

      // 检查最小数量限制
      if (
        contractInfo.minAmount &&
        absSize < parseFloat(contractInfo.minAmount)
      ) {
        logger.warn(
          `订单数量 ${absSize} 小于最小限制 ${contractInfo.minAmount}，调整为最小值`
        );
        adjustedSize =
          params.size > 0
            ? parseFloat(contractInfo.minAmount)
            : -parseFloat(contractInfo.minAmount);
      }

      // 检查价格是否偏离当前价格太多
      let adjustedPrice = params.price;
      if (params.price && params.price !== 0) {
        try {
          const ticker = await this.getFuturesTicker(params.contract);
          const markPrice = parseFloat(ticker.markPrice || "0");

          if (markPrice > 0) {
            const maxDeviation = 0.05; // 最大允许偏离5%
            const deviation = Math.abs(params.price - markPrice) / markPrice;

            if (deviation > maxDeviation) {
              // 如果价格偏离太大，调整为接近当前价格
              const adjustedPriceValue =
                params.size > 0
                  ? markPrice * (1 + maxDeviation / 2)
                  : markPrice * (1 - maxDeviation / 2);

              adjustedPrice = parseFloat(
                adjustedPriceValue.toFixed(ticker.pricePrecision || 8)
              );
              logger.warn(
                `价格偏离太大，从 ${params.price} 调整为 ${adjustedPrice}`
              );
            }
          }
        } catch (error) {
          logger.warn("获取当前价格失败，使用原价格:", error);
        }
      }

      // 构建订单参数
      const orderParams: any = {
        symbol: okxSymbol,
        type: params.type === "limit" ? "limit" : "market",
        side: params.side === "buy" ? "buy" : "sell",
        amount: Math.abs(params.size),
        price: params.type === "limit" ? adjustedPrice : undefined,
        params: {
          // OKX特定参数
          posSide: params.posSide || "net", // 持仓方向，OKX使用"net"表示双向持仓模式
          tdMode: "cross", // 全仓模式
        },
      };

      // 添加止盈止损参数
      if (params.takeProfitPrice) {
        orderParams.params.takeProfitPrice = params.takeProfitPrice;
      }
      if (params.stopLossPrice) {
        orderParams.params.stopLossPrice = params.stopLossPrice;
      }

      // 设置reduceOnly标志
      if (params.reduceOnly) {
        orderParams.params.reduceOnly = true;
      }

      // 使用CCXT下单
      const orderResult = await this.client.createOrder(
        orderParams.symbol,
        orderParams.type,
        orderParams.side,
        orderParams.amount,
        orderParams.price,
        orderParams.params
      );

      // 转换为标准格式
      const okxOrder: OkxOrder = {
        // 基本信息
        id: orderResult.id,
        symbol: orderResult.symbol,
        contract: params.contract,
        type: orderResult.type,
        side: orderResult.side,

        // 数量和价格
        amount: parseFloat(orderResult.amount?.toString() || "0"),
        price: parseFloat(orderResult.price?.toString() || "0"),
        filled: parseFloat(orderResult.filled?.toString() || "0"),
        remaining: parseFloat(orderResult.remaining?.toString() || "0"),

        // 状态信息
        status: orderResult.status,

        // 时间信息
        timestamp: orderResult.timestamp || Date.now(),
        datetime: orderResult.datetime || new Date().toISOString(),

        // 其他信息
        fee: orderResult.fee?.cost?.toString() || "0",
        info: orderResult.info,
      };

      logger.info(`订单已提交: ${JSON.stringify(okxOrder)}`);
      return okxOrder;
    } catch (error) {
      logger.error(`下单失败:`, error);
      throw error;
    }
  }

  /**
   * 获取订单信息
   * Get order information
   * @param {string} orderId - 订单ID Order ID
   * @param {string} [symbol] - 交易对 Trading pair (optional)
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseOrder>} 订单信息 Order information
   *
   * 示例 Example:
   * getOrder("12345", "BTC-USDT")
   */
  async getOrder(
    orderId: string,
    symbol?: string,
    retries: number = 3
  ): Promise<BaseOrder> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式（如果提供了symbol）
        const okxSymbol = symbol ? this.gateToOkxSymbol(symbol) : undefined;

        // 使用CCXT获取订单信息
        const order = await this.client.fetchOrder(orderId, okxSymbol);

        // 转换为标准格式
        const okxOrder: OkxOrder = {
          orderId: order.id,
          clientOrderId: order.clientOrderId || "",
          symbol: order.symbol,
          contract:
            symbol || order.symbol?.replace("/", "_")?.replace(":", "_") || "",
          price: order.price?.toString() || "0",
          size: order.amount?.toString() || "0",
          side: order.side === "buy" ? "buy" : "sell",
          type: this.mapOrderType(order.type),
          status: this.mapOrderStatus(order.status),
          timestamp: order.timestamp?.toString() || "",
          fee: order.fee?.cost?.toString() || "0",
          filled: order.filled?.toString() || "0",
          remaining: order.remaining?.toString() || "0",
          averagePrice: order.average?.toString() || "0",
          info: order.info,
        };

        return okxOrder;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取订单信息失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取订单信息失败");
  }

  /**
   * 取消订单
   * Cancel order
   * @param {string} orderId - 订单ID Order ID
   * @param {string} [symbol] - 交易对 Trading pair (optional)
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseOrder>} 取消后的订单信息 Canceled order information
   *
   * 示例 Example:
   * cancelOrder("12345", "BTC-USDT")
   */
  async cancelOrder(
    orderId: string,
    symbol?: string,
    retries: number = 3
  ): Promise<BaseOrder> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式（如果提供了symbol）
        const okxSymbol = symbol ? this.gateToOkxSymbol(symbol) : undefined;

        // 使用CCXT取消订单
        const order = await this.client.cancelOrder(orderId, okxSymbol);

        // 转换为标准格式
        const okxOrder: OkxOrder = {
          orderId: order.id,
          clientOrderId: order.clientOrderId || "",
          symbol: order.symbol,
          contract:
            symbol || order.symbol?.replace("/", "_")?.replace(":", "_") || "",
          price: order.price?.toString() || "0",
          size: order.amount?.toString() || "0",
          side: order.side === "buy" ? "buy" : "sell",
          type: this.mapOrderType(order.type),
          status: this.mapOrderStatus(order.status),
          timestamp: order.timestamp?.toString() || "",
          fee: order.fee?.cost?.toString() || "0",
          filled: order.filled?.toString() || "0",
          remaining: order.remaining?.toString() || "0",
          averagePrice: order.average?.toString() || "0",
          info: order.info,
        };

        return okxOrder;
      } catch (error) {
        lastError = error as Error;
        console.error(`取消订单失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("取消订单失败");
  }

  /**
   * 获取未成交订单
   * Get open orders
   * @param contract 合约代码 Contract symbol
   * @returns 未成交订单列表 Open order list
   */
  async getOpenOrders(contract?: string): Promise<BaseOrder[]> {
    try {
      // 构建查询参数
      const params: any = {
        type: "swap", // 永续合约
      };

      if (contract) {
        params.symbol = this.gateToOkxSymbol(contract);
      }

      // 使用CCXT获取未成交订单
      const openOrders = await this.client.fetchOpenOrders();

      // 转换为标准格式
      const okxOrders: OkxOrder[] = openOrders.map((order: any) => {
        return {
          orderId: order.id,
          clientOrderId: order.clientOrderId || "",
          symbol: order.symbol,
          contract: order.symbol?.replace("/", "_")?.replace(":", "_") || "",
          price: order.price?.toString() || "0",
          size: order.amount?.toString() || "0",
          side: order.side === "buy" ? "buy" : "sell",
          type: this.mapOrderType(order.type),
          status: this.mapOrderStatus(order.status),
          timestamp: order.timestamp?.toString() || "",
          fee: order.fee?.cost?.toString() || "0",
          filled: order.filled?.toString() || "0",
          remaining: order.remaining?.toString() || "0",
          averagePrice: order.average?.toString() || "0",
          info: order.info,
        };
      });

      return okxOrders;
    } catch (error) {
      logger.error(`获取未成交订单失败:`, error);
      throw error;
    }
  }

  /**
   * 设置杠杆倍数
   * Set leverage
   * @param contract 合约代码 Contract symbol
   * @param leverage 杠杆倍数 Leverage multiplier
   * @returns 设置结果 Setting result
   */
  async setLeverage(contract: string, leverage: number): Promise<any> {
    try {
      // 转换交易对格式
      const okxSymbol = this.gateToOkxSymbol(contract);

      // 设置杠杆倍数
      const result = await this.client.setLeverage(leverage, okxSymbol);

      logger.info(`${contract} 杠杆已设置为 ${leverage}x`);
      return result;
    } catch (error) {
      logger.error(`设置 ${contract} 杠杆为 ${leverage}x 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取资金费率
   * Get funding rate
   * @param {string} symbol - 交易对 Trading pair
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseFundingRate>} 资金费率信息 Funding rate information
   *
   * 示例 Example:
   * getFundingRate("BTC-USDT-SWAP")
   */
  async getFundingRate(
    symbol: string,
    retries: number = 3
  ): Promise<BaseFundingRate> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式
        const okxSymbol = this.gateToOkxSymbol(symbol);

        // 使用CCXT获取资金费率
        const fundingRate = await this.client.fetchFundingRate(
          okxSymbol,
          undefined
        );

        // 转换为标准格式
        const baseFundingRate: BaseFundingRate = {
          symbol: symbol,
          contract: okxSymbol,
          fundingRate: fundingRate.fundingRate?.toString() || "0",
          fundingTimestamp: fundingRate.fundingTimestamp || Date.now(),
          nextFundingTimestamp: fundingRate.nextFundingTimestamp,
          info: fundingRate.info,
        };

        return baseFundingRate;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取资金费率失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取资金费率失败");
  }

  /**
   * 获取合约信息
   * Get contract information
   * @param contract 合约代码 Contract symbol
   * @returns 合约信息 Contract information
   */
  async getContractInfo(contract: string): Promise<BaseContract> {
    try {
      // 判断合约格式并转换
      let okxSymbol: string;
      let contractForInfo: string;

      // 如果已经是OKX格式（包含-和SWAP），直接使用
      if (contract.includes("-") && contract.includes("SWAP")) {
        okxSymbol = contract;
        // 对于SWAP格式，我们需要转换为CCXT格式来查找
        const parts = contract.split("-");
        if (parts.length >= 2) {
          contractForInfo = `${parts[0]}/${parts[1]}:${parts[1]}`;
        } else {
          contractForInfo = contract;
        }
      } else {
        // 否则从Gate.io格式转换
        okxSymbol = this.gateToOkxSymbol(contract);
        contractForInfo = okxSymbol;
      }

      // 获取所有合约信息
      const allContracts = await this.client.fetchMarkets();

      // 查找指定合约 - 尝试两种格式
      let contractInfo = allContracts.find(
        (c: any) => c.symbol === contractForInfo
      );

      // 如果没找到，尝试使用原始格式查找
      if (
        !contractInfo &&
        contract.includes("-") &&
        contract.includes("SWAP")
      ) {
        contractInfo = allContracts.find((c: any) => c.symbol === okxSymbol);
      }

      // 如果还是没找到，尝试使用instId查找
      if (!contractInfo) {
        contractInfo = allContracts.find(
          (c: any) => c.info?.instId === okxSymbol
        );
      }

      if (!contractInfo) {
        throw new Error(`未找到合约 ${contract} 的信息`);
      }

      // 转换为标准格式
      const okxContract: BaseContract = {
        symbol: contractInfo.symbol,
        contract: contract,
        base: contractInfo.base || "",
        quote: contractInfo.quote || "",
        active: contractInfo.active || false,
        type: contractInfo.type || "swap",
        spot: contractInfo.spot || false,
        margin: contractInfo.margin || false,
        swap: contractInfo.swap || false,
        future: contractInfo.future || false,
        option: contractInfo.option || false,
        contractSize: contractInfo.contractSize || 1,
        linear: contractInfo.linear || false,
        inverse: contractInfo.inverse || false,
        expiry: contractInfo.expiry,
        expiryDatetime: contractInfo.expiryDatetime,
        precision: contractInfo.precision || { amount: 8, price: 8 },
        limits: contractInfo.limits || {
          amount: { min: 0, max: 0 },
          price: { min: 0, max: 0 },
        },
        info: contractInfo.info || {},
      };

      return okxContract;
    } catch (error) {
      logger.error(`获取 ${contract} 合约信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取市场信息
   * Get market information
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseContract[]>} 市场信息列表 Market information list
   *
   * 示例 Example:
   * getMarkets()
   */
  async getMarkets(retries: number = 3): Promise<BaseContract[]> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 使用CCXT获取所有合约信息
        const contracts = await this.client.fetchMarkets();

        // 转换为标准格式
        const baseContracts: BaseContract[] = contracts
          .filter((market) => market != null)
          .map((market) => {
            return {
              // 基本信息
              symbol: market?.symbol || "",
              contract: market?.symbol?.replace("-", "_") || "",
              base: market?.base || "",
              quote: market?.quote || "",

              // 合约信息
              active: market?.active || false,
              type: market?.type || "swap",
              spot: market?.spot || false,
              margin: market?.margin || false,
              swap: market?.swap || true,
              future: market?.future || false,
              option: market?.option || false,

              // 精度信息
              precision: {
                amount: market?.precision?.amount || 8,
                price: market?.precision?.price || 8,
              },

              // 限制信息
              limits: {
                amount: {
                  min: market?.limits?.amount?.min || 0,
                  max: market?.limits?.amount?.max || 0,
                },
                price: {
                  min: market?.limits?.price?.min || 0,
                  max: market?.limits?.price?.max || 0,
                },
                cost: {
                  min: market?.limits?.cost?.min || 0,
                  max: market?.limits?.cost?.max || 0,
                },
              },

              // 其他信息
              info: market?.info || {},
            };
          });

        return baseContracts;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取市场信息失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取市场信息失败");
  }

  /**
   * 获取所有合约信息
   * Get all contract information
   * @param {Object} options - 选项参数
   * @param {string} [options.symbol] - 可选的币种符号，用于过滤特定币种的合约
   * @param {number} [options.retries] - 重试次数 Retry count
   * @returns {Promise<BaseContract[]>} 合约信息列表
   *
   * 示例 Example:
   * const contracts = await okxClient.getAllContracts();
   * const btcContracts = await okxClient.getAllContracts({ symbol: 'BTC' });
   */
  async getAllContracts(options?: {
    symbol?: string;
    retries?: number;
  }): Promise<BaseContract[]> {
    const retries = options?.retries ?? 3;
    let lastError: any;

    for (let i = 0; i <= retries; i++) {
      try {
        // 使用CCXT获取所有合约信息
        const contracts = await this.client.fetchMarkets();

        // 转换为标准格式
        const okxContracts: OkxContract[] = contracts
          .filter((c: any) => {
            // 只获取永续合约
            if (!c.swap) return false;

            // 检查是否是活跃的合约
            if (!c.active) return false;

            // 检查是否是线性合约（以USDT结算）
            if (!c.linear) return false;

            // 检查是否是USDT结算的合约
            if (c.settle !== "USDT") return false;

            // 如果指定了币种，检查是否匹配
            if (options?.symbol) {
              return c.base === options.symbol;
            }

            // 检查是否在允许的交易币种列表中
            return c.base && RISK_PARAMS.TRADING_SYMBOLS.includes(c.base);
          })
          .map((c: any) => {
            return {
              // 基本信息
              symbol: c.symbol, // 保持原始格式，如 BTC/USDT:USDT
              contract: c.info?.instId || c.symbol, // 使用instId作为合约ID
              base: c.base,
              quote: c.quote,

              // 合约信息
              active: c.active || false,
              type: c.type || "swap",
              spot: c.spot || false,
              margin: c.margin || false,
              swap: c.swap || true,
              future: c.future || false,
              option: c.option || false,
              linear: c.linear || false,
              inverse: c.inverse || false,
              contractSize: c.contractSize,
              settle: c.settle,
              settleCurrency: c.settleCurrency,

              // 精度信息
              precision: {
                amount: c.precision?.amount || 8,
                price: c.precision?.price || 8,
              },

              // 限制信息
              limits: {
                amount: {
                  min: c.limits?.amount?.min || 0,
                  max: c.limits?.amount?.max || 0,
                },
                price: {
                  min: c.limits?.price?.min || 0,
                  max: c.limits?.price?.max || 0,
                },
                cost: {
                  min: c.limits?.cost?.min || 0,
                  max: c.limits?.cost?.max || 0,
                },
              },

              // 其他信息
              info: c.info || {},
            };
          });

        return okxContracts;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取所有合约信息失败，重试 ${i + 1}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }

    logger.error(`获取所有合约信息失败（${retries}次重试）:`, lastError);
    throw lastError;
  }

  /**
   * 获取订单簿
   * Get order book
   * @param contract 合约代码 Contract symbol
   * @param limit 深度档位 Depth level
   * @param retries 重试次数 Retry count
   * @returns 订单簿信息 Order book information
   */
  /**
   * 获取订单簿
   * Get order book
   * @param {string} symbol - 交易对 Trading pair
   * @param {number} [limit=100] - 订单簿深度限制 Order book depth limit
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseOrderBook>} 订单簿信息 Order book information
   *
   * 示例 Example:
   * getOrderBook("BTC-USDT-SWAP", 100)
   */
  async getOrderBook(
    symbol: string,
    limit: number = 100,
    retries: number = 3
  ): Promise<BaseOrderBook> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式
        const okxSymbol = this.gateToOkxSymbol(symbol);

        // 使用CCXT获取订单簿
        const orderBook = await this.client.fetchOrderBook(okxSymbol, limit, {
          type: "swap",
        });

        // 转换为标准格式
        const baseOrderBook: BaseOrderBook = {
          symbol: symbol,
          contract: okxSymbol,
          bids:
            orderBook.bids?.map(([price, amount]) => [
              parseFloat(price?.toString() || "0").toString(),
              parseFloat(amount?.toString() || "0").toString(),
            ]) || [],
          asks:
            orderBook.asks?.map(([price, amount]) => [
              parseFloat(price?.toString() || "0").toString(),
              parseFloat(amount?.toString() || "0").toString(),
            ]) || [],
          timestamp: orderBook.timestamp || Date.now(),
          datetime: orderBook.datetime || new Date().toISOString(),
          nonce: orderBook.nonce,
          info: (orderBook as any).info || {},
        };

        return baseOrderBook;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取订单簿失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取订单簿失败");
  }

  /**
   * 获取交易历史
   * Get trade history
   * @param {string} symbol - 交易对 Trading pair
   * @param {number} [since] - 开始时间戳 Start timestamp
   * @param {number} [limit] - 限制数量 Limit count
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BaseTrade[]>} 交易历史列表 Trade history list
   *
   * 示例 Example:
   * getMyTrades("BTC-USDT-SWAP", 1640995200000, 100)
   */
  async getMyTrades(
    symbol: string,
    since?: number,
    limit?: number,
    retries: number = 3
  ): Promise<BaseTrade[]> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式
        const okxSymbol = this.gateToOkxSymbol(symbol);

        // 使用CCXT获取交易历史
        const trades = await this.client.fetchMyTrades(
          okxSymbol,
          since,
          limit,
          {
            type: "swap", // 永续合约
          }
        );

        // 转换为标准格式
        const baseTrades: BaseTrade[] = trades.map((trade) => ({
          id: trade.id,
          order: trade.order,
          symbol: symbol,
          contract: okxSymbol,
          side: trade.side || "buy",
          amount: trade.amount?.toString() || "0",
          price: trade.price?.toString() || "0",
          cost: trade.cost?.toString() || "0",
          timestamp: trade.timestamp || Date.now(),
          datetime: trade.datetime || new Date().toISOString(),
          fee: {
            cost: trade.fee?.cost?.toString() || "0",
            currency: trade.fee?.currency || "USDT",
            rate: trade.fee?.rate?.toString(),
          },
          takerOrMaker: trade.takerOrMaker,
          info: trade.info,
        }));

        return baseTrades;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取交易历史失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取交易历史失败");
  }

  /**
   * 获取持仓历史
   * Get position history
   * @param {string} [symbol] - 交易对 Trading pair (optional)
   * @param {number} [since] - 开始时间戳 Start timestamp
   * @param {number} [limit] - 限制数量 Limit count
   * @param {number} [retries=3] - 重试次数 Retry count
   * @returns {Promise<BasePositionHistory[]>} 持仓历史列表 Position history list
   *
   * 示例 Example:
   * getPositionHistory("BTC-USDT-SWAP", 1640995200000, 100)
   */
  async getPositionHistory(
    symbol?: string,
    since?: number,
    limit?: number,
    retries: number = 3
  ): Promise<BasePositionHistory[]> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // 转换交易对格式为OKX原生格式
        let okxSymbol: string | undefined;
        console.log(`原始交易对: ${symbol}`);
        if (symbol) {
          if (symbol.includes("-") && symbol.includes("SWAP")) {
            // 已经是OKX格式，直接使用
            okxSymbol = symbol;
            console.log(`使用OKX格式: ${okxSymbol}`);
          } else {
            // 从Gate.io格式转换
            okxSymbol = this.gateToOkxSymbol(symbol);
            console.log(`转换Gate.io格式为OKX格式: ${symbol} -> ${okxSymbol}`);
          }
        }

        // 使用OKX原生格式获取持仓信息
        console.log(`使用OKX原生格式获取持仓信息，交易对: ${okxSymbol}`);
        const positions = await this.client.fetchPositions(okxSymbol ? [okxSymbol] : undefined);

        // 过滤出非零持仓
        const activePositions = positions.filter(
          (position) => parseFloat(position.contracts?.toString() || "0") !== 0
        );

        // 转换为标准格式
        const basePositionHistory: BasePositionHistory[] = activePositions.map(
          (position) => ({
            symbol: position.symbol,
            contract:
              position.symbol?.replace("/", "_")?.replace(":", "_") || "",
            side: position.side || "long",
            size: position.contracts?.toString() || "0", // 使用 contracts 而不是 size
            notional: position.notional?.toString() || "0",
            entryPrice: position.entryPrice?.toString() || "0",
            markPrice: position.markPrice?.toString() || "0",
            unrealizedPnl: position.unrealizedPnl?.toString() || "0",
            percentage: position.percentage?.toString() || "0",
            timestamp: position.timestamp || Date.now(),
            datetime: position.datetime || new Date().toISOString(),
            info: position.info,
          })
        );

        return basePositionHistory;
      } catch (error) {
        lastError = error as Error;
        console.error(`获取持仓历史失败 (尝试 ${i + 1}/${retries}):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }

    throw lastError || new Error("获取持仓历史失败");
  }

  /**
   * 获取历史结算记录
   * Get historical settlement records
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @param offset 偏移量 Offset
   * @param days 时间范围（天数） Time range in days
   * @returns 历史结算记录列表 Historical settlement record list
   */
  async getSettlementHistory(
    contract?: string,
    limit: number = 100,
    offset: number = 0,
    days?: number
  ): Promise<any[]> {
    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        // 如果已经是OKX格式（包含-和SWAP），直接使用
        // 否则从Gate.io格式转换
        let okxSymbol: string | undefined;
        if (contract) {
          if (contract.includes("-") && contract.includes("SWAP")) {
            okxSymbol = contract;
          } else {
            okxSymbol = this.gateToOkxSymbol(contract);
          }
        }

        // 构建查询参数
        const params: any = {
          instType: "SWAP", // 合约类型：SWAP-永续合约
          limit,
          offset,
        };

        // 如果指定了合约，添加到参数中
        if (okxSymbol) {
          params.instId = okxSymbol;
        }

        // 如果指定了时间范围，添加到参数中
        if (days) {
          const now = new Date();
          const after = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          // OKX API需要毫秒级时间戳
          // 根据OKX API文档，时间过滤使用begin和end参数
          params.begin = after.getTime().toString();
          params.end = now.getTime().toString();
        }

        // 使用CCXT的privateGetAccountBills方法获取账户账单
        const response = await this.client.privateGetAccountBills(params);

        // 检查响应数据
        if (!response || !response.data || !Array.isArray(response.data)) {
          logger.warn("获取结算历史响应格式异常:", response);
          return [];
        }

        // 过滤出结算相关的记录（类型1-交易，7-资金费用，8-交割，9-资金费用折扣券）
        // 同时排除充值和提现等非交易记录
        const settlementRecords = response.data.filter((item: any) => {
          const type = parseInt(item.type);
          return type === 1 || type === 7 || type === 8 || type === 9;
        });

        // 转换为标准格式
        const settlementHistory = settlementRecords.map((item: any) => {
          const type = parseInt(item.type);
          let settlementType = "unknown";
          
          switch (type) {
            case 1:
              settlementType = "trade";
              break;
            case 7:
              settlementType = "funding";
              break;
            case 8:
              settlementType = "delivery";
              break;
            case 9:
              settlementType = "clawback";
              break;
          }

          // 对于交易记录，使用tradeId作为ID；对于其他记录，使用billId
          const recordId = type === 1 ? 
            (item.tradeId ? `trade_${item.tradeId}` : item.billId) : 
            item.billId;

          return {
            id: recordId || "",
            symbol: item.instId || "",
            contract: item.instId || "",
            type: settlementType,
            amount: item.sz?.toString() || "0",
            currency: item.ccy || "",
            fee: item.fee?.toString() || "0",
            timestamp: item.ts?.toString() || "",
            datetime: new Date(parseInt(item.ts)).toISOString(),
            info: item,
          };
        });

        return settlementHistory;
      } catch (error) {
        lastError = error as Error;
        logger.error(`获取历史结算记录失败 (尝试 ${4 - retries}/3):`, error);

        // 如果不是最后一次尝试，等待一段时间再重试
        if (retries > 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
        }
        retries--;
      }
    }

    throw lastError || new Error("获取历史结算记录失败");
  }

  /**
   * 映射结算类型
   * Map settlement type
   * @param billType OKX账单类型 OKX bill type
   * @returns 标准结算类型 Standard settlement type
   */
  private mapSettlementType(billType: string | number | undefined): string {
    const type = typeof billType === 'string' ? parseInt(billType) : billType;
    switch (type) {
      case 7:
        return "funding";
      case 8:
        return "delivery";
      case 9:
        return "clawback";
      default:
        return "unknown";
    }
  }

  /**
   * 获取历史订单记录
   * Get historical order records
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @returns 历史订单记录列表 Historical order record list
   */
  async getOrderHistory(
    contract?: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      // 如果已经是OKX格式（包含-和SWAP），直接使用
      // 否则从Gate.io格式转换
      let okxSymbol: string | undefined;
      if (contract) {
        if (contract.includes("-") && contract.includes("SWAP")) {
          okxSymbol = contract;
        } else {
          okxSymbol = this.gateToOkxSymbol(contract);
        }
      }

      // 构建查询参数
      const params: any = {
        type: "swap", // 永续合约
        limit,
      };

      // 获取历史订单记录 - 使用fetchClosedOrders而不是fetchOrders
      const orderHistory = await this.client.fetchClosedOrders(
        okxSymbol,
        undefined,
        undefined,
        params
      );

      // 转换为标准格式
      const okxOrders: OkxOrder[] = orderHistory.map((order: any) => {
        return {
          orderId: order.id,
          clientOrderId: order.clientOrderId || "",
          symbol: order.symbol,
          contract: order.symbol?.replace("/", "_")?.replace(":", "_") || "",
          price: order.price?.toString() || "0",
          size: order.amount?.toString() || "0",
          side: order.side === "buy" ? "buy" : "sell",
          type: this.mapOrderType(order.type),
          status: this.mapOrderStatus(order.status),
          timestamp: order.timestamp?.toString() || "",
          fee: order.fee?.cost?.toString() || "0",
          filled: order.filled?.toString() || "0",
          remaining: order.remaining?.toString() || "0",
          averagePrice: order.average?.toString() || "0",
          info: order.info,
        };
      });

      return okxOrders;
    } catch (error) {
      logger.error(`获取历史订单记录失败:`, error);
      throw error;
    }
  }

  /**
   * 映射订单类型
   * Map order type
   * @param type CCXT订单类型 CCXT order type
   * @returns 标准订单类型 Standard order type
   */
  private mapOrderType(type: string | undefined): string {
    switch (type?.toLowerCase()) {
      case "market":
        return "market";
      case "limit":
        return "limit";
      case "stop":
        return "stop";
      case "stop_limit":
        return "stop_limit";
      default:
        return "limit";
    }
  }

  /**
   * 通过历史订单记录计算历史结算记录
   * Calculate historical settlement records from order history
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @returns 历史结算记录列表 Historical settlement record list
   */
  async calculateSettlementHistoryFromOrders(
    contract?: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      // 获取历史订单记录
      const orderHistory = await this.getOrderHistory(contract, limit * 2); // 获取更多订单以确保有足够的数据

      // 获取历史成交记录
      const tradeHistory = await this.getMyTrades(contract || '', limit * 2);

      // 获取资金费率历史
      const fundingRateHistory = await this.getFundingRateHistory(contract, limit);

      // 合并所有数据并按时间排序
      const allRecords: any[] = [];

      // 处理订单记录，提取已平仓的订单
      orderHistory.forEach((order: any) => {
        if (order.status === 'filled') {
          allRecords.push({
            type: 'trade',
            timestamp: parseInt(order.timestamp),
            data: order
          });
        }
      });

      // 处理成交记录
      tradeHistory.forEach((trade: any) => {
        allRecords.push({
          type: 'trade',
          timestamp: parseInt(trade.timestamp),
          data: trade
        });
      });

      // 处理资金费率记录
      fundingRateHistory.forEach((funding: any) => {
        allRecords.push({
          type: 'funding',
          timestamp: parseInt(funding.timestamp),
          data: funding
        });
      });

      // 按时间戳排序
      allRecords.sort((a, b) => a.timestamp - b.timestamp);

      // 计算结算记录
      const settlementRecords: any[] = [];
      let position = 0; // 当前持仓
      let totalPnL = 0; // 累计盈亏
      const processedTrades = new Set(); // 记录已处理的成交ID，避免重复处理

      // 处理每条记录
      for (const record of allRecords) {
        if (record.type === 'trade') {
          const trade = record.data;
          const tradeId = trade.id || trade.tradeId;
          
          // 避免重复处理同一笔成交
          if (processedTrades.has(tradeId)) {
            continue;
          }
          processedTrades.add(tradeId);
          
          const tradeAmount = parseFloat(trade.amount || '0');
          const tradePrice = parseFloat(trade.price || '0');
          const tradeSide = trade.side;
          const tradeFee = parseFloat(trade.fee?.cost || '0');
          const tradeSymbol = trade.symbol || contract || '';
          const currency = tradeSymbol.split('/')[0] || '';

          // 更新持仓
          if (tradeSide === 'buy') {
            position += tradeAmount;
          } else {
            position -= tradeAmount;
          }

          // 为每笔成交创建结算记录
          settlementRecords.push({
            id: `trade_${tradeId}`,
            symbol: tradeSymbol,
            contract: trade.contract || contract || '',
            type: 'trade',
            amount: tradeAmount.toString(),
            currency: currency,
            fee: tradeFee.toString(),
            pnl: (-tradeFee).toString(), // 手续费是成本，所以盈亏为负
            timestamp: record.timestamp.toString(),
            datetime: new Date(record.timestamp).toISOString(),
            info: {
              ...trade,
              orderId: trade.order,
              tradeId: tradeId,
              side: tradeSide,
              price: tradePrice,
              amount: tradeAmount
            }
          });
        } else if (record.type === 'funding') {
          const funding = record.data;
          const fundingRate = parseFloat(funding.fundingRate || '0');
          const notional = parseFloat(funding.notional || '0');
          const fundingFee = fundingRate * notional;

          totalPnL += fundingFee;

          settlementRecords.push({
            id: `funding_${funding.timestamp || record.timestamp}`,
            symbol: funding.symbol || contract || '',
            contract: funding.contract || contract || '',
            type: 'funding',
            amount: '0',
            currency: funding.symbol?.split('/')[0] || '',
            fee: '0',
            pnl: fundingFee.toString(),
            timestamp: record.timestamp.toString(),
            datetime: new Date(record.timestamp).toISOString(),
            info: funding
          });
        }
      }

      // 按时间戳倒序排列，最新的在前面
      settlementRecords.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

      // 限制返回的记录数量
      return settlementRecords.slice(0, limit);
    } catch (error) {
      logger.error(`通过历史订单记录计算历史结算记录失败:`, error);
      throw error;
    }
  }

  /**
   * 获取资金费率历史
   * Get funding rate history
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @returns 资金费率历史记录列表 Funding rate history record list
   */
  async getFundingRateHistory(
    contract?: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      // 如果已经是OKX格式（包含-和SWAP），直接使用
      // 否则从Gate.io格式转换
      let okxSymbol: string | undefined;
      if (contract) {
        if (contract.includes("-") && contract.includes("SWAP")) {
          okxSymbol = contract;
        } else {
          okxSymbol = this.gateToOkxSymbol(contract);
        }
      }

      // 构建查询参数
      const params: any = {
        limit,
      };

      // 获取资金费率历史
      const fundingRateHistory = await this.client.fetchFundingRateHistory(
        okxSymbol,
        undefined,
        undefined,
        params
      );

      // 转换为标准格式
      const formattedHistory = fundingRateHistory.map((item: any) => {
        return {
          timestamp: item.timestamp?.toString() || "",
          datetime: new Date(parseInt(item.timestamp)).toISOString(),
          fundingRate: item.fundingRate?.toString() || "0",
          notional: item.notional?.toString() || "0",
          symbol: item.symbol || contract || "",
          contract: item.symbol?.replace("/", "_")?.replace(":", "_") || contract || "",
          info: item,
        };
      });

      return formattedHistory;
    } catch (error) {
      logger.error(`获取资金费率历史失败:`, error);
      // 如果获取失败，返回空数组
      return [];
    }
  }

  /**
   * 映射订单状态
   * Map order status
   * @param status CCXT订单状态 CCXT order status
   * @returns 标准订单状态 Standard order status
   */
  private mapOrderStatus(status: string | undefined): string {
    switch (status?.toLowerCase()) {
      case "open":
        return "open";
      case "closed":
        return "filled";
      case "canceled":
        return "cancelled";
      case "cancelled":
        return "cancelled";
      case "expired":
        return "expired";
      case "rejected":
        return "rejected";
      default:
        return "open";
    }
  }
}

/**
 * 创建OKX客户端实例
 * Create OKX client instance
 * @param config 交易所配置 Exchange configuration
 * @returns OKX客户端实例 OKX client instance
 */
export function createOkxClient(config?: ExchangeConfig): OkxClient {
  // 如果没有提供配置，使用默认配置
  if (!config) {
    config = {
      apiKey: process.env.OKX_API_KEY || "",
      apiSecret: process.env.OKX_API_SECRET || "",
      passphrase: process.env.OKX_PASSPHRASE || "",
      sandbox: process.env.OKX_USE_TESTNET === "true",
    };
  }

  return new OkxClient(config);
}

// 为了保持向后兼容性，保留原有的构造函数
export function createOkxClientLegacy(
  apiKey: string,
  apiSecret: string,
  passphrase: string
): OkxClient {
  const config: ExchangeConfig = {
    apiKey,
    apiSecret,
    passphrase,
    sandbox: process.env.OKX_USE_TESTNET === "true",
  };

  return new OkxClient(config);
}

export default OkxClient;
