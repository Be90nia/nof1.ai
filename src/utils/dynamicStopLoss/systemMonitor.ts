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
 * 动态止损优化系统 - 系统资源监控模块
 *
 * 功能：
 * 1. 监控系统资源使用（CPU、内存）
 * 2. 检测系统过载状态
 * 3. 触发降级处理
 */

import { createLogger } from "../loggerUtils";
import { recordError, triggerAlert } from "./monitoring";

const logger = createLogger({
	name: "dynamic-stop-loss-system-monitor",
	level: "info",
});

// ==================== 系统资源监控 ====================

/**
 * 系统资源使用情况
 */
interface SystemResourceUsage {
	/** CPU使用率 (0-100) */
	cpuUsage: number;
	/** 内存使用率 (0-100) */
	memoryUsage: number;
	/** 系统负载 */
	systemLoad: number;
	/** 检测时间戳 */
	timestamp: number;
}

/**
 * 系统过载状态
 */
interface SystemOverloadStatus {
	/** 是否过载 */
	isOverloaded: boolean;
	/** 过载级别 (1-3, 3最严重) */
	overloadLevel: number;
	/** 过载原因 */
	reasons: string[];
	/** 建议的降级措施 */
	degradationSuggestions: string[];
}

/**
 * 系统资源阈值配置
 */
const RESOURCE_THRESHOLDS = {
	/** CPU使用率阈值 */
	CPU_WARNING: 70, // 70%
	CPU_CRITICAL: 85, // 85%
	/** 内存使用率阈值 */
	MEMORY_WARNING: 80, // 80%
	MEMORY_CRITICAL: 90, // 90%
	/** 系统负载阈值（相对于CPU核心数） */
	LOAD_WARNING: 1.5,
	LOAD_CRITICAL: 2.0,
};

/**
 * 系统监控状态
 */
let systemMonitoringEnabled = true;
let lastResourceCheck = 0;
let resourceCheckInterval = 30000; // 30秒检查一次
let currentOverloadStatus: SystemOverloadStatus = {
	isOverloaded: false,
	overloadLevel: 0,
	reasons: [],
	degradationSuggestions: [],
};

// ==================== 资源监控功能 ====================

/**
 * 获取系统资源使用情况
 * 
 * @returns 系统资源使用情况
 */
async function getSystemResourceUsage(): Promise<SystemResourceUsage> {
	try {
		// 获取内存使用情况
		const memoryUsage = process.memoryUsage();
		const totalMemory = require("os").totalmem();
		const freeMemory = require("os").freemem();
		const usedMemory = totalMemory - freeMemory;
		const memoryUsagePercent = (usedMemory / totalMemory) * 100;

		// 获取CPU使用情况（简化版本，使用进程CPU时间）
		const cpuUsage = process.cpuUsage();
		const cpuUsagePercent = Math.min(
			((cpuUsage.user + cpuUsage.system) / 1000000) / 1000 * 100, // 转换为百分比
			100
		);

		// 获取系统负载（Unix系统）
		let systemLoad = 0;
		try {
			const loadavg = require("os").loadavg();
			systemLoad = loadavg[0]; // 1分钟平均负载
		} catch (error) {
			// Windows系统可能不支持loadavg
			systemLoad = cpuUsagePercent / 100;
		}

		return {
			cpuUsage: Math.max(0, Math.min(100, cpuUsagePercent)),
			memoryUsage: Math.max(0, Math.min(100, memoryUsagePercent)),
			systemLoad,
			timestamp: Date.now(),
		};
	} catch (error) {
		logger.error({
			action: "get_system_resource_usage_error",
			error: (error as Error).message,
			message: "获取系统资源使用情况失败",
		});

		// 返回安全的默认值
		return {
			cpuUsage: 50,
			memoryUsage: 50,
			systemLoad: 1.0,
			timestamp: Date.now(),
		};
	}
}

/**
 * 检测系统是否过载
 * 
 * @param resourceUsage 系统资源使用情况
 * @returns 系统过载状态
 */
function detectSystemOverload(resourceUsage: SystemResourceUsage): SystemOverloadStatus {
	const reasons: string[] = [];
	const degradationSuggestions: string[] = [];
	let overloadLevel = 0;

	// 检查CPU使用率
	if (resourceUsage.cpuUsage >= RESOURCE_THRESHOLDS.CPU_CRITICAL) {
		reasons.push(`CPU使用率过高: ${resourceUsage.cpuUsage.toFixed(1)}%`);
		degradationSuggestions.push("禁用复杂指标计算");
		degradationSuggestions.push("减少AI判断频率");
		overloadLevel = Math.max(overloadLevel, 3);
	} else if (resourceUsage.cpuUsage >= RESOURCE_THRESHOLDS.CPU_WARNING) {
		reasons.push(`CPU使用率较高: ${resourceUsage.cpuUsage.toFixed(1)}%`);
		degradationSuggestions.push("使用缓存数据");
		overloadLevel = Math.max(overloadLevel, 2);
	}

	// 检查内存使用率
	if (resourceUsage.memoryUsage >= RESOURCE_THRESHOLDS.MEMORY_CRITICAL) {
		reasons.push(`内存使用率过高: ${resourceUsage.memoryUsage.toFixed(1)}%`);
		degradationSuggestions.push("清理缓存");
		degradationSuggestions.push("减少数据存储");
		overloadLevel = Math.max(overloadLevel, 3);
	} else if (resourceUsage.memoryUsage >= RESOURCE_THRESHOLDS.MEMORY_WARNING) {
		reasons.push(`内存使用率较高: ${resourceUsage.memoryUsage.toFixed(1)}%`);
		degradationSuggestions.push("限制缓存大小");
		overloadLevel = Math.max(overloadLevel, 2);
	}

	// 检查系统负载
	const cpuCores = require("os").cpus().length;
	const normalizedLoad = resourceUsage.systemLoad / cpuCores;
	
	if (normalizedLoad >= RESOURCE_THRESHOLDS.LOAD_CRITICAL) {
		reasons.push(`系统负载过高: ${resourceUsage.systemLoad.toFixed(2)} (${cpuCores}核)`);
		degradationSuggestions.push("暂停非关键计算");
		overloadLevel = Math.max(overloadLevel, 3);
	} else if (normalizedLoad >= RESOURCE_THRESHOLDS.LOAD_WARNING) {
		reasons.push(`系统负载较高: ${resourceUsage.systemLoad.toFixed(2)} (${cpuCores}核)`);
		degradationSuggestions.push("降低计算频率");
		overloadLevel = Math.max(overloadLevel, 1);
	}

	const isOverloaded = overloadLevel > 0;

	return {
		isOverloaded,
		overloadLevel,
		reasons,
		degradationSuggestions,
	};
}

/**
 * 检查系统资源状态
 * 
 * @returns 系统过载状态
 */
export async function checkSystemOverload(): Promise<SystemOverloadStatus> {
	if (!systemMonitoringEnabled) {
		return {
			isOverloaded: false,
			overloadLevel: 0,
			reasons: [],
			degradationSuggestions: [],
		};
	}

	const now = Date.now();
	
	// 避免频繁检查
	if (now - lastResourceCheck < resourceCheckInterval) {
		return currentOverloadStatus;
	}

	try {
		const resourceUsage = await getSystemResourceUsage();
		const overloadStatus = detectSystemOverload(resourceUsage);

		// 更新状态
		lastResourceCheck = now;
		currentOverloadStatus = overloadStatus;

		// 记录资源使用情况
		logger.debug({
			action: "system_resource_check",
			cpuUsage: resourceUsage.cpuUsage.toFixed(1),
			memoryUsage: resourceUsage.memoryUsage.toFixed(1),
			systemLoad: resourceUsage.systemLoad.toFixed(2),
			isOverloaded: overloadStatus.isOverloaded,
			overloadLevel: overloadStatus.overloadLevel,
		});

		// 如果检测到过载，触发告警
		if (overloadStatus.isOverloaded) {
			const alertLevel = overloadStatus.overloadLevel >= 3 ? "error" : 
							 overloadStatus.overloadLevel >= 2 ? "warning" : "info";
			
			triggerAlert(alertLevel, "系统资源过载", {
				cpuUsage: resourceUsage.cpuUsage,
				memoryUsage: resourceUsage.memoryUsage,
				systemLoad: resourceUsage.systemLoad,
				overloadLevel: overloadStatus.overloadLevel,
				reasons: overloadStatus.reasons,
				suggestions: overloadStatus.degradationSuggestions,
			});

			logger.warn({
				action: "system_overload_detected",
				overloadLevel: overloadStatus.overloadLevel,
				reasons: overloadStatus.reasons,
				suggestions: overloadStatus.degradationSuggestions,
				message: "检测到系统过载",
			});
		}

		return overloadStatus;
	} catch (error) {
		logger.error({
			action: "check_system_overload_error",
			error: (error as Error).message,
			message: "检查系统过载状态失败",
		});

		recordError("indicatorCalculation", error as Error);

		// 返回安全的默认状态
		return {
			isOverloaded: false,
			overloadLevel: 0,
			reasons: ["系统监控失败"],
			degradationSuggestions: ["使用默认配置"],
		};
	}
}

/**
 * 应用系统降级措施
 * 
 * @param overloadStatus 系统过载状态
 * @returns 降级配置
 */
export function applySystemDegradation(overloadStatus: SystemOverloadStatus): {
	useSimplifiedCalculation: boolean;
	disableAIJudgment: boolean;
	reduceCacheSize: boolean;
	skipNonCriticalOperations: boolean;
} {
	const degradationConfig = {
		useSimplifiedCalculation: false,
		disableAIJudgment: false,
		reduceCacheSize: false,
		skipNonCriticalOperations: false,
	};

	if (!overloadStatus.isOverloaded) {
		return degradationConfig;
	}

	logger.info({
		action: "applying_system_degradation",
		overloadLevel: overloadStatus.overloadLevel,
		reasons: overloadStatus.reasons,
		message: "应用系统降级措施",
	});

	// 根据过载级别应用不同的降级措施
	switch (overloadStatus.overloadLevel) {
		case 1: // 轻度过载
			degradationConfig.reduceCacheSize = true;
			break;
			
		case 2: // 中度过载
			degradationConfig.useSimplifiedCalculation = true;
			degradationConfig.reduceCacheSize = true;
			break;
			
		case 3: // 严重过载
			degradationConfig.useSimplifiedCalculation = true;
			degradationConfig.disableAIJudgment = true;
			degradationConfig.reduceCacheSize = true;
			degradationConfig.skipNonCriticalOperations = true;
			break;
	}

	return degradationConfig;
}

/**
 * 获取当前系统状态
 * 
 * @returns 当前系统过载状态
 */
export function getCurrentSystemStatus(): SystemOverloadStatus {
	return { ...currentOverloadStatus };
}

/**
 * 启用/禁用系统监控
 * 
 * @param enabled 是否启用
 */
export function setSystemMonitoringEnabled(enabled: boolean): void {
	systemMonitoringEnabled = enabled;
	logger.info({
		action: "system_monitoring_toggle",
		enabled,
		message: `系统监控已${enabled ? "启用" : "禁用"}`,
	});
}

/**
 * 设置资源检查间隔
 * 
 * @param intervalMs 检查间隔（毫秒）
 */
export function setResourceCheckInterval(intervalMs: number): void {
	resourceCheckInterval = Math.max(5000, intervalMs); // 最小5秒
	logger.info({
		action: "resource_check_interval_updated",
		interval: resourceCheckInterval,
		message: "资源检查间隔已更新",
	});
}

/**
 * 重置系统监控状态
 */
export function resetSystemMonitoringState(): void {
	lastResourceCheck = 0;
	currentOverloadStatus = {
		isOverloaded: false,
		overloadLevel: 0,
		reasons: [],
		degradationSuggestions: [],
	};
	
	logger.info({
		action: "system_monitoring_reset",
		message: "系统监控状态已重置",
	});
}