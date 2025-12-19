import {
	getStrategyParams,
	getTradingStrategy,
} from "../../../agents/tradingAgent";
import { dbClient } from "../../../database/dbClient";
/**
 * 增强的策略读取工具
 * 为监控系统提供更强大的策略读取能力
 */
import {
	getAgentStrategyParams,
	setDynamicStopLossParams,
	setPartialTakeProfitParams,
	setPeakDrawdownParams,
} from "../../../tools/strategyParams";
import { createLogger } from "../../../utils/loggerUtils";

const logger = createLogger({
	name: "enhanced-strategy-reader",
	level: "info",
});

/**
 * 获取完整的策略参数，包括退出策略配置
 * 增强版：确保返回完整的策略参数，包括退出策略配置
 */
export function getCompleteStrategyParams() {
	const strategy = getTradingStrategy();
	const params = getStrategyParams(strategy);

	// 确保positionExitStrategy存在
	if (!params.positionExitStrategy) {
		logger.warn("策略参数中缺少positionExitStrategy，使用默认配置");
		// 设置默认退出策略配置
		params.positionExitStrategy = {
			strategyType: "combination",
			enabled: true,
			partialTakeProfit: {
				stage1: { trigger: 5, closePercent: 30 },
				stage2: { trigger: 10, closePercent: 40 },
				stage3: { trigger: 15, closePercent: 30 },
			},
			dynamicStopLoss: {
				enabled: true,
				trailingStop: {
					level1: { trigger: 5, stopAt: 2 },
					level2: { trigger: 10, stopAt: 5 },
					level3: { trigger: 15, stopAt: 8 },
				},
			},
			peakDrawdown: {
				level1: { drawdownThreshold: 1.0, closePercent: 30 },
				level2: { drawdownThreshold: 2.0, closePercent: 50 },
				level3: { drawdownThreshold: 3.0, closePercent: 100 },
				minHoldingTime: 5,
			},
			lastUpdated: new Date().toISOString(),
		};
	}

	return params;
}

/**
 * 获取特定币种的退出策略配置
 * 增强版：支持分币种配置
 */
export async function getExitStrategyForSymbol(symbol: string) {
	try {
		const strategy = getTradingStrategy();

		// 首先从数据库获取该币种的特定配置
		const result = await dbClient.execute({
			sql: `SELECT value FROM strategy_params WHERE strategy = ? AND key = ?`,
			args: [strategy, `agentParams_${symbol}`],
		});

		if (result.rows && result.rows.length > 0) {
			const agentParams = JSON.parse(result.rows[0].value);
			if (agentParams.exitStrategy) {
				return agentParams.exitStrategy;
			}
		}

		// 如果没有特定配置，返回全局配置
		const strategyParams = getCompleteStrategyParams();
		return strategyParams.positionExitStrategy;
	} catch (error) {
		logger.error(`获取${symbol}的退出策略配置失败:`, error as any);
		// 返回默认配置
		return {
			strategyType: "combination",
			enabled: true,
			partialTakeProfit: {
				stage1: { trigger: 5, closePercent: 30 },
				stage2: { trigger: 10, closePercent: 40 },
				stage3: { trigger: 15, closePercent: 30 },
			},
			dynamicStopLoss: {
				enabled: true,
				trailingStop: {
					level1: { trigger: 5, stopAt: 2 },
					level2: { trigger: 10, stopAt: 5 },
					level3: { trigger: 15, stopAt: 8 },
				},
			},
			peakDrawdown: {
				level1: { drawdownThreshold: 1.0, closePercent: 30 },
				level2: { drawdownThreshold: 2.0, closePercent: 50 },
				level3: { drawdownThreshold: 3.0, closePercent: 100 },
				minHoldingTime: 5,
			},
			lastUpdated: new Date().toISOString(),
		};
	}
}

/**
 * 修复阶段对应关系，实现差异化回落保护
 */
export async function fixStageCorrespondence() {
	logger.info("🔧 开始修复阶段对应关系，实现差异化回落保护...");

	try {
		const strategy = getTradingStrategy();
		if (strategy !== "cai-sen") {
			return;
		}

		// 获取所有交易币种
		const { RISK_PARAMS } = await import("../../../config/riskParams");
		const tradingSymbols = RISK_PARAMS.TRADING_SYMBOLS;

		// 获取Agent设置的策略参数
		const agentParams = await getAgentStrategyParams(strategy);

		// 检查每个币种的阶段对应关系
		for (const symbol of tradingSymbols) {
			const symbolParams = agentParams[symbol] || {};

			// 确保阶段对应关系正确
			if (symbolParams.partialTakeProfit) {
				// 检查部分止盈阶段设置
				const { stage1, stage2, stage3 } = symbolParams.partialTakeProfit;
				if (!stage1 || !stage2 || !stage3) {
					logger.warn(`⚠️  币种 ${symbol} 部分止盈阶段设置不完整，正在修复...`);
					// 修复阶段设置
					await setPartialTakeProfitParams(
						strategy,
						symbol,
						stage1 || { trigger: 5, closePercent: 30 },
						stage2 || { trigger: 10, closePercent: 40 },
						stage3 || { trigger: 15, closePercent: 30 },
					);
				}
			} else {
				// 如果没有设置部分止盈参数，设置默认值
				logger.warn(`⚠️  币种 ${symbol} 缺少部分止盈参数，正在设置默认值...`);
				await setPartialTakeProfitParams(
					strategy,
					symbol,
					{ trigger: 5, closePercent: 30 },
					{ trigger: 10, closePercent: 40 },
					{ trigger: 15, closePercent: 30 },
				);
			}

			if (symbolParams.peakDrawdownProtection) {
				// 检查峰值回落阶段设置
				const { stage1, stage2, stage3 } = symbolParams.peakDrawdownProtection;
				if (!stage1 || !stage2 || !stage3) {
					logger.warn(
						`⚠️  币种 ${symbol} 峰值回落保护阶段设置不完整，正在修复...`,
					);
					// 修复阶段设置
					await setPeakDrawdownParams(
						strategy,
						symbol,
						stage1 || { drawdownThreshold: 1.0, closePercent: 30 },
						stage2 || { drawdownThreshold: 2.0, closePercent: 50 },
						stage3 || { drawdownThreshold: 3.0, closePercent: 100 },
						5,
					);
				}
			} else if (symbolParams.peakDrawdown) {
				// 如果没有设置峰值回落保护参数，设置默认值
				logger.warn(
					`⚠️  币种 ${symbol} 缺少峰值回落保护参数，正在设置默认值...`,
				);
				await setPeakDrawdownParams(
					strategy,
					symbol,
					{ drawdownThreshold: 1.0, closePercent: 30 },
					{ drawdownThreshold: 2.0, closePercent: 50 },
					{ drawdownThreshold: 3.0, closePercent: 100 },
					3,
				);
			} else if (symbolParams.drawdownProtection) {
				// 如果没有动态止损参数，设置默认值
				logger.warn(`⚠️  币种 ${symbol} 缺少动态止损参数，正在设置默认值...`);
				await setDynamicStopLossParams(
					strategy,
					symbol,
					3, // 动态止损阈值
					30, // 评估间隔（分钟）,
					[], // 触发条件数组
				);
			}
		}

		logger.info("✅ 阶段对应关系修复完成，实现了差异化回落保护");
	} catch (error) {
		logger.error("❌ 修复阶段对应关系失败:", error);
	}
}
