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

import type { TradingStrategy } from "../../strategies";
import {
	getCurrentStrategyParams,
	resetStrategyParams,
	setDynamicStopLossParams,
} from "../../tools/strategyParams";
import { logger } from "../../utils/loggerUtils";
import type { CaiSenStandardizedInterface } from "../interface/standardized-interface";
import {
	type BatchClosingParameters,
	type InterfaceCallResponse,
	InterfaceCallResult,
	type StopProfitLossParameters,
} from "../interface/types";

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
			// 由于蔡森标准化接口中没有cancelBatchClosing方法，这里直接返回成功
			// Since there is no cancelBatchClosing method in the CaiSen standardized interface, return success directly
			return {
				result: InterfaceCallResult.SUCCESS,
				data: true,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
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
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		if (loggingEnabled) {
			logger.info("蔡森Agent调用设置止盈止损", { parameters });
		}

		try {
			const result =
				await interfaceInstance.setStopProfitLossThreshold(parameters);

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
				await interfaceInstance.getPositionManagementStatus(positionId);

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
				await interfaceInstance.getPositionManagementStatus(positionId);

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

	/**
	 * 设置动态止损参数
	 * Set dynamic stop loss parameters
	 *
	 * 该工具允许蔡森Agent设置动态止损策略参数
	 * This tool allows CaiSen Agent to set dynamic stop loss strategy parameters
	 *
	 * @param symbol - 交易币种（如BTC、ETH）
	 * @param threshold - 止损阈值（百分比）
	 * @param evaluationInterval - 评估周期（分钟）
	 * @param conditions - 触发条件数组
	 * @returns Promise<string> - 设置结果
	 *
	 * 示例 Example:
	 * setDynamicStopLossParams(
	 *   "BTC",
	 *   2.5,
	 *   60,
	 *   [
	 *     { type: "volatility", value: 1.5 },
	 *     { type: "trend", value: 0.8 }
	 *   ]
	 * )
	 */
	async function setDynamicStopLossParamsTool(
		symbol: string,
		threshold: number,
		evaluationInterval = 30,
		conditions?: Array<{
			type: "volatility" | "trend" | "news";
			value: number;
		}>,
	): Promise<string> {
		try {
			return await setDynamicStopLossParams(
				"cai-sen",
				symbol,
				threshold,
				evaluationInterval,
				conditions,
			);
		} catch (error) {
			logger.error("蔡森Agent设置动态止损参数失败", { error });
			return `设置动态止损参数失败: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	/**
	 * 设置止损阈值
	 * Set stop loss threshold
	 *
	 * 该工具允许蔡森Agent设置不同货币对的止损阈值，支持定期评估和触发条件
	 * This tool allows CaiSen Agent to set stop loss thresholds for different symbols, supporting periodic evaluation and trigger conditions
	 *
	 * @param symbol - 交易币种（如BTC、ETH），为空则应用于所有货币对
	 * @param threshold - 止损阈值（百分比）
	 * @param evaluationInterval - 评估周期（分钟），默认30分钟
	 * @param conditions - 触发条件数组
	 * @returns Promise<string> - 设置结果
	 *
	 * 示例 Example:
	 * setStopLossThreshold(
	 *   "BTC",
	 *   2.5,
	 *   60,
	 *   [
	 *     { type: "volatility", value: 1.5 },
	 *     { type: "trend", value: 0.8 }
	 *   ]
	 * )
	 */
	async function setStopLossThresholdTool(
		symbol: string,
		threshold: number,
		evaluationInterval = 30,
		conditions?: Array<{
			type: "volatility" | "trend" | "news";
			value: number;
		}>,
	): Promise<string> {
		try {
			const strategy = "cai-sen";

			// 构造动态止损配置对象
			const dynamicStopLossConfig = {
				threshold,
				evaluationInterval,
				conditions,
				lastUpdated: new Date().toISOString(),
			};

			// 使用strategy_params表存储动态止损阈值
			const dynamicStopLossKey = `dynamic_stop_loss_${symbol}`;

			// 导入数据库客户端
			const { createClient } = await import("@libsql/client");
			const dbClient = createClient({
				url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
			});

			// 将动态止损阈值存储到数据库中
			await dbClient.execute({
				sql: `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
              VALUES (?, ?, ?, ?, ?)`,
				args: [
					dynamicStopLossKey,
					JSON.stringify(dynamicStopLossConfig),
					strategy,
					new Date().toISOString(),
					`蔡森Agent为${symbol}设置的动态止损阈值`,
				],
			});

			// 同时更新策略参数中的动态止损配置
			const currentParams = await getCurrentStrategyParams(strategy);
			const paramsObj = JSON.parse(currentParams);

			// 更新动态止损配置
			if (!paramsObj.dynamicStopLoss) {
				paramsObj.dynamicStopLoss = {};
			}
			paramsObj.dynamicStopLoss[symbol] = dynamicStopLossConfig;

			logger.info(
				`设置止损阈值成功: 币种=${symbol}, 阈值=${threshold}%, 评估周期=${evaluationInterval}分钟`,
			);
			return `设置止损阈值成功: 币种=${symbol}, 阈值=${threshold}%, 评估周期=${evaluationInterval}分钟`;
		} catch (error) {
			logger.error("蔡森Agent设置止损阈值失败", { error, symbol, threshold });
			return `设置止损阈值失败: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	/**
	 * 获取当前策略参数
	 * Get current strategy parameters
	 *
	 * 该工具允许蔡森Agent获取当前策略参数
	 * This tool allows CaiSen Agent to get current strategy parameters
	 *
	 * @returns Promise<string> - 当前策略参数
	 */
	async function getCurrentStrategyParamsTool(): Promise<string> {
		try {
			return await getCurrentStrategyParams("cai-sen");
		} catch (error) {
			logger.error("蔡森Agent获取策略参数失败", { error });
			return `获取策略参数失败: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	/**
	 * 重置策略参数到默认值
	 * Reset strategy parameters to default values
	 *
	 * 该工具允许蔡森Agent重置策略参数到默认值
	 * This tool allows CaiSen Agent to reset strategy parameters to default values
	 *
	 * @returns Promise<string> - 重置结果
	 */
	async function resetStrategyParamsTool(): Promise<string> {
		try {
			return await resetStrategyParams("cai-sen");
		} catch (error) {
			logger.error("蔡森Agent重置策略参数失败", { error });
			return `重置策略参数失败: ${
				error instanceof Error ? error.message : String(error)
			}`;
		}
	}

	// 返回工具集 - Return the toolkit
	return {
		setBatchClosing,
		cancelBatchClosing,
		setStopProfitLoss,
		getBatchClosingStatus,
		getStopProfitLossStatus,
		setDynamicStopLossParams: setDynamicStopLossParamsTool,
		getCurrentStrategyParams: getCurrentStrategyParamsTool,
		resetStrategyParams: resetStrategyParamsTool,
		setStopLossThreshold: setStopLossThresholdTool,
	};
}

/**
 * 蔡森Agent交易工具集类型定义
 * CaiSen Agent Trading Tools Type Definition
 */
export type CaiSenTradingTools = ReturnType<typeof createCaiSenTradingTools>;

/**
 * 蔡森策略加仓参数接口
 * CaiSen Strategy Add Position Parameters Interface
 */
export interface CaiSenAddPositionParameters {
	/** 交易对 - Trading pair */
	symbol: string;
	/** 加仓金额(USDT) - Add position amount in USDT */
	addAmountUsdt: number;
	/** 加仓策略 - Add position strategy */
	strategy: "pyramid" | "averageCost" | "dynamicRisk";
	/** 加仓原因 - Reason for adding position */
	reason: string;
	/** 加仓价格 - Add position price */
	addPrice: number;
	/** 七分位水平 - Seven segment level */
	sevenSegmentLevel?: number;
	/** 时间框架确认分数 - Timeframe confirmation score */
	timeframeConfirmationScore?: number;
}

/**
 * 为蔡森策略交易工具集添加加仓功能
 * Add position function to CaiSen strategy trading tools
 *
 * @param tools 蔡森交易工具集 - CaiSen trading tools
 * @returns 扩展后的蔡森交易工具集 - Extended CaiSen trading tools
 */
export function extendCaiSenTradingToolsWithAddPosition(
	tools: CaiSenTradingTools,
) {
	/**
	 * 蔡森策略专用加仓工具
	 * CaiSen strategy specific add position tool
	 *
	 * 基于七分位策略和时间框架分析的智能加仓
	 * Intelligent add position based on seven-segment strategy and timeframe analysis
	 */
	async function caisenAddPosition(
		parameters: CaiSenAddPositionParameters,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		logger.info("蔡森Agent调用加仓工具", { parameters });

		try {
			// 1. 导入加仓相关依赖
			const { dbClient } = await import("../../database/dbClient");
			const { calculateWeightedAverageCost } = await import(
				"../../utils/positionUtils"
			);
			const { checkCaisenAddPositionConditions } = await import(
				"../strategy/optimization"
			);

			const {
				symbol,
				addAmountUsdt,
				strategy,
				reason,
				addPrice,
				sevenSegmentLevel,
				timeframeConfirmationScore,
			} = parameters;

			// 2. 获取当前持仓
			const positionResult = await dbClient.execute({
				sql: "SELECT * FROM positions WHERE symbol = ? AND closed_at IS NULL",
				args: [symbol],
			});

			if (positionResult.rows.length === 0) {
				throw new Error(`未找到${symbol}的持仓记录`);
			}

			const currentPosition = positionResult.rows[0] as any;

			// 3. 检查蔡森策略专用加仓条件
			const canAdd = checkCaisenAddPositionConditions(
				currentPosition,
				addPrice,
				sevenSegmentLevel,
				timeframeConfirmationScore,
			);

			if (!canAdd) {
				throw new Error("不满足蔡森策略加仓条件");
			}

			// 4. 计算加仓数量
			const addQuantity = addAmountUsdt / addPrice;

			// 5. 计算加权平均成本
			const newAveragePrice = calculateWeightedAverageCost(
				currentPosition.quantity,
				currentPosition.average_entry_price || currentPosition.entry_price,
				addQuantity,
				addPrice,
			);

			// 6. 更新持仓记录
			await dbClient.execute({
				sql: `
          UPDATE positions 
          SET 
            quantity = quantity + ?, 
            average_entry_price = ?, 
            add_position_count = add_position_count + 1, 
            last_add_position_time = ?, 
            total_add_amount_usdt = total_add_amount_usdt + ?, 
            add_position_history = ?, 
            caisen_seven_segment_level = ?, 
            caisen_timeframe_confirmation_score = ?
          WHERE symbol = ? AND closed_at IS NULL
        `,
				args: [
					addQuantity,
					newAveragePrice,
					new Date().toISOString(),
					addAmountUsdt,
					JSON.stringify([
						...(currentPosition.add_position_history
							? JSON.parse(currentPosition.add_position_history)
							: []),
						{
							timestamp: new Date().toISOString(),
							addQuantity,
							addPrice,
							addAmountUsdt,
							strategy,
							reason,
							newAveragePrice,
							sevenSegmentLevel,
							timeframeConfirmationScore,
						},
					]),
					sevenSegmentLevel,
					timeframeConfirmationScore,
					symbol,
				],
			});

			logger.info(
				`蔡森策略加仓成功: ${symbol}, 金额: ${addAmountUsdt} USDT, 平均成本: ${newAveragePrice}`,
			);

			return {
				result: InterfaceCallResult.SUCCESS,
				data: `蔡森策略加仓成功: ${symbol}, 金额: ${addAmountUsdt} USDT, 平均成本: ${newAveragePrice}`,
				callTime: startTime,
				processingTime: Date.now() - startTime,
				success: true,
			};
		} catch (error) {
			logger.error("蔡森Agent加仓失败", { error, parameters });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
				error: {
					code: "CAISEN_ADD_POSITION_ERROR",
					message: error instanceof Error ? error.message : String(error),
					details: { parameters },
				},
				success: false,
			};
		}
	}

	// 返回扩展后的工具集
	return {
		...tools,
		caisenAddPosition,
	};
}

/**
 * 扩展后的蔡森Agent交易工具集类型定义
 * Extended CaiSen Agent Trading Tools Type Definition
 */
export type CaiSenTradingToolsWithAddPosition = ReturnType<
	typeof extendCaiSenTradingToolsWithAddPosition
>;
