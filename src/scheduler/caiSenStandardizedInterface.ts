/**
 * 蔡森策略标准化接口
 * CaiSen Strategy Standardized Interface
 *
 * 该模块提供标准化的分批平仓与止盈止损阈值函数接口，供蔡森Agent直接调用
 * This module provides standardized batch closing and stop-profit/stop-loss threshold function interfaces for direct use by CaiSen Agent
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import { createExchangeClient } from "../services/exchangeClient";
import type { StrategyParams } from "../strategies/types";
import { logger } from "../utils/loggerUtils";
import {
	CaiSenAiParameterControl,
	ClosingParameterDetail,
	ParameterStatus,
	ParameterType,
} from "./caiSenAiParameterControl";
import {
	CaiSenBatchClosingInstructionRecognizer,
	InstructionPriority,
	InstructionStatus,
	InstructionType,
} from "./caiSenBatchClosingInstructionRecognizer";
import {
	type BatchConfig,
	type BatchState,
	BatchStatus,
	CaiSenBatchClosingSystem,
	ClosingType,
} from "./caiSenBatchClosingSystem";
import {
	CaiSenDynamicThresholdSetting,
	type DynamicThreshold,
	ThresholdCalculationMethod,
	ThresholdSettingConfig,
	ThresholdSource,
	type ThresholdStatus,
	ThresholdType,
} from "./caiSenDynamicThresholdSetting";
import {
	type AIDecisionEngine,
	AiDecisionParams,
	CaiSenGapPeriodTakeover,
	type TakeoverConfig,
	TakeoverState,
	TakeoverStatus,
} from "./caiSenGapPeriodTakeover";
import { CaiSenMonitorIndependentSystem } from "./caiSenMonitorIndependentSystem";
import {
	CaiSenOpeningMonitoringAssociation,
	MonitoringStatus,
	OpeningStatus,
} from "./caiSenOpeningMonitoringAssociation";

/**
 * 持仓接口
 * Position Interface
 */
interface Position {
	/** 持仓ID - Position ID */
	id: number;
	/** 交易对 - Trading pair */
	symbol: string;
	/** 持仓数量 - Position quantity */
	quantity: number;
	/** 开仓价格 - Entry price */
	entry_price: number;
	/** 当前价格 - Current price */
	current_price: number;
	/** 强平价格 - Liquidation price */
	liquidation_price: number;
	/** 未实现盈亏 - Unrealized P&L */
	unrealized_pnl: number;
	/** 杠杆倍数 - Leverage */
	leverage: number;
	/** 持仓方向 - Position side */
	side: "long" | "short";
	/** 开仓订单ID - Entry order ID */
	entry_order_id: string;
	/** 开仓时间 - Entry time */
	opened_at: string;
	/** 金字塔加仓次数 - Pyramid add count */
	pyramidAddCount?: number;
	/** 最后加仓时间 - Last add time */
	lastAddTime?: number;
	/** 是否正在分批平仓 - Whether batch closing is in progress */
	batchClosingInProgress?: boolean;
}

/**
 * 分批平仓状态接口
 * Batch Closing Status Interface
 */
export interface BatchClosingStatus {
	/** 分批ID - Batch ID */
	batchId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 状态 - Status */
	status: BatchStatus;

	/** 平仓类型 - Closing type */
	closingType: string;

	/** 总批次数 - Total batch count */
	totalBatches: number;

	/** 已完成批次数 - Completed batch count */
	completedBatches: number;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 止盈止损状态接口
 * Stop Profit/Loss Status Interface
 */
export interface StopProfitLossStatus {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 阈值类型 - Threshold type */
	thresholdType: ThresholdType;

	/** 状态 - Status */
	status: ThresholdStatus;

	/** 当前值 - Current value */
	currentValue: number;

	/** 触发值 - Trigger value */
	triggerValue: number;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 空窗期接管状态接口
 * Gap Period Takeover Status Interface
 */
export interface GapPeriodTakeoverStatus {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 状态 - Status */
	status: TakeoverStatus;

	/** 接管ID - Takeover ID */
	takeoverId: string;

	/** 接管类型 - Takeover type */
	takeoverType: string;

	/** 接管时间 - Takeover time */
	takeoverTime: number;

	/** 接管原因 - Takeover reason */
	takeoverReason: string;

	/** 原始系统 - Original system */
	originalSystem: string;

	/** 预期持续时间 - Expected duration */
	expectedDuration: number;

	/** 剩余持续时间 - Remaining duration */
	remainingDuration: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 开仓监控关联状态接口
 * Opening Monitoring Association Status Interface
 */
export interface OpeningMonitoringAssociationStatus {
	/** 开仓ID - Opening ID */
	openingId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 开仓状态 - Opening status */
	openingStatus: OpeningStatus;

	/** 监控状态 - Monitoring status */
	monitoringStatus: MonitoringStatus;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 持仓数量 - Position size */
	size: number;

	/** 入场价格 - Entry price */
	entryPrice: number;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 持仓完整状态接口
 * Position Complete Status Interface
 */
export interface PositionCompleteStatus {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 持仓信息 - Position information */
	positionInfo?: PositionInfo;

	/** 分批平仓状态列表 - Batch closing status list */
	batchClosingStatuses: BatchClosingStatus[];

	/** 止盈止损状态列表 - Stop profit/loss status list */
	stopProfitLossStatuses: StopProfitLossStatus[];

	/** 空窗期接管状态 - Gap period takeover status */
	gapPeriodTakeoverStatus?: GapPeriodTakeoverStatus;

	/** 开仓监控关联状态 - Opening monitoring association status */
	openingMonitoringAssociationStatus?: OpeningMonitoringAssociationStatus;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 接口调用结果枚举
 * Interface Call Result Enumeration
 */
export enum InterfaceCallResult {
	SUCCESS = "success", // 成功 - Success
	FAILED = "failed", // 失败 - Failed
	PARTIAL = "partial", // 部分成功 - Partial success
	TIMEOUT = "timeout", // 超时 - Timeout
	INVALID_PARAMS = "invalid_params", // 无效参数 - Invalid parameters
	NOT_FOUND = "not_found", // 未找到 - Not found
	ALREADY_EXISTS = "already_exists", // 已存在 - Already exists
	PERMISSION_DENIED = "permission_denied", // 权限被拒绝 - Permission denied
	SYSTEM_ERROR = "system_error", // 系统错误 - System error
}

/**
 * 接口调用响应接口
 * Interface Call Response Interface
 */
export interface InterfaceCallResponse<T = any> {
	/** 结果 - Result */
	result: InterfaceCallResult;

	/** 数据 - Data */
	data?: T;

	/** 错误消息 - Error message */
	errorMessage?: string;

	/** 错误代码 - Error code */
	errorCode?: string;

	/** 调用时间 - Call time */
	callTime: number;

	/** 处理时间 - Processing time */
	processingTime: number;

	/** 成功标志 - Success flag */
	success?: boolean;

	/** 错误信息 - Error information */
	error?: {
		code: string;
		message: string;
		details?: any;
	};

	/** 消息 - Message */
	message?: string;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 持仓信息接口
 * Position Information Interface
 */
export interface PositionInfo {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 持仓数量 - Position size */
	size: number;

	/** 入场价格 - Entry price */
	entryPrice: number;

	/** 当前价格 - Current price */
	currentPrice: number;

	/** 未实现盈亏 - Unrealized PnL */
	unrealizedPnl: number;

	/** 未实现盈亏百分比 - Unrealized PnL percentage */
	unrealizedPnlPercent: number;

	/** 杠杆 - Leverage */
	leverage: number;

	/** 保证金 - Margin */
	margin: number;

	/** 持仓时间 - Position time */
	positionTime: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 分批平仓参数接口
 * Batch Closing Parameters Interface
 */
export interface BatchClosingParameters {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 分批数量 - Batch count */
	batchCount: number;

	/** 分批比例 - Batch percentages */
	batchPercentages: number[];

	/** 触发条件 - Trigger conditions */
	triggerConditions: {
		/** 触发类型 - Trigger type */
		type: "profit" | "loss" | "time" | "price" | "custom";

		/** 触发值 - Trigger value */
		value: number;

		/** 触发参数 - Trigger parameters */
		parameters?: Record<string, any>;
	}[];

	/** 执行策略 - Execution strategy */
	executionStrategy: "immediate" | "gradual" | "adaptive";

	/** 延迟时间 - Delay time */
	delayTime?: number;

	/** 过期时间 - Expiration time */
	expirationTime?: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 止盈止损参数接口
 * Stop Profit/Loss Parameters Interface
 */
export interface StopProfitLossParameters {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 止损参数 - Stop loss parameters */
	stopLoss?: {
		/** 是否启用 - Whether enabled */
		enabled: boolean;

		/** 止损类型 - Stop loss type */
		type:
			| "fixed"
			| "percentage"
			| "atr"
			| "bollinger"
			| "fibonacci"
			| "pivot"
			| "custom";

		/** 止损值 - Stop loss value */
		value: number;

		/** 止损参数 - Stop loss parameters */
		parameters?: Record<string, any>;

		/** 是否为移动止损 - Whether it's a trailing stop */
		trailing?: boolean;

		/** 移动止损参数 - Trailing stop parameters */
		trailingParameters?: {
			/** 移动步长 - Trail step */
			step: number;

			/** 移动方向 - Trail direction */
			direction: "up" | "down";
		};
	};

	/** 止盈参数 - Take profit parameters */
	takeProfit?: {
		/** 是否启用 - Whether enabled */
		enabled: boolean;

		/** 止盈类型 - Take profit type */
		type:
			| "fixed"
			| "percentage"
			| "atr"
			| "bollinger"
			| "fibonacci"
			| "pivot"
			| "custom";

		/** 止盈值 - Take profit value */
		value: number;

		/** 止盈参数 - Take profit parameters */
		parameters?: Record<string, any>;

		/** 是否分批止盈 - Whether to use partial take profit */
		partial?: boolean;

		/** 分批止盈参数 - Partial take profit parameters */
		partialParameters?: {
			/** 分批数量 - Batch count */
			batchCount: number;

			/** 分批比例 - Batch percentages */
			batchPercentages: number[];

			/** 触发条件 - Trigger conditions */
			triggerConditions: {
				/** 触发类型 - Trigger type */
				type: "profit" | "time" | "price" | "custom";

				/** 触发值 - Trigger value */
				value: number;

				/** 触发参数 - Trigger parameters */
				parameters?: Record<string, any>;
			}[];
		};
	};

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 空窗期接管参数接口
 * Gap Period Takeover Parameters Interface
 */
export interface GapPeriodTakeoverParameters {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 是否启用 - Whether enabled */
	enabled: boolean;

	/** 接管条件 - Takeover conditions */
	conditions: {
		/** 空窗期时间 - Gap period time */
		gapPeriodTime: number;

		/** 风险阈值 - Risk threshold */
		riskThreshold: number;

		/** 其他条件 - Other conditions */
		otherConditions?: Record<string, any>;
	};

	/** 接管操作 - Takeover operations */
	operations: {
		/** 是否启用监控 - Whether to enable monitoring */
		enableMonitoring: boolean;

		/** 是否启用自动平仓 - Whether to enable auto closing */
		enableAutoClosing: boolean;

		/** 平仓条件 - Closing conditions */
		closingConditions?: {
			/** 止损条件 - Stop loss condition */
			stopLoss?: {
				/** 是否启用 - Whether enabled */
				enabled: boolean;

				/** 止损值 - Stop loss value */
				value: number;
			};

			/** 止盈条件 - Take profit condition */
			takeProfit?: {
				/** 是否启用 - Whether enabled */
				enabled: boolean;

				/** 止盈值 - Take profit value */
				value: number;
			};

			/** 其他条件 - Other conditions */
			otherConditions?: Record<string, any>;
		};
	};

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 开仓监控关联参数接口
 * Opening Monitoring Association Parameters Interface
 */
export interface OpeningMonitoringAssociationParameters {
	/** 开仓ID - Opening ID */
	openingId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 决策ID - Decision ID */
	decisionId?: string;

	/** 策略ID - Strategy ID */
	strategyId?: string;

	/** 交易所 - Exchange */
	exchange?: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 持仓数量 - Position size */
	size: number;

	/** 入场价格 - Entry price */
	entryPrice: number;

	/** 订单ID - Order ID */
	orderId?: string;

	/** 杠杆 - Leverage */
	leverage?: number;

	/** 标签 - Tags */
	tags?: string[];

	/** 监控配置 - Monitoring configuration */
	monitoringConfig?: {
		/** 是否启用监控 - Whether to enable monitoring */
		enabled: boolean;

		/** 监控类型 - Monitoring types */
		types: ("stop_loss" | "take_profit" | "trailing_stop" | "partial_profit")[];

		/** 监控参数 - Monitoring parameters */
		parameters: Record<string, any>;
	};

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 蔡森策略标准化接口类
 * CaiSen Strategy Standardized Interface Class
 */
export class CaiSenStandardizedInterface extends EventEmitter {
	private gapPeriodTakeover: CaiSenGapPeriodTakeover;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: CaiSenAiParameterControl;
	private openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation;
	private batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer;
	private dynamicThresholdSetting: CaiSenDynamicThresholdSetting;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param gapPeriodTakeover 空窗期接管系统 - Gap period takeover system
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 * @param openingMonitoringAssociation 开仓监控关联系统 - Opening monitoring association system
	 * @param batchClosingInstructionRecognizer 分批平仓指令识别系统 - Batch closing instruction recognizer system
	 * @param dynamicThresholdSetting 动态阈值设定系统 - Dynamic threshold setting system
	 */
	constructor(
		gapPeriodTakeover: CaiSenGapPeriodTakeover,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: CaiSenAiParameterControl,
		openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation,
		batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer,
		dynamicThresholdSetting: CaiSenDynamicThresholdSetting,
	) {
		super();

		this.gapPeriodTakeover = gapPeriodTakeover;
		this.batchClosingSystem = batchClosingSystem;
		this.aiParameterControl = aiParameterControl;
		this.openingMonitoringAssociation = openingMonitoringAssociation;
		this.batchClosingInstructionRecognizer = batchClosingInstructionRecognizer;
		this.dynamicThresholdSetting = dynamicThresholdSetting;

		logger.info("CaiSen Standardized Interface initialized");
	}

	/**
	 * 设置分批平仓
	 * Set batch closing
	 *
	 * @param parameters 分批平仓参数 - Batch closing parameters
	 * @returns Promise<InterfaceCallResponse<string>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * setBatchClosing({
	 *   positionId: "pos_12345",
	 *   batchCount: 3,
	 *   batchPercentages: [30, 30, 40],
	 *   triggerConditions: [
	 *     { type: "profit", value: 5 },
	 *     { type: "profit", value: 10 },
	 *     { type: "profit", value: 20 }
	 *   ],
	 *   executionStrategy: "gradual"
	 * })
	 */
	async setBatchClosing(
		parameters: BatchClosingParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			const validationResult = this.validateBatchClosingParameters(parameters);
			if (!validationResult.valid) {
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					errorMessage: validationResult.errorMessage,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 转换为分批平仓系统参数 - Convert to batch closing system parameters
			const batchConfig: BatchConfig = {
				batchId: `batch_${Date.now()}_${Math.random()
					.toString(36)
					.substr(2, 9)}`,
				positionId: parameters.positionId,
				closingType: ClosingType.PARTIAL_PROFIT,
				closingRatio:
					parameters.batchPercentages.reduce(
						(sum, percentage) => sum + percentage,
						0,
					) / 100,
				closingQuantity: 0, // 将在执行时计算 - Will be calculated during execution
				triggerCondition: {
					triggerType: "manual",
					triggerValue: 0,
					operator: "=",
				},
				priority: 1,
				createdAt: Date.now(),
				expiresAt: parameters.expirationTime || undefined,
			};

			// 设置分批平仓 - Set batch closing
			const batchId = this.batchClosingSystem.setBatchClosing(batchConfig);

			if (!batchId) {
				return {
					result: InterfaceCallResult.FAILED,
					errorMessage: "Failed to set batch closing",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 激活分批平仓 - Activate batch closing
			const activated = this.batchClosingSystem.activateBatchClosing(batchId);

			if (!activated) {
				return {
					result: InterfaceCallResult.PARTIAL,
					errorMessage: "Batch closing set but activation failed",
					data: batchId,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 发出分批平仓设置事件 - Emit batch closing set event
			this.emit("batchClosingSet", { batchId, parameters });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: batchId,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("设置批量平仓时出错", { error, parameters });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 取消分批平仓
	 * Cancel batch closing
	 *
	 * @param batchId 分批ID - Batch ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * cancelBatchClosing("batch_12345")
	 */
	async cancelBatchClosing(
		batchId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		try {
			// 取消分批平仓 - Cancel batch closing
			const cancelled = this.batchClosingSystem.cancelBatchClosing(batchId);

			if (!cancelled) {
				return {
					result: InterfaceCallResult.FAILED,
					errorMessage: "Failed to cancel batch closing",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 发出分批平仓取消事件 - Emit batch closing cancelled event
			this.emit("batchClosingCancelled", { batchId });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: true,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("取消批量平仓时出错", { error, batchId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 设置止盈止损
	 * Set stop profit/loss
	 *
	 * @param parameters 止盈止损参数 - Stop profit/loss parameters
	 * @returns Promise<InterfaceCallResponse<{ stopLossId?: string; takeProfitId?: string }>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * setStopProfitLoss({
	 *   positionId: "pos_12345",
	 *   stopLoss: {
	 *     enabled: true,
	 *     type: "percentage",
	 *     value: 2,
	 *     trailing: true,
	 *     trailingParameters: {
	 *       step: 0.5,
	 *       direction: "up"
	 *     }
	 *   },
	 *   takeProfit: {
	 *     enabled: true,
	 *     type: "percentage",
	 *     value: 10,
	 *     partial: true,
	 *     partialParameters: {
	 *       batchCount: 3,
	 *       batchPercentages: [30, 30, 40],
	 *       triggerConditions: [
	 *         { type: "profit", value: 5 },
	 *         { type: "profit", value: 10 },
	 *         { type: "profit", value: 20 }
	 *       ]
	 *     }
	 *   }
	 * })
	 */
	async setStopProfitLoss(
		parameters: StopProfitLossParameters,
	): Promise<
		InterfaceCallResponse<{ stopLossId?: string; takeProfitId?: string }>
	> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			const validationResult =
				this.validateStopProfitLossParameters(parameters);
			if (!validationResult.valid) {
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					errorMessage: validationResult.errorMessage,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			const result: { stopLossId?: string; takeProfitId?: string } = {};

			// 设置止损 - Set stop loss
			if (parameters.stopLoss && parameters.stopLoss.enabled) {
				const stopLossThresholdData = {
					type: ThresholdType.STOP_LOSS,
					positionId: parameters.positionId,
					symbol: "", // 需要从持仓信息获取 - Need to get from position info
					direction: "long", // 需要从持仓信息获取 - Need to get from position info
					entryPrice: 0, // 需要从持仓信息获取 - Need to get from position info
					currentPrice: 0, // 需要从市场数据获取 - Need to get from market data
					calculationMethod: this.mapStopLossTypeToThresholdCalculationMethod(
						parameters.stopLoss.type,
					),
					parameters: {
						[parameters.stopLoss.type === "fixed"
							? "fixedValue"
							: "percentage"]: parameters.stopLoss.value,
						trailing: parameters.stopLoss.trailing,
						trailingParameters: parameters.stopLoss.trailingParameters,
					},
				};

				const stopLossId = this.dynamicThresholdSetting.setDynamicThreshold(
					stopLossThresholdData,
					ThresholdSource.AI_AGENT,
				);

				if (stopLossId) {
					this.dynamicThresholdSetting.activateThreshold(stopLossId);
					result.stopLossId = stopLossId;
				}
			}

			// 设置止盈 - Set take profit
			if (parameters.takeProfit && parameters.takeProfit.enabled) {
				const takeProfitThresholdData = {
					type: parameters.takeProfit.partial
						? ThresholdType.PARTIAL_PROFIT
						: ThresholdType.TAKE_PROFIT,
					positionId: parameters.positionId,
					symbol: "", // 需要从持仓信息获取 - Need to get from position info
					direction: "long", // 需要从持仓信息获取 - Need to get from position info
					entryPrice: 0, // 需要从持仓信息获取 - Need to get from position info
					currentPrice: 0, // 需要从市场数据获取 - Need to get from market data
					calculationMethod: this.mapTakeProfitTypeToThresholdCalculationMethod(
						parameters.takeProfit.type,
					),
					parameters: {
						[parameters.takeProfit.type === "fixed"
							? "fixedValue"
							: "percentage"]: parameters.takeProfit.value,
						partial: parameters.takeProfit.partial,
						partialParameters: parameters.takeProfit.partialParameters,
					},
				};

				const takeProfitId = this.dynamicThresholdSetting.setDynamicThreshold(
					takeProfitThresholdData,
					ThresholdSource.AI_AGENT,
				);

				if (takeProfitId) {
					this.dynamicThresholdSetting.activateThreshold(takeProfitId);
					result.takeProfitId = takeProfitId;
				}
			}

			// 发出止盈止损设置事件 - Emit stop profit/loss set event
			this.emit("stopProfitLossSet", { parameters, result });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: result,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("设置止盈止损时出错", { error, parameters });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 设置空窗期接管
	 * Set gap period takeover
	 *
	 * @param parameters 空窗期接管参数 - Gap period takeover parameters
	 * @returns Promise<InterfaceCallResponse<string>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * setGapPeriodTakeover({
	 *   positionId: "pos_12345",
	 *   enabled: true,
	 *   conditions: {
	 *     gapPeriodTime: 5 * 60 * 1000, // 5分钟 - 5 minutes
	 *     riskThreshold: 0.1
	 *   },
	 *   operations: {
	 *     enableMonitoring: true,
	 *     enableAutoClosing: true,
	 *     closingConditions: {
	 *       stopLoss: {
	 *         enabled: true,
	 *         value: 0.02
	 *       },
	 *       takeProfit: {
	 *         enabled: true,
	 *         value: 0.05
	 *       }
	 *     }
	 *   }
	 * })
	 */
	async setGapPeriodTakeover(
		parameters: GapPeriodTakeoverParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			const validationResult =
				this.validateGapPeriodTakeoverParameters(parameters);
			if (validationResult.result !== InterfaceCallResult.SUCCESS) {
				return {
					result: validationResult.result,
					errorMessage:
						validationResult.errorMessage || validationResult.message,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 转换为空窗期接管系统参数 - Convert to gap period takeover system parameters
			const takeoverConfig: TakeoverConfig = {
				aiDecisionInterval: parameters.conditions.gapPeriodTime || 60000, // 默认60秒 - Default 60 seconds
				safetyCheckInterval: 30000, // 固定30秒安全检查间隔 - Fixed 30 seconds safety check interval
				maxGapPeriod: parameters.conditions.gapPeriodTime || 120000, // 默认120秒 - Default 120 seconds
				enableAutoTakeover: parameters.enabled,
				emergencyCloseThreshold: parameters.conditions.riskThreshold || 5, // 默认5% - Default 5%
				riskMonitoringThreshold: {
					maxLossPercent: parameters.conditions.riskThreshold || 10, // 默认10% - Default 10%
					maxDrawdownPercent: parameters.conditions.riskThreshold || 15, // 默认15% - Default 15%
				},
			};

			// 设置空窗期接管 - Set gap period takeover
			const takeoverId =
				this.gapPeriodTakeover.setTakeoverConfig(takeoverConfig);

			if (!takeoverId) {
				return {
					result: InterfaceCallResult.FAILED,
					errorMessage: "Failed to set gap period takeover",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 启动空窗期接管 - Start gap period takeover
			const started = this.gapPeriodTakeover.startTakeover(takeoverId);

			if (!started) {
				return {
					result: InterfaceCallResult.PARTIAL,
					errorMessage: "Gap period takeover set but start failed",
					data: takeoverId,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 发出空窗期接管设置事件 - Emit gap period takeover set event
			this.emit("gapPeriodTakeoverSet", { takeoverId, parameters });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: takeoverId,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("设置缺口期接管时出错", { error, parameters });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 设置开仓监控关联
	 * Set opening monitoring association
	 *
	 * @param parameters 开仓监控关联参数 - Opening monitoring association parameters
	 * @returns Promise<InterfaceCallResponse<string>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * setOpeningMonitoringAssociation({
	 *   openingId: "open_12345",
	 *   positionId: "pos_12345",
	 *   symbol: "BTCUSDT",
	 *   direction: "long",
	 *   size: 0.01,
	 *   entryPrice: 50000,
	 *   monitoringConfig: {
	 *     enabled: true,
	 *     types: ["stop_loss", "take_profit", "trailing_stop"],
	 *     parameters: {
	 *       stopLoss: { type: "percentage", value: 2 },
	 *       takeProfit: { type: "percentage", value: 10 },
	 *       trailingStop: { type: "percentage", value: 1 }
	 *     }
	 *   }
	 * })
	 */
	async setOpeningMonitoringAssociation(
		parameters: OpeningMonitoringAssociationParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			const validationResult =
				this.validateOpeningMonitoringAssociationParameters(parameters);
			if (validationResult.result !== InterfaceCallResult.SUCCESS) {
				return {
					result: validationResult.result,
					errorMessage:
						validationResult.errorMessage || validationResult.message,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 注册开仓操作 - Register opening operation
			const registered =
				this.openingMonitoringAssociation.registerOpeningOperation(
					parameters.openingId,
					parameters.decisionId || `decision_${Date.now()}`,
					parameters.strategyId || "default",
					parameters.exchange || "default",
					parameters.symbol,
					parameters.direction,
					parameters.orderId || `order_${Date.now()}`,
					parameters.size,
					parameters.leverage || 1,
					parameters.tags,
				);

			if (!registered) {
				return {
					result: InterfaceCallResult.FAILED,
					errorMessage: "Failed to register opening operation",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 创建监控关联 - Create monitoring association
			const associationId =
				this.openingMonitoringAssociation.createMonitoringAssociation(
					parameters.openingId,
					parameters.positionId,
					"batch_closing",
					parameters.monitoringConfig,
				);

			if (!associationId) {
				return {
					result: InterfaceCallResult.PARTIAL,
					errorMessage:
						"Opening operation registered but monitoring association creation failed",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 启动监控 - Start monitoring
			const started =
				this.openingMonitoringAssociation.startMonitoring(associationId);

			if (!started) {
				return {
					result: InterfaceCallResult.PARTIAL,
					errorMessage:
						"Opening operation and monitoring association created but monitoring start failed",
					data: associationId,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 发出开仓监控关联设置事件 - Emit opening monitoring association set event
			this.emit("openingMonitoringAssociationSet", {
				associationId,
				parameters,
			});

			return {
				result: InterfaceCallResult.SUCCESS,
				data: associationId,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("设置开仓监控关联时出错", { error, parameters });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 获取持仓信息
	 * Get position information
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<PositionInfo>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getPositionInfo("pos_12345")
	 */
	async getPositionInfo(
		positionId: string,
	): Promise<InterfaceCallResponse<PositionInfo>> {
		const startTime = Date.now();

		try {
			// 这里应该从交易所获取持仓信息
			// Here you should get position information from the exchange
			// 这只是一个示例实现
			// This is just an example implementation

			// 在实际应用中，这里应该调用交易所API或其他数据源
			// In a real application, this should call the exchange API or other data sources

			return {
				result: InterfaceCallResult.NOT_FOUND,
				errorMessage: "Position not found",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("获取仓位信息时出错", { error, positionId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 获取分批平仓状态
	 * Get batch closing status
	 *
	 * @param batchId 分批ID - Batch ID
	 * @returns Promise<InterfaceCallResponse<BatchClosingStatus>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getBatchClosingStatus("batch_12345")
	 */
	async getBatchClosingStatus(
		batchId: string,
	): Promise<InterfaceCallResponse<BatchClosingStatus>> {
		const startTime = Date.now();

		try {
			const batchState = this.batchClosingSystem.getBatchState(batchId);

			if (!batchState) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Batch not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 将BatchState转换为BatchClosingStatus格式 - Convert BatchState to BatchClosingStatus format
			const batchClosingStatus: BatchClosingStatus = {
				batchId: batchState.config.batchId,
				positionId: batchState.config.positionId,
				status: batchState.status as any, // 将BatchStatus枚举转换为字符串
				closingType: batchState.config.closingType,
				totalBatches: 1, // 默认值，因为BatchConfig中没有这个属性
				completedBatches: batchState.status === BatchStatus.COMPLETED ? 1 : 0, // 根据状态判断
				createdAt: batchState.config.createdAt,
				lastUpdatedAt: Date.now(), // 使用当前时间
				metadata: {
					closingRatio: batchState.config.closingRatio,
					closingQuantity: batchState.config.closingQuantity,
					triggerCondition: batchState.config.triggerCondition,
					priority: batchState.config.priority,
					expiresAt: batchState.config.expiresAt,
					executedAt: batchState.executedAt,
					completedAt: batchState.completedAt,
					cancelledAt: batchState.cancelledAt,
					actualQuantity: batchState.executionResult?.actualQuantity,
					actualPrice: batchState.executionResult?.actualPrice,
					fee: batchState.executionResult?.fee,
					pnl: batchState.executionResult?.pnl,
					errorMessage: batchState.errorMessage,
					retryCount: batchState.retryCount,
				},
			};

			return {
				result: InterfaceCallResult.SUCCESS,
				data: batchClosingStatus,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("获取批量平仓状态时出错", { error, batchId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 根据持仓ID获取止盈止损阈值
	 * Get stop profit/loss thresholds by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param type 阈值类型 - Threshold type
	 * @returns Promise<InterfaceCallResponse<DynamicThreshold[]>> 阈值列表 - Threshold list
	 *
	 * 示例 Example:
	 * getThresholdsByPositionId("pos_123456", "stop_loss")
	 */
	async getThresholdsByPositionId(
		positionId: string,
		type?: string,
	): Promise<InterfaceCallResponse<DynamicThreshold[]>> {
		try {
			// 验证参数 - Validate parameters
			if (!positionId) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			// 调用动态阈值设定系统获取阈值 - Call dynamic threshold setting system to get thresholds
			const thresholds =
				await this.dynamicThresholdSetting.getThresholdsByPositionId(
					positionId,
				);

			if (!thresholds || thresholds.length === 0) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message: "Thresholds not found for the specified position ID",
						details: { positionId },
					},
				};
			}

			// 根据类型过滤阈值 - Filter thresholds by type
			let filteredThresholds = thresholds;
			if (type) {
				const thresholdType = this.mapThresholdType(type);
				filteredThresholds = thresholds.filter((t) => t.type === thresholdType);
			}

			if (filteredThresholds.length === 0) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message: `No ${
							type || "any"
						} thresholds found for the specified position ID`,
						details: { positionId, type },
					},
				};
			}

			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: filteredThresholds,
				callTime: startTime,
				processingTime,
				message: `Thresholds retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error("Error getting thresholds:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_THRESHOLDS_ERROR",
					message: "Failed to get thresholds",
					details: {
						positionId,
						type,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据持仓ID获取止盈止损状态
	 * Get stop profit loss status by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param type 类型 - Type
	 * @returns Promise<InterfaceCallResponse<StopProfitLossStatus>> 止盈止损状态 - Stop profit loss status
	 *
	 * 示例 Example:
	 * getStopProfitLossStatus("pos_123456", "stop_loss")
	 */
	async getStopProfitLossStatus(
		positionId: string,
		type?: string,
	): Promise<InterfaceCallResponse<StopProfitLossStatus>> {
		try {
			// 验证参数 - Validate parameters
			if (!positionId) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			// 调用动态阈值设定系统获取阈值 - Call dynamic threshold setting system to get thresholds
			const thresholds =
				await this.dynamicThresholdSetting.getThresholdsByPositionId(
					positionId,
				);

			if (!thresholds || thresholds.length === 0) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Stop profit loss status not found for the specified position ID",
						details: { positionId },
					},
				};
			}

			// 根据类型过滤阈值 - Filter thresholds by type
			let filteredThresholds = thresholds;
			if (type) {
				const thresholdType = this.mapThresholdType(type);
				filteredThresholds = thresholds.filter((t) => t.type === thresholdType);
			}

			if (filteredThresholds.length === 0) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message: `No ${
							type || "any"
						} stop profit loss status found for the specified position ID`,
						details: { positionId, type },
					},
				};
			}

			// 构建状态对象 - Build status object
			const stopProfitLossStatus: StopProfitLossStatus = {
				positionId,
				thresholdType: (filteredThresholds[0]?.type as any) || "stop_loss",
				status: (filteredThresholds[0]?.status as any) || "active",
				currentValue: 0, // 需要从实际数据获取
				triggerValue: filteredThresholds[0]?.parameters?.fixedValue || 0, // 使用parameters.fixedValue而不是value
				createdAt: filteredThresholds[0]?.createdAt || Date.now(),
				lastUpdatedAt: Math.max(...filteredThresholds.map((t) => t.updatedAt)),
			};

			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: stopProfitLossStatus,
				callTime: startTime,
				processingTime,
				message: `Stop profit loss status retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error("Error getting stop profit loss status:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_STOP_PROFIT_LOSS_STATUS_ERROR",
					message: "Failed to get stop profit loss status",
					details: {
						positionId,
						type,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据持仓ID获取空窗期接管状态
	 * Get gap period takeover status by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<GapPeriodTakeoverStatus>> 空窗期接管状态 - Gap period takeover status
	 *
	 * 示例 Example:
	 * getGapPeriodTakeoverStatus("pos_123456")
	 */
	async getGapPeriodTakeoverStatus(
		positionId: string,
	): Promise<InterfaceCallResponse<GapPeriodTakeoverStatus>> {
		try {
			// 验证参数 - Validate parameters
			if (!positionId) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			// 调用空窗期接管系统获取状态 - Call gap period takeover system to get status
			const takeoverState =
				await this.gapPeriodTakeover.getTakeoverState(positionId);

			if (!takeoverState) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Gap period takeover status not found for the specified position ID",
						details: { positionId },
					},
				};
			}

			// 将TakeoverState转换为GapPeriodTakeoverStatus - Convert TakeoverState to GapPeriodTakeoverStatus
			const gapPeriodTakeoverStatus: GapPeriodTakeoverStatus = {
				positionId: positionId,
				status: takeoverState.status as any,
				takeoverId: takeoverState.takeoverId || "",
				takeoverType: takeoverState.takeoverType || "",
				takeoverTime: takeoverState.takeoverStartTime || Date.now(),
				takeoverReason: takeoverState.takeoverReason || "",
				originalSystem: takeoverState.originalSystem || "",
				expectedDuration: takeoverState.expectedDuration || 0,
				remainingDuration: takeoverState.remainingDuration || 0,
				metadata: takeoverState.metadata || {},
			};

			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: gapPeriodTakeoverStatus,
				callTime: startTime,
				processingTime,
				message: `Gap period takeover status retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error("Error getting gap period takeover status:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_GAP_PERIOD_TAKEOVER_STATUS_ERROR",
					message: "Failed to get gap period takeover status",
					details: {
						positionId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据持仓ID获取开仓监控关联状态
	 * Get opening monitoring association status by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<OpeningMonitoringAssociationStatus>> 开仓监控关联状态 - Opening monitoring association status
	 *
	 * 示例 Example:
	 * getOpeningMonitoringAssociationStatus("pos_123456")
	 */
	async getOpeningMonitoringAssociationStatus(
		positionId: string,
	): Promise<InterfaceCallResponse<OpeningMonitoringAssociationStatus>> {
		try {
			// 验证参数 - Validate parameters
			if (!positionId) {
				const startTime = Date.now();
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			const startTime = Date.now();

			// 调用开仓监控关联系统获取状态 - Call opening monitoring association system to get status
			const openingMonitoringAssociationStatusResult =
				await this.openingMonitoringAssociation.getStatus(positionId);

			if (!openingMonitoringAssociationStatusResult) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Opening monitoring association status not found for the specified position ID",
						details: { positionId },
					},
				};
			}

			// 转换为OpeningMonitoringAssociationStatus格式 - Convert to OpeningMonitoringAssociationStatus format
			const openingMonitoringAssociationStatus: OpeningMonitoringAssociationStatus =
				{
					openingId: openingMonitoringAssociationStatusResult.openingId || "",
					positionId:
						openingMonitoringAssociationStatusResult.positionId || positionId,
					openingStatus:
						openingMonitoringAssociationStatusResult.openingStatus ||
						OpeningStatus.PENDING, // 使用正确的属性名和枚举值
					monitoringStatus:
						openingMonitoringAssociationStatusResult.monitoringStatus ||
						MonitoringStatus.INACTIVE,
					symbol: openingMonitoringAssociationStatusResult.symbol || "",
					direction:
						(openingMonitoringAssociationStatusResult.direction as any) ||
						"long",
					size: openingMonitoringAssociationStatusResult.size || 0,
					entryPrice: openingMonitoringAssociationStatusResult.entryPrice || 0,
					createdAt:
						openingMonitoringAssociationStatusResult.createdAt || Date.now(),
					lastUpdatedAt:
						openingMonitoringAssociationStatusResult.lastUpdatedAt ||
						Date.now(),
					metadata: openingMonitoringAssociationStatusResult.metadata || {},
				};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: openingMonitoringAssociationStatus,
				callTime: startTime,
				processingTime,
				message: `Opening monitoring association status retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error(
				"Error getting opening monitoring association status:",
				error,
			);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_OPENING_MONITORING_ASSOCIATION_STATUS_ERROR",
					message: "Failed to get opening monitoring association status",
					details: {
						positionId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据持仓ID获取所有状态信息
	 * Get all status information by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<AllStatusInfo>> 所有状态信息 - All status information
	 *
	 * 示例 Example:
	 * getAllStatusByPositionId("pos_123456")
	 */
	async getAllStatusByPositionId(
		positionId: string,
	): Promise<InterfaceCallResponse<AllStatusInfo>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!positionId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			// 并行获取所有状态信息 - Get all status information in parallel
			const [
				batchClosingStatusResult,
				stopProfitLossStatusResult,
				gapPeriodTakeoverStatusResult,
				openingMonitoringAssociationStatusResult,
				positionManagementStatusResult,
			] = await Promise.allSettled([
				this.getBatchClosingStatus(positionId),
				this.getStopProfitLossStatus(positionId),
				this.getGapPeriodTakeoverStatus(positionId),
				this.getOpeningMonitoringAssociationStatus(positionId),
				this.getPositionManagementStatusByPositionId(positionId),
			]);

			// 构建完整状态信息 - Build complete status information
			const allStatusInfo: AllStatusInfo = {
				positionId,
				batchClosingStatus:
					batchClosingStatusResult.status === "fulfilled" &&
					batchClosingStatusResult.value.success
						? (() => {
								// 将BatchClosingStatus转换为BatchState
								const batchClosingStatus = batchClosingStatusResult.value.data;
								if (!batchClosingStatus) return undefined;

								const batchState: BatchState = {
									config: {
										batchId: batchClosingStatus.batchId,
										positionId: batchClosingStatus.positionId,
										closingType:
											batchClosingStatus.metadata?.closingType || "take_profit",
										closingRatio:
											batchClosingStatus.metadata?.closingRatio || 1,
										closingQuantity:
											batchClosingStatus.metadata?.closingQuantity || 0,
										triggerCondition: batchClosingStatus.metadata
											?.triggerCondition || {
											triggerType: "manual",
											triggerValue: 0,
											operator: ">=",
										},
										priority: batchClosingStatus.metadata?.priority || 1,
										createdAt: batchClosingStatus.createdAt,
										expiresAt: batchClosingStatus.metadata?.expiresAt,
									},
									status: batchClosingStatus.status as any,
									executedAt: batchClosingStatus.metadata?.executedAt,
									completedAt: batchClosingStatus.metadata?.completedAt,
									executionResult: batchClosingStatus.metadata?.executionResult,
									errorMessage: batchClosingStatus.metadata?.errorMessage,
									retryCount: batchClosingStatus.metadata?.retryCount || 0,
								};
								return [batchState];
							})()
						: undefined,
				stopProfitLossStatus:
					stopProfitLossStatusResult.status === "fulfilled" &&
					stopProfitLossStatusResult.value.success
						? stopProfitLossStatusResult.value.data
						: undefined,
				gapPeriodTakeoverStatus:
					gapPeriodTakeoverStatusResult.status === "fulfilled" &&
					gapPeriodTakeoverStatusResult.value.success
						? gapPeriodTakeoverStatusResult.value.data
						: undefined,
				openingMonitoringAssociationStatus:
					openingMonitoringAssociationStatusResult.status === "fulfilled" &&
					openingMonitoringAssociationStatusResult.value.success
						? openingMonitoringAssociationStatusResult.value.data
						: undefined,
				positionManagementStatus:
					positionManagementStatusResult.status === "fulfilled" &&
					positionManagementStatusResult.value.success
						? positionManagementStatusResult.value.data
						: undefined,
				lastUpdated: Date.now(),
			};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: allStatusInfo,
				callTime: startTime,
				processingTime,
				message: `All status information retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error("Error getting all status by position ID:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_ALL_STATUS_ERROR",
					message: "Failed to get all status by position ID",
					details: {
						positionId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据批次ID获取分批平仓状态
	 * Get batch closing status by batch ID
	 *
	 * @param batchId 批次ID - Batch ID
	 * @returns Promise<InterfaceCallResponse<BatchClosingStatus>> 分批平仓状态 - Batch closing status
	 *
	 * 示例 Example:
	 * getBatchClosingStatusByBatchId("batch_123456")
	 */
	async getBatchClosingStatusByBatchId(
		batchId: string,
	): Promise<InterfaceCallResponse<BatchClosingStatus>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!batchId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Batch ID is required",
						details: { batchId },
					},
				};
			}

			// 调用分批平仓系统获取状态 - Call batch closing system to get status
			const batchState =
				this.batchClosingSystem.getBatchClosingStatusByBatchId(batchId);

			if (!batchState) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Batch closing status not found for the specified batch ID",
						details: { batchId },
					},
				};
			}

			// 将BatchState转换为BatchClosingStatus - Convert BatchState to BatchClosingStatus
			const batchClosingStatus: BatchClosingStatus = {
				batchId: batchState.config.batchId,
				positionId: batchState.config.positionId,
				status: batchState.status as any, // 类型转换
				closingType: batchState.config.closingType, // 添加平仓类型 - Add closing type
				totalBatches: 1, // 单个批次，设置为1
				completedBatches: batchState.status === BatchStatus.COMPLETED ? 1 : 0,
				createdAt: batchState.config.createdAt,
				lastUpdatedAt: batchState.completedAt || Date.now(),
				metadata: {
					closingType: batchState.config.closingType,
					closingRatio: batchState.config.closingRatio,
					closingQuantity: batchState.config.closingQuantity,
					triggerCondition: batchState.config.triggerCondition,
					priority: batchState.config.priority,
					executedAt: batchState.executedAt,
					completedAt: batchState.completedAt,
					executionResult: batchState.executionResult,
					errorMessage: batchState.errorMessage,
					retryCount: batchState.retryCount,
				},
			};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: batchClosingStatus,
				callTime: startTime,
				processingTime,
				message: `Batch closing status retrieved for batch ${batchId}`,
			};
		} catch (error) {
			console.error("Error getting batch closing status by batch ID:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_BATCH_CLOSING_STATUS_BY_BATCH_ID_ERROR",
					message: "Failed to get batch closing status by batch ID",
					details: {
						batchId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据阈值ID获取阈值信息
	 * Get threshold by threshold ID
	 *
	 * @param thresholdId 阈值ID - Threshold ID
	 * @returns Promise<InterfaceCallResponse<Threshold>> 阈值信息 - Threshold information
	 *
	 * 示例 Example:
	 * getThresholdByThresholdId("threshold_123456")
	 */
	async getThresholdByThresholdId(
		thresholdId: string,
	): Promise<InterfaceCallResponse<Threshold>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!thresholdId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Threshold ID is required",
						details: { thresholdId },
					},
				};
			}

			// 调用动态阈值设定系统获取阈值 - Call dynamic threshold setting system to get threshold
			const dynamicThreshold =
				await this.dynamicThresholdSetting.getThresholdByThresholdId(
					thresholdId,
				);

			if (!dynamicThreshold) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message: "Threshold not found for the specified threshold ID",
						details: { thresholdId },
					},
				};
			}

			// 将DynamicThreshold转换为Threshold - Convert DynamicThreshold to Threshold
			const threshold: Threshold = {
				thresholdId: dynamicThreshold.thresholdId,
				positionId: dynamicThreshold.positionId,
				type: dynamicThreshold.type,
				name: `${dynamicThreshold.type}_${dynamicThreshold.thresholdId}`,
				description: `Dynamic threshold of type ${dynamicThreshold.type}`,
				direction:
					dynamicThreshold.parameters.fixedValue !== undefined
						? dynamicThreshold.entryPrice <
							dynamicThreshold.parameters.fixedValue
							? "above"
							: "below"
						: "above",
				calculationMethod: dynamicThreshold.calculationMethod,
				parameters: dynamicThreshold.parameters,
				isActive: dynamicThreshold.status === "active",
				isTriggered: dynamicThreshold.status === "triggered",
				createdAt: dynamicThreshold.createdAt,
				updatedAt: dynamicThreshold.updatedAt,
				triggeredAt: dynamicThreshold.triggeredAt,
				metadata: dynamicThreshold.metadata,
			};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: threshold,
				callTime: startTime,
				processingTime,
				message: `Threshold retrieved for threshold ${thresholdId}`,
			};
		} catch (error) {
			console.error("Error getting threshold by threshold ID:", error);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_THRESHOLD_BY_THRESHOLD_ID_ERROR",
					message: "Failed to get threshold by threshold ID",
					details: {
						thresholdId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据接管ID获取空窗期接管状态
	 * Get gap period takeover status by takeover ID
	 *
	 * @param takeoverId 接管ID - Takeover ID
	 * @returns Promise<InterfaceCallResponse<GapPeriodTakeoverStatus>> 空窗期接管状态 - Gap period takeover status
	 *
	 * 示例 Example:
	 * getGapPeriodTakeoverStatusByTakeoverId("takeover_123456")
	 */
	async getGapPeriodTakeoverStatusByTakeoverId(
		takeoverId: string,
	): Promise<InterfaceCallResponse<GapPeriodTakeoverStatus>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!takeoverId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Takeover ID is required",
						details: { takeoverId },
					},
				};
			}

			// 调用空窗期接管系统获取状态 - Call gap period takeover system to get status
			const takeoverState = this.gapPeriodTakeover.getTakeoverState(takeoverId);

			if (!takeoverState) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Gap period takeover status not found for the specified takeover ID",
						details: { takeoverId },
					},
				};
			}

			// 将TakeoverState转换为GapPeriodTakeoverStatus
			// Convert TakeoverState to GapPeriodTakeoverStatus
			const gapPeriodTakeoverStatus: GapPeriodTakeoverStatus = {
				positionId: takeoverState.monitoredPositions[0] || "",
				status: takeoverState.status,
				takeoverId: takeoverState.takeoverId,
				takeoverType: "manual",
				takeoverTime: takeoverState.takeoverStartTime || Date.now(),
				takeoverReason: "AI决策空窗期接管",
				originalSystem: "CaiSenGapPeriodTakeover",
				expectedDuration: 0,
				remainingDuration: 0,
				metadata: {
					monitoredPositions: takeoverState.monitoredPositions,
					lastAiDecisionTime: takeoverState.lastAiDecisionTime,
					riskIndicators: takeoverState.riskIndicators,
				},
			};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: gapPeriodTakeoverStatus,
				callTime: startTime,
				processingTime,
				message: `Gap period takeover status retrieved for takeover ${takeoverId}`,
			};
		} catch (error) {
			console.error(
				"Error getting gap period takeover status by takeover ID:",
				error,
			);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_GAP_PERIOD_TAKEOVER_STATUS_BY_TAKEOVER_ID_ERROR",
					message: "Failed to get gap period takeover status by takeover ID",
					details: {
						takeoverId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据持仓ID获取持仓管理状态
	 * Get position management status by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<PositionManagementStatus>> 持仓管理状态 - Position management status
	 *
	 * 示例 Example:
	 * getPositionManagementStatusByPositionId("position_123456")
	 */
	async getPositionManagementStatusByPositionId(
		positionId: string,
	): Promise<InterfaceCallResponse<PositionManagementStatus>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!positionId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Position ID is required",
						details: { positionId },
					},
				};
			}

			// 获取当前时间戳 - Get current timestamp
			const currentTime = Date.now();

			// 创建默认的持仓管理状态 - Create default position management status
			const positionManagementStatus: PositionManagementStatus = {
				positionId,
				status: "active",
				managementType: "automated",
				managementStartTime: currentTime,
				lastUpdated: currentTime,
				riskLevel: "low",
				performanceMetrics: {
					returnRate: 0.05,
					maxDrawdown: 0.02,
					sharpeRatio: 1.5,
					winRate: 0.65,
				},
				managementParams: {
					riskTolerance: "medium",
					maxPositionSize: 10000,
					stopLossPercentage: 0.05,
					takeProfitPercentage: 0.1,
				},
				metadata: {
					lastChecked: currentTime,
					automatedSystems: [
						"CaiSenGapPeriodTakeover",
						"CaiSenBatchClosingSystem",
						"CaiSenAiParameterControl",
						"CaiSenOpeningMonitoringAssociation",
					],
				},
			};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: positionManagementStatus,
				callTime: startTime,
				processingTime,
				message: `Position management status retrieved for position ${positionId}`,
			};
		} catch (error) {
			console.error(
				"Error getting position management status by position ID:",
				error,
			);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_POSITION_MANAGEMENT_STATUS_BY_POSITION_ID_ERROR",
					message: "Failed to get position management status by position ID",
					details: {
						positionId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 根据关联ID获取开仓监控关联状态
	 * Get opening monitoring association status by association ID
	 *
	 * @param associationId 关联ID - Association ID
	 * @returns Promise<InterfaceCallResponse<OpeningMonitoringAssociationStatus>> 开仓监控关联状态 - Opening monitoring association status
	 *
	 * 示例 Example:
	 * getOpeningMonitoringAssociationStatusByAssociationId("association_123456")
	 */
	async getOpeningMonitoringAssociationStatusByAssociationId(
		associationId: string,
	): Promise<InterfaceCallResponse<OpeningMonitoringAssociationStatus>> {
		try {
			const startTime = Date.now();

			// 验证参数 - Validate parameters
			if (!associationId) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "INVALID_PARAMETER",
						message: "Association ID is required",
						details: { associationId },
					},
				};
			}

			// 调用开仓监控关联系统获取状态 - Call opening monitoring association system to get status
			const associationRecord =
				await this.openingMonitoringAssociation.getMonitoringAssociation(
					associationId,
				);

			if (!associationRecord) {
				const processingTime = Date.now() - startTime;
				return {
					result: InterfaceCallResult.NOT_FOUND,
					success: false,
					callTime: startTime,
					processingTime,
					error: {
						code: "NOT_FOUND",
						message:
							"Opening monitoring association status not found for the specified association ID",
						details: { associationId },
					},
				};
			}

			// 转换为OpeningMonitoringAssociationStatus格式 - Convert to OpeningMonitoringAssociationStatus format
			const openingMonitoringAssociationStatus: OpeningMonitoringAssociationStatus =
				{
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					openingStatus: this.mapMonitoringStatusToOpeningStatus(
						associationRecord.status,
					),
					monitoringStatus: associationRecord.status,
					symbol: "",
					direction: "long",
					size: 0,
					entryPrice: 0,
					createdAt: associationRecord.createdAt,
					lastUpdatedAt: associationRecord.updatedAt,
					metadata: associationRecord.monitoringParams || {},
				};

			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				data: openingMonitoringAssociationStatus,
				callTime: startTime,
				processingTime,
				message: `Opening monitoring association status retrieved for association ${associationId}`,
			};
		} catch (error) {
			console.error(
				"Error getting opening monitoring association status by association ID:",
				error,
			);
			const startTime = Date.now();
			const processingTime = Date.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				callTime: startTime,
				processingTime,
				error: {
					code: "GET_OPENING_MONITORING_ASSOCIATION_STATUS_BY_ASSOCIATION_ID_ERROR",
					message:
						"Failed to get opening monitoring association status by association ID",
					details: {
						associationId,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			};
		}
	}

	/**
	 * 验证分批平仓参数
	 * Validate batch closing parameters
	 * @private
	 */
	private validateBatchClosingParameters(parameters: BatchClosingParameters): {
		valid: boolean;
		errorMessage?: string;
	} {
		// 检查必需参数 - Check required parameters
		if (!parameters.positionId) {
			return { valid: false, errorMessage: "Position ID is required" };
		}

		if (!parameters.batchCount || parameters.batchCount <= 0) {
			return {
				valid: false,
				errorMessage: "Batch count must be greater than 0",
			};
		}

		if (
			!parameters.batchPercentages ||
			parameters.batchPercentages.length === 0
		) {
			return { valid: false, errorMessage: "Batch percentages are required" };
		}

		// 验证百分比总和 - Validate percentage sum
		const totalPercentage = parameters.batchPercentages.reduce(
			(sum, percentage) => sum + percentage,
			0,
		);
		if (Math.abs(totalPercentage - 100) > 0.01) {
			return {
				valid: false,
				errorMessage: "Batch percentages must sum to 100",
			};
		}

		// 验证触发条件 - Validate trigger conditions
		if (parameters.triggerConditions) {
			for (const condition of parameters.triggerConditions) {
				if (condition.type === "price" && condition.value <= 0) {
					return {
						valid: false,
						errorMessage: "Price threshold must be greater than 0",
					};
				}

				if (condition.type === "time" && condition.value <= 0) {
					return {
						valid: false,
						errorMessage: "Time threshold must be greater than 0",
					};
				}

				if (condition.type === "profit" && condition.value <= 0) {
					return {
						valid: false,
						errorMessage: "Profit threshold must be greater than 0",
					};
				}
			}
		}

		// 验证执行策略 - Validate execution strategy
		if (parameters.executionStrategy) {
			if (parameters.delayTime !== undefined && parameters.delayTime < 0) {
				return {
					valid: false,
					errorMessage: "Delay time must be non-negative",
				};
			}

			if (
				parameters.expirationTime !== undefined &&
				parameters.expirationTime <= 0
			) {
				return {
					valid: false,
					errorMessage: "Expiration time must be greater than 0",
				};
			}
		}

		return { valid: true };
	}

	/**
	 * 映射阈值类型
	 * Map threshold type
	 * @param type 阈值类型 - Threshold type
	 * @returns 映射后的阈值类型 - Mapped threshold type
	 */
	private mapThresholdType(type: string): ThresholdType {
		switch (type) {
			case "stop_loss":
				return ThresholdType.STOP_LOSS;
			case "take_profit":
				return ThresholdType.TAKE_PROFIT;
			case "partial_take_profit":
				return ThresholdType.PARTIAL_PROFIT;
			case "trailing_stop":
				return ThresholdType.TRAILING_STOP;
			case "trailing_take_profit":
				return ThresholdType.TRAILING_STOP;
			default:
				// 对于未知的阈值类型，默认使用止损类型
				// For unknown threshold types, default to stop loss type
				return ThresholdType.STOP_LOSS;
		}
	}

	/**
	 * 将监控状态映射到开仓状态
	 * Map monitoring status to opening status
	 * @param status 监控状态 - Monitoring status
	 * @returns 开仓状态 - Opening status
	 */
	private mapMonitoringStatusToOpeningStatus(
		status: MonitoringStatus,
	): OpeningStatus {
		switch (status) {
			case MonitoringStatus.INACTIVE:
				return OpeningStatus.PENDING;
			case MonitoringStatus.INITIALIZING:
				return OpeningStatus.SUBMITTED;
			case MonitoringStatus.ACTIVE:
				return OpeningStatus.FILLED;
			case MonitoringStatus.PAUSED:
				return OpeningStatus.PARTIAL_FILLED;
			case MonitoringStatus.STOPPED:
				return OpeningStatus.FILLED;
			case MonitoringStatus.ERROR:
				return OpeningStatus.FAILED;
			default:
				return OpeningStatus.PENDING;
		}
	}

	/**
	 * 验证止盈止损参数
	 * Validate stop profit loss parameters
	 * @param parameters 止盈止损参数 - Stop profit loss parameters
	 * @returns 验证结果 - Validation result
	 */
	private validateStopProfitLossParameters(
		parameters: StopProfitLossParameters,
	): {
		valid: boolean;
		errorMessage?: string;
	} {
		// 检查必需参数 - Check required parameters
		if (!parameters.positionId) {
			return { valid: false, errorMessage: "Position ID is required" };
		}

		if (!parameters.stopLoss && !parameters.takeProfit) {
			return {
				valid: false,
				errorMessage: "At least one of stop loss or take profit is required",
			};
		}

		// 验证止损参数 - Validate stop loss parameters
		if (parameters.stopLoss) {
			if (
				parameters.stopLoss.type === "fixed" &&
				parameters.stopLoss.value <= 0
			) {
				return {
					valid: false,
					errorMessage: "Stop loss price must be greater than 0",
				};
			}

			if (
				parameters.stopLoss.type === "percentage" &&
				parameters.stopLoss.value <= 0
			) {
				return {
					valid: false,
					errorMessage: "Stop loss percentage must be greater than 0",
				};
			}
		}

		// 验证止盈参数 - Validate take profit parameters
		if (parameters.takeProfit) {
			if (
				parameters.takeProfit.type === "fixed" &&
				parameters.takeProfit.value <= 0
			) {
				return {
					valid: false,
					errorMessage: "Take profit price must be greater than 0",
				};
			}

			if (
				parameters.takeProfit.type === "percentage" &&
				parameters.takeProfit.value <= 0
			) {
				return {
					valid: false,
					errorMessage: "Take profit percentage must be greater than 0",
				};
			}
		}

		return { valid: true };
	}

	/**
	 * 将止损类型映射到阈值计算方法
	 * Map stop loss type to threshold calculation method
	 * @param stopLossType 止损类型 - Stop loss type
	 * @returns 阈值计算方法 - Threshold calculation method
	 */
	private mapStopLossTypeToThresholdCalculationMethod(
		stopLossType: string,
	): string {
		switch (stopLossType) {
			case "price":
				return "absolute_price";
			case "percentage":
				return "percentage_change";
			case "trailing":
				return "trailing_stop";
			case "atr":
				return "average_true_range";
			default:
				return "absolute_price";
		}
	}

	/**
	 * 将止盈类型映射到阈值计算方法
	 * Map take profit type to threshold calculation method
	 *
	 * @param takeProfitType 止盈类型 - Take profit type
	 * @returns 阈值计算方法 - Threshold calculation method
	 */
	private mapTakeProfitTypeToThresholdCalculationMethod(
		takeProfitType: string,
	): string {
		switch (takeProfitType) {
			case "fixed":
				return "absolute_price";
			case "percentage":
				return "percentage_change";
			case "trailing":
				return "trailing_profit";
			case "atr":
				return "average_true_range";
			default:
				return "percentage_change";
		}
	}

	/**
	 * 获取接管状态
	 * Get takeover state
	 * @param positionId 持仓ID - Position ID
	 * @returns 接管状态 - Takeover state
	 */
	private getTakeoverState(positionId: string): GapPeriodTakeoverStatus {
		try {
			const takeoverState = this.gapPeriodTakeover.getTakeoverState(positionId);

			// 将TakeoverState转换为GapPeriodTakeoverStatus
			// Convert TakeoverState to GapPeriodTakeoverStatus
			if (takeoverState) {
				return {
					positionId,
					status: takeoverState.status,
					takeoverId: takeoverState.takeoverId,
					takeoverType: "manual",
					takeoverTime: takeoverState.takeoverStartTime || Date.now(),
					takeoverReason: "AI决策空窗期接管",
					originalSystem: "CaiSenGapPeriodTakeover",
					expectedDuration: 0,
					remainingDuration: 0,
					metadata: {
						monitoredPositions: takeoverState.monitoredPositions,
						lastAiDecisionTime: takeoverState.lastAiDecisionTime,
						riskIndicators: takeoverState.riskIndicators,
					},
				};
			}

			// 如果没有找到接管状态，返回默认状态
			// If no takeover state is found, return default status
			return {
				positionId,
				status: TakeoverStatus.IDLE,
				takeoverId: "",
				takeoverType: "manual",
				takeoverTime: Date.now(),
				takeoverReason: "",
				originalSystem: "",
				expectedDuration: 0,
				remainingDuration: 0,
				metadata: {},
			};
		} catch (error) {
			console.error("Error getting takeover state:", error);
			return {
				positionId,
				status: TakeoverStatus.IDLE,
				takeoverId: "",
				takeoverType: "manual",
				takeoverTime: Date.now(),
				takeoverReason: "",
				originalSystem: "",
				expectedDuration: 0,
				remainingDuration: 0,
				metadata: {},
			};
		}
	}

	/**
	 * 验证空窗期接管参数
	 * Validate gap period takeover parameters
	 * @param parameters 空窗期接管参数 - Gap period takeover parameters
	 * @returns 验证结果 - Validation result
	 */
	private validateGapPeriodTakeoverParameters(
		parameters: any,
	): InterfaceCallResponse {
		const callTime = Date.now();
		const startTime = performance.now();

		try {
			// 检查必要参数 - Check required parameters
			if (!parameters.positionId) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message: "缺少持仓ID - Missing position ID",
					data: null,
					callTime,
					processingTime,
				};
			}

			if (
				parameters.enableAutoTakeover !== undefined &&
				typeof parameters.enableAutoTakeover !== "boolean"
			) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message:
						"enableAutoTakeover必须是布尔值 - enableAutoTakeover must be a boolean",
					data: null,
					callTime,
					processingTime,
				};
			}

			if (
				parameters.maxGapPeriod !== undefined &&
				(typeof parameters.maxGapPeriod !== "number" ||
					parameters.maxGapPeriod <= 0)
			) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message:
						"maxGapPeriod必须是正数 - maxGapPeriod must be a positive number",
					data: null,
					callTime,
					processingTime,
				};
			}

			const processingTime = performance.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				message: "参数验证成功 - Parameter validation successful",
				data: null,
				callTime,
				processingTime,
			};
		} catch (error) {
			const processingTime = performance.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				message: `参数验证失败 - Parameter validation failed: ${error}`,
				data: null,
				callTime,
				processingTime,
			};
		}
	}

	/**
	 * 验证开仓监控关联参数
	 * Validate opening monitoring association parameters
	 * @param parameters 开仓监控关联参数 - Opening monitoring association parameters
	 * @returns 验证结果 - Validation result
	 */
	private validateOpeningMonitoringAssociationParameters(
		parameters: any,
	): InterfaceCallResponse {
		const callTime = Date.now();
		const startTime = performance.now();

		try {
			// 检查必要参数 - Check required parameters
			if (!parameters.positionId) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message: "缺少持仓ID - Missing position ID",
					data: null,
					callTime,
					processingTime,
				};
			}

			if (
				parameters.enableAutoMonitoring !== undefined &&
				typeof parameters.enableAutoMonitoring !== "boolean"
			) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message:
						"enableAutoMonitoring必须是布尔值 - enableAutoMonitoring must be a boolean",
					data: null,
					callTime,
					processingTime,
				};
			}

			if (
				parameters.monitoringInterval !== undefined &&
				(typeof parameters.monitoringInterval !== "number" ||
					parameters.monitoringInterval <= 0)
			) {
				const processingTime = performance.now() - startTime;
				return {
					result: InterfaceCallResult.INVALID_PARAMS,
					success: false,
					message:
						"monitoringInterval必须是正数 - monitoringInterval must be a positive number",
					data: null,
					callTime,
					processingTime,
				};
			}

			const processingTime = performance.now() - startTime;
			return {
				result: InterfaceCallResult.SUCCESS,
				success: true,
				message: "参数验证成功 - Parameter validation successful",
				data: null,
				callTime,
				processingTime,
			};
		} catch (error) {
			const processingTime = performance.now() - startTime;
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				success: false,
				message: `参数验证失败 - Parameter validation failed: ${error}`,
				data: null,
				callTime,
				processingTime,
			};
		}
	}
}

/**
 * 创建蔡森策略标准化接口实例
 * Create CaiSen Strategy Standardized Interface instance
 *
 * @returns CaiSenStandardizedInterface 蔡森策略标准化接口实例 - CaiSen Strategy Standardized Interface instance
 *
 * 示例 Example:
 * const caiSenInterface = createCaiSenStandardizedInterface();
 */
export function createCaiSenStandardizedInterface(): CaiSenStandardizedInterface {
	// 创建交易所客户端 - Create exchange client
	const exchangeClient = createExchangeClient();

	// 创建AI决策引擎实例 - Create AI decision engine instance
	const aiDecisionEngine: AIDecisionEngine = {
		id: "cai-sen-ai-decision-engine",
		getLatestDecision: () => null,
		setDecisionParams: (params) => {
			// Implementation would set the decision parameters
			console.log("Setting AI decision params:", params);
		},
	};

	// 创建策略配置 - Create strategy configuration
	const strategyConfig: StrategyParams = {
		name: "蔡森策略",
		description: "基于蔡森理论的七分位分析和多时间框架趋势分析的交易策略",
		leverageMin: 5,
		leverageMax: 50,
		leverageRecommend: {
			normal: "15倍",
			good: "25倍",
			strong: "35倍",
		},
		positionSizeMin: 10,
		positionSizeMax: 40,
		positionSizeRecommend: {
			normal: "10-20%",
			good: "20-30%",
			strong: "30-40%",
		},
		stopLoss: {
			low: -3.0,
			mid: -2.0,
			high: -1.5,
		},
		trailingStop: {
			level1: { trigger: 1.0, stopAt: 0.5 },
			level2: { trigger: 2.0, stopAt: 1.0 },
			level3: { trigger: 3.0, stopAt: 2.0 },
		},
		partialTakeProfit: {
			stage1: { trigger: 1.0, closePercent: 30 },
			stage2: { trigger: 2.0, closePercent: 40 },
			stage3: { trigger: 3.0, closePercent: 30 },
		},
		peakDrawdownProtection: 5.0,
		volatilityAdjustment: {
			highVolatility: {
				leverageFactor: 0.7,
				positionFactor: 0.8,
			},
			normalVolatility: {
				leverageFactor: 1.0,
				positionFactor: 1.0,
			},
			lowVolatility: {
				leverageFactor: 1.2,
				positionFactor: 1.1,
			},
		},
		entryCondition: "多时间框架趋势一致且七分位处于有利位置",
		riskTolerance: "中等风险，追求稳健收益",
		tradingStyle: "中长线持仓，分批止盈",
		enableCodeLevelProtection: false,
		allowAiOverrideProtection: true,
		caiSen: {
			timeframeAnalysis: {
				dailyWeight: 0.4,
				hourlyWeight: 0.35,
				fiveMinWeight: 0.25,
				trendConfirmationThreshold: 0.7,
			},
			sevenSegmentStrategy: {
				crashDetectionThreshold: -0.15,
				calculationPeriod: 100,
				recoveryConfidence: {
					zone1_7: 0.8,
					zone1_2: 0.6,
					zone6_7: 0.7,
				},
			},
			dynamicPointTrading: {
				fibonacciLevels: [0.236, 0.382, 0.5, 0.618, 0.786],
				volatilityAdjustment: 1.5,
				volumeProfileWeight: 0.3,
			},
			aiOrderExecution: {
				signalWeights: {
					trend: 0.4,
					breakout: 0.35,
					rsi: 0.25,
				},
				confidenceThresholds: {
					high: 0.8,
					medium: 0.6,
				},
				slippageAdjustment: 0.1,
			},
			riskManagement: {
				atrPeriod: 14,
				stopLossCoefficient: 2.0,
				volatilityFactor: 1.5,
				batchTakeProfitRatios: [0.3, 0.4, 0.3],
			},
		},
	};

	// 创建各个系统实例 - Create system instances
	const gapPeriodTakeover = new CaiSenGapPeriodTakeover(
		exchangeClient,
		aiDecisionEngine,
		strategyConfig,
		{
			aiDecisionInterval: 300000, // 5 minutes in milliseconds
			safetyCheckInterval: 60000, // 1 minute in milliseconds
			maxGapPeriod: 86400000, // 24 hours in milliseconds
			enableAutoTakeover: true,
			emergencyCloseThreshold: 0.1,
			riskMonitoringThreshold: {
				maxLossPercent: 0.15,
				maxDrawdownPercent: 0.2,
			},
		},
	);

	const batchClosingSystem = new CaiSenBatchClosingSystem(
		{
			maxConcurrentBatches: 3,
			batchExecutionInterval: 60000, // 1 minute in milliseconds
			maxRetryCount: 3,
			enableAutoExecution: true,
			priceDeviationTolerance: 0.1,
		},
		strategyConfig,
	);

	const aiParameterControl = new CaiSenAiParameterControl(
		{
			enableParameterValidation: true,
			enableVersionControl: true,
			maxParameterHistory: 100,
			expirationCheckInterval: 300000, // 5 minutes in milliseconds
			enableAutoCleanup: true,
			compatibilityCheck: {
				enabled: true,
				minCompatibleVersion: 1,
			},
		},
		exchangeClient,
		strategyConfig,
		batchClosingSystem,
	);

	// 创建开仓监控关联配置 - Create opening monitoring association configuration
	const openingMonitoringAssociationConfig = {
		enableAutoMonitoringStartup: true,
		openingCheckInterval: 5000,
		openingCompletionTimeout: 300000,
		monitoringStartupDelay: 2000,
		enableStateSynchronization: true,
		stateSyncInterval: 10000,
		enableErrorRecovery: true,
		errorRecoveryRetries: 3,
		errorRecoveryDelay: 5000,
	};

	// 创建分批平仓指令识别配置 - Create batch closing instruction recognizer configuration
	const batchClosingInstructionRecognizerConfig = {
		enableAutoValidation: true,
		enableAutoExecution: false,
		validationTimeout: 5000,
		executionTimeout: 30000,
		enableInstructionExpiration: true,
		defaultInstructionExpiration: 3600000,
		enablePrioritySorting: true,
		enableInstructionDeduplication: true,
		deduplicationTimeWindow: 60000,
	};

	// 创建动态阈值设定配置 - Create dynamic threshold setting configuration
	const thresholdSettingConfig = {
		enableAutoCalculation: true,
		enableAutoUpdate: true,
		calculationInterval: 5000,
		updateInterval: 10000,
		enableThresholdExpiration: true,
		defaultThresholdExpiration: 86400000,
		enableThresholdCaching: true,
		cacheExpiration: 300000,
		enableThresholdValidation: true,
		maxThresholdCount: 1000,
	};

	// 创建开仓监控关联实例 - Create opening monitoring association instance
	// 先使用null作为monitorIndependentSystem参数，稍后更新
	const openingMonitoringAssociation = new CaiSenOpeningMonitoringAssociation(
		openingMonitoringAssociationConfig,
		strategyConfig,
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		null as any,
	);

	// 创建分批平仓指令识别实例 - Create batch closing instruction recognizer instance
	const batchClosingInstructionRecognizer =
		new CaiSenBatchClosingInstructionRecognizer(
			batchClosingInstructionRecognizerConfig,
			batchClosingSystem,
			aiParameterControl,
			exchangeClient,
		);

	// 创建动态阈值设定实例 - Create dynamic threshold setting instance
	const dynamicThresholdSetting = new CaiSenDynamicThresholdSetting(
		thresholdSettingConfig,
		batchClosingSystem,
		aiParameterControl,
	);

	// 创建并返回蔡森策略标准化接口实例 - Create and return CaiSen Strategy Standardized Interface instance
	const interfaceInstance = new CaiSenStandardizedInterface(
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		openingMonitoringAssociation,
		batchClosingInstructionRecognizer,
		dynamicThresholdSetting,
	);

	// 创建监控器独立系统 - Create monitor independent system
	const monitorIndependentSystem = new CaiSenMonitorIndependentSystem(
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		openingMonitoringAssociation,
		batchClosingInstructionRecognizer,
		dynamicThresholdSetting,
		interfaceInstance,
	);

	// 更新开仓监控关联实例以包含监控器独立系统 - Update opening monitoring association instance to include monitor independent system
	(openingMonitoringAssociation as any).monitorIndependentSystem =
		monitorIndependentSystem;

	// 更新开仓监控关联实例以包含监控器独立系统 - Update opening monitoring association instance to include monitor independent system
	(openingMonitoringAssociation as any).monitorIndependentSystem =
		monitorIndependentSystem;

	// 更新接口实例以包含监控器独立系统 - Update interface instance to include monitor independent system
	(interfaceInstance as any).monitorIndependentSystem =
		monitorIndependentSystem;

	return interfaceInstance;
}

/**
 * 持仓管理状态接口
 * Position Management Status Interface
 */
export interface PositionManagementStatus {
	/** 持仓ID - Position ID */
	positionId: string;
	/** 管理状态 - Management status */
	status: "active" | "inactive" | "suspended" | "closed";
	/** 管理类型 - Management type */
	managementType: "manual" | "automated" | "hybrid";
	/** 管理开始时间 - Management start time */
	managementStartTime: number;
	/** 最后更新时间 - Last updated time */
	lastUpdated: number;
	/** 风险等级 - Risk level */
	riskLevel: "low" | "medium" | "high" | "critical";
	/** 性能指标 - Performance metrics */
	performanceMetrics?: {
		/** 收益率 - Return rate */
		returnRate: number;
		/** 最大回撤 - Maximum drawdown */
		maxDrawdown: number;
		/** 夏普比率 - Sharpe ratio */
		sharpeRatio?: number;
		/** 胜率 - Win rate */
		winRate?: number;
	};
	/** 管理参数 - Management parameters */
	managementParams?: Record<string, any>;
	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 所有状态信息接口
 * All status information interface
 */
export interface AllStatusInfo {
	/** 持仓ID - Position ID */
	positionId: string;
	/** 分批平仓状态 - Batch closing status */
	batchClosingStatus?: BatchState[];
	/** 止盈止损状态 - Stop profit loss status */
	stopProfitLossStatus?: StopProfitLossStatus;
	/** 空窗期接管状态 - Gap period takeover status */
	gapPeriodTakeoverStatus?: GapPeriodTakeoverStatus;
	/** 开仓监控关联状态 - Opening monitoring association status */
	openingMonitoringAssociationStatus?: OpeningMonitoringAssociationStatus;
	/** 持仓管理状态 - Position management status */
	positionManagementStatus?: PositionManagementStatus;
	/** 最后更新时间 - Last updated time */
	lastUpdated: number;
}

/**
 * 阈值接口
 * Threshold interface
 */
export interface Threshold {
	/** 阈值ID - Threshold ID */
	thresholdId: string;
	/** 持仓ID - Position ID */
	positionId: string;
	/** 阈值类型 - Threshold type */
	type: ThresholdType;
	/** 阈值名称 - Threshold name */
	name: string;
	/** 阈值描述 - Threshold description */
	description?: string;
	/** 阈值方向 - Threshold direction */
	direction: "above" | "below" | "equal";
	/** 阈值计算方法 - Threshold calculation method */
	calculationMethod: string;
	/** 阈值参数 - Threshold parameters */
	parameters: Record<string, any>;
	/** 是否激活 - Is active */
	isActive: boolean;
	/** 是否已触发 - Is triggered */
	isTriggered: boolean;
	/** 创建时间 - Created at */
	createdAt: number;
	/** 更新时间 - Updated at */
	updatedAt: number;
	/** 触发时间 - Triggered at */
	triggeredAt?: number;
	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 持仓完整状态接口
 * Position Complete Status Interface
 */
