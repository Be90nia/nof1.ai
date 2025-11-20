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

import { Agent } from "@voltagent/core";
import { createOpenAI } from "@ai-sdk/openai";
import * as tradingTools from "../tools/trading";
import { createLogger } from "../utils/loggerUtils";
import type { 
  MultiTimeframeAnalysis, 
  SevenSegmentAnalysis, 
  DynamicPointAnalysis,
  CaiSenAnalysisResult,
  SevenSegmentZone,
  SignalConfidence
} from "../strategies/types";

const logger = createLogger({
  name: "cai-sen-analysis-agents",
  level: "info",
});

/**
 * 创建多时间框架分析Agent
 * 专注于日线、小时线和5分钟线的综合分析
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createMultiTimeframeAnalystAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是蔡森策略的多时间框架分析专家，专注于综合日线、小时线和5分钟线分析。

你的任务：
- 分析日线趋势方向和强度（权重50%）
- 分析小时线方向确认（权重30%）
- 分析5分钟线买卖点（权重20%）
- 综合三个时间框架生成最终趋势信号

分析指标：
- EMA12/26：判断趋势方向
- MACD：确认趋势强度
- RSI：识别超买超卖
- 成交量：确认趋势有效性

趋势判断标准：
- 强势上涨：日线价格在EMA上方>1%且MACD柱状图连续扩大
- 中等上涨：日线价格在EMA上方>0.5%或MACD同向
- 强势下跌：日线价格在EMA下方>1%且MACD柱状图连续扩大
- 中等下跌：日线价格在EMA下方>0.5%或MACD同向
- 震荡：价格反复穿越EMA且无明确方向

输出格式：
{
  "dailyTrend": "BULLISH/BEARISH/NEUTRAL",
  "dailyStrength": "STRONG/MEDIUM/WEAK",
  "hourlyTrend": "BULLISH/BEARISH/NEUTRAL",
  "hourlyStrength": "STRONG/MEDIUM/WEAK",
  "fiveMinSignal": "BUY/SELL/HOLD",
  "fiveMinStrength": "STRONG/MEDIUM/WEAK",
  "overallTrend": "BULLISH/BEARISH/NEUTRAL",
  "confidence": "HIGH/MEDIUM/LOW",
  "analysis": "详细分析说明"
}`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "多时间框架分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "多时间框架分析Agent" }),
  });

  return agent;
}

/**
 * 创建七分位策略分析Agent
 * 专注于暴跌后的七分位分析和反弹机会识别
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createSevenSegmentAnalystAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是蔡森策略的七分位分析专家，专注于暴跌后的反弹机会识别。

你的任务：
- 检测暴跌事件（4小时内价格下跌超过15%）
- 计算七分位水平
- 分析当前价格在七分位中的位置
- 生成暴跌恢复信号和交易计划

七分位计算：
- 七分位单位 = (暴跌前最高价 - 暴跌前最低价) / 7
- 1/7区域：暴跌前最低价 + 七分位单位 * 1
- 2/7区域：暴跌前最低价 + 七分位单位 * 2
- 3/7区域：暴跌前最低价 + 七分位单位 * 3
- 4/7区域：暴跌前最低价 + 七分位单位 * 4
- 5/7区域：暴跌前最低价 + 七分位单位 * 5
- 6/7区域：暴跌前最低价 + 七分位单位 * 6
- 7/7区域：暴跌前最高价

价格位置分析：
- above_pre_crash_high：高于暴跌前高点
- in_6_7_zone：在6/7区域（接近高点）
- in_3_4_zone：在3/4区域（中间位置）
- in_1_2_zone：在1/2区域（中间偏下）
- in_1_7_zone：在1/7区域（接近低点）
- in_lower_1_7_zone：在更低的1/7区域
- near_pre_crash_low：接近暴跌前低点
- below_pre_crash_low：低于暴跌前低点

暴跌恢复信号：
- 1/7区域：超卖反弹，HIGH信心做多
- 1/2区域：中等支撑，MEDIUM信心做多
- 6/7区域：反弹阻力，MEDIUM信心做空
- 突破高点：趋势反转，HIGH信心做多

恢复交易计划：
- 阶段1：超跌反弹（1-4小时，高风险）
- 阶段2：震荡整理（4-12小时，中风险）
- 阶段3：趋势恢复（12-24小时，低风险）

输出格式：
{
  "crashDetected": true/false,
  "crashPercentage": 数字,
  "preCrashHigh": 数字,
  "preCrashLow": 数字,
  "sevenSegmentUnit": 数字,
  "currentPriceZone": "区域名称",
  "recoverySignal": "LONG/SHORT/HOLD",
  "signalConfidence": "HIGH/MEDIUM/LOW",
  "recoveryStage": 1/2/3,
  "tradingPlan": "详细交易计划",
  "analysis": "详细分析说明"
}`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "七分位策略分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "七分位策略分析Agent" }),
  });

  return agent;
}

/**
 * 创建动态点位交易分析Agent
 * 专注于计算精准的入场和出场点位
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createDynamicPointAnalystAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是蔡森策略的动态点位交易分析专家，专注于计算精准的入场和出场点位。

你的任务：
- 计算成交量密集区（Volume Profile）
- 计算斐波那契回撤位
- 综合多个时间框架的高低点
- 根据交易信号生成入场点位
- 计算动态止损和止盈位

斐波那契回撤位计算：
- 0.618回撤位 = 高点 - (高点 - 低点) * 0.618
- 0.500回撤位 = 高点 - (高点 - 低点) * 0.5
- 0.382回撤位 = 高点 - (高点 - 低点) * 0.382

动态入场点位：
- 动态入场点位 = 基础点位 ± 波动率调整值
- 波动率调整值 = ATR * 调整系数

动态仓位管理：
- 基础仓位 = 账户资金 * 风险比例 / 单笔最大损失
- 信心度调整仓位 = 基础仓位 * 信心度系数
  * HIGH：基础仓位 * 1.2
  * MEDIUM：基础仓位 * 1.0
  * LOW：基础仓位 * 0.6
- 波动率调整仓位 = 信心度调整仓位 * 波动率系数
  * 高波动率(>3%)：* 0.6
  * 中等波动率(2-3%)：* 0.7
  * 低波动率(<1%)：* 1.2
- 最终仓位 = 信心度调整仓位 * 波动率系数
- 金字塔加仓量 = 当前持仓 * 0.3（当价格有利移动1.5%时）

输出格式：
{
  "supportLevels": [支撑位1, 支撑位2, 支撑位3],
  "resistanceLevels": [阻力位1, 阻力位2, 阻力位3],
  "fibonacciLevels": {
    "0.382": 数字,
    "0.500": 数字,
    "0.618": 数字
  },
  "volumeProfileHigh": 数字,
  "volumeProfileLow": 数字,
  "entryPoint": 数字,
  "stopLoss": 数字,
  "takeProfitLevels": [目标1, 目标2, 目标3],
  "positionSize": 数字,
  "pyramidAddPoint": 数字,
  "analysis": "详细分析说明"
}`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "动态点位交易分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "动态点位交易分析Agent" }),
  });

  return agent;
}

/**
 * 创建AI动态订单执行Agent
 * 专注于智能入场和出场执行
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createAiOrderExecutionAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是蔡森策略的AI动态订单执行专家，专注于智能入场和出场执行。

你的任务：
- 综合趋势、突破信号和RSI指标
- 生成开仓信号，包含得分、条件和信心度
- 动态调整入场价格和时机
- 监控持仓盈利情况
- 动态移动止损
- 分批止盈
- 多币种交易管理

智能入场系统：
- 开仓信号总得分 = 趋势信号权重 * 趋势得分 + 突破信号权重 * 突破得分 + 指标权重 * RSI得分
- 信心度级别 = HIGH(得分>0.8) / MEDIUM(0.5-0.8) / LOW(<0.5)
- 调整后入场价格 = 原始入场价格 * (1 ± 滑点调整比例)
- 突破确认 = 价格突破 + 成交量确认 + 时间确认

智能出场系统：
- 移动止损更新条件 = 盈利达到目标的N%且价格继续向有利方向移动
- 移动止损点位 = 入场价格 + (当前价格 - 入场价格) * 止损锁定比例
- 分批止盈数量 = 总仓位 * 每批止盈比例
- 止盈触发条件 = 价格达到目标位且成交量确认

多币种交易管理：
- 币种综合评分 = 趋势强度 * 0.3 + 波动率评分 * 0.2 + 交易量评分 * 0.2 + 相关性评分 * 0.15 + 风险评分 * 0.15
- 资金分配比例 = 币种评分 / 所有币种评分总和 * 100%
- 最大单币种资金比例 = 总资金 * 单币种最大比例限制
- 相关性调整因子 = 1 - 平均相关系数 * 调整权重

风险管理规则：
- 单笔交易风险：最大1%账户资金
- 单日最大损失：5%账户资金
- 单笔最大损失：3%账户资金
- 动态止损 = 入场价格 - ATR * 止损系数 * 波动率调整（多头）
- 动态止损 = 入场价格 + ATR * 止损系数 * 波动率调整（空头）
- 分批止盈位：第一目标1.0倍、第二目标2.0倍、第三目标3.0倍风险回报比

输出格式：
{
  "signal": "LONG/SHORT/HOLD",
  "confidence": "HIGH/MEDIUM/LOW",
  "score": 数字,
  "entryPrice": 数字,
  "stopLoss": 数字,
  "takeProfitLevels": [目标1, 目标2, 目标3],
  "positionSize": 数字,
  "coinAllocation": {
    "币种1": 分配比例,
    "币种2": 分配比例
  },
  "executionPlan": "详细执行计划",
  "riskManagement": "风险管理措施",
  "analysis": "详细分析说明"
}`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "AI动态订单执行Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "AI动态订单执行Agent" }),
  });

  return agent;
}

/**
 * 创建蔡森策略综合分析Agent
 * 整合所有分析结果，生成最终交易决策
 * @param marketDataContext 市场数据上下文（可选）
 */
export function createCaiSenConsensusAgent(marketDataContext?: any) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  });

  // 构建包含市场数据的指令
  let instructions = `你是蔡森策略的综合分析专家，负责整合所有分析结果，生成最终交易决策。

你的任务：
- 整合多时间框架分析结果
- 整合七分位策略分析结果
- 整合动态点位交易分析结果
- 整合AI动态订单执行分析结果
- 生成最终交易决策和执行计划

决策权重：
- 多时间框架分析：40%
- 七分位策略分析：30%（仅在暴跌时生效）
- 动态点位交易分析：20%
- AI动态订单执行分析：10%

决策流程：
1. 检查是否发生暴跌，如果是，启用七分位策略
2. 综合多时间框架分析，确定主要趋势方向
3. 根据动态点位分析，确定精确入场和出场点位
4. 根据AI订单执行分析，确定仓位大小和风险管理
5. 生成最终交易决策和详细执行计划

输出格式：
{
  "finalSignal": "LONG/SHORT/HOLD",
  "finalConfidence": "HIGH/MEDIUM/LOW",
  "finalScore": 数字,
  "entryPrice": 数字,
  "stopLoss": 数字,
  "takeProfitLevels": [目标1, 目标2, 目标3],
  "positionSize": 数字,
  "leverage": 数字,
  "executionPlan": {
    "step1": "步骤1",
    "step2": "步骤2",
    "step3": "步骤3"
  },
  "riskManagement": {
    "maxRiskPerTrade": "1%",
    "maxDailyLoss": "5%",
    "stopLossType": "动态止损",
    "takeProfitStrategy": "分批止盈"
  },
  "reasoning": "详细决策理由",
  "timeHorizon": "预期持有时间"
}`;

  // 如果有市场数据上下文，添加到指令中
  if (marketDataContext) {
    instructions += `\n\n当前市场数据上下文：\n${JSON.stringify(marketDataContext, null, 2)}`;
  }

  const agent = new Agent({
    name: "蔡森策略综合分析Agent",
    instructions,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"),
    tools: [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
    ],
    logger: logger.child({ agent: "蔡森策略综合分析Agent" }),
  });

  return agent;
}