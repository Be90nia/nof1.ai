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
 * 动态止损优化系统 - 主入口文件
 *
 * 导出所有公共接口、类和工具函数
 */

// ==================== 类型定义 ====================
export type {
	// 动态止损计算相关类型
	DynamicThresholdResult,
	DynamicStopLossFactors,
	DynamicThresholdParams,
	// 指标计算相关类型
	DynamicIndicators,
	VolatilityInfo,
	MarketSentimentInfo,
	// 蔡森策略整合相关类型
	CaisenStopLossFactors,
	SupportResistanceLevels,
	// AI 判断相关类型
	AIStopLossJudgmentParams,
	AIStopLossJudgmentResult,
	// 数据库记录类型
	DynamicIndicatorsRecord,
	StopLossDecisionRecord,
	CaisenStrategyResultRecord,
	StopLossConfigHistoryRecord,
	// 缓存相关类型
	CacheItem,
	TrailingStopState,
	DynamicStopLossCache as DynamicStopLossCacheType,
	// 配置相关类型
	DynamicStopLossConfig,
	TrailingStopParams,
	// 监控和告警相关类型
	AlertLevel,
	AlertInfo,
	SystemStatus,
	RunReport,
} from "./types";

// ==================== 核心类 ====================

// 指标计算器
export { IndicatorCalculator, createIndicatorCalculator } from "./indicatorCalculator";

// 动态止损计算器
export { DynamicStopLossCalculator, createDynamicStopLossCalculator } from "./calculator";

// 蔡森策略整合器
export { CaisenStrategyIntegrator, createCaisenStrategyIntegrator } from "../../caisen/strategy/stopLoss";

// 数据库集成
export { DatabaseIntegration, databaseIntegration } from "./database";

// 缓存管理
export { DynamicStopLossCache, dynamicStopLossCache } from "./cache";

// 配置管理
export {
	DEFAULT_CONFIG,
	ConfigValidationError,
	validateConfig,
	getConfig,
	updateConfig,
	resetConfig,
	loadConfigHistory,
} from "./config";

// 监控和告警
export {
	recordStopLossTrigger,
	recordPerformanceMetric,
	recordError,
	triggerAlert,
	getSystemStatus,
	getRecentStopLossTriggers,
	getRecentAlerts,
	generateRunReport,
	resetMonitoringStats,
} from "./monitoring";

// 系统资源监控
export {
	applySystemDegradation,
	checkSystemOverload,
	getCurrentSystemStatus,
	resetSystemMonitoringState,
	setResourceCheckInterval,
	setSystemMonitoringEnabled,
} from "./systemMonitor";

// ==================== 便捷初始化函数 ====================

import { createLogger } from "../loggerUtils";
import { dynamicStopLossCache } from "./cache";
import { createDynamicStopLossCalculator } from "./calculator";
import { getConfig } from "./config";
import { databaseIntegration } from "./database";
import { createIndicatorCalculator } from "./indicatorCalculator";

const logger = createLogger({
	name: "dynamic-stop-loss-system",
	level: "info",
});

/**
 * 动态止损系统实例
 */
export interface DynamicStopLossSystem {
	/** 指标计算器 */
	indicatorCalculator: ReturnType<typeof createIndicatorCalculator>;
	/** 动态止损计算器 */
	dynamicStopLossCalculator: ReturnType<typeof createDynamicStopLossCalculator>;
	/** 数据库集成 */
	databaseIntegration: typeof databaseIntegration;
	/** 缓存管理器 */
	cache: typeof dynamicStopLossCache;
	/** 是否已初始化 */
	initialized: boolean;
}

let systemInstance: DynamicStopLossSystem | null = null;

/**
 * 初始化动态止损系统
 * 创建所有必要的组件实例并进行初始化
 *
 * @param config 可选的配置参数
 * @returns 动态止损系统实例
 */
export async function initializeDynamicStopLossSystem(
	config?: Partial<{
		indicatorsTTL: number;
		caisenAnalysisTTL: number;
		enableDatabase: boolean;
	}>,
): Promise<DynamicStopLossSystem> {
	try {
		logger.info({
			action: "system_initialization_start",
			config,
			message: "开始初始化动态止损系统",
		});

		// 如果已经初始化，返回现有实例
		if (systemInstance?.initialized) {
			logger.info({
				action: "system_already_initialized",
				message: "系统已初始化，返回现有实例",
			});
			return systemInstance;
		}

		// 创建指标计算器
		const indicatorCalculator = createIndicatorCalculator();
		logger.debug({
			action: "indicator_calculator_created",
			message: "指标计算器创建成功",
		});

		// 创建动态止损计算器
		const dynamicStopLossCalculator = createDynamicStopLossCalculator(indicatorCalculator);
		logger.debug({
			action: "dynamic_stop_loss_calculator_created",
			message: "动态止损计算器创建成功",
		});

		// 数据库集成已经初始化，无需额外操作
		logger.info({
			action: "database_ready",
			message: "数据库集成已就绪",
		});

		// 创建系统实例
		systemInstance = {
			indicatorCalculator,
			dynamicStopLossCalculator,
			databaseIntegration,
			cache: dynamicStopLossCache,
			initialized: true,
		};

		logger.info({
			action: "system_initialization_complete",
			message: "动态止损系统初始化完成",
		});

		return systemInstance;
	} catch (error) {
		logger.error({
			action: "system_initialization_error",
			error: (error as Error).message,
			stack: (error as Error).stack,
			message: "动态止损系统初始化失败",
		});
		throw error;
	}
}

/**
 * 获取动态止损系统实例
 * 如果尚未初始化，将自动初始化
 *
 * @returns 动态止损系统实例
 */
export async function getDynamicStopLossSystem(): Promise<DynamicStopLossSystem> {
	if (!systemInstance?.initialized) {
		return await initializeDynamicStopLossSystem();
	}
	return systemInstance;
}

/**
 * 关闭动态止损系统
 * 清理所有资源和缓存
 */
export function shutdownDynamicStopLossSystem(): void {
	try {
		logger.info({
			action: "system_shutdown_start",
			message: "开始关闭动态止损系统",
		});

		// 清理缓存
		if (systemInstance?.cache) {
			systemInstance.cache.clearAll();
			logger.debug({
				action: "cache_cleared",
				message: "缓存已清理",
			});
		}

		// 重置系统实例
		systemInstance = null;

		logger.info({
			action: "system_shutdown_complete",
			message: "动态止损系统已关闭",
		});
	} catch (error) {
		logger.error({
			action: "system_shutdown_error",
			error: (error as Error).message,
			message: "关闭动态止损系统时发生错误",
		});
	}
}

/**
 * 获取系统状态
 * @returns 系统是否已初始化
 */
export function isSystemInitialized(): boolean {
	return systemInstance?.initialized === true;
}
