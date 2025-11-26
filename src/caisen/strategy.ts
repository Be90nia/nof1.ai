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

import type {
	StrategyParams,
	StrategyPromptContext,
} from "../strategies/types";

/**
 * 蔡森策略配置
 *
 * 策略特点：
 * - 风险等级：中等风险
 * - 杠杆范围：60%-85% 最大杠杆
 * - 仓位大小：20-27%
 * - 适用人群：稳健投资者，追求持续稳定收益
 * - 目标月回报：15-25%（通过多维度分析和精准买卖点实现）
 * - 交易频率：中等，精选高胜率机会
 *
 * 核心策略：
 * - 多时间框架分析：综合日线、小时线和5分钟线分析，提高信号准确性
 * - 七分位策略引擎：专门针对暴跌后的反弹机会，通过七分位水平计算和价格位置分析
 * - 动态点位交易系统：计算成交量密集区、斐波那契回撤位，生成精准入场点位
 * - AI动态订单执行器：智能入场/出场系统，动态调整仓位和止损止盈
 * - 风险管理：多层次风险管理机制，单笔交易最大风险1%，单日最大损失5%
 *
 * @param maxLeverage - 系统允许的最大杠杆倍数（从配置文件读取）
 * @returns 蔡森策略的完整参数配置
 */
export function getCaiSenStrategy(maxLeverage: number): StrategyParams {
	// 蔡森策略：使用 60%-85% 的最大杠杆
	const caiSenLevMin = Math.max(3, Math.ceil(maxLeverage * 0.6)); // 最小杠杆：60%最大杠杆，至少3倍
	const caiSenLevMax = Math.max(5, Math.ceil(maxLeverage * 0.85)); // 最大杠杆：85%最大杠杆，至少5倍

	// 计算不同信号强度下推荐的杠杆倍数
	const caiSenLevNormal = caiSenLevMin; // 普通信号：使用最小杠杆
	const caiSenLevGood = Math.ceil((caiSenLevMin + caiSenLevMax) / 2); // 良好信号：使用中间值
	const caiSenLevStrong = caiSenLevMax; // 强信号：使用最大杠杆

	return {
		// ==================== 策略基本信息 ====================
		name: "蔡森策略",
		description:
			"多时间框架分析+七分位策略引擎+动态点位交易系统，精准捕捉买卖点和暴跌后反弹机会，适合稳健投资者",

		// ==================== 杠杆配置 ====================
		// 使用 60%-85% 最大杠杆（中等风险）
		leverageMin: caiSenLevMin,
		leverageMax: caiSenLevMax,
		leverageRecommend: {
			normal: `${caiSenLevNormal}倍`, // 普通信号：使用最小杠杆
			good: `${caiSenLevGood}倍`, // 良好信号：使用中等杠杆
			strong: `${caiSenLevStrong}倍`, // 强信号：使用最大杠杆
		},

		// ==================== 仓位配置 ====================
		// 20-27%（中等风险，稳健）
		positionSizeMin: 20,
		positionSizeMax: 27,
		positionSizeRecommend: {
			normal: "20-23%", // 普通信号：较小仓位
			good: "23-25%", // 良好信号：中等仓位
			strong: "25-27%", // 强信号：最大仓位
		},

		// ==================== 止损配置 ====================
		// 中等风险下的止损设置
		stopLoss: {
			low: -15, // 低杠杆（如3-10倍）：亏损15%止损
			mid: -10, // 中杠杆（如11-20倍）：亏损10%止损
			high: -8, // 高杠杆（如21-30倍）：亏损8%止损
		},

		// ==================== 移动止盈配置 ====================
		// 盈利后移动止损线保护利润
		trailingStop: {
			level1: { trigger: 20, stopAt: 12 }, // 盈利达到20%时，止损线移至12%
			level2: { trigger: 40, stopAt: 25 }, // 盈利达到40%时，止损线移至25%
			level3: { trigger: 60, stopAt: 40 }, // 盈利达到60%时，止损线移至40%
		},

		// ==================== 分批止盈配置 ====================
		// 逐步锁定利润
		partialTakeProfit: {
			stage1: { trigger: 15, closePercent: 30 }, // +15%时平仓30%
			stage2: { trigger: 30, closePercent: 50 }, // +30%时平仓50%（累计80%）
			stage3: { trigger: 50, closePercent: 100 }, // +50%时全部清仓
		},

		// ==================== 峰值回撤保护 ====================
		// 盈利从峰值回撤时触发保护
		peakDrawdownProtection: 30, // 从峰值回撤30%时触发保护

		// ==================== 波动率调整 ====================
		// 根据市场波动自动调整杠杆和仓位
		volatilityAdjustment: {
			highVolatility: {
				leverageFactor: 0.7, // 高波动时，杠杆降低30%
				positionFactor: 0.8, // 高波动时，仓位降低20%
			},
			normalVolatility: {
				leverageFactor: 1.0, // 正常波动时，不调整
				positionFactor: 1.0,
			},
			lowVolatility: {
				leverageFactor: 1.1, // 低波动时，杠杆提高10%
				positionFactor: 1.05, // 低波动时，仓位提高5%
			},
		},

		// ==================== 策略规则描述 ====================
		entryCondition:
			"多时间框架分析确认+七分位策略信号，暴跌后在1/7或1/2区域考虑做多，突破高点考虑追涨",
		riskTolerance:
			"单笔交易风险最大1%账户资金，单日最大损失5%，动态止损+分批止盈",
		tradingStyle:
			"多维度分析+精准买卖点+暴跌反弹策略，中等频率交易，注重风险控制",

		// ==================== 代码级保护开关 ====================
		enableCodeLevelProtection: true,
		allowAiOverrideProtection: true,

		// ==================== 蔡森策略特定参数 ====================
		caiSen: {
			// 多时间框架分析参数
			timeframeAnalysis: {
				dailyWeight: 0.5, // 日线权重
				hourlyWeight: 0.3, // 小时线权重
				fiveMinWeight: 0.2, // 5分钟线权重
				trendConfirmationThreshold: 0.7, // 趋势确认阈值
			},

			// 七分位策略参数
			sevenSegmentStrategy: {
				crashDetectionThreshold: -15, // 暴跌检测阈值
				calculationPeriod: 24, // 计算周期（小时）
				recoveryConfidence: {
					zone1_7: 0.85, // 1/7区域置信度
					zone1_2: 0.6, // 1/2区域置信度
					zone6_7: 0.65, // 6/7区域置信度
				},
			},

			// 动态点位交易参数
			dynamicPointTrading: {
				fibonacciLevels: [0.382, 0.5, 0.618], // 斐波那契回撤位
				volatilityAdjustment: 0.2, // 波动率调整系数
				volumeProfileWeight: 0.3, // 成交量密集区权重
			},

			// AI动态订单执行参数
			aiOrderExecution: {
				signalWeights: {
					trend: 0.4, // 趋势信号权重
					breakout: 0.3, // 突破信号权重
					rsi: 0.3, // RSI指标权重
				},
				confidenceThresholds: {
					high: 0.8, // 高信心度阈值
					medium: 0.5, // 中信心度阈值
				},
				slippageAdjustment: 0.001, // 滑点调整比例
			},

			// 风险管理参数
			riskManagement: {
				atrPeriod: 14, // ATR计算周期
				stopLossCoefficient: 2.0, // 止损系数
				volatilityFactor: 1.5, // 波动率调整因子
				batchTakeProfitRatios: [1.0, 2.0, 3.0], // 分批止盈比例
			},
		},
	};
}

/**
 * 生成蔡森策略特有的提示词
 *
 * @param params - 策略参数配置
 * @param context - 运行时上下文
 * @returns 蔡森策略专属的AI提示词
 */
export function generateCaiSenPrompt(
	params: StrategyParams,
	context: StrategyPromptContext,
): string {
	// 计算杠杆推荐值（用于提示词）
	const levMin = params.leverageMin;
	const levMax = params.leverageMax;
	const levNormal = levMin;
	const levGood = Math.ceil((levMin + levMax) / 2);
	const levStrong = levMax;

	return `
【蔡森策略 - 多时间框架分析+七分位策略引擎】

你的角色：蔡森策略AI交易专家
- 你需要综合多时间框架分析、七分位策略和动态点位交易系统
- 精准捕捉买卖点和暴跌后的反弹机会
- 严格执行风险管理，保护账户资金

🎯 【多时间框架分析体系】
这是蔡森策略的基础，必须按顺序分析：

▶ 日线趋势分析（权重50%）：
  - 作用：判断市场主趋势方向和强度
  - 分析指标：EMA12/26、MACD、RSI
  - 趋势判断：连续3根K线在EMA同侧为趋势确认
  - 强势信号：价格距离EMA>1%且MACD柱状图连续同向扩大

▶ 小时线方向确认（权重30%）：
  - 作用：验证日线趋势是否延续
  - 分析指标：EMA20、MACD、成交量
  - 确认条件：至少1个指标与日线方向一致
  - 背离警示：价格新高但MACD或RSI未创新高

▶ 5分钟线买卖点分析（权重20%）：
  - 作用：确定具体入场和出场点位
  - 分析指标：RSI、布林带、成交量
  - 买入信号：RSI<30后回升+成交量放大+突破布林带下轨
  - 卖出信号：RSI>70后回落+成交量放大+突破布林带上轨

🎯 【七分位策略引擎】
专门针对暴跌后的反弹机会：

▶ 暴跌检测：
  - 暴跌定义：4小时内价格下跌超过15%
  - 触发条件：检测到暴跌后启动七分位分析
  - 数据记录：记录暴跌前最高价和最低价

▶ 七分位水平计算：
  - 七分位单位 = (暴跌前最高价 - 暴跌前最低价) / 7
  - 1/7区域：暴跌前最低价 + 七分位单位 * 1
  - 2/7区域：暴跌前最低价 + 七分位单位 * 2
  - 3/7区域：暴跌前最低价 + 七分位单位 * 3
  - 4/7区域：暴跌前最低价 + 七分位单位 * 4
  - 5/7区域：暴跌前最低价 + 七分位单位 * 5
  - 6/7区域：暴跌前最低价 + 七分位单位 * 6
  - 7/7区域：暴跌前最高价

▶ 价格位置分析：
  - 确定当前价格在七分位中的位置
  - 1/7区域：超卖反弹，HIGH信心做多
  - 1/2区域：中等支撑，MEDIUM信心做多
  - 6/7区域：反弹阻力，MEDIUM信心做空
  - 突破高点：趋势反转，HIGH信心做多

▶ 恢复交易计划：
  - 阶段1：超跌反弹（1-4小时，高风险）
  - 阶段2：震荡整理（4-12小时，中风险）
  - 阶段3：趋势恢复（12-24小时，低风险）

🎯 【动态点位交易系统】
精准计算入场和出场点位：

▶ 动态点位计算：
  - 斐波那契回撤位：0.618、0.500、0.382
  - 成交量密集区：分析过去100根K线的成交量分布
  - 动态入场点位：基础点位 ± ATR * 调整系数

▶ 动态仓位管理：
  - 基础仓位 = 账户资金 * 风险比例 / 单笔最大损失
  - 信心度调整：HIGH*1.2、MEDIUM*1.0、LOW*0.6
  - 波动率调整：高波动*0.6、中等波动*0.7、低波动*1.2
  - 金字塔加仓：价格有利移动1.5%时加仓30%

🎯 【AI动态订单执行器】
智能执行入场和出场：

▶ 智能入场系统：
  - 开仓信号总得分 = 趋势信号权重 * 趋势得分 + 突破信号权重 * 突破得分 + 指标权重 * RSI得分
  - 信心度级别：HIGH(得分>0.8) / MEDIUM(0.5-0.8) / LOW(<0.5)
  - 调整后入场价格 = 原始入场价格 * (1 ± 滑点调整比例)

▶ 智能出场系统：
  - 移动止损更新条件：盈利达到目标的N%且价格继续向有利方向移动
  - 移动止损点位 = 入场价格 + (当前价格 - 入场价格) * 止损锁定比例
  - 分批止盈数量 = 总仓位 * 每批止盈比例

▶ 多币种交易管理：
  - 币种综合评分 = 趋势强度 * 0.3 + 波动率评分 * 0.2 + 交易量评分 * 0.2 + 相关性评分 * 0.15 + 风险评分 * 0.15
  - 资金分配比例 = 币种评分 / 所有币种评分总和 * 100%
  - 最大单币种资金比例 = 总资金 * 单币种最大比例限制

🎯 【风险管理规则】
严格执行风险控制：

▶ 单笔交易风险：最大1%账户资金
▶ 单日最大损失：5%账户资金
▶ 单笔最大损失：3%账户资金
▶ 动态止损 = 入场价格 - ATR * 止损系数 * 波动率调整（多头）
▶ 动态止损 = 入场价格 + ATR * 止损系数 * 波动率调整（空头）
▶ 分批止盈位：第一目标1.0倍、第二目标2.0倍、第三目标3.0倍风险回报比

🎯 【执行流程】
严格按照以下步骤执行：

1. 数据获取：获取日线、小时线和5分钟线K线数据
2. 多时间框架分析：日线趋势分析、小时线方向确认、5分钟线买卖点分析
3. 七分位策略分析：暴跌检测、七分位水平计算、价格位置分析、恢复信号生成
4. 动态点位计算：支撑阻力位、入场点位、止损止盈位
5. 动态仓位计算：根据信号信心度、波动率和市场状况计算仓位大小
6. 订单执行：取消未成交订单、执行入场订单、设置条件单
7. 持仓管理：监控订单状态、动态调整止损、金字塔加仓、分批止盈
8. 绩效跟踪：记录交易决策、计算绩效指标、生成策略报告

⚠️ 【蔡森策略铁律】
1. 多时间框架分析必须按顺序进行，日线趋势优先
2. 暴跌后必须启动七分位分析，1/7区域是黄金做多机会
3. 严格执行风险管理，单笔风险不超过1%
4. 动态止损必须及时调整，保护本金和利润
5. 分批止盈必须执行，锁定利润避免回吐

【当前配置】
- 杠杆范围：${levMin}-${levMax}倍
- 仓位大小：${params.positionSizeMin}-${params.positionSizeMax}%
- 止损设置：低杠杆${params.stopLoss.low}%、中杠杆${params.stopLoss.mid}%、高杠杆${params.stopLoss.high}%
- 分批止盈：+${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，+${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，+${params.partialTakeProfit.stage3.trigger}%全部清仓

记住：蔡森策略的核心是多维度分析和精准点位，严格执行策略流程，才能实现稳定收益。
`;
}
