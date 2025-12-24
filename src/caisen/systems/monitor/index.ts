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
import { executeTradingDecision } from "../../../scheduler/tradingLoop";
import { createExchangeClient } from "../../../services/exchangeClient";
import { getQuantoMultiplier } from "../../../utils/contractUtils";
import { createLogger } from "../../../utils/loggerUtils";
import { getChinaTimeISO } from "../../../utils/timeUtils";
import {
  type BatchConfig,
  CaiSenBatchClosingSystem,
  ClosingType,
} from "../batch-closing";
import {
  type AddPositionHistoryRecord,
  addToPositionHistory,
} from "../../../utils/positionUtils";
import {
  getCaiSenTrendDecision,
  TrendDirection,
} from "../../decision/trendDecision";

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

// 分批平仓系统实例
let batchClosingSystem: CaiSenBatchClosingSystem | null = null;

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 执行锁管理 - 数据库持久化版本
 * 用于防止关键操作重复执行
 */

/**
 * 检查执行锁状态
 */
async function checkExecutionLock(lockKey: string): Promise<{
  isExecuting: boolean;
  lastExecutionTime: number;
} | null> {
  try {
    const result = await dbClient.execute({
      sql: "SELECT is_executing, last_execution_time FROM execution_locks WHERE lock_key = ?",
      args: [lockKey],
    });

    if (result.rows.length > 0) {
      return {
        isExecuting: result.rows[0].is_executing === 1,
        lastExecutionTime: result.rows[0].last_execution_time as number,
      };
    }
    return null;
  } catch (error) {
    logger.error(`检查执行锁失败: ${(error as Error).message}`);
    return null;
  }
}

/**
 * 设置执行锁
 */
async function setExecutionLock(
  lockKey: string,
  isExecuting: boolean
): Promise<boolean> {
  try {
    const currentTime = Date.now();
    const nowISO = getChinaTimeISO();

    const result = await dbClient.execute({
      sql: `INSERT OR REPLACE INTO execution_locks 
			      (lock_key, is_executing, last_execution_time, created_at, updated_at)
			      VALUES (?, ?, ?, 
			      COALESCE((SELECT created_at FROM execution_locks WHERE lock_key = ?), ?), ?)`,
      args: [
        lockKey,
        isExecuting ? 1 : 0,
        currentTime,
        lockKey,
        nowISO,
        nowISO,
      ],
    });

    return result.rowsAffected > 0;
  } catch (error) {
    logger.error(`设置执行锁失败: ${(error as Error).message}`);
    return false;
  }
}

/**
 * 清除执行锁
 */
async function clearExecutionLock(lockKey: string): Promise<boolean> {
  try {
    const result = await dbClient.execute({
      sql: "DELETE FROM execution_locks WHERE lock_key = ?",
      args: [lockKey],
    });

    return result.rowsAffected > 0;
  } catch (error) {
    logger.error(`清除执行锁失败: ${(error as Error).message}`);
    return false;
  }
}

/**
 * 清理过期的执行锁（超过5分钟未更新的锁）
 */
async function cleanupExpiredLocks(): Promise<void> {
  try {
    const expireTime = Date.now() - 5 * 60 * 1000; // 5分钟前

    const result = await dbClient.execute({
      sql: "DELETE FROM execution_locks WHERE is_executing = 1 AND last_execution_time < ?",
      args: [expireTime],
    });

    if (result.rowsAffected > 0) {
      logger.info(`清理了 ${result.rowsAffected} 个过期的执行锁`);
    }
  } catch (error) {
    logger.error(`清理过期执行锁失败: ${(error as Error).message}`);
  }
}

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
 * 检查蔡森策略参数完整性
 * 确保每个交易币种都有完整的参数配置
 */
export async function checkCaiSenParamsIntegrity() {
  logger.info("🔍 开始检查蔡森策略参数完整性...");

  try {
    const strategy = getTradingStrategy();
    if (strategy !== "cai-sen") {
      return;
    }

    // 导入需要的函数和配置
    const {
      getAgentStrategyParams,
      setPartialTakeProfitParams,
      setPeakDrawdownParams,
      setDynamicStopLossParams,
    } = await import("../../../tools/strategyParams");
    const { RISK_PARAMS } = await import("../../../config/riskParams");

    // 获取所有交易币种
    const tradingSymbols = RISK_PARAMS.TRADING_SYMBOLS;
    logger.info(`📋 交易币种列表: ${JSON.stringify(tradingSymbols)}`);

    // 获取所有币种的策略参数
    const agentParams = await getAgentStrategyParams(strategy);
    logger.debug(`📊 获取到的参数: ${JSON.stringify(agentParams)}`);

    // 检查每个币种的参数完整性
    for (const symbol of tradingSymbols) {
      logger.info(`🔧 检查币种 ${symbol} 的参数完整性...`);

      // 获取该币种的参数
      const symbolParams = agentParams[symbol] || agentParams.global || {};

      // 检查是否缺少必要参数
      const missingParams = [];

      if (!symbolParams.partialTakeProfit) {
        missingParams.push("partialTakeProfit");
      }

      if (!symbolParams.peakDrawdownProtectionConfig) {
        missingParams.push("peakDrawdownProtectionConfig");
      }

      if (!symbolParams.dynamicStopLoss) {
        missingParams.push("dynamicStopLoss");
      }

      if (missingParams.length > 0) {
        logger.warn(
          `⚠️ 币种 ${symbol} 缺少以下参数: ${missingParams.join(
            ", "
          )}，系统将自动为其设置默认参数`
        );

        // 自动为该币种设置默认参数
        try {
          logger.info(`📤 正在为 ${symbol} 设置默认分批止盈参数...`);
          await setPartialTakeProfitParams(
            strategy,
            symbol,
            { trigger: 5, closePercent: 30 },
            { trigger: 10, closePercent: 40 },
            { trigger: 15, closePercent: 30 }
          );

          logger.info(`📤 正在为 ${symbol} 设置默认峰值回撤参数...`);
          await setPeakDrawdownParams(
            strategy,
            symbol,
            { drawdownThreshold: 1.0, closePercent: 30 },
            { drawdownThreshold: 2.0, closePercent: 50 },
            { drawdownThreshold: 3.0, closePercent: 100 },
            5
          );

          logger.info(`📤 正在为 ${symbol} 设置默认动态止损参数...`);
          await setDynamicStopLossParams(strategy, symbol, 3.0, 30);

          logger.info(`✅ 已成功为 ${symbol} 设置所有默认参数`);
        } catch (error) {
          logger.error(`❌ 为 ${symbol} 设置默认参数失败:`, error);
        }
      } else {
        logger.info(`✅ 币种 ${symbol} 的参数配置完整`);
      }
    }

    logger.info("✅ 蔡森策略参数完整性检查完成");
  } catch (error) {
    logger.error(`❌ 检查蔡森策略参数完整性失败:`, error);
  }
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
 * @param entryPrice 入场价格（加权平均成本）
 * @param currentPrice 当前价格
 * @param side 持仓方向
 * @param dbPosition 数据库中的持仓信息（用于检查加仓历史）
 * @returns 是否应该加仓及加仓信息
 */
async function checkPyramidAdd(
  symbol: string,
  entryPrice: number,
  currentPrice: number,
  side: string,
  dbPosition?: any
): Promise<{
  shouldAdd: boolean;
  addRatio: number;
  description: string;
} | null> {
  const params = getCaiSenParams();
  const pyramidThreshold = 0.015; // 1.5%的移动阈值
  const pyramidRatio = 0.3; // 30%的加仓比例
  const maxAdditions = 3; // 最大加仓次数
  const minIntervalMinutes = 30; // 最小加仓间隔（分钟）

  // 🔧 修复：优先使用数据库中的加仓记录，而不是内存缓存
  // 这样程序重启后也能正确判断是否应该加仓
  if (dbPosition) {
    const addPositionCount = dbPosition.add_position_count || 0;
    const lastAddPositionTime = dbPosition.last_add_position_time;

    // 检查是否已达到最大加仓次数
    if (addPositionCount >= maxAdditions) {
      logger.debug(
        `${symbol} 已达到最大加仓次数 ${addPositionCount}/${maxAdditions}，跳过加仓检查`
      );
      return null;
    }

    // 检查距离上次加仓的时间间隔
    if (lastAddPositionTime) {
      const lastAddTime = new Date(lastAddPositionTime).getTime();
      const now = Date.now();
      const minutesSinceLastAdd = (now - lastAddTime) / (1000 * 60);

      if (minutesSinceLastAdd < minIntervalMinutes) {
        logger.debug(
          `${symbol} 距离上次加仓仅 ${minutesSinceLastAdd.toFixed(
            1
          )} 分钟，未达到最小间隔 ${minIntervalMinutes} 分钟，跳过加仓检查`
        );
        return null;
      }
    }
  }

  // 计算价格变动百分比（基于加权平均成本）
  let priceChangePercent = 0;
  if (side === "long") {
    priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  } else {
    priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  // 检查是否达到加仓条件
  // 🔧 修复：只有当价格有利移动达到阈值时才加仓
  // 注意：这里的 entryPrice 已经是加权平均成本，所以计算是正确的
  if (priceChangePercent >= pyramidThreshold * 100) {
    return {
      shouldAdd: true,
      addRatio: pyramidRatio,
      description: `价格有利移动${priceChangePercent.toFixed(2)}%，达到${(
        pyramidThreshold * 100
      ).toFixed(1)}%阈值，建议加仓${(pyramidRatio * 100).toFixed(0)}%`,
    };
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

    // 🔧 修复：从数据库获取完整的持仓信息
    const dbPositionResult = await dbClient.execute({
      sql: "SELECT initial_quantity, quantity, average_entry_price, entry_price, add_position_history FROM positions WHERE symbol = ? LIMIT 1",
      args: [symbol],
    });

    if (dbPositionResult.rows.length === 0) {
      logger.warn(`${symbol} 数据库中无持仓记录，无法执行金字塔加仓`);
      return false;
    }

    const dbPosition = dbPositionResult.rows[0] as unknown as {
      initial_quantity: number | null;
      quantity: number;
      average_entry_price: number | null;
      entry_price: number;
      add_position_history: string | null;
    };

    // 使用初始开仓数量，如果没有则使用当前数量（兼容旧数据）
    const baseSize = dbPosition.initial_quantity || dbPosition.quantity;
    const currentSize = Math.abs(Number.parseFloat(position.size));

    // 计算加仓数量（基于初始开仓数量）
    const addSize = Math.floor(baseSize * addRatio);

    if (addSize <= 0) {
      logger.warn(`${symbol} 计算加仓数量为0，跳过加仓`);
      return false;
    }

    // 获取当前价格
    const currentPrice = await getCurrentPrice(symbol);
    const oldAveragePrice =
      dbPosition.average_entry_price || dbPosition.entry_price;

    // 确定订单方向
    const orderSize = side === "long" ? addSize : -addSize;

    logger.warn(`【执行金字塔加仓】${symbol} ${side}`);
    logger.warn(`  加仓原因: ${description}`);
    logger.warn(`  初始持仓: ${baseSize} 张`);
    logger.warn(`  当前持仓: ${currentSize} 张`);
    logger.warn(`  加仓数量: ${addSize} 张 (${(addRatio * 100).toFixed(0)}%)`);
    logger.warn(`  加仓后预计: ${currentSize + addSize} 张`);

    // 执行加仓订单
    const order = await exchangeClient.placeOrder({
      contract,
      size: orderSize,
      price: 0, // 市价单
    });

    logger.info(`已下达金字塔加仓订单 ${symbol}，订单ID: ${order.id}`);

    // 等待订单成交并获取实际成交价格
    let actualFillPrice = currentPrice;
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const orderInfo = await exchangeClient.getOrder(contract, order.id);
      if (orderInfo && orderInfo.avgPrice) {
        actualFillPrice = Number.parseFloat(orderInfo.avgPrice);
        logger.info(`金字塔加仓订单成交价格: ${actualFillPrice.toFixed(2)}`);
      }
    } catch (error) {
      logger.warn(
        `获取金字塔加仓订单成交价格失败，使用当前价格: ${currentPrice.toFixed(
          2
        )}`
      );
    }

    // 计算新的加权平均成本
    const totalQuantity = currentSize + addSize;
    const newAveragePrice =
      (oldAveragePrice * currentSize + actualFillPrice * addSize) /
      totalQuantity;
    const costReductionPercent =
      ((oldAveragePrice - newAveragePrice) / oldAveragePrice) * 100;

    // 计算加仓金额（USDT）
    const quantoMultiplier = await getQuantoMultiplier(symbol);
    const addAmountUsdt = addSize * actualFillPrice * quantoMultiplier;

    // 计算加仓时的盈亏百分比
    const priceChangePercent =
      ((actualFillPrice - oldAveragePrice) / oldAveragePrice) * 100;
    const leverage = Number.parseFloat(position.leverage);
    const pnlPercent =
      side === "long"
        ? priceChangePercent * leverage
        : -priceChangePercent * leverage;

    // 创建详细的加仓历史记录
    const historyRecord: AddPositionHistoryRecord = {
      timestamp: getChinaTimeISO(),
      add_quantity: addSize,
      add_price: actualFillPrice,
      add_amount_usdt: addAmountUsdt,
      strategy: "pyramid",
      reason: description,
      new_average_price: newAveragePrice,
      old_average_price: oldAveragePrice,
      cost_reduction_percent: costReductionPercent,
    };

    const newHistory = addToPositionHistory(
      dbPosition.add_position_history,
      historyRecord
    );

    // 🔧 修复：更新数据库中的加仓计数、时间、平均成本和历史记录
    try {
      await dbClient.execute({
        sql: `UPDATE positions 
              SET add_position_count = COALESCE(add_position_count, 0) + 1,
                  last_add_position_time = ?,
                  average_entry_price = ?,
                  add_position_history = ?
              WHERE symbol = ?`,
        args: [getChinaTimeISO(), newAveragePrice, newHistory, symbol],
      });

      logger.info({
        action: "update_add_position_record",
        symbol,
        addSize,
        addPrice: actualFillPrice,
        oldAveragePrice,
        newAveragePrice,
        costReductionPercent: costReductionPercent.toFixed(2),
        addAmountUsdt: addAmountUsdt.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2),
        message: "已更新数据库中的加仓记录（计数、时间、平均成本、历史记录）",
      });
    } catch (error) {
      logger.error({
        action: "update_add_position_record_error",
        symbol,
        error: (error as Error).message,
        message: "更新加仓记录失败，但不影响加仓操作",
      });
    }

    // 更新内存缓存（用于同一运行周期内的快速检查）
    caiSenMonitorState.pyramidAddCache.set(symbol, {
      lastAddPrice: currentPrice,
      lastAddTime: Date.now(),
      addCount:
        (caiSenMonitorState.pyramidAddCache.get(symbol)?.addCount || 0) + 1,
    });

    // 记录到监控数据表（包含更详细的信息）
    await recordCaiSenMonitorData(symbol, {
      type: "pyramid_add",
      side,
      addSize,
      addRatio,
      addPrice: actualFillPrice,
      addAmountUsdt,
      oldAveragePrice,
      newAveragePrice,
      costReductionPercent,
      pnlPercent,
      description,
      timestamp: Date.now(),
    });

    logger.info(
      `✅ 金字塔加仓成功: ${symbol} 新平均成本=${newAveragePrice.toFixed(
        2
      )}, 总持仓=${totalQuantity}张, 成本降低=${costReductionPercent.toFixed(
        2
      )}%`
    );

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

    // 从数据库获取持仓信息（获取加权平均成本、加仓历史和初始持仓量）
    const dbResult = await dbClient.execute(
      "SELECT symbol, average_entry_price, entry_price, add_position_count, last_add_position_time, initial_quantity, quantity FROM positions"
    );
    const dbInfoMap = new Map(
      dbResult.rows.map((row: any) => [
        row.symbol,
        {
          averageEntryPrice: row.average_entry_price || row.entry_price || 0,
          add_position_count: row.add_position_count || 0,
          last_add_position_time: row.last_add_position_time,
          initial_quantity: row.initial_quantity || row.quantity || 0,
        },
      ])
    );

    // 处理每个持仓
    for (const position of positions) {
      // 修复：position对象中的字段名是contract，不是symbol
      const contract = position.contract;
      const symbol = contract.replace("_USDT", "");
      const side = Number.parseFloat(position.size) > 0 ? "long" : "short";

      // 🔧 关键：优先使用数据库中的加权平均成本（考虑加仓后的平均成本）
      const dbInfo = dbInfoMap.get(symbol);
      const exchangeEntryPrice = Number.parseFloat(position.entryPrice);
      const entryPrice = dbInfo?.averageEntryPrice || exchangeEntryPrice;
      const addPositionCount = dbInfo?.add_position_count || 0;

      // 记录是否使用了加权平均成本
      if (
        dbInfo?.averageEntryPrice &&
        dbInfo.averageEntryPrice !== exchangeEntryPrice
      ) {
        logger.debug(
          `${symbol} 使用加权平均成本: ${entryPrice.toFixed(
            2
          )} (交易所价格: ${exchangeEntryPrice.toFixed(
            2
          )}, 已加仓${addPositionCount}次)`
        );
      }

      const currentPrice = await getCurrentPrice(symbol);

      if (currentPrice <= 0) {
        logger.warn(`获取${symbol}当前价格失败，跳过监控`);
        continue;
      }

      // 1. 检查金字塔加仓（传入数据库持仓信息）
      const pyramidAddInfo = await checkPyramidAdd(
        symbol,
        entryPrice,
        currentPrice,
        side,
        dbInfo // 传入数据库持仓信息，用于检查加仓历史
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

      // 3. 主动检测止盈条件和峰值回落
      // 🔧 关键修复：从数据库读取该持仓的退出策略配置，而不是全局配置
      const dbPositionResult = await dbClient.execute({
        sql: "SELECT exit_strategy FROM positions WHERE symbol = ?",
        args: [symbol],
      });

      let exitStrategy: any = null;
      if (dbPositionResult.rows.length > 0) {
        const exitStrategyStr = dbPositionResult.rows[0]
          .exit_strategy as string;
        if (exitStrategyStr) {
          try {
            exitStrategy = JSON.parse(exitStrategyStr);
            logger.debug(
              `${symbol} 从数据库读取退出策略配置: ${JSON.stringify(
                exitStrategy
              )}`
            );
          } catch (e) {
            logger.warn(`${symbol} 解析退出策略配置失败: ${e}`);
          }
        }
      }

      // 如果数据库中没有配置，回退到全局配置
      if (!exitStrategy) {
        const strategy = getTradingStrategy();
        const strategyParams = getStrategyParams(strategy);
        exitStrategy = strategyParams.positionExitStrategy;
        logger.debug(`${symbol} 数据库中无退出策略配置，使用全局配置`);
      }

      // 检查是否启用了止盈策略
      const isTakeProfitEnabled =
        exitStrategy?.enabled &&
        (exitStrategy.strategyType === "partialTakeProfit" ||
          exitStrategy.strategyType === "combination") &&
        exitStrategy.partialTakeProfit;

      const takeProfitConfig = isTakeProfitEnabled
        ? exitStrategy.partialTakeProfit
        : null;

      // 检查是否启用了峰值回落策略
      const isPeakDrawdownEnabled =
        exitStrategy?.enabled &&
        (exitStrategy.strategyType === "peakDrawdown" ||
          exitStrategy.strategyType === "combination") &&
        exitStrategy.peakDrawdown;

      const peakDrawdownConfig = isPeakDrawdownEnabled
        ? exitStrategy.peakDrawdown
        : null;

      if (takeProfitConfig || peakDrawdownConfig) {
        // 计算当前盈亏百分比（使用上面已经获取的entryPrice，它已经是加权平均成本）
        // entryPrice 已经在上面定义过了，直接使用
        const currentPriceForTP = await getCurrentPrice(symbol);
        const size = Math.abs(Number.parseFloat(position.size));
        const leverage = Number.parseFloat(position.leverage || "1");

        if (currentPriceForTP > 0 && entryPrice > 0 && size > 0) {
          // 计算价格变动百分比（不考虑杠杆）
          const priceChangePercent =
            ((currentPriceForTP - entryPrice) / entryPrice) * 100;
          // 考虑杠杆后的盈亏百分比
          const pnlPercent =
            side === "long"
              ? priceChangePercent * leverage
              : -priceChangePercent * leverage;

          logger.debug(
            `${symbol} 价格变动: ${priceChangePercent.toFixed(
              2
            )}%，当前盈亏: ${pnlPercent.toFixed(2)}%，杠杆: ${leverage}x`
          );

          // 🔧 关键修复：更新峰值盈利（peak_pnl_percent）
          // 如果当前盈利超过历史峰值，则更新峰值记录
          try {
            const peakPnlResult = await dbClient.execute(
              "SELECT peak_pnl_percent FROM positions WHERE symbol = ?",
              [symbol]
            );

            if (peakPnlResult.rows.length > 0) {
              const currentPeakPnlPercent = Number.parseFloat(
                (peakPnlResult.rows[0].peak_pnl_percent as string) || "0"
              );

              if (pnlPercent > currentPeakPnlPercent) {
                await dbClient.execute({
                  sql: "UPDATE positions SET peak_pnl_percent = ? WHERE symbol = ?",
                  args: [pnlPercent, symbol],
                });
                logger.info(
                  `${symbol} 更新峰值盈利: ${currentPeakPnlPercent.toFixed(
                    2
                  )}% -> ${pnlPercent.toFixed(2)}%`
                );
              }
            }
          } catch (error) {
            logger.error(
              `${symbol} 更新峰值盈利失败: ${(error as Error).message}`
            );
          }

          // 🔧 智能峰值回落检测：结合指标数据和分段管理
          // 🎯 关键修复：只要曾经盈利过（peakPnlPercent > 0），就应该检查峰值回落
          // 即使当前已经转为亏损，也要保护之前的利润，避免利润回吐变成亏损
          if (peakDrawdownConfig && batchClosingSystem) {
            // 从数据库获取峰值盈利
            const peakPnlResult = await dbClient.execute(
              "SELECT peak_pnl_percent FROM positions WHERE symbol = ?",
              [symbol]
            );

            if (peakPnlResult.rows.length > 0) {
              const peakPnlPercent = Number.parseFloat(
                (peakPnlResult.rows[0].peak_pnl_percent as string) || "0"
              );

              // 🎯 只有曾经盈利过，才需要峰值回落保护
              if (peakPnlPercent > 0) {
                logger.debug(
                  `${symbol} 曾经盈利过（峰值=${peakPnlPercent.toFixed(
                    2
                  )}%），开始峰值回落检查`
                );

                // 计算从峰值的回落幅度（绝对回落，单位：百分点）
                const drawdownFromPeak =
                  peakPnlPercent > 0 ? peakPnlPercent - pnlPercent : 0;

                // 🔧 加仓信息提示
                const addInfo =
                  addPositionCount > 0
                    ? ` (已加仓${addPositionCount}次，使用加权平均成本${entryPrice.toFixed(
                        2
                      )})`
                    : "";

                // 🎯 关键判断：如果当前已经亏损，说明利润已经完全回吐
                // 这种情况下应该更严格地执行峰值回落保护
                const isNowLosing = pnlPercent < 0;
                const lossInfo = isNowLosing
                  ? ` ⚠️ 当前已转为亏损，需要严格保护`
                  : "";

                logger.debug(
                  `${symbol} 峰值盈利: ${peakPnlPercent.toFixed(
                    2
                  )}%，当前盈利: ${pnlPercent.toFixed(
                    2
                  )}%，峰值回落: ${drawdownFromPeak.toFixed(
                    2
                  )}%${addInfo}${lossInfo}`
                );

                // 🎯 修复：根据回落幅度选择峰值回落级别，而不是根据峰值所在区间
                // 这样可以确保当价格从高位回落时，能够及时触发保护
                let activeLevel: {
                  drawdownThreshold: number;
                  closePercent: number;
                } | null = null;
                let levelName = "";

                // 🔧 关键修复：先读取已执行的峰值回落级别，避免重复触发
                const executedLevelsResult = await dbClient.execute({
                  sql: "SELECT executed_levels FROM positions WHERE symbol = ?",
                  args: [symbol],
                });

                let executedPeakDrawdownLevels: Set<string> = new Set();
                if (executedLevelsResult.rows.length > 0) {
                  const executedLevelsStr = String(
                    executedLevelsResult.rows[0].executed_levels || "[]"
                  );
                  try {
                    const executedLevels = JSON.parse(executedLevelsStr);
                    // 只提取峰值回落相关的级别
                    executedPeakDrawdownLevels = new Set(
                      executedLevels.filter((level: string) =>
                        level.startsWith("peak_drawdown_")
                      )
                    );
                    if (executedPeakDrawdownLevels.size > 0) {
                      logger.debug(
                        `${symbol} 已执行的峰值回落级别: ${JSON.stringify(
                          Array.from(executedPeakDrawdownLevels)
                        )}`
                      );
                    }
                  } catch (e) {
                    logger.warn(`${symbol} 解析 executed_levels 失败: ${e}`);
                  }
                }

                // 按照回落幅度从大到小检查，优先触发更严格的保护
                // 同时检查该级别是否已经执行过
                // 🔧 关键修复：如果高级别已执行，则不再检查低级别（峰值回落是递进的，不应重复触发）
                const hasExecutedHigherLevel =
                  executedPeakDrawdownLevels.has("peak_drawdown_level3") ||
                  executedPeakDrawdownLevels.has("peak_drawdown_level2");

                if (
                  drawdownFromPeak >=
                    peakDrawdownConfig.level3.drawdownThreshold &&
                  !executedPeakDrawdownLevels.has("peak_drawdown_level3")
                ) {
                  activeLevel = peakDrawdownConfig.level3;
                  levelName = "level3";
                  logger.debug(
                    `${symbol} 回落幅度 ${drawdownFromPeak.toFixed(
                      2
                    )}% >= level3 阈值 ${
                      peakDrawdownConfig.level3.drawdownThreshold
                    }%，使用 level3 峰值回落保护`
                  );
                } else if (
                  drawdownFromPeak >=
                    peakDrawdownConfig.level2.drawdownThreshold &&
                  !executedPeakDrawdownLevels.has("peak_drawdown_level2") &&
                  !hasExecutedHigherLevel
                ) {
                  activeLevel = peakDrawdownConfig.level2;
                  levelName = "level2";
                  logger.debug(
                    `${symbol} 回落幅度 ${drawdownFromPeak.toFixed(
                      2
                    )}% >= level2 阈值 ${
                      peakDrawdownConfig.level2.drawdownThreshold
                    }%，使用 level2 峰值回落保护`
                  );
                } else if (
                  drawdownFromPeak >=
                    peakDrawdownConfig.level1.drawdownThreshold &&
                  !executedPeakDrawdownLevels.has("peak_drawdown_level1") &&
                  !hasExecutedHigherLevel
                ) {
                  activeLevel = peakDrawdownConfig.level1;
                  levelName = "level1";
                  logger.debug(
                    `${symbol} 回落幅度 ${drawdownFromPeak.toFixed(
                      2
                    )}% >= level1 阈值 ${
                      peakDrawdownConfig.level1.drawdownThreshold
                    }%，使用 level1 峰值回落保护`
                  );
                } else {
                  // 回落幅度未达到任何级别的阈值，或所有级别都已执行
                  if (hasExecutedHigherLevel) {
                    logger.debug(
                      `${symbol} 已执行过高级别峰值回落保护（level2或level3），不再触发低级别保护`
                    );
                  } else if (
                    drawdownFromPeak >=
                    peakDrawdownConfig.level1.drawdownThreshold
                  ) {
                    logger.debug(
                      `${symbol} 回落幅度 ${drawdownFromPeak.toFixed(
                        2
                      )}% 达到阈值，但所有峰值回落级别都已执行过`
                    );
                  } else {
                    logger.debug(
                      `${symbol} 回落幅度 ${drawdownFromPeak.toFixed(
                        2
                      )}% 未达到任何峰值回落阈值（level1: ${
                        peakDrawdownConfig.level1.drawdownThreshold
                      }%），暂不触发`
                    );
                  }
                }

                // 检查是否达到当前级别的峰值回落阈值
                if (
                  activeLevel &&
                  drawdownFromPeak >= activeLevel.drawdownThreshold
                ) {
                  logger.warn(
                    `${symbol} 峰值回落达到 ${levelName} 阈值: ${drawdownFromPeak.toFixed(
                      2
                    )}% >= ${activeLevel.drawdownThreshold}%`
                  );

                  // 🔍 智能指标验证：检查是否真的需要平仓
                  let shouldTrigger = true;
                  const indicators: string[] = [];

                  // 🎯 Level1 特殊处理：因为level1是100%全平，需要更严格的智能判断
                  const isLevel1 = levelName === "level1";

                  try {
                    // 🎯 使用蔡森趋势决策模块进行智能判断
                    const trendDecision = await getCaiSenTrendDecision(
                      symbol,
                      side
                    );
                    indicators.push(
                      `蔡森趋势: ${
                        trendDecision.trend
                      } (评分: ${trendDecision.score.toFixed(0)})`
                    );
                    indicators.push(`决策原因: ${trendDecision.reason}`);

                    // 🎯 根据蔡森趋势决策设置shouldTrigger
                    if (trendDecision.trend === TrendDirection.BULLISH) {
                      // 看涨：不平仓，继续持有
                      shouldTrigger = false;
                      logger.info(
                        `${symbol} ${levelName} 蔡森趋势判断为看涨（评分: ${trendDecision.score.toFixed(
                          0
                        )}），暂不执行峰值回落保护`
                      );
                      logger.info(`  决策原因: ${trendDecision.reason}`);
                      logger.info(`  指标分析: ${indicators.join(", ")}`);
                    } else if (trendDecision.trend === TrendDirection.BEARISH) {
                      // 看跌：强制全平
                      shouldTrigger = true;
                      indicators.push(
                        "🔴 蔡森趋势判断为看跌，强制执行峰值回落保护"
                      );
                      logger.warn(
                        `${symbol} ${levelName} 蔡森趋势判断为看跌（评分: ${trendDecision.score.toFixed(
                          0
                        )}），强制执行峰值回落保护`
                      );
                      logger.info(`  决策原因: ${trendDecision.reason}`);
                      logger.info(`  指标分析: ${indicators.join(", ")}`);
                    } else {
                      // NEUTRAL情况：使用原有的容忍度判断逻辑
                      indicators.push(
                        "⚠️ 蔡森趋势判断为中性，使用原有容忍度逻辑"
                      );
                      logger.info(
                        `${symbol} ${levelName} 蔡森趋势判断为中性（评分: ${trendDecision.score.toFixed(
                          0
                        )}），使用原有容忍度逻辑`
                      );
                      logger.info(`  决策原因: ${trendDecision.reason}`);

                      // 获取市场数据进行指标验证
                      const klines = await getKlineData(symbol, "5m", 20);
                      if (klines.length >= 10) {
                        const latestKlines = klines.slice(-10);
                        const prices = latestKlines.map((k) => k.close);
                        const volumes = latestKlines.map((k) => k.volume);

                        // 1. 检查短期趋势（5分钟EMA10）
                        const ema10 =
                          prices.reduce((sum, p) => sum + p, 0) / prices.length;
                        const currentPriceForCheck = prices[prices.length - 1];
                        const trendUp = currentPriceForCheck > ema10;

                        // 🎯 关键判断：趋势是否对我们不利
                        if (side === "long" && !trendUp) {
                          indicators.push("⚠️ 短期趋势转为向下（不利）");
                        } else if (side === "short" && trendUp) {
                          indicators.push("⚠️ 短期趋势转为向上（不利）");
                        } else if (side === "long" && trendUp) {
                          indicators.push("✅ 短期趋势仍向上（有利）");
                        } else if (side === "short" && !trendUp) {
                          indicators.push("✅ 短期趋势仍向下（有利）");
                        }

                        // 2. 检查成交量（最近3根K线平均成交量 vs 前7根）
                        const recentVolume =
                          volumes.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
                        const previousVolume =
                          volumes
                            .slice(-10, -3)
                            .reduce((sum, v) => sum + v, 0) / 7;
                        const volumeRatio = recentVolume / previousVolume;

                        if (volumeRatio > 1.2) {
                          indicators.push(
                            `成交量放大${(volumeRatio * 100).toFixed(0)}%`
                          );
                        } else if (volumeRatio < 0.8) {
                          indicators.push(
                            `成交量萎缩${((1 - volumeRatio) * 100).toFixed(0)}%`
                          );
                        }

                        // 3. 检查价格波动（最近3根K线的波动率）
                        const recentPrices = prices.slice(-3);
                        const priceChanges = recentPrices
                          .slice(1)
                          .map(
                            (p, i) =>
                              Math.abs(p - recentPrices[i]) / recentPrices[i]
                          );
                        const avgVolatility =
                          priceChanges.reduce((sum, c) => sum + c, 0) /
                          priceChanges.length;

                        if (avgVolatility > 0.005) {
                          indicators.push(
                            `高波动率${(avgVolatility * 100).toFixed(2)}%`
                          );
                        }

                        // 🎯 中性情况下的决策逻辑
                        // 情况1：如果当前已经亏损，无论指标如何，都应该果断平仓
                        if (isNowLosing) {
                          shouldTrigger = true;
                          indicators.push(
                            "🔴 当前已亏损，必须执行峰值回落保护"
                          );
                          logger.warn(
                            `${symbol} 从盈利${peakPnlPercent.toFixed(
                              2
                            )}%转为亏损${pnlPercent.toFixed(
                              2
                            )}%，必须执行峰值回落保护`
                          );
                        }
                        // 情况2：如果趋势对我们不利，应该果断平仓
                        else if (side === "long" && !trendUp) {
                          shouldTrigger = true;
                          indicators.push("🔴 趋势反转，必须执行峰值回落保护");
                          logger.warn(
                            `${symbol} 趋势已转为下跌，必须执行峰值回落保护`
                          );
                        } else if (side === "short" && trendUp) {
                          shouldTrigger = true;
                          indicators.push("🔴 趋势反转，必须执行峰值回落保护");
                          logger.warn(
                            `${symbol} 趋势已转为上涨，必须执行峰值回落保护`
                          );
                        }
                        // 情况3：只有在趋势仍然有利且成交量放大时，才给予有限的容忍度
                        else if (
                          ((side === "long" && trendUp) ||
                            (side === "short" && !trendUp)) &&
                          volumeRatio > 1.2
                        ) {
                          // 趋势健康 + 成交量放大 = 可能只是正常回调
                          // 🎯 Level1特殊处理：因为是100%全平，容忍度更低（只提高10%）
                          // Level2/3：可以提高20%容忍度
                          const toleranceMultiplier = isLevel1 ? 1.1 : 1.2;
                          const adjustedThreshold =
                            activeLevel.drawdownThreshold * toleranceMultiplier;

                          if (drawdownFromPeak < adjustedThreshold) {
                            shouldTrigger = false;
                            logger.info(
                              `${symbol} ${levelName} 指标健康，提高峰值回落容忍度至 ${adjustedThreshold.toFixed(
                                2
                              )}%，暂不触发平仓（当前回落: ${drawdownFromPeak.toFixed(
                                2
                              )}%）${isLevel1 ? " [Level1严格模式]" : ""}`
                            );
                            logger.info(`  指标分析: ${indicators.join(", ")}`);
                          } else {
                            // 即使指标健康，但回落幅度已经超过容忍度，仍然要触发
                            shouldTrigger = true;
                            indicators.push(
                              `⚠️ 回落幅度${drawdownFromPeak.toFixed(
                                2
                              )}%超过容忍度${adjustedThreshold.toFixed(2)}%`
                            );
                            logger.warn(
                              `${symbol} ${levelName} 虽然指标健康，但回落幅度${drawdownFromPeak.toFixed(
                                2
                              )}%已超过容忍度${adjustedThreshold.toFixed(
                                2
                              )}%，必须执行峰值回落保护${
                                isLevel1 ? " [Level1全平]" : ""
                              }`
                            );
                          }
                        }
                        // 🎯 Level1额外判断：如果不满足容忍条件，默认触发
                        else if (isLevel1) {
                          shouldTrigger = true;
                          indicators.push(
                            "⚠️ Level1严格模式：不满足容忍条件，执行全平"
                          );
                          logger.warn(
                            `${symbol} Level1 不满足容忍条件（趋势不够强或成交量未放大），执行全平保护`
                          );
                        }
                      }
                    }
                  } catch (error) {
                    logger.warn(
                      `${symbol} 获取蔡森趋势决策失败，使用默认峰值回落逻辑: ${error}`
                    );
                    // 如果获取数据失败，且当前已经亏损，应该果断平仓
                    if (isNowLosing) {
                      shouldTrigger = true;
                      logger.warn(
                        `${symbol} 当前已亏损，即使无法获取蔡森趋势决策，也应执行峰值回落保护`
                      );
                    }
                  }

                  // 执行平仓
                  if (shouldTrigger) {
                    // 🔧 执行锁机制（数据库持久化），防止短时间内重复触发
                    const lockKey = `${symbol}_${levelName}`;
                    const currentTime = Date.now();

                    // 检查是否正在执行中
                    const executionState = await checkExecutionLock(lockKey);
                    if (executionState?.isExecuting) {
                      const timeSinceStart =
                        currentTime - executionState.lastExecutionTime;
                      if (timeSinceStart < 30000) {
                        // 30秒超时保护
                        logger.debug(
                          `${symbol} ${levelName} 峰值回落保护正在执行中，跳过重复触发（已执行${Math.ceil(
                            timeSinceStart / 1000
                          )}秒）`
                        );
                        continue;
                      } else {
                        // 超过30秒，可能是异常情况，清除状态
                        logger.warn(
                          `${symbol} ${levelName} 执行超时（${Math.ceil(
                            timeSinceStart / 1000
                          )}秒），清除状态并重新执行`
                        );
                        await clearExecutionLock(lockKey);
                      }
                    }

                    // 设置执行状态
                    await setExecutionLock(lockKey, true);

                    try {
                      // 🔧 新增：在创建批次前，再次确认持仓仍然存在且有足够数量
                      const currentPositions = await getCurrentPositions();
                      const currentPosition = currentPositions.find(
                        (p) => p.contract === contract
                      );

                      if (
                        !currentPosition ||
                        Math.abs(Number.parseFloat(currentPosition.size)) === 0
                      ) {
                        logger.warn(
                          `${symbol} 持仓已不存在或已被完全平仓，跳过峰值回落保护`
                        );
                        continue;
                      }

                      const currentSize = Math.abs(
                        Number.parseFloat(currentPosition.size)
                      );
                      const closePercent = activeLevel.closePercent / 100;
                      // 🔧 关键修复：基于 initial_quantity 计算平仓数量
                      const initialQuantity =
                        dbInfo?.initial_quantity || currentSize;
                      const closeQuantity = Math.floor(
                        initialQuantity * closePercent
                      );

                      if (closeQuantity === 0) {
                        logger.warn(
                          `${symbol} 计算平仓数量为0（当前持仓: ${currentSize}，平仓比例: ${(
                            closePercent * 100
                          ).toFixed(0)}%），跳过峰值回落保护`
                        );
                        continue;
                      }

                      logger.warn(
                        `${symbol} 确认触发 ${levelName} 峰值回落保护，准备平仓${activeLevel.closePercent}%的仓位（${closeQuantity}张）`
                      );
                      if (indicators.length > 0) {
                        logger.info(`  指标分析: ${indicators.join(", ")}`);
                      }

                      const batchConfig: BatchConfig = {
                        batchId: `peak_drawdown_${symbol}_${levelName}_${Date.now()}`,
                        positionId: contract,
                        closingType: ClosingType.RISK_MITIGATION,
                        closingRatio: closePercent,
                        closingQuantity: closeQuantity,
                        triggerCondition: {
                          triggerType: "manual",
                          triggerValue: 0,
                          operator: ">",
                        },
                        priority: 1,
                        createdAt: Date.now(),
                      };

                      const batchId =
                        batchClosingSystem.setBatchClosing(batchConfig);
                      if (batchId) {
                        batchClosingSystem.activateBatchClosing(batchId);
                        await batchClosingSystem.executeBatch(batchId);
                        logger.info(
                          `${symbol} ${levelName} 峰值回落保护已执行，平仓${(
                            closePercent * 100
                          ).toFixed(0)}%`
                        );

                        // 🔧 关键修复：记录已执行的峰值回落级别，防止重复触发
                        try {
                          // 从数据库读取当前的 executed_levels
                          const executedLevelsResult = await dbClient.execute({
                            sql: "SELECT executed_levels FROM positions WHERE symbol = ?",
                            args: [symbol],
                          });

                          let executedLevels: string[] = [];
                          if (executedLevelsResult.rows.length > 0) {
                            const executedLevelsStr = String(
                              executedLevelsResult.rows[0].executed_levels ||
                                "[]"
                            );
                            try {
                              executedLevels = JSON.parse(executedLevelsStr);
                            } catch (e) {
                              logger.warn(
                                `${symbol} 解析 executed_levels 失败: ${e}`
                              );
                            }
                          }

                          // 添加当前执行的级别（使用 peak_drawdown_ 前缀区分）
                          const peakDrawdownLevelKey = `peak_drawdown_${levelName}`;
                          if (!executedLevels.includes(peakDrawdownLevelKey)) {
                            executedLevels.push(peakDrawdownLevelKey);

                            // 更新数据库
                            await dbClient.execute({
                              sql: "UPDATE positions SET executed_levels = ? WHERE symbol = ?",
                              args: [JSON.stringify(executedLevels), symbol],
                            });

                            logger.info({
                              action: "record_peak_drawdown_execution",
                              symbol,
                              level: levelName,
                              executedLevels,
                              message: `已记录 ${levelName} 峰值回落执行，防止重复触发`,
                            });
                          }
                        } catch (error) {
                          logger.error({
                            action: "record_peak_drawdown_execution_error",
                            symbol,
                            level: levelName,
                            error: (error as Error).message,
                            message: "记录峰值回落执行失败",
                          });
                        }
                      }
                      // 触发峰值回落后，跳过分批止盈检查
                      continue;
                    } catch (error) {
                      logger.error({
                        action: "peak_drawdown_execution_error",
                        symbol,
                        level: levelName,
                        error: (error as Error).message,
                        stack: (error as Error).stack,
                        message: "峰值回落保护执行失败",
                      });
                    } finally {
                      // 🔧 关键修复：无论成功还是失败，都要清除执行状态（数据库持久化）
                      await clearExecutionLock(lockKey);
                      logger.debug({
                        action: "peak_drawdown_execution_unlock",
                        symbol,
                        level: levelName,
                        message: "峰值回落保护执行锁已解除",
                      });
                    }
                  }
                }
              } else {
                // 从未盈利过，跳过峰值回落检查
                logger.debug(
                  `${symbol} 从未盈利过（峰值盈利=${peakPnlPercent.toFixed(
                    2
                  )}%），跳过峰值回落检查`
                );
              }
            }
          }

          // 检查是否达到止盈条件（只在盈利时检查）
          if (takeProfitConfig && pnlPercent > 0 && batchClosingSystem) {
            // 🔧 关键修复：从数据库获取已执行的级别，避免重复触发
            const executedLevelsResult = await dbClient.execute({
              sql: "SELECT executed_levels FROM positions WHERE symbol = ?",
              args: [symbol],
            });

            let executedLevels: Set<string> = new Set();
            if (executedLevelsResult.rows.length > 0) {
              const executedLevelsStr = String(
                executedLevelsResult.rows[0].executed_levels || "[]"
              );
              try {
                const levelsArray = JSON.parse(executedLevelsStr);
                executedLevels = new Set(levelsArray);
                logger.debug(
                  `${symbol} 已执行的止盈级别: ${JSON.stringify(
                    Array.from(executedLevels)
                  )}`
                );
              } catch (e) {
                logger.warn(`${symbol} 解析 executed_levels 失败: ${e}`);
              }
            }

            // 🔧 关键修复：分批止盈级别检查顺序
            // 按照优先级从高到低检查，但每个级别独立判断，避免高级别已执行时跳过低级别
            // 使用独立的if语句而不是else if链，确保每个级别都能被检查

            // 检查第三阶段（最高优先级，全部平仓）
            if (
              pnlPercent >= takeProfitConfig.stage3.trigger &&
              !executedLevels.has("stage3")
            ) {
              // 达到第三阶段止盈，全部平仓
              logger.info(
                `${symbol} 达到第三阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${
                  takeProfitConfig.stage3.trigger
                }%`
              );
              logger.info("准备执行全部平仓操作");

              // 创建全平仓配置
              const batchConfig: BatchConfig = {
                batchId: `take_profit_${symbol}_stage3_${Date.now()}`,
                positionId: contract,
                closingType: ClosingType.TAKE_PROFIT,
                closingRatio: 1.0, // 全部平仓
                closingQuantity: size,
                triggerCondition: {
                  triggerType: "manual",
                  triggerValue: 0,
                  operator: ">",
                },
                priority: 1,
                createdAt: Date.now(),
              };

              // 设置并执行分批平仓
              const batchId = batchClosingSystem.setBatchClosing(batchConfig);
              if (batchId) {
                batchClosingSystem.activateBatchClosing(batchId);
                await batchClosingSystem.executeBatch(batchId);
                logger.info(`${symbol} 第三阶段止盈已执行，全部平仓`);

                // 🔧 更新已执行级别
                executedLevels.add("stage3");
                await dbClient.execute({
                  sql: "UPDATE positions SET executed_levels = ? WHERE symbol = ?",
                  args: [JSON.stringify(Array.from(executedLevels)), symbol],
                });
              }
            }

            // 检查第二阶段（独立判断，不受stage3影响）
            if (
              pnlPercent >= takeProfitConfig.stage2.trigger &&
              !executedLevels.has("stage2") &&
              !executedLevels.has("stage3")
            ) {
              // 达到第二阶段止盈，平仓部分仓位
              logger.info(
                `${symbol} 达到第二阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${
                  takeProfitConfig.stage2.trigger
                }%`
              );
              logger.info(
                `准备执行第二阶段止盈，平仓${takeProfitConfig.stage2.closePercent}%的仓位`
              );

              // 创建分批平仓配置
              const closePercent = takeProfitConfig.stage2.closePercent / 100;
              // 🔧 关键修复：基于 initial_quantity 计算平仓数量
              const initialQuantity = dbInfo?.initial_quantity || size;
              const closeQuantity = Math.floor(initialQuantity * closePercent);
              const batchConfig: BatchConfig = {
                batchId: `take_profit_${symbol}_stage2_${Date.now()}`,
                positionId: contract,
                closingType: ClosingType.TAKE_PROFIT,
                closingRatio: closePercent,
                closingQuantity: closeQuantity,
                triggerCondition: {
                  triggerType: "manual",
                  triggerValue: 0,
                  operator: ">",
                },
                priority: 2,
                createdAt: Date.now(),
              };

              // 设置并执行分批平仓
              const batchId = batchClosingSystem.setBatchClosing(batchConfig);
              if (batchId) {
                batchClosingSystem.activateBatchClosing(batchId);
                await batchClosingSystem.executeBatch(batchId);
                logger.info(
                  `${symbol} 第二阶段止盈已执行，平仓${(
                    closePercent * 100
                  ).toFixed(0)}%`
                );

                // 🔧 更新已执行级别
                executedLevels.add("stage2");
                await dbClient.execute({
                  sql: "UPDATE positions SET executed_levels = ? WHERE symbol = ?",
                  args: [JSON.stringify(Array.from(executedLevels)), symbol],
                });
              }
            }

            // 检查第一阶段（独立判断，不受stage2和stage3影响）
            if (
              pnlPercent >= takeProfitConfig.stage1.trigger &&
              !executedLevels.has("stage1") &&
              !executedLevels.has("stage2") &&
              !executedLevels.has("stage3")
            ) {
              // 达到第一阶段止盈，平仓部分仓位
              logger.info(
                `${symbol} 达到第一阶段止盈条件: ${pnlPercent.toFixed(2)}% >= ${
                  takeProfitConfig.stage1.trigger
                }%`
              );
              logger.info(
                `准备执行第一阶段止盈，平仓${takeProfitConfig.stage1.closePercent}%的仓位`
              );

              // 创建分批平仓配置
              const closePercent = takeProfitConfig.stage1.closePercent / 100;
              // 🔧 关键修复：基于 initial_quantity 计算平仓数量，确保每个阶段平仓的绝对数量保持一致
              const initialQuantity = dbInfo?.initial_quantity || size;
              const closeQuantity = Math.floor(initialQuantity * closePercent);
              const batchConfig: BatchConfig = {
                batchId: `take_profit_${symbol}_stage1_${Date.now()}`,
                positionId: contract,
                closingType: ClosingType.TAKE_PROFIT,
                closingRatio: closePercent,
                closingQuantity: closeQuantity,
                triggerCondition: {
                  triggerType: "manual",
                  triggerValue: 0,
                  operator: ">",
                },
                priority: 3,
                createdAt: Date.now(),
              };

              // 设置并执行分批平仓
              const batchId = batchClosingSystem.setBatchClosing(batchConfig);
              if (batchId) {
                batchClosingSystem.activateBatchClosing(batchId);
                await batchClosingSystem.executeBatch(batchId);
                logger.info(
                  `${symbol} 第一阶段止盈已执行，平仓${(
                    closePercent * 100
                  ).toFixed(0)}%`
                );

                // 🔧 更新已执行级别
                executedLevels.add("stage1");
                await dbClient.execute({
                  sql: "UPDATE positions SET executed_levels = ? WHERE symbol = ?",
                  args: [JSON.stringify(Array.from(executedLevels)), symbol],
                });
              }
            }
          } else {
            logger.debug(
              `${symbol} 当前亏损: ${pnlPercent.toFixed(2)}%，不检查止盈条件`
            );
          }
        }
      }
    } // for循环结束
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

  // 初始化分批平仓系统
  const strategy = getTradingStrategy();
  const strategyParams = getStrategyParams(strategy);
  batchClosingSystem = new CaiSenBatchClosingSystem(
    {
      maxConcurrentBatches: 3,
      batchExecutionInterval: 1000,
      maxRetryCount: 3,
      enableAutoExecution: true,
      priceDeviationTolerance: 0.5,
    },
    strategyParams
  );

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

  // 销毁分批平仓系统
  if (batchClosingSystem) {
    batchClosingSystem.destroy();
    batchClosingSystem = null;
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
