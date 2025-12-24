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
 * 动态止损优化系统 - 核心类型定义
 *
 * 本文件定义了动态止损系统的所有核心接口和类型
 */

// ==================== 动态止损计算相关类型 ====================

/**
 * 动态止损阈值计算结果
 */
export interface DynamicThresholdResult {
	/** 动态止损阈值（百分比，负数表示亏损） */
	threshold: number;
	/** 基础止损阈值（未应用动态因子前） */
	baseThreshold: number;
	/** 各动态因子的值 */
	factors: DynamicStopLossFactors;
	/** 阈值说明 */
	description: string;
}

/**
 * 动态止损因子
 */
export interface DynamicStopLossFactors {
	/** 趋势强度因子 (-0.2 到 0.3) */
	trendStrength: number;
	/** 波动率因子 (0 到 0.5) */
	volatility: number;
	/** 七分位因子 (-0.1 到 0.2) */
	sevenSegment: number;
	/** 成交量因子 (0 到 0.3) */
	volume: number;
	/** 时间衰减因子 (0 到 0.4) */
	timeDecay: number;
}

/**
 * 动态阈值计算参数
 */
export interface DynamicThresholdParams {
	/** 交易币种 */
	symbol: string;
	/** 杠杆倍数 */
	leverage: number;
	/** 持仓方向 */
	side: "long" | "short";
	/** 开仓价格 */
	entryPrice: number;
	/** 当前价格 */
	currentPrice: number;
	/** 持仓时间（秒） */
	holdingTime: number;
}

// ==================== 指标计算相关类型 ====================

/**
 * 动态指标集合
 */
export interface DynamicIndicators {
	/** 趋势强度 (-100 到 100) */
	trendStrength: number;
	/** 波动率信息 */
	volatility: VolatilityInfo;
	/** 七分位位置 (1-7) */
	sevenSegmentLevel: number;
	/** 成交量因子 (0-100) */
	volumeFactor: number;
	/** 时间衰减因子 (0-1) */
	timeDecayFactor: number;
	/** 市场情绪 */
	marketSentiment: MarketSentimentInfo;
}

/**
 * 波动率信息
 */
export interface VolatilityInfo {
	/** ATR 波动率 */
	atr: number;
	/** 历史波动率 */
	historical: number;
	/** 归一化波动率 (0-100) */
	normalized: number;
}

/**
 * 市场情绪信息
 */
export interface MarketSentimentInfo {
	/** RSI 指标 (0-100) */
	rsi: number;
	/** MACD 指标 */
	macd: number;
	/** 综合情绪得分 (0-100) */
	sentiment: number;
}

// ==================== 蔡森策略整合相关类型 ====================

/**
 * 蔡森止损因子
 */
export interface CaisenStopLossFactors {
	/** 多时间框架趋势得分 (-100 到 100) */
	multiTimeframeTrendScore: number;
	/** 七分位调整因子 (-0.1 到 0.2) */
	sevenSegmentAdjustment: number;
	/** 趋势一致性得分 (0-100) */
	trendConsistency: number;
	/** 支撑位接近度 (0-1) */
	supportProximity: number;
	/** 阻力位接近度 (0-1) */
	resistanceProximity: number;
}

/**
 * 支撑位和阻力位信息
 */
export interface SupportResistanceLevels {
	/** 支撑位价格数组 */
	support: number[];
	/** 阻力位价格数组 */
	resistance: number[];
}

// ==================== AI 判断相关类型 ====================

/**
 * AI 止损判断参数
 */
export interface AIStopLossJudgmentParams {
	/** 仓位 ID */
	positionId: string;
	/** 交易币种 */
	symbol: string;
	/** 盈亏百分比 */
	pnlPercent: number;
	/** 杠杆倍数 */
	leverage: number;
	/** 动态指标 */
	dynamicIndicators: DynamicIndicators;
}

/**
 * AI 止损判断结果
 */
export interface AIStopLossJudgmentResult {
	/** 推荐操作 */
	recommendedAction: "close_position" | "hold_position" | "reduce_position";
	/** 波动类型 */
	volatilityType: "偶发性波动" | "行情异常" | "趋势反转";
	/** 置信度 (0-1) */
	confidence: number;
	/** 判断原因 */
	reason: string;
}

// ==================== 数据库记录类型 ====================

/**
 * 动态止损指标记录
 */
export interface DynamicIndicatorsRecord {
	/** 时间戳 */
	timestamp: number;
	/** 交易币种 */
	symbol: string;
	/** 趋势强度 */
	trendStrength: number;
	/** ATR 波动率 */
	volatilityAtr: number;
	/** 历史波动率 */
	volatilityHistorical: number;
	/** 七分位位置 */
	sevenSegmentLevel: number;
	/** 成交量因子 */
	volumeFactor: number;
	/** 时间衰减因子 */
	timeDecayFactor: number;
	/** 市场情绪 */
	marketSentiment: number;
	/** RSI 指标 */
	rsi?: number;
	/** MACD 指标 */
	macd?: number;
}

/**
 * 止损决策记录
 */
export interface StopLossDecisionRecord {
	/** 时间戳 */
	timestamp: number;
	/** 交易币种 */
	symbol: string;
	/** 仓位 ID */
	positionId: string;
	/** 开仓价格 */
	entryPrice: number;
	/** 当前价格 */
	currentPrice: number;
	/** 盈亏百分比 */
	pnlPercent: number;
	/** 杠杆倍数 */
	leverage: number;
	/** 基础止损阈值 */
	baseThreshold: number;
	/** 动态止损阈值 */
	dynamicThreshold: number;
	/** 动态因子（JSON 字符串） */
	dynamicFactors: string;
	/** 决策结果 */
	decision: "close" | "hold";
	/** AI 判断结果（JSON 字符串） */
	aiJudgment?: string;
	/** 决策原因 */
	reason: string;
}

/**
 * 蔡森策略分析结果记录
 */
export interface CaisenStrategyResultRecord {
	/** 时间戳 */
	timestamp: number;
	/** 交易币种 */
	symbol: string;
	/** 日线趋势 */
	dailyTrend: "up" | "down" | "neutral";
	/** 小时线趋势 */
	hourlyTrend: "up" | "down" | "neutral";
	/** 5分钟线趋势 */
	fiveMinuteTrend: "up" | "down" | "neutral";
	/** 多时间框架得分 */
	multiTimeframeScore: number;
	/** 支撑位 */
	supportLevel?: number;
	/** 阻力位 */
	resistanceLevel?: number;
	/** 七分位分析（JSON 字符串） */
	sevenSegmentAnalysis?: string;
	/** 趋势一致性 */
	trendConsistency: number;
}

/**
 * 止损配置变更历史记录
 */
export interface StopLossConfigHistoryRecord {
	/** 时间戳 */
	timestamp: number;
	/** 配置键 */
	configKey: string;
	/** 旧值 */
	oldValue?: string;
	/** 新值 */
	newValue: string;
	/** 变更人 */
	changedBy?: string;
	/** 变更原因 */
	reason?: string;
}

// ==================== 缓存相关类型 ====================

/**
 * 缓存项
 */
export interface CacheItem<T> {
	/** 缓存数据 */
	data: T;
	/** 缓存时间戳 */
	timestamp: number;
	/** 生存时间（毫秒） */
	ttl: number;
}

/**
 * 追踪止损状态
 */
export interface TrailingStopState {
	/** 峰值价格（做多时为最高价，做空时为最低价） */
	peakPrice: number;
	/** 追踪止损价格 */
	trailingStopPrice: number;
	/** 最后更新时间 */
	lastUpdateTime: number;
}

/**
 * 动态止损缓存
 */
export interface DynamicStopLossCache {
	/** 指标缓存：symbol -> 指标数据 */
	indicators: Map<string, CacheItem<DynamicIndicatorsRecord>>;
	/** 蔡森分析缓存：symbol -> 分析结果 */
	caisenAnalysis: Map<string, CacheItem<CaisenStrategyResultRecord>>;
	/** 追踪止损状态：symbol -> 追踪状态 */
	trailingStopState: Map<string, TrailingStopState>;
}

// ==================== 配置相关类型 ====================

/**
 * 动态止损配置
 */
export interface DynamicStopLossConfig {
	/** 是否启用动态止损 */
	enabled: boolean;
	/** 基础止损百分比范围 */
	baseThresholdRange: {
		min: number;
		max: number;
	};
	/** 动态因子权重范围 */
	factorWeights: {
		trendStrength: { min: number; max: number };
		volatility: { min: number; max: number };
		sevenSegment: { min: number; max: number };
		volume: { min: number; max: number };
		timeDecay: { min: number; max: number };
	};
	/** 指标计算周期参数 */
	indicatorPeriods: {
		trendStrength: number;
		volatility: number;
		sevenSegment: number;
		volume: number;
	};
	/** 缓存配置 */
	cache: {
		indicatorsTTL: number; // 指标缓存有效期（毫秒）
		caisenAnalysisTTL: number; // 蔡森分析缓存有效期（毫秒）
	};
	/** AI 判断器配置 */
	aiJudgment: {
		enabled: boolean;
		timeout: number; // 超时时间（毫秒）
		confidenceThreshold: number; // 置信度阈值
	};
}

/**
 * 追踪止损计算参数
 */
export interface TrailingStopParams {
	/** 交易币种 */
	symbol: string;
	/** 持仓方向 */
	side: "long" | "short";
	/** 开仓价格 */
	entryPrice: number;
	/** 当前价格 */
	currentPrice: number;
	/** 峰值价格 */
	peakPrice: number;
}

// ==================== 监控和告警相关类型 ====================

/**
 * 告警级别
 */
export type AlertLevel = "info" | "warning" | "error";

/**
 * 告警信息
 */
export interface AlertInfo {
	/** 时间戳 */
	timestamp: number;
	/** 告警级别 */
	level: AlertLevel;
	/** 告警消息 */
	message: string;
	/** 告警详情 */
	details?: Record<string, unknown>;
}

/**
 * 系统运行状态
 */
export interface SystemStatus {
	/** 系统运行时间（毫秒） */
	uptime: number;
	/** 最后更新时间 */
	lastUpdateTime: number;
	/** 止损触发总次数 */
	stopLossTriggersCount: number;
	/** 最近触发次数（1小时内） */
	recentTriggersCount: number;
	/** 平均性能指标 */
	averagePerformance: {
		indicatorCalculation: number;
		thresholdCalculation: number;
		aiJudgment: number;
		databaseOperation: number;
	};
	/** 错误计数 */
	errorCounts: {
		indicatorCalculation: number;
		thresholdCalculation: number;
		aiJudgment: number;
		databaseOperation: number;
	};
	/** 最近告警次数（1小时内） */
	recentAlertsCount: number;
	/** 按级别统计的告警次数 */
	alertsByLevel: {
		info: number;
		warning: number;
		error: number;
	};
}

/**
 * 运行报告
 */
export interface RunReport {
	/** 报告生成时间戳 */
	timestamp: number;
	/** 报告时间范围 */
	period: {
		start: number;
		end: number;
		duration: number;
	};
	/** 止损触发统计 */
	stopLossTriggers: {
		total: number;
		byReason: Record<string, number>;
	};
	/** 告警统计 */
	alerts: {
		total: number;
		byLevel: {
			info: number;
			warning: number;
			error: number;
		};
	};
	/** 性能指标 */
	performance: {
		indicatorCalculation: {
			avg: number;
			max: number;
			min: number;
		};
		thresholdCalculation: {
			avg: number;
			max: number;
			min: number;
		};
		aiJudgment: {
			avg: number;
			max: number;
			min: number;
		};
		databaseOperation: {
			avg: number;
			max: number;
			min: number;
		};
	};
	/** 错误统计 */
	errors: {
		indicatorCalculation: number;
		thresholdCalculation: number;
		aiJudgment: number;
		databaseOperation: number;
	};
}
