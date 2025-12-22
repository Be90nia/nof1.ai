/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import { RISK_PARAMS } from "../../config/riskParams.js";
import { dbClient } from "../../database/dbClient.js";
import type { Position } from "../../database/schema.js";
import { createExchangeClient } from "../../services/exchangeClient.js";
import { getQuantoMultiplier } from "../../utils/contractUtils.js";
import { createLogger } from "../../utils/loggerUtils.js";
import {
	type AddPositionHistoryRecord,
	addToPositionHistory,
	calculateCostReduction,
	calculateWeightedAverageCost,
	updatePositionMetricsAfterAdding,
} from "../../utils/positionUtils.js";
import { getChinaTimeISO } from "../../utils/timeUtils.js";

const logger = createLogger({
	name: "add-position",
	level: "info",
});

/**
 * 加仓工具
 * 为现有持仓进行加仓操作，基于加权平均成本法
 */
export const addPositionTool = createTool({
	name: "addPosition",
	description:
		"加仓 - 为现有持仓增加仓位，使用加权平均成本法计算新的平均成本。加仓前会进行严格的风险检查，包括：最大加仓次数、时间间隔、价格下跌幅度、账户风险状态等。",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
		addAmountUsdt: z
			.number()
			.min(10)
			.max(1000)
			.describe("加仓金额（USDT），最小10，最大1000"),
		reason: z
			.string()
			.min(10)
			.max(200)
			.describe("加仓原因，需要详细说明为什么要加仓"),
		strategy: z
			.enum(["pyramid", "averageCost", "dynamicRisk"])
			.describe(
				"加仓策略：pyramid=金字塔加仓，averageCost=平均成本加仓，dynamicRisk=动态风险加仓",
			),
	}),
	execute: async ({ symbol, addAmountUsdt, reason, strategy }) => {
		const client = createExchangeClient();
		const contract = `${symbol}_USDT`;

		try {
			// 1. 获取当前持仓
			const dbPositionResult = await dbClient.execute({
				sql: "SELECT * FROM positions WHERE symbol = ? LIMIT 1",
				args: [symbol],
			});

			if (dbPositionResult.rows.length === 0) {
				return {
					success: false,
					message: `未找到${symbol}的持仓记录，无法加仓`,
				};
			}

			const currentPosition = dbPositionResult.rows[0] as Position;

			// 2. 检查加仓条件
			const conditionCheck = await checkAddPositionConditions(
				currentPosition,
				addAmountUsdt,
			);

			if (!conditionCheck.canAdd) {
				return {
					success: false,
					message: `不满足加仓条件: ${conditionCheck.reason}`,
				};
			}

			// 3. 获取当前价格
			const ticker = await client.getFuturesTicker(contract);
			const addPrice = Number.parseFloat(ticker.last || "0");

			if (addPrice === 0) {
				return {
					success: false,
					message: `无法获取${symbol}的当前价格`,
				};
			}

			// 4. 获取合约信息
			const contractInfo = await client.getContractInfo(contract);
			const quantoMultiplier = await getQuantoMultiplier(contract);
			const lotSize = Number.parseFloat(
				contractInfo.lotSize || contractInfo.order_size_round || "1",
			);
			const minSize = Number.parseFloat(
				contractInfo.orderSizeMin || contractInfo.order_size_min || "1",
			);

			// 5. 计算加仓数量
			const leverage = currentPosition.leverage;
			let addQuantity =
				(addAmountUsdt * leverage) / (quantoMultiplier * addPrice);

			// 根据 lotSize 调整数量精度
			if (lotSize > 0) {
				addQuantity = Math.ceil(addQuantity / lotSize) * lotSize;
				const decimals = (lotSize.toString().split(".")[1] || "").length;
				addQuantity = Number.parseFloat(addQuantity.toFixed(decimals));
			} else {
				addQuantity = Math.ceil(addQuantity);
			}

			// 确保数量不小于最小限制
			if (addQuantity < minSize) {
				return {
					success: false,
					message: `计算的加仓数量 ${addQuantity} 张小于最小限制 ${minSize} 张`,
				};
			}

			// 6. 计算加权平均成本
			const oldAveragePrice =
				currentPosition.average_entry_price || currentPosition.entry_price;
			const newAveragePrice = calculateWeightedAverageCost(
				currentPosition.quantity,
				oldAveragePrice,
				addQuantity,
				addPrice,
			);

			const costReduction = calculateCostReduction(
				currentPosition.entry_price,
				newAveragePrice,
			);

			logger.info(
				`加仓计算: ${symbol} 原持仓=${currentPosition.quantity}张@${oldAveragePrice.toFixed(
					2,
				)}, 加仓=${addQuantity}张@${addPrice.toFixed(
					2,
				)}, 新平均成本=${newAveragePrice.toFixed(
					2,
				)}, 成本降低=${costReduction.toFixed(2)}%`,
			);

			// 7. 执行加仓操作（市价单）
			const size = currentPosition.side === "long" ? addQuantity : -addQuantity;

			logger.info(
				`执行加仓: ${symbol} ${
					currentPosition.side === "long" ? "做多" : "做空"
				} ${Math.abs(size)}张`,
			);

			const order = await client.placeOrder({
				contract,
				size,
				price: 0, // 市价单
			});

			// 等待订单成交
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// 8. 获取实际成交信息
			let actualFillPrice = addPrice;
			let actualFillSize = addQuantity;

			if (order.id) {
				try {
					const orderDetail = await client.getOrder(order.id.toString());
					actualFillSize = Math.abs(
						Number.parseInt(orderDetail.size || "0") -
							Number.parseInt(orderDetail.left || "0"),
					);

					if (
						orderDetail.fill_price &&
						Number.parseFloat(orderDetail.fill_price) > 0
					) {
						actualFillPrice = Number.parseFloat(orderDetail.fill_price);
					}

					logger.info(
						`加仓成交: ${actualFillSize}张 @ ${actualFillPrice.toFixed(2)} USDT`,
					);
				} catch (error: any) {
					logger.warn(`获取订单详情失败: ${error.message}，使用预估值`);
				}
			}

			// 9. 重新计算加权平均成本（使用实际成交价）
			const finalAveragePrice = calculateWeightedAverageCost(
				currentPosition.quantity,
				oldAveragePrice,
				actualFillSize,
				actualFillPrice,
			);

			const finalCostReduction = calculateCostReduction(
				currentPosition.entry_price,
				finalAveragePrice,
			);

			// 10. 计算手续费
			const positionValue = actualFillSize * quantoMultiplier * actualFillPrice;
			const fee = positionValue * 0.0005; // 0.05%

			// 11. 记录加仓交易
			await dbClient.execute({
				sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, fee, timestamp, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					order.id?.toString() || "",
					symbol,
					currentPosition.side,
					"open", // 加仓也是开仓类型
					actualFillPrice,
					actualFillSize,
					leverage,
					fee,
					getChinaTimeISO(),
					"filled",
				],
			});

			// 12. 更新持仓记录
			const updatedMetrics = updatePositionMetricsAfterAdding(
				currentPosition,
				actualFillPrice,
				actualFillSize,
			);

			// 创建加仓历史记录
			const historyRecord: AddPositionHistoryRecord = {
				timestamp: getChinaTimeISO(),
				add_quantity: actualFillSize,
				add_price: actualFillPrice,
				add_amount_usdt: addAmountUsdt,
				strategy,
				reason,
				new_average_price: finalAveragePrice,
				old_average_price: oldAveragePrice,
				cost_reduction_percent: finalCostReduction,
			};

			const newHistory = addToPositionHistory(
				currentPosition.add_position_history,
				historyRecord,
			);

			// 🔧 加仓后智能调整 executed_levels，避免立即触发分批止盈
			// 根据当前价格相对于新平均成本的盈亏，判断应该跳过哪些级别
			let adjustedExecutedLevels: string[] = [];

			// 获取退出策略配置
			try {
				const { getStrategyParams, getTradingStrategy } = await import(
					"../../agents/tradingAgent.js"
				);
				const strategy = getTradingStrategy();
				const strategyParams = getStrategyParams(strategy);
				const exitStrategy = strategyParams.positionExitStrategy;

				// 检查是否启用了分批止盈策略
				const isTakeProfitEnabled =
					exitStrategy?.enabled &&
					(exitStrategy.strategyType === "partialTakeProfit" ||
						exitStrategy.strategyType === "combination") &&
					exitStrategy.partialTakeProfit;

				if (isTakeProfitEnabled && exitStrategy.partialTakeProfit) {
					const takeProfitConfig = exitStrategy.partialTakeProfit;

					// 计算当前价格相对于新平均成本的盈亏百分比
					const priceChangePercent =
						((actualFillPrice - finalAveragePrice) / finalAveragePrice) * 100;
					const currentPnlPercent =
						currentPosition.side === "long"
							? priceChangePercent * leverage
							: -priceChangePercent * leverage;

					logger.info({
						action: "calculate_pnl_after_add",
						symbol,
						actualFillPrice,
						finalAveragePrice,
						priceChangePercent: priceChangePercent.toFixed(2),
						currentPnlPercent: currentPnlPercent.toFixed(2),
						leverage,
						side: currentPosition.side,
					});

					// 智能判断应该跳过哪些级别
					if (currentPnlPercent >= takeProfitConfig.stage3.trigger) {
						// 当前已达到 stage3，标记所有级别为已执行
						adjustedExecutedLevels = ["stage1", "stage2", "stage3"];
						logger.warn({
							action: "skip_all_levels_after_add",
							symbol,
							currentPnlPercent: currentPnlPercent.toFixed(2),
							stage3Trigger: takeProfitConfig.stage3.trigger,
							message: `加仓后当前盈亏 ${currentPnlPercent.toFixed(
								2,
							)}% 已达到 stage3，标记所有级别为已执行`,
						});
					} else if (currentPnlPercent >= takeProfitConfig.stage2.trigger) {
						// 当前已达到 stage2，标记 stage1 和 stage2 为已执行
						adjustedExecutedLevels = ["stage1", "stage2"];
						logger.warn({
							action: "skip_stage1_stage2_after_add",
							symbol,
							currentPnlPercent: currentPnlPercent.toFixed(2),
							stage2Trigger: takeProfitConfig.stage2.trigger,
							message: `加仓后当前盈亏 ${currentPnlPercent.toFixed(
								2,
							)}% 已达到 stage2，标记 stage1 和 stage2 为已执行`,
						});
					} else if (currentPnlPercent >= takeProfitConfig.stage1.trigger) {
						// 当前已达到 stage1，标记 stage1 为已执行
						adjustedExecutedLevels = ["stage1"];
						logger.warn({
							action: "skip_stage1_after_add",
							symbol,
							currentPnlPercent: currentPnlPercent.toFixed(2),
							stage1Trigger: takeProfitConfig.stage1.trigger,
							message: `加仓后当前盈亏 ${currentPnlPercent.toFixed(
								2,
							)}% 已达到 stage1，标记 stage1 为已执行`,
						});
					} else {
						// 当前未达到任何级别，清空 executed_levels
						adjustedExecutedLevels = [];
						logger.info({
							action: "clear_executed_levels_after_add",
							symbol,
							currentPnlPercent: currentPnlPercent.toFixed(2),
							stage1Trigger: takeProfitConfig.stage1.trigger,
							message: `加仓后当前盈亏 ${currentPnlPercent.toFixed(
								2,
							)}% 未达到任何止盈级别，清空 executed_levels`,
						});
					}
				} else {
					// 未启用分批止盈，清空 executed_levels
					adjustedExecutedLevels = [];
					logger.info({
						action: "clear_executed_levels_no_takeprofit",
						symbol,
						message: "未启用分批止盈策略，清空 executed_levels",
					});
				}
			} catch (error: any) {
				logger.error({
					action: "adjust_executed_levels_error",
					symbol,
					error: error.message,
					message: "调整 executed_levels 失败，默认清空",
				});
				adjustedExecutedLevels = [];
			}

			// 更新数据库
			await dbClient.execute({
				sql: `UPDATE positions SET 
              quantity = ?,
              average_entry_price = ?,
              add_position_count = ?,
              last_add_position_time = ?,
              total_add_amount_usdt = ?,
              add_position_history = ?,
              profit_target = ?,
              stop_loss = ?,
              peak_pnl_percent = ?,
              executed_levels = ?,
              initial_quantity = ?
              WHERE symbol = ?`,
				args: [
					updatedMetrics.quantity,
					updatedMetrics.average_entry_price,
					(currentPosition.add_position_count || 0) + 1,
					getChinaTimeISO(),
					(currentPosition.total_add_amount_usdt || 0) + addAmountUsdt,
					newHistory,
					updatedMetrics.profit_target,
					updatedMetrics.stop_loss,
					updatedMetrics.peak_pnl_percent,
					JSON.stringify(adjustedExecutedLevels), // 智能调整后的已执行级别
					updatedMetrics.quantity, // 🔧 关键修复：加仓后更新 initial_quantity 为新的总持仓
					symbol,
				],
			});

			logger.info({
				action: "update_executed_levels_after_add_position",
				function: "addPosition",
				symbol,
				adjustedExecutedLevels,
				message: `加仓后已智能调整 executed_levels: ${JSON.stringify(
					adjustedExecutedLevels,
				)}`,
			});

			logger.info(
				`✅ 加仓成功: ${symbol} 新平均成本=${finalAveragePrice.toFixed(
					2,
				)}, 总持仓=${updatedMetrics.quantity}张, 成本降低=${finalCostReduction.toFixed(
					2,
				)}%`,
			);

			return {
				success: true,
				message:
					`✅ 加仓成功：${symbol} 加仓${actualFillSize}张@${actualFillPrice.toFixed(
						2,
					)}，新平均成本${finalAveragePrice.toFixed(
						2,
					)}（降低${finalCostReduction.toFixed(
						2,
					)}%），总持仓${updatedMetrics.quantity}张\n\n` +
					`⚠️ 重要提醒：加仓后平均成本已改变，必须立即调用 setPositionExitStrategy 工具重新设置退出策略参数！\n` +
					`- 原平均成本: ${oldAveragePrice.toFixed(2)} USDT\n` +
					`- 新平均成本: ${finalAveragePrice.toFixed(2)} USDT\n` +
					`- 成本降低: ${finalCostReduction.toFixed(2)}%\n` +
					`- 总持仓: ${updatedMetrics.quantity}张\n` +
					`- 请基于新的平均成本重新计算所有退出策略阈值（分批止盈、动态止损、峰值回落）`,
				data: {
					symbol,
					addQuantity: actualFillSize,
					addPrice: actualFillPrice,
					oldAveragePrice,
					newAveragePrice: finalAveragePrice,
					costReduction: finalCostReduction,
					totalQuantity: updatedMetrics.quantity,
					addPositionCount: (currentPosition.add_position_count || 0) + 1,
					strategy,
					reason,
				},
			};
		} catch (error: any) {
			logger.error(`加仓失败: ${error.message}`, error);
			return {
				success: false,
				message: `加仓失败：${error.message}`,
			};
		}
	},
});

/**
 * 检查加仓条件
 */
async function checkAddPositionConditions(
	position: Position,
	addAmountUsdt: number,
): Promise<{ canAdd: boolean; reason?: string }> {
	try {
		// 1. 检查最大加仓次数（默认3次）
		const maxAdditions = 3;
		const currentAddCount = position.add_position_count || 0;

		if (currentAddCount >= maxAdditions) {
			return {
				canAdd: false,
				reason: `已达到最大加仓次数限制（${maxAdditions}次）`,
			};
		}

		// 2. 检查时间间隔（最小30分钟）
		const minIntervalMinutes = 30;
		if (position.last_add_position_time) {
			const lastAddTime = new Date(position.last_add_position_time).getTime();
			const now = Date.now();
			const minutesSinceLastAdd = (now - lastAddTime) / (1000 * 60);

			if (minutesSinceLastAdd < minIntervalMinutes) {
				return {
					canAdd: false,
					reason: `距离上次加仓仅${minutesSinceLastAdd.toFixed(
						1,
					)}分钟，需要至少${minIntervalMinutes}分钟`,
				};
			}
		}

		// 3. 检查价格下跌幅度（3%-15%）
		const client = createExchangeClient();
		const contract = `${position.symbol}_USDT`;
		const ticker = await client.getFuturesTicker(contract);
		const currentPrice = Number.parseFloat(ticker.last || "0");

		const entryPrice = position.average_entry_price || position.entry_price;
		const priceDropPercent = ((entryPrice - currentPrice) / entryPrice) * 100;

		if (priceDropPercent < 3 || priceDropPercent > 15) {
			return {
				canAdd: false,
				reason: `价格下跌幅度${priceDropPercent.toFixed(
					2,
				)}%不在加仓区间（3%-15%）`,
			};
		}

		// 4. 检查账户风险状态
		const account = await client.getFuturesAccount();
		const totalBalance = Number.parseFloat(account.total || "0");
		const availableBalance = Number.parseFloat(account.available || "0");

		if (availableBalance < addAmountUsdt) {
			return {
				canAdd: false,
				reason: `可用资金${availableBalance.toFixed(
					2,
				)}USDT不足，需要${addAmountUsdt}USDT`,
			};
		}

		// 5. 检查账户回撤（可选，这里注释掉以保持与开仓一致）
		// const peakBalanceResult = await dbClient.execute(
		//   "SELECT MAX(total_value) as peak FROM account_history"
		// );
		// const peakBalance = peakBalanceResult.rows[0]?.peak
		//   ? Number.parseFloat(peakBalanceResult.rows[0].peak as string)
		//   : totalBalance;
		//
		// const drawdownFromPeak =
		//   peakBalance > 0 ? ((peakBalance - totalBalance) / peakBalance) * 100 : 0;
		//
		// if (drawdownFromPeak >= 10) {
		//   return {
		//     canAdd: false,
		//     reason: `账户回撤${drawdownFromPeak.toFixed(2)}%超过10%限制`,
		//   };
		// }

		// 6. 检查总敞口
		const allPositions = await client.getPositions();
		const activePositions = allPositions.filter(
			(p: any) => Math.abs(Number.parseInt(p.size || "0")) !== 0,
		);

		let currentTotalExposure = 0;
		for (const pos of activePositions) {
			const posSize = Math.abs(Number.parseInt(pos.size || "0"));
			const entryPrice = Number.parseFloat(pos.entryPrice || "0");
			const posLeverage = Number.parseInt(pos.leverage || "1");
			const posQuantoMultiplier = await getQuantoMultiplier(pos.contract);
			const posValue = posSize * entryPrice * posQuantoMultiplier;
			currentTotalExposure += posValue;
		}

		const newExposure = addAmountUsdt * position.leverage;
		const totalExposure = currentTotalExposure + newExposure;
		const maxAllowedExposure = totalBalance * RISK_PARAMS.MAX_LEVERAGE;

		if (totalExposure > maxAllowedExposure) {
			return {
				canAdd: false,
				reason: `加仓将导致总敞口${totalExposure.toFixed(
					2,
				)}USDT超过限制${maxAllowedExposure.toFixed(2)}USDT`,
			};
		}

		// 所有检查通过
		return { canAdd: true };
	} catch (error: any) {
		logger.error(`检查加仓条件失败: ${error.message}`, error);
		return {
			canAdd: false,
			reason: `检查加仓条件失败: ${error.message}`,
		};
	}
}
