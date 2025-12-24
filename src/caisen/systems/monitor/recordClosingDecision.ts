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
 * 蔡森策略平仓决策记录工具
 *
 * 用于记录分批止盈、峰值回落、动态止损等系统自动平仓的决策信息
 * 记录到 agent_decisions 表，与其他监控系统保持一致
 */

import { createClient } from "@libsql/client";
import { createLogger } from "../../../utils/loggerUtils";
import { getChinaTimeISO } from "../../../utils/timeUtils";

const logger = createLogger({
	name: "caisen-decision-recorder",
	level: "info",
});

const dbClient = createClient({
	url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * 平仓类型枚举
 */
export enum ClosingTriggerType {
	PARTIAL_TAKE_PROFIT = "partial_take_profit", // 分批止盈
	PEAK_DRAWDOWN = "peak_drawdown", // 峰值回落
	DYNAMIC_STOP_LOSS = "dynamic_stop_loss", // 动态止损
	TRAILING_STOP = "trailing_stop", // 移动止盈
}

/**
 * 平仓决策参数接口
 */
export interface ClosingDecisionParams {
	symbol: string; // 币种
	side: "long" | "short"; // 方向
	triggerType: ClosingTriggerType; // 触发类型
	level: string; // 触发级别 (如 stage1, level2, peak_level3)

	// 价格和盈亏信息
	entryPrice: number; // 入场价格
	currentPrice: number; // 当前价格
	closePrice?: number; // 平仓价格
	leverage: number; // 杠杆倍数

	// 盈亏信息
	pnlPercent: number; // 当前盈亏百分比
	peakPnlPercent?: number; // 峰值盈亏百分比

	// 触发条件
	triggerThreshold: number; // 触发阈值
	currentValue: number; // 当前值

	// 平仓信息
	closePercent: number; // 平仓比例
	closeQuantity: number; // 平仓数量
	totalQuantity: number; // 总持仓数量

	// 盈亏结果
	pnl?: number; // 实际盈亏 (USDT)
	fee?: number; // 手续费 (USDT)

	// 额外信息
	description?: string; // 描述信息
	addPositionCount?: number; // 加仓次数

	// 蔡森趋势决策信息（仅Level1使用）
	caisenTrend?: "BULLISH" | "BEARISH" | "NEUTRAL"; // 蔡森趋势判断
	caisenScore?: number; // 蔡森评分
	caisenReason?: string; // 蔡森决策原因
	triggered?: boolean; // 是否实际触发平仓
}

/**
 * 记录平仓决策到 agent_decisions 表
 */
export async function recordClosingDecision(
	params: ClosingDecisionParams,
	iterationCount = 0,
): Promise<void> {
	try {
		// 构建触发类型的中文描述
		const triggerTypeMap: Record<ClosingTriggerType, string> = {
			[ClosingTriggerType.PARTIAL_TAKE_PROFIT]: "分批止盈",
			[ClosingTriggerType.PEAK_DRAWDOWN]: "峰值回落保护",
			[ClosingTriggerType.DYNAMIC_STOP_LOSS]: "动态止损",
			[ClosingTriggerType.TRAILING_STOP]: "移动止盈",
		};

		const triggerTypeName = triggerTypeMap[params.triggerType] || "系统平仓";
		const sideText = params.side === "long" ? "做多" : "做空";

		// 计算价格变动
		const entryPrice = Number.parseFloat(String(params.entryPrice));
		const currentPrice = Number.parseFloat(String(params.currentPrice));
		const priceChangePercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
		const actualPriceChange =
			params.side === "long" ? priceChangePercent : -priceChangePercent;

		// 构建决策文本
		let decisionText = `【${triggerTypeName} - ${params.level}】${params.symbol} ${sideText}\n`;
		decisionText += `触发级别: ${params.level}\n`;
		decisionText += `杠杆倍数: ${Number.parseFloat(String(params.leverage)).toFixed(0)}x\n`;

		// 加仓信息
		if (params.addPositionCount && params.addPositionCount > 0) {
			decisionText += `加仓次数: ${params.addPositionCount}次\n`;
		}

		// 蔡森趋势决策信息（仅Level1）
		if (params.caisenTrend && params.level === "level1") {
			const trendMap = {
				BULLISH: "会涨",
				BEARISH: "会大跌",
				NEUTRAL: "震荡",
			};
			decisionText += `蔡森趋势: ${trendMap[params.caisenTrend]} (评分${Number.parseFloat(String(params.caisenScore || 0)).toFixed(0)}分)\n`;
			if (params.caisenReason) {
				decisionText += `决策原因: ${params.caisenReason}\n`;
			}
			if (params.triggered === false) {
				decisionText += "⚠️ 蔡森看涨，忽略Level1平仓信号\n";
			} else if (params.caisenTrend === "BEARISH") {
				decisionText += "⚠️ 蔡森看跌，Level1强制全平\n";
			}
		}

		decisionText += `入场价格: ${Number.parseFloat(String(params.entryPrice)).toFixed(6)}\n`;
		decisionText += `当前价格: ${Number.parseFloat(String(params.currentPrice)).toFixed(6)}\n`;

		if (params.closePrice) {
			decisionText += `平仓价格: ${Number.parseFloat(String(params.closePrice)).toFixed(6)}\n`;
		}

		decisionText += `价格变动: ${Number.parseFloat(String(actualPriceChange)).toFixed(2)}%\n`;
		decisionText += `当前盈亏: ${Number.parseFloat(String(params.pnlPercent)).toFixed(2)}%\n`;

		// 峰值回落特有信息
		if (
			params.triggerType === ClosingTriggerType.PEAK_DRAWDOWN &&
			params.peakPnlPercent !== undefined
		) {
			const drawdownPercent = Number.parseFloat(String(params.peakPnlPercent)) - Number.parseFloat(String(params.pnlPercent));
			decisionText += `峰值盈亏: ${Number.parseFloat(String(params.peakPnlPercent)).toFixed(2)}%\n`;
			decisionText += `回落幅度: ${drawdownPercent.toFixed(2)}%\n`;
			decisionText += `回落阈值: ${Number.parseFloat(String(params.triggerThreshold)).toFixed(2)}%\n`;
		}
		// 分批止盈特有信息
		else if (params.triggerType === ClosingTriggerType.PARTIAL_TAKE_PROFIT) {
			decisionText += `止盈阈值: ${Number.parseFloat(String(params.triggerThreshold)).toFixed(2)}%\n`;
		}
		// 动态止损特有信息
		else if (params.triggerType === ClosingTriggerType.DYNAMIC_STOP_LOSS) {
			decisionText += `止损阈值: ${Number.parseFloat(String(params.triggerThreshold)).toFixed(2)}%\n`;
		}

		decisionText += `平仓比例: ${Number.parseFloat(String(params.closePercent)).toFixed(0)}%\n`;
		decisionText += `平仓数量: ${Number.parseFloat(String(params.closeQuantity)).toFixed(6)} / ${Number.parseFloat(String(params.totalQuantity)).toFixed(6)}\n`;

		if (params.pnl !== undefined) {
			decisionText += `平仓盈亏: ${Number.parseFloat(String(params.pnl)) >= 0 ? "+" : ""}${Number.parseFloat(String(params.pnl)).toFixed(2)} USDT\n`;
		}

		if (params.fee !== undefined) {
			decisionText += `手续费: ${Number.parseFloat(String(params.fee)).toFixed(4)} USDT\n`;
		}

		if (params.description) {
			decisionText += `\n${params.description}`;
		}

		// 构建 market_analysis JSON
		const marketAnalysis = {
			trigger: params.triggerType,
			symbol: params.symbol,
			side: params.side,
			level: params.level,
			pnlPercent: params.pnlPercent,
			peakPnlPercent: params.peakPnlPercent,
			triggerThreshold: params.triggerThreshold,
			currentValue: params.currentValue,
			closePercent: params.closePercent,
			leverage: params.leverage,
			addPositionCount: params.addPositionCount,
			// 蔡森趋势决策信息
			caisenTrend: params.caisenTrend,
			caisenScore: params.caisenScore,
			caisenReason: params.caisenReason,
			triggered: params.triggered,
		};

		// 构建 actions_taken JSON
		const actionsTaken = [
			{
				action:
					params.closePercent === 100
						? "close_position"
						: "partial_close_position",
				symbol: params.symbol,
				reason: params.triggerType,
				level: params.level,
				closePercent: params.closePercent,
				closeQuantity: params.closeQuantity,
				pnl: params.pnl,
			},
		];

		// 记录到 agent_decisions 表
		await dbClient.execute({
			sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [
				getChinaTimeISO(),
				iterationCount,
				JSON.stringify(marketAnalysis),
				decisionText,
				JSON.stringify(actionsTaken),
				0, // account_value 稍后可以更新
				0, // positions_count 稍后可以更新
			],
		});

		logger.info({
			action: "closing_decision_recorded",
			symbol: params.symbol,
			triggerType: params.triggerType,
			level: params.level,
			closePercent: params.closePercent,
			pnl: params.pnl,
			message: `${triggerTypeName}决策已记录到 agent_decisions 表`,
		});
	} catch (error) {
		logger.error({
			action: "record_closing_decision_failed",
			symbol: params.symbol,
			triggerType: params.triggerType,
			error: (error as Error).message,
			stack: (error as Error).stack,
			message: "记录平仓决策失败",
		});
		// 不抛出错误，避免影响平仓操作
	}
}

/**
 * 批量记录多个平仓决策
 */
export async function recordMultipleClosingDecisions(
	decisions: ClosingDecisionParams[],
	iterationCount = 0,
): Promise<void> {
	for (const decision of decisions) {
		await recordClosingDecision(decision, iterationCount);
	}
}
