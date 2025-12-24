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
 * 蔡森趋势决策模块
 *
 * 用于峰值回落Level1触发时，判断市场趋势方向：
 * - BULLISH（会涨）：不执行平仓
 * - BEARISH（会大跌）：强制全部平仓（100%）
 * - NEUTRAL（震荡）：按AI填的百分比平仓
 */

import { createLogger } from "../../utils/loggerUtils";
import { getKlineData } from "../systems/monitor";

const logger = createLogger({
	name: "caisen-trend-decision",
	level: "info",
});

/**
 * 趋势方向枚举
 */
export enum TrendDirection {
	BULLISH = "BULLISH", // 会涨
	BEARISH = "BEARISH", // 会大跌
	NEUTRAL = "NEUTRAL", // 震荡/不明确
}

/**
 * 蔡森趋势决策结果
 */
export interface CaiSenTrendDecision {
	trend: TrendDirection; // 趋势方向
	score: number; // 信号强度评分 (0-100)
	indicators: {
		multiTimeframeTrend: number; // 多时间框架趋势得分 (-100 到 100)
		volumeConfirmation: number; // 成交量确认得分 (0-100)
		quantilePosition: number; // 七分位位置得分 (-100 到 100)
		volatilityScore: number; // 波动率得分 (0-100)
	};
	decisionTime: number; // 决策时间戳
	reason: string; // 决策原因说明
}

/**
 * 计算EMA（指数移动平均）
 */
function calculateEMA(prices: number[], period: number): number {
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
 * 分析多时间框架趋势
 * 返回得分：-100（强烈看跌）到 100（强烈看涨）
 */
async function analyzeMultiTimeframeTrend(
	symbol: string,
	side: "long" | "short",
): Promise<{ score: number; details: string[] }> {
	const details: string[] = [];
	let totalScore = 0;
	let validFrames = 0;

	try {
		// 1. 15分钟趋势（权重：20%）
		const klines15m = await getKlineData(symbol, "15m", 20);
		if (klines15m.length >= 10) {
			const prices15m = klines15m.slice(-10).map((k) => k.close);
			const ema10_15m = calculateEMA(prices15m, 10);
			const currentPrice15m = prices15m[prices15m.length - 1];
			const trend15m = currentPrice15m > ema10_15m;
			const deviation15m = ((currentPrice15m - ema10_15m) / ema10_15m) * 100;

			const score15m = trend15m ? 20 : -20;
			totalScore += score15m;
			validFrames++;

			details.push(
				`15分钟: ${trend15m ? "上涨" : "下跌"} (偏离${deviation15m.toFixed(2)}%)`,
			);
		}

		// 2. 1小时趋势（权重：30%）
		const klines1h = await getKlineData(symbol, "1h", 20);
		if (klines1h.length >= 10) {
			const prices1h = klines1h.slice(-10).map((k) => k.close);
			const ema10_1h = calculateEMA(prices1h, 10);
			const currentPrice1h = prices1h[prices1h.length - 1];
			const trend1h = currentPrice1h > ema10_1h;
			const deviation1h = ((currentPrice1h - ema10_1h) / ema10_1h) * 100;

			const score1h = trend1h ? 30 : -30;
			totalScore += score1h;
			validFrames++;

			details.push(
				`1小时: ${trend1h ? "上涨" : "下跌"} (偏离${deviation1h.toFixed(2)}%)`,
			);
		}

		// 3. 4小时趋势（权重：50%）
		const klines4h = await getKlineData(symbol, "4h", 20);
		if (klines4h.length >= 10) {
			const prices4h = klines4h.slice(-10).map((k) => k.close);
			const ema10_4h = calculateEMA(prices4h, 10);
			const currentPrice4h = prices4h[prices4h.length - 1];
			const trend4h = currentPrice4h > ema10_4h;
			const deviation4h = ((currentPrice4h - ema10_4h) / ema10_4h) * 100;

			const score4h = trend4h ? 50 : -50;
			totalScore += score4h;
			validFrames++;

			details.push(
				`4小时: ${trend4h ? "上涨" : "下跌"} (偏离${deviation4h.toFixed(2)}%)`,
			);
		}

		if (validFrames === 0) {
			return { score: 0, details: ["无法获取K线数据"] };
		}

		return { score: totalScore, details };
	} catch (error) {
		logger.error({
			action: "analyze_multi_timeframe_trend_error",
			symbol,
			error: (error as Error).message,
		});
		return { score: 0, details: ["分析失败"] };
	}
}

/**
 * 分析成交量确认
 * 返回得分：0-100
 */
async function analyzeVolumeConfirmation(
	symbol: string,
): Promise<{ score: number; details: string[] }> {
	const details: string[] = [];

	try {
		const klines = await getKlineData(symbol, "5m", 20);
		if (klines.length < 10) {
			return { score: 50, details: ["数据不足"] };
		}

		const volumes = klines.slice(-10).map((k) => k.volume);
		const recentVolume = volumes.slice(-3).reduce((sum, v) => sum + v, 0) / 3;
		const previousVolume =
			volumes.slice(-10, -3).reduce((sum, v) => sum + v, 0) / 7;
		const volumeRatio = recentVolume / previousVolume;

		let score = 50; // 基础分
		if (volumeRatio > 1.5) {
			score = 90; // 成交量大幅放大
			details.push(`成交量大幅放大${((volumeRatio - 1) * 100).toFixed(0)}%`);
		} else if (volumeRatio > 1.2) {
			score = 70; // 成交量放大
			details.push(`成交量放大${((volumeRatio - 1) * 100).toFixed(0)}%`);
		} else if (volumeRatio < 0.8) {
			score = 30; // 成交量萎缩
			details.push(`成交量萎缩${((1 - volumeRatio) * 100).toFixed(0)}%`);
		} else {
			details.push("成交量正常");
		}

		return { score, details };
	} catch (error) {
		logger.error({
			action: "analyze_volume_confirmation_error",
			symbol,
			error: (error as Error).message,
		});
		return { score: 50, details: ["分析失败"] };
	}
}

/**
 * 分析七分位位置
 * 返回得分：-100（高位）到 100（低位）
 */
async function analyzeQuantilePosition(
	symbol: string,
): Promise<{ score: number; details: string[] }> {
	const details: string[] = [];

	try {
		const klines = await getKlineData(symbol, "1h", 168); // 7天数据
		if (klines.length < 50) {
			return { score: 0, details: ["数据不足"] };
		}

		const prices = klines.map((k) => k.close);
		const currentPrice = prices[prices.length - 1];

		// 计算七分位
		const sortedPrices = [...prices].sort((a, b) => a - b);
		const q1 = sortedPrices[Math.floor(sortedPrices.length * (1 / 7))];
		const q2 = sortedPrices[Math.floor(sortedPrices.length * (2 / 7))];
		const q3 = sortedPrices[Math.floor(sortedPrices.length * (3 / 7))];
		const q4 = sortedPrices[Math.floor(sortedPrices.length * (4 / 7))];
		const q5 = sortedPrices[Math.floor(sortedPrices.length * (5 / 7))];
		const q6 = sortedPrices[Math.floor(sortedPrices.length * (6 / 7))];

		let score = 0;
		let position = "";

		if (currentPrice <= q1) {
			score = 100; // 极低位，强烈看涨
			position = "1/7区域（极低位）";
		} else if (currentPrice <= q2) {
			score = 70; // 低位，看涨
			position = "2/7区域（低位）";
		} else if (currentPrice <= q3) {
			score = 40; // 偏低，偏看涨
			position = "3/7区域（偏低）";
		} else if (currentPrice <= q4) {
			score = 0; // 中位，中性
			position = "4/7区域（中位）";
		} else if (currentPrice <= q5) {
			score = -40; // 偏高，偏看跌
			position = "5/7区域（偏高）";
		} else if (currentPrice <= q6) {
			score = -70; // 高位，看跌
			position = "6/7区域（高位）";
		} else {
			score = -100; // 极高位，强烈看跌
			position = "7/7区域（极高位）";
		}

		details.push(position);
		return { score, details };
	} catch (error) {
		logger.error({
			action: "analyze_quantile_position_error",
			symbol,
			error: (error as Error).message,
		});
		return { score: 0, details: ["分析失败"] };
	}
}

/**
 * 分析波动率
 * 返回得分：0-100（波动率越高，得分越高）
 */
async function analyzeVolatility(
	symbol: string,
): Promise<{ score: number; details: string[] }> {
	const details: string[] = [];

	try {
		const klines = await getKlineData(symbol, "5m", 20);
		if (klines.length < 10) {
			return { score: 50, details: ["数据不足"] };
		}

		const prices = klines.slice(-10).map((k) => k.close);
		const priceChanges = prices
			.slice(1)
			.map((p, i) => Math.abs(p - prices[i]) / prices[i]);
		const avgVolatility =
			priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length;

		let score = 50;
		if (avgVolatility > 0.01) {
			// 波动率 > 1%
			score = 90;
			details.push(`高波动率${(avgVolatility * 100).toFixed(2)}%`);
		} else if (avgVolatility > 0.005) {
			// 波动率 > 0.5%
			score = 70;
			details.push(`中等波动率${(avgVolatility * 100).toFixed(2)}%`);
		} else {
			score = 30;
			details.push(`低波动率${(avgVolatility * 100).toFixed(2)}%`);
		}

		return { score, details };
	} catch (error) {
		logger.error({
			action: "analyze_volatility_error",
			symbol,
			error: (error as Error).message,
		});
		return { score: 50, details: ["分析失败"] };
	}
}

/**
 * 获取蔡森趋势决策
 *
 * @param symbol 交易币种
 * @param side 持仓方向
 * @returns 趋势决策结果
 */
export async function getCaiSenTrendDecision(
	symbol: string,
	side: "long" | "short",
): Promise<CaiSenTrendDecision> {
	const startTime = Date.now();

	logger.info({
		action: "caisen_trend_decision_start",
		symbol,
		side,
		message: "开始蔡森趋势决策分析",
	});

	try {
		// 1. 多时间框架趋势分析
		const multiTimeframeTrend = await analyzeMultiTimeframeTrend(symbol, side);

		// 2. 成交量确认
		const volumeConfirmation = await analyzeVolumeConfirmation(symbol);

		// 3. 七分位位置分析
		const quantilePosition = await analyzeQuantilePosition(symbol);

		// 4. 波动率分析
		const volatilityScore = await analyzeVolatility(symbol);

		// 5. 综合评分计算
		// 多时间框架趋势权重：40%
		// 七分位位置权重：30%
		// 成交量确认权重：20%
		// 波动率权重：10%
		const trendScore =
			multiTimeframeTrend.score * 0.4 +
			quantilePosition.score * 0.3 +
			(volumeConfirmation.score - 50) * 0.4 + // 归一化到-20到20
			(volatilityScore.score - 50) * 0.2; // 归一化到-10到10

		// 归一化到0-100
		const finalScore = ((trendScore + 100) / 200) * 100;

		// 6. 判断趋势方向
		let trend: TrendDirection;
		let reason: string;

		// 🎯 关键判断逻辑
		if (finalScore >= 70 && multiTimeframeTrend.score > 50) {
			// 强烈看涨：综合得分>=70 且 多时间框架趋势向上
			trend = TrendDirection.BULLISH;
			reason = `多时间框架趋势向上，综合评分${finalScore.toFixed(0)}分，判断会涨`;
		} else if (finalScore <= 30 && multiTimeframeTrend.score < -50) {
			// 强烈看跌：综合得分<=30 且 多时间框架趋势向下
			trend = TrendDirection.BEARISH;
			reason = `多时间框架趋势向下，综合评分${finalScore.toFixed(0)}分，判断会大跌`;
		} else {
			// 震荡或不明确
			trend = TrendDirection.NEUTRAL;
			reason = `趋势不明确或震荡，综合评分${finalScore.toFixed(0)}分`;
		}

		const decision: CaiSenTrendDecision = {
			trend,
			score: finalScore,
			indicators: {
				multiTimeframeTrend: multiTimeframeTrend.score,
				volumeConfirmation: volumeConfirmation.score,
				quantilePosition: quantilePosition.score,
				volatilityScore: volatilityScore.score,
			},
			decisionTime: Date.now(),
			reason,
		};

		const duration = Date.now() - startTime;

		logger.info({
			action: "caisen_trend_decision_complete",
			symbol,
			side,
			trend,
			score: finalScore.toFixed(1),
			duration: `${duration}ms`,
			details: {
				multiTimeframe: multiTimeframeTrend.details.join("; "),
				volume: volumeConfirmation.details.join("; "),
				quantile: quantilePosition.details.join("; "),
				volatility: volatilityScore.details.join("; "),
			},
			message: reason,
		});

		return decision;
	} catch (error) {
		logger.error({
			action: "caisen_trend_decision_error",
			symbol,
			side,
			error: (error as Error).message,
			stack: (error as Error).stack,
		});

		// 返回中性决策
		return {
			trend: TrendDirection.NEUTRAL,
			score: 50,
			indicators: {
				multiTimeframeTrend: 0,
				volumeConfirmation: 50,
				quantilePosition: 0,
				volatilityScore: 50,
			},
			decisionTime: Date.now(),
			reason: "分析失败，返回中性决策",
		};
	}
}
