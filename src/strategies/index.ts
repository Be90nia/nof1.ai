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
 * 策略模块统一导出
 *
 * 本模块提供了系统所有交易策略的统一入口，包括：
 * - 类型定义导出
 * - 各个策略实现导出
 * - 策略选择逻辑
 * - 提示词生成逻辑
 *
 * 使用方式：
 * ```typescript
 * import { getStrategyParams, generateStrategySpecificPrompt } from "./strategies";
 *
 * const params = getStrategyParams("aggressive", 25);  // 获取激进策略参数（最大杠杆25倍）
 * const prompt = generateStrategySpecificPrompt("aggressive", params, context);  // 生成AI提示词
 * ```
 */

// ==================== 类型定义导出 ====================
export type {
  TradingStrategy,
  StrategyParams,
  StrategyPromptContext,
} from "./types";
// ==================== 各策略实现导出 ====================
export { getUltraShortStrategy, generateUltraShortPrompt } from "./ultraShort"; // 超短线策略
export { getSwingTrendStrategy, generateSwingTrendPrompt } from "./swingTrend"; // 波段趋势策略
export { getMediumLongStrategy, generateMediumLongPrompt } from "./mediumLong"; // 中长线策略
export {
  getConservativeStrategy,
  generateConservativePrompt,
} from "./conservative"; // 稳健策略
export { getBalancedStrategy, generateBalancedPrompt } from "./balanced"; // 平衡策略
export { getAggressiveStrategy, generateAggressivePrompt } from "./aggressive"; // 激进策略
export {
  getAggressiveTeamStrategy,
  generateAggressiveTeamPrompt,
} from "./aggressiveTeam"; // 激进团策略
export {
  getRebateFarmingStrategy,
  generateRebateFarmingPrompt,
} from "./rebateFarming"; // 返佣套利策略
export {
  getAiAutonomousStrategy,
  generateAiAutonomousPrompt,
} from "./aiAutonomous"; // AI自主策略
export {
  getMultiAgentConsensusStrategy,
  generateMultiAgentConsensusPrompt,
} from "./multiAgentConsensus"; // 多Agent共识策略
export { getAlphaBetaStrategy, generateAlphaBetaPrompt } from "./alphaBeta"; // Alpha Beta策略
export { getCaiSenStrategy, generateCaiSenPrompt } from "../caisen"; // 蔡森策略

import { generateCaiSenPrompt, getCaiSenStrategy } from "../caisen";
import { generateAggressivePrompt, getAggressiveStrategy } from "./aggressive";
import {
  generateAggressiveTeamPrompt,
  getAggressiveTeamStrategy,
} from "./aggressiveTeam";
import {
  generateAiAutonomousPrompt,
  getAiAutonomousStrategy,
} from "./aiAutonomous";
import { generateAlphaBetaPrompt, getAlphaBetaStrategy } from "./alphaBeta";
import { generateBalancedPrompt, getBalancedStrategy } from "./balanced";
import {
  generateConservativePrompt,
  getConservativeStrategy,
} from "./conservative";
import { generateMediumLongPrompt, getMediumLongStrategy } from "./mediumLong";
import {
  generateMultiAgentConsensusPrompt,
  getMultiAgentConsensusStrategy,
} from "./multiAgentConsensus";
import {
  generateRebateFarmingPrompt,
  getRebateFarmingStrategy,
} from "./rebateFarming";
import { generateSwingTrendPrompt, getSwingTrendStrategy } from "./swingTrend";
import type {
  StrategyParams,
  StrategyPromptContext,
  TradingStrategy,
} from "./types";
import { createClient } from "@libsql/client";
import { getAgentStrategyParams as getAgentStrategyParamsFromTools } from "../tools/strategyParams";
// 重新导出统一的getAgentStrategyParams函数
export { getAgentStrategyParamsFromTools as getAgentStrategyParams };
import { generateUltraShortPrompt, getUltraShortStrategy } from "./ultraShort";

/**
 * 获取策略参数（基于 MAX_LEVERAGE 动态计算）
 *
 * 根据策略类型和系统最大杠杆，动态计算策略的完整参数配置。
 * 各策略的杠杆范围会根据 maxLeverage 按比例调整。
 *
 * @param strategy - 策略类型（"ultra-short" | "swing-trend" | "conservative" | "balanced" | "aggressive"）
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取，如 MAX_LEVERAGE=25）
 * @returns 策略的完整参数配置（包含杠杆、仓位、止损止盈等所有参数）
 *
 * @example
 * ```typescript
 * // 获取激进策略参数（系统最大杠杆25倍）
 * const params = getStrategyParams("aggressive", 25);
 * console.log(params.leverageMin);  // 22（85% * 25）
 * console.log(params.leverageMax);  // 25（100% * 25）
 * ```
 */
export function getStrategyParams(
  strategy: TradingStrategy,
  maxLeverage: number
): StrategyParams {
  switch (strategy) {
    case "ultra-short":
      return getUltraShortStrategy(maxLeverage);
    case "swing-trend":
      return getSwingTrendStrategy(maxLeverage);
    case "medium-long":
      return getMediumLongStrategy(maxLeverage);
    case "conservative":
      return getConservativeStrategy(maxLeverage);
    case "balanced":
      return getBalancedStrategy(maxLeverage);
    case "aggressive":
      return getAggressiveStrategy(maxLeverage);
    case "aggressive-team":
      return getAggressiveTeamStrategy(maxLeverage);
    case "rebate-farming":
      return getRebateFarmingStrategy(maxLeverage);
    case "ai-autonomous":
      return getAiAutonomousStrategy(maxLeverage);
    case "multi-agent-consensus":
      return getMultiAgentConsensusStrategy(maxLeverage);
    case "alpha-beta":
      return getAlphaBetaStrategy(maxLeverage);
    case "cai-sen":
      return getCaiSenStrategy(maxLeverage);
    default:
      return getAiAutonomousStrategy(maxLeverage);
  }
}

/**
 * 从数据库读取Agent动态设置的策略参数
 *
 * @param strategy - 策略类型
 * @returns Promise<Record<string, any>> - Agent设置的参数对象
 */

/**
 * 设置Agent动态策略参数
 *
 * @param strategy - 策略类型
 * @param params - 要设置的参数对象
 * @returns Promise<boolean> - 设置是否成功
 */
export async function setAgentStrategyParams(
  strategy: TradingStrategy,
  params: Record<string, any>
): Promise<boolean> {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    const client = createClient({
      url: dbUrl,
    });

    // 开始事务
    await client.execute("BEGIN TRANSACTION");

    // 删除旧的参数
    await client.execute({
      sql: "DELETE FROM strategy_params WHERE strategy = ?",
      args: [strategy],
    });

    // 插入新的参数
    for (const [key, value] of Object.entries(params)) {
      await client.execute({
        sql: `INSERT INTO strategy_params (key, value, strategy, updated_at) 
				VALUES (?, ?, ?, ?)`,
        args: [key, JSON.stringify(value), strategy, new Date().toISOString()],
      });
    }

    // 提交事务
    await client.execute("COMMIT");
    client.close();
    return true;
  } catch (error) {
    console.error("设置Agent策略参数失败:", error);
    return false;
  }
}

/**
 * 根据策略类型生成特有提示词
 *
 * 为AI生成特定策略的决策提示词。不同策略有不同的交易理念和规则，
 * 生成的提示词会指导AI按照对应策略的原则进行交易决策。
 *
 * @param strategy - 策略类型（"ultra-short" | "swing-trend" | "conservative" | "balanced" | "aggressive"）
 * @param params - 策略参数配置（从 getStrategyParams 获得）
 * @param context - 运行时上下文（包含执行周期、持仓数量、止损阈值等）
 * @param data - 可选，额外数据（如市场数据、账户信息等）
 * @returns 策略专属的AI提示词（字符串格式，会被插入到AI的系统提示词中）
 *
 * @example
 * ```typescript
 * const params = getStrategyParams("aggressive", 25);
 * const context = {
 *   intervalMinutes: 5,
 *   maxPositions: 5,
 *   extremeStopLossPercent: -30,
 *   maxHoldingHours: 36,
 *   tradingSymbols: ['BTC', 'ETH']
 * };
 * const prompt = await generateStrategySpecificPrompt("aggressive", params, context);
 * // prompt 包含激进策略的交易规则、风控要求等
 * ```
 */
export async function generateStrategySpecificPrompt(
  strategy: TradingStrategy,
  params: StrategyParams,
  context: StrategyPromptContext,
  data?: any
): Promise<string> {
  switch (strategy) {
    case "aggressive":
      return generateAggressivePrompt(params, context);
    case "aggressive-team":
      return generateAggressiveTeamPrompt(params, context);
    case "balanced":
      return generateBalancedPrompt(params, context);
    case "conservative":
      return generateConservativePrompt(params, context);
    case "ultra-short":
      return generateUltraShortPrompt(params, context);
    case "swing-trend":
      return generateSwingTrendPrompt(params, context);
    case "medium-long":
      return generateMediumLongPrompt(params, context);
    case "rebate-farming":
      return generateRebateFarmingPrompt(params, context);
    case "ai-autonomous":
      return generateAiAutonomousPrompt(params, context);
    case "multi-agent-consensus":
      return generateMultiAgentConsensusPrompt(params, context);
    case "alpha-beta":
      return generateAlphaBetaPrompt(params, context);
    case "cai-sen":
      return generateCaiSenPrompt(params, context, data);
    default:
      return generateAiAutonomousPrompt(params, context);
  }
}
