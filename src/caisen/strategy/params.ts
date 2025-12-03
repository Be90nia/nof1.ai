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

import { logger } from "../../utils/loggerUtils";
import type { StrategyParams } from "./types";

/**
 * 蔡森策略配置
 *
 * 策略特点：
 * - 风险等级：中等风险
 * - 杠杆范围：60%-85% 最大杠杆
 * - 仓位大小：20-27%
 * - 适用人群：稳健投资者，追求持续稳定收益
 * - 目标月回报：15-25%（通过多维度分析和精准买卖点实现）
 * - 交易频率：中等，精选高胜率机会
 *
 * 核心策略：
 * - 多时间框架分析：综合日线、小时线和5分钟线分析，提高信号准确性
 * - 七分位策略引擎：专门针对暴跌后的反弹机会，通过七分位水平计算和价格位置分析
 * - 动态点位交易系统：计算成交量密集区、斐波那契回撤位，生成精准入场点位
 * - AI动态订单执行器：智能入场/出场系统，动态调整仓位和止损止盈
 * - 风险管理：多层次风险管理机制，单笔交易最大风险1%，单日最大损失5%
 *
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @param aiReturnPrediction - AI预估的收益率（可选，用于动态调整分批止盈参数）
 * @returns 蔡森策略的完整参数配置
 */
export function getCaiSenStrategy(
  maxLeverage: number,
  aiReturnPrediction?: number
): StrategyParams {
  // 蔡森策略：使用 60%-85% 的最大杠杆
  const caiSenLevMin = Math.max(3, Math.ceil(maxLeverage * 0.6)); // 最小杠杆：60%最大杠杆，至少3倍
  const caiSenLevMax = Math.max(5, Math.ceil(maxLeverage * 0.85)); // 最大杠杆：85%最大杠杆，至少5倍

  // 计算不同信号强度下推荐的杠杆倍数
  const caiSenLevNormal = caiSenLevMin; // 普通信号：使用最小杠杆
  const caiSenLevGood = Math.ceil((caiSenLevMin + caiSenLevMax) / 2); // 良好信号：使用中间值
  const caiSenLevStrong = caiSenLevMax; // 强信号：使用最大杠杆

  // 根据AI预估收益率动态调整分批止盈参数
  // 默认值（硬编码值作为 fallback）
  let takeProfitStage1 = 5;
  let takeProfitStage2 = 10;
  let takeProfitStage3 = 15;

  // 如果有AI预估收益率，根据预估调整止盈阈值
  if (aiReturnPrediction && !Number.isNaN(aiReturnPrediction)) {
    logger.info("根据AI预估收益率调整分批止盈参数", {
      originalPrediction: aiReturnPrediction,
    });

    // 根据AI预估收益率动态计算止盈阈值
    // 公式：止盈阈值 = AI预估收益率 * 调整系数
    // 第一阶段：30% of AI prediction
    // 第二阶段：60% of AI prediction
    // 第三阶段：90% of AI prediction
    takeProfitStage1 = Math.max(3, Math.round(aiReturnPrediction * 0.3));
    takeProfitStage2 = Math.max(
      takeProfitStage1 + 2,
      Math.round(aiReturnPrediction * 0.6)
    );
    takeProfitStage3 = Math.max(
      takeProfitStage2 + 2,
      Math.round(aiReturnPrediction * 0.9)
    );

    logger.info("动态调整后的分批止盈参数", {
      takeProfitStage1,
      takeProfitStage2,
      takeProfitStage3,
    });
  }

  return {
    // ==================== 策略基本信息 ====================
    name: "蔡森策略",
    description:
      "多时间框架分析+七分位策略引擎+动态点位交易系统，精准捕捉买卖点和暴跌后反弹机会，适合稳健投资者",

    // ==================== 杠杆配置 ====================
    // 使用 60%-85% 最大杠杆（中等风险）
    leverageMin: caiSenLevMin,
    leverageMax: caiSenLevMax,
    leverageRecommend: {
      normal: `${caiSenLevNormal}倍`, // 普通信号：使用最小杠杆
      good: `${caiSenLevGood}倍`, // 良好信号：使用中等杠杆
      strong: `${caiSenLevStrong}倍`, // 强信号：使用最大杠杆
    },

    // ==================== 仓位配置 ====================
    // 20-27%（中等风险，稳健）
    positionSizeMin: 20,
    positionSizeMax: 27,
    positionSizeRecommend: {
      normal: "20-23%", // 普通信号：较小仓位
      good: "23-25%", // 良好信号：中等仓位
      strong: "25-27%", // 强信号：最大仓位
    },

    // ==================== 止损配置 ====================
    // 中等风险下的止损设置
    stopLoss: {
      low: -15, // 低杠杆（如3-10倍）：亏损15%止损
      mid: -10, // 中杠杆（如11-20倍）：亏损10%止损
      high: -8, // 高杠杆（如21-30倍）：亏损8%止损
    },

    // ==================== 移动止盈配置 ====================
    // 盈利后移动止损线保护利润
    trailingStop: {
      level1: { trigger: 20, stopAt: 12 }, // 盈利达到20%时，止损线移至12%
      level2: { trigger: 40, stopAt: 25 }, // 盈利达到40%时，止损线移至25%
      level3: { trigger: 60, stopAt: 40 }, // 盈利达到60%时，止损线移至40%
    },

    // ==================== 分批止盈配置 ====================
    // 根据AI预估收益率动态调整的分批止盈参数
    partialTakeProfit: {
      stage1: { trigger: takeProfitStage1, closePercent: 30 }, // 第一阶段止盈
      stage2: { trigger: takeProfitStage2, closePercent: 50 }, // 第二阶段止盈
      stage3: { trigger: takeProfitStage3, closePercent: 100 }, // 第三阶段止盈
    },

    // ==================== 峰值回撤保护 ====================
    // 盈利从峰值回撤时触发保护
    peakDrawdownProtection: 30, // 从峰值回撤30%时触发保护

    // ==================== 波动率调整 ====================
    // 根据市场波动自动调整杠杆和仓位
    volatilityAdjustment: {
      highVolatility: {
        leverageFactor: 0.7, // 高波动时，杠杆降低30%
        positionFactor: 0.8, // 高波动时，仓位降低20%
      },
      normalVolatility: {
        leverageFactor: 1.0, // 正常波动时，不调整
        positionFactor: 1.0,
      },
      lowVolatility: {
        leverageFactor: 1.1, // 低波动时，杠杆提高10%
        positionFactor: 1.05, // 低波动时，仓位提高5%
      },
    },

    // ==================== 策略规则描述 ====================
    entryCondition:
      "多时间框架分析确认+七分位策略信号，暴跌后在1/7或1/2区域考虑做多，突破高点考虑追涨",
    riskTolerance:
      "单笔交易风险最大1%账户资金，单日最大损失5%，动态止损+分批止盈",
    tradingStyle:
      "多维度分析+精准买卖点+暴跌反弹策略，中等频率交易，注重风险控制",

    // ==================== 代码级保护开关 ====================
    enableCodeLevelProtection: true,
    allowAiOverrideProtection: true,

    // ==================== 峰值回落检测配置 ====================
    peakDrawdownProtectionConfig: {
      enabled: true,
      levels: [
        { peakThreshold: 3, drawdownThreshold: 1, closePercent: 30 }, // 峰值达到3%，回落1%，平仓30%
        { peakThreshold: 5, drawdownThreshold: 2, closePercent: 50 }, // 峰值达到5%，回落2%，平仓50%
        { peakThreshold: 8, drawdownThreshold: 3, closePercent: 100 }, // 峰值达到8%，回落3%，平仓100%
      ],
      minHoldingTime: 5 * 60 * 1000, // 5分钟
      maxClosePercent: 100, // 单次最大平仓100%
    },

    // ==================== 蔡森策略特定参数 ====================
    caiSen: {
      // 多时间框架分析参数
      timeframeAnalysis: {
        dailyWeight: 0.5, // 日线权重
        hourlyWeight: 0.3, // 小时线权重
        fiveMinWeight: 0.2, // 5分钟线权重
        trendConfirmationThreshold: 0.7, // 趋势确认阈值
      },

      // 七分位策略参数
      sevenSegmentStrategy: {
        crashDetectionThreshold: -15, // 暴跌检测阈值
        calculationPeriod: 24, // 计算周期（小时）
        recoveryConfidence: {
          zone1_7: 0.85, // 1/7区域置信度
          zone1_2: 0.6, // 1/2区域置信度
          zone6_7: 0.65, // 6/7区域置信度
        },
      },

      // 动态点位交易参数
      dynamicPointTrading: {
        fibonacciLevels: [0.382, 0.5, 0.618], // 斐波那契回撤位
        volatilityAdjustment: 0.2, // 波动率调整系数
        volumeProfileWeight: 0.3, // 成交量密集区权重
      },

      // AI动态订单执行参数
      aiOrderExecution: {
        signalWeights: {
          trend: 0.4, // 趋势信号权重
          breakout: 0.3, // 突破信号权重
          rsi: 0.3, // RSI指标权重
        },
        confidenceThresholds: {
          high: 0.8, // 高信心度阈值
          medium: 0.5, // 中信心度阈值
        },
        slippageAdjustment: 0.001, // 滑点调整比例
      },

      // 风险管理参数
      riskManagement: {
        atrPeriod: 14, // ATR计算周期
        stopLossCoefficient: 2.0, // 止损系数
        volatilityFactor: 1.5, // 波动率调整因子
        batchTakeProfitRatios: [1.0, 2.0, 3.0], // 分批止盈比例
      },
    },
  };
}
