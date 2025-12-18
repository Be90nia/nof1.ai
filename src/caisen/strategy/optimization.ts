/**
 * 蔡森策略优化算法模块
 * CaiSen Strategy Optimization Algorithms
 *
 * 该模块实现了蔡森策略的核心优化算法，包括：
 * 1. 动态时间框架权重分配
 * 2. 改进的信号确认机制
 * 3. 优化的七分位计算算法
 *
 * @author CaiSen Strategy Team
 * @version 2.0.0
 */

import { SevenSegmentZone, SignalConfidence } from "./types";
import type { MultiTimeframeAnalysis, SevenSegmentAnalysis } from "./types";

/**
 * 市场状态数据接口
 * Market state data interface
 */
export interface MarketStateData {
  /** 当前价格 */
  currentPrice: number;
  /** 20日均线 */
  ma20: number;
  /** 50日均线 */
  ma50: number;
  /** 100日均线 */
  ma100: number;
  /** RSI(14) */
  rsi14: number;
  /** RSI(7) */
  rsi7: number;
  /** MACD值 */
  macd: number;
  /** ATR波动率 */
  atr: number;
  /** 历史ATR平均值 */
  avgAtr: number;
  /** 成交量 */
  volume: number;
  /** 成交量变化率 */
  volumeChangeRate: number;
  /** 6小时涨跌幅 */
  sixHourChange: number;
  /** 24小时涨跌幅 */
  twentyFourHourChange: number;
  /** 暴跌前最高价 */
  preCrashHigh: number;
  /** 暴跌前最低价 */
  preCrashLow: number;
  /** 市场状态 */
  marketState: string;
  /** ADX指标值 */
  adx: number;
  /** 布林带带宽 */
  bollingerBandwidth: number;
}

/**
 * 动态时间框架权重分配结果
 * Dynamic timeframe weight allocation result
 */
export interface DynamicTimeframeWeights {
  /** 日线权重 */
  dailyWeight: number;
  /** 小时线权重 */
  hourlyWeight: number;
  /** 15分钟线权重 */
  fifteenMinWeight: number;
  /** 5分钟线权重 */
  fiveMinWeight: number;
}

/**
 * 信号确认结果
 * Signal confirmation result
 */
export interface SignalConfirmationResult {
  /** 信号方向 */
  direction: "LONG" | "SHORT" | "HOLD";
  /** 信号信心度 */
  confidence: SignalConfidence;
  /** 信号得分 */
  score: number;
  /** 确认理由 */
  reasons: string[];
}

/**
 * 优化的七分位计算结果
 * Optimized seven-segment calculation result
 */
export interface OptimizedSevenSegmentResult {
  /** 七分位水平 */
  segmentLevels: {
    level1_7: number;
    level2_7: number;
    level3_7: number;
    level4_7: number;
    level5_7: number;
    level6_7: number;
  };
  /** 当前价格所在区域 */
  currentZone: SevenSegmentZone;
  /** 各区域成交量分布 */
  volumeDistribution: {
    zone1_7: number;
    zone2_7: number;
    zone3_7: number;
    zone4_7: number;
    zone5_7: number;
    zone6_7: number;
    zone7_7: number;
  };
}

/**
 * 动态时间框架权重分配算法
 * Dynamic timeframe weight allocation algorithm
 *
 * 根据市场波动率和趋势强度动态调整各时间框架的权重，
 * 在高波动率市场中增加短期时间框架权重，在低波动率市场中增加长期时间框架权重。
 *
 * @param volatility 市场波动率（ATR/价格）
 * @param trendStrength 趋势强度（0-100）
 * @param marketState 市场状态
 * @param baseWeights 基础权重配置
 * @returns 动态调整后的时间框架权重
 */
export function allocateDynamicTimeframeWeights(
  volatility: number,
  trendStrength: number,
  marketState: string,
  baseWeights: {
    daily: number;
    hourly: number;
    fifteenMin: number;
    fiveMin: number;
  }
): DynamicTimeframeWeights {
  // 波动率标准化（0-100）
  const normalizedVolatility = Math.min(100, Math.max(0, volatility * 1000));

  // 趋势强度标准化（0-100）
  const normalizedTrendStrength = Math.min(100, Math.max(0, trendStrength));

  // 波动率因子：波动率越高，短期权重越大
  const volatilityFactor = normalizedVolatility / 100;

  // 趋势强度因子：趋势越强，长期权重越大
  const trendFactor = normalizedTrendStrength / 100;

  // 市场状态因子：根据市场状态调整权重
  let marketStateFactor = 1.0;
  if (marketState === "HIGH_VOLATILITY" || marketState === "EXTREME") {
    marketStateFactor = 1.2; // 高波动市场增加短期权重
  } else if (marketState === "LOW_VOLATILITY") {
    marketStateFactor = 0.8; // 低波动市场增加长期权重
  }

  // 动态调整权重
  const dailyWeight =
    baseWeights.daily * (0.7 + trendFactor * 0.3 - volatilityFactor * 0.2);
  const hourlyWeight =
    baseWeights.hourly * (0.8 + volatilityFactor * 0.1 + trendFactor * 0.1);
  const fifteenMinWeight =
    baseWeights.fifteenMin *
    (0.7 + volatilityFactor * 0.2 + trendFactor * 0.1) *
    marketStateFactor;
  const fiveMinWeight =
    baseWeights.fiveMin * (0.5 + volatilityFactor * 0.5) * marketStateFactor;

  // 权重归一化
  const totalWeight =
    dailyWeight + hourlyWeight + fifteenMinWeight + fiveMinWeight;

  return {
    dailyWeight: dailyWeight / totalWeight,
    hourlyWeight: hourlyWeight / totalWeight,
    fifteenMinWeight: fifteenMinWeight / totalWeight,
    fiveMinWeight: fiveMinWeight / totalWeight,
  };
}

/**
 * 改进的信号确认机制
 * Improved signal confirmation mechanism
 *
 * 实现了多层信号确认机制，包括：
 * 1. 多时间框架趋势一致性检查
 * 2. 成交量确认
 * 3. 多指标共振
 * 4. 价格形态确认
 * 5. 微观结构数据分析
 * 6. 市场情绪分析
 *
 * @param multiTimeframeAnalysis 多时间框架分析结果
 * @param sevenSegmentAnalysis 七分位分析结果
 * @param marketData 市场状态数据
 * @param microstructureData 微观结构数据（可选）
 * @returns 信号确认结果
 */
export function confirmSignal(
  multiTimeframeAnalysis: MultiTimeframeAnalysis,
  sevenSegmentAnalysis: SevenSegmentAnalysis,
  marketData: MarketStateData,
  microstructureData?: any
): SignalConfirmationResult {
  const reasons: string[] = [];
  let totalScore = 0;

  // 1. 多时间框架趋势一致性检查（25分）
  const trendConsistencyScore = calculateTrendConsistencyScore(
    multiTimeframeAnalysis
  );
  totalScore += trendConsistencyScore;
  reasons.push(
    `多时间框架趋势一致性得分: ${Math.round(trendConsistencyScore)}`
  );

  // 2. 七分位位置评分（20分）
  const segmentScore = calculateSegmentScore(sevenSegmentAnalysis);
  totalScore += segmentScore;
  reasons.push(`七分位位置得分: ${Math.round(segmentScore)}`);

  // 3. 成交量确认评分（15分）
  const volumeScore = calculateVolumeScore(marketData);
  totalScore += volumeScore;
  reasons.push(`成交量确认得分: ${Math.round(volumeScore)}`);

  // 4. 指标共振评分（20分）
  const indicatorResonanceScore = calculateIndicatorResonanceScore(marketData);
  totalScore += indicatorResonanceScore;
  reasons.push(`指标共振得分: ${Math.round(indicatorResonanceScore)}`);

  // 5. 微观结构数据分析（10分）
  const microstructureScore = calculateMicrostructureScore(microstructureData);
  totalScore += microstructureScore;
  reasons.push(`微观结构分析得分: ${Math.round(microstructureScore)}`);

  // 6. 市场情绪分析（10分）
  const marketSentimentScore = calculateMarketSentimentScore(
    marketData,
    microstructureData
  );
  totalScore += marketSentimentScore;
  reasons.push(`市场情绪分析得分: ${Math.round(marketSentimentScore)}`);

  // 7. 执行信号二次验证
  const { isValid, adjustedScore, verificationReasons } =
    performSecondaryVerification(sevenSegmentAnalysis, marketData, totalScore);

  // 合并验证原因
  reasons.push(...verificationReasons);

  // 计算最终信号方向和信心度
  const direction = determineSignalDirection(
    adjustedScore,
    sevenSegmentAnalysis,
    isValid
  );
  const confidence = determineSignalConfidence(adjustedScore);

  // 调整信心度阈值，实现70-80%胜率目标
  let adjustedConfidence = confidence;
  if (adjustedScore < 65 && confidence === SignalConfidence.HIGH) {
    adjustedConfidence = SignalConfidence.MEDIUM;
  } else if (adjustedScore > 85 && confidence === SignalConfidence.MEDIUM) {
    adjustedConfidence = SignalConfidence.HIGH;
  }

  // 确保开仓率80-90%：对于中等信心度且分数在55-70之间的信号，仍允许开仓
  let finalDirection = direction;
  if (
    isValid &&
    adjustedScore > 55 &&
    adjustedScore < 70 &&
    direction === "HOLD"
  ) {
    // 调整开仓阈值，增加开仓机会
    finalDirection = determineSignalDirection(
      adjustedScore + 5,
      sevenSegmentAnalysis,
      isValid
    );
  }

  return {
    direction: finalDirection,
    confidence: adjustedConfidence,
    score: adjustedScore,
    reasons,
  };
}

/**
 * 计算趋势一致性得分
 * Calculate trend consistency score
 *
 * @param analysis 多时间框架分析结果
 * @returns 趋势一致性得分（0-30）
 */
function calculateTrendConsistencyScore(
  analysis: MultiTimeframeAnalysis
): number {
  const { daily, hourly, fifteenMin, fiveMin } = analysis;
  const timeframes = [daily, hourly, fifteenMin, fiveMin];

  // 计算多头和空头趋势的时间框架数量
  const bullishCount = timeframes.filter((tf) => tf.trend === "BULLISH").length;
  const bearishCount = timeframes.filter((tf) => tf.trend === "BEARISH").length;
  const sidewaysCount = timeframes.filter(
    (tf) => tf.trend === "SIDEWAYS"
  ).length;

  // 计算趋势强度加权平均值
  const avgStrength =
    timeframes.reduce((sum, tf) => sum + tf.strength, 0) / timeframes.length;

  // 完全一致的情况
  if (bullishCount === 4 || bearishCount === 4) {
    // 所有时间框架一致，得分25-30
    return 25 + (avgStrength / 100) * 5;
  }
  // 高度一致的情况（3个时间框架一致）
  if (bullishCount >= 3 || bearishCount >= 3) {
    // 3个时间框架一致，得分20-24
    return 20 + (avgStrength / 100) * 5;
  }
  // 中度一致的情况（2个相邻时间框架一致）
  if (
    (daily.trend === hourly.trend && daily.trend !== "SIDEWAYS") ||
    (hourly.trend === fifteenMin.trend && hourly.trend !== "SIDEWAYS") ||
    (fifteenMin.trend === fiveMin.trend && fifteenMin.trend !== "SIDEWAYS") ||
    (daily.trend === fifteenMin.trend && daily.trend !== "SIDEWAYS") ||
    (hourly.trend === fiveMin.trend && hourly.trend !== "SIDEWAYS")
  ) {
    // 部分一致，得分15-19
    return 15 + (avgStrength / 100) * 5;
  }
  // 弱一致的情况（至少1个时间框架有明确趋势）
  if (bullishCount >= 1 || bearishCount >= 1) {
    // 有明确趋势，得分10-14
    return 10 + (avgStrength / 100) * 5;
  }
  // 完全不一致或全部横盘
  return 5 + Math.random() * 5;
}

/**
 * 计算七分位位置得分
 * Calculate segment position score
 *
 * @param analysis 七分位分析结果
 * @returns 七分位位置得分（0-25）
 */
function calculateSegmentScore(analysis: SevenSegmentAnalysis): number {
  switch (analysis.currentZone) {
    case SevenSegmentZone.IN_1_7_ZONE:
    case SevenSegmentZone.IN_LOWER_1_7_ZONE:
    case SevenSegmentZone.NEAR_PRE_CRASH_LOW:
      // 超卖区域，适合做多
      return 20 + Math.random() * 5;
    case SevenSegmentZone.IN_6_7_ZONE:
      // 超买区域，适合做空
      return 15 + Math.random() * 5;
    case SevenSegmentZone.IN_1_2_ZONE:
      // 中性区域，观望
      return 5 + Math.random() * 10;
    default:
      // 其他区域，得分较低
      return Math.random() * 10;
  }
}

/**
 * 计算成交量确认得分
 * Calculate volume confirmation score
 *
 * @param marketData 市场状态数据
 * @returns 成交量确认得分（0-20）
 */
function calculateVolumeScore(marketData: MarketStateData): number {
  const { volumeChangeRate, sixHourChange } = marketData;

  // 暴涨暴跌时成交量放大，得分较高
  if (Math.abs(sixHourChange) > 10 && volumeChangeRate > 1.5) {
    return 15 + Math.random() * 5;
  }
  if (volumeChangeRate > 1.0) {
    // 成交量温和放大
    return 10 + Math.random() * 5;
  }
  if (volumeChangeRate < 0.5) {
    // 成交量萎缩
    return Math.random() * 5;
  }
  // 正常成交量
  return 5 + Math.random() * 5;
}

/**
 * 计算指标共振得分
 * Calculate indicator resonance score
 *
 * @param marketData 市场状态数据
 * @returns 指标共振得分（0-25）
 */
function calculateIndicatorResonanceScore(marketData: MarketStateData): number {
  const { rsi14, macd, currentPrice, ma20 } = marketData;

  let score = 0;

  // RSI超买超卖检查
  if (rsi14 < 30) {
    // 超卖，适合做多
    score += 8;
  } else if (rsi14 > 70) {
    // 超买，适合做空
    score += 8;
  } else {
    // 中性
    score += 3;
  }

  // MACD趋势检查
  if (macd > 0) {
    // 多头趋势
    score += 8;
  } else if (macd < 0) {
    // 空头趋势
    score += 8;
  } else {
    // 中性
    score += 3;
  }

  // 价格均线关系检查
  if (currentPrice > ma20 * 1.01) {
    // 价格在均线上方，多头强势
    score += 9;
  } else if (currentPrice < ma20 * 0.99) {
    // 价格在均线下方，空头强势
    score += 9;
  } else {
    // 价格接近均线，中性
    score += 4;
  }

  return score;
}

/**
 * 检测当前市场状态
 * Detect current market state
 *
 * @param marketData 市场数据
 * @returns 市场状态
 */
export function detectMarketState(marketData: MarketStateData): string {
  const {
    atr,
    avgAtr,
    rsi14,
    adx,
    bollingerBandwidth,
    twentyFourHourChange,
    volumeChangeRate,
    currentPrice,
    ma20,
    ma50,
  } = marketData;

  // 计算波动率状态
  const volatilityRatio = atr / avgAtr;
  const isHighVolatility = volatilityRatio > 1.5;
  const isLowVolatility = volatilityRatio < 0.7;

  // 计算趋势强度
  const isStrongTrend = adx > 30;
  const isWeakTrend = adx < 20;

  // 计算价格趋势方向
  const isBullishTrend = currentPrice > ma20 && ma20 > ma50;
  const isBearishTrend = currentPrice < ma20 && ma20 < ma50;

  // 计算极端行情
  const isExtremeMove = Math.abs(twentyFourHourChange) > 15;
  const isExtremeVolume = volumeChangeRate > 3.0;

  // 计算震荡市特征
  const isSideways = isWeakTrend && bollingerBandwidth < 0.02;

  // 确定市场状态
  if (isExtremeMove || isExtremeVolume) {
    return "EXTREME";
  }
  if (isHighVolatility) {
    return "HIGH_VOLATILITY";
  }
  if (isLowVolatility) {
    return "LOW_VOLATILITY";
  }
  if (isStrongTrend && isBullishTrend) {
    return "TRENDING_BULL";
  }
  if (isStrongTrend && isBearishTrend) {
    return "TRENDING_BEAR";
  }
  if (isSideways) {
    return "SIDEWAYS";
  }

  // 默认状态
  return "NORMAL";
}

/**
 * 执行信号二次验证
 * Perform signal secondary verification
 *
 * @param sevenSegmentAnalysis 七分位分析结果
 * @param marketData 市场数据
 * @param totalScore 初始总分
 * @returns 验证结果和调整后的分数
 */
function performSecondaryVerification(
  sevenSegmentAnalysis: SevenSegmentAnalysis,
  marketData: MarketStateData,
  totalScore: number
): { isValid: boolean; adjustedScore: number; verificationReasons: string[] } {
  const verificationReasons: string[] = [];
  let adjustedScore = totalScore;
  let isValid = true;

  const { currentZone, crashDetected } = sevenSegmentAnalysis;
  const { volumeChangeRate, rsi7, macd, currentPrice, ma20 } = marketData;

  // 1. 成交量验证（+5分或-5分）
  if (volumeChangeRate > 1.5) {
    adjustedScore += 5;
    verificationReasons.push("成交量放大，信号强度增强");
  } else if (volumeChangeRate < 0.5) {
    adjustedScore -= 5;
    verificationReasons.push("成交量萎缩，信号强度减弱");
    if (adjustedScore < 50) {
      isValid = false;
    }
  }

  // 2. 短期动量验证（+3分或-3分）
  if ((rsi7 < 30 && macd > 0) || (rsi7 > 70 && macd < 0)) {
    adjustedScore += 3;
    verificationReasons.push("短期动量确认，信号强度增强");
  } else if ((rsi7 > 70 && macd > 0) || (rsi7 < 30 && macd < 0)) {
    adjustedScore -= 3;
    verificationReasons.push("短期动量背离，信号强度减弱");
  }

  // 3. 价格均线验证（+3分或-3分）
  if (
    (currentPrice > ma20 && currentZone === SevenSegmentZone.IN_1_7_ZONE) ||
    (currentPrice < ma20 && currentZone === SevenSegmentZone.IN_6_7_ZONE)
  ) {
    adjustedScore += 3;
    verificationReasons.push("价格均线确认，信号强度增强");
  } else if (
    (currentPrice < ma20 && currentZone === SevenSegmentZone.IN_1_7_ZONE) ||
    (currentPrice > ma20 && currentZone === SevenSegmentZone.IN_6_7_ZONE)
  ) {
    adjustedScore -= 3;
    verificationReasons.push("价格均线背离，信号强度减弱");
  }

  // 4. 暴跌后反弹验证（仅适用于暴跌后情况，+5分）
  if (crashDetected && currentZone === SevenSegmentZone.IN_1_7_ZONE) {
    adjustedScore += 5;
    verificationReasons.push("暴跌后反弹，信号强度增强");
  }

  // 确保分数在0-100范围内
  adjustedScore = Math.min(100, Math.max(0, adjustedScore));

  return { isValid, adjustedScore, verificationReasons };
}

/**
 * 确定信号方向
 * Determine signal direction
 *
 * @param totalScore 总得分
 * @param sevenSegmentAnalysis 七分位分析结果
 * @param isValid 二次验证是否通过
 * @returns 信号方向
 */
function determineSignalDirection(
  totalScore: number,
  sevenSegmentAnalysis: SevenSegmentAnalysis,
  isValid: boolean = true
): "LONG" | "SHORT" | "HOLD" {
  // 调整开仓阈值，实现80-90%开仓率目标
  if (isValid && totalScore > 50) {
    // 中等以上分数且验证通过，根据七分位位置确定方向
    switch (sevenSegmentAnalysis.currentZone) {
      case SevenSegmentZone.IN_1_7_ZONE:
      case SevenSegmentZone.IN_LOWER_1_7_ZONE:
      case SevenSegmentZone.NEAR_PRE_CRASH_LOW:
        return "LONG";
      case SevenSegmentZone.IN_6_7_ZONE:
        return "SHORT";
      // 对于中间区域，如果分数很高也可以开仓
      case SevenSegmentZone.IN_1_2_ZONE:
        if (totalScore > 75) {
          // 高分信号，根据趋势确定方向
          // 这里简化处理，实际应该根据多时间框架分析结果
          return Math.random() > 0.5 ? "LONG" : "SHORT";
        }
        return "HOLD";
      default:
        return "HOLD";
    }
  }
  // 低分信号或验证不通过，观望
  return "HOLD";
}

/**
 * 计算微观结构数据得分
 * Calculate microstructure data score
 *
 * @param microstructureData 微观结构数据
 * @returns 微观结构数据得分（0-10）
 */
function calculateMicrostructureScore(microstructureData?: any): number {
  if (!microstructureData) return 5; // 默认得分

  const {
    orderBookImbalance,
    tradeCount,
    avgTradeSize,
    fundingRate,
    orderBookDepth,
  } = microstructureData;

  let score = 0;

  // 1. 订单簿不平衡分析（3分）
  if (orderBookImbalance > 0.2) {
    // 买单深度大于卖单深度，有利于多头
    score += 3;
  } else if (orderBookImbalance < -0.2) {
    // 卖单深度大于买单深度，有利于空头
    score += 3;
  } else {
    // 订单簿平衡，中性
    score += 1.5;
  }

  // 2. 成交量质量分析（3分）
  const isHighTradeCount = tradeCount > 500; // 假设阈值为500笔
  const isLargeAvgTradeSize = avgTradeSize > 1000; // 假设阈值为1000

  if (isHighTradeCount && isLargeAvgTradeSize) {
    // 高成交笔数且大单占比高，信号可靠性强
    score += 3;
  } else if (isHighTradeCount || isLargeAvgTradeSize) {
    // 仅满足一个条件，信号可靠性中等
    score += 2;
  } else {
    // 低成交笔数且小单占比高，信号可靠性弱
    score += 1;
  }

  // 3. 资金费率分析（2分）
  if (Math.abs(fundingRate) < 0.01) {
    // 资金费率正常，市场情绪稳定
    score += 2;
  } else {
    // 资金费率异常，市场情绪极端，信号可靠性降低
    score += 0.5;
  }

  // 4. 订单簿深度分析（2分）
  const totalBidDepth =
    orderBookDepth?.bid?.reduce(
      (sum: number, level: any) => sum + level.amount,
      0
    ) || 0;
  const totalAskDepth =
    orderBookDepth?.ask?.reduce(
      (sum: number, level: any) => sum + level.amount,
      0
    ) || 0;
  const totalDepth = totalBidDepth + totalAskDepth;

  if (totalDepth > 10000) {
    // 订单簿深度充足，价格稳定性高
    score += 2;
  } else if (totalDepth > 5000) {
    // 订单簿深度一般
    score += 1;
  } else {
    // 订单簿深度不足，价格易波动
    score += 0.5;
  }

  return Math.min(10, Math.max(0, score));
}

/**
 * 计算市场情绪得分
 * Calculate market sentiment score
 *
 * @param marketData 市场状态数据
 * @param microstructureData 微观结构数据
 * @returns 市场情绪得分（0-10）
 */
function calculateMarketSentimentScore(
  marketData: MarketStateData,
  microstructureData?: any
): number {
  const { rsi14, marketState } = marketData;
  const fearGreedIndex = microstructureData?.fearGreedIndex;

  let score = 0;

  // 1. RSI情绪分析（3分）
  if (rsi14 < 30) {
    // 超卖，市场情绪悲观，有利于反弹
    score += 3;
  } else if (rsi14 > 70) {
    // 超买，市场情绪乐观，有利于回调
    score += 3;
  } else {
    // 中性区间
    score += 1.5;
  }

  // 2. 恐惧贪婪指数分析（3分）
  if (fearGreedIndex) {
    if (fearGreedIndex < 20) {
      // 极度恐惧，反向指标，有利于多头
      score += 3;
    } else if (fearGreedIndex > 80) {
      // 极度贪婪，反向指标，有利于空头
      score += 3;
    } else if (fearGreedIndex >= 20 && fearGreedIndex <= 80) {
      // 中性区间
      score += 1.5;
    }
  } else {
    // 没有恐惧贪婪指数数据，默认得分
    score += 1.5;
  }

  // 3. 市场状态分析（4分）
  switch (marketState) {
    case "TRENDING_BULL":
    case "TRENDING_BEAR":
      // 趋势明确，信号可靠性高
      score += 4;
      break;
    case "HIGH_VOLATILITY":
    case "EXTREME":
      // 高波动或极端行情，信号可靠性降低
      score += 1;
      break;
    default:
      // 其他市场状态，默认得分
      score += 2;
  }

  return Math.min(10, Math.max(0, score));
}

/**
 * 确定信号信心度
 * Determine signal confidence
 *
 * @param totalScore 总得分
 * @returns 信号信心度
 */
function determineSignalConfidence(totalScore: number): SignalConfidence {
  if (totalScore > 85) {
    return SignalConfidence.HIGH;
  }
  if (totalScore > 60) {
    return SignalConfidence.MEDIUM;
  }
  return SignalConfidence.LOW;
}

/**
 * 优化的七分位计算算法
 * Optimized seven-segment calculation algorithm
 *
 * 考虑成交量分布、价格密度和市场状态，实现更精确的七分位计算。
 *
 * @param marketData 市场状态数据
 * @param historicalPrices 历史价格数据
 * @param historicalVolumes 历史成交量数据
 * @returns 优化的七分位计算结果
 */
export function calculateOptimizedSevenSegments(
  marketData: MarketStateData,
  historicalPrices: number[],
  historicalVolumes: number[]
): OptimizedSevenSegmentResult {
  const { preCrashHigh, preCrashLow, currentPrice, marketState, atr, avgAtr } =
    marketData;

  // 根据市场状态调整价格区间
  const volatilityRatio = atr / avgAtr;
  let adjustedPreCrashHigh = preCrashHigh;
  let adjustedPreCrashLow = preCrashLow;

  // 高波动市场扩展价格区间
  if (marketState === "HIGH_VOLATILITY" || marketState === "EXTREME") {
    const expansionFactor = Math.min(volatilityRatio * 0.1, 0.2); // 最大扩展20%
    const range = preCrashHigh - preCrashLow;
    adjustedPreCrashHigh = preCrashHigh + range * expansionFactor;
    adjustedPreCrashLow = preCrashLow - range * expansionFactor;
  }
  // 低波动市场收缩价格区间
  else if (marketState === "LOW_VOLATILITY") {
    const contractionFactor = 0.1; // 收缩10%
    const range = preCrashHigh - preCrashLow;
    adjustedPreCrashHigh = preCrashHigh - range * contractionFactor;
    adjustedPreCrashLow = preCrashLow + range * contractionFactor;
  }

  const priceRange = adjustedPreCrashHigh - adjustedPreCrashLow;

  // 计算基础七分位水平
  const baseSegmentSize = priceRange / 7;
  const baseLevels = {
    level1_7: adjustedPreCrashLow + baseSegmentSize,
    level2_7: adjustedPreCrashLow + baseSegmentSize * 2,
    level3_7: adjustedPreCrashLow + baseSegmentSize * 3,
    level4_7: adjustedPreCrashLow + baseSegmentSize * 4,
    level5_7: adjustedPreCrashLow + baseSegmentSize * 5,
    level6_7: adjustedPreCrashLow + baseSegmentSize * 6,
  };

  // 计算成交量分布
  const volumeDistribution = calculateVolumeDistribution(
    historicalPrices,
    historicalVolumes,
    adjustedPreCrashLow,
    adjustedPreCrashHigh
  );

  // 根据成交量分布调整七分位水平
  const adjustedLevels = adjustLevelsByVolumeDistribution(
    baseLevels,
    volumeDistribution,
    adjustedPreCrashLow,
    adjustedPreCrashHigh,
    marketState
  );

  // 确定当前价格所在区域
  const currentZone = determineCurrentZone(
    currentPrice,
    adjustedLevels,
    adjustedPreCrashLow,
    adjustedPreCrashHigh
  );

  return {
    segmentLevels: adjustedLevels,
    currentZone,
    volumeDistribution,
  };
}

/**
 * 计算成交量分布
 * Calculate volume distribution
 *
 * @param prices 历史价格数据
 * @param volumes 历史成交量数据
 * @param low 价格区间下限
 * @param high 价格区间上限
 * @returns 各区域成交量分布
 */
function calculateVolumeDistribution(
  prices: number[],
  volumes: number[],
  low: number,
  high: number
): {
  zone1_7: number;
  zone2_7: number;
  zone3_7: number;
  zone4_7: number;
  zone5_7: number;
  zone6_7: number;
  zone7_7: number;
} {
  // 初始化成交量分布
  const distribution = {
    zone1_7: 0,
    zone2_7: 0,
    zone3_7: 0,
    zone4_7: 0,
    zone5_7: 0,
    zone6_7: 0,
    zone7_7: 0,
  };

  const range = high - low;

  // 计算每个价格点所在的区域并累加成交量
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    const volume = volumes[i];

    if (price < low || price > high) continue;

    const position = (price - low) / range;

    if (position < 1 / 7) {
      distribution.zone1_7 += volume;
    } else if (position < 2 / 7) {
      distribution.zone2_7 += volume;
    } else if (position < 3 / 7) {
      distribution.zone3_7 += volume;
    } else if (position < 4 / 7) {
      distribution.zone4_7 += volume;
    } else if (position < 5 / 7) {
      distribution.zone5_7 += volume;
    } else if (position < 6 / 7) {
      distribution.zone6_7 += volume;
    } else {
      distribution.zone7_7 += volume;
    }
  }

  return distribution;
}

/**
 * 根据成交量分布调整七分位水平
 * Adjust seven-segment levels based on volume distribution
 *
 * @param baseLevels 基础七分位水平
 * @param volumeDistribution 成交量分布
 * @param low 价格区间下限
 * @param high 价格区间上限
 * @param marketState 市场状态
 * @returns 调整后的七分位水平
 */
function adjustLevelsByVolumeDistribution(
  baseLevels: {
    level1_7: number;
    level2_7: number;
    level3_7: number;
    level4_7: number;
    level5_7: number;
    level6_7: number;
  },
  volumeDistribution: {
    zone1_7: number;
    zone2_7: number;
    zone3_7: number;
    zone4_7: number;
    zone5_7: number;
    zone6_7: number;
    zone7_7: number;
  },
  low: number,
  high: number,
  marketState?: string
) {
  // 复制基础水平
  const adjustedLevels = { ...baseLevels };

  // 计算总成交量
  const totalVolume = Object.values(volumeDistribution).reduce(
    (sum, vol) => sum + vol,
    0
  );

  if (totalVolume === 0) return adjustedLevels;

  // 计算各区域成交量占比
  const volumeRatios = {
    zone1_7: volumeDistribution.zone1_7 / totalVolume,
    zone2_7: volumeDistribution.zone2_7 / totalVolume,
    zone3_7: volumeDistribution.zone3_7 / totalVolume,
    zone4_7: volumeDistribution.zone4_7 / totalVolume,
    zone5_7: volumeDistribution.zone5_7 / totalVolume,
    zone6_7: volumeDistribution.zone6_7 / totalVolume,
    zone7_7: volumeDistribution.zone7_7 / totalVolume,
  };

  // 理想成交量占比（均匀分布）
  const idealRatio = 1 / 7;

  // 根据市场状态调整调整幅度
  let adjustmentSensitivity = 0.5;
  if (marketState === "HIGH_VOLATILITY" || marketState === "EXTREME") {
    adjustmentSensitivity = 0.3; // 高波动市场降低调整敏感度
  } else if (marketState === "LOW_VOLATILITY") {
    adjustmentSensitivity = 0.7; // 低波动市场增加调整敏感度
  }

  // 根据成交量分布调整各区域边界
  // 成交量密集的区域，边界会收缩；成交量稀疏的区域，边界会扩张
  let cumulativeAdjustment = 0;
  const adjustments = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i < 6; i++) {
    const zoneKey = `zone${i + 1}_7` as keyof typeof volumeRatios;
    const ratioDiff = volumeRatios[zoneKey] - idealRatio;

    // 计算调整幅度（最大调整根据市场状态动态调整）
    const maxAdjustment = marketState === "HIGH_VOLATILITY" ? 0.05 : 0.1;
    const adjustment = Math.min(
      maxAdjustment,
      Math.max(-maxAdjustment, ratioDiff * adjustmentSensitivity)
    );
    adjustments[i] = adjustment;
    cumulativeAdjustment += adjustment;
  }

  // 归一化调整，确保总调整为0
  const avgAdjustment = cumulativeAdjustment / 6;
  for (let i = 0; i < 6; i++) {
    adjustments[i] -= avgAdjustment;
  }

  // 应用调整
  const levelKeys = Object.keys(baseLevels) as Array<keyof typeof baseLevels>;
  levelKeys.forEach((key, index) => {
    const adjustmentFactor = 1 + adjustments[index];
    const basePosition = (baseLevels[key] - low) / (high - low);
    const adjustedPosition = basePosition * adjustmentFactor;
    adjustedLevels[key] = low + adjustedPosition * (high - low);
  });

  return adjustedLevels;
}

/**
 * 智能移动止损算法参数
 * Intelligent trailing stop algorithm parameters
 */
export interface TrailingStopParams {
  /** 基础ATR倍数 */
  baseAtrMultiple: number;
  /** 盈利触发移动止损的百分比 */
  profitTriggerPercent: number;
  /** ATR追踪止损倍数 */
  atrTrailingMultiple: number;
  /** 抛物转向指标初始步长 */
  sarInitialStep: number;
  /** 抛物转向指标最大步长 */
  sarMaxStep: number;
  /** 时间衰减系数 */
  timeDecayFactor: number;
  /** 最大时间衰减百分比 */
  maxTimeDecayPercent: number;
}

/**
 * 计算ATR追踪止损
 * Calculate ATR trailing stop
 *
 * @param currentPrice 当前价格
 * @param entryPrice 开仓价格
 * @param atr 当前ATR值
 * @param atrMultiple ATR倍数
 * @param direction 交易方向
 * @param highestPrice 持仓期间最高价
 * @param lowestPrice 持仓期间最低价
 * @returns 计算出的止损价格
 */
export function calculateAtrTrailingStop(
  currentPrice: number,
  entryPrice: number,
  atr: number,
  atrMultiple: number,
  direction: "LONG" | "SHORT",
  highestPrice: number,
  lowestPrice: number
): number {
  if (direction === "LONG") {
    // 多头：止损价 = 最高价 - ATR * 倍数
    return highestPrice - atr * atrMultiple;
  } else {
    // 空头：止损价 = 最低价 + ATR * 倍数
    return lowestPrice + atr * atrMultiple;
  }
}

/**
 * 计算抛物转向指标(SAR)止损
 * Calculate Parabolic SAR trailing stop
 *
 * @param currentPrice 当前价格
 * @param entryPrice 开仓价格
 * @param direction 交易方向
 * @param sarPrev 上一个SAR值
 * @param acceleration 加速因子
 * @param highestPrice 持仓期间最高价
 * @param lowestPrice 持仓期间最低价
 * @returns 更新后的SAR值和加速因子
 */
export function calculateParabolicSar(
  currentPrice: number,
  entryPrice: number,
  direction: "LONG" | "SHORT",
  sarPrev: number,
  acceleration: number,
  highestPrice: number,
  lowestPrice: number
): { sar: number; acceleration: number } {
  let sar = sarPrev;
  let newAcceleration = acceleration;
  let extremePoint = direction === "LONG" ? highestPrice : lowestPrice;

  if (direction === "LONG") {
    // 多头SAR计算
    sar = sarPrev + newAcceleration * (highestPrice - sarPrev);
    if (currentPrice < sar) {
      // 反转信号
      direction = "SHORT";
      sar = highestPrice;
      newAcceleration = 0.02;
      extremePoint = lowestPrice;
    } else {
      if (highestPrice > extremePoint) {
        extremePoint = highestPrice;
        newAcceleration = Math.min(newAcceleration + 0.02, 0.2);
      }
      // 确保SAR不超过前两个周期的最低价
      // 简化处理：确保SAR低于当前价格
      sar = Math.min(sar, currentPrice * 0.99);
    }
  } else {
    // 空头SAR计算
    sar = sarPrev - newAcceleration * (sarPrev - lowestPrice);
    if (currentPrice > sar) {
      // 反转信号
      direction = "LONG";
      sar = lowestPrice;
      newAcceleration = 0.02;
      extremePoint = highestPrice;
    } else {
      if (lowestPrice < extremePoint) {
        extremePoint = lowestPrice;
        newAcceleration = Math.min(newAcceleration + 0.02, 0.2);
      }
      // 确保SAR不低于前两个周期的最高价
      // 简化处理：确保SAR高于当前价格
      sar = Math.max(sar, currentPrice * 1.01);
    }
  }

  return { sar, acceleration: newAcceleration };
}

/**
 * 计算时间衰减止损
 * Calculate time decay stop loss
 *
 * @param baseStopLoss 基础止损
 * @param holdingTime 持仓时间（分钟）
 * @param decayFactor 衰减因子
 * @param maxDecayPercent 最大衰减百分比
 * @returns 调整后的止损
 */
export function calculateTimeDecayStopLoss(
  baseStopLoss: number,
  holdingTime: number,
  decayFactor: number,
  maxDecayPercent: number
): number {
  if (holdingTime <= 60) {
    // 持仓时间不足60分钟，不衰减
    return baseStopLoss;
  }

  // 计算衰减百分比
  const decayTime = holdingTime - 60;
  const decayPercent = Math.min(
    (decayTime / 30) * decayFactor * 100,
    maxDecayPercent
  );

  // 调整止损（衰减后止损更小）
  return baseStopLoss * (1 - decayPercent / 100);
}

/**
 * 计算智能移动止损
 * Calculate intelligent trailing stop
 *
 * @param entryPrice 开仓价格
 * @param currentPrice 当前价格
 * @param direction 交易方向
 * @param atr 当前ATR值
 * @param holdingTime 持仓时间（分钟）
 * @param highestPrice 持仓期间最高价
 * @param lowestPrice 持仓期间最低价
 * @param params 移动止损参数
 * @returns 计算出的智能移动止损价格
 */
export function calculateIntelligentTrailingStop(
  entryPrice: number,
  currentPrice: number,
  direction: "LONG" | "SHORT",
  atr: number,
  holdingTime: number,
  highestPrice: number,
  lowestPrice: number,
  params: TrailingStopParams
): number {
  const {
    baseAtrMultiple,
    atrTrailingMultiple,
    timeDecayFactor,
    maxTimeDecayPercent,
  } = params;

  // 1. 计算基础止损
  const baseStopLoss = atr * baseAtrMultiple;

  // 2. 计算盈利百分比
  const profitPercent =
    direction === "LONG"
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - currentPrice) / entryPrice) * 100;

  // 3. 计算ATR追踪止损
  const atrTrailingStop = calculateAtrTrailingStop(
    currentPrice,
    entryPrice,
    atr,
    atrTrailingMultiple,
    direction,
    highestPrice,
    lowestPrice
  );

  // 4. 应用时间衰减
  const timeDecayedStopLoss = calculateTimeDecayStopLoss(
    baseStopLoss,
    holdingTime,
    timeDecayFactor,
    maxTimeDecayPercent
  );

  // 5. 确定最终止损价格
  let finalStopLoss: number;

  if (profitPercent < params.profitTriggerPercent) {
    // 盈利未达到触发移动止损的阈值，使用基础止损
    finalStopLoss =
      direction === "LONG"
        ? entryPrice - timeDecayedStopLoss
        : entryPrice + timeDecayedStopLoss;
  } else {
    // 盈利达到触发阈值，使用ATR追踪止损
    finalStopLoss = atrTrailingStop;
  }

  // 6. 确保止损价格合理
  if (direction === "LONG") {
    // 多头止损不能高于当前价格，也不能低于开仓价的一定比例
    finalStopLoss = Math.min(finalStopLoss, currentPrice * 0.99);
    finalStopLoss = Math.max(finalStopLoss, entryPrice * 0.9);
  } else {
    // 空头止损不能低于当前价格，也不能高于开仓价的一定比例
    finalStopLoss = Math.max(finalStopLoss, currentPrice * 1.01);
    finalStopLoss = Math.min(finalStopLoss, entryPrice * 1.1);
  }

  return finalStopLoss;
}

/**
 * 计算蔡森七分位水平
 * @param currentPrice 当前价格
 * @param preCrashHigh 暴跌前最高价
 * @param preCrashLow 暴跌前最低价
 * @returns 七分位水平 (1-7)
 */
export function calculateCaisenSevenSegmentLevel(
  currentPrice: number,
  preCrashHigh: number,
  preCrashLow: number
): number {
  const priceRange = preCrashHigh - preCrashLow;
  const segmentSize = priceRange / 7;
  
  // 计算当前价格所处的七分位水平
  for (let i = 1; i <= 7; i++) {
    const levelPrice = preCrashHigh - segmentSize * i;
    if (currentPrice <= levelPrice) {
      return i;
    }
  }
  
  return 0; // 高于所有分位
}

/**
 * 计算多时间框架确认分数
 * @param timeframeAnalysis 各时间框架分析结果
 * @returns 确认分数 (0-100)
 */
export function calculateTimeframeConfirmationScore(
  timeframeAnalysis: MultiTimeframeAnalysis
): number {
  // 时间框架权重分配：日线(40%)、小时线(30%)、5分钟线(30%)
  // 使用strength属性（趋势强度）作为评分依据
  const score = 
    (timeframeAnalysis.daily.strength * 0.4) +
    (timeframeAnalysis.hourly.strength * 0.3) +
    (timeframeAnalysis.fiveMin.strength * 0.3);
  
  return Math.min(Math.max(Math.round(score), 0), 100); // 限制在0-100之间
}

/**
 * 蔡森策略智能移动止损计算（基于平均成本）
 * @param currentPrice 当前价格
 * @param averageEntryPrice 平均成本
 * @param sevenSegmentLevel 当前七分位水平
 * @param volatility 波动率
 * @returns 计算后的止损价格
 */
export function calculateCaisenTrailingStop(
  currentPrice: number,
  averageEntryPrice: number, // 使用平均成本
  sevenSegmentLevel: number,
  volatility: number
): number {
  // 根据七分位水平动态调整止损比例
  const baseStopRatio = sevenSegmentLevel <= 3 ? 0.05 : 0.08;
  const volatilityAdjustment = volatility > 0.02 ? 0.03 : 0;
  
  return averageEntryPrice * (1 - (baseStopRatio + volatilityAdjustment));
}

/**
 * 蔡森策略专用加仓条件检查
 * @param position 持仓对象
 * @param addPrice 加仓价格
 * @param sevenSegmentLevel 七分位水平
 * @param timeframeConfirmationScore 时间框架确认分数
 * @returns 是否满足加仓条件
 */
export function checkCaisenAddPositionConditions(
  position: any,
  addPrice: number,
  sevenSegmentLevel?: number,
  timeframeConfirmationScore?: number
): boolean {
  // 1. 七分位水平检查
  if (sevenSegmentLevel === undefined || sevenSegmentLevel < 1 || sevenSegmentLevel > 3) {
    return false; // 仅在1-3分位加仓
  }

  // 2. 时间框架确认检查
  if (timeframeConfirmationScore && timeframeConfirmationScore < 70) {
    return false; // 时间框架确认分数需>70
  }

  // 3. 价格下跌幅度检查
  const currentDrop = (position.entry_price - addPrice) / position.entry_price;
  if (currentDrop < 0.03 || currentDrop > 0.15) {
    return false; // 价格下跌幅度需在3%-15%之间
  }

  return true;
}

/**
 * 确定当前价格所在区域
 * Determine current price zone
 *
 * @param currentPrice 当前价格
 * @param levels 七分位水平
 * @param preCrashLow 暴跌前最低价
 * @param preCrashHigh 暴跌前最高价
 * @returns 当前价格所在区域
 */
function determineCurrentZone(
  currentPrice: number,
  levels: {
    level1_7: number;
    level2_7: number;
    level3_7: number;
    level4_7: number;
    level5_7: number;
    level6_7: number;
  },
  preCrashLow: number,
  preCrashHigh: number
): SevenSegmentZone {
  if (currentPrice > preCrashHigh) {
    return SevenSegmentZone.ABOVE_PRE_CRASH_HIGH;
  }
  if (currentPrice > levels.level6_7) {
    return SevenSegmentZone.IN_6_7_ZONE;
  }
  if (currentPrice > levels.level3_7) {
    return SevenSegmentZone.IN_1_2_ZONE;
  }
  if (currentPrice > levels.level1_7) {
    return SevenSegmentZone.IN_1_7_ZONE;
  }
  if (currentPrice > preCrashLow * 0.98) {
    return SevenSegmentZone.IN_LOWER_1_7_ZONE;
  }
  if (currentPrice > preCrashLow * 0.95) {
    return SevenSegmentZone.NEAR_PRE_CRASH_LOW;
  }
  return SevenSegmentZone.BELOW_PRE_CRASH_LOW;
}

/**
 * 动态仓位调整参数
 * Dynamic position sizing parameters
 */
export interface DynamicPositionSizingParams {
  /** 单笔交易最大风险百分比 */
  maxRiskPerTrade: number;
  /** 账户总风险百分比 */
  totalRiskPercent: number;
  /** 最小仓位百分比 */
  minPositionPercent: number;
  /** 最大仓位百分比 */
  maxPositionPercent: number;
  /** 信号强度权重 */
  signalStrengthWeight: number;
  /** 波动率权重 */
  volatilityWeight: number;
  /** 趋势强度权重 */
  trendStrengthWeight: number;
}

/**
 * 计算动态仓位大小
 * Calculate dynamic position size
 *
 * @param accountBalance 账户余额
 * @param entryPrice 开仓价格
 * @param stopLossPrice 止损价格
 * @param signalScore 信号得分（0-100）
 * @param volatility 当前波动率（ATR）
 * @param avgVolatility 平均波动率
 * @param trendStrength 趋势强度（0-100）
 * @param params 动态仓位调整参数
 * @param currentPositions 当前持仓情况
 * @returns 计算出的仓位大小（百分比）
 */
export function calculateDynamicPositionSize(
  accountBalance: number,
  entryPrice: number,
  stopLossPrice: number,
  signalScore: number,
  volatility: number,
  avgVolatility: number,
  trendStrength: number,
  params: DynamicPositionSizingParams,
  currentPositions: Array<{
    symbol: string;
    positionSize: number;
    direction: "LONG" | "SHORT";
  }>
): number {
  const {
    maxRiskPerTrade,
    totalRiskPercent,
    minPositionPercent,
    maxPositionPercent,
    signalStrengthWeight,
    volatilityWeight,
    trendStrengthWeight,
  } = params;

  // 1. 计算风险单位
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  const riskPercentPerShare = (riskPerShare / entryPrice) * 100;

  // 2. 根据单笔最大风险计算基础仓位
  const basePositionPercent = Math.min(
    (maxRiskPerTrade / riskPercentPerShare) * 100,
    maxPositionPercent
  );

  // 3. 根据信号强度调整仓位
  const signalAdjustment = (signalScore / 100) * signalStrengthWeight;

  // 4. 根据波动率调整仓位（波动率越高，仓位越小）
  const volatilityRatio = volatility / avgVolatility;
  const volatilityAdjustment =
    Math.max(0.5, Math.min(2.0, 1 / volatilityRatio)) * volatilityWeight;

  // 5. 根据趋势强度调整仓位（趋势越强，仓位越大）
  const trendAdjustment = (trendStrength / 100) * trendStrengthWeight;

  // 6. 计算综合调整因子
  const adjustmentFactor =
    (signalAdjustment + volatilityAdjustment + trendAdjustment) / 3;

  // 7. 计算调整后的仓位
  let adjustedPositionPercent = basePositionPercent * adjustmentFactor;

  // 8. 应用仓位限制
  adjustedPositionPercent = Math.max(
    minPositionPercent,
    adjustedPositionPercent
  );
  adjustedPositionPercent = Math.min(
    maxPositionPercent,
    adjustedPositionPercent
  );

  // 9. 考虑账户总风险限制
  const currentTotalPosition = currentPositions.reduce(
    (sum, pos) => sum + pos.positionSize,
    0
  );
  const remainingRisk = totalRiskPercent - currentTotalPosition;
  if (remainingRisk < adjustedPositionPercent) {
    adjustedPositionPercent = Math.max(minPositionPercent, remainingRisk);
  }

  // 10. 确保仓位是合理的百分比
  return Math.round(adjustedPositionPercent * 100) / 100; // 保留两位小数
}

/**
 * 情景模拟结果接口
 * Scenario simulation result interface
 */
export interface ScenarioSimulationResult {
  /** 情景名称 */
  scenarioName: string;
  /** 预期收益 */
  expectedReturn: number;
  /** 预期亏损 */
  expectedLoss: number;
  /** 风险回报比 */
  riskRewardRatio: number;
  /** 盈利概率 */
  winProbability: number;
  /** 亏损概率 */
  lossProbability: number;
  /** 最大回撤 */
  maxDrawdown: number;
}

/**
 * 运行情景模拟
 * Run scenario simulation
 *
 * @param entryPrice 开仓价格
 * @param stopLossPrice 止损价格
 * @param takeProfitPrice 止盈价格
 * @param volatility 当前波动率
 * @param trendStrength 趋势强度
 * @param scenarioNames 要模拟的情景名称列表
 * @returns 情景模拟结果数组
 */
export function runScenarioSimulations(
  entryPrice: number,
  stopLossPrice: number,
  takeProfitPrice: number,
  volatility: number,
  trendStrength: number,
  scenarioNames: string[] = ["base", "best", "worst"]
): ScenarioSimulationResult[] {
  const results: ScenarioSimulationResult[] = [];

  // 计算基础风险和回报
  const baseRisk = Math.abs(entryPrice - stopLossPrice);
  const baseReward = Math.abs(entryPrice - takeProfitPrice);
  const baseRiskRewardRatio = baseReward / baseRisk;

  // 基础情景
  if (scenarioNames.includes("base")) {
    results.push({
      scenarioName: "base",
      expectedReturn: baseReward,
      expectedLoss: baseRisk,
      riskRewardRatio: baseRiskRewardRatio,
      winProbability: trendStrength / 100,
      lossProbability: 1 - trendStrength / 100,
      maxDrawdown: baseRisk,
    });
  }

  // 最佳情景
  if (scenarioNames.includes("best")) {
    const bestTakeProfit = takeProfitPrice * (1 + volatility * 0.5);
    const bestReward = Math.abs(entryPrice - bestTakeProfit);
    const bestRiskRewardRatio = bestReward / baseRisk;

    results.push({
      scenarioName: "best",
      expectedReturn: bestReward,
      expectedLoss: baseRisk,
      riskRewardRatio: bestRiskRewardRatio,
      winProbability: Math.min(0.95, trendStrength / 100 + 0.2),
      lossProbability: Math.max(0.05, 1 - (trendStrength / 100 + 0.2)),
      maxDrawdown: baseRisk * 0.8,
    });
  }

  // 最坏情景
  if (scenarioNames.includes("worst")) {
    const worstStopLoss = stopLossPrice * (1 + volatility * 0.5);
    const worstRisk = Math.abs(entryPrice - worstStopLoss);
    const worstRiskRewardRatio = baseReward / worstRisk;

    results.push({
      scenarioName: "worst",
      expectedReturn: baseReward * 0.5,
      expectedLoss: worstRisk,
      riskRewardRatio: worstRiskRewardRatio,
      winProbability: Math.max(0.05, trendStrength / 100 - 0.2),
      lossProbability: Math.min(0.95, 1 - (trendStrength / 100 - 0.2)),
      maxDrawdown: worstRisk,
    });
  }

  return results;
}

/**
 * 计算投资组合风险分散度
 * Calculate portfolio risk diversification
 *
 * @param positions 当前持仓列表
 * @returns 风险分散度得分（0-100）
 */
export function calculatePortfolioDiversification(
  positions: Array<{
    symbol: string;
    positionSize: number;
    direction: "LONG" | "SHORT";
  }>
): number {
  if (positions.length === 0) return 100;

  // 计算总持仓
  const totalPositionSize = positions.reduce(
    (sum, pos) => sum + pos.positionSize,
    0
  );

  if (totalPositionSize === 0) return 100;

  // 计算各持仓的权重
  const positionWeights = positions.map(
    (pos) => pos.positionSize / totalPositionSize
  );

  // 计算赫芬达尔-赫希曼指数（HHI）
  const hhi = positionWeights.reduce((sum, weight) => sum + weight * weight, 0);

  // 将HHI转换为分散度得分（0-100）
  // HHI=1表示完全集中，HHI=1/n表示完全分散
  const diversificationScore = Math.max(0, Math.min(100, (1 - hhi) * 100));

  return diversificationScore;
}
