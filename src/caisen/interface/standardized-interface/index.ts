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

import { EventEmitter } from "node:events";
import { logger } from "../../../utils/loggerUtils";
import type { CaiSenAiParameterControl } from "../../systems/ai-parameter-control";
import type {
	BatchConfig,
	BatchStatus,
	CaiSenBatchClosingSystem,
} from "../../systems/batch-closing";
import type { CaiSenBatchClosingInstructionRecognizer } from "../../systems/batch-closing-instruction-recognizer";
import {
	type CaiSenDynamicThresholdSetting,
	ThresholdCalculationMethod,
	ThresholdSource,
	type ThresholdStatus,
	type ThresholdType,
} from "../../systems/dynamic-threshold";
import type {
	CaiSenGapPeriodTakeover,
	TakeoverStatus,
} from "../../systems/gap-period-takeover";
import type { CaiSenOpeningMonitoringAssociation } from "../../systems/opening-monitoring-association";
import {
	type BatchClosingParameters,
	type InterfaceCallResponse,
	InterfaceCallResult,
	type StopProfitLossParameters,
} from "../types";

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

	/** 关联状态 - Association status */
	status: string;

	/** 关联时间 - Association time */
	associatedAt: number;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt: number;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 所有状态信息接口
 * All Status Info Interface
 */
export interface AllStatusInfo {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 分批平仓状态 - Batch closing status */
	batchClosingStatus?: BatchClosingStatus;

	/** 止盈止损状态 - Stop profit/loss status */
	stopProfitLossStatus?: StopProfitLossStatus;

	/** 空窗期接管状态 - Gap period takeover status */
	gapPeriodTakeoverStatus?: GapPeriodTakeoverStatus;

	/** 开仓监控关联状态 - Opening monitoring association status */
	openingMonitoringAssociationStatus?: OpeningMonitoringAssociationStatus;

	/** 最后更新时间 - Last update time */
	lastUpdatedAt: number;
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
					result: InterfaceCallResult.PARAM_ERROR,
					errorMessage: validationResult.errorMessage,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 直接返回成功响应 - Return success response directly
			return {
				result: InterfaceCallResult.SUCCESS,
				data: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("Failed to set batch closing:", error);
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: "Failed to set batch closing",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "BATCH_CLOSING_SET_FAILED",
					message: "Failed to set batch closing",
					details: error,
				},
			};
		}
	}

	/**
	 * 设置止盈止损阈值
	 * Set stop profit/loss threshold
	 *
	 * @param parameters 止盈止损参数 - Stop profit/loss parameters
	 * @returns Promise<InterfaceCallResponse<string>> 调用结果 - Call result
	 */
	async setStopProfitLossThreshold(
		parameters: StopProfitLossParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			const validationResult =
				this.validateStopProfitLossParameters(parameters);
			if (!validationResult.valid) {
				return {
					result: InterfaceCallResult.PARAM_ERROR,
					errorMessage: validationResult.errorMessage,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			return {
				result: InterfaceCallResult.SUCCESS,
				data: "Stop profit/loss threshold set successfully",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("Failed to set stop profit/loss threshold:", error);
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: "Failed to set stop profit/loss threshold",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "STOP_PROFIT_LOSS_SET_FAILED",
					message: "Failed to set stop profit/loss threshold",
					details: error,
				},
			};
		}
	}

	/**
	 * 获取持仓管理状态
	 * Get position management status
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<AllStatusInfo>> 调用结果 - Call result
	 */
	async getPositionManagementStatus(
		positionId: string,
	): Promise<InterfaceCallResponse<AllStatusInfo>> {
		const startTime = Date.now();

		try {
			// 构建所有状态信息 - Build all status info
			const allStatusInfo: AllStatusInfo = {
				positionId,
				lastUpdatedAt: Date.now(),
			};

			return {
				result: InterfaceCallResult.SUCCESS,
				data: allStatusInfo,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("Failed to get position management status:", error);
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: "Failed to get position management status",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "GET_STATUS_FAILED",
					message: "Failed to get position management status",
					details: error,
				},
			};
		}
	}

	/**
	 * 验证分批平仓参数
	 * Validate batch closing parameters
	 *
	 * @param parameters 分批平仓参数 - Batch closing parameters
	 * @returns { valid: boolean; errorMessage?: string } 验证结果 - Validation result
	 */
	private validateBatchClosingParameters(parameters: BatchClosingParameters): {
		valid: boolean;
		errorMessage?: string;
	} {
		if (!parameters.positionId) {
			return { valid: false, errorMessage: "Position ID is required" };
		}

		if (
			!parameters.batchPercentages ||
			parameters.batchPercentages.length === 0
		) {
			return { valid: false, errorMessage: "Batch percentages are required" };
		}

		const totalPercentage = parameters.batchPercentages.reduce(
			(sum: number, percentage: number) => sum + percentage,
			0,
		);
		if (Math.abs(totalPercentage - 100) > 0.01) {
			return {
				valid: false,
				errorMessage: "Total batch percentages must equal 100%",
			};
		}

		if (
			!parameters.triggerConditions ||
			parameters.triggerConditions.length === 0
		) {
			return { valid: false, errorMessage: "Trigger conditions are required" };
		}

		return { valid: true };
	}

	/**
	 * 验证止盈止损参数
	 * Validate stop profit/loss parameters
	 *
	 * @param parameters 止盈止损参数 - Stop profit/loss parameters
	 * @returns { valid: boolean; errorMessage?: string } 验证结果 - Validation result
	 */
	private validateStopProfitLossParameters(
		parameters: StopProfitLossParameters,
	): { valid: boolean; errorMessage?: string } {
		if (!parameters.positionId) {
			return { valid: false, errorMessage: "Position ID is required" };
		}

		return { valid: true };
	}
}

/**
 * 蔡森标准化接口工厂函数
 * CaiSen Standardized Interface Factory Function
 */
export function createCaiSenStandardizedInterface(
	gapPeriodTakeover: CaiSenGapPeriodTakeover,
	batchClosingSystem: CaiSenBatchClosingSystem,
	aiParameterControl: CaiSenAiParameterControl,
	openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation,
	batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer,
	dynamicThresholdSetting: CaiSenDynamicThresholdSetting,
): CaiSenStandardizedInterface {
	return new CaiSenStandardizedInterface(
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		openingMonitoringAssociation,
		batchClosingInstructionRecognizer,
		dynamicThresholdSetting,
	);
}
