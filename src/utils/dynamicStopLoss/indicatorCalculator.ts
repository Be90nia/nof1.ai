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
 * 动态止损指标计算器
 *
 * 负责计算各种市场指标，用于动态止损阈值的计算
 */

import { getKlineData } from "../../caisen/systems/monitor";
import { createLogger } from "../loggerUtils";
import { dynamicStopLossCache } from "./cache";
import { databaseIntegration } from "./database";
import type {
	DynamicIndicators,
	DynamicIndicatorsRecord,
	MarketSentimentInfo,
	VolatilityInfo,
} from "./types";

const logger = createLogger({
	name: "indicator-calculator",
	level: "info",
});

// ==================== 辅助函数 ====================

/**
 * 计算简单移动平均线 (SMA)
 * @param prices 价格数组
 * @param period 周期
 * @returns SMA 值
 */
function calculateSMA(prices: number[], period: number): number {
	if (prices.length < period) {
		return prices.reduce((sum, p) => sum + p, 0) / prices.length;
	}

	const recentPrices = prices.slice(-period);
	return recentPrices.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * 计算指数移动平均线 (EMA)
 * @param prices 价格数组
 * @param period 周期
 * @returns EMA 值
 */
export function calculateEMA(prices: number[], period: number): number {
	if (prices.length < period) {
		return prices.reduce((sum, p) => sum + p, 0) / prices.length;
	}

	const multiplier = 2 / (period + 1);
	let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

	for (let i = period; i < prices.length; i++) {
		ema = (prices[i] - ema) * multiplier + ema;
	}

	return ema;
}

/**
 * 验证价格数据有效性
 * @param price 价格
 * @returns 是否有效
 */
function validatePrice(price: number): boolean {
	return price > 0 && Number.isFinite(price) && !Number.isNaN(price);
}

/**
 * 验证价格数组有效性
 * @param prices 价格数组
 * @returns 是否有效
 */
function validatePrices(prices: number[]): boolean {
	return prices.length > 0 && prices.every((p) => validatePrice(p));
}

// ==================== 指标计算器类 ====================

/**
 * 指标计算器
 */
export class IndicatorCalculator {
	/**
	 * 计算趋势强度指标
	 * 公式：(当前价格 - N周期移动平均线) / N周期移动平均线 * 100%
	 *
	 * @param symbol 交易币种
	 * @param period 计算周期（默认20）
	 * @returns 趋势强度 (-100 到 100)
	 */
	async calculateTrendStrength(symbol: string, period = 20): Promise<number> {
		try {
			logger.debug({
				action: "calculate_trend_strength_start",
				symbol,
				period,
			});

			// 获取K线数据（使用1小时周期）
			const klines = await getKlineData(symbol, "1h", period + 5);

			if (klines.length < period) {
				logger.warn({
					action: "calculate_trend_strength_insufficient_data",
					symbol,
					required: period,
					actual: klines.length,
				});
				return 0;
			}

			// 提取收盘价
			const prices = klines.map((k) => k.close);

			// 验证数据有效性
			if (!validatePrices(prices)) {
				logger.error({
					action: "calculate_trend_strength_invalid_data",
					symbol,
				});
				throw new Error(`${symbol} 价格数据无效`);
			}

			// 计算移动平均线
			const ma = calculateSMA(prices, period);
			const currentPrice = prices[prices.length - 1];

			// 计算趋势强度
			const trendStrength = ((currentPrice - ma) / ma) * 100;

			logger.debug({
				action: "calculate_trend_strength_complete",
				symbol,
				currentPrice: currentPrice.toFixed(2),
				ma: ma.toFixed(2),
				trendStrength: trendStrength.toFixed(2),
			});

			return trendStrength;
		} catch (error) {
			logger.error({
				action: "calculate_trend_strength_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 计算 ATR (Average True Range) 波动率
	 * @param klines K线数据
	 * @param period 周期
	 * @returns ATR 值
	 */
	private calculateATR(
		klines: Array<{ high: number; low: number; close: number }>,
		period: number,
	): number {
		if (klines.length < period + 1) {
			return 0;
		}

		const trueRanges: number[] = [];

		for (let i = 1; i < klines.length; i++) {
			const high = klines[i].high;
			const low = klines[i].low;
			const prevClose = klines[i - 1].close;

			const tr = Math.max(
				high - low,
				Math.abs(high - prevClose),
				Math.abs(low - prevClose),
			);

			trueRanges.push(tr);
		}

		// 计算 ATR（简单移动平均）
		const recentTR = trueRanges.slice(-period);
		const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / period;

		return atr;
	}

	/**
	 * 计算历史波动率
	 * @param prices 价格数组
	 * @returns 历史波动率（标准差）
	 */
	private calculateHistoricalVolatility(prices: number[]): number {
		if (prices.length < 2) {
			return 0;
		}

		// 计算价格变化率
		const returns: number[] = [];
		for (let i = 1; i < prices.length; i++) {
			const returnRate = (prices[i] - prices[i - 1]) / prices[i - 1];
			returns.push(returnRate);
		}

		// 计算平均收益率
		const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

		// 计算标准差
		const variance =
			returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) /
			returns.length;
		const stdDev = Math.sqrt(variance);

		return stdDev;
	}

	/**
	 * 计算波动率指标
	 *
	 * @param symbol 交易币种
	 * @returns 波动率信息
	 */
	async calculateVolatility(symbol: string): Promise<VolatilityInfo> {
		try {
			logger.debug({
				action: "calculate_volatility_start",
				symbol,
			});

			// 获取K线数据（使用5分钟周期，获取更多数据点）
			const klines = await getKlineData(symbol, "5m", 100);

			if (klines.length < 20) {
				logger.warn({
					action: "calculate_volatility_insufficient_data",
					symbol,
					actual: klines.length,
				});
				return {
					atr: 0,
					historical: 0,
					normalized: 50, // 默认中等波动率
				};
			}

			// 提取收盘价
			const prices = klines.map((k) => k.close);

			// 验证数据有效性
			if (!validatePrices(prices)) {
				logger.error({
					action: "calculate_volatility_invalid_data",
					symbol,
				});
				throw new Error(`${symbol} 价格数据无效`);
			}

			// 计算 ATR 波动率
			const atr = this.calculateATR(klines, 14);

			// 计算历史波动率
			const historical = this.calculateHistoricalVolatility(prices);

			// 归一化波动率到 0-100
			// 使用历史波动率的百分比形式
			const historicalPercent = historical * 100;
			let normalized = 50; // 默认中等

			if (historicalPercent > 2.0) {
				normalized = 90; // 高波动率
			} else if (historicalPercent > 1.0) {
				normalized = 70; // 中高波动率
			} else if (historicalPercent < 0.5) {
				normalized = 30; // 低波动率
			}

			logger.debug({
				action: "calculate_volatility_complete",
				symbol,
				atr: atr.toFixed(6),
				historical: historical.toFixed(6),
				normalized,
			});

			return {
				atr,
				historical,
				normalized,
			};
		} catch (error) {
			logger.error({
				action: "calculate_volatility_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 计算七分位位置
	 * 基于历史价格区间确定当前价格的七分位位置
	 *
	 * @param symbol 交易币种
	 * @param currentPrice 当前价格
	 * @returns 七分位位置 (1-7)
	 */
	async calculateSevenSegmentLevel(
		symbol: string,
		currentPrice: number,
	): Promise<number> {
		try {
			logger.debug({
				action: "calculate_seven_segment_start",
				symbol,
				currentPrice,
			});

			// 验证当前价格
			if (!validatePrice(currentPrice)) {
				logger.error({
					action: "calculate_seven_segment_invalid_price",
					symbol,
					currentPrice,
				});
				throw new Error(`${symbol} 当前价格无效: ${currentPrice}`);
			}

			// 获取7天的1小时K线数据
			const klines = await getKlineData(symbol, "1h", 168);

			if (klines.length < 50) {
				logger.warn({
					action: "calculate_seven_segment_insufficient_data",
					symbol,
					actual: klines.length,
				});
				return 4; // 默认返回中位
			}

			// 提取收盘价并排序
			const prices = klines.map((k) => k.close);
			const sortedPrices = [...prices].sort((a, b) => a - b);

			// 计算七分位
			const q1 = sortedPrices[Math.floor(sortedPrices.length * (1 / 7))];
			const q2 = sortedPrices[Math.floor(sortedPrices.length * (2 / 7))];
			const q3 = sortedPrices[Math.floor(sortedPrices.length * (3 / 7))];
			const q4 = sortedPrices[Math.floor(sortedPrices.length * (4 / 7))];
			const q5 = sortedPrices[Math.floor(sortedPrices.length * (5 / 7))];
			const q6 = sortedPrices[Math.floor(sortedPrices.length * (6 / 7))];

			// 确定当前价格所在的七分位
			let level = 4; // 默认中位
			if (currentPrice <= q1) {
				level = 1;
			} else if (currentPrice <= q2) {
				level = 2;
			} else if (currentPrice <= q3) {
				level = 3;
			} else if (currentPrice <= q4) {
				level = 4;
			} else if (currentPrice <= q5) {
				level = 5;
			} else if (currentPrice <= q6) {
				level = 6;
			} else {
				level = 7;
			}

			logger.debug({
				action: "calculate_seven_segment_complete",
				symbol,
				currentPrice,
				level,
				quantiles: {
					q1: q1.toFixed(2),
					q2: q2.toFixed(2),
					q3: q3.toFixed(2),
					q4: q4.toFixed(2),
					q5: q5.toFixed(2),
					q6: q6.toFixed(2),
				},
			});

			return level;
		} catch (error) {
			logger.error({
				action: "calculate_seven_segment_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 计算成交量因子
	 * 比较当前成交量与N周期平均成交量
	 *
	 * @param symbol 交易币种
	 * @returns 成交量因子 (0-100)
	 */
	async calculateVolumeFactor(symbol: string): Promise<number> {
		try {
			logger.debug({
				action: "calculate_volume_factor_start",
				symbol,
			});

			// 获取K线数据（使用5分钟周期）
			const klines = await getKlineData(symbol, "5m", 20);

			if (klines.length < 10) {
				logger.warn({
					action: "calculate_volume_factor_insufficient_data",
					symbol,
					actual: klines.length,
				});
				return 50; // 默认返回中等
			}

			// 提取成交量
			const volumes = klines.map((k) => k.volume);

			// 计算最近3个周期的平均成交量
			const recentVolume = volumes.slice(-3).reduce((sum, v) => sum + v, 0) / 3;

			// 计算之前7个周期的平均成交量
			const previousVolume =
				volumes.slice(-10, -3).reduce((sum, v) => sum + v, 0) / 7;

			// 计算成交量比率
			const volumeRatio =
				previousVolume > 0 ? recentVolume / previousVolume : 1;

			// 归一化到 0-100
			let volumeFactor = 50; // 基础分

			if (volumeRatio > 1.5) {
				volumeFactor = 90; // 成交量大幅放大
			} else if (volumeRatio > 1.2) {
				volumeFactor = 70; // 成交量放大
			} else if (volumeRatio < 0.8) {
				volumeFactor = 30; // 成交量萎缩
			}

			logger.debug({
				action: "calculate_volume_factor_complete",
				symbol,
				recentVolume: recentVolume.toFixed(2),
				previousVolume: previousVolume.toFixed(2),
				volumeRatio: volumeRatio.toFixed(2),
				volumeFactor,
			});

			return volumeFactor;
		} catch (error) {
			logger.error({
				action: "calculate_volume_factor_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 计算时间衰减因子
	 * 基于持仓时间与预期持仓时间的比值
	 *
	 * @param holdingTime 持仓时间（秒）
	 * @param expectedHoldingTime 预期持仓时间（秒，默认24小时）
	 * @returns 时间衰减因子 (0-1)
	 */
	calculateTimeDecayFactor(
		holdingTime: number,
		expectedHoldingTime = 24 * 60 * 60,
	): number {
		try {
			logger.debug({
				action: "calculate_time_decay_factor",
				holdingTime,
				expectedHoldingTime,
			});

			// 验证输入
			if (holdingTime < 0 || expectedHoldingTime <= 0) {
				logger.warn({
					action: "calculate_time_decay_factor_invalid_input",
					holdingTime,
					expectedHoldingTime,
				});
				return 0;
			}

			// 计算时间比例
			const timeRatio = holdingTime / expectedHoldingTime;

			// 时间衰减因子：持仓时间越长，因子越大（0-1）
			// 使用平滑的曲线，避免突变
			const decayFactor = Math.min(1, timeRatio);

			logger.debug({
				action: "calculate_time_decay_factor_complete",
				timeRatio: timeRatio.toFixed(2),
				decayFactor: decayFactor.toFixed(2),
			});

			return decayFactor;
		} catch (error) {
			logger.error({
				action: "calculate_time_decay_factor_error",
				error: (error as Error).message,
			});
			return 0;
		}
	}

	/**
	 * 计算 RSI (Relative Strength Index) 指标
	 * @param prices 价格数组
	 * @param period 周期（默认14）
	 * @returns RSI 值 (0-100)
	 */
	private calculateRSI(prices: number[], period = 14): number {
		if (prices.length < period + 1) {
			return 50; // 默认中性
		}

		// 计算价格变化
		const changes: number[] = [];
		for (let i = 1; i < prices.length; i++) {
			changes.push(prices[i] - prices[i - 1]);
		}

		// 分离涨跌
		const gains = changes.map((c) => (c > 0 ? c : 0));
		const losses = changes.map((c) => (c < 0 ? Math.abs(c) : 0));

		// 计算平均涨跌
		const recentGains = gains.slice(-period);
		const recentLosses = losses.slice(-period);

		const avgGain = recentGains.reduce((sum, g) => sum + g, 0) / period;
		const avgLoss = recentLosses.reduce((sum, l) => sum + l, 0) / period;

		// 计算 RS 和 RSI
		if (avgLoss === 0) {
			return 100;
		}

		const rs = avgGain / avgLoss;
		const rsi = 100 - 100 / (1 + rs);

		return rsi;
	}

	/**
	 * 计算 MACD (Moving Average Convergence Divergence) 指标
	 * @param prices 价格数组
	 * @returns MACD 值
	 */
	private calculateMACD(prices: number[]): number {
		if (prices.length < 26) {
			return 0;
		}

		// 计算 EMA12 和 EMA26
		const ema12 = calculateEMA(prices, 12);
		const ema26 = calculateEMA(prices, 26);

		// MACD = EMA12 - EMA26
		const macd = ema12 - ema26;

		return macd;
	}

	/**
	 * 计算市场情绪指标
	 * 综合 RSI 和 MACD 指标
	 *
	 * @param symbol 交易币种
	 * @returns 市场情绪信息
	 */
	async calculateMarketSentiment(symbol: string): Promise<MarketSentimentInfo> {
		try {
			logger.debug({
				action: "calculate_market_sentiment_start",
				symbol,
			});

			// 获取K线数据（使用1小时周期）
			const klines = await getKlineData(symbol, "1h", 50);

			if (klines.length < 26) {
				logger.warn({
					action: "calculate_market_sentiment_insufficient_data",
					symbol,
					actual: klines.length,
				});
				return {
					rsi: 50,
					macd: 0,
					sentiment: 50,
				};
			}

			// 提取收盘价
			const prices = klines.map((k) => k.close);

			// 验证数据有效性
			if (!validatePrices(prices)) {
				logger.error({
					action: "calculate_market_sentiment_invalid_data",
					symbol,
				});
				throw new Error(`${symbol} 价格数据无效`);
			}

			// 计算 RSI
			const rsi = this.calculateRSI(prices, 14);

			// 计算 MACD
			const macd = this.calculateMACD(prices);

			// 综合计算市场情绪得分 (0-100)
			// RSI 权重 60%, MACD 权重 40%
			let sentiment = rsi * 0.6;

			// MACD 贡献：正值增加情绪，负值降低情绪
			const macdContribution = macd > 0 ? 20 : -20;
			sentiment += macdContribution;

			// 限制在 0-100 范围内
			sentiment = Math.max(0, Math.min(100, sentiment));

			logger.debug({
				action: "calculate_market_sentiment_complete",
				symbol,
				rsi: rsi.toFixed(2),
				macd: macd.toFixed(6),
				sentiment: sentiment.toFixed(2),
			});

			return {
				rsi,
				macd,
				sentiment,
			};
		} catch (error) {
			logger.error({
				action: "calculate_market_sentiment_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 计算所有动态指标
	 * 一次性计算所有指标，提高效率
	 *
	 * @param symbol 交易币种
	 * @param currentPrice 当前价格
	 * @param holdingTime 持仓时间（秒）
	 * @returns 动态指标集合
	 */
	async calculateAllIndicators(
		symbol: string,
		currentPrice: number,
		holdingTime: number,
	): Promise<DynamicIndicators> {
		try {
			logger.info({
				action: "calculate_all_indicators_start",
				symbol,
				currentPrice,
				holdingTime,
			});

			// 检查缓存
			const cached = dynamicStopLossCache.getIndicators(symbol);
			if (cached) {
				logger.info({
					action: "calculate_all_indicators_cache_hit",
					symbol,
					message: "使用缓存的指标数据",
				});

				// 从缓存数据构建返回结果
				return {
					trendStrength: cached.trendStrength,
					volatility: {
						atr: cached.volatilityAtr,
						historical: cached.volatilityHistorical,
						normalized: Math.round(
							(cached.volatilityHistorical * 100 > 2.0
								? 90
								: cached.volatilityHistorical * 100 > 1.0
									? 70
									: cached.volatilityHistorical * 100 < 0.5
										? 30
										: 50),
						),
					},
					sevenSegmentLevel: cached.sevenSegmentLevel,
					volumeFactor: cached.volumeFactor,
					timeDecayFactor: cached.timeDecayFactor,
					marketSentiment: {
						rsi: cached.rsi || 50,
						macd: cached.macd || 0,
						sentiment: cached.marketSentiment,
					},
				};
			}

			const startTime = Date.now();

			// 并行计算所有指标，使用单独的错误处理
			const [
				trendStrength,
				volatility,
				sevenSegmentLevel,
				volumeFactor,
				marketSentiment,
			] = await Promise.all([
				this.calculateTrendStrengthWithFallback(symbol),
				this.calculateVolatilityWithFallback(symbol, currentPrice),
				this.calculateSevenSegmentLevelWithFallback(symbol, currentPrice),
				this.calculateVolumeFactorWithFallback(symbol),
				this.calculateMarketSentimentWithFallback(symbol),
			]);

			// 计算时间衰减因子（不需要异步）
			const timeDecayFactor = this.calculateTimeDecayFactor(holdingTime);

			const duration = Date.now() - startTime;

			logger.info({
				action: "calculate_all_indicators_complete",
				symbol,
				duration: `${duration}ms`,
				indicators: {
					trendStrength: trendStrength.toFixed(2),
					volatilityNormalized: volatility.normalized,
					sevenSegmentLevel,
					volumeFactor,
					timeDecayFactor: timeDecayFactor.toFixed(2),
					sentiment: marketSentiment.sentiment.toFixed(2),
				},
			});

			// 保存指标到数据库（异步，不阻塞主流程）
			const indicatorsRecord: DynamicIndicatorsRecord = {
				timestamp: Date.now(),
				symbol,
				trendStrength,
				volatilityAtr: volatility.atr,
				volatilityHistorical: volatility.historical,
				sevenSegmentLevel,
				volumeFactor,
				timeDecayFactor,
				marketSentiment: marketSentiment.sentiment,
				rsi: marketSentiment.rsi,
				macd: marketSentiment.macd,
			};

			// 使用 saveWithRetry 确保数据保存的可靠性
			databaseIntegration
				.saveWithRetry(() =>
					databaseIntegration.saveDynamicIndicators(indicatorsRecord),
				)
				.catch((error) => {
					logger.warn({
						action: "save_indicators_async_error",
						symbol,
						error: (error as Error).message,
						message: "异步保存指标失败，不影响主流程",
					});
				});

			// 设置缓存
			dynamicStopLossCache.setIndicators(symbol, indicatorsRecord);

			return {
				trendStrength,
				volatility,
				sevenSegmentLevel,
				volumeFactor,
				timeDecayFactor,
				marketSentiment,
			};
		} catch (error) {
			logger.error({
				action: "calculate_all_indicators_error",
				symbol,
				error: (error as Error).message,
				stack: (error as Error).stack,
				message: "指标计算失败，使用降级处理",
			});

			// 记录错误到监控系统
			const { recordError, triggerAlert } = await import("./monitoring");
			recordError("indicatorCalculation", error as Error);
			triggerAlert("warning", "指标计算失败，使用默认值", {
				symbol,
				error: (error as Error).message,
			});

			// 返回降级的默认指标值
			return this.getDefaultIndicators(symbol, currentPrice, holdingTime);
		}
	}

	// ==================== 降级处理包装方法 ====================

	/**
	 * 趋势强度计算（带降级处理）
	 */
	private async calculateTrendStrengthWithFallback(symbol: string): Promise<number> {
		try {
			return await this.calculateTrendStrength(symbol);
		} catch (error) {
			logger.warn({
				action: "trend_strength_fallback",
				symbol,
				error: (error as Error).message,
				message: "趋势强度计算失败，使用默认值 0",
			});
			return 0; // 中性趋势
		}
	}

	/**
	 * 波动率计算（带降级处理）
	 */
	private async calculateVolatilityWithFallback(symbol: string, currentPrice: number): Promise<VolatilityInfo> {
		try {
			return await this.calculateVolatility(symbol);
		} catch (error) {
			logger.warn({
				action: "volatility_fallback",
				symbol,
				error: (error as Error).message,
				message: "波动率计算失败，使用默认值",
			});
			return {
				atr: currentPrice * 0.02, // 2% ATR
				historical: 0.015, // 1.5% 历史波动率
				normalized: 50, // 中等波动率
			};
		}
	}

	/**
	 * 七分位位置计算（带降级处理）
	 */
	private async calculateSevenSegmentLevelWithFallback(symbol: string, currentPrice: number): Promise<number> {
		try {
			return await this.calculateSevenSegmentLevel(symbol, currentPrice);
		} catch (error) {
			logger.warn({
				action: "seven_segment_fallback",
				symbol,
				error: (error as Error).message,
				message: "七分位位置计算失败，使用默认值 4",
			});
			return 4; // 中间位置
		}
	}

	/**
	 * 成交量因子计算（带降级处理）
	 */
	private async calculateVolumeFactorWithFallback(symbol: string): Promise<number> {
		try {
			return await this.calculateVolumeFactor(symbol);
		} catch (error) {
			logger.warn({
				action: "volume_factor_fallback",
				symbol,
				error: (error as Error).message,
				message: "成交量因子计算失败，使用默认值 50",
			});
			return 50; // 平均成交量
		}
	}

	/**
	 * 市场情绪计算（带降级处理）
	 */
	private async calculateMarketSentimentWithFallback(symbol: string): Promise<MarketSentimentInfo> {
		try {
			return await this.calculateMarketSentiment(symbol);
		} catch (error) {
			logger.warn({
				action: "market_sentiment_fallback",
				symbol,
				error: (error as Error).message,
				message: "市场情绪计算失败，使用默认值",
			});
			return {
				rsi: 50, // 中性RSI
				macd: 0, // 中性MACD
				sentiment: 50, // 中性情绪
			};
		}
	}

	/**
	 * 获取默认指标值（降级处理）
	 * 当指标计算失败时使用安全的默认值
	 *
	 * @param symbol 交易币种
	 * @param currentPrice 当前价格
	 * @param holdingTime 持仓时间（秒）
	 * @returns 默认指标集合
	 */
	private getDefaultIndicators(
		symbol: string,
		currentPrice: number,
		holdingTime: number,
	): DynamicIndicators {
		logger.warn({
			action: "using_default_indicators",
			symbol,
			currentPrice,
			holdingTime,
			message: "使用默认指标值进行降级处理",
		});

		// 计算时间衰减因子（这个计算相对安全）
		let timeDecayFactor = 0.5;
		try {
			timeDecayFactor = this.calculateTimeDecayFactor(holdingTime);
		} catch (error) {
			logger.warn({
				action: "time_decay_calculation_failed",
				error: (error as Error).message,
				message: "时间衰减因子计算失败，使用默认值 0.5",
			});
		}

		// 返回保守的默认值
		const defaultIndicators: DynamicIndicators = {
			trendStrength: 0, // 中性趋势
			volatility: {
				atr: currentPrice * 0.02, // 假设2%的ATR
				historical: 0.015, // 1.5%的历史波动率
				normalized: 50, // 中等波动率
			},
			sevenSegmentLevel: 4, // 中间位置
			volumeFactor: 50, // 平均成交量
			timeDecayFactor,
			marketSentiment: {
				rsi: 50, // 中性RSI
				macd: 0, // 中性MACD
				sentiment: 50, // 中性情绪
			},
		};

		// 尝试从缓存获取历史数据作为参考
		try {
			const cached = dynamicStopLossCache.getIndicators(symbol);
			if (cached) {
				logger.info({
					action: "using_cached_indicators_for_fallback",
					symbol,
					message: "使用缓存数据改善默认值",
				});

				// 使用缓存数据改善默认值，但保持保守
				defaultIndicators.trendStrength = Math.max(-20, Math.min(20, cached.trendStrength * 0.5));
				defaultIndicators.volatility.normalized = Math.max(30, Math.min(70, cached.volatilityHistorical * 100 * 50));
				defaultIndicators.sevenSegmentLevel = cached.sevenSegmentLevel || 4;
				defaultIndicators.volumeFactor = Math.max(30, Math.min(70, cached.volumeFactor * 0.8));
				defaultIndicators.marketSentiment.sentiment = Math.max(30, Math.min(70, cached.marketSentiment * 0.8));
			}
		} catch (cacheError) {
			logger.warn({
				action: "cache_fallback_failed",
				error: (cacheError as Error).message,
				message: "缓存降级也失败，使用纯默认值",
			});
		}

		return defaultIndicators;
	}
}

// ==================== 导出 ====================

/**
 * 创建指标计算器实例
 */
export function createIndicatorCalculator(): IndicatorCalculator {
	return new IndicatorCalculator();
}
