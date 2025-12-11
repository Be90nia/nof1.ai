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
  }
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

  let prompt = `【蔡森策略 - 5分钟短期预测】

你的角色：蔡森策略AI交易专家，专注5分钟级别短期预测和精准开仓，核心是多维度分析+七分位策略+动态点位交易系统。

【核心策略】
1. 时间框架权重：5分钟(50%) > 15分钟(30%) > 1小时(20%)
2. 预测要求：保守预测，未来5分钟走势需包含方向、置信度(0-100)、依据
3. 指标权重：趋势(30%)、动量(25%)、波动率(20%)、成交量(15%)、市场情绪(10%)
4. 七分位策略：
   - 将价格区间分为7等份，1/7-2/7为超卖区(做多机会)，6/7-7/7为超买区(做空机会)
   - 计算公式：七分位位置 = (当前价格 - 区间低点) / (区间高点 - 区间低点) * 7
5. 开仓信号：
   - 做多：价格在1/7-2/7区+RSI7<30+成交量放大1.5倍+MACD金叉
   - 做空：价格在6/7-7/7区+RSI7>70+成交量放大1.5倍+MACD死叉
6. 平仓规则：
   - 分批止盈：盈利达到不同阶段自动平仓部分仓位
   - 峰值回落：盈利峰值后回落达到预设比例自动平仓
   - 动态止损：根据市场波动自动调整止损比例
   - 持仓≥24小时或单笔亏损≥3% → 强制平仓
7. 风控底线：单笔亏损≤1%，单日亏损≤5%，持仓≤24小时
8. 执行要求：信号出现后2根5分钟K线内决策

【数据延迟提醒】
- 当前系统存在约1-3秒的数据滞后性，请在决策时考虑这一因素
- 快速变动市场中，建议等待更强的信号确认再执行交易
- 滞后补偿：根据当前趋势和波动率，预测滞后期间的可能价格变动

【指标判断规则】
- RSI7：<30超卖，>70超买
- MACD：金叉看涨，死叉看跌
- 布林带：突破上轨看涨，突破下轨看跌
- 成交量：放大1.5倍以上确认趋势
- EMA：价格在EMA上方看涨，下方看跌
- MFI：<20超卖，>80超买
- Stochastic：K线>80超买，<20超卖
- ADX：>25趋势强，<20趋势弱
- OBV：与价格背离时反转信号
- VWAP：价格在VWAP上方看涨，下方看跌
- 恐惧贪婪指数：<30恐惧(买入)，>70贪婪(卖出)

【当前配置】
- 杠杆：${levMin}-${levMax}倍
- 仓位：${params.positionSizeMin}-${params.positionSizeMax}%
- 止损：低${params.stopLoss.low}%/中${params.stopLoss.mid}%/高${params.stopLoss.high}%
- 止盈：+${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，+${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，+${params.partialTakeProfit.stage3.trigger}%全平
`;

  // 添加分币种参数（如果有）
  if (data?.agentParamsBySymbol) {
    prompt += `
【分币种参数】
`;
    for (const [symbol, params] of Object.entries(data.agentParamsBySymbol)) {
      const hasTakeProfit = params.partialTakeProfit;
      const hasDrawdown = params.peakDrawdownProtectionConfig;
      prompt += `${symbol}：\n`;
      if (hasTakeProfit) {
        prompt += `  - 分批止盈：${params.partialTakeProfit.stage1.trigger}%平${params.partialTakeProfit.stage1.closePercent}%，${params.partialTakeProfit.stage2.trigger}%平${params.partialTakeProfit.stage2.closePercent}%，${params.partialTakeProfit.stage3.trigger}%全平\n`;
      } else {
        prompt += `  - 分批止盈：未设置\n`;
      }
      if (hasDrawdown) {
        prompt += `  - 峰值回落：${params.peakDrawdownProtectionConfig.levels[0].drawdownThreshold}%平${params.peakDrawdownProtectionConfig.levels[0].closePercent}%，${params.peakDrawdownProtectionConfig.levels[1].drawdownThreshold}%平${params.peakDrawdownProtectionConfig.levels[1].closePercent}%，${params.peakDrawdownProtectionConfig.levels[2].drawdownThreshold}%平${params.peakDrawdownProtectionConfig.levels[2].closePercent}%\n`;
      } else {
        prompt += `  - 峰值回落：未设置\n`;
      }
    }
  }

  // 交易周期和基本信息
  prompt += `
【交易周期】#${iteration} ${formatChinaTime()}
已运行 ${minutesElapsed} 分钟，执行周期 ${intervalMinutes} 分钟

【风控底线】
单笔亏损≤3% → 强制平仓
持仓≥24小时 → 强制平仓

【任务】
1. 5分钟短期预测：保守预测未来5分钟走势
2. 持仓管理：止损/止盈/加仓 → closePosition/openPosition
3. 新交易机会：做多/做空 → openPosition
4. 风险评估 → calculateRisk

【工具调用规则】

📌 **核心要求**
- 【有持仓或开仓】→ 必须为每个货币对调用以下三个工具
- 【无持仓且不开仓】→ 无需调用任何工具

📌 **必须调用的工具（缺一不可）**
1. setPartialTakeProfitParams - 分批止盈，控制盈利出场时机
2. setPeakDrawdownParams - 峰值回落，防止盈利回吐
3. setDynamicStopLossParams - 动态止损，保护本金安全

📌 **工具调用规则**
1. **每个货币对独立调用**：开仓或持有多少货币对，就调用多少次工具组合
2. **每次决策都要调用**：即使之前设置过，也要重新调用以反映最新市场变化
3. **参数必须完整**：所有阈值使用正值，止盈触发阈值>0，平仓百分比>0
4. **基于市场设置合理参数**：结合技术指标、波动率和趋势强度

📌 **执行流程**
1. 分析市场数据，确定交易方向
2. 为目标货币对设置三个工具参数
3. 执行开仓/平仓操作

📌 **示例**
\`\`\`
# 开仓DOGE示例
openPosition({ symbol: "DOGE", side: "long", quantity: 100, leverage: 10 });
setPartialTakeProfitParams({ symbol: "DOGE", stage1: { trigger: 2, closePercent: 30 }, stage2: { trigger: 4, closePercent: 50 }, stage3: { trigger: 6, closePercent: 20 } });
setPeakDrawdownParams({ symbol: "DOGE", level1: { drawdownThreshold: 1.0, closePercent: 30 }, level2: { drawdownThreshold: 2.0, closePercent: 50 }, level3: { drawdownThreshold: 3.0, closePercent: 100 }, minHoldingTime: 5 });
setDynamicStopLossParams({ symbol: "DOGE", threshold: 2.5, evaluationInterval: 30 });
\`\`\`

⚠️ **警告**
- 未调用工具 → 系统不会自动执行平仓
- 缺少工具 → 对应功能无法生效
- 未为货币对调用 → 该货币对无自动平仓保护

【数据说明】
所有价格数据：最旧→最新

所有币种市场状态
`;

  // 按照格式输出每个币种的数据
  for (const [symbol, dataRaw] of Object.entries(marketData)) {
    const data = dataRaw as any;

    prompt += `\n${symbol} 数据\n`;
    // 核心指标（所有提到的指标都包含）
    prompt += `当前: 价格=${data.price.toFixed(2)}, EMA10=${
      data.ema10?.toFixed(3) || data.ema20.toFixed(3)
    }, EMA20=${data.ema20.toFixed(3)}, MACD=${data.macd.toFixed(
      3
    )}, RSI7=${data.rsi7.toFixed(2)}, RSI14=${
      data.rsi14?.toFixed(2) || "N/A"
    }\n`;
    prompt += `指标: MFI=${data.mfi.toFixed(
      2
    )}, StochK=${data.stochasticK.toFixed(
      2
    )}, StochD=${data.stochasticD.toFixed(2)}, ADX=${data.adx.toFixed(2)}\n`;
    prompt += `波动率: ATR3=${data.atr3.toFixed(2)}, ATR14=${data.atr14.toFixed(
      2
    )}, 布林上=${data.bollingerUpper.toFixed(
      2
    )}, 布林中=${data.bollingerMiddle.toFixed(
      2
    )}, 布林下=${data.bollingerLower.toFixed(2)}\n`;
    prompt += `成交量: ${data.volume.toFixed(2)}, OBV=${data.obv.toFixed(
      0
    )}, VWAP=${data.vwap.toFixed(2)}, 恐惧贪婪=${data.fearAndGreedIndex.toFixed(
      2
    )}\n`;

    // 资金费率
    if (data.fundingRate !== undefined) {
      prompt += `资金费率: ${data.fundingRate.toExponential(2)}
`;
    }

    // 微观结构指标
    if (data.microstructure) {
      const ms = data.microstructure;
      let microstructureText = "";

      // 微观结构基础指标（总是显示）
      microstructureText += `微观结构: 订单簿不平衡度=${Number(
        ms.orderBookMetrics.orderBookImbalance
      ).toFixed(4)}, 买卖价差=${Number(ms.orderBookMetrics.spread).toFixed(4)}
`;

      // 大额订单（仅当数量大于0时显示）
      if (
        ms.orderBookMetrics.largeBids > 0 ||
        ms.orderBookMetrics.largeAsks > 0
      ) {
        microstructureText += `大额订单: 买单${ms.orderBookMetrics.largeBids}个, 卖单${ms.orderBookMetrics.largeAsks}个
`;
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
        let depthText = `深度变化: `;
        if (hasBidDepth) {
          depthText += `买盘${formattedBidDepth}%`;
        }
        if (hasAskDepth) {
          if (hasBidDepth) {
            depthText += `, `;
          }
          depthText += `卖盘${formattedAskDepth}%`;
        }
        depthText += `
`;
        microstructureText += depthText;
      }

      // 成交特征（总成交笔数总是显示，买卖比仅当格式化后不为0.00且非NaN时显示）
      let tradeFeatureText = `成交特征: 总成交${ms.tradeMetrics.distribution.totalTrades}笔`;
      const buySellRatio = Number(ms.tradeMetrics.distribution.buySellRatio);
      const formattedBuySell = buySellRatio.toFixed(2);

      // 检查是否有实际有意义的数值要显示
      if (!isNaN(buySellRatio) && formattedBuySell !== "0.00") {
        tradeFeatureText += `, 买卖比=${formattedBuySell}`;
      }
      tradeFeatureText += `
`;
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
        let liquidityText = `流动性: `;
        if (hasExecutionSpeed) {
          liquidityText += `执行速度=${formattedExecutionSpeed}`;
        }
        if (hasLiquidityRatio) {
          if (hasExecutionSpeed) {
            liquidityText += `, `;
          }
          liquidityText += `比率=${formattedLiquidityRatio}`;
        }
        liquidityText += `
`;
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
        let advancedText = `高级指标: `;
        const advancedMetrics = [];

        if (hasVwap) {
          advancedMetrics.push(`VWAP=${vwap}`);
        }

        if (hasBidSlope || hasAskSlope) {
          const slopeValue = hasBidSlope ? bidSlope : askSlope;
          advancedMetrics.push(`订单簿斜率=${slopeValue}`);
        }

        if (hasPriceImpact) {
          advancedMetrics.push(`价格冲击=${formattedPriceImpact}%`);
        }

        advancedText +=
          advancedMetrics.join(", ") +
          `
`;
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

      prompt += `5分钟序列（最近${recentCount}个）: 价格=[${recentPrices
        .map((p: number) => p.toFixed(2))
        .join(", ")}]`;

      if (recentRsi7.length > 0) {
        prompt += `, RSI7=[${recentRsi7
          .map((r: number) => r.toFixed(1))
          .join(", ")}]`;
      }
      if (recentMacd.length > 0) {
        prompt += `, MACD=[${recentMacd
          .map((m: number) => m.toFixed(2))
          .join(", ")}]`;
      }
      prompt += `\n`;
    }

    // 更长期的上下文数据（1小时级别 - 用于短线交易）
    if (data.longerTermContext) {
      const ltc = data.longerTermContext;
      prompt += `更长期上下文（1小时时间框架）：\n\n`;

      prompt += `20周期EMA: ${ltc.ema20.toFixed(
        2
      )} vs. 50周期EMA: ${ltc.ema50.toFixed(2)}\n\n`;

      if (ltc.atr3 && ltc.atr14) {
        prompt += `3周期ATR: ${ltc.atr3.toFixed(
          2
        )} vs. 14周期ATR: ${ltc.atr14.toFixed(3)}\n\n`;
      }

      prompt += `当前成交量: ${ltc.currentVolume.toFixed(
        2
      )} vs. 平均成交量: ${ltc.avgVolume.toFixed(3)}\n\n`;

      // MACD 和 RSI 时序（4小时，最近10个数据点）
      if (ltc.macdSeries && ltc.macdSeries.length > 0) {
        prompt += `MACD指标: [${ltc.macdSeries
          .map((m: number) => m.toFixed(3))
          .join(", ")}]\n\n`;
      }

      if (ltc.rsi14Series && ltc.rsi14Series.length > 0) {
        prompt += `RSI指标（14周期）: [${ltc.rsi14Series
          .map((r: number) => r.toFixed(3))
          .join(", ")}]\n\n`;
      }
    }

    // 关键时间框架指标数据
    if (data.timeframes) {
      prompt += `关键时间框架:\n`;
      const keyTimeframes = [
        { key: "5m", name: "5分钟" },
        { key: "15m", name: "15分钟" },
        { key: "1h", name: "1小时" },
      ];

      for (const tf of keyTimeframes) {
        const tfData = data.timeframes[tf.key];
        if (tfData) {
          prompt += `${tf.name}: 价格=${tfData.currentPrice.toFixed(
            2
          )}, EMA10=${
            tfData.ema10?.toFixed(3) || tfData.ema20.toFixed(3)
          }, RSI7=${tfData.rsi7.toFixed(2)}, MACD=${tfData.macd.toFixed(
            3
          )}, 成交量=${tfData.volume.toFixed(2)}\n`;
        }
      }
    }
  }

  // 账户信息和表现
  prompt += `\n以下是您的账户信息和表现\n`;

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

    prompt += `初始账户净值: ${accountInfo.initialBalance.toFixed(2)} USDT\n`;
    prompt += `峰值账户净值: ${accountInfo.peakBalance.toFixed(2)} USDT\n`;
    prompt += `当前账户价值: ${accountInfo.totalBalance.toFixed(2)} USDT\n`;
    prompt += `账户回撤 (从峰值): ${
      drawdownFromPeak >= 0 ? "" : "+"
    }${(-drawdownFromPeak).toFixed(2)}%\n`;
    prompt += `账户回撤 (从初始): ${
      drawdownFromInitial >= 0 ? "" : "+"
    }${(-drawdownFromInitial).toFixed(2)}%\n\n`;
  } else {
    prompt += `当前账户价值: ${accountInfo.totalBalance.toFixed(2)} USDT\n\n`;
  }

  prompt += `当前总收益率: ${accountInfo.returnPercent.toFixed(2)}%\n\n`;

  // 计算所有持仓的未实现盈亏总和
  const totalUnrealizedPnL = positions.reduce(
    (sum, pos) => sum + (pos.unrealized_pnl || 0),
    0
  );

  prompt += `可用资金: ${accountInfo.availableBalance.toFixed(1)} USDT\n\n`;
  prompt += `未实现盈亏: ${totalUnrealizedPnL.toFixed(2)} USDT (${
    totalUnrealizedPnL >= 0 ? "+" : ""
  }${((totalUnrealizedPnL / accountInfo.totalBalance) * 100).toFixed(2)}%)\n\n`;

  // 当前持仓和表现
  if (positions.length > 0) {
    prompt += `以下是您当前的持仓信息。重要说明：\n`;
    prompt += `- 所有"盈亏百分比"都是考虑杠杆后的值，公式为：盈亏百分比 = (价格变动%) × 杠杆倍数\n`;
    prompt += `- 例如：10倍杠杆，价格上涨0.5%，则盈亏百分比 = +5%（保证金增值5%）\n`;
    prompt += `- 这样设计是为了让您直观理解实际收益：+10% 就是本金增值10%，-10% 就是本金亏损10%\n`;
    prompt += `- 请直接使用系统提供的盈亏百分比，不要自己重新计算\n\n`;
    for (const pos of positions) {
      // 计算盈亏百分比：考虑杠杆倍数
      const priceChangePercent =
        pos.entry_price > 0
          ? ((pos.current_price - pos.entry_price) / pos.entry_price) *
            100 *
            (pos.side === "long" ? 1 : -1)
          : 0;
      const pnlPercent = priceChangePercent * pos.leverage;

      // 计算持仓时长
      const openedTime = new Date(pos.opened_at);
      const now = new Date();
      const holdingMinutes = Math.floor(
        (now.getTime() - openedTime.getTime()) / (1000 * 60)
      );
      const holdingHours = (holdingMinutes / 60).toFixed(1);
      const holdingCycles = Math.floor(holdingMinutes / intervalMinutes);

      // 计算峰值回撤
      const peakPnlPercent = pos.peak_pnl_percent || 0;
      const drawdownFromPeak =
        peakPnlPercent > 0 ? peakPnlPercent - pnlPercent : 0;

      prompt += `当前活跃持仓: ${pos.symbol} ${
        pos.side === "long" ? "做多" : "做空"
      }\n`;
      prompt += `  杠杆倍数: ${pos.leverage}x\n`;
      prompt += `  盈亏百分比: ${
        pnlPercent >= 0 ? "+" : ""
      }${pnlPercent.toFixed(2)}% (已考虑杠杆倍数)\n`;
      prompt += `  盈亏金额: ${
        pos.unrealized_pnl >= 0 ? "+" : ""
      }${pos.unrealized_pnl.toFixed(2)} USDT\n`;

      // 添加峰值盈利和回撤信息
      if (peakPnlPercent > 0) {
        prompt += `  峰值盈利: +${peakPnlPercent.toFixed(2)}% (历史最高点)\n`;
        prompt += `  峰值回撤: ${drawdownFromPeak.toFixed(2)}%\n`;
        if (drawdownFromPeak >= params.peakDrawdownProtection) {
          prompt += `  警告: 峰值回撤已达到 ${drawdownFromPeak.toFixed(
            2
          )}%，超过保护阈值 ${
            params.peakDrawdownProtection
          }%，强烈建议立即平仓！\n`;
        } else if (drawdownFromPeak >= params.peakDrawdownProtection * 0.7) {
          prompt += `  提醒: 峰值回撤接近保护阈值 (当前${drawdownFromPeak.toFixed(
            2
          )}%，阈值${params.peakDrawdownProtection}%)，需要密切关注！\n`;
        }
      }

      prompt += `  开仓价: ${pos.entry_price.toFixed(2)}\n`;
      prompt += `  当前价: ${pos.current_price.toFixed(2)}\n`;
      prompt += `  开仓时间: ${formatChinaTime(pos.opened_at)}\n`;
      prompt += `  已持仓: ${holdingHours} 小时 (${holdingMinutes} 分钟, ${holdingCycles} 个周期)\n`;
      prompt += `\n`;
    }
  }

  // Sharpe Ratio
  if (accountInfo.sharpeRatio !== undefined) {
    prompt += `夏普比率: ${accountInfo.sharpeRatio.toFixed(3)}\n\n`;
  }

  // 历史成交记录（最近10条）
  if (tradeHistory && tradeHistory.length > 0) {
    prompt += `\n最近交易历史（最近10笔交易，最旧 → 最新）：\n`;
    prompt += `重要说明：以下仅为最近10条交易的统计，用于分析近期策略表现，不代表账户总盈亏。\n`;
    prompt += `使用此信息评估近期交易质量、识别策略问题、优化决策方向。\n\n`;

    let totalProfit = 0;
    let profitCount = 0;
    let lossCount = 0;

    for (const trade of tradeHistory) {
      const tradeTime = formatChinaTime(trade.timestamp);

      prompt += `交易: ${trade.symbol} ${
        trade.type === "open" ? "开仓" : "平仓"
      } ${trade.side.toUpperCase()}\n`;
      prompt += `  时间: ${tradeTime}\n`;
      prompt += `  价格: ${trade.price.toFixed(
        2
      )}, 数量: ${trade.quantity.toFixed(4)}, 杠杆: ${trade.leverage}x\n`;
      prompt += `  手续费: ${trade.fee.toFixed(4)} USDT\n`;

      // 对于平仓交易，总是显示盈亏金额
      if (trade.type === "close") {
        if (trade.pnl !== undefined && trade.pnl !== null) {
          prompt += `  盈亏: ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(
            2
          )} USDT\n`;
          totalProfit += trade.pnl;
          if (trade.pnl > 0) {
            profitCount++;
          } else if (trade.pnl < 0) {
            lossCount++;
          }
        } else {
          prompt += `  盈亏: 暂无数据\n`;
        }
      }

      prompt += `\n`;
    }

    if (profitCount > 0 || lossCount > 0) {
      const winRate = (profitCount / (profitCount + lossCount)) * 100;
      prompt += `最近10条交易统计（仅供参考）:\n`;
      prompt += `  - 胜率: ${winRate.toFixed(1)}%\n`;
      prompt += `  - 盈利交易: ${profitCount}笔\n`;
      prompt += `  - 亏损交易: ${lossCount}笔\n`;
      prompt += `  - 最近10条净盈亏: ${
        totalProfit >= 0 ? "+" : ""
      }${totalProfit.toFixed(2)} USDT\n`;
      prompt += `\n注意：此数值仅为最近10笔交易统计，用于评估近期策略有效性，不是账户总盈亏。\n`;
      prompt += `账户真实盈亏请参考上方"当前账户状态"中的收益率和总资产变化。\n\n`;
    }
  }

  // 上一次的AI决策记录（仅供参考，不是当前状态）
  if (recentDecisions && recentDecisions.length > 0) {
    prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    prompt += `【历史决策记录 - 仅供参考】\n`;
    prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    prompt += `重要提醒：以下是历史决策记录，仅作为参考，不代表当前状态！\n`;
    prompt += `当前市场数据和持仓信息请参考上方实时数据。\n\n`;

    for (let i = 0; i < recentDecisions.length; i++) {
      const decision = recentDecisions[i];
      const decisionTime = formatChinaTime(decision.timestamp);
      const timeDiff = Math.floor(
        (new Date().getTime() - new Date(decision.timestamp).getTime()) /
          (1000 * 60)
      );

      prompt += `【历史】决策 #${decision.iteration} (${decisionTime}，${timeDiff}分钟前):\n`;
      prompt += `  当时账户价值: ${decision.account_value.toFixed(2)} USDT\n`;
      prompt += `  当时持仓数量: ${decision.positions_count}\n`;
      prompt += `  当时决策内容: ${decision.decision}\n\n`;
    }

    prompt += `\n使用建议：\n`;
    prompt += `- 仅作为决策连续性参考，不要被历史决策束缚\n`;
    prompt += `- 市场已经变化，请基于当前最新数据独立判断\n`;
    prompt += `- 如果市场条件改变，应该果断调整策略\n\n`;
  }

  prompt += `记住：蔡森策略核心是多维度分析和精准点位，严格执行策略流程，实现稳定收益。\n`;
  return prompt;
}
