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
 * 动态止损优化系统 - 缓存管理模块
 *
 * 实现指标缓存、蔡森分析缓存和追踪止损状态缓存
 * 使用 TTL（生存时间）管理缓存有效期
 */

import { createLogger } from "../loggerUtils";
import type {
	CacheItem,
	CaisenStrategyResultRecord,
	DynamicIndicatorsRecord,
	TrailingStopState,
} from "./types";

const logger = createLogger({
	name: "dynamic-stop-loss-cache",
	level: "debug",
});

/**
 * 动态止损缓存管理类
 * 管理指标缓存、蔡森分析缓存和追踪止损状态缓存
 */
export class DynamicStopLossCache {
	/** 指标缓存：symbol -> 指标数据 */
	private indicators: Map<string, CacheItem<DynamicIndicatorsRecord>>;

	/** 蔡森分析缓存：symbol -> 分析结果 */
	private caisenAnalysis: Map<string, CacheItem<CaisenStrategyResultRecord>>;

	/** 追踪止损状态：symbol -> 追踪状态 */
	private trailingStopState: Map<string, TrailingStopState>;

	/** 默认 TTL 配置（毫秒） */
	private defaultTTL: {
		indicators: number;
		caisenAnalysis: number;
	};

	constructor(config?: {
		indicatorsTTL?: number;
		caisenAnalysisTTL?: number;
	}) {
		this.indicators = new Map();
		this.caisenAnalysis = new Map();
		this.trailingStopState = new Map();

		this.defaultTTL = {
			indicators: config?.indicatorsTTL || 10000, // 默认 10 秒
			caisenAnalysis: config?.caisenAnalysisTTL || 300000, // 默认 5 分钟
		};

		logger.info({
			action: "cache_initialized",
			indicatorsTTL: this.defaultTTL.indicators,
			caisenAnalysisTTL: this.defaultTTL.caisenAnalysis,
			message: "缓存管理器初始化完成",
		});
	}

	// ==================== 指标缓存管理 ====================

	/**
	 * 获取指标缓存
	 * @param symbol 交易币种
	 * @returns 缓存的指标数据，如果不存在或已过期则返回 null
	 */
	getIndicators(symbol: string): DynamicIndicatorsRecord | null {
		const cached = this.indicators.get(symbol);

		if (!cached) {
			logger.debug({
				action: "cache_miss",
				type: "indicators",
				symbol,
				message: "指标缓存未命中",
			});
			return null;
		}

		// 检查是否过期
		const now = Date.now();
		if (now - cached.timestamp > cached.ttl) {
			logger.debug({
				action: "cache_expired",
				type: "indicators",
				symbol,
				age: now - cached.timestamp,
				ttl: cached.ttl,
				message: "指标缓存已过期",
			});
			this.indicators.delete(symbol);
			return null;
		}

		logger.debug({
			action: "cache_hit",
			type: "indicators",
			symbol,
			age: now - cached.timestamp,
			message: "指标缓存命中",
		});

		return cached.data;
	}

	/**
	 * 设置指标缓存
	 * @param symbol 交易币种
	 * @param data 指标数据
	 * @param ttl 生存时间（毫秒），可选，默认使用配置的 TTL
	 */
	setIndicators(
		symbol: string,
		data: DynamicIndicatorsRecord,
		ttl?: number,
	): void {
		const cacheItem: CacheItem<DynamicIndicatorsRecord> = {
			data,
			timestamp: Date.now(),
			ttl: ttl || this.defaultTTL.indicators,
		};

		this.indicators.set(symbol, cacheItem);

		logger.debug({
			action: "cache_set",
			type: "indicators",
			symbol,
			ttl: cacheItem.ttl,
			message: "指标缓存已设置",
		});
	}

	/**
	 * 清除指标缓存
	 * @param symbol 交易币种，如果不提供则清除所有
	 */
	clearIndicators(symbol?: string): void {
		if (symbol) {
			this.indicators.delete(symbol);
			logger.debug({
				action: "cache_clear",
				type: "indicators",
				symbol,
				message: "指标缓存已清除",
			});
		} else {
			this.indicators.clear();
			logger.debug({
				action: "cache_clear_all",
				type: "indicators",
				message: "所有指标缓存已清除",
			});
		}
	}

	// ==================== 蔡森分析缓存管理 ====================

	/**
	 * 获取蔡森分析缓存
	 * @param symbol 交易币种
	 * @returns 缓存的分析结果，如果不存在或已过期则返回 null
	 */
	getCaisenAnalysis(symbol: string): CaisenStrategyResultRecord | null {
		const cached = this.caisenAnalysis.get(symbol);

		if (!cached) {
			logger.debug({
				action: "cache_miss",
				type: "caisen_analysis",
				symbol,
				message: "蔡森分析缓存未命中",
			});
			return null;
		}

		// 检查是否过期
		const now = Date.now();
		if (now - cached.timestamp > cached.ttl) {
			logger.debug({
				action: "cache_expired",
				type: "caisen_analysis",
				symbol,
				age: now - cached.timestamp,
				ttl: cached.ttl,
				message: "蔡森分析缓存已过期",
			});
			this.caisenAnalysis.delete(symbol);
			return null;
		}

		logger.debug({
			action: "cache_hit",
			type: "caisen_analysis",
			symbol,
			age: now - cached.timestamp,
			message: "蔡森分析缓存命中",
		});

		return cached.data;
	}

	/**
	 * 设置蔡森分析缓存
	 * @param symbol 交易币种
	 * @param data 分析结果
	 * @param ttl 生存时间（毫秒），可选，默认使用配置的 TTL
	 */
	setCaisenAnalysis(
		symbol: string,
		data: CaisenStrategyResultRecord,
		ttl?: number,
	): void {
		const cacheItem: CacheItem<CaisenStrategyResultRecord> = {
			data,
			timestamp: Date.now(),
			ttl: ttl || this.defaultTTL.caisenAnalysis,
		};

		this.caisenAnalysis.set(symbol, cacheItem);

		logger.debug({
			action: "cache_set",
			type: "caisen_analysis",
			symbol,
			ttl: cacheItem.ttl,
			message: "蔡森分析缓存已设置",
		});
	}

	/**
	 * 清除蔡森分析缓存
	 * @param symbol 交易币种，如果不提供则清除所有
	 */
	clearCaisenAnalysis(symbol?: string): void {
		if (symbol) {
			this.caisenAnalysis.delete(symbol);
			logger.debug({
				action: "cache_clear",
				type: "caisen_analysis",
				symbol,
				message: "蔡森分析缓存已清除",
			});
		} else {
			this.caisenAnalysis.clear();
			logger.debug({
				action: "cache_clear_all",
				type: "caisen_analysis",
				message: "所有蔡森分析缓存已清除",
			});
		}
	}

	// ==================== 追踪止损状态管理 ====================

	/**
	 * 获取追踪止损状态
	 * @param symbol 交易币种
	 * @returns 追踪止损状态，如果不存在则返回 null
	 */
	getTrailingStopState(symbol: string): TrailingStopState | null {
		const state = this.trailingStopState.get(symbol);

		if (!state) {
			logger.debug({
				action: "state_miss",
				type: "trailing_stop",
				symbol,
				message: "追踪止损状态不存在",
			});
			return null;
		}

		logger.debug({
			action: "state_hit",
			type: "trailing_stop",
			symbol,
			message: "追踪止损状态获取成功",
		});

		return state;
	}

	/**
	 * 设置追踪止损状态
	 * @param symbol 交易币种
	 * @param state 追踪止损状态
	 */
	setTrailingStopState(symbol: string, state: TrailingStopState): void {
		this.trailingStopState.set(symbol, state);

		logger.debug({
			action: "state_set",
			type: "trailing_stop",
			symbol,
			peakPrice: state.peakPrice,
			trailingStopPrice: state.trailingStopPrice,
			message: "追踪止损状态已设置",
		});
	}

	/**
	 * 清除追踪止损状态
	 * @param symbol 交易币种，如果不提供则清除所有
	 */
	clearTrailingStopState(symbol?: string): void {
		if (symbol) {
			this.trailingStopState.delete(symbol);
			logger.debug({
				action: "state_clear",
				type: "trailing_stop",
				symbol,
				message: "追踪止损状态已清除",
			});
		} else {
			this.trailingStopState.clear();
			logger.debug({
				action: "state_clear_all",
				type: "trailing_stop",
				message: "所有追踪止损状态已清除",
			});
		}
	}

	// ==================== 缓存统计和管理 ====================

	/**
	 * 获取缓存统计信息
	 * @returns 缓存统计信息
	 */
	getStats(): {
		indicators: { count: number; size: number };
		caisenAnalysis: { count: number; size: number };
		trailingStopState: { count: number; size: number };
	} {
		return {
			indicators: {
				count: this.indicators.size,
				size: this.indicators.size,
			},
			caisenAnalysis: {
				count: this.caisenAnalysis.size,
				size: this.caisenAnalysis.size,
			},
			trailingStopState: {
				count: this.trailingStopState.size,
				size: this.trailingStopState.size,
			},
		};
	}

	/**
	 * 清理过期缓存
	 * 遍历所有缓存项，删除已过期的项
	 */
	cleanupExpired(): void {
		const now = Date.now();
		let expiredCount = 0;

		// 清理过期的指标缓存
		for (const [symbol, cached] of this.indicators.entries()) {
			if (now - cached.timestamp > cached.ttl) {
				this.indicators.delete(symbol);
				expiredCount++;
			}
		}

		// 清理过期的蔡森分析缓存
		for (const [symbol, cached] of this.caisenAnalysis.entries()) {
			if (now - cached.timestamp > cached.ttl) {
				this.caisenAnalysis.delete(symbol);
				expiredCount++;
			}
		}

		if (expiredCount > 0) {
			logger.debug({
				action: "cache_cleanup",
				expiredCount,
				message: `清理了 ${expiredCount} 个过期缓存项`,
			});
		}
	}

	/**
	 * 清除所有缓存
	 */
	clearAll(): void {
		this.indicators.clear();
		this.caisenAnalysis.clear();
		this.trailingStopState.clear();

		logger.info({
			action: "cache_clear_all",
			message: "所有缓存已清除",
		});
	}
}

// 导出单例实例
export const dynamicStopLossCache = new DynamicStopLossCache();
