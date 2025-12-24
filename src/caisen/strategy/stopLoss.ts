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
 * 蔡森策略止损整合模块
 *
 * 将蔡森决策模型的核心思想融入动态止损机制
 */

import { databaseIntegration } from "../../utils/dynamicStopLoss/database";
import { dynamicStopLossCache } from "../../utils/dynamicStopLoss/cache";
import type {
	CaisenStopLossFactors,
	CaisenStrategyResultRecord,
	SupportResistanceLevels,
} from "../../utils/dynamicStopLoss/types";
import { createLogger } from "../../utils/loggerUtils";
import {
	TrendDirection,
	getCaiSenTrendDecision,
} from "../decision/trendDecision";
import { getKlineData } from "../systems/monitor";

const logger = createLogger({
	name: "caisen-stop-loss-integrator",
	level: "info",
});

/**
 * 蔡森策略整合器类
 */
export class CaisenStrategyIntegrator {
	/**
	 * 计算蔡森止损因子
	 *
	 * @param symbol 交易币种
	 * @param side 持仓方向
	 * @param currentPrice 当前价格
	 * @returns 蔡森止损因子
	 */
	async calculateCaisenStopLossFactors(
		symbol: string,
		side: "long" | "short",
		currentPrice: number,
	): Promise<CaisenStopLossFactors> {
		try {
			logger.info({
				action: "calculate_caisen_factors_start",
				symbol,
				side,
				currentPrice,
				message: "开始计算蔡森止损因子",
			});

			// 检查缓存
			const cached = dynamicStopLossCache.getCaisenAnalysis(symbol);
			if (cached) {
				logger.info({
					action: "calculate_caisen_factors_cache_hit",
					symbol,
					message: "使用缓存的蔡森分析数据",
				});

				// 从缓存数据构建返回结果
				const sevenSegmentAnalysis = JSON.parse(
					cached.sevenSegmentAnalysis || "{}",
				);

				// 重新计算支撑位和阻力位接近度（因为当前价格可能变化）
				const supportResistance = await this.getSupportResistanceLevels(symbol);

				let supportProximity = 0;
				if (
					supportResistance.support.length > 0 &&
					cached.supportLevel !== undefined
				) {
					const distanceToSupport =
						Math.abs(currentPrice - cached.supportLevel) / currentPrice;
					supportProximity = Math.max(0, 1 - distanceToSupport * 20);
				}

				let resistanceProximity = 0;
				if (
					supportResistance.resistance.length > 0 &&
					cached.resistanceLevel !== undefined
				) {
					const distanceToResistance =
						Math.abs(currentPrice - cached.resistanceLevel) / currentPrice;
					resistanceProximity = Math.max(0, 1 - distanceToResistance * 20);
				}

				return {
					multiTimeframeTrendScore: cached.multiTimeframeScore,
					sevenSegmentAdjustment: sevenSegmentAnalysis.adjustment || 0,
					trendConsistency: cached.trendConsistency,
					supportProximity,
					resistanceProximity,
				};
			}

			// 1. 获取蔡森趋势决策
			const trendDecision = await getCaiSenTrendDecision(symbol, side);

			// 2. 计算多时间框架趋势得分
			const multiTimeframeTrendScore =
				trendDecision.indicators.multiTimeframeTrend;

			// 3. 计算七分位调整因子
			// 七分位得分范围：-100（高位）到 100（低位）
			// 转换为调整因子：-0.1 到 0.2
			const quantileScore = trendDecision.indicators.quantilePosition;
			let sevenSegmentAdjustment = 0;
			if (quantileScore >= 70) {
				// 低位（1-2分位）：较宽止损
				sevenSegmentAdjustment = 0.2;
			} else if (quantileScore >= 40) {
				// 偏低（3分位）：略宽止损
				sevenSegmentAdjustment = 0.1;
			} else if (quantileScore >= -40) {
				// 中位（4分位）：正常止损
				sevenSegmentAdjustment = 0;
			} else if (quantileScore >= -70) {
				// 偏高（5分位）：略紧止损
				sevenSegmentAdjustment = -0.05;
			} else {
				// 高位（6-7分位）：较紧止损
				sevenSegmentAdjustment = -0.1;
			}

			// 4. 计算趋势一致性得分
			// 基于多时间框架趋势的一致性
			const trendConsistency = Math.abs(multiTimeframeTrendScore);

			// 5. 获取支撑位和阻力位
			const supportResistance = await this.getSupportResistanceLevels(symbol);

			// 6. 计算支撑位接近度（0-1）
			let supportProximity = 0;
			if (supportResistance.support.length > 0) {
				const nearestSupport = supportResistance.support.reduce((prev, curr) =>
					Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice)
						? curr
						: prev,
				);
				const distanceToSupport =
					Math.abs(currentPrice - nearestSupport) / currentPrice;
				supportProximity = Math.max(0, 1 - distanceToSupport * 20); // 5%以内为接近
			}

			// 7. 计算阻力位接近度（0-1）
			let resistanceProximity = 0;
			if (supportResistance.resistance.length > 0) {
				const nearestResistance = supportResistance.resistance.reduce(
					(prev, curr) =>
						Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice)
							? curr
							: prev,
				);
				const distanceToResistance =
					Math.abs(currentPrice - nearestResistance) / currentPrice;
				resistanceProximity = Math.max(0, 1 - distanceToResistance * 20); // 5%以内为接近
			}

			const factors: CaisenStopLossFactors = {
				multiTimeframeTrendScore,
				sevenSegmentAdjustment,
				trendConsistency,
				supportProximity,
				resistanceProximity,
			};

			logger.info({
				action: "calculate_caisen_factors_success",
				symbol,
				side,
				factors,
				trendDecision: {
					trend: trendDecision.trend,
					score: trendDecision.score,
				},
				message: "蔡森止损因子计算成功",
			});

			// 保存蔡森策略分析结果到数据库（异步，不阻塞主流程）
			const strategyRecord: CaisenStrategyResultRecord = {
				timestamp: Date.now(),
				symbol,
				dailyTrend: this.mapTrendDirection(trendDecision.trend),
				hourlyTrend: this.mapTrendDirection(trendDecision.trend),
				fiveMinuteTrend: this.mapTrendDirection(trendDecision.trend),
				multiTimeframeScore: multiTimeframeTrendScore,
				supportLevel:
					supportResistance.support.length > 0
						? supportResistance.support[0]
						: undefined,
				resistanceLevel:
					supportResistance.resistance.length > 0
						? supportResistance.resistance[0]
						: undefined,
				sevenSegmentAnalysis: JSON.stringify({
					quantileScore,
					adjustment: sevenSegmentAdjustment,
				}),
				trendConsistency,
			};

			databaseIntegration
				.saveWithRetry(() =>
					databaseIntegration.saveCaisenStrategyResult(strategyRecord),
				)
				.catch((error) => {
					logger.warn({
						action: "save_caisen_result_async_error",
						symbol,
						error: (error as Error).message,
						message: "异步保存蔡森策略结果失败，不影响主流程",
					});
				});

			// 设置缓存
			dynamicStopLossCache.setCaisenAnalysis(symbol, strategyRecord);

			return factors;
		} catch (error) {
			logger.error({
				action: "calculate_caisen_factors_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
				message: "计算蔡森止损因子失败",
			});
			throw error;
		}
	}

	/**
	 * 获取支撑位和阻力位
	 *
	 * @param symbol 交易币种
	 * @returns 支撑位和阻力位信息
	 */
	async getSupportResistanceLevels(
		symbol: string,
	): Promise<SupportResistanceLevels> {
		try {
			logger.debug({
				action: "get_support_resistance_start",
				symbol,
			});

			// 获取7天的1小时K线数据
			const klines = await getKlineData(symbol, "1h", 168);

			if (klines.length < 50) {
				logger.warn({
					action: "get_support_resistance_insufficient_data",
					symbol,
					actual: klines.length,
				});
				return { support: [], resistance: [] };
			}

			// 提取高点和低点
			const highs = klines.map((k) => k.high);
			const lows = klines.map((k) => k.low);
			const closes = klines.map((k) => k.close);
			const volumes = klines.map((k) => k.volume);

			// 1. 基于成交量密集区计算支撑位和阻力位
			const volumeWeightedLevels = this.calculateVolumeWeightedLevels(
				closes,
				volumes,
			);

			// 2. 基于斐波那契回撤位计算
			const fibonacciLevels = this.calculateFibonacciLevels(highs, lows);

			// 3. 基于局部极值点计算
			const extremeLevels = this.calculateExtremeLevels(highs, lows);

			// 4. 合并并去重
			const allSupport = [
				...volumeWeightedLevels.support,
				...fibonacciLevels.support,
				...extremeLevels.support,
			];
			const allResistance = [
				...volumeWeightedLevels.resistance,
				...fibonacciLevels.resistance,
				...extremeLevels.resistance,
			];

			// 5. 去重并排序（相近的价格合并）
			const support = this.mergeSimilarLevels(allSupport);
			const resistance = this.mergeSimilarLevels(allResistance);

			logger.debug({
				action: "get_support_resistance_complete",
				symbol,
				supportCount: support.length,
				resistanceCount: resistance.length,
			});

			return { support, resistance };
		} catch (error) {
			logger.error({
				action: "get_support_resistance_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			return { support: [], resistance: [] };
		}
	}

	/**
	 * 基于成交量密集区计算支撑位和阻力位
	 */
	private calculateVolumeWeightedLevels(
		prices: number[],
		volumes: number[],
	): SupportResistanceLevels {
		// 将价格分成20个区间
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);
		const priceRange = maxPrice - minPrice;
		const bucketSize = priceRange / 20;

		// 统计每个区间的成交量
		const volumeBuckets = new Array(20).fill(0);
		for (let i = 0; i < prices.length; i++) {
			const bucketIndex = Math.min(
				19,
				Math.floor((prices[i] - minPrice) / bucketSize),
			);
			volumeBuckets[bucketIndex] += volumes[i];
		}

		// 找出成交量最大的5个区间
		const topBuckets = volumeBuckets
			.map((volume, index) => ({ volume, index }))
			.sort((a, b) => b.volume - a.volume)
			.slice(0, 5);

		// 转换为价格水平
		const levels = topBuckets.map(
			(bucket) => minPrice + bucket.index * bucketSize + bucketSize / 2,
		);

		// 当前价格
		const currentPrice = prices[prices.length - 1];

		// 分为支撑位和阻力位
		const support = levels.filter((level) => level < currentPrice);
		const resistance = levels.filter((level) => level > currentPrice);

		return { support, resistance };
	}

	/**
	 * 基于斐波那契回撤位计算
	 */
	private calculateFibonacciLevels(
		highs: number[],
		lows: number[],
	): SupportResistanceLevels {
		const maxHigh = Math.max(...highs);
		const minLow = Math.min(...lows);
		const range = maxHigh - minLow;

		// 斐波那契回撤位：23.6%, 38.2%, 50%, 61.8%, 78.6%
		const fibLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
		const levels = fibLevels.map((fib) => minLow + range * fib);

		// 当前价格
		const currentPrice = highs[highs.length - 1];

		// 分为支撑位和阻力位
		const support = levels.filter((level) => level < currentPrice);
		const resistance = levels.filter((level) => level > currentPrice);

		return { support, resistance };
	}

	/**
	 * 基于局部极值点计算
	 */
	private calculateExtremeLevels(
		highs: number[],
		lows: number[],
	): SupportResistanceLevels {
		const support: number[] = [];
		const resistance: number[] = [];

		// 找出局部低点（支撑位）
		for (let i = 2; i < lows.length - 2; i++) {
			if (
				lows[i] < lows[i - 1] &&
				lows[i] < lows[i - 2] &&
				lows[i] < lows[i + 1] &&
				lows[i] < lows[i + 2]
			) {
				support.push(lows[i]);
			}
		}

		// 找出局部高点（阻力位）
		for (let i = 2; i < highs.length - 2; i++) {
			if (
				highs[i] > highs[i - 1] &&
				highs[i] > highs[i - 2] &&
				highs[i] > highs[i + 1] &&
				highs[i] > highs[i + 2]
			) {
				resistance.push(highs[i]);
			}
		}

		return { support, resistance };
	}

	/**
	 * 合并相近的价格水平
	 * 相差小于1%的价格视为同一水平
	 */
	private mergeSimilarLevels(levels: number[]): number[] {
		if (levels.length === 0) return [];

		const sorted = [...levels].sort((a, b) => a - b);
		const merged: number[] = [sorted[0]];

		for (let i = 1; i < sorted.length; i++) {
			const lastMerged = merged[merged.length - 1];
			const diff = Math.abs(sorted[i] - lastMerged) / lastMerged;

			if (diff > 0.01) {
				// 相差大于1%，视为不同水平
				merged.push(sorted[i]);
			}
		}

		return merged;
	}

	/**
	 * 映射趋势方向到数据库格式
	 */
	private mapTrendDirection(trend: TrendDirection): "up" | "down" | "neutral" {
		switch (trend) {
			case TrendDirection.BULLISH:
				return "up";
			case TrendDirection.BEARISH:
				return "down";
			default:
				return "neutral";
		}
	}

	/**
	 * 根据市场状态调整止损阈值
	 *
	 * @param baseThreshold 基础止损阈值
	 * @param factors 蔡森止损因子
	 * @param side 持仓方向
	 * @returns 调整后的止损阈值
	 */
	adjustStopLossByMarketState(
		baseThreshold: number,
		factors: CaisenStopLossFactors,
		side: "long" | "short",
	): number {
		try {
			logger.debug({
				action: "adjust_stop_loss_start",
				baseThreshold,
				factors,
				side,
			});

			let adjustment = 0;

			// 1. 多时间框架趋势调整
			// 趋势与持仓方向一致时，放宽止损；相反时，收紧止损
			const trendFactor = factors.multiTimeframeTrendScore / 100; // 归一化到-1到1
			if (side === "long") {
				// 多头：趋势向上时放宽，向下时收紧
				adjustment += trendFactor * 0.2; // -0.2 到 0.2
			} else {
				// 空头：趋势向下时放宽，向上时收紧
				adjustment -= trendFactor * 0.2; // -0.2 到 0.2
			}

			// 2. 七分位调整
			adjustment += factors.sevenSegmentAdjustment;

			// 3. 趋势一致性调整
			// 趋势一致性高时，可以适当放宽止损
			const consistencyFactor = factors.trendConsistency / 100; // 归一化到0-1
			adjustment += consistencyFactor * 0.1; // 0 到 0.1

			// 4. 支撑位/阻力位接近度调整
			if (side === "long") {
				// 多头：接近支撑位时，可以适当放宽止损
				adjustment += factors.supportProximity * 0.15; // 0 到 0.15
			} else {
				// 空头：接近阻力位时，可以适当放宽止损
				adjustment += factors.resistanceProximity * 0.15; // 0 到 0.15
			}

			// 5. 应用调整
			// 对于负阈值，正调整意味着放宽（绝对值变小），需要除以(1+adjustment)而不是乘以
			// 对于正阈值，正调整意味着收紧（绝对值变大），直接乘以(1+adjustment)
			let adjustedThreshold: number;
			if (baseThreshold < 0) {
				// 负阈值：正adjustment应该让绝对值变小（放宽）
				// 例如：-10 with adjustment=0.25 应该变成 -10/(1+0.25) = -8（更宽松）
				adjustedThreshold = baseThreshold / (1 + adjustment);
			} else {
				// 正阈值：正adjustment应该让绝对值变大（收紧）
				adjustedThreshold = baseThreshold * (1 + adjustment);
			}

			// 6. 限制调整范围（不超过基础阈值的±50%）
			// 对于负阈值（如-10%）：
			// - 0.5倍（-5%）是最宽松的止损（绝对值最小，最接近0）
			// - 1.5倍（-15%）是最严格的止损（绝对值最大，最远离0）
			const loosestThreshold = baseThreshold * 0.5; // 最宽松（绝对值最小）
			const tightestThreshold = baseThreshold * 1.5; // 最严格（绝对值最大）

			let finalThreshold: number;
			if (baseThreshold < 0) {
				// 负阈值：需要确保在 [tightestThreshold, loosestThreshold] 范围内
				// 即 [-15, -5] 对于 baseThreshold = -10
				finalThreshold = Math.max(
					tightestThreshold,
					Math.min(loosestThreshold, adjustedThreshold),
				);
			} else {
				// 正阈值：需要确保在 [loosestThreshold, tightestThreshold] 范围内
				finalThreshold = Math.max(
					loosestThreshold,
					Math.min(tightestThreshold, adjustedThreshold),
				);
			}

			logger.debug({
				action: "adjust_stop_loss_complete",
				baseThreshold,
				adjustment: adjustment.toFixed(3),
				adjustedThreshold,
				finalThreshold,
			});

			// 7. 处理NaN情况
			if (Number.isNaN(finalThreshold)) {
				logger.warn({
					action: "adjust_stop_loss_nan",
					baseThreshold,
					adjustment,
					adjustedThreshold,
					message: "计算结果为NaN，返回基础阈值",
				});
				return baseThreshold;
			}

			return finalThreshold;
		} catch (error) {
			logger.error({
				action: "adjust_stop_loss_error",
				error: (error as Error).message,
			});
			return baseThreshold;
		}
	}
}

/**
 * 创建蔡森策略整合器实例
 */
export function createCaisenStrategyIntegrator(): CaisenStrategyIntegrator {
	return new CaisenStrategyIntegrator();
}
