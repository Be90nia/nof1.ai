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
 * 市场数据工具
 */
import { createTool } from "@voltagent/core";
import { z } from "zod";
import { RISK_PARAMS } from "../../config/riskParams";
import { createExchangeClient } from "../../services/exchangeClient";

/**
 * 确保数值是有效的有限数字，否则返回默认值
 */
function ensureFinite(value: number, defaultValue = 0): number {
	if (!Number.isFinite(value)) {
		return defaultValue;
	}
	return value;
}

/**
 * 确保数值在指定范围内
 */
function ensureRange(
	value: number,
	min: number,
	max: number,
	defaultValue?: number,
): number {
	if (!Number.isFinite(value)) {
		return defaultValue !== undefined ? defaultValue : (min + max) / 2;
	}
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

// 计算 EMA
function calculateEMA(prices: number[], period: number) {
	if (!prices || prices.length === 0) return 0;
	const k = 2 / (period + 1);
	let ema = prices[0];
	for (let i = 1; i < prices.length; i++) {
		ema = prices[i] * k + ema * (1 - k);
	}
	return Number.isFinite(ema) ? ema : 0;
}

// 计算 RSI
function calculateRSI(prices: number[], period: number) {
	if (!prices || prices.length < period + 1) return 50; // 数据不足，返回中性值

	let gains = 0;
	let losses = 0;

	for (let i = prices.length - period; i < prices.length; i++) {
		if (i === 0) continue; // 跳过第一个元素，避免访问 prices[-1]
		const change = prices[i] - prices[i - 1];
		if (change > 0) gains += change;
		else losses -= change;
	}

	const avgGain = gains / period;
	const avgLoss = losses / period;

	if (avgLoss === 0) return avgGain > 0 ? 100 : 50;

	const rs = avgGain / avgLoss;
	const rsi = 100 - 100 / (1 + rs);

	// 确保RSI在0-100范围内
	return ensureRange(rsi, 0, 100, 50);
}

// 计算 MACD
function calculateMACD(prices: number[]) {
	if (!prices || prices.length < 26) return 0; // 数据不足
	const ema12 = calculateEMA(prices, 12);
	const ema26 = calculateEMA(prices, 26);
	const macd = ema12 - ema26;
	return Number.isFinite(macd) ? macd : 0;
}

// 计算 ATR
function calculateATR(candles: any[], period: number) {
	if (!candles || candles.length < 2) return 0;

	const trs = [];
	for (let i = 1; i < candles.length; i++) {
		let high: number;
		let low: number;
		let prevClose: number;

		// 处理对象格式（FuturesCandlestick）
		if (candles[i] && typeof candles[i] === "object" && "h" in candles[i]) {
			high = Number.parseFloat(candles[i].h);
			low = Number.parseFloat(candles[i].l);
			prevClose = Number.parseFloat(candles[i - 1].c);
		}
		// 处理数组格式（兼容旧代码）
		else if (Array.isArray(candles[i])) {
			high = Number.parseFloat(candles[i][2]);
			low = Number.parseFloat(candles[i][3]);
			prevClose = Number.parseFloat(candles[i - 1][4]);
		} else {
			continue;
		}

		if (
			Number.isFinite(high) &&
			Number.isFinite(low) &&
			Number.isFinite(prevClose)
		) {
			const tr = Math.max(
				high - low,
				Math.abs(high - prevClose),
				Math.abs(low - prevClose),
			);
			trs.push(tr);
		}
	}

	if (trs.length === 0) return 0;
	return (
		trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length)
	);
}

// 计算 Bollinger Bands
function calculateBollingerBands(
	candles: any[],
	period: number,
	stdDev: number,
) {
	if (!candles || candles.length < period)
		return { upper: 0, middle: 0, lower: 0 };

	const closes = candles
		.map((c) => {
			if (c && typeof c === "object" && "c" in c) {
				return Number.parseFloat(c.c);
			}
			if (Array.isArray(c)) {
				return Number.parseFloat(c[4]);
			}
			return Number.NaN;
		})
		.filter((n) => Number.isFinite(n));

	if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };

	const recentCloses = closes.slice(-period);
	const middle = recentCloses.reduce((a, b) => a + b, 0) / period;

	const variance =
		recentCloses.reduce((sum, price) => sum + (price - middle) ** 2, 0) /
		period;
	const std = Math.sqrt(variance);

	return {
		upper: middle + stdDev * std,
		middle,
		lower: middle - stdDev * std,
	};
}

// 计算 MFI（资金流量指标）
function calculateMFI(candles: any[], period: number) {
	if (!candles || candles.length < period) return 50;

	const typicalPrices = [];
	const moneyFlows = [];

	for (let i = 0; i < candles.length; i++) {
		let high: number;
		let low: number;
		let close: number;
		let volume: number;

		if (candles[i] && typeof candles[i] === "object") {
			high = Number.parseFloat(candles[i].h);
			low = Number.parseFloat(candles[i].l);
			close = Number.parseFloat(candles[i].c);
			volume = Number.parseFloat(candles[i].v);
		} else if (Array.isArray(candles[i])) {
			high = Number.parseFloat(candles[i][2]);
			low = Number.parseFloat(candles[i][3]);
			close = Number.parseFloat(candles[i][4]);
			volume = Number.parseFloat(candles[i][5]);
		} else {
			continue;
		}

		if (
			Number.isFinite(high) &&
			Number.isFinite(low) &&
			Number.isFinite(close) &&
			Number.isFinite(volume)
		) {
			const typicalPrice = (high + low + close) / 3;
			const moneyFlow = typicalPrice * volume;
			typicalPrices.push(typicalPrice);
			moneyFlows.push(moneyFlow);
		}
	}

	if (typicalPrices.length < period) return 50;

	let positiveMoneyFlow = 0;
	let negativeMoneyFlow = 0;

	for (
		let i = typicalPrices.length - period + 1;
		i < typicalPrices.length;
		i++
	) {
		if (typicalPrices[i] > typicalPrices[i - 1]) {
			positiveMoneyFlow += moneyFlows[i];
		} else if (typicalPrices[i] < typicalPrices[i - 1]) {
			negativeMoneyFlow += moneyFlows[i];
		}
	}

	if (negativeMoneyFlow === 0) return 100;
	if (positiveMoneyFlow === 0) return 0;

	const moneyRatio = positiveMoneyFlow / negativeMoneyFlow;
	const mfi = 100 - 100 / (1 + moneyRatio);

	return ensureRange(mfi, 0, 100, 50);
}

// 计算 Stochastic Oscillator
function calculateStochastic(candles: any[], kPeriod: number, dPeriod: number) {
	if (!candles || candles.length < kPeriod + dPeriod - 1)
		return { k: 50, d: 50 };

	const stochasticValues = [];

	for (let i = kPeriod - 1; i < candles.length; i++) {
		const periodCandles = candles.slice(i - kPeriod + 1, i + 1);
		let highestHigh = Number.NEGATIVE_INFINITY;
		let lowestLow = Number.POSITIVE_INFINITY;

		for (const candle of periodCandles) {
			let high: number;
			let low: number;
			let close: number;

			if (candle && typeof candle === "object") {
				high = Number.parseFloat(candle.h);
				low = Number.parseFloat(candle.l);
				close = Number.parseFloat(candle.c);
			} else if (Array.isArray(candle)) {
				high = Number.parseFloat(candle[2]);
				low = Number.parseFloat(candle[3]);
				close = Number.parseFloat(candle[4]);
			} else {
				continue;
			}

			if (Number.isFinite(high) && high > highestHigh) highestHigh = high;
			if (Number.isFinite(low) && low < lowestLow) lowestLow = low;
		}

		if (
			highestHigh === Number.NEGATIVE_INFINITY ||
			lowestLow === Number.POSITIVE_INFINITY
		) {
			stochasticValues.push(50);
			continue;
		}

		let closePrice: number;
		const currentCandle = candles[i];
		if (
			currentCandle &&
			typeof currentCandle === "object" &&
			"c" in currentCandle
		) {
			closePrice = Number.parseFloat(currentCandle.c);
		} else if (Array.isArray(currentCandle)) {
			closePrice = Number.parseFloat(currentCandle[4]);
		} else {
			stochasticValues.push(50);
			continue;
		}

		if (!Number.isFinite(closePrice)) {
			stochasticValues.push(50);
			continue;
		}

		if (highestHigh === lowestLow) {
			stochasticValues.push(50);
			continue;
		}

		const kValue = ((closePrice - lowestLow) / (highestHigh - lowestLow)) * 100;
		stochasticValues.push(kValue);
	}

	if (stochasticValues.length < dPeriod) return { k: 50, d: 50 };

	const k = ensureRange(stochasticValues.at(-1) || 50, 0, 100, 50);
	const d = ensureRange(
		stochasticValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod,
		0,
		100,
		50,
	);

	return { k, d };
}

// 计算 ADX（平均趋向指数）
function calculateADX(candles: any[], period: number) {
	if (!candles || candles.length < period + 2) return 0;

	const plusDM = [];
	const minusDM = [];
	const trs = [];

	for (let i = 1; i < candles.length; i++) {
		let high: number;
		let low: number;
		let prevHigh: number;
		let prevLow: number;
		let prevClose: number;

		if (
			candles[i] &&
			typeof candles[i] === "object" &&
			candles[i - 1] &&
			typeof candles[i - 1] === "object"
		) {
			high = Number.parseFloat(candles[i].h);
			low = Number.parseFloat(candles[i].l);
			prevHigh = Number.parseFloat(candles[i - 1].h);
			prevLow = Number.parseFloat(candles[i - 1].l);
			prevClose = Number.parseFloat(candles[i - 1].c);
		} else if (Array.isArray(candles[i]) && Array.isArray(candles[i - 1])) {
			high = Number.parseFloat(candles[i][2]);
			low = Number.parseFloat(candles[i][3]);
			prevHigh = Number.parseFloat(candles[i - 1][2]);
			prevLow = Number.parseFloat(candles[i - 1][3]);
			prevClose = Number.parseFloat(candles[i - 1][4]);
		} else {
			continue;
		}

		if (
			Number.isFinite(high) &&
			Number.isFinite(low) &&
			Number.isFinite(prevHigh) &&
			Number.isFinite(prevLow) &&
			Number.isFinite(prevClose)
		) {
			// 计算 TR
			const tr = Math.max(
				high - low,
				Math.abs(high - prevClose),
				Math.abs(low - prevClose),
			);
			trs.push(tr);

			// 计算 +DM 和 -DM
			const upMove = high - prevHigh;
			const downMove = prevLow - low;

			if (upMove > downMove && upMove > 0) {
				plusDM.push(upMove);
				minusDM.push(0);
			} else if (downMove > upMove && downMove > 0) {
				minusDM.push(downMove);
				plusDM.push(0);
			} else {
				plusDM.push(0);
				minusDM.push(0);
			}
		}
	}

	if (trs.length < period || plusDM.length < period || minusDM.length < period)
		return 0;

	// 计算 SMA
	function calculateSMA(data: number[], period: number) {
		if (data.length < period) return 0;
		return data.slice(-period).reduce((a, b) => a + b, 0) / period;
	}

	// 计算第一个 SMA
	const firstSMA_TR = calculateSMA(trs, period);
	const firstSMA_plusDM = calculateSMA(plusDM, period);
	const firstSMA_minusDM = calculateSMA(minusDM, period);

	// 计算后续的 EMA
	let ema_TR = firstSMA_TR;
	let ema_plusDM = firstSMA_plusDM;
	let ema_minusDM = firstSMA_minusDM;

	const multiplier = 2 / (period + 1);

	for (let i = period; i < trs.length; i++) {
		ema_TR = (trs[i] - ema_TR) * multiplier + ema_TR;
		ema_plusDM = (plusDM[i] - ema_plusDM) * multiplier + ema_plusDM;
		ema_minusDM = (minusDM[i] - ema_minusDM) * multiplier + ema_minusDM;
	}

	// 计算 +DI 和 -DI
	const plusDI = (ema_plusDM / ema_TR) * 100;
	const minusDI = (ema_minusDM / ema_TR) * 100;

	// 计算 DX
	const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

	// 计算 ADX
	const adx = Number.isFinite(dx) ? dx : 0;
	return ensureRange(adx, 0, 100, 0);
}

// 计算 OBV（能量潮）
function calculateOBV(candles: any[]) {
	if (!candles || candles.length === 0) return 0;

	let obv = 0;

	for (let i = 1; i < candles.length; i++) {
		let currentClose: number;
		let prevClose: number;
		let volume: number;

		if (
			candles[i] &&
			typeof candles[i] === "object" &&
			candles[i - 1] &&
			typeof candles[i - 1] === "object"
		) {
			currentClose = Number.parseFloat(candles[i].c);
			prevClose = Number.parseFloat(candles[i - 1].c);
			volume = Number.parseFloat(candles[i].v);
		} else if (Array.isArray(candles[i]) && Array.isArray(candles[i - 1])) {
			currentClose = Number.parseFloat(candles[i][4]);
			prevClose = Number.parseFloat(candles[i - 1][4]);
			volume = Number.parseFloat(candles[i][5]);
		} else {
			continue;
		}

		if (
			Number.isFinite(currentClose) &&
			Number.isFinite(prevClose) &&
			Number.isFinite(volume)
		) {
			if (currentClose > prevClose) {
				obv += volume;
			} else if (currentClose < prevClose) {
				obv -= volume;
			}
		}
	}

	return ensureFinite(obv);
}

// 计算 VWAP（成交量加权平均价格）
function calculateVWAP(candles: any[]) {
	if (!candles || candles.length === 0) return 0;

	let cumulativeTPV = 0;
	let cumulativeVolume = 0;

	for (const candle of candles) {
		let high: number;
		let low: number;
		let close: number;
		let volume: number;

		if (candle && typeof candle === "object") {
			high = Number.parseFloat(candle.h);
			low = Number.parseFloat(candle.l);
			close = Number.parseFloat(candle.c);
			volume = Number.parseFloat(candle.v);
		} else if (Array.isArray(candle)) {
			high = Number.parseFloat(candle[2]);
			low = Number.parseFloat(candle[3]);
			close = Number.parseFloat(candle[4]);
			volume = Number.parseFloat(candle[5]);
		} else {
			continue;
		}

		if (
			Number.isFinite(high) &&
			Number.isFinite(low) &&
			Number.isFinite(close) &&
			Number.isFinite(volume)
		) {
			const typicalPrice = (high + low + close) / 3;
			cumulativeTPV += typicalPrice * volume;
			cumulativeVolume += volume;
		}
	}

	if (cumulativeVolume === 0) return 0;
	return cumulativeTPV / cumulativeVolume;
}

/**
 * 计算技术指标
 *
 * K线数据格式：FuturesCandlestick 对象
 * {
 *   t: number,    // 时间戳
 *   v: number,    // 成交量
 *   c: string,    // 收盘价
 *   h: string,    // 最高价
 *   l: string,    // 最低价
 *   o: string,    // 开盘价
 *   sum: string   // 总成交额
 * }
 */
export function calculateIndicators(candles: any[]) {
	if (!candles || candles.length === 0) {
		return {
			currentPrice: 0,
			ema20: 0,
			ema50: 0,
			macd: 0,
			rsi7: 50,
			rsi14: 50,
			volume: 0,
			avgVolume: 0,
			atr3: 0,
			atr14: 0,
			bollingerUpper: 0,
			bollingerMiddle: 0,
			bollingerLower: 0,
			mfi: 50,
			stochasticK: 50,
			stochasticD: 50,
			adx: 0,
			obv: 0,
			vwap: 0,
			volumeRatio: 1,
		};
	}

	// 处理对象格式的K线数据（Gate.io API返回的是对象，不是数组）
	const closes = candles
		.map((c) => {
			// 如果是对象格式（FuturesCandlestick）
			if (c && typeof c === "object" && "c" in c) {
				return Number.parseFloat(c.c);
			}
			// 如果是数组格式（兼容旧代码）
			if (Array.isArray(c)) {
				return Number.parseFloat(c[4]);
			}
			return Number.NaN;
		})
		.filter((n) => Number.isFinite(n));

	const volumes = candles
		.map((c) => {
			// 如果是对象格式（FuturesCandlestick）
			if (c && typeof c === "object" && "v" in c) {
				const vol = Number.parseFloat(c.v);
				// 验证成交量：必须是有限数字且非负
				return Number.isFinite(vol) && vol >= 0 ? vol : 0;
			}
			// 如果是数组格式（兼容旧代码）
			if (Array.isArray(c)) {
				const vol = Number.parseFloat(c[5]);
				return Number.isFinite(vol) && vol >= 0 ? vol : 0;
			}
			return 0;
		})
		.filter((n) => n >= 0); // 过滤掉负数成交量

	if (closes.length === 0 || volumes.length === 0) {
		return {
			currentPrice: 0,
			ema20: 0,
			ema50: 0,
			macd: 0,
			rsi7: 50,
			rsi14: 50,
			volume: 0,
			avgVolume: 0,
			atr3: 0,
			atr14: 0,
			bollingerUpper: 0,
			bollingerMiddle: 0,
			bollingerLower: 0,
			mfi: 50,
			stochasticK: 50,
			stochasticD: 50,
			adx: 0,
			obv: 0,
			vwap: 0,
			volumeRatio: 1,
		};
	}

	// 计算新增的技术指标
	const bollinger = calculateBollingerBands(candles, 20, 2);
	const mfi = calculateMFI(candles, 14);
	const stochastic = calculateStochastic(candles, 14, 3);
	const adx = calculateADX(candles, 14);
	const obv = calculateOBV(candles);
	const vwap = calculateVWAP(candles);

	return {
		currentPrice: ensureFinite(closes.at(-1) || 0),
		ema20: ensureFinite(calculateEMA(closes, 20)),
		ema50: ensureFinite(calculateEMA(closes, 50)),
		macd: ensureFinite(calculateMACD(closes)),
		rsi7: ensureRange(calculateRSI(closes, 7), 0, 100, 50),
		rsi14: ensureRange(calculateRSI(closes, 14), 0, 100, 50),
		volume: ensureFinite(volumes.at(-1) || 0),
		avgVolume: ensureFinite(
			volumes.length > 0
				? volumes.reduce((a, b) => a + b, 0) / volumes.length
				: 0,
		),
		atr3: ensureFinite(calculateATR(candles, 3)),
		atr14: ensureFinite(calculateATR(candles, 14)),
		bollingerUpper: ensureFinite(bollinger.upper),
		bollingerMiddle: ensureFinite(bollinger.middle),
		bollingerLower: ensureFinite(bollinger.lower),
		mfi: ensureRange(mfi, 0, 100, 50),
		stochasticK: ensureRange(stochastic.k, 0, 100, 50),
		stochasticD: ensureRange(stochastic.d, 0, 100, 50),
		adx: ensureRange(adx, 0, 100, 0),
		obv: ensureFinite(obv),
		vwap: ensureFinite(vwap),
		volumeRatio: ensureFinite(
			volumes.length > 0 &&
				volumes.reduce((a, b) => a + b, 0) / volumes.length > 0
				? (volumes.at(-1) || 0) /
						(volumes.reduce((a, b) => a + b, 0) / volumes.length)
				: 1,
		),
	};
}

/**
 * 获取市场价格工具
 */
export const getMarketPriceTool = createTool({
	name: "getMarketPrice",
	description: "获取指定币种的实时市场价格",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
	}),
	execute: async ({ symbol }) => {
		const client = createExchangeClient();
		const contract = `${symbol}_USDT`;

		const ticker = await client.getFuturesTicker(contract);

		return {
			symbol,
			contract,
			lastPrice: Number.parseFloat(ticker.last || "0"),
			markPrice: Number.parseFloat(ticker.markPrice || "0"),
			indexPrice: Number.parseFloat(ticker.indexPrice || "0"),
			highPrice24h: Number.parseFloat(ticker.high24h || "0"),
			lowPrice24h: Number.parseFloat(ticker.low24h || "0"),
			volume24h: Number.parseFloat(ticker.volume24h || "0"),
			change24h: Number.parseFloat(ticker.changePercentage || "0"),
		};
	},
});

/**
 * 获取技术指标工具
 */
export const getTechnicalIndicatorsTool = createTool({
	name: "getTechnicalIndicators",
	description: "获取指定币种的技术指标（EMA、MACD、RSI等）",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
		interval: z
			.enum(["1m", "3m", "5m", "15m", "30m", "1h", "4h"])
			.default("5m")
			.describe("K线周期"),
		limit: z.number().default(100).describe("K线数量"),
	}),
	execute: async ({ symbol, interval, limit }) => {
		const client = createExchangeClient();
		const contract = `${symbol}_USDT`;

		const candles = await client.getFuturesCandles(contract, interval, limit);
		const indicators = calculateIndicators(candles);

		return {
			symbol,
			interval,
			...indicators,
			timestamp: new Date().toISOString(),
		};
	},
});

/**
 * 获取资金费率工具
 */
export const getFundingRateTool = createTool({
	name: "getFundingRate",
	description: "获取指定币种的资金费率",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
	}),
	execute: async ({ symbol }) => {
		const client = createExchangeClient();
		const contract = `${symbol}_USDT`;

		const fundingRate = await client.getFundingRate(contract);

		return {
			symbol,
			fundingRate: Number.parseFloat(fundingRate.r || "0"),
			fundingTime: fundingRate.t,
			timestamp: new Date().toISOString(),
		};
	},
});

/**
 * 获取订单簿深度工具
 */
export const getOrderBookTool = createTool({
	name: "getOrderBook",
	description: "获取指定币种的订单簿深度数据",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
		limit: z.number().default(10).describe("深度档位数量"),
	}),
	execute: async ({ symbol, limit }) => {
		const client = createExchangeClient();
		const contract = `${symbol}_USDT`;

		const orderBook = await client.getOrderBook(contract, limit);

		const bids =
			orderBook.bids?.slice(0, limit).map((b: any) => ({
				price: Number.parseFloat(b.p),
				size: Number.parseFloat(b.s),
			})) || [];

		const asks =
			orderBook.asks?.slice(0, limit).map((a: any) => ({
				price: Number.parseFloat(a.p),
				size: Number.parseFloat(a.s),
			})) || [];

		return {
			symbol,
			bids,
			asks,
			spread: asks[0]?.price - bids[0]?.price || 0,
			timestamp: new Date().toISOString(),
		};
	},
});

/**
 * 获取合约持仓量工具
 */
export const getOpenInterestTool = createTool({
	name: "getOpenInterest",
	description: "获取指定币种的合约持仓量",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
	}),
	execute: async ({ symbol }) => {
		// Gate API 需要通过其他方式获取持仓量数据
		// 暂时返回 0，后续可以通过其他端点获取
		return {
			symbol,
			openInterest: 0,
			timestamp: new Date().toISOString(),
		};
	},
});

/**
 * 获取市场恐惧贪婪指数工具
 */
export const getFearAndGreedIndexTool = createTool({
	name: "getFearAndGreedIndex",
	description: "获取指定币种的市场恐惧贪婪指数",
	parameters: z.object({
		symbol: z.enum(RISK_PARAMS.TRADING_SYMBOLS).describe("币种代码"),
	}),
	execute: async ({ symbol }) => {
		const client = createExchangeClient();
		const fearGreedIndex = await client.getFearAndGreedIndex(symbol);

		return {
			symbol,
			...fearGreedIndex,
			timestamp: new Date().toISOString(),
		};
	},
});
