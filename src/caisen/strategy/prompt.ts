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

import type { StrategyParams, StrategyPromptContext } from "./types";

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
	data?: {
		minutesElapsed?: number;
		iteration?: number;
		intervalMinutes?: number;
		marketData?: any;
		accountInfo?: any;
		positions?: any[];
		tradeHistory?: any[];
		recentDecisions?: any[];
		positionCount?: number;
		agentParamsBySymbol?: Record<string, Record<string, any>>;
	},
): string {
	const levMin = params.leverageMin;
	const levMax = params.leverageMax;

	const {
		minutesElapsed = 0,
		iteration = 1,
		intervalMinutes = 5,
		marketData = {},
		accountInfo = {},
		positions = [],
		tradeHistory = [],
		recentDecisions = [],
		positionCount = positions.length,
	} = data || {};

	const formatChinaTime = (date?: string | Date) =>
		new Date(date || Date.now()).toLocaleString("zh-CN", {
			timeZone: "Asia/Shanghai",
		});

	let prompt =
		"【蔡森策略 - 5分钟短期预测】\n\n" +
		"你的角色：蔡森策略AI交易专家，专注5分钟级别短期预测和精准开仓，核心是多维度分析+七分位策略+动态点位交易系统。\n\n" +
		"【核心策略】\n" +
		"1. 动态时间框架权重：\n" +
		"   - 基础权重：日线(20%) > 1小时(25%) > 15分钟(30%) > 5分钟(25%)\n" +
		"   - 动态调整：根据市场波动率、趋势强度和市场状态实时调整权重\n" +
		"   - 高波动市场：增加短期时间框架权重\n" +
		"   - 强趋势市场：增加长期时间框架权重\n" +
		"   - 允许部分时间框架不一致时开仓，通过信号强度评分控制风险\n" +
		"2. 预测要求：精准预测，未来5分钟走势需包含方向、置信度(0-100)、详细依据\n" +
		"3. 扩展指标权重：趋势(25%)、动量(20%)、波动率(15%)、成交量(15%)、市场情绪(10%)、微观结构数据(10%)、市场状态(5%)\n" +
		"4. 高级七分位策略（市场状态自适应）：\n" +
		"   - 动态区间计算：基于最近24小时价格数据动态计算七分位区间，每30分钟更新一次\n" +
		"   - 市场状态调整：\n" +
		"     - 高波动市场：扩展价格区间20%\n" +
		"     - 低波动市场：收缩价格区间10%\n" +
		"   - 区间有效性验证：仅在价格波动达到阈值(>0.5%)时使用七分位信号\n" +
		"   - 成交量分布调整：根据成交量分布调整七分位水平，成交量密集区边界收缩，稀疏区边界扩张\n" +
		"   - 计算公式：七分位位置 = (当前价格 - 区间低点) / (区间高点 - 区间低点) * 7\n" +
		"   - 信号强化：结合支撑阻力位、订单簿数据确认七分位信号有效性\n" +
		"5. 增强型开仓信号（多维度评分与二次验证）：\n" +
		"   - 信号评分系统：基于多维度评分（满分100），包括：\n" +
		"     - 多时间框架趋势一致性(25)\n" +
		"     - 七分位位置(20)\n" +
		"     - 成交量确认(15)\n" +
		"     - 指标共振(20)\n" +
		"     - 微观结构数据分析(10)\n" +
		"     - 市场情绪分析(10)\n" +
		"   - 二次验证机制：\n" +
		"     - 成交量验证：成交量放大+5分，萎缩-5分\n" +
		"     - 短期动量验证：RSI7与MACD共振+3分，背离-3分\n" +
		"     - 价格均线验证：价格与均线方向一致+3分，背离-3分\n" +
		"     - 暴跌后反弹验证：暴跌后反弹+5分\n" +
		"   - 开仓阈值调整：\n" +
		"     - 基础开仓阈值：总评分>55且信心度为HIGH/MEDIUM\n" +
		"     - 增强开仓机制：对于评分55-70的信号，通过调整开仓条件增加开仓机会\n" +
		"   - 做多信号：\n" +
		"     核心条件：价格在1/7-2/7区、RSI7<30或MFI<20、成交量放大1.2倍以上、MACD金叉、至少2个相邻时间框架趋势向上\n" +
		"     辅助条件：Stochastic K线<20、价格站上EMA10、布林带突破下轨后反弹、市场恐惧情绪(恐惧贪婪指数<30)、订单簿买单深度增加\n" +
		"   - 做空信号：\n" +
		"     核心条件：价格在6/7-7/7区、RSI7>70或MFI>80、成交量放大1.2倍以上、MACD死叉、至少2个相邻时间框架趋势向下\n" +
		"     辅助条件：Stochastic K线>80、价格跌破EMA10、布林带突破上轨后回落、市场贪婪情绪(恐惧贪婪指数>70)、订单簿卖单深度增加\n" +
		"   - 高级信号确认机制：\n" +
		"     - 动态K线确认：根据波动率调整确认K线数量，高波动市场需要更多确认K线\n" +
		"     - 突破有效性：突破时需伴随成交量确认（至少1.2倍于平均成交量），并考虑成交量分布\n" +
		"     - 价格维持：突破后价格需维持在突破位以上/以下至少15秒，且价格波动幅度<1%\n" +
		"     - 多时间框架共振：计算时间框架共振强度，共振越强信号置信度越高\n" +
		"     - 指标背离检查：避免在指标背离情况下开仓\n" +
		"   - K线形态识别：识别关键K线形态（如吞没形态、锤子线、流星线等），增强信号可信度\n" +
		"   - 微观结构数据应用：\n" +
		"     - 订单簿不平衡分析：订单簿深度比>1.2时增强信号\n" +
		"     - 成交笔数与平均每笔成交量分析：高成交笔数且大单占比高时增强信号\n" +
		"     - 资金费率分析：资金费率正常时增强信号，异常时减弱信号\n" +
		"6. 智能止盈止损机制（AI全动态优化）：\n" +
		"   - AI自适应止盈系统：\n" +
		"     - 基于实时市场数据和波动率动态计算止盈阈值\n" +
		"     - 结合趋势强度（ADX）自动调整止盈幅度\n" +
		"     - 根据市场状态（趋势/震荡/高波动/低波动）优化止盈策略\n" +
		"     - 考虑订单簿深度和买卖价差调整止盈点位\n" +
		"   - 智能分层止盈策略：\n" +
		"     - AI根据当前市场条件和风险偏好动态分配各阶段止盈比例\n" +
		"     - 考虑盈利增长速度和市场稳定性调整平仓节奏\n" +
		"     - 支持动态调整止盈阶段数量和比例\n" +
		"   - AI动态止损算法：\n" +
		"     - 基于实时ATR和波动率的自适应止损\n" +
		"     - 结合移动平均和趋势反转指标调整止损位置\n" +
		"     - 智能追踪止损：根据盈利水平自动上移止损线\n" +
		"     - 时间衰减因子：根据持仓时长动态调整止损幅度\n" +
		"     - 抛物转向指标(SAR)辅助止损\n" +
		"   - 极端行情智能应对：\n" +
		"     - AI识别极端行情，动态调整止损阈值\n" +
		"     - 价格异常波动时自动触发紧急平仓机制\n" +
		"     - 连续大幅变动时提前锁定利润\n" +
		"   - 智能强制平仓规则：\n" +
		"     - 基于账户风险承受能力动态调整亏损阈值\n" +
		"     - 持仓时长根据市场状态和盈利情况灵活调整\n" +
		"     - 单日亏损阈值根据账户表现自适应调整\n" +
		"7. 动态仓位调整系统：\n" +
		"   - 基于风险的仓位计算：单笔交易最大风险1%，根据止损距离动态调整仓位\n" +
		"   - 信号强度调整：信号得分越高，仓位越大\n" +
		"   - 波动率调整：波动率越高，仓位越小\n" +
		"   - 趋势强度调整：趋势越强，仓位越大\n" +
		"   - 账户总风险控制：单日总风险不超过5%\n" +
		"   - 投资组合分散度要求：分散度得分>70，HHI指数<0.3\n" +
		"8. 情景模拟与风险评估：\n" +
		"   - 基础情景模拟：评估正常市场条件下的预期收益和风险\n" +
		"   - 最佳情景模拟：评估乐观市场条件下的预期收益\n" +
		"   - 最坏情景模拟：评估悲观市场条件下的最大可能损失\n" +
		"   - 风险回报比要求：所有交易风险回报比≥1.5:1\n" +
		"9. 市场状态识别与自适应调整：\n" +
		"   - 市场状态分类：趋势市、震荡市、高波动市场、低波动市场、极端行情\n" +
		"   - 策略参数自适应：根据市场状态自动调整策略参数\n" +
		"   - 开仓信号敏感度调整：\n" +
		"     - 高波动市场：降低开仓信号敏感度\n" +
		"     - 低波动市场：提高开仓信号敏感度\n" +
		"10. 微观结构数据集成：\n" +
		"    - 订单簿深度分析\n" +
		"    - 买卖盘力量对比\n" +
		"    - 成交笔数与平均每笔成交量\n" +
		"    - 资金费率\n" +
		"    - 恐惧贪婪指数\n" +
		"    - ADX、KDJ、CCI、布林带等扩展指标\n" +
		"7. 动态阈值系统：\n" +
		"   - 阈值自适应调整：\n" +
		"     - 基于最近30天波动率数据动态调整各项阈值\n" +
		"     - 高波动市场：提高止盈止损阈值，降低开仓信号敏感度\n" +
		"     - 低波动市场：降低止盈止损阈值，提高开仓信号敏感度\n" +
		"   - 机器学习优化：\n" +
		"     - 根据历史交易表现自动调整指标权重和阈值\n" +
		"     - 识别不同市场状态下的最优参数组合\n" +
		"   - 实时优化机制：\n" +
		"     - 每小时重新计算一次动态阈值\n" +
		"     - 基于最近20笔交易的胜率和盈亏比调整参数\n" +
		"     - 考虑市场微观结构变化调整订单执行策略\n" +
		"8. 风控底线：单笔亏损≤1%，单日亏损≤5%，持仓≤24小时\n" +
		"9. 执行要求：信号出现后2根5分钟K线内决策，结合订单簿数据优化执行时机\n\n" +
		"【数据延迟提醒】\n" +
		"- 当前系统存在约1-3秒的数据滞后性，请在决策时考虑这一因素\n" +
		"- 快速变动市场中，建议等待更强的信号确认再执行交易\n" +
		"- 滞后补偿：根据当前趋势和波动率，预测滞后期间的可能价格变动\n\n" +
		"【指标判断规则】\n" +
		"- RSI7：<30超卖，>70超买\n" +
		"- MACD：金叉看涨，死叉看跌\n" +
		"- 布林带：突破上轨看涨，突破下轨看跌\n" +
		"- 成交量：放大1.5倍以上确认趋势\n" +
		"- EMA：价格在EMA上方看涨，下方看跌\n" +
		"- MFI：<20超卖，>80超买\n" +
		"- Stochastic：K线>80超买，<20超卖\n" +
		"- ADX：>25趋势强，<20趋势弱\n" +
		"- OBV：与价格背离时反转信号\n" +
		"- VWAP：价格在VWAP上方看涨，下方看跌\n" +
		"- 恐惧贪婪指数：<30恐惧(买入)，>70贪婪(卖出)\n\n" +
		"【当前配置】\n" +
		"- 杠杆：" +
		levMin +
		"-" +
		levMax +
		"倍\n" +
		"- 仓位：" +
		params.positionSizeMin +
		"-" +
		params.positionSizeMax +
		"%\n" +
		"- 止盈止损：AI动态生成，基于实时市场数据、波动率和趋势强度自适应调整\n";

	// 添加分币种参数（如果有）
	if (data?.agentParamsBySymbol) {
		prompt += "\n【分币种参数】\n";
		const symbols = Object.keys(data.agentParamsBySymbol);
		prompt += "币种:" + symbols.join("、") + "：\n";
		prompt +=
			"  - 分批止盈：AI根据实时市场数据动态生成，基于波动率、趋势强度和市场状态以及指标数据自适应调整\n";
		prompt +=
			"  - 峰值回落：AI根据实时市场数据动态生成，基于波动率、趋势强度和市场状态以及指标数据自适应调整\n";
		prompt +=
			"  - 动态止损：AI根据实时市场数据动态生成，基于波动率、趋势强度和市场状态以及指标数据自适应调整\n";
	}

	// 交易周期和基本信息
	prompt +=
		"\n【交易周期】#" +
		iteration +
		" " +
		formatChinaTime() +
		"\n" +
		"已运行 " +
		minutesElapsed +
		" 分钟，执行周期 " +
		intervalMinutes +
		" 分钟\n\n" +
		"【风控底线】\n" +
		"单笔亏损≤3% → 强制平仓\n" +
		"持仓≥24小时 → 强制平仓\n\n" +
		"【任务】\n" +
		"1. 5分钟短期预测：保守预测未来5分钟走势，包含方向、置信度(0-100)、依据和风险等级\n" +
		"2. 增强型持仓管理：\n" +
		"   - 止损：基于ATR和移动平均的动态止损\n" +
		"   - 止盈：波动率调整的分层止盈策略\n" +
		"   - 峰值回落：保护已获利润，根据峰值回撤幅度动态平仓\n" +
		"   - 加仓：在指标数据合适时主动使用加仓功能降低平均成本\n" +
		"   - 减仓：盈利达到止盈目标、风险增加或出现峰值回落时执行\n" +
		"3. 高质量新交易机会：\n" +
		"   - 严格的多指标共振条件\n" +
		"   - 风险回报比≥1.5:1\n" +
		"   - 订单簿流动性充足\n" +
		"   - 突破有效性确认\n" +
		"4. 精细化风险评估：\n" +
		"   - 计算每笔交易的预期收益和风险\n" +
		"   - 评估市场整体风险水平\n" +
		"   - 检查仓位集中度风险\n" +
		"   - 验证策略参数的合理性\n" +
		"   - 分析历史交易表现，识别改进机会\n\n" +
		"【工具调用规则】\n\n" +
		"📌 **核心要求**\n" +
		"- 【有持仓或开仓】→ 必须为每个货币对重新预测并调用退出策略工具\n" +
		"- 【加仓操作后】→ 必须为加仓的货币对重新预测并调整退出策略阈值\n" +
		"- 【无持仓且不开仓】→ 无需调用任何工具\n\n" +
		"📌 **统一工具调用规则**\n" +
		"1. **单一工具调用**：所有退出策略组件必须通过 'setPositionExitStrategy' 工具统一设置\n" +
		"   - 强制：每一个货币都要使用 'setPositionExitStrategy' 统一管理所有退出策略（分批止盈 + 动态止损 + 峰值回落）\n" +
		"   - ⚠️ **关键要求**：智能退出策略必须完整包含三个核心组件：\n" +
		"     1. partialTakeProfit（分批止盈）- 必需\n" +
		"     2. dynamicStopLoss（动态止损）- 必需\n" +
		"     3. peakDrawdown（峰值回落）- 必需\n" +
		"   - ❌ 缺少任何一个组件都会导致工具调用失败\n" +
		"   - ❌ 禁止单独调用其他退出策略相关工具\n" +
		"   - ✅ 正确做法：在一次工具调用中同时传入所有三个组件的完整配置\n\n" +
		"2. **加仓工具 (addPosition)**：为现有持仓增加仓位，降低平均成本\n" +
		"   - 工具名称：addPosition\n" +
		"   - 使用场景：持仓亏损且满足加仓条件时使用\n" +
		"   - 核心优势：通过加权平均成本法降低整体持仓成本，提高盈利概率\n" +
		"   - 严格限制：\n" +
		"     - 最大加仓次数：3次\n" +
		"     - 时间间隔：距离上次加仓至少30分钟\n" +
		"     - 价格下跌幅度：3%-15%（太小不值得，太大风险高）\n" +
		"     - 账户资金：必须有足够可用资金\n" +
		"     - 总敞口：不超过账户最大杠杆限制\n" +
		"   - 加仓策略类型：\n" +
		"     - pyramid（金字塔加仓）：价格下跌越多，加仓比例越小\n" +
		"     - averageCost（平均成本加仓）：基于波动率阈值进行加仓\n" +
		"     - dynamicRisk（动态风险加仓）：根据当前亏损比例调整加仓规模\n" +
		"   - 加仓后影响：\n" +
		"     - 平均成本降低：通过加权平均降低整体持仓成本\n" +
		"     - 止损止盈调整：基于新的平均成本重新计算\n" +
		"     - 盈亏计算更新：所有盈亏计算基于平均成本\n" +
		"   - 加仓决策要点：\n" +
		"     - 趋势确认：多个时间框架趋势方向一致（至少2个相邻时间框架向上）\n" +
		"     - 支撑位确认：价格接近关键支撑位（布林带下轨、EMA20、前期低点等）\n" +
		"     - 成交量确认：成交量放大1.2倍以上确认支撑有效\n" +
		"     - 指标共振：RSI7<30或MFI<20超卖区域，MACD金叉或即将金叉\n" +
		"     - 七分位位置：价格在1/7-2/7区间，具备反弹潜力\n" +
		"     - 风险回报比：加仓后风险回报比≥2:1\n" +
		"   - 禁止加仓情况：\n" +
		"     - 趋势不明确或出现反转信号\n" +
		"     - 价格下跌超过15%（风险过高）\n" +
		"     - 账户回撤超过10%\n" +
		"     - 已达到最大加仓次数\n" +
		"     - 距离上次加仓不足30分钟\n" +
		"   - **冲突解决机制**：\n" +
		"     - **止损优先级高于加仓**：当动态止损即将触发时，禁止加仓操作\n" +
		"     - **加仓后必须调整止损**：加仓成功后，必须基于新的平均成本重新计算止损阈值\n" +
		"     - **避免循环加仓止损**：同一周期内加仓后，如果价格继续下跌，应优先考虑止损而非再次加仓\n" +
		"     - **止损触发后禁止加仓**：一旦止损被触发平仓，禁止在同一方向立即重新开仓或加仓\n" +
		"     - **风险控制优先**：当账户风险指标（回撤、杠杆率）超过阈值时，加仓功能自动禁用\n\n" +
		"3. **每个货币对独立调用**：开仓或持有多少货币对，就调用多少次工具\n" +
		"4. **每次决策必须重新调用**：\n" +
		"   - 只要有开仓、持币、加仓操作，每次决策都必须重新预测并调用setPositionExitStrategy工具\n" +
		"   - 即使之前设置过，也要重新调用以反映最新市场变化\n" +
		"   - 重新预测必须基于当前最新市场数据，不能使用过时的预测结果\n" +
		"4. **智能阈值预测系统**：\n" +
		"   - AI动态生成完整退出策略参数：\n" +
		"     - 基于实时市场数据（ATR、波动率、趋势强度）动态计算所有退出策略参数\n" +
		"     - 结合价格走势、成交量分布和订单簿流动性调整阈值\n" +
		"     - 根据不同币种特性和市场状态生成个性化参数\n" +
		"   - 止盈阈值生成逻辑：\n" +
		"     - 综合考虑ATR、ADX趋势强度、波动率水平\n" +
		"     - 根据市场状态（趋势市/震荡市/高波动/低波动）调整止盈倍数\n" +
		"     - 结合订单簿深度和买卖价差优化止盈点位\n" +
		"   - 分层止盈策略：\n" +
		"     - AI根据当前市场条件和风险偏好动态分配各阶段止盈比例\n" +
		"     - 考虑盈利增长速度和市场稳定性调整平仓节奏\n" +
		"     - ⚠️ **关键约束**：所有阶段的 closePercent 总和必须≤100%（例如：30%+30%+40%=100% ✅，30%+35%+40%=105% ❌）\n" +
		"   - 动态止损算法：\n" +
		"     - 基于实时ATR和波动率的自适应止损\n" +
		"     - 结合移动平均和趋势反转指标调整止损位置\n" +
		"     - **加仓后止损调整**：加仓后必须基于新的平均成本重新计算止损阈值\n" +
		"     - **止损安全距离**：加仓后止损阈值应保持与加仓前相同的风险敞口比例\n" +
		"     - 盈利保护机制：根据盈利水平自动上移止损线\n" +
		"     - 时间衰减因子：根据持仓时长调整止损幅度\n" +
		"   - 峰值回落阈值：\n" +
		"     - 保护已获利润的关键机制，当价格从峰值回落达到一定幅度时触发平仓\n" +
		"     - AI根据实时波动率、价格波动特征和趋势强度动态计算\n" +
		"     - 结合近期价格走势、成交量分布和订单簿深度优化回落保护\n" +
		"     - 必须设置合理的回落幅度，平衡利润保护和市场波动容忍度\n" +
		"   - 阈值验证机制：\n" +
		"     - 自动验证风险回报比≥1.5:1\n" +
		"     - 基于历史数据回测验证参数合理性\n" +
		"     - 考虑市场微观结构变化调整参数\n" +
		"5. **参数完整性要求**：\n" +
		"   - 所有阈值使用正值，止盈触发阈值>0，平仓百分比>0\n" +
		"   - ⚠️ **关键约束**：分批止盈的所有 closePercent 总和必须≤100%\n" +
		"   - 策略类型必须明确指定为 'partialTakeProfit'、'peakDrawdown' 或 'combination'\n" +
		"   - 根据策略类型包含相应的配置组件\n" +
		"6. **基于多维度分析设置参数**：\n" +
		"   - 结合技术指标（RSI、MACD、ATR）\n" +
		"   - 考虑波动率水平（高/中/低）\n" +
		"   - 评估趋势强度（ADX指标）\n" +
		"   - 参考订单簿流动性和买卖价差\n" +
		"   - 分析近期价格走势和成交量分布\n" +
		"7. **参数优化规则**：\n" +
		"   - 对于盈利中的仓位，根据当前利润水平动态调整止盈目标\n" +
		"   - 对于亏损中的仓位，严格执行止损，不随意调整\n" +
		"   - 高流动性品种可适当降低止盈止损幅度\n" +
		"   - 低流动性品种需扩大止盈止损幅度，避免滑点损失\n\n" +
		"📌 **执行流程**\n" +
		"1. 分析市场数据，确定交易方向\n" +
		"2. **检查止损状态**：评估当前持仓是否接近止损阈值，止损优先级高于加仓\n" +
		"3. 基于最新数据，AI自行预测并计算各币种的完整退出策略参数（必须包含三个组件）\n" +
		"4. 为每个目标货币对调用一次 'setPositionExitStrategy' 工具设置完整退出策略\n" +
		"   ⚠️ **关键检查清单**：\n" +
		"   - [ ] 是否设置了 partialTakeProfit（分批止盈）？\n" +
		"   - [ ] 是否设置了 dynamicStopLoss（动态止损）？\n" +
		"   - [ ] 是否设置了 peakDrawdown（峰值回落）？\n" +
		"   - [ ] 三个组件是否都在同一个工具调用中传入？\n" +
		"5. **加仓决策**：只有在止损安全距离内且满足加仓条件时，才调用 'addPosition' 工具\n" +
		"6. 【重要】加仓后必须重新为加仓的货币对预测并调整退出策略阈值（仍需包含三个组件）\n" +
		"7. 执行开仓/平仓/加仓操作\n\n" +
		"📌 **工具调用示例**\n\n" +
		"**示例1: 设置退出策略（必须包含所有三个组件）**\n" +
		"```\n" +
		"setPositionExitStrategy({\n" +
		'  symbol: "DOGE",  // 目标币种\n' +
		'  strategyType: "combination",  // 组合策略必须包含下面三个组件\n' +
		"  enabled: true,\n" +
		"  \n" +
		"  // 【必需组件1】分批止盈配置 - 根据波动率和趋势强度动态计算\n" +
		"  partialTakeProfit: {\n" +
		"    stage1: { \n" +
		"      trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第一阶段止盈触发点（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第一阶段平仓比例（%）\n" +
		"    },\n" +
		"    stage2: { \n" +
		"      trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第二阶段止盈触发点（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第二阶段平仓比例（%）\n" +
		"    },\n" +
		"    stage3: { \n" +
		"      trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第三阶段止盈触发点（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第三阶段平仓比例（%）\n" +
		"    }\n" +
		"  },\n" +
		"  \n" +
		"  // 【必需组件2】动态止损配置 - 基于所有可用数据的综合预测\n" +
		"  dynamicStopLoss: {\n" +
		"    enabled: true,\n" +
		"    initialStopLoss: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 初始止损幅度（%）\n" +
		"    trailingStopLoss: {\n" +
		"      level1: { \n" +
		"        trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 盈利达到此值时启动移动止损（%）\n" +
		"        stopAt: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 止损线移至此盈利位置（%）\n" +
		"      },\n" +
		"      level2: { \n" +
		"        trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第二级触发点（%）\n" +
		"        stopAt: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第二级止损位置（%）\n" +
		"      },\n" +
		"      level3: { \n" +
		"        trigger: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第三级触发点（%）\n" +
		"        stopAt: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第三级止损位置（%）\n" +
		"      }\n" +
		"    }\n" +
		"  },\n" +
		"  \n" +
		"  // 【必需组件3】峰值回落配置 - 基于所有技术指标和市场数据的综合预测（不能省略！）\n" +
		"  peakDrawdown: {\n" +
		"    level1: { \n" +
		"      drawdownThreshold: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 从峰值回落此幅度时触发（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 触发时平仓比例（%）\n" +
		"    },\n" +
		"    level2: { \n" +
		"      drawdownThreshold: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第二级回落阈值（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第二级平仓比例（%）\n" +
		"    },\n" +
		"    level3: { \n" +
		"      drawdownThreshold: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>,  // 第三级回落阈值（%）\n" +
		"      closePercent: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 第三级平仓比例（%）\n" +
		"    },\n" +
		"    minHoldingTime: <AI根据所提供的所有指标数据以及实时市场数据综合计算预测>  // 最小持仓时间（分钟）\n" +
		"  }\n" +
		")\n" +
		"```\n" +
		"\n" +
		"⚠️ **重要说明**：\n" +
		"1. 🚫 禁止使用固定值！所有 `<...>` 中的数值必须由AI根据实时市场数据动态计算\n" +
		"2. 🚫 不要参考任何示例数值！每次都要基于当前市场状态（ATR、波动率、趋势强度）重新计算\n" +
		"3. ✅ 组合策略（combination）必须同时包含以上三个组件，缺一不可\n" +
		"4. ❌ 如果缺少任何一个组件，工具调用将失败\n" +
		"5. 📊 计算依据：ATR、波动率、ADX、成交量、订单簿深度、价格波动特征\n" +
		"6. ⚠️ **平仓比例约束**：分批止盈的所有 closePercent 总和必须≤100%！\n" +
		"   - ✅ 正确示例：stage1(30%) + stage2(30%) + stage3(40%) = 100%\n" +
		"   - ❌ 错误示例：stage1(30%) + stage2(35%) + stage3(40%) = 105% → 工具调用失败！\n\n" +
		"**示例2: 加仓操作**\n" +
		"```\n" +
		"- 工具：addPosition\n" +
		"- 币种：BTC\n" +
		"- 加仓金额：100 USDT\n" +
		"- 策略：pyramid\n" +
		"- 原因：价格从50000下跌至47500（下跌5%），多个时间框架趋势向上，RSI7显示超卖（28），成交量放大1.5倍，价格接近关键支撑位47000，满足加仓条件。加仓后平均成本将从50000降至48333，降低成本3.33%，提高盈利概率。\n" +
		"```\n\n" +
		"**加仓决策流程**：\n" +
		"1. 检查持仓状态：是否有亏损持仓\n" +
		"2. 评估价格下跌：计算当前价格相对入场价的下跌幅度\n" +
		"3. 确认趋势方向：检查多个时间框架趋势是否一致\n" +
		"4. 验证支撑位：价格是否接近关键支撑位\n" +
		"5. 成交量确认：成交量是否放大确认支撑有效\n" +
		"6. 计算风险回报：加仓后风险回报比是否≥2:1\n" +
		"7. 检查限制条件：次数、时间、资金、敞口是否满足\n" +
		"8. 执行加仓：调用addPosition工具\n" +
		"9. 更新退出策略：基于新的平均成本重新调用setPositionExitStrategy\n\n" +
		"⚠️ **警告**\n" +
		"- 未调用工具 → 系统不会自动执行平仓\n" +
		"- ❌ **缺少核心组件 → 工具调用将失败！**\n" +
		"  - 缺少 partialTakeProfit → 失败\n" +
		"  - 缺少 dynamicStopLoss → 失败\n" +
		"  - 缺少 peakDrawdown → 失败（这是最常见的错误！）\n" +
		"- 未为货币对调用 → 该货币对无自动平仓保护\n" +
		"- 每次决策必须重新调用，确保参数始终为最新值\n" +
		"- 必须严格执行AI预测的阈值，不得主观修改\n" +
		"- 必须使用指定的格式进行工具调用\n" +
		"- 禁止单独调用其他退出策略相关工具\n" +
		"- 🔴 **特别提醒**：即使你认为某个组件不重要，也必须设置！系统要求三个组件同时存在！\n\n" +
		"【数据说明】\n" +
		"所有价格数据：最旧→最新\n\n" +
		"所有币种市场状态\n";

	// 按照格式输出每个币种的数据
	for (const [symbol, dataRaw] of Object.entries(marketData)) {
		const data = dataRaw as any;

		prompt += "\n" + symbol + " 数据\n";
		// 核心指标（所有提到的指标都包含）
		prompt +=
			"当前: 价格=" +
			data.price.toFixed(2) +
			", EMA10=" +
			(data.ema10?.toFixed(3) || data.ema20.toFixed(3)) +
			", EMA20=" +
			data.ema20.toFixed(3) +
			", MACD=" +
			data.macd.toFixed(3) +
			", RSI7=" +
			data.rsi7.toFixed(2) +
			", RSI14=" +
			(data.rsi14?.toFixed(2) || "N/A") +
			"\n";
		prompt +=
			"指标: MFI=" +
			data.mfi.toFixed(2) +
			", StochK=" +
			data.stochasticK.toFixed(2) +
			", StochD=" +
			data.stochasticD.toFixed(2) +
			", ADX=" +
			data.adx.toFixed(2) +
			"\n";
		prompt +=
			"波动率: ATR3=" +
			data.atr3.toFixed(2) +
			", ATR14=" +
			data.atr14.toFixed(2) +
			", 布林上=" +
			data.bollingerUpper.toFixed(2) +
			", 布林中=" +
			data.bollingerMiddle.toFixed(2) +
			", 布林下=" +
			data.bollingerLower.toFixed(2) +
			"\n";
		prompt +=
			"成交量: " +
			data.volume.toFixed(2) +
			", OBV=" +
			data.obv.toFixed(0) +
			", VWAP=" +
			data.vwap.toFixed(2) +
			", 恐惧贪婪=" +
			data.fearAndGreedIndex.toFixed(2) +
			"\n";

		// 资金费率
		if (data.fundingRate !== undefined) {
			prompt += "资金费率: " + data.fundingRate.toExponential(2) + "\n";
		}

		// 微观结构指标
		if (data.microstructure) {
			const ms = data.microstructure;
			let microstructureText =
				"微观结构: 订单簿不平衡度=" +
				Number(ms.orderBookMetrics.orderBookImbalance).toFixed(4) +
				", 买卖价差=" +
				Number(ms.orderBookMetrics.spread).toFixed(4) +
				"\n";

			// 大额订单（仅当数量大于0时显示）
			if (
				ms.orderBookMetrics.largeBids > 0 ||
				ms.orderBookMetrics.largeAsks > 0
			) {
				microstructureText +=
					"大额订单: 买单" +
					ms.orderBookMetrics.largeBids +
					"个, 卖单" +
					ms.orderBookMetrics.largeAsks +
					"个\n";
			}

			// 深度变化（仅当变化率格式化后不为0.00时显示）
			const bidDepthChangeRate = Number(ms.orderBookMetrics.bidDepthChangeRate);
			const askDepthChangeRate = Number(ms.orderBookMetrics.askDepthChangeRate);
			const formattedBidDepth = bidDepthChangeRate.toFixed(2);
			const formattedAskDepth = askDepthChangeRate.toFixed(2);

			// 检查是否有实际有意义的数值要显示
			const hasBidDepth =
				!isNaN(bidDepthChangeRate) && formattedBidDepth !== "0.00";
			const hasAskDepth =
				!isNaN(askDepthChangeRate) && formattedAskDepth !== "0.00";

			if (hasBidDepth || hasAskDepth) {
				let depthText = "深度变化: ";
				if (hasBidDepth) {
					depthText += "买盘" + formattedBidDepth + "%";
				}
				if (hasAskDepth) {
					if (hasBidDepth) {
						depthText += ", ";
					}
					depthText += "卖盘" + formattedAskDepth + "%";
				}
				depthText += "\n";
				microstructureText += depthText;
			}

			// 成交特征（总成交笔数总是显示，买卖比仅当格式化后不为0.00且非NaN时显示）
			let tradeFeatureText =
				"成交特征: 总成交" + ms.tradeMetrics.distribution.totalTrades + "笔";
			const buySellRatio = Number(ms.tradeMetrics.distribution.buySellRatio);
			const formattedBuySell = buySellRatio.toFixed(2);

			// 检查是否有实际有意义的数值要显示
			if (!isNaN(buySellRatio) && formattedBuySell !== "0.00") {
				tradeFeatureText += ", 买卖比=" + formattedBuySell;
			}
			tradeFeatureText += "\n";
			microstructureText += tradeFeatureText;

			// 流动性（仅当执行速度或比率格式化后不为0.00且非NaN时显示）
			const executionSpeed = Number(ms.tradeMetrics.executionSpeed);
			const liquidityRatio = Number(ms.tradeMetrics.liquidityRatio);
			const formattedExecutionSpeed = executionSpeed.toFixed(2);
			const formattedLiquidityRatio = liquidityRatio.toFixed(2);

			// 检查是否有实际有意义的数值要显示
			const hasExecutionSpeed =
				!isNaN(executionSpeed) && formattedExecutionSpeed !== "0.00";
			const hasLiquidityRatio =
				!isNaN(liquidityRatio) && formattedLiquidityRatio !== "0.00";

			if (hasExecutionSpeed || hasLiquidityRatio) {
				let liquidityText = "流动性: ";
				if (hasExecutionSpeed) {
					liquidityText += "执行速度=" + formattedExecutionSpeed;
				}
				if (hasLiquidityRatio) {
					if (hasExecutionSpeed) {
						liquidityText += ", ";
					}
					liquidityText += "比率=" + formattedLiquidityRatio;
				}
				liquidityText += "\n";
				microstructureText += liquidityText;
			}

			// 高级指标（仅当VWAP、订单簿斜率或价格冲击格式化后不为0且非NaN时显示）
			const vwap = Number(ms.tradeMetrics.vwap);
			const bidSlope = Number(ms.additionalMetrics.orderBookSlope.bidSlope);
			const askSlope = Number(ms.additionalMetrics.orderBookSlope.askSlope);
			const priceImpact = Number(ms.additionalMetrics.priceImpact);

			// 格式化并检查数值
			const formattedVwap = vwap.toFixed(2);
			const formattedBidSlope = bidSlope.toFixed(2);
			const formattedAskSlope = askSlope.toFixed(2);
			const formattedPriceImpact = priceImpact.toFixed(4);

			// 检查是否有实际有意义的数值要显示
			const hasVwap = !isNaN(vwap) && formattedVwap !== "0.00";
			const hasBidSlope = !isNaN(bidSlope) && formattedBidSlope !== "0.00";
			const hasAskSlope = !isNaN(askSlope) && formattedAskSlope !== "0.00";
			const hasPriceImpact =
				!isNaN(priceImpact) && formattedPriceImpact !== "0.0000";

			if (hasVwap || hasBidSlope || hasAskSlope || hasPriceImpact) {
				let advancedText = "高级指标: ";
				const advancedMetrics = [];

				if (hasVwap) {
					advancedMetrics.push("VWAP=" + vwap);
				}

				if (hasBidSlope || hasAskSlope) {
					const slopeValue = hasBidSlope ? bidSlope : askSlope;
					advancedMetrics.push("订单簿斜率=" + slopeValue);
				}

				if (hasPriceImpact) {
					advancedMetrics.push("价格冲击=" + formattedPriceImpact + "%");
				}

				advancedText += advancedMetrics.join(", ") + "\n";
				microstructureText += advancedText;
			}

			// 将处理后的微观结构指标添加到提示词中
			prompt += microstructureText;
		}

		// 5分钟核心时序数据（仅保留最近30个数据点）
		if (data.intradaySeries && data.intradaySeries.midPrices.length > 0) {
			const series = data.intradaySeries;
			const recentCount = 30;
			const recentPrices = series.midPrices.slice(-recentCount);
			const recentRsi7 = series.rsi7Series?.slice(-recentCount) || [];
			const recentMacd = series.macdSeries?.slice(-recentCount) || [];

			prompt +=
				"5分钟序列（最近" +
				recentCount +
				"个）: 价格=[" +
				recentPrices.map((p: number) => p.toFixed(2)).join(", ") +
				"]";

			if (recentRsi7.length > 0) {
				prompt +=
					", RSI7=[" +
					recentRsi7.map((r: number) => r.toFixed(1)).join(", ") +
					"]";
			}
			if (recentMacd.length > 0) {
				prompt +=
					", MACD=[" +
					recentMacd.map((m: number) => m.toFixed(2)).join(", ") +
					"]";
			}
			prompt += "\n";
		}

		// 更长期的上下文数据（1小时级别 - 用于短线交易）
		if (data.longerTermContext) {
			const ltc = data.longerTermContext;
			prompt += "更长期上下文（1小时时间框架）：\n\n";

			prompt +=
				"20周期EMA: " +
				ltc.ema20.toFixed(2) +
				" vs. 50周期EMA: " +
				ltc.ema50.toFixed(2) +
				"\n\n";

			if (ltc.atr3 && ltc.atr14) {
				prompt +=
					"3周期ATR: " +
					ltc.atr3.toFixed(2) +
					" vs. 14周期ATR: " +
					ltc.atr14.toFixed(3) +
					"\n\n";
			}

			prompt +=
				"当前成交量: " +
				ltc.currentVolume.toFixed(2) +
				" vs. 平均成交量: " +
				ltc.avgVolume.toFixed(3) +
				"\n\n";

			// MACD 和 RSI 时序（4小时，最近10个数据点）
			if (ltc.macdSeries && ltc.macdSeries.length > 0) {
				prompt +=
					"MACD指标: [" +
					ltc.macdSeries.map((m: number) => m.toFixed(3)).join(", ") +
					"]\n\n";
			}

			if (ltc.rsi14Series && ltc.rsi14Series.length > 0) {
				prompt +=
					"RSI指标（14周期）: [" +
					ltc.rsi14Series.map((r: number) => r.toFixed(3)).join(", ") +
					"]\n\n";
			}
		}

		// 关键时间框架指标数据
		if (data.timeframes) {
			prompt += "关键时间框架:\n";
			const keyTimeframes = [
				{ key: "5m", name: "5分钟" },
				{ key: "15m", name: "15分钟" },
				{ key: "1h", name: "1小时" },
			];

			for (const tf of keyTimeframes) {
				const tfData = data.timeframes[tf.key];
				if (tfData) {
					prompt +=
						tf.name +
						": 价格=" +
						tfData.currentPrice.toFixed(2) +
						", EMA10=" +
						(tfData.ema10?.toFixed(3) || tfData.ema20.toFixed(3)) +
						", RSI7=" +
						tfData.rsi7.toFixed(2) +
						", MACD=" +
						tfData.macd.toFixed(3) +
						", 成交量=" +
						tfData.volume.toFixed(2) +
						"\n";
				}
			}
		}
	}

	// 账户信息和表现
	prompt += "\n以下是您的账户信息和表现\n";

	// 计算账户回撤（如果提供了初始净值和峰值净值）
	if (
		accountInfo.initialBalance !== undefined &&
		accountInfo.peakBalance !== undefined
	) {
		const drawdownFromPeak =
			((accountInfo.peakBalance - accountInfo.totalBalance) /
				accountInfo.peakBalance) *
			100;
		const drawdownFromInitial =
			((accountInfo.initialBalance - accountInfo.totalBalance) /
				accountInfo.initialBalance) *
			100;

		prompt +=
			"初始账户净值: " + accountInfo.initialBalance.toFixed(2) + " USDT\n";
		prompt += "峰值账户净值: " + accountInfo.peakBalance.toFixed(2) + " USDT\n";
		prompt +=
			"当前账户价值: " + accountInfo.totalBalance.toFixed(2) + " USDT\n";
		prompt +=
			"账户回撤 (从峰值): " +
			(drawdownFromPeak >= 0 ? "" : "+") +
			(-drawdownFromPeak).toFixed(2) +
			"%\n";
		prompt +=
			"账户回撤 (从初始): " +
			(drawdownFromInitial >= 0 ? "" : "+") +
			(-drawdownFromInitial).toFixed(2) +
			"%\n\n";
	} else {
		prompt +=
			"当前账户价值: " + accountInfo.totalBalance.toFixed(2) + " USDT\n\n";
	}

	prompt += "当前总收益率: " + accountInfo.returnPercent.toFixed(2) + "%\n\n";

	// 计算所有持仓的未实现盈亏总和
	const totalUnrealizedPnL = positions.reduce(
		(sum, pos) => sum + (pos.unrealized_pnl || 0),
		0,
	);

	prompt +=
		"可用资金: " + accountInfo.availableBalance.toFixed(1) + " USDT\n\n";
	prompt +=
		"未实现盈亏: " +
		totalUnrealizedPnL.toFixed(2) +
		" USDT (" +
		(totalUnrealizedPnL >= 0 ? "" : "") +
		((totalUnrealizedPnL / accountInfo.totalBalance) * 100).toFixed(2) +
		"%)\n\n";

	// 当前持仓和表现
	if (positions.length > 0) {
		prompt += "以下是您当前的持仓信息。重要说明：\n";
		prompt +=
			'- 所有"盈亏百分比"都是考虑杠杆后的值，公式为：盈亏百分比 = (价格变动%) × 杠杆倍数\n';
		prompt +=
			"- 例如：10倍杠杆，价格上涨0.5%，则盈亏百分比 = +5%（保证金增值5%）\n";
		prompt +=
			"- 这样设计是为了让您直观理解实际收益：+10% 就是本金增值10%，-10% 就是本金亏损10%\n";
		prompt += "- 请直接使用系统提供的盈亏百分比，不要自己重新计算\n\n";
		for (const pos of positions) {
			// 计算盈亏百分比：考虑杠杆倍数，使用平均成本计算
			const effectiveEntryPrice = pos.average_entry_price || pos.entry_price;
			const priceChangePercent =
				effectiveEntryPrice > 0
					? ((pos.current_price - effectiveEntryPrice) / effectiveEntryPrice) *
						100 *
						(pos.side === "long" ? 1 : -1)
					: 0;
			const pnlPercent = priceChangePercent * pos.leverage;

			// 计算持仓时长
			const openedTime = new Date(pos.opened_at);
			const now = new Date();
			const holdingMinutes = Math.floor(
				(now.getTime() - openedTime.getTime()) / (1000 * 60),
			);
			const holdingHours = (holdingMinutes / 60).toFixed(1);
			const holdingCycles = Math.floor(holdingMinutes / intervalMinutes);

			// 计算峰值回撤
			const peakPnlPercent = pos.peak_pnl_percent || 0;
			const drawdownFromPeak =
				peakPnlPercent > 0 ? peakPnlPercent - pnlPercent : 0;

			prompt +=
				"当前活跃持仓: " +
				pos.symbol +
				" " +
				(pos.side === "long" ? "做多" : "做空") +
				"\n";
			prompt += "  杠杆倍数: " + pos.leverage + "x\n";

			// 加仓信息
			const addPositionCount = pos.add_position_count || 0;
			const hasAddedPosition = addPositionCount > 0;

			if (hasAddedPosition) {
				const costReduction =
					((pos.entry_price - effectiveEntryPrice) / pos.entry_price) * 100;
				prompt += "  加仓状态: 已加仓" + addPositionCount + "次\n";
				prompt += "  初始价格: " + pos.entry_price.toFixed(2) + "\n";
				prompt +=
					"  平均成本: " +
					effectiveEntryPrice.toFixed(2) +
					" (降低" +
					costReduction.toFixed(2) +
					"%)\n";
				prompt +=
					"  总加仓金额: " +
					(pos.total_add_amount_usdt || 0).toFixed(2) +
					" USDT\n";
			}

			prompt +=
				"  盈亏百分比: " +
				(pnlPercent >= 0 ? "+" : "") +
				pnlPercent.toFixed(2) +
				"% (已考虑杠杆倍数)\n";
			prompt +=
				"  盈亏金额: " +
				(pos.unrealized_pnl >= 0 ? "+" : "") +
				pos.unrealized_pnl.toFixed(2) +
				" USDT\n";

			// 添加峰值盈利和回撤信息
			if (peakPnlPercent > 0) {
				prompt +=
					"  峰值盈利: +" + peakPnlPercent.toFixed(2) + "% (历史最高点)\n";
				prompt += "  峰值回撤: " + drawdownFromPeak.toFixed(2) + "%\n";
				if (drawdownFromPeak >= params.peakDrawdownProtection) {
					prompt +=
						"  警告: 峰值回撤已达到 " +
						drawdownFromPeak.toFixed(2) +
						"%，超过保护阈值 " +
						params.peakDrawdownProtection +
						"%，强烈建议立即平仓！\n";
				} else if (drawdownFromPeak >= params.peakDrawdownProtection * 0.7) {
					prompt +=
						"  提醒: 峰值回撤接近保护阈值 (当前" +
						drawdownFromPeak.toFixed(2) +
						"%，阈值" +
						params.peakDrawdownProtection +
						"%)，需要密切关注！\n";
				}
			}

			prompt += "  初始开仓价: " + pos.entry_price.toFixed(2) + "\n";
			if (hasAddedPosition) {
				prompt += "  当前平均成本: " + effectiveEntryPrice.toFixed(2) + "\n";
			}
			prompt += "  当前市场价: " + pos.current_price.toFixed(2) + "\n";
			prompt += "  开仓时间: " + formatChinaTime(pos.opened_at) + "\n";
			prompt +=
				"  已持仓: " +
				holdingHours +
				" 小时 (" +
				holdingMinutes +
				" 分钟, " +
				holdingCycles +
				" 个周期)\n";

			// 加仓建议
			if (pnlPercent < 0 && addPositionCount < 3) {
				const priceDropPercent = Math.abs(pnlPercent / pos.leverage);
				if (priceDropPercent >= 3 && priceDropPercent <= 15) {
					prompt +=
						"  💡 加仓提示: 当前亏损" +
						Math.abs(pnlPercent).toFixed(2) +
						"%，价格下跌" +
						priceDropPercent.toFixed(2) +
						"%，";
					prompt += "已加仓" + addPositionCount + "/3次，";
					if (pos.last_add_position_time) {
						const lastAddTime = new Date(pos.last_add_position_time).getTime();
						const minutesSinceLastAdd = Math.floor(
							(Date.now() - lastAddTime) / (1000 * 60),
						);
						if (minutesSinceLastAdd >= 30) {
							prompt +=
								"距离上次加仓" +
								minutesSinceLastAdd +
								"分钟（≥30分钟），满足时间间隔要求。";
						} else {
							prompt +=
								"距离上次加仓仅" +
								minutesSinceLastAdd +
								"分钟（<30分钟），需等待" +
								(30 - minutesSinceLastAdd) +
								"分钟。";
						}
					} else {
						prompt += "尚未加仓，可考虑加仓降低成本。";
					}
					prompt += "\n";
					prompt +=
						"  💡 加仓评估: 请综合评估趋势方向、支撑位、成交量、风险回报比等因素，决定是否加仓。\n";
				} else if (priceDropPercent < 3) {
					prompt +=
						"  ℹ️  加仓提示: 价格下跌" +
						priceDropPercent.toFixed(2) +
						"%，未达到加仓阈值（3%），暂不建议加仓。\n";
				} else if (priceDropPercent > 15) {
					prompt +=
						"  ⚠️  风险警告: 价格下跌" +
						priceDropPercent.toFixed(2) +
						"%，超过加仓上限（15%），风险过高，应考虑止损而非加仓。\n";
				}
			} else if (addPositionCount >= 3) {
				prompt += "  ⚠️  加仓限制: 已达到最大加仓次数（3次），无法继续加仓。\n";
			}

			prompt += "\n";
		}
	}

	// Sharpe Ratio
	if (accountInfo.sharpeRatio !== undefined) {
		prompt += "夏普比率: " + accountInfo.sharpeRatio.toFixed(3) + "\n\n";
	}

	// 历史成交记录（最近10条）
	if (tradeHistory && tradeHistory.length > 0) {
		prompt += "\n最近交易历史（最近10笔交易，最旧 → 最新）：\n";
		prompt +=
			"重要说明：以下仅为最近10条交易的统计，用于分析近期策略表现，不代表账户总盈亏。\n";
		prompt += "使用此信息评估近期交易质量、识别策略问题、优化决策方向。\n\n";

		let totalProfit = 0;
		let profitCount = 0;
		let lossCount = 0;

		for (const trade of tradeHistory) {
			const tradeTime = formatChinaTime(trade.timestamp);

			prompt +=
				"交易: " +
				trade.symbol +
				" " +
				(trade.type === "open" ? "开仓" : "平仓") +
				" " +
				trade.side.toUpperCase() +
				"\n";
			prompt += "  时间: " + tradeTime + "\n";
			prompt +=
				"  价格: " +
				trade.price.toFixed(2) +
				", 数量: " +
				trade.quantity.toFixed(4) +
				", 杠杆: " +
				trade.leverage +
				"x\n";
			prompt += "  手续费: " + trade.fee.toFixed(4) + " USDT\n";

			// 对于平仓交易，总是显示盈亏金额
			if (trade.type === "close") {
				if (trade.pnl !== undefined && trade.pnl !== null) {
					prompt +=
						"  盈亏: " +
						(trade.pnl >= 0 ? "+" : "") +
						trade.pnl.toFixed(2) +
						" USDT\n";
					totalProfit += trade.pnl;
					if (trade.pnl > 0) {
						profitCount++;
					} else if (trade.pnl < 0) {
						lossCount++;
					}
				} else {
					prompt += "  盈亏: 暂无数据\n";
				}
			}

			prompt += "\n";
		}

		if (profitCount > 0 || lossCount > 0) {
			const winRate = (profitCount / (profitCount + lossCount)) * 100;
			prompt += "最近10条交易统计（仅供参考）:\n";
			prompt += "  - 胜率: " + winRate.toFixed(1) + "%\n";
			prompt += "  - 盈利交易: " + profitCount + "笔\n";
			prompt += "  - 亏损交易: " + lossCount + "笔\n";
			prompt +=
				"  - 最近10条净盈亏: " +
				(totalProfit >= 0 ? "+" : "") +
				totalProfit.toFixed(2) +
				" USDT\n";
			prompt +=
				"\n注意：此数值仅为最近10笔交易统计，用于评估近期策略有效性，不是账户总盈亏。\n";
			prompt +=
				'账户真实盈亏请参考上方"当前账户状态"中的收益率和总资产变化。\n\n';
		}
	}

	// 上一次的AI决策记录（仅供参考，不是当前状态）
	if (recentDecisions && recentDecisions.length > 0) {
		prompt += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
		prompt += "【历史决策记录 - 仅供参考】\n";
		prompt += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
		prompt += "重要提醒：以下是历史决策记录，仅作为参考，不代表当前状态！\n";
		prompt += "当前市场数据和持仓信息请参考上方实时数据。\n\n";

		for (let i = 0; i < recentDecisions.length; i++) {
			const decision = recentDecisions[i];
			const decisionTime = formatChinaTime(decision.timestamp);
			const timeDiff = Math.floor(
				(new Date().getTime() - new Date(decision.timestamp).getTime()) /
					(1000 * 60),
			);

			prompt +=
				"【历史】决策 #" +
				decision.iteration +
				" (" +
				decisionTime +
				"，" +
				timeDiff +
				"分钟前):\n";
			prompt +=
				"  当时账户价值: " + decision.account_value.toFixed(2) + " USDT\n";
			prompt += "  当时持仓数量: " + decision.positions_count + "\n";
			prompt += "  当时决策内容: " + decision.decision + "\n\n";
		}

		prompt += "\n使用建议：\n";
		prompt += "- 仅作为决策连续性参考，不要被历史决策束缚\n";
		prompt += "- 市场已经变化，请基于当前最新数据独立判断\n";
		prompt += "- 如果市场条件改变，应该果断调整策略\n\n";
	}

	prompt +=
		"记住：蔡森策略核心是多维度分析和精准点位，严格执行策略流程，实现稳定收益。\n";
	return prompt;
}
