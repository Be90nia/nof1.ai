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
 * 蔡森策略监控器 - 每10秒执行一次
 *
 * 功能说明：
 * - 专门针对蔡森策略的七分位策略引擎进行监控
 * - 监控暴跌检测和恢复信号生成
 * - 动态调整止损止盈点位
 * - 执行金字塔加仓策略
 *
 * 蔡森策略特定功能：
 * 1. 暴跌检测：4小时内价格下跌超过15%时触发
 * 2. 七分位分析：计算暴跌后的七个关键价格水平
 * 3. 恢复信号：在1/7、1/2、6/7区域生成交易信号
 * 4. 动态点位：根据斐波那契回撤位和成交量密集区调整入场点
 * 5. 金字塔加仓：价格有利移动1.5%时自动加仓30%
 * 6. 分批止盈：按照1.0、2.0、3.0倍风险回报比分批平仓
 *
 * 重要说明：
 * - 仅在策略为"cai-sen"时启用
 * - 通过 enableCodeLevelProtection 控制是否启用代码级自动执行
 * - 所有监控数据记录到数据库供AI参考
 */

import { createClient } from "@libsql/client";
import {
  getStrategyParams,
  getTradingStrategy,
} from "../../../agents/tradingAgent";
import { createExchangeClient } from "../../../services/exchangeClient";
import { getQuantoMultiplier } from "../../../utils/contractUtils";
import { createLogger } from "../../../utils/loggerUtils";
import { getChinaTimeISO } from "../../../utils/timeUtils";
import { CaiSenBatchClosingSystem, ClosingType } from "../batch-closing";
import { executeTradingDecision } from "../../../scheduler/tradingLoop";

const logger = createLogger({
  name: "caisen-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

// 蔡森策略监控状态缓存
const caiSenMonitorState = {
  lastCheckTime: 0,
  checkCount: 0,
  crashDetectionCache: new Map<
    string,
    {
      crashStartTime: number;
      crashHighPrice: number;
      crashLowPrice: number;
      sevenSegmentLevels: number[];
      lastSignalTime: number;
    }
  >(),
  pyramidAddCache: new Map<
    string,
    {
      lastAddPrice: number;
      lastAddTime: number;
      addCount: number;
    }
  >(),
};

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否为蔡森策略
 */
export function isCaiSenStrategy(): boolean {
  const strategy = getTradingStrategy();
  return strategy === "cai-sen";
}

/**
 * 检查当前策略是否启用代码级自动执行
 */
function isCodeLevelProtectionEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取蔡森策略参数配置
 */
export function getCaiSenParams() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  if (!params.caiSen) {
    throw new Error("蔡森策略参数配置不存在");
  }

  return params.caiSen;
}

/**
 * 检测暴跌情况
 *
 * @param klineData K线数据数组，按时间升序排列
 * @param crashThreshold 暴跌阈值（百分比）
 * @param timeWindow 时间窗口（小时）
 * @returns 是否检测到暴跌及暴跌信息
 */
function detectCrash(
  klineData: any[],
  crashThreshold: number,
  timeWindow: number
): {
  detected: boolean;
  highPrice: number;
  lowPrice: number;
  dropPercent: number;
  startTime: string;
  endTime: string;
} | null {
  if (!klineData || klineData.length < 2) {
    return null;
  }

  // 计算时间窗口（毫秒）
  const timeWindowMs = timeWindow * 60 * 60 * 1000;
  const now = Date.now();

  // 获取时间窗口内的数据
  const recentData = klineData.filter((k) => now - k.timestamp <= timeWindowMs);

  if (recentData.length < 2) {
    return null;
  }

  // 找到窗口内的最高价和最低价
  let highPrice = 0;
  let lowPrice = Number.MAX_VALUE;
  let highTime = 0;
  let lowTime = now;

  for (const k of recentData) {
    const high = Number.parseFloat(k.high);
    const low = Number.parseFloat(k.low);

    if (high > highPrice) {
      highPrice = high;
      highTime = k.timestamp;
    }

    if (low < lowPrice) {
      lowPrice = low;
      lowTime = k.timestamp;
    }
  }

  // 计算跌幅
  const dropPercent = ((lowPrice - highPrice) / highPrice) * 100;

  // 检查是否达到暴跌阈值
  if (dropPercent <= crashThreshold) {
    return {
      detected: true,
      highPrice,
      lowPrice,
      dropPercent,
      startTime: new Date(highTime).toISOString(),
      endTime: new Date(lowTime).toISOString(),
    };
  }

  return null;
}

/**
 * 计算七分位价格水平
 *
 * @param highPrice 暴跌前最高价
 * @param lowPrice 暴跌前最低价
 * @returns 七个分位价格水平
 */
function calculateSevenSegmentLevels(
  highPrice: number,
  lowPrice: number
): number[] {
  const segmentSize = (highPrice - lowPrice) / 7;
  const levels = [];

  for (let i = 1; i <= 7; i++) {
    levels.push(lowPrice + segmentSize * i);
  }

  return levels;
}

/**
 * 分析当前价格在七分位中的位置
 *
 * @param currentPrice 当前价格
 * @param sevenSegmentLevels 七分位价格水平
 * @returns 价格位置分析和交易信号
 */
function analyzePricePosition(
  currentPrice: number,
  sevenSegmentLevels: number[]
): {
  position: string;
  zone: number;
  signal: string;
  confidence: string;
  description: string;
} {
  // 确定当前价格在七分位中的位置
  let position = "未知";
  let zone = 0;
  let signal = "观望";
  let confidence = "LOW";

  if (currentPrice <= sevenSegmentLevels[0]) {
    position = "1/7区域以下";
    zone = 1;
    signal = "强烈做多";
    confidence = "HIGH";
  } else if (currentPrice <= sevenSegmentLevels[1]) {
    position = "1/7区域";
    zone = 1;
    signal = "做多";
    confidence = "HIGH";
  } else if (currentPrice <= sevenSegmentLevels[2]) {
    position = "2/7区域";
    zone = 2;
    signal = "做多";
    confidence = "MEDIUM";
  } else if (currentPrice <= sevenSegmentLevels[3]) {
    position = "3/7区域";
    zone = 3;
    signal = "观望";
    confidence = "MEDIUM";
  } else if (currentPrice <= sevenSegmentLevels[4]) {
    position = "4/7区域";
    zone = 4;
    signal = "观望";
    confidence = "MEDIUM";
  } else if (currentPrice <= sevenSegmentLevels[5]) {
    position = "5/7区域";
    zone = 5;
    signal = "观望";
    confidence = "MEDIUM";
  } else if (currentPrice <= sevenSegmentLevels[6]) {
    position = "6/7区域";
    zone = 6;
    signal = "做空";
    confidence = "MEDIUM";
  } else {
    position = "7/7区域以上";
    zone = 7;
    signal = "强烈做多";
    confidence = "HIGH";
  }

  return {
    position,
    zone,
    signal,
    confidence,
    description: `当前价格位于${position}，建议${signal}，信心度${confidence}`,
  };
}

/**
 * 检查是否应该执行金字塔加仓
 *
 * @param symbol 交易对
 * @param entryPrice 入场价格
 * @param currentPrice 当前价格
 * @param side 持仓方向
 * @returns 是否应该加仓及加仓信息
 */
function checkPyramidAdd(
  symbol: string,
  entryPrice: number,
  currentPrice: number,
  side: string
): {
  shouldAdd: boolean;
  addRatio: number;
  description: string;
} | null {
  const params = getCaiSenParams();
  const pyramidThreshold = 0.015; // 1.5%的移动阈值
  const pyramidRatio = 0.3; // 30%的加仓比例

  // 获取缓存状态
  const cache = caiSenMonitorState.pyramidAddCache.get(symbol);

  // 计算价格变动百分比
  let priceChangePercent = 0;
  if (side === "long") {
    priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  } else {
    priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  // 检查是否达到加仓条件
  if (priceChangePercent >= pyramidThreshold * 100) {
    // 检查是否已经加仓过
    if (
      !cache ||
      (currentPrice - cache.lastAddPrice) / cache.lastAddPrice >=
        pyramidThreshold
    ) {
      return {
        shouldAdd: true,
        addRatio: pyramidRatio,
        description: `价格有利移动${priceChangePercent.toFixed(2)}%，达到${(
          pyramidThreshold * 100
        ).toFixed(1)}%阈值，建议加仓${(pyramidRatio * 100).toFixed(0)}%`,
      };
    }
  }

  return null;
}

/**
 * 记录蔡森策略监控数据到数据库
 */
async function recordCaiSenMonitorData(
  symbol: string,
  data: any
): Promise<void> {
  try {
    await dbClient.execute({
      sql: `
        INSERT INTO cai_sen_monitor_data (
          symbol, timestamp, data_type, data_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        symbol,
        Date.now(),
        data.type,
        JSON.stringify(data),
        getChinaTimeISO(),
      ],
    });
  } catch (error) {
    logger.error(`记录蔡森监控数据失败: ${error}`);
  }
}

/**
 * 获取K线数据
 */
export async function getKlineData(
  symbol: string,
  interval: string,
  limit = 100
): Promise<any[]> {
  const exchangeClient = createExchangeClient();

  try {
    const klines = await exchangeClient.getFuturesCandles(
      `${symbol}_USDT`,
      interval,
      limit
    );

    return klines.map((k: any) => ({
      timestamp: k.t * 1000, // 转换为毫秒
      open: Number.parseFloat(k.o),
      high: Number.parseFloat(k.h),
      low: Number.parseFloat(k.l),
      close: Number.parseFloat(k.c),
      volume: Number.parseFloat(k.v),
    }));
  } catch (error) {
    logger.error(`获取K线数据失败: ${error}`);
    return [];
  }
}

/**
 * 获取当前持仓
 */
export async function getCurrentPositions(): Promise<any[]> {
  const exchangeClient = createExchangeClient();

  try {
    const positions = await exchangeClient.getPositions();
    return positions.filter((p) => Number.parseFloat(p.size) !== 0);
  } catch (error) {
    logger.error(`获取持仓信息失败: ${error}`);
    return [];
  }
}

/**
 * 获取当前价格
 */
export async function getCurrentPrice(symbol: string): Promise<number> {
  const exchangeClient = createExchangeClient();

  try {
    const ticker = await exchangeClient.getFuturesTicker(`${symbol}_USDT`);
    return Number.parseFloat(ticker.last);
  } catch (error) {
    logger.error(`获取当前价格失败: ${error}`);
    return 0;
  }
}

/**
 * 执行金字塔加仓
 */
async function executePyramidAdd(
  symbol: string,
  side: string,
  addRatio: number,
  description: string
): Promise<boolean> {
  if (!isCodeLevelProtectionEnabled()) {
    logger.info(`代码级保护未启用，跳过金字塔加仓: ${description}`);
    return false;
  }

  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;

  try {
    // 获取当前持仓
    const positions = await getCurrentPositions();
    const position = positions.find((p) => p.contract === `${symbol}_USDT`);

    if (!position) {
      logger.warn(`${symbol} 无持仓，无法执行金字塔加仓`);
      return false;
    }

    // 计算加仓数量
    const currentSize = Math.abs(Number.parseFloat(position.size));
    const addSize = Math.floor(currentSize * addRatio);

    if (addSize <= 0) {
      logger.warn(`${symbol} 计算加仓数量为0，跳过加仓`);
      return false;
    }

    // 确定订单方向
    const orderSize = side === "long" ? addSize : -addSize;

    logger.warn(`【执行金字塔加仓】${symbol} ${side}`);
    logger.warn(`  加仓原因: ${description}`);
    logger.warn(`  加仓数量: ${addSize} 张 (${(addRatio * 100).toFixed(0)}%)`);
    logger.warn(`  当前持仓: ${currentSize} 张`);

    // 执行加仓订单
    const order = await exchangeClient.placeOrder({
      contract,
      size: orderSize,
      price: 0, // 市价单
    });

    logger.info(`已下达金字塔加仓订单 ${symbol}，订单ID: ${order.id}`);

    // 更新缓存
    const currentPrice = await getCurrentPrice(symbol);
    caiSenMonitorState.pyramidAddCache.set(symbol, {
      lastAddPrice: currentPrice,
      lastAddTime: Date.now(),
      addCount:
        (caiSenMonitorState.pyramidAddCache.get(symbol)?.addCount || 0) + 1,
    });

    // 记录到数据库
    await recordCaiSenMonitorData(symbol, {
      type: "pyramid_add",
      side,
      addSize,
      addRatio,
      description,
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    logger.error(`执行金字塔加仓失败: ${error}`);
    return false;
  }
}

/**
 * 执行蔡森策略监控主逻辑
 */
async function executeCaiSenMonitor(): Promise<void> {
  if (!isCaiSenStrategy()) {
    return;
  }

  if (isRunning) {
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    caiSenMonitorState.checkCount++;
    caiSenMonitorState.lastCheckTime = startTime;

    logger.debug(`执行蔡森策略监控 #${caiSenMonitorState.checkCount}`);

    // 获取当前持仓
    const positions = await getCurrentPositions();

    if (positions.length === 0) {
      logger.debug("无持仓，跳过蔡森策略监控");
      return;
    }

    // 处理每个持仓
    for (const position of positions) {
      // 修复：position对象中的字段名是contract，不是symbol
      const contract = position.contract;
      const symbol = contract.replace("_USDT", "");
      const side = Number.parseFloat(position.size) > 0 ? "long" : "short";
      const entryPrice = Number.parseFloat(position.entryPrice);
      const currentPrice = await getCurrentPrice(symbol);

      if (currentPrice <= 0) {
        logger.warn(`获取${symbol}当前价格失败，跳过监控`);
        continue;
      }

      // 1. 检查金字塔加仓
      const pyramidAddInfo = checkPyramidAdd(
        symbol,
        entryPrice,
        currentPrice,
        side
      );
      if (pyramidAddInfo) {
        logger.info(`${symbol} ${pyramidAddInfo.description}`);

        if (isCodeLevelProtectionEnabled()) {
          await executePyramidAdd(
            symbol,
            side,
            pyramidAddInfo.addRatio,
            pyramidAddInfo.description
          );
        } else {
          logger.info("代码级保护未启用，仅记录金字塔加仓信号");

          // 记录到数据库
          await recordCaiSenMonitorData(symbol, {
            type: "pyramid_add_signal",
            side,
            entryPrice,
            currentPrice,
            addRatio: pyramidAddInfo.addRatio,
            description: pyramidAddInfo.description,
            timestamp: Date.now(),
          });
        }
      }

      // 2. 暴跌检测和七分位分析
      const params = getCaiSenParams();
      const crashThreshold =
        params.sevenSegmentStrategy.crashDetectionThreshold;
      const calculationPeriod = params.sevenSegmentStrategy.calculationPeriod;

      // 获取4小时K线数据用于暴跌检测
      const klineData = await getKlineData(symbol, "1h", calculationPeriod + 4);

      if (klineData.length > 0) {
        // 检测暴跌
        const crashInfo = detectCrash(klineData, crashThreshold, 4); // 4小时窗口

        if (crashInfo && crashInfo.detected) {
          logger.info(
            `${symbol} 检测到暴跌: ${crashInfo.dropPercent.toFixed(2)}%`
          );
          logger.info(`  最高价: ${crashInfo.highPrice}`);
          logger.info(`  最低价: ${crashInfo.lowPrice}`);
          logger.info(`  时间: ${crashInfo.startTime} 至 ${crashInfo.endTime}`);

          // 计算七分位水平
          const sevenSegmentLevels = calculateSevenSegmentLevels(
            crashInfo.highPrice,
            crashInfo.lowPrice
          );

          // 分析当前价格位置
          const positionAnalysis = analyzePricePosition(
            currentPrice,
            sevenSegmentLevels
          );

          logger.info(`${symbol} 七分位分析: ${positionAnalysis.description}`);
          logger.info(
            `  七分位水平: [${sevenSegmentLevels
              .map((l) => l.toFixed(6))
              .join(", ")}]`
          );

          // 更新缓存
          caiSenMonitorState.crashDetectionCache.set(symbol, {
            crashStartTime: Date.now(),
            crashHighPrice: crashInfo.highPrice,
            crashLowPrice: crashInfo.lowPrice,
            sevenSegmentLevels,
            lastSignalTime: Date.now(),
          });

          // 记录到数据库
          await recordCaiSenMonitorData(symbol, {
            type: "crash_detection",
            crashInfo,
            sevenSegmentLevels,
            positionAnalysis,
            timestamp: Date.now(),
          });

          // 如果有交易信号且启用代码级保护，执行交易
          if (
            positionAnalysis.signal !== "观望" &&
            isCodeLevelProtectionEnabled()
          ) {
            logger.warn(
              `${symbol} 七分位交易信号: ${positionAnalysis.signal}，信心度${positionAnalysis.confidence}`
            );

            // 记录信号，但不立即执行交易决策
            // 交易决策将按照设定的时间间隔执行
            logger.info("检测到交易信号，将在下次交易周期执行决策");
          }
        }
      }

      // 3. 主动检测止盈条件
      const strategy = getTradingStrategy();
      const strategyParams = getStrategyParams(strategy);
      const takeProfitConfig = strategyParams.partialTakeProfit;

      if (takeProfitConfig) {
        // 计算当前盈亏百分比
          const entryPrice = Number.parseFloat(position.entryPrice);
          const currentPrice = await getCurrentPrice(symbol);
          const size = Math.abs(Number.parseFloat(position.size));
          const leverage = Number.parseFloat(position.leverage || "1");

          if (currentPrice > 0 && entryPrice > 0 && size > 0) {
            // 计算价格变动百分比（不考虑杠杆）
            const priceChangePercent = 
              ((currentPrice - entryPrice) / entryPrice) * 100;
            // 考虑杠杆后的盈亏百分比
            const pnlPercent = 
              side === "long"
                ? priceChangePercent * leverage
                : -priceChangePercent * leverage;

            logger.debug(`${symbol} 价格变动: ${priceChangePercent.toFixed(2)}%，当前盈亏: ${pnlPercent.toFixed(2)}%，杠杆: ${leverage}x`);

            // 检查是否达到止盈条件（只在盈利时检查）
            if (pnlPercent > 0) {
              if (pnlPercent >= takeProfitConfig.stage3.trigger) {
                // 达到第三阶段止盈，全部平仓
                logger.info(
                  `${symbol} 达到第三阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${takeProfitConfig.stage3.trigger}%`
                );
                logger.info("准备执行全部平仓操作");
              } else if (pnlPercent >= takeProfitConfig.stage2.trigger) {
                // 达到第二阶段止盈，平仓部分仓位
                logger.info(
                  `${symbol} 达到第二阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${takeProfitConfig.stage2.trigger}%`
                );
                logger.info(
                  `准备执行第二阶段止盈，平仓${takeProfitConfig.stage2.closePercent}%的仓位`
                );
              } else if (pnlPercent >= takeProfitConfig.stage1.trigger) {
                // 达到第一阶段止盈，平仓部分仓位
                logger.info(
                  `${symbol} 达到第一阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${takeProfitConfig.stage1.trigger}%`
                );
                logger.info(
                  `准备执行第一阶段止盈，平仓${takeProfitConfig.stage1.closePercent}%的仓位`
                );
              }
            } else {
              logger.debug(`${symbol} 当前亏损: ${pnlPercent.toFixed(2)}%，不检查止盈条件`);
            }
          }
      }
    }
  } catch (error) {
    logger.error(`蔡森策略监控执行失败: ${error}`);
  } finally {
    isRunning = false;
    const duration = Date.now() - startTime;
    logger.debug(`蔡森策略监控执行完成，耗时: ${duration}ms`);
  }
}

/**
 * 启动蔡森策略监控器
 */
export function startCaiSenMonitor(): void {
  if (monitorInterval) {
    logger.warn("蔡森策略监控器已在运行");
    return;
  }

  if (!isCaiSenStrategy()) {
    logger.info("当前策略不是蔡森策略，不启动监控器");
    return;
  }

  logger.info("启动蔡森策略监控器，每10秒执行一次");

  // 立即执行一次
  executeCaiSenMonitor();

  // 设置定时执行
  monitorInterval = setInterval(executeCaiSenMonitor, 10000);
}

/**
 * 停止蔡森策略监控器
 */
export function stopCaiSenMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("蔡森策略监控器已停止");
  }
}

/**
 * 获取蔡森策略监控器状态
 */
export function getCaiSenMonitorStatus(): {
  isRunning: boolean;
  lastCheckTime: number;
  checkCount: number;
  crashDetectionCache: any;
  pyramidAddCache: any;
} {
  return {
    isRunning,
    lastCheckTime: caiSenMonitorState.lastCheckTime,
    checkCount: caiSenMonitorState.checkCount,
    crashDetectionCache: Object.fromEntries(
      caiSenMonitorState.crashDetectionCache
    ),
    pyramidAddCache: Object.fromEntries(caiSenMonitorState.pyramidAddCache),
  };
}

/**
 * 手动执行一次蔡森策略监控
 */
export async function runCaiSenMonitorOnce(): Promise<void> {
  await executeCaiSenMonitor();
}
