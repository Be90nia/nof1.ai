/**
 * 蔡森Agent交易工具集
 * CaiSen Agent Trading Tools
 *
 * 该模块提供蔡森Agent用于调用自定义平仓及分批平仓功能的工具集
 * This module provides a toolkit for CaiSen Agent to call custom closing and batch closing functions
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import {
	type BatchClosingParameters,
	type CaiSenStandardizedInterface,
	type InterfaceCallResponse,
	InterfaceCallResult,
	type StopProfitLossParameters,
} from "../caisen";
import { logger } from "../utils/loggerUtils";

/**
 * 蔡森Agent交易工具集配置接口
 * CaiSen Agent Trading Tools Configuration Interface
 */
export interface CaiSenTradingToolsConfig {
	/** 蔡森策略标准化接口实例 - CaiSen strategy standardized interface instance */
	caiSenInterface: CaiSenStandardizedInterface;

	/** 是否启用详细日志记录 - Whether to enable detailed logging */
	enableDetailedLogging?: boolean;
}

/**
 * 创建蔡森Agent交易工具集
 * Create CaiSen Agent Trading Tools
 *
 * @param caiSenInterface 蔡森策略标准化接口实例 - CaiSen strategy standardized interface instance
 * @param enableDetailedLogging 是否启用详细日志记录 - Whether to enable detailed logging
 * @returns 蔡森Agent交易工具集 - CaiSen Agent trading tools
 */
export function createCaiSenTradingTools(
	caiSenInterface: CaiSenStandardizedInterface,
	enableDetailedLogging?: boolean,
) {
	// 为了向后兼容，支持两种调用方式
	let config: CaiSenTradingToolsConfig;

	if (
		typeof caiSenInterface === "object" &&
		caiSenInterface !== null &&
		"caiSenInterface" in caiSenInterface
	) {
		// 新的调用方式：传入配置对象
		config = caiSenInterface as CaiSenTradingToolsConfig;
	} else {
		// 旧的调用方式：直接传入接口和日志标志
		config = {
			caiSenInterface: caiSenInterface as CaiSenStandardizedInterface,
			enableDetailedLogging: enableDetailedLogging || false,
		};
	}

	const {
		caiSenInterface: interfaceInstance,
		enableDetailedLogging: loggingEnabled,
	} = config;

	/**
	 * 设置分批平仓工具
	 * Set batch closing tool
	 *
	 * 该工具允许蔡森Agent设置分批平仓策略，支持自定义批次数量、比例和触发条件
	 * This tool allows CaiSen Agent to set batch closing strategy, supporting custom batch count, percentages, and trigger conditions
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
	 *   executionStrategy: "gradual",
	 *   expirationTime: Date.now() + 24 * 60 * 60 * 1000 // 24小时后过期
	 * })
	 */
	async function setBatchClosing(
		parameters: BatchClosingParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用设置分批平仓", { parameters });
		}

		try {
			const result = await interfaceInstance.setBatchClosing(parameters);

			if (loggingEnabled) {
				logger.info("设置分批平仓结果", { result });
			}

			return result;
		} catch (error) {
			logger.error("蔡森Agent设置分批平仓失败", { error, parameters });

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
			};
		}
	}

	/**
	 * 取消分批平仓工具
	 * Cancel batch closing tool
	 *
	 * 该工具允许蔡森Agent取消已设置的分批平仓策略
	 * This tool allows CaiSen Agent to cancel a set batch closing strategy
	 *
	 * @param batchId 分批ID - Batch ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * cancelBatchClosing("batch_12345")
	 */
	async function cancelBatchClosing(
		batchId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用取消分批平仓", { batchId });
		}

		try {
			const result = await interfaceInstance.cancelBatchClosing(batchId);

			if (loggingEnabled) {
				logger.info("取消分批平仓结果", { result });
			}

			return result;
		} catch (error) {
			logger.error("蔡森Agent取消分批平仓失败", { error, batchId });

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
			};
		}
	}

	/**
	 * 设置止盈止损工具
	 * Set stop profit/loss tool
	 *
	 * 该工具允许蔡森Agent设置止盈止损策略，支持固定值、百分比、ATR等多种计算方式
	 * This tool allows CaiSen Agent to set stop profit/loss strategy, supporting various calculation methods like fixed value, percentage, ATR, etc.
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
	async function setStopProfitLoss(
		parameters: StopProfitLossParameters,
	): Promise<
		InterfaceCallResponse<{ stopLossId?: string; takeProfitId?: string }>
	> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用设置止盈止损", { parameters });
		}

		try {
			const result = await interfaceInstance.setStopProfitLoss(parameters);

			if (loggingEnabled) {
				logger.info("设置止盈止损结果", { result });
			}

			return result;
		} catch (error) {
			logger.error("蔡森Agent设置止盈止损失败", { error, parameters });

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
	 * 获取持仓的分批平仓状态
	 * Get batch closing status for position
	 *
	 * 该工具允许蔡森Agent查询指定持仓的分批平仓状态
	 * This tool allows CaiSen Agent to query the batch closing status of a specified position
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<any>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getBatchClosingStatus("pos_12345")
	 */
	async function getBatchClosingStatus(
		positionId: string,
	): Promise<InterfaceCallResponse<any>> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用获取分批平仓状态", { positionId });
		}

		try {
			const result =
				await interfaceInstance.getAllStatusByPositionId(positionId);

			if (loggingEnabled) {
				logger.info("获取分批平仓状态结果", { result });
			}

			return {
				result: InterfaceCallResult.SUCCESS,
				data: result,
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("蔡森Agent获取分批平仓状态失败", { error, positionId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "GET_BATCH_CLOSING_STATUS_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { positionId },
				},
				success: false,
			};
		}
	}

	/**
	 * 获取持仓的止盈止损状态
	 * Get stop profit/loss status for position
	 *
	 * 该工具允许蔡森Agent查询指定持仓的止盈止损状态
	 * This tool allows CaiSen Agent to query the stop profit/loss status of a specified position
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns Promise<InterfaceCallResponse<any>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getStopProfitLossStatus("pos_12345")
	 */
	async function getStopProfitLossStatus(
		positionId: string,
	): Promise<InterfaceCallResponse<any>> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用获取止盈止损状态", { positionId });
		}

		try {
			const result =
				await interfaceInstance.getThresholdsByPositionId(positionId);

			if (loggingEnabled) {
				logger.info("获取止盈止损状态结果", { result });
			}

			return {
				result: InterfaceCallResult.SUCCESS,
				data: result,
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("蔡森Agent获取止盈止损状态失败", { error, positionId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "GET_STOP_PROFIT_LOSS_STATUS_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { positionId },
				},
				success: false,
			};
		}
	}

	// 返回工具集 - Return the toolkit
	return {
		setBatchClosing,
		cancelBatchClosing,
		setStopProfitLoss,
		getBatchClosingStatus,
		getStopProfitLossStatus,
	};
}

/**
 * 蔡森Agent交易工具集类型定义
 * CaiSen Agent Trading Tools Type Definition
 */
export type CaiSenTradingTools = ReturnType<typeof createCaiSenTradingTools>;
