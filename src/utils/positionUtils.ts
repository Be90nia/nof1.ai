/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Position } from "../database/schema.js";

/**
 * 计算加权平均成本
 * @param currentQty 当前持仓数量
 * @param currentAvg 当前平均成本
 * @param addQty 加仓数量
 * @param addPrice 加仓价格
 * @returns 新的加权平均成本
 */
export function calculateWeightedAverageCost(
	currentQty: number,
	currentAvg: number,
	addQty: number,
	addPrice: number,
): number {
	const totalValue = currentQty * currentAvg + addQty * addPrice;
	const totalQuantity = currentQty + addQty;
	return totalValue / totalQuantity;
}

/**
 * 基于平均成本计算盈亏百分比
 * @param currentPrice 当前价格
 * @param averageCost 平均成本
 * @returns 盈亏百分比
 */
export function calculateProfitPercent(
	currentPrice: number,
	averageCost: number,
): number {
	return ((currentPrice - averageCost) / averageCost) * 100;
}

/**
 * 计算成本降低百分比（相对于初始价格）
 * @param entryPrice 初始入场价格
 * @param averageCost 加权平均成本
 * @returns 成本降低百分比
 */
export function calculateCostReduction(
	entryPrice: number,
	averageCost: number,
): number {
	const reduction = ((entryPrice - averageCost) / entryPrice) * 100;
	return reduction > 0 ? reduction : 0;
}

/**
 * 计算分批止盈数量（基于加仓后的总持仓量）
 * @param totalQuantity 加仓后的总持仓量
 * @param closePercentage 平仓比例
 * @returns 平仓数量
 */
export function calculatePartialTakeProfitQuantity(
	totalQuantity: number,
	closePercentage: number,
): number {
	return totalQuantity * (closePercentage / 100);
}

/**
 * 检查是否应触发分批止盈（基于平均成本）
 * @param currentPrice 当前价格
 * @param averageEntryPrice 平均入场成本
 * @param profitTargetPercent 止盈目标百分比
 * @returns 是否应触发止盈
 */
export function shouldTriggerPartialTakeProfit(
	currentPrice: number,
	averageEntryPrice: number,
	profitTargetPercent: number,
): boolean {
	const profitPercent = (currentPrice - averageEntryPrice) / averageEntryPrice;
	return profitPercent >= profitTargetPercent / 100;
}

/**
 * 计算动态止损数量（基于加仓后的总持仓量）
 * @param totalQuantity 加仓后的总持仓量
 * @param stopLossPercentage 止损比例
 * @returns 止损数量
 */
export function calculateDynamicStopLossQuantity(
	totalQuantity: number,
	stopLossPercentage: number,
): number {
	return totalQuantity * (stopLossPercentage / 100);
}

/**
 * 检查是否应触发动态止损（基于平均成本）
 * @param currentPrice 当前价格
 * @param averageEntryPrice 平均入场成本
 * @param maxLossPercent 最大亏损百分比
 * @returns 是否应触发止损
 */
export function shouldTriggerDynamicStopLoss(
	currentPrice: number,
	averageEntryPrice: number,
	maxLossPercent: number,
): boolean {
	const lossPercent = (averageEntryPrice - currentPrice) / averageEntryPrice;
	return lossPercent >= Math.abs(maxLossPercent) / 100;
}

/**
 * 计算峰值回落数量（基于加仓后的总持仓量）
 * @param totalQuantity 加仓后的总持仓量
 * @param drawdownPercentage 回落比例
 * @returns 回落平仓数量
 */
export function calculatePeakDrawdownQuantity(
	totalQuantity: number,
	drawdownPercentage: number,
): number {
	return totalQuantity * (drawdownPercentage / 100);
}

/**
 * 检查是否应触发峰值回落（基于平均成本）
 * @param currentPrice 当前价格
 * @param peakPrice 峰值价格
 * @param averageEntryPrice 平均入场成本
 * @param maxDrawdownPercent 最大回落百分比
 * @returns 是否应触发峰值回落平仓
 */
export function shouldTriggerPeakDrawdown(
	currentPrice: number,
	peakPrice: number,
	averageEntryPrice: number,
	maxDrawdownPercent: number,
): boolean {
	const peakProfit = (peakPrice - averageEntryPrice) / averageEntryPrice;
	const currentProfit = (currentPrice - averageEntryPrice) / averageEntryPrice;
	const drawdown = peakProfit - currentProfit;
	return drawdown >= Math.abs(maxDrawdownPercent) / 100;
}

/**
 * 更新持仓指标（加仓后）
 * @param position 持仓对象
 * @param addPrice 加仓价格（也是当前市场价格）
 * @param addQty 加仓数量
 * @returns 更新后的持仓对象
 */
export function updatePositionMetricsAfterAdding(
	position: Position,
	addPrice: number,
	addQty: number,
): Partial<Position> {
	// 1. 更新平均成本
	const newAveragePrice = calculateWeightedAverageCost(
		position.quantity,
		position.average_entry_price || position.entry_price,
		addQty,
		addPrice,
	);

	// 2. 更新总仓位规模
	const newTotalQuantity = position.quantity + addQty;

	// 3. 重新计算基于平均成本的指标
	// 🔧 修复：使用原始平均价格计算百分比，而不是初始入场价格
	const oldAveragePrice = position.average_entry_price || position.entry_price;
	const profitTargetPercent = position.profit_target
		? ((position.profit_target - oldAveragePrice) / oldAveragePrice) * 100
		: 0;
	const stopLossPercent = position.stop_loss
		? ((oldAveragePrice - position.stop_loss) / oldAveragePrice) * 100
		: 0;

	const newProfitTarget = newAveragePrice * (1 + profitTargetPercent / 100);
	const newStopLoss = newAveragePrice * (1 - stopLossPercent / 100);

	// 4. 🔧 修复：重置峰值监控，使用当前市场价格和杠杆计算
	// 加仓后应该基于新的平均成本重新开始跟踪峰值盈利
	// 计算公式：价格变动% × 杠杆 = 盈亏%
	const priceChangePercent =
		((addPrice - newAveragePrice) / newAveragePrice) * 100;
	const side = position.side;
	const leverage = position.leverage;
	const newPeakPnlPercent =
		priceChangePercent * leverage * (side === "long" ? 1 : -1);

	return {
		average_entry_price: newAveragePrice,
		quantity: newTotalQuantity,
		profit_target: newProfitTarget,
		stop_loss: newStopLoss,
		peak_pnl_percent: newPeakPnlPercent, // 基于新平均成本、当前价格和杠杆的盈利百分比
	};
}

/**
 * 加仓历史记录接口
 */
export interface AddPositionHistoryRecord {
	timestamp: string;
	add_quantity: number;
	add_price: number;
	add_amount_usdt: number;
	strategy: string;
	reason: string;
	new_average_price: number;
	old_average_price: number;
	cost_reduction_percent: number;
}

/**
 * 解析加仓历史记录
 * @param historyJson JSON字符串
 * @returns 加仓历史记录数组
 */
export function parseAddPositionHistory(
	historyJson: string | null | undefined,
): AddPositionHistoryRecord[] {
	if (!historyJson) return [];
	try {
		return JSON.parse(historyJson);
	} catch {
		return [];
	}
}

/**
 * 添加加仓历史记录
 * @param historyJson 现有历史JSON字符串
 * @param record 新记录
 * @returns 更新后的JSON字符串
 */
export function addToPositionHistory(
	historyJson: string | null | undefined,
	record: AddPositionHistoryRecord,
): string {
	const history = parseAddPositionHistory(historyJson);
	history.push(record);
	return JSON.stringify(history);
}
