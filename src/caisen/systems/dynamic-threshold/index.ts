/**
 * 蔡森专用动态阈值设定系统
 * CaiSen Dedicated Dynamic Threshold Setting System
 *
 * 该模块负责止盈止损阈值的动态设定功能，支持分批平仓功能及由蔡森Agent传入并更新阈值参数
 * This module is responsible for dynamic setting of stop loss/take profit thresholds, supporting batch closing and parameter updates from CaiSen Agent
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import { logger } from "../../../utils/loggerUtils";
import {
	type CaiSenAiParameterControl,
	ClosingParameterDetail,
} from "../ai-parameter-control";
import {
	BatchConfig,
	type CaiSenBatchClosingSystem,
	ClosingType,
} from "../batch-closing";

/**
 * 阈值类型枚举
 * Threshold Type Enumeration
 */
export enum ThresholdType {
	STOP_LOSS = "stop_loss", // 止损 - Stop loss
	TAKE_PROFIT = "take_profit", // 止盈 - Take profit
	TRAILING_STOP = "trailing_stop", // 移动止损 - Trailing stop
	PARTIAL_PROFIT = "partial_profit", // 分批止盈 - Partial profit
}

/**
 * 阈值状态枚举
 * Threshold Status Enumeration
 */
export enum ThresholdStatus {
	INACTIVE = "inactive", // 未激活 - Inactive
	ACTIVE = "active", // 已激活 - Active
	TRIGGERED = "triggered", // 已触发 - Triggered
	EXPIRED = "expired", // 已过期 - Expired
	CANCELLED = "cancelled", // 已取消 - Cancelled
}

/**
 * 阈值来源枚举
 * Threshold Source Enumeration
 */
export enum ThresholdSource {
	AI_AGENT = "ai_agent", // AI代理 - AI Agent
	SYSTEM = "system", // 系统 - System
	MANUAL = "manual", // 手动 - Manual
	API = "api", // API - API
}

/**
 * 阈值计算方法枚举
 * Threshold Calculation Method Enumeration
 */
export enum ThresholdCalculationMethod {
	FIXED = "fixed", // 固定值 - Fixed value
	PERCENTAGE = "percentage", // 百分比 - Percentage
	ATR = "atr", // ATR - Average True Range
	BOLLINGER = "bollinger", // 布林带 - Bollinger Bands
	FIBONACCI = "fibonacci", // 斐波那契 - Fibonacci
	PIVOT = "pivot", // 轴点 - Pivot
	CUSTOM = "custom", // 自定义 - Custom
}

/**
 * 动态阈值接口
 * Dynamic Threshold Interface
 */
export interface DynamicThreshold {
	/** 阈值ID - Threshold ID */
	thresholdId: string;

	/** 阈值类型 - Threshold type */
	type: ThresholdType;

	/** 阈值状态 - Threshold status */
	status: ThresholdStatus;

	/** 阈值来源 - Threshold source */
	source: ThresholdSource;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 入场价格 - Entry price */
	entryPrice: number;

	/** 当前价格 - Current price */
	currentPrice: number;

	/** 阈值计算方法 - Threshold calculation method */
	calculationMethod: ThresholdCalculationMethod;

	/** 阈值参数 - Threshold parameters */
	parameters: ThresholdParameters;

	/** 触发条件 - Trigger conditions */
	triggerConditions?: TriggerCondition[];

	/** 更新规则 - Update rules */
	updateRules?: UpdateRule[];

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 更新时间 - Update time */
	updatedAt: number;

	/** 触发时间 - Trigger time */
	triggeredAt?: number;

	/** 过期时间 - Expiration time */
	expiresAt?: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 阈值参数接口
 * Threshold Parameters Interface
 */
export interface ThresholdParameters {
	/** 固定阈值 - Fixed threshold */
	fixedValue?: number;

	/** 百分比阈值 - Percentage threshold */
	percentage?: number;

	/** ATR倍数 - ATR multiplier */
	atrMultiplier?: number;

	/** ATR周期 - ATR period */
	atrPeriod?: number;

	/** 布林带周期 - Bollinger period */
	bollingerPeriod?: number;

	/** 布林带标准差倍数 - Bollinger standard deviation multiplier */
	bollingerStdDev?: number;

	/** 斐波那契回撤水平 - Fibonacci retracement level */
	fibLevel?: number;

	/** 轴点类型 - Pivot type */
	pivotType?: "classic" | "woodie" | "camarilla" | "fibonacci";

	/** 自定义计算函数 - Custom calculation function */
	customFunction?: string;

	/** 最小阈值 - Minimum threshold */
	minThreshold?: number;

	/** 最大阈值 - Maximum threshold */
	maxThreshold?: number;

	/** 阈值步长 - Threshold step */
	stepSize?: number;
}

/**
 * 触发条件接口
 * Trigger Condition Interface
 */
export interface TriggerCondition {
	/** 条件ID - Condition ID */
	conditionId: string;

	/** 条件类型 - Condition type */
	type: "time" | "volume" | "price" | "indicator" | "custom";

	/** 条件参数 - Condition parameters */
	parameters: Record<string, any>;

	/** 是否启用 - Whether enabled */
	enabled: boolean;

	/** 是否已触发 - Whether triggered */
	triggered: boolean;

	/** 触发时间 - Trigger time */
	triggeredAt?: number;
}

/**
 * 更新规则接口
 * Update Rule Interface
 */
export interface UpdateRule {
	/** 规则ID - Rule ID */
	ruleId: string;

	/** 规则类型 - Rule type */
	type: "time_based" | "price_based" | "volume_based" | "indicator_based" | "custom";

	/** 规则参数 - Rule parameters */
	parameters: Record<string, any>;

	/** 是否启用 - Whether enabled */
	enabled: boolean;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt?: number;

	/** 更新间隔 - Update interval */
	updateInterval: number;
}

/**
 * 阈值设定配置接口
 * Threshold Setting Configuration Interface
 */
export interface ThresholdSettingConfig {
	/** 是否启用自动计算 - Whether to enable automatic calculation */
	enableAutoCalculation: boolean;

	/** 是否启用自动更新 - Whether to enable automatic update */
	enableAutoUpdate: boolean;

	/** 计算间隔 - Calculation interval */
	calculationInterval: number;

	/** 更新间隔 - Update interval */
	updateInterval: number;

	/** 是否启用阈值过期 - Whether to enable threshold expiration */
	enableThresholdExpiration: boolean;

	/** 默认阈值过期时间 - Default threshold expiration time */
	defaultThresholdExpiration: number;

	/** 是否启用阈值缓存 - Whether to enable threshold caching */
	enableThresholdCaching: boolean;

	/** 缓存过期时间 - Cache expiration time */
	cacheExpiration: number;

	/** 是否启用阈值验证 - Whether to enable threshold validation */
	enableThresholdValidation: boolean;

	/** 最大阈值数量 - Maximum threshold count */
	maxThresholdCount: number;
}

/**
 * 蔡森策略动态阈值设定系统类
 * CaiSen Strategy Dynamic Threshold Setting System Class
 */
export class CaiSenDynamicThresholdSetting extends EventEmitter {
	private config: ThresholdSettingConfig;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: CaiSenAiParameterControl;

	// 存储阈值 - Storage thresholds
	private thresholds: Map<string, DynamicThreshold> = new Map();

	// 索引 - Indexes
	private positionIdToThresholdIds: Map<string, string[]> = new Map();
	private typeToThresholdIds: Map<ThresholdType, string[]> = new Map();
	private statusToThresholdIds: Map<ThresholdStatus, string[]> = new Map();

	// 缓存 - Cache
	private thresholdCache: Map<string, { threshold: DynamicThreshold; timestamp: number }> = new Map();

	// 定时器 - Timers
	private calculationTimer: NodeJS.Timeout | null = null;
	private updateTimer: NodeJS.Timeout | null = null;
	private expirationTimer: NodeJS.Timeout | null = null;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param config 阈值设定配置 - Threshold setting configuration
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 */
	constructor(
		config: ThresholdSettingConfig,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: CaiSenAiParameterControl,
	) {
		super();

		this.config = config;
		this.batchClosingSystem = batchClosingSystem;
		this.aiParameterControl = aiParameterControl;

		// 初始化索引 - Initialize indexes
		Object.values(ThresholdType).forEach((type) => {
			this.typeToThresholdIds.set(type as ThresholdType, []);
		});

		Object.values(ThresholdStatus).forEach((status) => {
			this.statusToThresholdIds.set(status as ThresholdStatus, []);
		});

		// 启动定时器 - Start timers
		this.startCalculationTimer();
		this.startUpdateTimer();
		this.startExpirationTimer();

		logger.info("CaiSen Dynamic Threshold Setting initialized", { config });
	}

	/**
	 * 设定动态阈值
	 * Set dynamic threshold
	 *
	 * @param thresholdData 阈值数据 - Threshold data
	 * @param source 阈值来源 - Threshold source
	 * @param metadata 元数据 - Metadata
	 * @returns string | null 阈值ID - Threshold ID
	 */
	setDynamicThreshold(
		thresholdData: any,
		source: ThresholdSource = ThresholdSource.AI_AGENT,
		metadata?: Record<string, any>,
	): string | null {
		try {
			// 检查阈值数量限制 - Check threshold count limit
			if (this.thresholds.size >= this.config.maxThresholdCount) {
				logger.error("Maximum threshold count reached", {
					currentCount: this.thresholds.size,
					maxCount: this.config.maxThresholdCount,
				});
				return null;
			}

			// 生成阈值ID - Generate threshold ID
			const thresholdId = `thr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// 解析阈值数据 - Parse threshold data
			const parsedThreshold = this.parseThresholdData(thresholdData);
			if (!parsedThreshold) {
				logger.error("解析阈值数据失败", { thresholdData });
				return null;
			}

			// 创建阈值对象 - Create threshold object
			const now = Date.now();
			const threshold: DynamicThreshold = {
				thresholdId,
				type: parsedThreshold.type,
				status: ThresholdStatus.INACTIVE,
				source,
				positionId: parsedThreshold.positionId,
				symbol: parsedThreshold.symbol,
				direction: parsedThreshold.direction,
				entryPrice: parsedThreshold.entryPrice,
				currentPrice: parsedThreshold.currentPrice,
				calculationMethod: parsedThreshold.calculationMethod,
				parameters: parsedThreshold.parameters,
				triggerConditions: parsedThreshold.triggerConditions,
				updateRules: parsedThreshold.updateRules,
				createdAt: now,
				updatedAt: now,
				expiresAt: this.config.enableThresholdExpiration
					? now + this.config.defaultThresholdExpiration
					: undefined,
				metadata,
			};

			// 验证阈值 - Validate threshold
			if (this.config.enableThresholdValidation && !this.validateThreshold(threshold)) {
				logger.error("阈值验证失败", { thresholdId, threshold });
				return null;
			}

			// 存储阈值 - Store threshold
			this.thresholds.set(thresholdId, threshold);

			// 更新索引 - Update indexes
			this.updateIndexes(threshold);

			// 更新缓存 - Update cache
			if (this.config.enableThresholdCaching) {
				this.updateCache(threshold);
			}

			// 发出阈值设定事件 - Emit threshold setting event
			this.emit("thresholdSet", { thresholdId, threshold });

			logger.info("Dynamic threshold set", {
				thresholdId,
				type: threshold.type,
				positionId: threshold.positionId,
				symbol: threshold.symbol,
				direction: threshold.direction,
				calculationMethod: threshold.calculationMethod,
				source,
			});

			// 如果启用自动计算，开始计算
			if (this.config.enableAutoCalculation) {
				this.calculateThreshold(thresholdId);
			}

			return thresholdId;
		} catch (error) {
			logger.error("设置动态阈值时出错", { error, thresholdData });
			return null;
		}
	}

	/**
	 * 更新动态阈值
	 * Update dynamic threshold
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @param updates 更新数据 - Update data
	 * @returns boolean 更新是否成功 - Whether update was successful
	 */
	updateDynamicThreshold(
		thresholdId: string,
		updates: Partial<DynamicThreshold>,
	): boolean {
		try {
			const threshold = this.thresholds.get(thresholdId);
			if (!threshold) {
				logger.error("Threshold not found for update", { thresholdId });
				return false;
			}

			// 更新阈值 - Update threshold
			const updatedThreshold = {
				...threshold,
				...updates,
				updatedAt: Date.now(),
			};

			// 验证更新后的阈值 - Validate updated threshold
			if (this.config.enableThresholdValidation && !this.validateThreshold(updatedThreshold)) {
				logger.error("更新阈值验证失败", { thresholdId, updates });
				return false;
			}

			// 存储更新后的阈值 - Store updated threshold
			this.thresholds.set(thresholdId, updatedThreshold);

			// 更新索引 - Update indexes
			this.updateIndexes(updatedThreshold);

			// 更新缓存 - Update cache
			if (this.config.enableThresholdCaching) {
				this.updateCache(updatedThreshold);
			}

			// 发出阈值更新事件 - Emit threshold update event
			this.emit("thresholdUpdated", { thresholdId, threshold: updatedThreshold });

			logger.info("动态阈值已更新", { thresholdId, updates });

			// 如果启用自动计算，重新计算
			if (this.config.enableAutoCalculation) {
				this.calculateThreshold(thresholdId);
			}

			return true;
		} catch (error) {
			logger.error("更新动态阈值时出错", { error, thresholdId, updates });
			return false;
		}
	}

	/**
	 * 激活阈值
	 * Activate threshold
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @returns boolean 激活是否成功 - Whether activation was successful
	 */
	activateThreshold(thresholdId: string): boolean {
		try {
			const threshold = this.thresholds.get(thresholdId);
			if (!threshold) {
				logger.error("Threshold not found for activation", { thresholdId });
				return false;
			}

			if (threshold.status === ThresholdStatus.ACTIVE) {
				logger.warn("Threshold is already active", { thresholdId });
				return true;
			}

			if (threshold.status !== ThresholdStatus.INACTIVE) {
				logger.error("Cannot activate threshold with status", { thresholdId, status: threshold.status });
				return false;
			}

			// 更新状态为已激活 - Update status to active
			return this.updateDynamicThreshold(thresholdId, { status: ThresholdStatus.ACTIVE });
		} catch (error) {
			logger.error("激活阈值时出错", { error, thresholdId });
			return false;
		}
	}

	/**
	 * 取消阈值
	 * Cancel threshold
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @returns boolean 取消是否成功 - Whether cancellation was successful
	 */
	cancelThreshold(thresholdId: string): boolean {
		try {
			const threshold = this.thresholds.get(thresholdId);
			if (!threshold) {
				logger.error("Threshold not found for cancellation", { thresholdId });
				return false;
			}

			if (threshold.status === ThresholdStatus.CANCELLED) {
				logger.warn("Threshold is already cancelled", { thresholdId });
				return true;
			}

			if (threshold.status === ThresholdStatus.TRIGGERED) {
				logger.error("Cannot cancel triggered threshold", { thresholdId });
				return false;
			}

			// 更新状态为已取消 - Update status to cancelled
			return this.updateDynamicThreshold(thresholdId, { status: ThresholdStatus.CANCELLED });
		} catch (error) {
			logger.error("取消阈值时出错", { error, thresholdId });
			return false;
		}
	}

	/**
	 * 计算阈值
	 * Calculate threshold
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @param currentPrice 当前价格 - Current price
	 * @param marketData 市场数据 - Market data
	 * @returns number | null 计算后的阈值 - Calculated threshold
	 */
	calculateThreshold(
		thresholdId: string,
		currentPrice?: number,
		marketData?: any,
	): number | null {
		try {
			const threshold = this.thresholds.get(thresholdId);
			if (!threshold) {
				logger.error("Threshold not found for calculation", { thresholdId });
				return null;
			}

			// 更新当前价格 - Update current price
			if (currentPrice !== undefined) {
				threshold.currentPrice = currentPrice;
			}

			// 根据计算方法计算阈值 - Calculate threshold based on calculation method
			let calculatedValue: number;

			switch (threshold.calculationMethod) {
				case ThresholdCalculationMethod.FIXED:
					calculatedValue = this.calculateFixedThreshold(threshold);
					break;
				case ThresholdCalculationMethod.PERCENTAGE:
					calculatedValue = this.calculatePercentageThreshold(threshold);
					break;
				case ThresholdCalculationMethod.ATR:
					calculatedValue = this.calculateAtrThreshold(threshold, marketData);
					break;
				case ThresholdCalculationMethod.BOLLINGER:
					calculatedValue = this.calculateBollingerThreshold(threshold, marketData);
					break;
				case ThresholdCalculationMethod.FIBONACCI:
					calculatedValue = this.calculateFibonacciThreshold(threshold, marketData);
					break;
				case ThresholdCalculationMethod.PIVOT:
					calculatedValue = this.calculatePivotThreshold(threshold, marketData);
					break;
				case ThresholdCalculationMethod.CUSTOM:
					calculatedValue = this.calculateCustomThreshold(threshold, marketData);
					break;
				default:
					logger.error("Unknown threshold calculation method", { thresholdId, method: threshold.calculationMethod });
					return null;
			}

			// 应用阈值限制 - Apply threshold limits
			if (threshold.parameters.minThreshold !== undefined && calculatedValue < threshold.parameters.minThreshold) {
				calculatedValue = threshold.parameters.minThreshold;
			}

			if (threshold.parameters.maxThreshold !== undefined && calculatedValue > threshold.parameters.maxThreshold) {
				calculatedValue = threshold.parameters.maxThreshold;
			}

			// 应用阈值步长 - Apply threshold step size
			if (threshold.parameters.stepSize !== undefined) {
				const step = threshold.parameters.stepSize;
				calculatedValue = Math.round(calculatedValue / step) * step;
			}

			// 更新阈值参数 - Update threshold parameters
			if (threshold.type === ThresholdType.STOP_LOSS || threshold.type === ThresholdType.TAKE_PROFIT) {
				threshold.parameters.fixedValue = calculatedValue;
			}

			// 更新阈值 - Update threshold
			threshold.updatedAt = Date.now();

			// 更新缓存 - Update cache
			if (this.config.enableThresholdCaching) {
				this.updateCache(threshold);
			}

			// 发出阈值计算事件 - Emit threshold calculation event
			this.emit("thresholdCalculated", { thresholdId, threshold, calculatedValue, currentPrice, marketData });

			logger.debug("Threshold calculated", { thresholdId, type: threshold.type, calculationMethod: threshold.calculationMethod, calculatedValue });

			return calculatedValue;
		} catch (error) {
			logger.error("计算阈值时出错", { error, thresholdId });
			return null;
		}
	}

	/**
	 * 检查阈值触发
	 * Check threshold trigger
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @param currentPrice 当前价格 - Current price
	 * @param marketData 市场数据 - Market data
	 * @returns boolean 是否触发 - Whether triggered
	 */
	checkThresholdTrigger(
		thresholdId: string,
		currentPrice?: number,
		marketData?: any,
	): boolean {
		try {
			const threshold = this.thresholds.get(thresholdId);
			if (!threshold) {
				logger.error("Threshold not found for trigger check", { thresholdId });
				return false;
			}

			if (threshold.status !== ThresholdStatus.ACTIVE) {
				return false;
			}

			// 更新当前价格 - Update current price
			if (currentPrice !== undefined) {
				threshold.currentPrice = currentPrice;
			}

			// 计算阈值 - Calculate threshold
			const calculatedValue = this.calculateThreshold(thresholdId, currentPrice, marketData);
			if (calculatedValue === null) {
				return false;
			}

			// 检查触发条件 - Check trigger conditions
			let isTriggered = false;

			if (threshold.type === ThresholdType.STOP_LOSS) {
				// 止损触发条件 - Stop loss trigger condition
				if ((threshold.direction === "long" && threshold.currentPrice <= calculatedValue) ||
					(threshold.direction === "short" && threshold.currentPrice >= calculatedValue)) {
					isTriggered = true;
				}
			} else if (threshold.type === ThresholdType.TAKE_PROFIT) {
				// 止盈触发条件 - Take profit trigger condition
				if ((threshold.direction === "long" && threshold.currentPrice >= calculatedValue) ||
					(threshold.direction === "short" && threshold.currentPrice <= calculatedValue)) {
					isTriggered = true;
				}
			} else if (threshold.type === ThresholdType.TRAILING_STOP) {
				// 移动止损触发条件 - Trailing stop trigger condition
				if ((threshold.direction === "long" && threshold.currentPrice <= calculatedValue) ||
					(threshold.direction === "short" && threshold.currentPrice >= calculatedValue)) {
					isTriggered = true;
				}
			} else if (threshold.type === ThresholdType.PARTIAL_PROFIT) {
				// 分批止盈触发条件 - Partial profit trigger condition
				if ((threshold.direction === "long" && threshold.currentPrice >= calculatedValue) ||
					(threshold.direction === "short" && threshold.currentPrice <= calculatedValue)) {
					isTriggered = true;
				}
			}

			// 检查额外触发条件 - Check additional trigger conditions
			if (isTriggered && threshold.triggerConditions) {
				for (const condition of threshold.triggerConditions) {
					if (condition.enabled && !condition.triggered) {
						const conditionMet = this.checkTriggerCondition(condition, threshold, marketData);
						if (!conditionMet) {
							isTriggered = false;
							break;
						}
					}
				}
			}

			if (isTriggered) {
				// 更新状态为已触发 - Update status to triggered
				this.updateDynamicThreshold(thresholdId, {
					status: ThresholdStatus.TRIGGERED,
					triggeredAt: Date.now(),
				});

				// 发出阈值触发事件 - Emit threshold trigger event
				this.emit("thresholdTriggered", { thresholdId, threshold, currentPrice, calculatedValue, marketData });

				logger.info("Threshold triggered", {
					thresholdId,
					type: threshold.type,
					positionId: threshold.positionId,
					symbol: threshold.symbol,
					direction: threshold.direction,
					currentPrice,
					calculatedValue,
				});
			}

			return isTriggered;
		} catch (error) {
			logger.error("检查阈值触发时出错", { error, thresholdId });
			return false;
		}
	}

	/**
	 * 获取阈值
	 * Get threshold
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @returns DynamicThreshold | null 阈值 - Threshold
	 */
	getThreshold(thresholdId: string): DynamicThreshold | null {
		// 检查缓存 - Check cache
		if (this.config.enableThresholdCaching) {
			const cached = this.thresholdCache.get(thresholdId);
			if (cached && Date.now() - cached.timestamp < this.config.cacheExpiration) {
				return cached.threshold;
			}
		}

		const threshold = this.thresholds.get(thresholdId) || null;

		// 更新缓存 - Update cache
		if (this.config.enableThresholdCaching && threshold) {
			this.updateCache(threshold);
		}

		return threshold;
	}

	/**
	 * 根据阈值ID获取阈值
	 * Get threshold by threshold ID
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @returns Promise<DynamicThreshold | null> 阈值 - Threshold
	 */
	async getThresholdByThresholdId(thresholdId: string): Promise<DynamicThreshold | null> {
		try {
			return this.getThreshold(thresholdId);
		} catch (error) {
			logger.error("获取阈值时出错", { error, thresholdId });
			return null;
		}
	}

	/**
	 * 设置多个阈值
	 * Set multiple thresholds
	 *
	 * @param thresholdsData 阈值数据数组 - Array of threshold data
	 * @returns {success: string[], errors: string[]} 设置结果 - Setting result
	 */
	setThresholds(thresholdsData: any[]): { success: string[]; errors: string[] } {
		const results = { success: [] as string[], errors: [] as string[] };

		try {
			if (!Array.isArray(thresholdsData)) {
				results.errors.push("Thresholds data must be an array");
				return results;
			}

			for (const thresholdData of thresholdsData) {
				try {
					const thresholdId = this.setDynamicThreshold(thresholdData);
					if (thresholdId) {
						results.success.push(thresholdId);
					} else {
						results.errors.push(`Failed to set threshold for position: ${thresholdData.positionId || "unknown"}`);
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Unknown error";
					results.errors.push(`Error setting threshold for position: ${thresholdData.positionId || "unknown"} - ${errorMessage}`);
				}
			}

			logger.info("Batch set thresholds completed", {
				total: thresholdsData.length,
				success: results.success.length,
				errors: results.errors.length,
			});

			return results;
		} catch (error) {
			logger.error("批量设置阈值时出错", { error, thresholdsData });
			results.errors.push("Batch operation failed");
			return results;
		}
	}

	/**
	 * 根据持仓ID获取阈值
	 * Get thresholds by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param type 可选的类型过滤器 - Optional type filter
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns DynamicThreshold[] 阈值列表 - List of thresholds
	 */
	getThresholdsByPositionId(
		positionId: string,
		type?: ThresholdType,
		status?: ThresholdStatus,
	): DynamicThreshold[] {
		const thresholdIds = this.positionIdToThresholdIds.get(positionId) || [];
		const thresholds: DynamicThreshold[] = [];

		for (const thresholdId of thresholdIds) {
			const threshold = this.getThreshold(thresholdId);
			if (threshold && (type === undefined || threshold.type === type) && (status === undefined || threshold.status === status)) {
				thresholds.push(threshold);
			}
		}

		return thresholds;
	}

	/**
	 * 根据类型获取阈值
	 * Get thresholds by type
	 *
	 * @param type 类型 - Type
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns DynamicThreshold[] 阈值列表 - List of thresholds
	 */
	getThresholdsByType(
		type: ThresholdType,
		status?: ThresholdStatus,
	): DynamicThreshold[] {
		const thresholdIds = this.typeToThresholdIds.get(type) || [];
		const thresholds: DynamicThreshold[] = [];

		for (const thresholdId of thresholdIds) {
			const threshold = this.getThreshold(thresholdId);
			if (threshold && (status === undefined || threshold.status === status)) {
				thresholds.push(threshold);
			}
		}

		return thresholds;
	}

	/**
	 * 根据状态获取阈值
	 * Get thresholds by status
	 *
	 * @param status 状态 - Status
	 * @returns DynamicThreshold[] 阈值列表 - List of thresholds
	 */
	getThresholdsByStatus(status: ThresholdStatus): DynamicThreshold[] {
		const thresholdIds = this.statusToThresholdIds.get(status) || [];
		const thresholds: DynamicThreshold[] = [];

		for (const thresholdId of thresholdIds) {
			const threshold = this.getThreshold(thresholdId);
			if (threshold) {
				thresholds.push(threshold);
			}
		}

		return thresholds;
	}

	/**
	 * 获取所有阈值
	 * Get all thresholds
	 *
	 * @param type 可选的类型过滤器 - Optional type filter
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns DynamicThreshold[] 所有阈值 - All thresholds
	 */
	getAllThresholds(
		type?: ThresholdType,
		status?: ThresholdStatus,
	): DynamicThreshold[] {
		const thresholds = Array.from(this.thresholds.values());

		if (type !== undefined) {
			return thresholds.filter(threshold => threshold.type === type && (status === undefined || threshold.status === status));
		}

		if (status !== undefined) {
			return thresholds.filter(threshold => threshold.status === status);
		}

		return thresholds;
	}

	/**
	 * 更新阈值设定配置
	 * Update threshold setting configuration
	 *
	 * @param newConfig 新配置 - New configuration
	 * @returns boolean 更新是否成功 - Whether update was successful
	 */
	updateConfig(newConfig: Partial<ThresholdSettingConfig>): boolean {
		try {
			this.config = { ...this.config, ...newConfig };

			// 重启定时器以应用新配置 - Restart timers to apply new configuration
			this.restartCalculationTimer();
			this.restartUpdateTimer();
			this.restartExpirationTimer();

			// 发出配置更新事件 - Emit configuration update event
			this.emit("configUpdated", { config: this.config });

			logger.info("动态阈值设置配置已更新", { newConfig });

			return true;
		} catch (error) {
			logger.error("更新动态阈值设置配置时出错", { error, newConfig });
			return false;
		}
	}

	/**
	 * 解析阈值数据
	 * Parse threshold data
	 * @private
	 */
	private parseThresholdData(thresholdData: any): any | null {
		try {
			// 检查必需字段 - Check required fields
			if (!thresholdData.type || !thresholdData.positionId || !thresholdData.symbol || !thresholdData.direction || !thresholdData.entryPrice) {
				logger.error("Missing required fields in threshold data", { thresholdData });
				return null;
			}

			// 解析阈值参数 - Parse threshold parameters
			let parameters: ThresholdParameters;
			if (thresholdData.parameters) {
				parameters = thresholdData.parameters;
			} else {
				// 使用默认阈值参数 - Use default threshold parameters
				parameters = {
					percentage: thresholdData.type === ThresholdType.STOP_LOSS ? 2 : 5,
				};
			}

			// 解析触发条件 - Parse trigger conditions
			let triggerConditions: TriggerCondition[] | undefined;
			if (thresholdData.triggerConditions && Array.isArray(thresholdData.triggerConditions)) {
				triggerConditions = thresholdData.triggerConditions.map((condition: any, index: number) => ({
					conditionId: condition.conditionId || `condition_${index}`,
					type: condition.type || "price",
					parameters: condition.parameters || {},
					enabled: condition.enabled !== false,
					triggered: false,
				}));
			}

			// 解析更新规则 - Parse update rules
			let updateRules: UpdateRule[] | undefined;
			if (thresholdData.updateRules && Array.isArray(thresholdData.updateRules)) {
				updateRules = thresholdData.updateRules.map((rule: any, index: number) => ({
					ruleId: rule.ruleId || `rule_${index}`,
					type: rule.type || "time_based",
					parameters: rule.parameters || {},
					enabled: rule.enabled !== false,
					updateInterval: rule.updateInterval || 60000, // 默认1分钟 - Default 1 minute
				}));
			}

			return {
				type: thresholdData.type,
				positionId: thresholdData.positionId,
				symbol: thresholdData.symbol,
				direction: thresholdData.direction,
				entryPrice: thresholdData.entryPrice,
				currentPrice: thresholdData.currentPrice || thresholdData.entryPrice,
				calculationMethod: thresholdData.calculationMethod || ThresholdCalculationMethod.PERCENTAGE,
				parameters,
				triggerConditions,
				updateRules,
			};
		} catch (error) {
			logger.error("解析阈值数据时出错", { error, thresholdData });
			return null;
		}
	}

	/**
	 * 验证阈值
	 * Validate threshold
	 * @private
	 */
	private validateThreshold(threshold: DynamicThreshold): boolean {
		try {
			// 验证基本参数 - Validate basic parameters
			if (threshold.entryPrice <= 0) {
				logger.error("Invalid entry price", { thresholdId: threshold.thresholdId, entryPrice: threshold.entryPrice });
				return false;
			}

			if (threshold.currentPrice <= 0) {
				logger.error("Invalid current price", { thresholdId: threshold.thresholdId, currentPrice: threshold.currentPrice });
				return false;
			}

			// 验证阈值参数 - Validate threshold parameters
			if (threshold.parameters.percentage !== undefined && threshold.parameters.percentage <= 0) {
				logger.error("Invalid percentage", { thresholdId: threshold.thresholdId, percentage: threshold.parameters.percentage });
				return false;
			}

			if (threshold.parameters.fixedValue !== undefined && threshold.parameters.fixedValue <= 0) {
				logger.error("Invalid fixed value", { thresholdId: threshold.thresholdId, fixedValue: threshold.parameters.fixedValue });
				return false;
			}

			// 验证触发条件 - Validate trigger conditions
			if (threshold.triggerConditions) {
				for (const condition of threshold.triggerConditions) {
					if (!condition.conditionId || !condition.type) {
						logger.error("Invalid trigger condition", { thresholdId: threshold.thresholdId, condition });
						return false;
					}
				}
			}

			// 验证更新规则 - Validate update rules
			if (threshold.updateRules) {
				for (const rule of threshold.updateRules) {
					if (!rule.ruleId || !rule.type || rule.updateInterval <= 0) {
						logger.error("Invalid update rule", { thresholdId: threshold.thresholdId, rule });
						return false;
					}
				}
			}

			return true;
		} catch (error) {
			logger.error("验证阈值时出错", { error, thresholdId: threshold.thresholdId });
			return false;
		}
	}

	/**
	 * 更新索引
	 * Update indexes
	 * @private
	 */
	private updateIndexes(threshold: DynamicThreshold): void {
		try {
			// 更新持仓ID到阈值ID的索引 - Update position ID to threshold ID index
			if (!this.positionIdToThresholdIds.has(threshold.positionId)) {
				this.positionIdToThresholdIds.set(threshold.positionId, []);
			}

			const positionThresholdIds = this.positionIdToThresholdIds.get(threshold.positionId)!;
			if (!positionThresholdIds.includes(threshold.thresholdId)) {
				positionThresholdIds.push(threshold.thresholdId);
			}

			// 更新类型到阈值ID的索引 - Update type to threshold ID index
			if (!this.typeToThresholdIds.has(threshold.type)) {
				this.typeToThresholdIds.set(threshold.type, []);
			}

			const typeThresholdIds = this.typeToThresholdIds.get(threshold.type)!;
			if (!typeThresholdIds.includes(threshold.thresholdId)) {
				typeThresholdIds.push(threshold.thresholdId);
			}

			// 更新状态到阈值ID的索引 - Update status to threshold ID index
			for (const [status, thresholdIds] of this.statusToThresholdIds.entries()) {
				const index = thresholdIds.indexOf(threshold.thresholdId);
				if (status === threshold.status) {
					if (index === -1) {
						thresholdIds.push(threshold.thresholdId);
					}
				} else if (index !== -1) {
					thresholdIds.splice(index, 1);
				}
			}
		} catch (error) {
			logger.error("更新索引时出错", { error, threshold });
		}
	}

	/**
	 * 更新缓存
	 * Update cache
	 * @private
	 */
	private updateCache(threshold: DynamicThreshold): void {
		try {
			this.thresholdCache.set(threshold.thresholdId, {
				threshold,
				timestamp: Date.now(),
			});
		} catch (error) {
			logger.error("更新缓存时出错", { error, threshold });
		}
	}

	/**
	 * 计算固定阈值
	 * Calculate fixed threshold
	 * @private
	 */
	private calculateFixedThreshold(threshold: DynamicThreshold): number {
		if (threshold.parameters.fixedValue === undefined) {
			throw new Error("Fixed value is not defined");
		}

		return threshold.parameters.fixedValue;
	}

	/**
	 * 计算百分比阈值
	 * Calculate percentage threshold
	 * @private
	 */
	private calculatePercentageThreshold(threshold: DynamicThreshold): number {
		if (threshold.parameters.percentage === undefined) {
			throw new Error("Percentage is not defined");
		}

		const percentage = threshold.parameters.percentage / 100;

		if (threshold.type === ThresholdType.STOP_LOSS) {
			if (threshold.direction === "long") {
				return threshold.entryPrice * (1 - percentage);
			} else {
				return threshold.entryPrice * (1 + percentage);
			}
		} else {
			// 止盈 - Take profit
			if (threshold.direction === "long") {
				return threshold.entryPrice * (1 + percentage);
			} else {
				return threshold.entryPrice * (1 - percentage);
			}
		}
	}

	/**
	 * 计算ATR阈值
	 * Calculate ATR threshold
	 * @private
	 */
	private calculateAtrThreshold(
		threshold: DynamicThreshold,
		marketData?: any,
	): number {
		if (threshold.parameters.atrMultiplier === undefined) {
			throw new Error("ATR multiplier is not defined");
		}

		if (!marketData || !marketData.atr) {
			logger.warn("ATR data not available, falling back to percentage calculation", {
				thresholdId: threshold.thresholdId,
			});
			return this.calculatePercentageThreshold(threshold);
		}

		const atr = marketData.atr;
		const multiplier = threshold.parameters.atrMultiplier;

		if (threshold.type === ThresholdType.STOP_LOSS) {
			if (threshold.direction === "long") {
				return threshold.entryPrice - atr * multiplier;
			} else {
				return threshold.entryPrice + atr * multiplier;
			}
		} else {
			// 止盈 - Take profit
			if (threshold.direction === "long") {
				return threshold.entryPrice + atr * multiplier;
			} else {
				return threshold.entryPrice - atr * multiplier;
			}
		}
	}

	/**
	 * 计算布林带阈值
	 * Calculate Bollinger threshold
	 * @private
	 */
	private calculateBollingerThreshold(
		threshold: DynamicThreshold,
		marketData?: any,
	): number {
		if (!marketData || !marketData.upperBand || !marketData.lowerBand) {
			logger.warn("Bollinger data not available, falling back to percentage calculation", {
				thresholdId: threshold.thresholdId,
			});
			return this.calculatePercentageThreshold(threshold);
		}

		if (threshold.type === ThresholdType.STOP_LOSS) {
			if (threshold.direction === "long") {
				return marketData.lowerBand;
			} else {
				return marketData.upperBand;
			}
		} else {
			// 止盈 - Take profit
			if (threshold.direction === "long") {
				return marketData.upperBand;
			} else {
				return marketData.lowerBand;
			}
		}
	}

	/**
	 * 计算斐波那契阈值
	 * Calculate Fibonacci threshold
	 * @private
	 */
	private calculateFibonacciThreshold(
		threshold: DynamicThreshold,
		marketData?: any,
	): number {
		if (threshold.parameters.fibLevel === undefined) {
			throw new Error("Fibonacci level is not defined");
		}

		if (!marketData || !marketData.highPrice || !marketData.lowPrice) {
			logger.warn("Fibonacci data not available, falling back to percentage calculation", {
				thresholdId: threshold.thresholdId,
			});
			return this.calculatePercentageThreshold(threshold);
		}

		const highPrice = marketData.highPrice;
		const lowPrice = marketData.lowPrice;
		const fibLevel = threshold.parameters.fibLevel;

		// 计算斐波那契水平 - Calculate Fibonacci level
		const fibPrice = highPrice - (highPrice - lowPrice) * fibLevel;

		if (threshold.type === ThresholdType.STOP_LOSS) {
			if (threshold.direction === "long") {
				return Math.min(threshold.entryPrice, fibPrice);
			} else {
				return Math.max(threshold.entryPrice, fibPrice);
			}
		} else {
			// 止盈 - Take profit
			if (threshold.direction === "long") {
				return Math.max(threshold.entryPrice, fibPrice);
			} else {
				return Math.min(threshold.entryPrice, fibPrice);
			}
		}
	}

	/**
	 * 计算轴点阈值
	 * Calculate pivot threshold
	 * @private
	 */
	private calculatePivotThreshold(
		threshold: DynamicThreshold,
		marketData?: any,
	): number {
		if (!marketData || !marketData.pivotPoint) {
			logger.warn("Pivot data not available, falling back to percentage calculation", {
				thresholdId: threshold.thresholdId,
			});
			return this.calculatePercentageThreshold(threshold);
		}

		const pivotPoint = marketData.pivotPoint;

		if (threshold.type === ThresholdType.STOP_LOSS) {
			if (threshold.direction === "long") {
				return marketData.support1 || pivotPoint * 0.99;
			} else {
				return marketData.resistance1 || pivotPoint * 1.01;
			}
		} else {
			// 止盈 - Take profit
			if (threshold.direction === "long") {
				return marketData.resistance1 || pivotPoint * 1.01;
			} else {
				return marketData.support1 || pivotPoint * 0.99;
			}
		}
	}

	/**
	 * 计算自定义阈值
	 * Calculate custom threshold
	 * @private
	 */
	private calculateCustomThreshold(
		threshold: DynamicThreshold,
		marketData?: any,
	): number {
		if (!threshold.parameters.customFunction) {
			throw new Error("Custom function is not defined");
		}

		try {
			// 在实际应用中，这里应该安全地执行自定义函数
			// In a real application, this should safely execute the custom function
			// 这里只是示例，实际实现需要考虑安全性
			// This is just an example, actual implementation needs to consider security

			logger.warn("Custom threshold calculation not implemented, falling back to percentage calculation", {
				thresholdId: threshold.thresholdId,
			});

			return this.calculatePercentageThreshold(threshold);
		} catch (error) {
			logger.error("执行自定义阈值函数时出错", {
				error,
				thresholdId: threshold.thresholdId,
			});

			return this.calculatePercentageThreshold(threshold);
		}
	}

	/**
	 * 检查触发条件
	 * Check trigger condition
	 * @private
	 */
	private checkTriggerCondition(
		condition: TriggerCondition,
		threshold: DynamicThreshold,
		marketData?: any,
	): boolean {
		try {
			switch (condition.type) {
				case "time":
					// 时间条件 - Time condition
					if (condition.parameters.duration) {
						const elapsed = Date.now() - threshold.createdAt;
						return elapsed >= condition.parameters.duration;
					}
					return false;

				case "volume":
					// 成交量条件 - Volume condition
					if (marketData && marketData.volume && condition.parameters.minVolume) {
						return marketData.volume >= condition.parameters.minVolume;
					}
					return false;

				case "price":
					// 价格条件 - Price condition
					if (condition.parameters.minPrice !== undefined && threshold.currentPrice < condition.parameters.minPrice) {
						return false;
					}

					if (condition.parameters.maxPrice !== undefined && threshold.currentPrice > condition.parameters.maxPrice) {
						return false;
					}

					return true;

				case "indicator":
					// 指标条件 - Indicator condition
					// 这里可以根据具体指标类型进行检查
					// Here you can check based on specific indicator types
					return true;

				case "custom":
					// 自定义条件 - Custom condition
					// 这里可以根据自定义条件进行检查
					// Here you can check based on custom conditions
					return true;

				default:
					logger.error("Unknown trigger condition type", {
						thresholdId: threshold.thresholdId,
						conditionType: condition.type,
					});
					return false;
			}
		} catch (error) {
			logger.error("检查触发条件时出错", {
				error,
				thresholdId: threshold.thresholdId,
				condition,
			});
			return false;
		}
	}

	/**
	 * 启动计算定时器
	 * Start calculation timer
	 * @private
	 */
	private startCalculationTimer(): void {
		if (this.calculationTimer) {
			clearInterval(this.calculationTimer);
		}

		this.calculationTimer = setInterval(async () => {
			await this.processThresholdCalculations();
		}, this.config.calculationInterval);

		logger.debug("计算计时器已启动");
	}

	/**
	 * 重启计算定时器
	 * Restart calculation timer
	 * @private
	 */
	private restartCalculationTimer(): void {
		this.startCalculationTimer();
	}

	/**
	 * 启动更新定时器
	 * Start update timer
	 * @private
	 */
	private startUpdateTimer(): void {
		if (this.updateTimer) {
			clearInterval(this.updateTimer);
		}

		this.updateTimer = setInterval(async () => {
			await this.processThresholdUpdates();
		}, this.config.updateInterval);

		logger.debug("更新计时器已启动");
	}

	/**
	 * 重启更新定时器
	 * Restart update timer
	 * @private
	 */
	private restartUpdateTimer(): void {
		this.startUpdateTimer();
	}

	/**
	 * 启动过期定时器
	 * Start expiration timer
	 * @private
	 */
	private startExpirationTimer(): void {
		if (this.expirationTimer) {
			clearInterval(this.expirationTimer);
		}

		this.expirationTimer = setInterval(async () => {
			await this.checkThresholdExpiration();
		}, 60000); // 每分钟检查一次 - Check every minute

		logger.debug("过期计时器已启动");
	}

	/**
	 * 重启过期定时器
	 * Restart expiration timer
	 * @private
	 */
	private restartExpirationTimer(): void {
		this.startExpirationTimer();
	}

	/**
	 * 处理阈值计算
	 * Process threshold calculations
	 * @private
	 */
	private async processThresholdCalculations(): Promise<void> {
		try {
			if (!this.config.enableAutoCalculation) {
				return;
			}

			const activeThresholds = this.getThresholdsByStatus(ThresholdStatus.ACTIVE);

			for (const threshold of activeThresholds) {
				// 获取当前价格 - Get current price
				const currentPrice = await this.getCurrentPrice(threshold.symbol);
				if (currentPrice === null) {
					continue;
				}

				// 获取市场数据 - Get market data
				const marketData = await this.getMarketData(threshold.symbol);

				// 计算阈值 - Calculate threshold
				this.calculateThreshold(threshold.thresholdId, currentPrice, marketData);

				// 检查阈值触发 - Check threshold trigger
				this.checkThresholdTrigger(threshold.thresholdId, currentPrice, marketData);
			}
		} catch (error) {
			logger.error("处理阈值计算时出错", { error });
		}
	}

	/**
	 * 处理阈值更新
	 * Process threshold updates
	 * @private
	 */
	private async processThresholdUpdates(): Promise<void> {
		try {
			if (!this.config.enableAutoUpdate) {
				return;
			}

			const activeThresholds = this.getThresholdsByStatus(ThresholdStatus.ACTIVE);

			for (const threshold of activeThresholds) {
				if (!threshold.updateRules) {
					continue;
				}

				for (const rule of threshold.updateRules) {
					if (!rule.enabled) {
						continue;
					}

					const now = Date.now();
					const lastUpdate = rule.lastUpdatedAt || threshold.createdAt;

					if (now - lastUpdate >= rule.updateInterval) {
						// 应用更新规则 - Apply update rule
						await this.applyUpdateRule(threshold, rule);

						// 更新最后更新时间 - Update last update time
						rule.lastUpdatedAt = now;
					}
				}
			}
		} catch (error) {
			logger.error("处理阈值更新时出错", { error });
		}
	}

	/**
	 * 检查阈值过期
	 * Check threshold expiration
	 * @private
	 */
	private async checkThresholdExpiration(): Promise<void> {
		try {
			if (!this.config.enableThresholdExpiration) {
				return;
			}

			const now = Date.now();
			const activeThresholds = this.getThresholdsByStatus(ThresholdStatus.ACTIVE);

			for (const threshold of activeThresholds) {
				if (threshold.expiresAt && threshold.expiresAt < now) {
					// 更新状态为已过期 - Update status to expired
					this.updateDynamicThreshold(threshold.thresholdId, {
						status: ThresholdStatus.EXPIRED,
					});

					// 发出阈值过期事件 - Emit threshold expiration event
					this.emit("thresholdExpired", {
						thresholdId: threshold.thresholdId,
						threshold,
					});

					logger.info("Threshold expired", {
						thresholdId: threshold.thresholdId,
						expiresAt: threshold.expiresAt,
					});
				}
			}
		} catch (error) {
			logger.error("检查阈值过期时出错", { error });
		}
	}

	/**
	 * 获取当前价格
	 * Get current price
	 * @private
	 */
	private async getCurrentPrice(symbol: string): Promise<number | null> {
		try {
			// 这里应该从市场数据源获取当前价格
			// In a real application, this should get the current price from the market data source
			return null;
		} catch (error) {
			logger.error("获取当前价格时出错", { error, symbol });
			return null;
		}
	}

	/**
	 * 获取市场数据
	 * Get market data
	 * @private
	 */
	private async getMarketData(symbol: string): Promise<any | null> {
		try {
			// 这里应该从市场数据源获取市场数据
			// In a real application, this should get market data from the market data source
			return null;
		} catch (error) {
			logger.error("获取市场数据时出错", { error, symbol });
			return null;
		}
	}

	/**
	 * 应用更新规则
	 * Apply update rule
	 * @private
	 */
	private async applyUpdateRule(
		threshold: DynamicThreshold,
		rule: UpdateRule,
	): Promise<void> {
		try {
			switch (rule.type) {
				case "time_based":
					// 基于时间的更新规则 - Time-based update rule
					break;

				case "price_based":
					// 基于价格的更新规则 - Price-based update rule
					break;

				case "volume_based":
					// 基于成交量的更新规则 - Volume-based update rule
					break;

				case "indicator_based":
					// 基于指标的更新规则 - Indicator-based update rule
					break;

				case "custom":
					// 自定义更新规则 - Custom update rule
					break;

				default:
					logger.error("Unknown update rule type", {
						thresholdId: threshold.thresholdId,
						ruleType: rule.type,
					});
					return;
			}

			// 更新阈值 - Update threshold
			threshold.updatedAt = Date.now();

			// 更新缓存 - Update cache
			if (this.config.enableThresholdCaching) {
				this.updateCache(threshold);
			}

			// 发出阈值更新事件 - Emit threshold update event
			this.emit("thresholdUpdatedByRule", {
				thresholdId: threshold.thresholdId,
				threshold,
				rule,
			});

			logger.debug("阈值已按规则更新", {
				thresholdId: threshold.thresholdId,
				ruleId: rule.ruleId,
				ruleType: rule.type,
			});
		} catch (error) {
			logger.error("应用更新规则时出错", {
				error,
				thresholdId: threshold.thresholdId,
				rule,
			});
		}
	}

	/**
	 * 销毁动态阈值设定系统
	 * Destroy dynamic threshold setting system
	 */
	destroy(): void {
		// 停止定时器 - Stop timers
		if (this.calculationTimer) {
			clearInterval(this.calculationTimer);
			this.calculationTimer = null;
		}

		if (this.updateTimer) {
			clearInterval(this.updateTimer);
			this.updateTimer = null;
		}

		if (this.expirationTimer) {
			clearInterval(this.expirationTimer);
			this.expirationTimer = null;
		}

		// 移除所有监听器 - Remove all listeners
		this.removeAllListeners();

		// 清空数据 - Clear data
		this.thresholds.clear();
		this.positionIdToThresholdIds.clear();
		this.typeToThresholdIds.clear();
		this.statusToThresholdIds.clear();
		this.thresholdCache.clear();

		logger.info("CaiSen Dynamic Threshold Setting destroyed");
	}
}

/**
 * 默认阈值设定配置
 * Default threshold setting configuration
 */
export const DEFAULT_THRESHOLD_SETTING_CONFIG: ThresholdSettingConfig = {
	enableAutoCalculation: true,
	enableAutoUpdate: true,
	calculationInterval: 5000, // 5秒 - 5 seconds
	updateInterval: 60000, // 1分钟 - 1 minute
	enableThresholdExpiration: true,
	defaultThresholdExpiration: 7 * 24 * 60 * 60 * 1000, // 7天 - 7 days
	enableThresholdCaching: true,
	cacheExpiration: 60 * 1000, // 1分钟 - 1 minute
	enableThresholdValidation: true,
	maxThresholdCount: 1000,
};

/**
 * 创建蔡森动态阈值设定实例
 * Create CaiSen dynamic threshold setting instance
 *
 * @param config 阈值设定配置 - Threshold setting configuration
 * @param batchClosingSystem 分批平仓系统 - Batch closing system
 * @param aiParameterControl AI参数控制系统 - AI parameter control system
 * @returns CaiSenDynamicThresholdSetting 蔡森动态阈值设定实例 - CaiSen dynamic threshold setting instance
 */
export function createCaiSenDynamicThresholdSetting(
	config: ThresholdSettingConfig = DEFAULT_THRESHOLD_SETTING_CONFIG,
	batchClosingSystem: CaiSenBatchClosingSystem,
	aiParameterControl: CaiSenAiParameterControl,
): CaiSenDynamicThresholdSetting {
	return new CaiSenDynamicThresholdSetting(
		config,
		batchClosingSystem,
		aiParameterControl,
	);
}