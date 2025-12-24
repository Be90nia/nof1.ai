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
 * 动态止损优化系统 - 监控和告警模块
 *
 * 功能：
 * 1. 系统状态监控
 * 2. 止损触发频率监控
 * 3. 性能指标监控
 * 4. 告警机制
 */

import { createLogger } from "../loggerUtils";
import type { AlertInfo, AlertLevel, RunReport, SystemStatus } from "./types";

const logger = createLogger({
	name: "dynamic-stop-loss-monitoring",
	level: "info",
});

// ==================== 监控数据存储 ====================

/**
 * 止损触发记录
 */
interface StopLossTriggerRecord {
	timestamp: number;
	symbol: string;
	reason: string;
	pnlPercent: number;
	threshold: number;
}

/**
 * 性能指标记录
 */
interface PerformanceMetrics {
	/** 指标计算耗时（毫秒） */
	indicatorCalculationTime: number[];
	/** 动态阈值计算耗时（毫秒） */
	thresholdCalculationTime: number[];
	/** AI判断耗时（毫秒） */
	aiJudgmentTime: number[];
	/** 数据库操作耗时（毫秒） */
	databaseOperationTime: number[];
}

/**
 * 监控统计数据
 */
interface MonitoringStats {
	/** 系统启动时间 */
	startTime: number;
	/** 最后更新时间 */
	lastUpdateTime: number;
	/** 止损触发记录（最近100条） */
	stopLossTriggers: StopLossTriggerRecord[];
	/** 性能指标 */
	performanceMetrics: PerformanceMetrics;
	/** 告警记录（最近50条） */
	alerts: AlertInfo[];
	/** 错误计数 */
	errorCounts: {
		indicatorCalculation: number;
		thresholdCalculation: number;
		aiJudgment: number;
		databaseOperation: number;
	};
}

/**
 * 全局监控统计数据
 */
const monitoringStats: MonitoringStats = {
	startTime: Date.now(),
	lastUpdateTime: Date.now(),
	stopLossTriggers: [],
	performanceMetrics: {
		indicatorCalculationTime: [],
		thresholdCalculationTime: [],
		aiJudgmentTime: [],
		databaseOperationTime: [],
	},
	alerts: [],
	errorCounts: {
		indicatorCalculation: 0,
		thresholdCalculation: 0,
		aiJudgment: 0,
		databaseOperation: 0,
	},
};

// ==================== 监控功能 ====================

/**
 * 记录止损触发
 *
 * @param symbol 交易币种
 * @param reason 触发原因
 * @param pnlPercent 盈亏百分比
 * @param threshold 止损阈值
 */
export function recordStopLossTrigger(
	symbol: string,
	reason: string,
	pnlPercent: number,
	threshold: number,
): void {
	const record: StopLossTriggerRecord = {
		timestamp: Date.now(),
		symbol,
		reason,
		pnlPercent,
		threshold,
	};

	monitoringStats.stopLossTriggers.push(record);
	monitoringStats.lastUpdateTime = Date.now();

	// 保持最近100条记录
	if (monitoringStats.stopLossTriggers.length > 100) {
		monitoringStats.stopLossTriggers.shift();
	}

	logger.info({
		action: "stop_loss_trigger_recorded",
		symbol,
		reason,
		pnlPercent,
		threshold,
		message: "记录止损触发",
	});

	// 检查触发频率是否异常
	checkStopLossTriggerFrequency();
}

/**
 * 记录性能指标
 *
 * @param metricType 指标类型
 * @param duration 耗时（毫秒）
 */
export function recordPerformanceMetric(
	metricType:
		| "indicatorCalculation"
		| "thresholdCalculation"
		| "aiJudgment"
		| "databaseOperation",
	duration: number,
): void {
	const metrics = monitoringStats.performanceMetrics[`${metricType}Time`];
	metrics.push(duration);

	// 保持最近100条记录
	if (metrics.length > 100) {
		metrics.shift();
	}

	monitoringStats.lastUpdateTime = Date.now();

	// 检查性能是否异常
	if (duration > getPerformanceThreshold(metricType)) {
		triggerAlert("warning", `${metricType}性能异常`, {
			metricType,
			duration,
			threshold: getPerformanceThreshold(metricType),
		});
	}
}

/**
 * 记录错误
 *
 * @param errorType 错误类型
 * @param error 错误对象
 */
export function recordError(
	errorType:
		| "indicatorCalculation"
		| "thresholdCalculation"
		| "aiJudgment"
		| "databaseOperation",
	error: Error,
): void {
	monitoringStats.errorCounts[errorType]++;
	monitoringStats.lastUpdateTime = Date.now();

	logger.error({
		action: "error_recorded",
		errorType,
		error: error.message,
		stack: error.stack,
		count: monitoringStats.errorCounts[errorType],
		message: "记录错误",
	});

	// 检查错误率是否异常
	checkErrorRate(errorType);
}

/**
 * 获取性能阈值（毫秒）
 *
 * @param metricType 指标类型
 * @returns 性能阈值
 */
function getPerformanceThreshold(
	metricType:
		| "indicatorCalculation"
		| "thresholdCalculation"
		| "aiJudgment"
		| "databaseOperation",
): number {
	const thresholds = {
		indicatorCalculation: 1000, // 1秒
		thresholdCalculation: 500, // 0.5秒
		aiJudgment: 5000, // 5秒
		databaseOperation: 1000, // 1秒
	};

	return thresholds[metricType];
}

/**
 * 检查止损触发频率
 * 如果1小时内触发超过10次，发出警告
 */
function checkStopLossTriggerFrequency(): void {
	const oneHourAgo = Date.now() - 60 * 60 * 1000;
	const recentTriggers = monitoringStats.stopLossTriggers.filter(
		(record) => record.timestamp > oneHourAgo,
	);

	if (recentTriggers.length > 10) {
		triggerAlert("warning", "止损触发频率过高", {
			count: recentTriggers.length,
			period: "1小时",
			threshold: 10,
		});
	}
}

/**
 * 检查错误率
 * 如果错误率超过10%，发出警告
 *
 * @param errorType 错误类型
 */
function checkErrorRate(
	errorType:
		| "indicatorCalculation"
		| "thresholdCalculation"
		| "aiJudgment"
		| "databaseOperation",
): void {
	const errorCount = monitoringStats.errorCounts[errorType];
	const metricKey = `${errorType}Time` as keyof PerformanceMetrics;
	const totalCount =
		monitoringStats.performanceMetrics[metricKey].length + errorCount;

	if (totalCount > 0) {
		const errorRate = errorCount / totalCount;

		if (errorRate > 0.1) {
			// 错误率超过10%
			triggerAlert("error", `${errorType}错误率过高`, {
				errorType,
				errorCount,
				totalCount,
				errorRate: `${(errorRate * 100).toFixed(2)}%`,
			});
		}
	}
}

// ==================== 告警功能 ====================

/**
 * 触发告警
 *
 * @param level 告警级别
 * @param message 告警消息
 * @param details 告警详情
 */
export function triggerAlert(
	level: AlertLevel,
	message: string,
	details?: Record<string, unknown>,
): void {
	const alert: AlertInfo = {
		timestamp: Date.now(),
		level,
		message,
		details,
	};

	monitoringStats.alerts.push(alert);

	// 保持最近50条告警
	if (monitoringStats.alerts.length > 50) {
		monitoringStats.alerts.shift();
	}

	// 根据告警级别记录日志
	const logData = {
		action: "alert_triggered",
		level,
		message,
		details,
	};

	switch (level) {
		case "info":
			logger.info(logData);
			break;
		case "warning":
			logger.warn(logData);
			break;
		case "error":
			logger.error(logData);
			break;
	}
}

// ==================== 系统状态查询 ====================

/**
 * 获取系统状态
 *
 * @returns 系统状态
 */
export function getSystemStatus(): SystemStatus {
	const now = Date.now();
	const uptime = now - monitoringStats.startTime;

	// 计算平均性能指标
	const avgPerformance = {
		indicatorCalculation: calculateAverage(
			monitoringStats.performanceMetrics.indicatorCalculationTime,
		),
		thresholdCalculation: calculateAverage(
			monitoringStats.performanceMetrics.thresholdCalculationTime,
		),
		aiJudgment: calculateAverage(
			monitoringStats.performanceMetrics.aiJudgmentTime,
		),
		databaseOperation: calculateAverage(
			monitoringStats.performanceMetrics.databaseOperationTime,
		),
	};

	// 统计最近1小时的止损触发次数
	const oneHourAgo = now - 60 * 60 * 1000;
	const recentTriggers = monitoringStats.stopLossTriggers.filter(
		(record) => record.timestamp > oneHourAgo,
	);

	// 统计最近1小时的告警次数
	const recentAlerts = monitoringStats.alerts.filter(
		(alert) => alert.timestamp > oneHourAgo,
	);

	return {
		uptime,
		lastUpdateTime: monitoringStats.lastUpdateTime,
		stopLossTriggersCount: monitoringStats.stopLossTriggers.length,
		recentTriggersCount: recentTriggers.length,
		averagePerformance: avgPerformance,
		errorCounts: { ...monitoringStats.errorCounts },
		recentAlertsCount: recentAlerts.length,
		alertsByLevel: {
			info: recentAlerts.filter((a) => a.level === "info").length,
			warning: recentAlerts.filter((a) => a.level === "warning").length,
			error: recentAlerts.filter((a) => a.level === "error").length,
		},
	};
}

/**
 * 获取最近的止损触发记录
 *
 * @param limit 返回记录数量限制
 * @returns 止损触发记录列表
 */
export function getRecentStopLossTriggers(limit = 10): StopLossTriggerRecord[] {
	return monitoringStats.stopLossTriggers.slice(-limit);
}

/**
 * 获取最近的告警记录
 *
 * @param limit 返回记录数量限制
 * @returns 告警记录列表
 */
export function getRecentAlerts(limit = 10): AlertInfo[] {
	return monitoringStats.alerts.slice(-limit);
}

/**
 * 计算数组平均值
 *
 * @param values 数值数组
 * @returns 平均值
 */
function calculateAverage(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	const sum = values.reduce((acc, val) => acc + val, 0);
	return sum / values.length;
}

// ==================== 运行报告生成 ====================

/**
 * 生成运行报告
 *
 * @returns 运行报告
 */
export function generateRunReport(): RunReport {
	const now = Date.now();
	const oneHourAgo = now - 60 * 60 * 1000;

	// 获取最近1小时的数据
	const recentTriggers = monitoringStats.stopLossTriggers.filter(
		(record) => record.timestamp > oneHourAgo,
	);
	const recentAlerts = monitoringStats.alerts.filter(
		(alert) => alert.timestamp > oneHourAgo,
	);

	// 统计止损触发原因
	const triggerReasons: Record<string, number> = {};
	for (const trigger of recentTriggers) {
		triggerReasons[trigger.reason] = (triggerReasons[trigger.reason] || 0) + 1;
	}

	// 统计告警级别
	const alertsByLevel = {
		info: recentAlerts.filter((a) => a.level === "info").length,
		warning: recentAlerts.filter((a) => a.level === "warning").length,
		error: recentAlerts.filter((a) => a.level === "error").length,
	};

	// 计算性能指标
	const performanceMetrics = {
		indicatorCalculation: {
			avg: calculateAverage(
				monitoringStats.performanceMetrics.indicatorCalculationTime,
			),
			max: monitoringStats.performanceMetrics.indicatorCalculationTime.length > 0
				? Math.max(...monitoringStats.performanceMetrics.indicatorCalculationTime)
				: 0,
			min: monitoringStats.performanceMetrics.indicatorCalculationTime.length > 0
				? Math.min(...monitoringStats.performanceMetrics.indicatorCalculationTime)
				: 0,
		},
		thresholdCalculation: {
			avg: calculateAverage(
				monitoringStats.performanceMetrics.thresholdCalculationTime,
			),
			max: monitoringStats.performanceMetrics.thresholdCalculationTime.length > 0
				? Math.max(...monitoringStats.performanceMetrics.thresholdCalculationTime)
				: 0,
			min: monitoringStats.performanceMetrics.thresholdCalculationTime.length > 0
				? Math.min(...monitoringStats.performanceMetrics.thresholdCalculationTime)
				: 0,
		},
		aiJudgment: {
			avg: calculateAverage(monitoringStats.performanceMetrics.aiJudgmentTime),
			max: monitoringStats.performanceMetrics.aiJudgmentTime.length > 0
				? Math.max(...monitoringStats.performanceMetrics.aiJudgmentTime)
				: 0,
			min: monitoringStats.performanceMetrics.aiJudgmentTime.length > 0
				? Math.min(...monitoringStats.performanceMetrics.aiJudgmentTime)
				: 0,
		},
		databaseOperation: {
			avg: calculateAverage(
				monitoringStats.performanceMetrics.databaseOperationTime,
			),
			max: monitoringStats.performanceMetrics.databaseOperationTime.length > 0
				? Math.max(...monitoringStats.performanceMetrics.databaseOperationTime)
				: 0,
			min: monitoringStats.performanceMetrics.databaseOperationTime.length > 0
				? Math.min(...monitoringStats.performanceMetrics.databaseOperationTime)
				: 0,
		},
	};

	const report: RunReport = {
		timestamp: now,
		period: {
			start: oneHourAgo,
			end: now,
			duration: 60 * 60 * 1000, // 1小时
		},
		stopLossTriggers: {
			total: recentTriggers.length,
			byReason: triggerReasons,
		},
		alerts: {
			total: recentAlerts.length,
			byLevel: alertsByLevel,
		},
		performance: performanceMetrics,
		errors: { ...monitoringStats.errorCounts },
	};

	logger.info({
		action: "run_report_generated",
		report,
		message: "生成运行报告",
	});

	return report;
}

/**
 * 重置监控统计数据
 */
export function resetMonitoringStats(): void {
	monitoringStats.startTime = Date.now();
	monitoringStats.lastUpdateTime = Date.now();
	monitoringStats.stopLossTriggers = [];
	monitoringStats.performanceMetrics = {
		indicatorCalculationTime: [],
		thresholdCalculationTime: [],
		aiJudgmentTime: [],
		databaseOperationTime: [],
	};
	monitoringStats.alerts = [];
	monitoringStats.errorCounts = {
		indicatorCalculation: 0,
		thresholdCalculation: 0,
		aiJudgment: 0,
		databaseOperation: 0,
	};

	logger.info({
		action: "monitoring_stats_reset",
		message: "监控统计数据已重置",
	});
}
