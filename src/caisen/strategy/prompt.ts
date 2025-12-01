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
  }
): string {
  // 计算杠杆推荐值（用于提示词）
  const levMin = params.leverageMin;
  const levMax = params.leverageMax;
  const levNormal = levMin;
  const levGood = Math.ceil((levMin + levMax) / 2);
  const levStrong = levMax;

  // 从data中提取数据
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

  // 格式化时间函数
  const formatChinaTime = (date?: string | Date) => {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  };

  let prompt = `
【蔡森策略 - 5分钟短期精准预测】

你的角色：蔡森策略AI交易专家，专注于5分钟级别短期预测和精准开仓，快速响应市场变化。

【核心策略规则】
1. 多时间框架分析：5分钟(50%) > 15分钟(30%) > 1小时(20%) - 5分钟分析为核心
2. 5分钟短期预测要求：
   - 必须做保守预测，优先考虑风险控制
   - 预测未来5分钟价格走势，包含：方向、置信度(0-100)、关键依据
   - 必须综合使用所有指标：价格、EMA5/EMA10/EMA20、RSI7/RSI14、MACD、成交量、布林带、ATR、MFI、Stochastic Oscillator、ADX、OBV、VWAP、恐惧贪婪指数
   - 指标权重分配：趋势指标(EMA/MACD)30%、动量指标(RSI/Stochastic)25%、波动率指标(ATR/布林带)20%、成交量指标(OBV/MFI/VWAP)15%、市场情绪(恐惧贪婪)10%
3. 开仓信号标准：
   - 做多：价格突破EMA10+RSI7>30且向上+成交量放大1.5倍+MACD金叉
   - 做空：价格跌破EMA10+RSI7<70且向下+成交量放大1.5倍+MACD死叉
4. 平仓执行规则：
   - 分批平仓：不受固定阈值限制，可根据市场情况自由决定分批平仓的触发条件和比例
   - 全平仓：不受固定阈值限制，可根据市场情况自由决定全平仓的时机
   - 必须明确调用closePosition或openPosition工具执行平仓
   - 平仓决策需基于综合指标分析，说明关键依据
5. 止盈止损阈值设置：
   - 不受固定阈值限制，可根据市场变化自由调整
   - 调整依据：需基于综合指标分析，说明调整原因
   - 风险控制：仍需遵守单笔亏损≤1%，单日亏损≤5%的风险控制原则
   - 止损设置建议：参考ATR值动态设置，避免过度僵化
6. 指标判断标准：
   - RSI7：<30超卖，>70超买
   - MACD：金叉看涨，死叉看跌
   - 布林带：突破上轨看涨，突破下轨看跌
   - 成交量：放大1.5倍以上确认趋势
   - EMA：价格在EMA上方看涨，下方看跌
   - MFI：<20超卖，>80超买
   - Stochastic：K线>80超买，<20超卖，金叉看涨，死叉看跌
   - ADX：>25趋势强烈，<20趋势微弱
   - OBV：与价格背离时反转信号
   - VWAP：价格在VWAP上方看涨，下方看跌
    - 恐惧贪婪指数：<30恐惧(买入信号)，>70贪婪(卖出信号)
     - 算法提示：恐惧贪婪指数 = 0.2*价格动量得分 + 0.2*波动率得分 + 0.2*资金费率得分 + 0.2*订单簿不平衡得分 + 0.2*交易量分布得分
     - 各组件计算：价格动量得分=50+价格变化率(%)*2；波动率得分=100-ATR百分比*5；资金费率得分=50+资金费率(%)*100；订单簿不平衡得分=50+订单簿不平衡百分比；交易量分布得分=50+(上涨交易量-下跌交易量)/总交易量*100
     - 与其他技术指标形成背离时，信号强度增强
     - 例如：恐惧贪婪指数>70（贪婪）+ 技术指标看跌 = 强做空信号
     - 例如：恐惧贪婪指数<30（恐惧）+ 技术指标看涨 = 强做多信号
7. 风险管理：单笔亏损≤1%，单日亏损≤5%，持仓≤24小时
8. 执行速度：信号出现后2根5分钟K线内必须决策

【当前配置】
- 杠杆：${levMin}-${levMax}倍
- 仓位：${params.positionSizeMin}-${params.positionSizeMax}%
- 止损：低${params.stopLoss.low}%/中${params.stopLoss.mid}%/高${
    params.stopLoss.high
  }%
- 止盈：+${params.partialTakeProfit.stage1.trigger}%平${
    params.partialTakeProfit.stage1.closePercent
  }%，+${params.partialTakeProfit.stage2.trigger}%平${
    params.partialTakeProfit.stage2.closePercent
  }%，+${params.partialTakeProfit.stage3.trigger}%全平

【交易周期】#${iteration} ${formatChinaTime()}
已运行 ${minutesElapsed} 分钟，执行周期 ${intervalMinutes} 分钟

【风控底线】
单笔亏损≤3% → 强制平仓
持仓≥24小时 → 强制平仓

【任务】
基于数据直接决策，调用工具执行：
1. 5分钟短期预测：预测未来5分钟价格走势
2. 持仓管理：止损/止盈/加仓 → closePosition/openPosition
3. 新交易机会：做多/做空 → openPosition
4. 风险评估 → calculateRisk

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
      prompt += `微观结构: 订单簿不平衡度=${Number(
        ms.orderBookMetrics.orderBookImbalance
      ).toFixed(4)}, 买卖价差=${Number(ms.orderBookMetrics.spread).toFixed(4)}
`;
      prompt += `大额订单: 买单${ms.orderBookMetrics.largeBids}个, 卖单${ms.orderBookMetrics.largeAsks}个
`;
      prompt += `深度变化: 买盘${Number(
        ms.orderBookMetrics.bidDepthChangeRate
      ).toFixed(2)}%, 卖盘${Number(
        ms.orderBookMetrics.askDepthChangeRate
      ).toFixed(2)}%
`;
      prompt += `成交特征: 总成交${
        ms.tradeMetrics.distribution.totalTrades
      }笔, 买卖比=${Number(ms.tradeMetrics.distribution.buySellRatio).toFixed(
        2
      )}
`;
      prompt += `流动性: 执行速度=${Number(
        ms.tradeMetrics.executionSpeed
      ).toFixed(2)}, 比率=${Number(ms.tradeMetrics.liquidityRatio).toFixed(2)}
`;
      prompt += `高级指标: VWAP=${ms.tradeMetrics.vwap}, 订单簿斜率=${
        ms.additionalMetrics.orderBookSlope.bidSlope
      }, 价格冲击=${Number(ms.additionalMetrics.priceImpact).toFixed(4)}%
`;
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

  prompt += `记住：蔡森策略的核心是多维度分析和精准点位，严格执行策略流程，才能实现稳定收益。\n`;

  return prompt;
}
