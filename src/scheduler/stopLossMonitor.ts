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
 * 止损监控器 - 每10秒执行一次（根据策略配置启用）
 *
 * 适用范围：
 * - 策略配置 enableCodeLevelProtection = true 时启用
 * - 默认只有 swing-trend（波段趋势策略）启用，其他策略可根据需要启用
 * - 直接使用策略的 stopLoss 配置，根据杠杆范围自动映射到 low/mid/high
 *
 * 功能：
 * 1. 每10秒从Gate.io获取最新持仓价格（markPrice）
 * 2. 计算每个持仓的当前盈亏百分比
 * 3. 根据止损规则判断是否触发止损（基于杠杆倍数动态映射）
 * 4. 触发时立即平仓，记录到交易历史和决策数据
 *
 * 止损规则（示例 - swing-trend 策略）：
 * - 低风险（5-7倍杠杆）：亏损达到 -6% 时止损
 * - 中风险（8-12倍杠杆）：亏损达到 -5% 时止损
 * - 高风险（13倍以上杠杆）：亏损达到 -4% 时止损
 *
 * 注意：
 * - 每个持仓独立监控，不是整体账户
 * - 盈亏计算已考虑杠杆倍数
 * - 不由AI执行止损，完全自动化
 */

import { createClient } from "@libsql/client";
import { AIStopLossJudger } from "../agents/aiStopLossJudgment";
import { getTradingStrategy } from "../agents/tradingAgent";
import { RISK_PARAMS } from "../config/riskParams";
import { createExchangeClient } from "../services/exchangeClient";
import { getStrategyParams } from "../strategies";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { createLogger } from "../utils/loggerUtils";
import { getChinaTimeISO } from "../utils/timeUtils";
import { executeTradingDecision, iterationCount } from "./tradingLoop";
import {
  recordClosingDecision,
  ClosingTriggerType,
} from "../caisen/systems/monitor/recordClosingDecision";

const logger = createLogger({
  name: "stop-loss-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

// ==================== 止损默认配置 ====================
const DEFAULT_STOP_LOSS_CONFIG = {
  enabled: true,
  levels: [
    { leverageMin: 9, leverageMax: 11, threshold: -15 }, // 9-11倍杠杆，亏损 -15% 时止损
    { leverageMin: 12, leverageMax: 12, threshold: -10 }, // 12倍杠杆，亏损 -10% 时止损
    { leverageMin: 13, leverageMax: 100, threshold: -8 }, // 13倍以上杠杆，亏损 -8% 时止损
  ],
};

// ==================== 追踪止损状态管理 ====================
/**
 * 追踪止损状态
 * 为每个盈利仓位维护追踪止损状态
 */
interface TrailingStopState {
  /** 峰值价格（做多时为最高价，做空时为最低价） */
  peakPrice: number;
  /** 追踪止损价格 */
  trailingStopPrice: number;
  /** 最后更新时间 */
  lastUpdateTime: number;
  /** 开仓价格 */
  entryPrice: number;
  /** 持仓方向 */
  side: "long" | "short";
}

/**
 * 追踪止损状态缓存：symbol -> 追踪状态
 */
const trailingStopStates = new Map<string, TrailingStopState>();

/**
 * 根据杠杆倍数确定止损阈值
 * 支持自定义杠杆范围配置、动态止损阈值和数据库存储
 */
export async function getStopLossThreshold(
  leverage: number,
  symbol?: string
): Promise<{
  threshold: number;
  level: string;
  description: string;
}> {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy, RISK_PARAMS.MAX_LEVERAGE);
  let dynamicStopLoss = null;

  // 1. 检查是否存在数据库存储的动态止损阈值（优先级最高）
  if (symbol && strategy === "cai-sen") {
    try {
      const { createClient } = await import("@libsql/client");
      const dbClient = createClient({
        url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
      });

      const result = await dbClient.execute({
        sql: `SELECT value FROM strategy_params WHERE key = ? AND strategy = ?`,
        args: [`dynamic_stop_loss_${symbol}`, strategy],
      });

      if (result.rows && result.rows.length > 0) {
        dynamicStopLoss = JSON.parse(result.rows[0].value as string);
        logger.info(
          `从数据库读取动态止损阈值: ${symbol} - ${dynamicStopLoss.threshold}%`
        );
      }
    } catch (error) {
      logger.warn(
        `从数据库读取动态止损阈值失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // 读取失败时，继续检查内存中的动态止损配置
    }
  }

  // 2. 检查是否存在内存中的动态止损阈值（蔡森Agent设置）
  if (
    !dynamicStopLoss &&
    symbol &&
    params.dynamicStopLoss &&
    params.dynamicStopLoss[symbol]
  ) {
    dynamicStopLoss = params.dynamicStopLoss[symbol];
    logger.debug(
      `使用内存中的动态止损阈值: ${symbol} - ${dynamicStopLoss.threshold}%`
    );
  }

  // 3. 如果存在动态止损阈值，返回该阈值
  if (dynamicStopLoss) {
    return {
      threshold: dynamicStopLoss.threshold,
      level: "动态止损",
      description: `蔡森Agent动态设置：${symbol} 亏损 ${dynamicStopLoss.threshold}% 时止损（评估周期：${dynamicStopLoss.evaluationInterval}分钟）`,
    };
  }

  // 4. 获取止损配置，使用默认值作为回退
  let stopLossConfig;
  if (params.stopLoss) {
    // 处理旧格式配置（兼容）
    if (params.stopLoss.low && params.stopLoss.mid && params.stopLoss.high) {
      // 旧格式：low/mid/high
      const levMin = params.leverageMin;
      const levMax = params.leverageMax;
      const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
      const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);

      stopLossConfig = {
        enabled: true,
        levels: [
          {
            leverageMin: levMin,
            leverageMax: lowThreshold,
            threshold: params.stopLoss.low,
          },
          {
            leverageMin: lowThreshold + 1,
            leverageMax: midThreshold,
            threshold: params.stopLoss.mid,
          },
          {
            leverageMin: midThreshold + 1,
            leverageMax: levMax,
            threshold: params.stopLoss.high,
          },
        ],
      };
    } else {
      // 新格式：自定义杠杆范围
      stopLossConfig = params.stopLoss;
    }
  } else {
    // 使用默认配置
    stopLossConfig = DEFAULT_STOP_LOSS_CONFIG;
  }

  // 5. 根据杠杆范围自动映射到 low/mid/high
  // 低杠杆：leverageMin ~ leverageMin + (leverageMax - leverageMin) * 0.33
  // 中杠杆：低杠杆上限 + 1 ~ leverageMin + (leverageMax - leverageMin) * 0.67
  // 高杠杆：中杠杆上限 + 1 ~ leverageMax
  const levMin = params.leverageMin;
  const levMax = params.leverageMax;
  const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
  const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);

  if (leverage > midThreshold) {
    return {
      threshold: params.stopLoss.high,
      level: "高杠杆",
      description: `${midThreshold + 1}倍以上杠杆，亏损 ${
        params.stopLoss.high
      }% 时止损`,
    };
  } else if (leverage > lowThreshold) {
    return {
      threshold: params.stopLoss.mid,
      level: "中杠杆",
      description: `${lowThreshold + 1}-${midThreshold}倍杠杆，亏损 ${
        params.stopLoss.mid
      }% 时止损`,
    };
  } else {
    return {
      threshold: params.stopLoss.low,
      level: "低杠杆",
      description: `${levMin}-${lowThreshold}倍杠杆，亏损 ${params.stopLoss.low}% 时止损`,
    };
  }
}

// 持仓监控记录：symbol -> { checkCount, lastCheckTime }
const positionMonitorHistory = new Map<
  string,
  {
    lastCheckTime: number;
    checkCount: number;
  }
>();

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let aiStopLossJudger: AIStopLossJudger | null = null;

/**
 * 检查当前策略是否启用代码级止损
 */
function isStopLossEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy, RISK_PARAMS.MAX_LEVERAGE);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取止损配置（用于日志输出）
 */
function getStopLossConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy, RISK_PARAMS.MAX_LEVERAGE);

  if (!params.stopLoss) {
    return null;
  }

  const levMin = params.leverageMin;
  const levMax = params.leverageMax;
  const lowThreshold = Math.ceil(levMin + (levMax - levMin) * 0.33);
  const midThreshold = Math.ceil(levMin + (levMax - levMin) * 0.67);

  return {
    lowRisk: {
      description: `${levMin}-${lowThreshold}倍杠杆，亏损 ${params.stopLoss.low}% 时止损`,
      threshold: params.stopLoss.low,
    },
    mediumRisk: {
      description: `${lowThreshold + 1}-${midThreshold}倍杠杆，亏损 ${
        params.stopLoss.mid
      }% 时止损`,
      threshold: params.stopLoss.mid,
    },
    highRisk: {
      description: `${midThreshold + 1}倍以上杠杆，亏损 ${
        params.stopLoss.high
      }% 时止损`,
      threshold: params.stopLoss.high,
    },
  };
}

/**
 * 计算持仓盈亏百分比（考虑杠杆）
 */
function calculatePnlPercent(
  entryPrice: number,
  currentPrice: number,
  side: string,
  leverage: number
): number {
  const priceChangePercent =
    entryPrice > 0
      ? ((currentPrice - entryPrice) / entryPrice) *
        100 *
        (side === "long" ? 1 : -1)
      : 0;
  return priceChangePercent * leverage;
}

/**
 * 更新追踪止损状态
 * 当价格创新高（做多）或新低（做空）时，更新追踪止损价格
 *
 * @param symbol 交易币种
 * @param currentPrice 当前价格
 * @param entryPrice 开仓价格
 * @param side 持仓方向
 * @param leverage 杠杆倍数
 * @returns 是否更新了追踪止损价格
 */
function updateTrailingStop(
  symbol: string,
  currentPrice: number,
  entryPrice: number,
  side: "long" | "short",
  leverage: number
): boolean {
  const now = Date.now();

  // 检查是否盈利（只有盈利仓位才启用追踪止损）
  const pnlPercent = calculatePnlPercent(
    entryPrice,
    currentPrice,
    side,
    leverage
  );
  if (pnlPercent <= 0) {
    // 亏损仓位不启用追踪止损
    return false;
  }

  // 获取或初始化追踪止损状态
  let state = trailingStopStates.get(symbol);

  if (!state) {
    // 首次创建追踪止损状态
    // 追踪止损距离：根据盈利幅度动态调整（盈利越多，追踪距离越大）
    const trailingDistance = Math.max(2, pnlPercent * 0.3); // 至少2%，最多为盈利的30%
    const trailingStopPrice =
      side === "long"
        ? currentPrice * (1 - trailingDistance / 100)
        : currentPrice * (1 + trailingDistance / 100);

    state = {
      peakPrice: currentPrice,
      trailingStopPrice,
      lastUpdateTime: now,
      entryPrice,
      side,
    };
    trailingStopStates.set(symbol, state);

    logger.info({
      action: "trailing_stop_initialized",
      symbol,
      side,
      currentPrice,
      peakPrice: currentPrice,
      trailingStopPrice,
      pnlPercent: pnlPercent.toFixed(2),
      trailingDistance: trailingDistance.toFixed(2),
      message: `初始化追踪止损: 峰值价格 ${currentPrice}, 追踪止损价格 ${trailingStopPrice.toFixed(
        2
      )}`,
    });

    return true;
  }

  // 检查是否创新高/新低
  let isPeakUpdated = false;

  if (side === "long") {
    // 做多：检查是否创新高
    if (currentPrice > state.peakPrice) {
      isPeakUpdated = true;
      state.peakPrice = currentPrice;
    }
  } else {
    // 做空：检查是否创新低
    if (currentPrice < state.peakPrice) {
      isPeakUpdated = true;
      state.peakPrice = currentPrice;
    }
  }

  // 如果创新高/新低，更新追踪止损价格
  if (isPeakUpdated) {
    // 追踪止损距离：根据盈利幅度动态调整
    const trailingDistance = Math.max(2, pnlPercent * 0.3);
    const newTrailingStopPrice =
      side === "long"
        ? state.peakPrice * (1 - trailingDistance / 100)
        : state.peakPrice * (1 + trailingDistance / 100);

    const oldTrailingStopPrice = state.trailingStopPrice;
    state.trailingStopPrice = newTrailingStopPrice;
    state.lastUpdateTime = now;

    logger.info({
      action: "trailing_stop_updated",
      symbol,
      side,
      currentPrice,
      peakPrice: state.peakPrice,
      oldTrailingStopPrice,
      newTrailingStopPrice,
      pnlPercent: pnlPercent.toFixed(2),
      trailingDistance: trailingDistance.toFixed(2),
      message: `更新追踪止损: 峰值价格 ${
        state.peakPrice
      } -> 追踪止损价格 ${newTrailingStopPrice.toFixed(2)}`,
    });

    return true;
  }

  return false;
}

/**
 * 检查是否触发追踪止损
 * 当价格回撤触及追踪止损价格时触发
 *
 * @param symbol 交易币种
 * @param currentPrice 当前价格
 * @param side 持仓方向
 * @returns 是否触发追踪止损及详细信息
 */
function checkTrailingStopTrigger(
  symbol: string,
  currentPrice: number,
  side: "long" | "short"
): {
  triggered: boolean;
  reason?: string;
  peakPrice?: number;
  trailingStopPrice?: number;
  retracement?: number;
} {
  const state = trailingStopStates.get(symbol);

  if (!state) {
    // 没有追踪止损状态，不触发
    return { triggered: false };
  }

  // 检查价格是否触及追踪止损价格
  let triggered = false;
  let retracement = 0;

  if (side === "long") {
    // 做多：价格回撤到追踪止损价格以下
    if (currentPrice <= state.trailingStopPrice) {
      triggered = true;
      retracement = ((state.peakPrice - currentPrice) / state.peakPrice) * 100;
    }
  } else {
    // 做空：价格反弹到追踪止损价格以上
    if (currentPrice >= state.trailingStopPrice) {
      triggered = true;
      retracement = ((currentPrice - state.peakPrice) / state.peakPrice) * 100;
    }
  }

  if (triggered) {
    const reason = `追踪止损触发: 价格从峰值 ${state.peakPrice.toFixed(
      2
    )} 回撤 ${retracement.toFixed(
      2
    )}%, 触及追踪止损价格 ${state.trailingStopPrice.toFixed(2)}`;

    logger.warn({
      action: "trailing_stop_triggered",
      symbol,
      side,
      currentPrice,
      peakPrice: state.peakPrice,
      trailingStopPrice: state.trailingStopPrice,
      retracement: retracement.toFixed(2),
      message: reason,
    });

    return {
      triggered: true,
      reason,
      peakPrice: state.peakPrice,
      trailingStopPrice: state.trailingStopPrice,
      retracement,
    };
  }

  return { triggered: false };
}

/**
 * 清除追踪止损状态
 * 当仓位平仓后清除对应的追踪止损状态
 *
 * @param symbol 交易币种
 */
function clearTrailingStopState(symbol: string): void {
  if (trailingStopStates.has(symbol)) {
    trailingStopStates.delete(symbol);
    logger.debug({
      action: "trailing_stop_cleared",
      symbol,
      message: `清除追踪止损状态: ${symbol}`,
    });
  }
}

/**
 * 止损触发评估结果
 */
interface StopLossTriggerEvaluation {
  /** 是否应该触发止损 */
  shouldTrigger: boolean;
  /** 触发原因 */
  reason: string;
  /** 触发优先级 (1=最高, 5=最低) */
  priority: number;
  /** 满足的触发条件 */
  conditions: {
    priceThreshold: boolean; // 价格达到止损阈值
    minLossThreshold: boolean; // 最小亏损阈值（避免微小波动）
    extremeLoss: boolean; // 极端亏损（超过阈值1.5倍）
    rapidDecline: boolean; // 快速下跌（短时间内大幅亏损）
  };
}

/**
 * 多维度止损触发条件判断
 * 综合考虑价格、趋势、波动率等条件，实现触发条件的优先级逻辑
 *
 * 优先级规则：
 * 1. 极端亏损（Priority 1）：亏损超过阈值的1.5倍，立即触发
 * 2. 快速下跌（Priority 2）：短时间内（<1分钟）亏损超过阈值，立即触发
 * 3. 标准触发（Priority 3）：亏损达到阈值且超过最小亏损阈值
 *
 * @param params 评估参数
 * @returns 触发评估结果
 */
function evaluateStopLossTrigger(params: {
  symbol: string;
  pnlPercent: number;
  threshold: number;
  currentPrice: number;
  entryPrice: number;
  side: string;
  leverage: number;
}): StopLossTriggerEvaluation {
  const {
    symbol,
    pnlPercent,
    threshold,
    currentPrice,
    entryPrice,
    side,
    leverage,
  } = params;

  // 初始化触发条件
  const conditions = {
    priceThreshold: false,
    minLossThreshold: false,
    extremeLoss: false,
    rapidDecline: false,
  };

  // 1. 检查价格是否达到止损阈值
  conditions.priceThreshold = pnlPercent <= threshold;

  // 2. 检查是否超过最小亏损阈值（避免微小波动触发）
  conditions.minLossThreshold = pnlPercent < -0.1;

  // 3. 检查是否为极端亏损（超过阈值的1.5倍）
  conditions.extremeLoss = pnlPercent <= threshold * 1.5;

  // 4. 检查是否为快速下跌
  // 从监控历史中获取最近的检查记录
  const history = positionMonitorHistory.get(symbol);
  if (history) {
    const timeSinceLastCheck = Date.now() - history.lastCheckTime;
    // 如果在1分钟内（60秒）亏损达到阈值，视为快速下跌
    conditions.rapidDecline =
      timeSinceLastCheck < 60000 &&
      conditions.priceThreshold &&
      conditions.minLossThreshold;
  }

  // 根据优先级判断是否触发止损
  let shouldTrigger = false;
  let reason = "";
  let priority = 5;

  // Priority 1: 极端亏损
  if (conditions.extremeLoss && conditions.minLossThreshold) {
    shouldTrigger = true;
    reason = `极端亏损: 当前亏损 ${pnlPercent.toFixed(
      2
    )}% 超过阈值 ${threshold.toFixed(2)}% 的1.5倍`;
    priority = 1;
    logger.warn({
      action: "extreme_loss_detected",
      symbol,
      pnlPercent,
      threshold,
      message: reason,
    });
  }
  // Priority 2: 快速下跌
  else if (conditions.rapidDecline) {
    shouldTrigger = true;
    reason = `快速下跌: 短时间内亏损达到 ${pnlPercent.toFixed(2)}%`;
    priority = 2;
    logger.warn({
      action: "rapid_decline_detected",
      symbol,
      pnlPercent,
      threshold,
      message: reason,
    });
  }
  // Priority 3: 标准触发
  else if (conditions.priceThreshold && conditions.minLossThreshold) {
    shouldTrigger = true;
    reason = `标准止损: 亏损 ${pnlPercent.toFixed(
      2
    )}% 达到阈值 ${threshold.toFixed(2)}%`;
    priority = 3;
  }

  // 记录详细的触发条件评估
  logger.debug({
    action: "stop_loss_trigger_evaluation",
    symbol,
    pnlPercent,
    threshold,
    conditions,
    shouldTrigger,
    reason,
    priority,
  });

  return {
    shouldTrigger,
    reason,
    priority,
    conditions,
  };
}

/**
 * 修复止损交易记录
 * 如果价格为0或盈亏不正确，从开仓记录重新计算
 */
async function fixStopLossTradeRecord(symbol: string): Promise<void> {
  const exchangeClient = createExchangeClient();

  try {
    // 查找最近的平仓记录
    const closeResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'close' ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol],
    });

    if (!closeResult.rows || closeResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 的平仓记录`);
      return;
    }

    const closeTrade = closeResult.rows[0];
    const id = closeTrade.id;
    const side = closeTrade.side as string;
    let closePrice = Number.parseFloat(closeTrade.price as string);
    const quantity = Number.parseFloat(closeTrade.quantity as string);
    const recordedPnl = Number.parseFloat((closeTrade.pnl as string) || "0");
    const recordedFee = Number.parseFloat((closeTrade.fee as string) || "0");
    const timestamp = closeTrade.timestamp as string;

    // 查找对应的开仓记录
    const openResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'open' AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol, timestamp],
    });

    if (!openResult.rows || openResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 对应的开仓记录，无法修复`);
      return;
    }

    const openTrade = openResult.rows[0];
    const openPrice = Number.parseFloat(openTrade.price as string);

    // 如果平仓价格为0或无效，尝试获取当前价格作为近似值
    if (closePrice === 0 || !Number.isFinite(closePrice)) {
      try {
        const contract = `${symbol}_USDT`;
        const ticker = await exchangeClient.getFuturesTicker(contract);
        closePrice = Number.parseFloat(ticker.last || ticker.markPrice || "0");

        if (closePrice > 0) {
          logger.info(
            `使用当前ticker价格修复 ${symbol} 平仓价格: ${closePrice}`
          );
        } else {
          logger.error(`无法获取有效价格修复 ${symbol} 交易记录`);
          return;
        }
      } catch (error: any) {
        logger.error(`获取${symbol} ticker价格失败: ${error.message}`);
        return;
      }
    }

    // 获取合约乘数
    const contract = `${symbol}_USDT`;
    const quantoMultiplier = await getQuantoMultiplier(contract);

    // 重新计算正确的盈亏
    const priceChange =
      side === "long" ? closePrice - openPrice : openPrice - closePrice;

    const grossPnl = priceChange * quantity * quantoMultiplier;
    const openFee = openPrice * quantity * quantoMultiplier * 0.0005;
    const closeFee = closePrice * quantity * quantoMultiplier * 0.0005;
    const totalFee = openFee + closeFee;
    const correctPnl = grossPnl - totalFee;

    // 计算差异
    const priceDiff = Math.abs(
      Number.parseFloat(closeTrade.price as string) - closePrice
    );
    const pnlDiff = Math.abs(recordedPnl - correctPnl);
    const feeDiff = Math.abs(recordedFee - totalFee);

    // 如果需要修复（价格为0或差异大于阈值）
    if (priceDiff > 0.01 || pnlDiff > 0.5 || feeDiff > 0.1) {
      logger.warn(`【修复止损交易记录】${symbol} ${side}`);
      logger.warn(`  开仓价: ${openPrice.toFixed(4)}`);
      logger.warn(
        `  平仓价: ${Number.parseFloat(closeTrade.price as string).toFixed(
          4
        )} → ${closePrice.toFixed(4)}`
      );
      logger.warn(
        `  盈亏: ${recordedPnl.toFixed(2)} → ${correctPnl.toFixed(
          2
        )} USDT (差异: ${pnlDiff.toFixed(2)})`
      );
      logger.warn(
        `  手续费: ${recordedFee.toFixed(4)} → ${totalFee.toFixed(4)} USDT`
      );

      // 更新数据库
      await dbClient.execute({
        sql: `UPDATE trades SET price = ?, pnl = ?, fee = ? WHERE id = ?`,
        args: [closePrice, correctPnl, totalFee, id],
      });

      logger.info(`【修复完成】${symbol} 止损交易记录已修复`);
    } else {
      logger.debug(`${symbol} 止损交易记录正确，无需修复`);
    }
  } catch (error: any) {
    logger.error(`修复 ${symbol} 止损交易记录失败: ${error.message}`);
    throw error;
  }
}

/**
 * 执行止损平仓
 */
async function executeStopLossClose(
  symbol: string,
  side: string,
  quantity: number,
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  pnlPercent: number,
  stopLossThreshold: number,
  riskLevel: string
): Promise<boolean> {
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;

  try {
    const size = side === "long" ? -quantity : quantity;

    logger.error(`【触发止损 ${riskLevel}】${symbol} ${side}`);
    logger.error(`  当前亏损: ${pnlPercent.toFixed(2)}%`);
    logger.error(`  止损线: ${stopLossThreshold.toFixed(2)}%`);
    logger.error(`  杠杆倍数: ${leverage}x`);

    // 1. 执行平仓订单
    const order = await exchangeClient.placeOrder({
      contract,
      size,
      price: 0,
      reduceOnly: true,
    });

    logger.info(`已下达止损平仓订单 ${symbol}，订单ID: ${order.id}`);

    // 2. 等待订单完成并获取成交信息
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let actualExitPrice = 0;
    let actualQuantity = quantity;
    let pnl = 0;
    let totalFee = 0;
    let orderFilled = false;

    // 尝试从订单获取成交信息
    if (order.id) {
      for (let retry = 0; retry < 5; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          const orderStatus = await exchangeClient.getOrder(
            order.id?.toString() || ""
          );

          if (orderStatus.status === "finished") {
            const fillPrice = Number.parseFloat(
              orderStatus.fill_price || orderStatus.price || "0"
            );
            actualQuantity = Math.abs(
              Number.parseFloat(orderStatus.size || "0")
            );

            if (fillPrice > 0) {
              actualExitPrice = fillPrice;
              orderFilled = true;
              logger.info(`从订单获取成交价格: ${actualExitPrice}`);
              break;
            }
          }
        } catch (statusError: any) {
          logger.warn(
            `查询止损订单状态失败 (重试${retry + 1}/5): ${statusError.message}`
          );
        }
      }
    }

    // 如果未能从订单获取价格，使用ticker价格
    if (actualExitPrice === 0) {
      try {
        const ticker = await exchangeClient.getFuturesTicker(contract);
        actualExitPrice = Number.parseFloat(
          ticker.last || ticker.markPrice || "0"
        );

        if (actualExitPrice > 0) {
          logger.warn(`未能从订单获取价格，使用ticker价格: ${actualExitPrice}`);
        } else {
          // 最后备用：使用传入的currentPrice
          actualExitPrice = currentPrice;
          logger.warn(
            `ticker价格也无效，使用传入的currentPrice: ${actualExitPrice}`
          );
        }
      } catch (tickerError: any) {
        logger.error(
          `获取ticker价格失败: ${tickerError.message}，使用传入的currentPrice: ${currentPrice}`
        );
        actualExitPrice = currentPrice;
      }
    }

    // 计算盈亏（无论是否成功获取订单状态）
    if (actualExitPrice > 0) {
      try {
        // 获取合约乘数
        const quantoMultiplier = await getQuantoMultiplier(contract);

        // 计算盈亏
        const priceChange =
          side === "long"
            ? actualExitPrice - entryPrice
            : entryPrice - actualExitPrice;

        const grossPnl = priceChange * actualQuantity * quantoMultiplier;

        // 计算手续费（开仓 + 平仓）
        const openFee = entryPrice * actualQuantity * quantoMultiplier * 0.0005;
        const closeFee =
          actualExitPrice * actualQuantity * quantoMultiplier * 0.0005;
        totalFee = openFee + closeFee;

        // 净盈亏
        pnl = grossPnl - totalFee;

        logger.info(
          `止损平仓成交: 价格=${actualExitPrice.toFixed(
            2
          )}, 数量=${actualQuantity}, 盈亏=${pnl.toFixed(2)} USDT`
        );
      } catch (calcError: any) {
        logger.error(`计算盈亏失败: ${calcError.message}`);
      }
    } else {
      logger.error(`无法获取有效的平仓价格，将记录为0，稍后由修复工具修复`);
    }

    // 3. 记录到trades表（使用事务确保数据一致性）
    await dbClient.execute("BEGIN TRANSACTION");
    try {
      const insertResult = await dbClient.execute({
        sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id?.toString() || "",
          symbol,
          side,
          "close",
          actualExitPrice,
          actualQuantity,
          leverage,
          pnl,
          totalFee,
          getChinaTimeISO(),
          orderFilled ? "filled" : "pending",
        ],
      });

      // 3.1 立即调用修复工具修复这条交易记录
      try {
        logger.info(`正在验证和修复 ${symbol} 的止损交易记录...`);
        await fixStopLossTradeRecord(symbol);
      } catch (fixError: any) {
        logger.warn(
          `修复止损交易记录失败: ${fixError.message}，将在下次周期自动修复`
        );
      }

      // 4. 记录平仓决策到agent_decisions表（使用recordClosingDecision）
      try {
        // 根据riskLevel确定触发类型
        const triggerType =
          riskLevel === "追踪止损"
            ? ClosingTriggerType.TRAILING_STOP
            : ClosingTriggerType.DYNAMIC_STOP_LOSS;

        await recordClosingDecision(
          {
            symbol,
            side: side as "long" | "short",
            triggerType,
            level: riskLevel,
            entryPrice,
            currentPrice,
            closePrice: actualExitPrice,
            leverage,
            pnlPercent,
            triggerThreshold: stopLossThreshold,
            currentValue: pnlPercent,
            closePercent: 100,
            closeQuantity: actualQuantity,
            totalQuantity: quantity,
            pnl,
            fee: totalFee,
            description: `${riskLevel}触发`,
          },
          iterationCount
        );
        logger.info(
          `${riskLevel}平仓决策已通过recordClosingDecision记录到数据库 ${symbol}`
        );
      } catch (recordError: any) {
        logger.warn(
          `记录${riskLevel}平仓决策失败: ${recordError.message}，将使用备用记录方式`
        );
      }

      // 5. 记录决策信息到agent_decisions表（备用方式）
      const decisionText = `【止损触发 - ${riskLevel}】${symbol} ${
        side === "long" ? "做多" : "做空"
      }
风险等级: ${riskLevel}
杠杆倍数: ${leverage}x
当前亏损: ${pnlPercent.toFixed(2)}%
止损线: ${stopLossThreshold.toFixed(2)}%
平仓价格: ${actualExitPrice.toFixed(2)}
平仓盈亏: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT

触发条件: 亏损达到${pnlPercent.toFixed(
        2
      )}%，超过${riskLevel}止损线${stopLossThreshold.toFixed(2)}%`;

      await dbClient.execute({
        sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          getChinaTimeISO(),
          iterationCount,
          JSON.stringify({
            trigger: "stop_loss",
            symbol,
            pnlPercent,
            stopLossThreshold,
            riskLevel,
          }),
          decisionText,
          JSON.stringify([
            { action: "close_position", symbol, reason: "stop_loss" },
          ]),
          0,
          0,
        ],
      });

      // 6. 从数据库删除持仓记录
      await dbClient.execute({
        sql: "DELETE FROM positions WHERE symbol = ?",
        args: [symbol],
      });

      await dbClient.execute("COMMIT");
    } catch (error) {
      await dbClient.execute("ROLLBACK");
      throw error;
    }

    logger.info(
      `止损平仓完成 ${symbol}，盈亏：${pnl >= 0 ? "+" : ""}${pnl.toFixed(
        2
      )} USDT`
    );

    // 7. 从内存中清除记录
    positionMonitorHistory.delete(symbol);

    // 8. 清除追踪止损状态
    clearTrailingStopState(symbol);

    return true;
  } catch (error: any) {
    logger.error(`止损平仓失败 ${symbol}: ${error.message}`);
    return false;
  }
}

/**
 * 检查所有持仓的止损条件
 */
async function checkStopLoss() {
  if (!isRunning) {
    return;
  }

  try {
    const exchangeClient = createExchangeClient();

    // 1. 获取所有持仓
    const gatePositions = await exchangeClient.getPositions();
    const activePositions = gatePositions.filter(
      (p: any) => Number.parseInt(p.size || "0") !== 0
    );

    if (activePositions.length === 0) {
      // 清空内存记录
      positionMonitorHistory.clear();
      // 清空追踪止损状态
      trailingStopStates.clear();
      return;
    }

    // 2. 从数据库获取持仓信息（获取加权平均成本）
    const dbResult = await dbClient.execute(
      "SELECT symbol, average_entry_price, entry_price FROM positions"
    );
    const dbInfoMap = new Map(
      dbResult.rows.map((row: any) => [
        row.symbol,
        {
          averageEntryPrice: row.average_entry_price || row.entry_price || 0,
        },
      ])
    );

    const now = Date.now();
    let shouldWakeAgent = false; // 标志位：是否需要唤醒Agent

    // 3. 检查每个持仓
    for (const pos of activePositions) {
      const size = Number.parseInt(pos.size || "0");
      const symbol = pos.contract.replace("_USDT", "");
      const side = size > 0 ? "long" : "short";
      const quantity = Math.abs(size);

      // 优先使用数据库中的加权平均成本，如果没有则使用交易所的开仓价
      const dbInfo = dbInfoMap.get(symbol);
      const exchangeEntryPrice = Number.parseFloat(pos.entryPrice || "0");
      const entryPrice = dbInfo?.averageEntryPrice || exchangeEntryPrice;

      const currentPrice = Number.parseFloat(pos.markPrice || "0");
      const leverage = Number.parseInt(pos.leverage || "1");

      // 验证数据有效性
      if (entryPrice === 0 || currentPrice === 0 || leverage === 0) {
        logger.warn(`${symbol} 数据无效，跳过止损检查`);
        continue;
      }

      // 计算盈亏百分比（考虑杠杆）
      const pnlPercent = calculatePnlPercent(
        entryPrice,
        currentPrice,
        side,
        leverage
      );

      // ==================== 追踪止损逻辑 ====================
      // 1. 更新追踪止损状态（仅盈利仓位）
      if (pnlPercent > 0) {
        updateTrailingStop(symbol, currentPrice, entryPrice, side, leverage);
      }

      // 2. 检查是否触发追踪止损
      const trailingStopResult = checkTrailingStopTrigger(
        symbol,
        currentPrice,
        side
      );

      if (trailingStopResult.triggered) {
        logger.error(`${symbol} 触发追踪止损:`);
        logger.error(`  持仓方向: ${side === "long" ? "做多" : "做空"}`);
        logger.error(`  杠杆倍数: ${leverage}x`);
        logger.error(`  当前盈亏: ${pnlPercent.toFixed(2)}%`);
        logger.error(`  峰值价格: ${trailingStopResult.peakPrice?.toFixed(2)}`);
        logger.error(
          `  追踪止损价格: ${trailingStopResult.trailingStopPrice?.toFixed(2)}`
        );
        logger.error(
          `  价格回撤: ${trailingStopResult.retracement?.toFixed(2)}%`
        );
        logger.error(`  触发原因: ${trailingStopResult.reason}`);

        // 设置标志位，需要唤醒Agent
        shouldWakeAgent = true;

        // 执行追踪止损平仓
        const closeSuccess = await executeStopLossClose(
          symbol,
          side,
          quantity,
          entryPrice,
          currentPrice,
          leverage,
          pnlPercent,
          0, // 追踪止损没有阈值
          "追踪止损"
        );

        if (closeSuccess) {
          // 清除追踪止损状态
          clearTrailingStopState(symbol);

          // 记录追踪止损决策到数据库
          try {
            await dbClient.execute({
              sql: `INSERT INTO stop_loss_decisions 
								(timestamp, symbol, position_id, entry_price, current_price, pnl_percent, 
								leverage, base_threshold, dynamic_threshold, dynamic_factors, decision, reason)
								VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                getChinaTimeISO(),
                symbol,
                `${symbol}_${Date.now()}`,
                entryPrice,
                currentPrice,
                pnlPercent,
                leverage,
                0, // 追踪止损没有基础阈值
                0, // 追踪止损没有动态阈值
                JSON.stringify({
                  type: "trailing_stop",
                  peakPrice: trailingStopResult.peakPrice,
                  trailingStopPrice: trailingStopResult.trailingStopPrice,
                  retracement: trailingStopResult.retracement,
                }),
                "close",
                trailingStopResult.reason || "追踪止损触发",
              ],
            });
          } catch (dbError) {
            logger.error({
              action: "save_trailing_stop_decision_failed",
              symbol,
              error: (dbError as Error).message,
            });
          }
        }

        continue; // 已平仓，跳过后续检查
      }
      // ==================== 追踪止损逻辑结束 ====================

      // 获取或初始化监控历史记录
      let history = positionMonitorHistory.get(symbol);
      if (!history) {
        history = {
          lastCheckTime: now,
          checkCount: 0,
        };
        positionMonitorHistory.set(symbol, history);
        logger.info(
          `${symbol} 开始监控止损，当前盈亏: ${pnlPercent.toFixed(2)}%`
        );
      }

      // 增加检查次数
      history.checkCount++;
      history.lastCheckTime = now;

      // 3. 检查止损条件
      // 根据杠杆倍数和币种确定止损阈值（支持动态止损）
      const thresholdInfo = await getStopLossThreshold(leverage, symbol);

      // 检查止损线合理性，防止异常值
      if (thresholdInfo.threshold >= 0) {
        logger.warn(
          `${symbol} 止损线配置异常: ${thresholdInfo.threshold.toFixed(
            2
          )}%，使用默认值 -8%`
        );
        thresholdInfo.threshold = -8;
        thresholdInfo.description = `异常修复: 13倍以上杠杆，亏损 -8% 时止损`;
      }

      // 检查是否触发止损（亏损达到或超过止损线，且亏损幅度大于0.1%以避免微小波动）
      // 多维度止损触发条件判断
      const stopLossTrigger = evaluateStopLossTrigger({
        symbol,
        pnlPercent,
        threshold: thresholdInfo.threshold,
        currentPrice,
        entryPrice,
        side,
        leverage,
      });

      if (stopLossTrigger.shouldTrigger) {
        logger.error(`${symbol} 触发止损条件:`);
        logger.error(
          `  风险等级: ${thresholdInfo.level} - ${thresholdInfo.description}`
        );
        logger.error(`  杠杆倍数: ${leverage}x`);
        logger.error(`  当前亏损: ${pnlPercent.toFixed(2)}%`);
        logger.error(`  止损线: ${thresholdInfo.threshold.toFixed(2)}%`);
        logger.error(`  触发原因: ${stopLossTrigger.reason}`);
        logger.error(`  触发优先级: ${stopLossTrigger.priority}`);

        // 记录触发条件详情
        logger.debug({
          action: "stop_loss_trigger_evaluation",
          symbol,
          conditions: stopLossTrigger.conditions,
          priority: stopLossTrigger.priority,
          reason: stopLossTrigger.reason,
        });

        // 设置标志位，需要唤醒Agent
        shouldWakeAgent = true;

        // 使用AI判断是否为偶发性波动（带超时和错误处理）
        let shouldStopLoss = true;
        let aiJudgment = "未启用AI判断";
        let aiJudgmentResult: any = null;
        const aiJudgmentStartTime = Date.now();

        try {
          // 初始化AI判断器（如果尚未初始化）
          if (!aiStopLossJudger) {
            logger.info({
              action: "ai_judgment_init_start",
              symbol,
              message: "开始初始化AI止损判断器",
            });
            aiStopLossJudger = new AIStopLossJudger();
            await aiStopLossJudger.initialize();
            logger.info({
              action: "ai_judgment_init_success",
              symbol,
              message: "AI止损判断器初始化成功",
            });
          }

          // 记录AI判断开始
          logger.info({
            action: "ai_judgment_start",
            symbol,
            pnlPercent,
            leverage,
            stopLossThreshold: thresholdInfo.threshold,
            message: "开始AI止损判断",
          });

          // 使用AI判断当前市场情况（带5秒超时）
          const judgment = await Promise.race([
            aiStopLossJudger.judgeStopLoss(
              pos.id || `${symbol}_${Date.now()}`,
              symbol,
              pnlPercent,
              leverage
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("AI判断超时")), 5000)
            ),
          ]);

          const aiJudgmentDuration = Date.now() - aiJudgmentStartTime;
          aiJudgmentResult = judgment;

          // 记录AI判断完成
          logger.info({
            action: "ai_judgment_complete",
            symbol,
            duration: aiJudgmentDuration,
            recommendedAction: judgment.recommendedAction,
            volatilityType: judgment.volatilityType,
            confidence: judgment.confidence,
            reason: judgment.reason,
            message: "AI止损判断完成",
          });

          // 根据AI判断结果决定是否执行止损
          if (
            judgment.recommendedAction === "hold_position" &&
            judgment.confidence >= 0.7
          ) {
            shouldStopLoss = false;
            aiJudgment = `AI建议继续持仓(${
              judgment.volatilityType
            }, 信心度: ${judgment.confidence.toFixed(2)})`;
            logger.info({
              action: "ai_judgment_hold",
              symbol,
              volatilityType: judgment.volatilityType,
              confidence: judgment.confidence,
              message: "AI判断为偶发性波动，不执行止损",
            });
          } else if (judgment.recommendedAction === "reduce_position") {
            // 减少仓位的情况，暂时执行止损，但记录AI建议
            aiJudgment = `AI建议减少仓位(${
              judgment.volatilityType
            }, 信心度: ${judgment.confidence.toFixed(2)})`;
            logger.warn({
              action: "ai_judgment_reduce",
              symbol,
              volatilityType: judgment.volatilityType,
              confidence: judgment.confidence,
              message: "AI建议减少仓位，执行止损",
            });
          } else {
            aiJudgment = `AI建议平仓(${
              judgment.volatilityType
            }, 信心度: ${judgment.confidence.toFixed(2)})`;
            logger.error({
              action: "ai_judgment_close",
              symbol,
              volatilityType: judgment.volatilityType,
              confidence: judgment.confidence,
              message: "AI建议平仓，执行止损",
            });
          }
        } catch (error: any) {
          const aiJudgmentDuration = Date.now() - aiJudgmentStartTime;

          // 区分不同类型的错误
          if (error.message === "AI判断超时") {
            // 超时错误
            logger.error({
              action: "ai_judgment_timeout",
              symbol,
              duration: aiJudgmentDuration,
              timeout: 5000,
              message: "AI判断超时，使用传统止损逻辑",
              error: error.message,
            });
            aiJudgment = "AI判断超时，使用传统止损";
          } else if (
            error.message?.includes("API") ||
            error.message?.includes("网络")
          ) {
            // API或网络错误
            logger.error({
              action: "ai_judgment_api_error",
              symbol,
              duration: aiJudgmentDuration,
              message: "AI判断API错误，使用传统止损逻辑",
              error: error.message,
              stack: error.stack,
            });
            aiJudgment = "AI判断API错误，使用传统止损";
          } else {
            // 其他错误
            logger.error({
              action: "ai_judgment_error",
              symbol,
              duration: aiJudgmentDuration,
              message: "AI判断失败，使用传统止损逻辑",
              error: error.message,
              stack: error.stack,
            });
            aiJudgment = `AI判断失败: ${error.message}`;
          }

          // AI判断失败时，默认执行止损（安全优先）
          shouldStopLoss = true;
        }

        // 记录止损决策到数据库
        try {
          await dbClient.execute({
            sql: `INSERT INTO stop_loss_decisions 
							(timestamp, symbol, position_id, entry_price, current_price, pnl_percent, leverage, 
							 base_threshold, dynamic_threshold, dynamic_factors, decision, ai_judgment, reason)
							VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              getChinaTimeISO(),
              symbol,
              pos.id || `${symbol}_${Date.now()}`,
              entryPrice,
              currentPrice,
              pnlPercent,
              leverage,
              thresholdInfo.threshold,
              thresholdInfo.threshold, // 当前未使用动态阈值，使用相同值
              JSON.stringify({
                triggerPriority: stopLossTrigger.priority,
                triggerConditions: stopLossTrigger.conditions,
              }),
              shouldStopLoss ? "close" : "hold",
              aiJudgmentResult ? JSON.stringify(aiJudgmentResult) : null,
              `${stopLossTrigger.reason} | ${aiJudgment}`,
            ],
          });

          logger.debug({
            action: "stop_loss_decision_recorded",
            symbol,
            decision: shouldStopLoss ? "close" : "hold",
            message: "止损决策已记录到数据库",
          });
        } catch (dbError: any) {
          logger.warn({
            action: "stop_loss_decision_record_failed",
            symbol,
            message: "记录止损决策到数据库失败",
            error: dbError.message,
          });
          // 数据库记录失败不影响止损执行
        }

        // 根据AI判断结果决定是否执行止损
        if (shouldStopLoss) {
          // 执行止损平仓
          const success = await executeStopLossClose(
            symbol,
            side,
            quantity,
            entryPrice,
            currentPrice,
            leverage,
            pnlPercent,
            thresholdInfo.threshold,
            `${thresholdInfo.level} - ${thresholdInfo.description} (AI确认: ${aiJudgment})`
          );

          if (success) {
            logger.info({
              action: "stop_loss_executed",
              symbol,
              aiJudgment,
              message: "止损平仓成功",
            });
          }
        } else {
          logger.info({
            action: "stop_loss_skipped",
            symbol,
            aiJudgment,
            message: "AI判断为偶发性波动，暂不执行止损",
          });
        }
      } else {
        // 每10次检查输出一次调试日志
        if (history.checkCount % 10 === 0) {
          logger.debug(
            `${symbol} ${
              thresholdInfo.level
            } 监控中: ${leverage}x杠杆, 当前${pnlPercent.toFixed(
              2
            )}%, 止损线${thresholdInfo.threshold.toFixed(2)}%`
          );
        }
      }
    }

    // 4. 清理已平仓的记录
    const activeSymbols = new Set(
      activePositions.map((p: any) => p.contract.replace("_USDT", ""))
    );

    for (const symbol of positionMonitorHistory.keys()) {
      if (!activeSymbols.has(symbol)) {
        positionMonitorHistory.delete(symbol);
        logger.debug(`清理已平仓的记录: ${symbol}`);
      }
    }

    // 5. 根据标志位决定是否唤醒Agent
    // 无论有多少个货币触发止损，都只会唤醒一次Agent
    if (shouldWakeAgent && getTradingStrategy() === "cai-sen") {
      logger.error(`有持仓触发动态止损阈值，立即唤醒蔡森Agent进行决策`);
      try {
        await executeTradingDecision();
        logger.info(`已成功唤醒蔡森Agent进行决策`);
      } catch (error: any) {
        logger.error(`唤醒蔡森Agent失败: ${error.message}`);
      }
    }
  } catch (error: any) {
    logger.error(`止损检查失败: ${error.message}`);
  }
}

/**
 * 启动止损监控（仅限波段策略）
 */
export async function startStopLossMonitor() {
  // 检查当前策略是否启用代码级止损
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy, RISK_PARAMS.MAX_LEVERAGE);

  if (!isStopLossEnabled()) {
    logger.info(
      `当前策略 [${params.name}] 未启用代码级止损监控（enableCodeLevelProtection = false）`
    );
    return;
  }

  if (isRunning) {
    logger.warn("止损监控已在运行中");
    return;
  }

  const stopLossConfig = getStopLossConfig();
  if (!stopLossConfig) {
    logger.error(`策略 [${params.name}] 的止损配置缺失`);
    return;
  }

  isRunning = true;
  logger.info(`启动止损监控（自动止损系统 - ${params.name}策略）`);
  logger.info(`  当前策略: ${strategy} (${params.name})`);
  logger.info("  检查间隔: 10秒");
  logger.info("  AI判断: 已启用，用于区分偶发性波动和行情异常");

  // 输出止损规则
  logger.info(`  低风险: ${stopLossConfig.lowRisk.description}`);
  logger.info(`  中风险: ${stopLossConfig.mediumRisk.description}`);
  logger.info(`  高风险: ${stopLossConfig.highRisk.description}`);

  // 初始化动态止损系统（如果启用）
  const enableDynamicStopLoss = process.env.ENABLE_DYNAMIC_STOP_LOSS === "true";
  if (enableDynamicStopLoss) {
    try {
      logger.info("正在初始化动态止损优化系统...");
      const { initializeDynamicStopLossSystem } = await import(
        "../utils/dynamicStopLoss"
      );
      await initializeDynamicStopLossSystem();
      logger.info("动态止损优化系统初始化成功");
      logger.info("  - 指标计算器: 已就绪");
      logger.info("  - 动态阈值计算: 已启用");
      logger.info("  - 蔡森策略整合: 已启用");
      logger.info("  - 数据库集成: 已就绪");
      logger.info("  - 缓存管理: 已启用");
    } catch (error) {
      logger.error({
        action: "dynamic_stop_loss_init_failed",
        error: (error as Error).message,
        stack: (error as Error).stack,
        message: "动态止损系统初始化失败，将使用传统止损逻辑",
      });
      // 初始化失败不影响传统止损逻辑的运行
    }
  } else {
    logger.info(
      "动态止损优化系统未启用（设置 ENABLE_DYNAMIC_STOP_LOSS=true 启用）"
    );
  }

  // 立即执行一次
  checkStopLoss();

  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkStopLoss();
  }, 10 * 1000);
}

/**
 * 停止止损监控
 */
export async function stopStopLossMonitor() {
  if (!isRunning) {
    logger.warn("止损监控未在运行");
    return;
  }

  isRunning = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  // 清理AI判断器
  if (aiStopLossJudger) {
    aiStopLossJudger = null;
  }

  // 关闭动态止损系统（如果已初始化）
  try {
    const { isSystemInitialized, shutdownDynamicStopLossSystem } = await import(
      "../utils/dynamicStopLoss"
    );
    if (isSystemInitialized()) {
      logger.info("正在关闭动态止损优化系统...");
      shutdownDynamicStopLossSystem();
      logger.info("动态止损优化系统已关闭");
    }
  } catch (error) {
    logger.warn({
      action: "dynamic_stop_loss_shutdown_failed",
      error: (error as Error).message,
      message: "关闭动态止损系统时发生错误",
    });
    // 关闭失败不影响监控器的停止
  }

  positionMonitorHistory.clear();
  trailingStopStates.clear();
  logger.info("止损监控已停止");
}
