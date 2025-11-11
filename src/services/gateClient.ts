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
 * GATE.IO API 客户端封装
 * 实现ExchangeClient接口
 */
// @ts-ignore - gate-api 的类型定义可能不完整
import * as GateApi from "gate-api";
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
  BaseContract
} from "../types/exchange";

const logger = createLogger({
  name: "gate-client",
  level: "info",
});

/**
 * Gate.io交易所客户端实现类
 * Gate.io Exchange Client Implementation Class
 */
export class GateClient implements ExchangeClient {
  private readonly client: any;
  private readonly futuresApi: any;
  private readonly spotApi: any;
  private readonly settle = "usdt"; // 使用 USDT 结算

  /**
   * 构造函数
   * Constructor
   * @param config 交易所配置 Exchange configuration
   */
  constructor(config: ExchangeConfig) {
    // @ts-ignore
    this.client = new GateApi.ApiClient();
    
    // 根据配置决定使用测试网还是正式网
    if (config.sandbox) {
      this.client.basePath = "https://api-testnet.gateapi.io/api/v4";
      logger.info("使用 GATE 测试网");
    } else {
      // 正式网地址（默认）
      this.client.basePath = "https://api.gateio.ws/api/v4";
      logger.info("使用 GATE 正式网");
    }
    
    // 设置API密钥和密钥
    this.client.setApiKeySecret(config.apiKey, config.apiSecret);

    // @ts-ignore
    this.futuresApi = new GateApi.FuturesApi(this.client);
    // @ts-ignore
    this.spotApi = new GateApi.SpotApi(this.client);

    logger.info("GATE API 客户端初始化完成");
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
        const result = await this.futuresApi.listFuturesAccounts(this.settle);
        return result.body;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取账户余额失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
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
        // Gate.io API 调用 listPositions
        // 注意：不传第二个参数表示查询所有模式的持仓
        const result = await this.futuresApi.listPositions(this.settle);
        const allPositions = result.body;
        
        // 过滤：只保留允许的币种
        const allowedSymbols = RISK_PARAMS.TRADING_SYMBOLS;
        const filteredPositions = allPositions?.filter((p: any) => {
          // 从 contract（如 "BTC_USDT"）中提取币种名称（如 "BTC"）
          const symbol = p.contract?.split('_')[0];
          return symbol && allowedSymbols.includes(symbol);
        }) || [];
        
        return filteredPositions;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取持仓失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
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
  async getFuturesTicker(contract: string, retries: number = 3): Promise<BaseTicker> {
    let lastError: any;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await this.futuresApi.listFuturesTickers(this.settle, {
          contract,
        });
        return result.body[0];
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取 ${contract} 价格失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
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
    
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await this.futuresApi.listFuturesCandlesticks(
          this.settle,
          contract,
          {
            interval: interval as any,
            limit,
          }
        );
        return result.body;
      } catch (error) {
        lastError = error;
        if (i < retries) {
          logger.warn(`获取 ${contract} K线数据失败，重试 ${i + 1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
        }
      }
    }
    
    logger.error(`获取 ${contract} K线数据失败（${retries}次重试）:`, lastError);
    throw lastError;
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
    tif?: string;
    reduceOnly?: boolean;
    autoSize?: string;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<BaseOrder> {
    // 验证并调整数量（在 try 外部定义，以便在 catch 中使用）
    let adjustedSize = params.size;
    
    try {
      // 获取合约信息以验证数量
      const contractInfo = await this.getContractInfo(params.contract);
      
      const absSize = Math.abs(params.size);
      
      // Gate.io API 的单笔订单数量限制（根据错误信息）
      const API_MAX_SIZE = 10000000;
      
      // 检查最小数量限制（使用驼峰命名）
      if (contractInfo.orderSizeMin && absSize < contractInfo.orderSizeMin) {
        logger.warn(`订单数量 ${absSize} 小于最小限制 ${contractInfo.orderSizeMin}，调整为最小值`);
        adjustedSize = params.size > 0 ? contractInfo.orderSizeMin : -contractInfo.orderSizeMin;
      }
      
      // 检查最大数量限制（使用合约限制和 API 限制中的较小值）
      const maxSize = contractInfo.orderSizeMax 
        ? Math.min(contractInfo.orderSizeMax, API_MAX_SIZE)
        : API_MAX_SIZE;
        
      if (absSize > maxSize) {
        logger.warn(`订单数量 ${absSize} 超过最大限制 ${maxSize}，调整为最大值`);
        adjustedSize = params.size > 0 ? maxSize : -maxSize;
      }

      // 验证价格偏离（针对限价单）
      let adjustedPrice = params.price;
      if (params.price && params.price > 0) {
        // 获取当前标记价格
        const ticker = await this.getFuturesTicker(params.contract);
        const markPrice = Number.parseFloat(ticker.markPrice || ticker.last || "0");
        
        if (markPrice > 0) {
          const priceDeviation = Math.abs(params.price - markPrice) / markPrice;
          const maxDeviation = 0.015; // 1.5% 限制，留一些缓冲空间（API限制是2%）
          
          if (priceDeviation > maxDeviation) {
            // 调整价格到允许范围内（留0.5%缓冲）
            if (params.size > 0) {
              // 买入订单：价格不能太高
              adjustedPrice = markPrice * (1 + maxDeviation);
            } else {
              // 卖出订单：价格不能太低
              adjustedPrice = markPrice * (1 - maxDeviation);
            }
            logger.warn(
              `订单价格 ${params.price.toFixed(6)} 偏离标记价格 ${markPrice} 超过 ${maxDeviation * 100}%，调整为 ${adjustedPrice.toFixed(6)}`
            );
          }
        }
      }

      // 格式化价格，确保不超过精度限制
      if (adjustedPrice && contractInfo.precision) {
        const pricePrecision = contractInfo.precision || 8;
        const multiplier = Math.pow(10, pricePrecision);
        adjustedPrice = Math.round(adjustedPrice * multiplier) / multiplier;
      }

      // 格式化数量，确保不超过精度限制
      if (contractInfo.orderSizePrecision) {
        const sizePrecision = contractInfo.orderSizePrecision || 8;
        const multiplier = Math.pow(10, sizePrecision);
        adjustedSize = Math.round(adjustedSize * multiplier) / multiplier;
      }

      // 构建订单参数
      const orderParams: any = {
        contract: params.contract,
        size: adjustedSize,
        iceberg: params.autoSize || 0, // 0表示不使用冰山订单
        tif: params.tif || "gtc", // 默认GTC
      };

      // 设置价格和订单类型
      if (adjustedPrice && adjustedPrice > 0) {
        // 限价单
        orderParams.price = adjustedPrice;
      } else {
        // 市价单 - 需要明确指定订单类型
        orderParams.price = "0";
        orderParams.type = "market";
        orderParams.tif = "ioc"; // 市价单使用IOC订单类型
      }

      // 设置reduceOnly标志
      if (params.reduceOnly) {
        orderParams.reduce_only = true;
      }

      // 设置止盈止损
      if (params.stopLoss || params.takeProfit) {
        const stopPriceParams: any = {};
        
        if (params.stopLoss) {
          stopPriceParams.stop_loss_price = params.stopLoss.toString();
        }
        
        if (params.takeProfit) {
          stopPriceParams.take_profit_price = params.takeProfit.toString();
        }
        
        // 创建带止盈止损的订单 - 确保正确传递settle参数和FuturesOrder对象
        const futuresOrder = {
          ...orderParams,
          ...stopPriceParams,
        };
        
        const stopOrderResult = await this.futuresApi.createFuturesOrder(
          this.settle,
          futuresOrder
        );
        
        logger.info(`止盈止损订单已提交: ${JSON.stringify(stopOrderResult.body)}`);
        return stopOrderResult.body;
      }

      // 创建普通订单 - 确保正确传递settle参数和FuturesOrder对象
      const futuresOrder = {
        contract: orderParams.contract,
        size: orderParams.size,
        price: orderParams.price,
        type: orderParams.type,
        iceberg: orderParams.iceberg,
        tif: orderParams.tif,
        reduce_only: orderParams.reduce_only,
      };
      
      const orderResult = await this.futuresApi.createFuturesOrder(
        this.settle,
        futuresOrder
      );
      
      // 处理包含BigInt的响应对象
      const orderResultStr = JSON.stringify(orderResult.body, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      logger.info(`订单已提交: ${orderResultStr}`);
      return orderResult.body;
    } catch (error) {
      // 处理reduceOnly订单保证金不足的特殊情况
      if (
        error &&
        (error as any).label === "INSUFFICIENT_MARGIN" &&
        params.reduceOnly
      ) {
        logger.warn("reduceOnly订单保证金不足，尝试使用市价单立即平仓");
        
        try {
          // 使用市价单立即平仓 - 确保正确传递settle参数和FuturesOrder对象
          const marketFuturesOrder = {
            contract: params.contract,
            size: adjustedSize,
            price: "0", // 市价单
            type: "market", // 明确指定为市价单
            reduce_only: true,
            tif: "ioc", // 市价单使用IOC订单类型
          };
          
          const marketOrderResult = await this.futuresApi.createFuturesOrder(
            this.settle,
            marketFuturesOrder
          );
          
          // 处理包含BigInt的响应对象
          const marketOrderResultStr = JSON.stringify(marketOrderResult.body, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          );
          logger.info(`市价reduceOnly订单已提交: ${marketOrderResultStr}`);
          return marketOrderResult.body;
        } catch (marketError) {
          logger.error(`市价reduceOnly订单也失败:`, marketError);
          throw marketError;
        }
      }
      
      logger.error(`下单失败:`, error);
      throw error;
    }
  }

  /**
   * 获取订单信息
   * Get order information
   * @param orderId 订单ID Order ID
   * @returns 订单信息 Order information
   */
  async getOrder(orderId: string): Promise<BaseOrder> {
    try {
      const result = await this.futuresApi.getFuturesOrder(this.settle, orderId);
      return result.body;
    } catch (error) {
      logger.error(`获取订单 ${orderId} 信息失败:`, error);
      throw error;
    }
  }

  /**
   * 取消订单
   * Cancel order
   * @param orderId 订单ID Order ID
   * @returns 取消结果 Cancellation result
   */
  async cancelOrder(orderId: string): Promise<any> {
    try {
      const result = await this.futuresApi.cancelFuturesOrder(this.settle, orderId);
      return result.body;
    } catch (error) {
      logger.error(`取消订单 ${orderId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取未成交订单
   * Get open orders
   * @param contract 合约代码 Contract symbol
   * @returns 未成交订单列表 Open order list
   */
  async getOpenOrders(contract?: string): Promise<BaseOrder[]> {
    try {
      const params: any = {
        limit: 100,
      };
      
      if (contract) {
        params.contract = contract;
      }
      
      const result = await this.futuresApi.listFuturesOrders(this.settle, "open", params);
      
      return result.body || [];
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
      const result = await this.futuresApi.updatePositionLeverage(
        this.settle,
        contract,
        leverage.toString()
      );
      return result.body;
    } catch (error) {
      logger.error(`设置 ${contract} 杠杆为 ${leverage}x 失败:`, error);
      throw error;
    }
  }

  /**
   * 获取资金费率
   * Get funding rate
   * @param contract 合约代码 Contract symbol
   * @returns 资金费率信息 Funding rate information
   */
  async getFundingRate(contract: string): Promise<any> {
    try {
      const result = await this.futuresApi.listFuturesFundingRateHistory(
        this.settle,
        contract,
        {
          limit: 1, // 只获取最新的资金费率
        }
      );
      return result.body[0] || {};
    } catch (error) {
      logger.error(`获取 ${contract} 资金费率失败:`, error);
      throw error;
    }
  }

  /**
   * 获取合约信息
   * Get contract information
   * @param contract 合约代码 Contract symbol
   * @returns 合约信息 Contract information
   */
  async getContractInfo(contract: string): Promise<BaseContract> {
    try {
      const result = await this.futuresApi.listFuturesContracts(this.settle);
      const contracts = result.body || [];
      const contractInfo = contracts.find((c: any) => c.name === contract);
      
      if (!contractInfo) {
        throw new Error(`未找到合约 ${contract} 的信息`);
      }
      
      return contractInfo;
    } catch (error) {
      logger.error(`获取 ${contract} 合约信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取所有合约信息
   * Get all contract information
   * @returns 合约信息列表 Contract information list
   */
  async getAllContracts(): Promise<BaseContract[]> {
    try {
      const result = await this.futuresApi.listFuturesContracts(this.settle);
      return result.body || [];
    } catch (error) {
      logger.error(`获取所有合约信息失败:`, error);
      throw error;
    }
  }

  /**
   * 获取订单簿
   * Get order book
   * @param contract 合约代码 Contract symbol
   * @param limit 深度档位 Depth level
   * @returns 订单簿信息 Order book information
   */
  async getOrderBook(contract: string, limit: number = 20): Promise<any> {
    try {
      const result = await this.futuresApi.listFuturesOrderBook(
        this.settle,
        contract,
        {
          limit,
        }
      );
      return result.body;
    } catch (error) {
      logger.error(`获取 ${contract} 订单簿失败:`, error);
      throw error;
    }
  }

  /**
   * 获取历史成交记录
   * Get historical trades
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @returns 历史成交记录列表 Historical trade list
   */
  async getMyTrades(contract?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = {
        limit,
      };
      
      if (contract) {
        params.contract = contract;
      }
      
      const result = await this.futuresApi.getMyTrades(this.settle, params);
      return result.body || [];
    } catch (error) {
      logger.error(`获取历史成交记录失败:`, error);
      throw error;
    }
  }

  /**
   * 获取历史仓位记录
   * Get historical position records
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @param offset 偏移量 Offset
   * @returns 历史仓位记录列表 Historical position record list
   */
  async getPositionHistory(
    contract?: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<any[]> {
    try {
      const params: any = {
        limit,
        offset,
      };
      
      if (contract) {
        params.contract = contract;
      }
      
      const result = await this.futuresApi.listPositionClose(this.settle, params);
      return result.body || [];
    } catch (error) {
      logger.error(`获取历史仓位记录失败:`, error);
      throw error;
    }
  }

  /**
   * 获取历史结算记录
   * Get historical settlement records
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @param offset 偏移量 Offset
   * @returns 历史结算记录列表 Historical settlement record list
   */
  async getSettlementHistory(
    contract?: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<any[]> {
    try {
      // 使用listPositionClose方法获取历史结算记录
      const params: any = {
        limit,
        offset,
      };
      
      if (contract) {
        params.contract = contract;
      }
      
      const result = await this.futuresApi.listPositionClose(this.settle, params);
      return result.body || [];
    } catch (error) {
      logger.error(`获取历史结算记录失败:`, error);
      throw error;
    }
  }

  /**
   * 获取历史订单记录
   * Get historical order records
   * @param contract 合约代码 Contract symbol
   * @param limit 数据条数 Number of data points
   * @returns 历史订单记录列表 Historical order record list
   */
  async getOrderHistory(contract?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = {
        limit,
      };
      
      if (contract) {
        params.contract = contract;
      }
      
      const result = await this.futuresApi.listFuturesOrders(this.settle, "finished", params);
      return result.body || [];
    } catch (error) {
      logger.error(`获取历史订单记录失败:`, error);
      throw error;
    }
  }
}

/**
 * 创建Gate.io客户端实例
 * Create Gate.io client instance
 * @param config 交易所配置 Exchange configuration
 * @returns Gate.io客户端实例 Gate.io client instance
 */
export function createGateClient(config?: ExchangeConfig): GateClient {
  // 如果没有提供配置，使用默认配置
  if (!config) {
    config = {
      apiKey: process.env.GATE_API_KEY || "",
      apiSecret: process.env.GATE_API_SECRET || "",
      sandbox: process.env.GATE_USE_TESTNET === 'true'
    };
  }
  
  return new GateClient(config);
}

// 为了保持向后兼容性，保留原有的构造函数
export function createGateClientLegacy(apiKey: string, apiSecret: string): GateClient {
  const config: ExchangeConfig = {
    apiKey,
    apiSecret,
    sandbox: process.env.GATE_USE_TESTNET === 'true'
  };
  
  return new GateClient(config);
}

export default GateClient;
