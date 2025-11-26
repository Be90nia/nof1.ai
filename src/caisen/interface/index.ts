/**
 * 蔡森策略标准化接口
 * CaiSen Strategy Standardized Interface
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import type { StrategyParams } from "../../strategies/types";
import { logger } from "../../utils/loggerUtils";
import {
	type CaiSenBatchClosingSystem,
	createCaiSenBatchClosingSystem,
} from "../systems/batch-closing";
import { ClosingType } from "../systems/batch-closing";
import {
	type AiParameterControlConfig,
	type BatchClosingInstructionRecognizerConfig,
	type BatchClosingParameters,
	type DynamicThresholdConfig,
	type GapPeriodTakeoverConfig,
	type InterfaceCallResponse,
	InterfaceCallResult,
	type OpeningMonitoringAssociationConfig,
	type StopProfitLossParameters,
} from "./types";

/**
 * 蔡森策略标准化接口类
 * CaiSen Strategy Standardized Interface Class
 */
export class CaiSenStandardizedInterface extends EventEmitter {
	private gapPeriodTakeover: any;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: any;
	private openingMonitoringAssociation: any;
	private batchClosingInstructionRecognizer: any;
	private dynamicThresholdSetting: any;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param gapPeriodTakeover 缺口期接管系统 - Gap period takeover system
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 * @param openingMonitoringAssociation 开仓监控关联系统 - Opening monitoring association system
	 * @param batchClosingInstructionRecognizer 分批平仓指令识别系统 - Batch closing instruction recognizer system
	 * @param dynamicThresholdSetting 动态阈值设定系统 - Dynamic threshold setting system
	 */
	constructor(
		gapPeriodTakeover: any,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: any,
		openingMonitoringAssociation: any,
		batchClosingInstructionRecognizer: any,
		dynamicThresholdSetting: any,
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
			if (
				!parameters.positionId ||
				!parameters.batchCount ||
				!parameters.batchPercentages ||
				!parameters.triggerConditions
			) {
				return {
					result: InterfaceCallResult.PARAM_ERROR,
					errorMessage: "Missing required parameters",
					callTime: startTime,
					processingTime: Date.now() - startTime,
					success: false,
				};
			}

			// 调用分批平仓系统 - Call batch closing system
			const batchId = this.batchClosingSystem.setBatchClosing({
				batchId: `batch_${Date.now()}_${Math.random()
					.toString(36)
					.substring(2, 9)}`,
				positionId: parameters.positionId,
				closingType: ClosingType.PARTIAL_PROFIT,
				closingRatio: 1 / parameters.batchCount,
				closingQuantity: 0,
				triggerCondition: {
					triggerType: "pnl_percent",
					triggerValue: parameters.triggerConditions[0].value,
					operator: ">=",
				},
				priority: 1,
				createdAt: Date.now(),
			});

			// 激活分批平仓 - Activate batch closing
			this.batchClosingSystem.activateBatchClosing(batchId);

			return {
				result: InterfaceCallResult.SUCCESS,
				data: batchId,
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("设置分批平仓失败", { error, parameters });
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "SET_BATCH_CLOSING_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { parameters },
				},
				success: false,
			};
		}
	}

	/**
	 * 取消分批平仓
	 * Cancel batch closing
	 *
	 * @param batchId 批次ID - Batch ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 */
	async cancelBatchClosing(
		batchId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		try {
			// 调用分批平仓系统取消批次 - Call batch closing system to cancel batch
			const result = this.batchClosingSystem.cancelBatchClosing(batchId);

			return {
				result: InterfaceCallResult.SUCCESS,
				data: result,
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("取消分批平仓失败", { error, batchId });
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "CANCEL_BATCH_CLOSING_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { batchId },
				},
				success: false,
			};
		}
	}

	/**
	 * 设置止盈止损
	 * Set stop profit/loss
	 *
	 * @param parameters 止盈止损参数 - Stop profit/loss parameters
	 * @returns Promise<InterfaceCallResponse<{ stopLossId?: string; takeProfitId?: string }>> 调用结果 - Call result
	 */
	async setStopProfitLoss(
		parameters: StopProfitLossParameters,
	): Promise<
		InterfaceCallResponse<{ stopLossId?: string; takeProfitId?: string }>
	> {
		const startTime = Date.now();

		try {
			// 验证参数 - Validate parameters
			if (!parameters.positionId) {
				return {
					result: InterfaceCallResult.PARAM_ERROR,
					errorMessage: "Missing required parameter: positionId",
					callTime: startTime,
					processingTime: Date.now() - startTime,
					success: false,
				};
			}

			// 这里简化处理，实际实现需要调用动态阈值设定系统
			const stopLossId = parameters.stopLoss?.enabled
				? `sl_${Date.now()}`
				: undefined;
			const takeProfitId = parameters.takeProfit?.enabled
				? `tp_${Date.now()}`
				: undefined;

			return {
				result: InterfaceCallResult.SUCCESS,
				data: { stopLossId, takeProfitId },
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("设置止盈止损失败", { error, parameters });
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "SET_STOP_PROFIT_LOSS_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { parameters },
				},
				success: false,
			};
		}
	}

	/**
	 * 根据持仓ID获取所有状态
	 * Get all status by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<any>> 调用结果 - Call result
	 */
	async getAllStatusByPositionId(
		positionId: string,
	): Promise<InterfaceCallResponse<any>> {
		const startTime = Date.now();

		try {
			// 获取批次状态 - Get batch states
			const batchStates =
				this.batchClosingSystem.getBatchStatesByPositionId(positionId);

			return {
				result: InterfaceCallResult.SUCCESS,
				data: { batchStates },
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("获取持仓状态失败", { error, positionId });
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "GET_STATUS_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { positionId },
				},
				success: false,
			};
		}
	}

	/**
	 * 根据持仓ID获取阈值
	 * Get thresholds by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<any>> 调用结果 - Call result
	 */
	async getThresholdsByPositionId(
		positionId: string,
	): Promise<InterfaceCallResponse<any>> {
		const startTime = Date.now();

		try {
			// 这里简化处理，实际实现需要调用动态阈值设定系统
			return {
				result: InterfaceCallResult.SUCCESS,
				data: { thresholds: [] },
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("获取阈值失败", { error, positionId });
			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "GET_THRESHOLDS_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { positionId },
				},
				success: false,
			};
		}
	}
}

/**
 * 创建蔡森策略标准化接口实例
 * Create CaiSen strategy standardized interface instance
 *
 * @param strategyConfig 策略配置 - Strategy configuration
 * @returns CaiSenStandardizedInterface 蔡森策略标准化接口实例 - CaiSen strategy standardized interface instance
 */
export function createCaiSenStandardizedInterface(
	strategyConfig: StrategyParams,
): CaiSenStandardizedInterface {
	// 默认配置 - Default configurations
	const gapPeriodTakeoverConfig: GapPeriodTakeoverConfig = {
		enableGapPeriodTakeover: true,
		gapPeriodDefinition: 30,
		takeoverDecisionDelay: 60,
		takeoverExecutionDelay: 120,
		recoveryDelayAfterGapEnd: 300,
		gapDetectionInterval: 60,
	};

	const batchClosingConfig = {
		maxConcurrentBatches: 3,
		batchExecutionInterval: 10000,
		maxRetryCount: 3,
		enableAutoExecution: true,
		priceDeviationTolerance: 0.5,
	};

	const aiParameterControlConfig: AiParameterControlConfig = {
		enableAiParameterControl: true,
		parameterAdjustmentFrequencyLimit: 300,
		maxParameterAdjustmentAmplitude: 20,
		enableParameterValidation: true,
		parameterValidationRules: {},
	};

	const openingMonitoringAssociationConfig: OpeningMonitoringAssociationConfig =
		{
			monitoringInterval: 5000,
			maxRetryCount: 3,
			retryInterval: 1000,
			enableAutoRecovery: true,
			autoRecoveryDelay: 5000,
		};

	const batchClosingInstructionRecognizerConfig: BatchClosingInstructionRecognizerConfig =
		{
			enableInstructionRecognition: true,
			recognitionThreshold: 0.8,
			maxInstructionCache: 100,
			instructionExpiration: 3600000,
		};

	const thresholdSettingConfig: DynamicThresholdConfig = {
		updateInterval: 10000,
		enableThresholdExpiration: true,
		defaultThresholdExpiration: 86400000,
		enableThresholdCaching: true,
		cacheExpiration: 300000,
		enableThresholdValidation: true,
		maxThresholdCount: 1000,
	};

	// 创建分批平仓系统实例 - Create batch closing system instance
	const batchClosingSystem = createCaiSenBatchClosingSystem(
		batchClosingConfig,
		strategyConfig,
	);

	// 创建其他系统实例（简化处理，实际需要完整实现）
	const gapPeriodTakeover = {};
	const aiParameterControl = {};
	const openingMonitoringAssociation = {};
	const batchClosingInstructionRecognizer = {};
	const dynamicThresholdSetting = {};

	// 创建并返回蔡森策略标准化接口实例 - Create and return CaiSen Strategy Standardized Interface instance
	return new CaiSenStandardizedInterface(
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		openingMonitoringAssociation,
		batchClosingInstructionRecognizer,
		dynamicThresholdSetting,
	);
}

// 导出类型定义
export * from "./types";
