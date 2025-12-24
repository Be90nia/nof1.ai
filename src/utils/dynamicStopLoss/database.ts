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
 * 动态止损数据库集成模块
 *
 * 负责存储和查询动态止损相关数据
 */

import { dbClient } from "../../database/dbClient";
import { createLogger } from "../loggerUtils";
import type {
	CaisenStrategyResultRecord,
	DynamicIndicatorsRecord,
	StopLossConfigHistoryRecord,
	StopLossDecisionRecord,
} from "./types";

const logger = createLogger({
	name: "dynamic-stop-loss-database",
	level: "info",
});

/**
 * 数据库集成类
 */
export class DatabaseIntegration {
	/**
	 * 存储动态止损指标
	 */
	async saveDynamicIndicators(data: DynamicIndicatorsRecord): Promise<void> {
		try {
			logger.debug({
				action: "save_indicators",
				symbol: data.symbol,
				timestamp: data.timestamp,
			});

			await dbClient.execute(
				`INSERT INTO dynamic_stop_loss_indicators (
          timestamp, symbol, trend_strength, volatility_atr, 
          volatility_historical, volatility_normalized, seven_segment_level,
          volume_factor, time_decay_factor, market_sentiment, rsi, macd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					new Date(data.timestamp).toISOString(),
					data.symbol,
					data.trendStrength,
					data.volatilityAtr,
					data.volatilityHistorical,
					data.volatilityHistorical, // normalized (using historical as proxy)
					data.sevenSegmentLevel,
					data.volumeFactor,
					data.timeDecayFactor,
					data.marketSentiment,
					data.rsi ?? null,
					data.macd ?? null,
				],
			);

			logger.debug({
				action: "save_indicators_success",
				symbol: data.symbol,
			});
		} catch (error) {
			logger.error({
				action: "save_indicators_error",
				symbol: data.symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			// 不抛出错误，避免阻塞主流程
		}
	}

	/**
	 * 存储止损决策
	 */
	async saveStopLossDecision(data: StopLossDecisionRecord): Promise<void> {
		try {
			logger.debug({
				action: "save_decision",
				symbol: data.symbol,
				positionId: data.positionId,
				decision: data.decision,
			});

			await dbClient.execute(
				`INSERT INTO stop_loss_decisions (
          timestamp, symbol, position_id, entry_price, current_price,
          pnl_percent, leverage, base_threshold, dynamic_threshold,
          dynamic_factors, decision, ai_judgment, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					new Date(data.timestamp).toISOString(),
					data.symbol,
					data.positionId,
					data.entryPrice,
					data.currentPrice,
					data.pnlPercent,
					data.leverage,
					data.baseThreshold,
					data.dynamicThreshold,
					data.dynamicFactors,
					data.decision,
					data.aiJudgment ?? null,
					data.reason,
				],
			);

			logger.info({
				action: "save_decision_success",
				symbol: data.symbol,
				positionId: data.positionId,
				decision: data.decision,
			});
		} catch (error) {
			logger.error({
				action: "save_decision_error",
				symbol: data.symbol,
				positionId: data.positionId,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			// 不抛出错误，避免阻塞主流程
		}
	}

	/**
	 * 存储蔡森策略分析结果
	 */
	async saveCaisenStrategyResult(
		data: CaisenStrategyResultRecord,
	): Promise<void> {
		try {
			logger.debug({
				action: "save_caisen_result",
				symbol: data.symbol,
				timestamp: data.timestamp,
			});

			await dbClient.execute(
				`INSERT INTO caisen_strategy_results (
          timestamp, symbol, daily_trend, hourly_trend, five_minute_trend,
          multi_timeframe_score, support_level, resistance_level,
          seven_segment_analysis, trend_consistency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					new Date(data.timestamp).toISOString(),
					data.symbol,
					data.dailyTrend,
					data.hourlyTrend,
					data.fiveMinuteTrend,
					data.multiTimeframeScore,
					data.supportLevel ?? null,
					data.resistanceLevel ?? null,
					data.sevenSegmentAnalysis ?? null,
					data.trendConsistency,
				],
			);

			logger.debug({
				action: "save_caisen_result_success",
				symbol: data.symbol,
			});
		} catch (error) {
			logger.error({
				action: "save_caisen_result_error",
				symbol: data.symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			// 不抛出错误，避免阻塞主流程
		}
	}

	/**
	 * 存储配置变更历史
	 */
	async saveConfigHistory(data: StopLossConfigHistoryRecord): Promise<void> {
		try {
			logger.debug({
				action: "save_config_history",
				configKey: data.configKey,
			});

			await dbClient.execute(
				`INSERT INTO stop_loss_config_history (
          timestamp, config_key, old_value, new_value, changed_by, reason
        ) VALUES (?, ?, ?, ?, ?, ?)`,
				[
					new Date(data.timestamp).toISOString(),
					data.configKey,
					data.oldValue ?? null,
					data.newValue,
					data.changedBy ?? null,
					data.reason ?? null,
				],
			);

			logger.info({
				action: "save_config_history_success",
				configKey: data.configKey,
			});
		} catch (error) {
			logger.error({
				action: "save_config_history_error",
				configKey: data.configKey,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			// 不抛出错误，避免阻塞主流程
		}
	}

	/**
	 * 查询历史动态指标
	 */
	async queryDynamicIndicators(
		symbol: string,
		startTime: number,
		endTime: number,
	): Promise<DynamicIndicatorsRecord[]> {
		try {
			logger.debug({
				action: "query_indicators",
				symbol,
				startTime,
				endTime,
			});

			const result = await dbClient.execute(
				`SELECT 
          timestamp, symbol, trend_strength, volatility_atr,
          volatility_historical, seven_segment_level, volume_factor,
          time_decay_factor, market_sentiment, rsi, macd
        FROM dynamic_stop_loss_indicators
        WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC`,
				[
					symbol,
					new Date(startTime).toISOString(),
					new Date(endTime).toISOString(),
				],
			);

			const records: DynamicIndicatorsRecord[] = result.rows.map(
				(row: unknown) => {
					const r = row as Record<string, unknown>;
					return {
						timestamp: new Date(r.timestamp as string).getTime(),
						symbol: r.symbol as string,
						trendStrength: r.trend_strength as number,
						volatilityAtr: r.volatility_atr as number,
						volatilityHistorical: r.volatility_historical as number,
						sevenSegmentLevel: r.seven_segment_level as number,
						volumeFactor: r.volume_factor as number,
						timeDecayFactor: r.time_decay_factor as number,
						marketSentiment: r.market_sentiment as number,
						rsi: r.rsi as number | undefined,
						macd: r.macd as number | undefined,
					};
				},
			);

			logger.debug({
				action: "query_indicators_success",
				symbol,
				count: records.length,
			});

			return records;
		} catch (error) {
			logger.error({
				action: "query_indicators_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			return [];
		}
	}

	/**
	 * 查询最近的止损决策
	 */
	async queryRecentDecisions(
		symbol?: string,
		limit = 100,
	): Promise<StopLossDecisionRecord[]> {
		try {
			logger.debug({
				action: "query_recent_decisions",
				symbol,
				limit,
			});

			const sql = symbol
				? `SELECT * FROM stop_loss_decisions 
           WHERE symbol = ? 
           ORDER BY timestamp DESC 
           LIMIT ?`
				: `SELECT * FROM stop_loss_decisions 
           ORDER BY timestamp DESC 
           LIMIT ?`;

			const params = symbol ? [symbol, limit] : [limit];
			const result = await dbClient.execute(sql, params);

			const records: StopLossDecisionRecord[] = result.rows.map(
				(row: unknown) => {
					const r = row as Record<string, unknown>;
					return {
						timestamp: new Date(r.timestamp as string).getTime(),
						symbol: r.symbol as string,
						positionId: r.position_id as string,
						entryPrice: r.entry_price as number,
						currentPrice: r.current_price as number,
						pnlPercent: r.pnl_percent as number,
						leverage: r.leverage as number,
						baseThreshold: r.base_threshold as number,
						dynamicThreshold: r.dynamic_threshold as number,
						dynamicFactors: r.dynamic_factors as string,
						decision: r.decision as "close" | "hold",
						aiJudgment: r.ai_judgment as string | undefined,
						reason: r.reason as string,
					};
				},
			);

			logger.debug({
				action: "query_recent_decisions_success",
				count: records.length,
			});

			return records;
		} catch (error) {
			logger.error({
				action: "query_recent_decisions_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			return [];
		}
	}

	/**
	 * 查询蔡森策略分析结果
	 */
	async queryCaisenResults(
		symbol: string,
		startTime: number,
		endTime: number,
	): Promise<CaisenStrategyResultRecord[]> {
		try {
			logger.debug({
				action: "query_caisen_results",
				symbol,
				startTime,
				endTime,
			});

			const result = await dbClient.execute(
				`SELECT * FROM caisen_strategy_results
        WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC`,
				[
					symbol,
					new Date(startTime).toISOString(),
					new Date(endTime).toISOString(),
				],
			);

			const records: CaisenStrategyResultRecord[] = result.rows.map(
				(row: unknown) => {
					const r = row as Record<string, unknown>;
					return {
						timestamp: new Date(r.timestamp as string).getTime(),
						symbol: r.symbol as string,
						dailyTrend: r.daily_trend as "up" | "down" | "neutral",
						hourlyTrend: r.hourly_trend as "up" | "down" | "neutral",
						fiveMinuteTrend: r.five_minute_trend as "up" | "down" | "neutral",
						multiTimeframeScore: r.multi_timeframe_score as number,
						supportLevel: r.support_level as number | undefined,
						resistanceLevel: r.resistance_level as number | undefined,
						sevenSegmentAnalysis: r.seven_segment_analysis as
							| string
							| undefined,
						trendConsistency: r.trend_consistency as number,
					};
				},
			);

			logger.debug({
				action: "query_caisen_results_success",
				symbol,
				count: records.length,
			});

			return records;
		} catch (error) {
			logger.error({
				action: "query_caisen_results_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			return [];
		}
	}

	/**
	 * 带重试机制的保存方法
	 */
	async saveWithRetry<T>(
		saveFn: () => Promise<T>,
		maxRetries = 3,
		initialDelay = 100,
	): Promise<void> {
		for (let i = 0; i < maxRetries; i++) {
			try {
				await saveFn();
				return;
			} catch (error) {
				if (i === maxRetries - 1) {
					logger.error({
						action: "save_with_retry_failed",
						attempt: i + 1,
						maxRetries,
						error: (error as Error).message,
					});
					// 最后一次失败也不抛出错误，避免阻塞主流程
					return;
				}

				const delay = initialDelay * 2 ** i;
				logger.warn({
					action: "save_with_retry",
					attempt: i + 1,
					maxRetries,
					delay,
					error: (error as Error).message,
				});

				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
}

/**
 * 创建数据库集成实例
 */
export function createDatabaseIntegration(): DatabaseIntegration {
	return new DatabaseIntegration();
}

/**
 * 导出单例实例
 */
export const databaseIntegration = new DatabaseIntegration();
