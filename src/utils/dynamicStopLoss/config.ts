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

import { createLogger } from "../loggerUtils";
import { dbClient } from "../../database/dbClient";
import type { DynamicStopLossConfig } from "./types";

const logger = createLogger({
	name: "dynamic-stop-loss-config",
	level: "info",
});

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: DynamicStopLossConfig = {
	enabled: true,
	baseThresholdRange: {
		min: -20,
		max: -5,
	},
	factorWeights: {
		trendStrength: { min: -0.2, max: 0.3 },
		volatility: { min: 0, max: 0.5 },
		sevenSegment: { min: -0.1, max: 0.2 },
		volume: { min: 0, max: 0.3 },
		timeDecay: { min: 0, max: 0.4 },
	},
	indicatorPeriods: {
		trendStrength: 20,
		volatility: 14,
		sevenSegment: 100,
		volume: 20,
	},
	cache: {
		indicatorsTTL: 60000, // 1分钟
		caisenAnalysisTTL: 300000, // 5分钟
	},
	aiJudgment: {
		enabled: true,
		timeout: 5000,
		confidenceThreshold: 0.7,
	},
};

/**
 * 参数验证错误
 */
export class ConfigValidationError extends Error {
	constructor(
		message: string,
		public field: string,
		public value: unknown,
	) {
		super(message);
		this.name = "ConfigValidationError";
	}
}

/**
 * 验证配置参数
 */
export function validateConfig(config: Partial<DynamicStopLossConfig>): {
	valid: boolean;
	errors: ConfigValidationError[];
} {
	const errors: ConfigValidationError[] = [];

	// 验证基础止损阈值范围
	if (config.baseThresholdRange) {
		if (
			config.baseThresholdRange.min >= 0 ||
			config.baseThresholdRange.max >= 0
		) {
			errors.push(
				new ConfigValidationError(
					"基础止损阈值必须为负数",
					"baseThresholdRange",
					config.baseThresholdRange,
				),
			);
		}
		if (config.baseThresholdRange.min >= config.baseThresholdRange.max) {
			errors.push(
				new ConfigValidationError(
					"基础止损阈值最小值必须小于最大值",
					"baseThresholdRange",
					config.baseThresholdRange,
				),
			);
		}
	}

	// 验证动态因子权重范围
	if (config.factorWeights) {
		const factorNames: (keyof typeof config.factorWeights)[] = [
			"trendStrength",
			"volatility",
			"sevenSegment",
			"volume",
			"timeDecay",
		];

		for (const name of factorNames) {
			const weight = config.factorWeights[name];
			if (weight) {
				if (weight.min > weight.max) {
					errors.push(
						new ConfigValidationError(
							`${name} 权重最小值必须小于等于最大值`,
							`factorWeights.${name}`,
							weight,
						),
					);
				}
			}
		}
	}

	// 验证指标计算周期
	if (config.indicatorPeriods) {
		const periods: (keyof typeof config.indicatorPeriods)[] = [
			"trendStrength",
			"volatility",
			"sevenSegment",
			"volume",
		];

		for (const name of periods) {
			const period = config.indicatorPeriods[name];
			if (period !== undefined && (period < 1 || period > 500)) {
				errors.push(
					new ConfigValidationError(
						`${name} 周期必须在 1-500 之间`,
						`indicatorPeriods.${name}`,
						period,
					),
				);
			}
		}
	}

	// 验证缓存配置
	if (config.cache) {
		if (
			config.cache.indicatorsTTL !== undefined &&
			config.cache.indicatorsTTL < 0
		) {
			errors.push(
				new ConfigValidationError(
					"指标缓存TTL必须为非负数",
					"cache.indicatorsTTL",
					config.cache.indicatorsTTL,
				),
			);
		}
		if (
			config.cache.caisenAnalysisTTL !== undefined &&
			config.cache.caisenAnalysisTTL < 0
		) {
			errors.push(
				new ConfigValidationError(
					"蔡森分析缓存TTL必须为非负数",
					"cache.caisenAnalysisTTL",
					config.cache.caisenAnalysisTTL,
				),
			);
		}
	}

	// 验证AI判断器配置
	if (config.aiJudgment) {
		if (
			config.aiJudgment.timeout !== undefined &&
			(config.aiJudgment.timeout < 1000 || config.aiJudgment.timeout > 30000)
		) {
			errors.push(
				new ConfigValidationError(
					"AI判断器超时时间必须在 1000-30000 毫秒之间",
					"aiJudgment.timeout",
					config.aiJudgment.timeout,
				),
			);
		}
		if (
			config.aiJudgment.confidenceThreshold !== undefined &&
			(config.aiJudgment.confidenceThreshold < 0 ||
				config.aiJudgment.confidenceThreshold > 1)
		) {
			errors.push(
				new ConfigValidationError(
					"AI判断器置信度阈值必须在 0-1 之间",
					"aiJudgment.confidenceThreshold",
					config.aiJudgment.confidenceThreshold,
				),
			);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * 当前配置（内存中）
 */
let currentConfig: DynamicStopLossConfig = { ...DEFAULT_CONFIG };

/**
 * 获取当前配置
 */
export function getConfig(): DynamicStopLossConfig {
	return { ...currentConfig };
}

/**
 * 更新配置
 */
export async function updateConfig(
	newConfig: Partial<DynamicStopLossConfig>,
	reason?: string,
	changedBy?: string,
): Promise<void> {
	try {
		logger.info({
			action: "update_config_start",
			newConfig,
			reason,
			changedBy,
			message: "开始更新配置",
		});

		// 验证配置
		const validation = validateConfig(newConfig);
		if (!validation.valid) {
			const errorMessages = validation.errors
				.map((e) => `${e.field}: ${e.message}`)
				.join("; ");
			throw new Error(`配置验证失败: ${errorMessages}`);
		}

		// 保存旧配置
		const oldConfig = { ...currentConfig };

		// 合并配置
		currentConfig = {
			...currentConfig,
			...newConfig,
			// 深度合并嵌套对象
			baseThresholdRange: {
				...currentConfig.baseThresholdRange,
				...(newConfig.baseThresholdRange || {}),
			},
			factorWeights: {
				...currentConfig.factorWeights,
				...(newConfig.factorWeights || {}),
			},
			indicatorPeriods: {
				...currentConfig.indicatorPeriods,
				...(newConfig.indicatorPeriods || {}),
			},
			cache: {
				...currentConfig.cache,
				...(newConfig.cache || {}),
			},
			aiJudgment: {
				...currentConfig.aiJudgment,
				...(newConfig.aiJudgment || {}),
			},
		};

		// 记录配置变更历史到数据库
		const changes = Object.keys(newConfig).map((key) => ({
			key,
			oldValue: JSON.stringify(oldConfig[key as keyof DynamicStopLossConfig]),
			newValue: JSON.stringify(
				currentConfig[key as keyof DynamicStopLossConfig],
			),
		}));

		for (const change of changes) {
			await dbClient.execute({
				sql: `INSERT INTO stop_loss_config_history 
              (timestamp, config_key, old_value, new_value, changed_by, reason)
              VALUES (?, ?, ?, ?, ?, ?)`,
				args: [
					new Date().toISOString(),
					change.key,
					change.oldValue,
					change.newValue,
					changedBy || "system",
					reason || "手动更新",
				],
			});
		}

		logger.info({
			action: "update_config_success",
			changes: changes.length,
			message: "配置更新成功",
		});
	} catch (error) {
		logger.error({
			action: "update_config_error",
			error: (error as Error).message,
			stack: (error as Error).stack,
			message: "配置更新失败",
		});
		throw error;
	}
}

/**
 * 重置配置为默认值
 */
export async function resetConfig(
	reason?: string,
	changedBy?: string,
): Promise<void> {
	await updateConfig(DEFAULT_CONFIG, reason || "重置为默认配置", changedBy);
}

/**
 * 从数据库加载配置历史
 */
export async function loadConfigHistory(limit = 10): Promise<
	Array<{
		timestamp: string;
		configKey: string;
		oldValue: string;
		newValue: string;
		changedBy: string;
		reason: string;
	}>
> {
	try {
		const result = await dbClient.execute({
			sql: `SELECT timestamp, config_key, old_value, new_value, changed_by, reason
            FROM stop_loss_config_history
            ORDER BY timestamp DESC
            LIMIT ?`,
			args: [limit],
		});

		return result.rows.map((row: any) => ({
			timestamp: row.timestamp,
			configKey: row.config_key,
			oldValue: row.old_value,
			newValue: row.new_value,
			changedBy: row.changed_by,
			reason: row.reason,
		}));
	} catch (error) {
		logger.error({
			action: "load_config_history_error",
			error: (error as Error).message,
			message: "加载配置历史失败",
		});
		return [];
	}
}

