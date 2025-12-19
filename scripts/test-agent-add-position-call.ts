/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * 测试 Agent 是否能正确调用加仓工具
 * 
 * 测试场景：
 * 1. 模拟一个亏损持仓（价格下跌5%）
 * 2. 构造符合加仓条件的市场数据
 * 3. 调用 Agent 进行决策
 * 4. 验证 Agent 是否识别加仓机会并调用 addPosition 工具
 */

import { createAgent } from "@voltagent/core";
import { generateCaiSenPrompt } from "../src/caisen/strategy/prompt.js";
import { addPositionTool } from "../src/tools/trading/addPosition.js";
import { createLogger } from "../src/utils/loggerUtils.js";
import type { StrategyParams } from "../src/caisen/strategy/types.js";

const logger = createLogger({
  name: "test-agent-add-position",
  level: "info",
});

/**
 * 模拟持仓数据
 */
function createMockPosition() {
  const entryPrice = 50000; // 入场价格
  const currentPrice = 47500; // 当前价格（下跌5%）
  const leverage = 10;
  const quantity = 100;

  // 计算盈亏百分比（考虑杠杆）
  const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const pnlPercent = priceChangePercent * leverage; // -50%
  const unrealizedPnl = (currentPrice - entryPrice) * quantity * 0.0001 * leverage;

  return {
    symbol: "BTC",
    side: "long",
    entry_price: entryPrice,
    average_entry_price: entryPrice,
    current_price: currentPrice,
    quantity,
    leverage,
    unrealized_pnl: unrealizedPnl,
    peak_pnl_percent: 0,
    add_position_count: 0,
    last_add_position_time: null,
    total_add_amount_usdt: 0,
    opened_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1小时前开仓
  };
}

/**
 * 模拟市场数据（符合加仓条件）
 */
function createMockMarketData() {
  return {
    BTC: {
      price: 47500,
      ema10: 47800,
      ema20: 48000,
      macd: -50, // 负值，但趋势可能反转
      rsi7: 28, // 超卖
      rsi14: 32,
      mfi: 25, // 超卖
      stochasticK: 22, // 超卖
      stochasticD: 25,
      adx: 35, // 趋势强
      atr3: 500,
      atr14: 800,
      bollingerUpper: 51000,
      bollingerMiddle: 48000,
      bollingerLower: 45000,
      volume: 15000, // 成交量放大
      obv: 1000000,
      vwap: 47800,
      fearAndGreedIndex: 25, // 恐惧
      fundingRate: 0.0001,
      microstructure: {
        orderBookMetrics: {
          orderBookImbalance: 1.3, // 买单深度增加
          spread: 0.02,
          largeBids: 5,
          largeAsks: 2,
          bidDepthChangeRate: 15,
          askDepthChangeRate: -5,
        },
        tradeMetrics: {
          distribution: {
            totalTrades: 1500,
            buySellRatio: 1.4, // 买单占优
          },
          executionSpeed: 0.8,
          liquidityRatio: 1.2,
          vwap: 47800,
        },
        additionalMetrics: {
          orderBookSlope: {
            bidSlope: 0.5,
            askSlope: -0.3,
          },
          priceImpact: 0.05,
        },
      },
      intradaySeries: {
        midPrices: Array(30).fill(0).map((_, i) => 50000 - i * 100),
        rsi7Series: Array(30).fill(0).map((_, i) => 35 - i * 0.3),
        macdSeries: Array(30).fill(0).map((_, i) => -20 - i * 1),
      },
      longerTermContext: {
        ema20: 48000,
        ema50: 49000,
        atr3: 500,
        atr14: 800,
        currentVolume: 15000,
        avgVolume: 10000,
        macdSeries: [-50, -45, -40, -35, -30],
        rsi14Series: [32, 30, 28, 26, 25],
      },
      timeframes: {
        "5m": {
          currentPrice: 47500,
          ema10: 47800,
          ema20: 48000,
          rsi7: 28,
          macd: -50,
          volume: 15000,
        },
        "15m": {
          currentPrice: 47500,
          ema10: 47900,
          ema20: 48200,
          rsi7: 30,
          macd: -45,
          volume: 45000,
        },
        "1h": {
          currentPrice: 47500,
          ema10: 48000,
          ema20: 48500,
          rsi7: 32,
          macd: -40,
          volume: 180000,
        },
      },
    },
  };
}

/**
 * 模拟账户信息
 */
function createMockAccountInfo() {
  return {
    totalBalance: 10000,
    availableBalance: 5000, // 有足够的可用资金
    initialBalance: 10000,
    peakBalance: 10500,
    returnPercent: 0,
    sharpeRatio: 0,
  };
}

/**
 * 主测试函数
 */
async function testAgentAddPositionCall() {
  logger.info("========================================");
  logger.info("开始测试 Agent 加仓工具调用");
  logger.info("========================================\n");

  // 1. 准备测试数据
  const position = createMockPosition();
  const marketData = createMockMarketData();
  const accountInfo = createMockAccountInfo();

  logger.info("📊 测试场景设置：");
  logger.info(`  币种: ${position.symbol}`);
  logger.info(`  入场价格: ${position.entry_price}`);
  logger.info(`  当前价格: ${position.current_price}`);
  logger.info(`  价格下跌: ${((position.current_price - position.entry_price) / position.entry_price * 100).toFixed(2)}%`);
  logger.info(`  杠杆: ${position.leverage}x`);
  logger.info(`  盈亏百分比: ${(((position.current_price - position.entry_price) / position.entry_price * 100) * position.leverage).toFixed(2)}%`);
  logger.info(`  未实现盈亏: ${position.unrealized_pnl.toFixed(2)} USDT`);
  logger.info(`  加仓次数: ${position.add_position_count}/3`);
  logger.info(`  可用资金: ${accountInfo.availableBalance} USDT\n`);

  logger.info("📈 市场条件（符合加仓条件）：");
  logger.info(`  RSI7: ${marketData.BTC.rsi7} (超卖)`);
  logger.info(`  MFI: ${marketData.BTC.mfi} (超卖)`);
  logger.info(`  Stochastic K: ${marketData.BTC.stochasticK} (超卖)`);
  logger.info(`  ADX: ${marketData.BTC.adx} (趋势强)`);
  logger.info(`  成交量: ${marketData.BTC.volume} (放大)`);
  logger.info(`  恐惧贪婪指数: ${marketData.BTC.fearAndGreedIndex} (恐惧)`);
  logger.info(`  订单簿不平衡: ${marketData.BTC.microstructure.orderBookMetrics.orderBookImbalance} (买单深度增加)`);
  logger.info(`  买卖比: ${marketData.BTC.microstructure.tradeMetrics.distribution.buySellRatio} (买单占优)\n`);

  // 2. 构造策略参数
  const strategyParams: StrategyParams = {
    leverageMin: 5,
    leverageMax: 15,
    positionSizeMin: 5,
    positionSizeMax: 15,
    profitTarget: 10,
    stopLoss: 3,
    peakDrawdownProtection: 5,
  };

  // 3. 生成 Agent Prompt
  const prompt = generateCaiSenPrompt(
    strategyParams,
    {} as any,
    {
      minutesElapsed: 60,
      iteration: 1,
      intervalMinutes: 5,
      marketData,
      accountInfo,
      positions: [position],
      tradeHistory: [],
      recentDecisions: [],
      positionCount: 1,
    }
  );

  logger.info("📝 生成的 Prompt 长度: " + prompt.length + " 字符\n");

  // 4. 创建 Agent 并添加工具
  logger.info("🤖 创建 Agent 并注册加仓工具...\n");
  
  const agent = createAgent({
    name: "test-agent",
    model: "gpt-4o-mini", // 使用较快的模型进行测试
    tools: [addPositionTool],
  });

  // 5. 调用 Agent 进行决策
  logger.info("🎯 开始 Agent 决策...\n");
  logger.info("期望结果：Agent 应该识别到加仓机会并调用 addPosition 工具\n");
  logger.info("----------------------------------------\n");

  try {
    const response = await agent.run({
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: `请分析当前持仓和市场状态，判断是否应该加仓。

当前持仓：
- 币种：BTC
- 方向：做多
- 入场价格：50000
- 当前价格：47500（下跌5%）
- 杠杆：10x
- 盈亏：-50%（考虑杠杆）
- 加仓次数：0/3
- 持仓时间：1小时

市场状态：
- RSI7: 28（超卖）
- MFI: 25（超卖）
- 成交量放大1.5倍
- 恐惧贪婪指数：25（恐惧）
- 订单簿买单深度增加30%
- 价格接近支撑位45000

请评估是否满足加仓条件，如果满足请调用 addPosition 工具。`,
        },
      ],
    });

    logger.info("✅ Agent 决策完成\n");
    logger.info("----------------------------------------\n");
    logger.info("📋 Agent 响应：\n");
    logger.info(JSON.stringify(response, null, 2));
    logger.info("\n");

    // 6. 分析结果
    logger.info("========================================");
    logger.info("测试结果分析");
    logger.info("========================================\n");

    const toolCalls = response.toolCalls || [];
    const addPositionCalls = toolCalls.filter((call: any) => call.name === "addPosition");

    if (addPositionCalls.length > 0) {
      logger.info("✅ 测试通过：Agent 成功识别加仓机会并调用了 addPosition 工具\n");
      logger.info("📞 工具调用详情：");
      addPositionCalls.forEach((call: any, index: number) => {
        logger.info(`\n  调用 #${index + 1}:`);
        logger.info(`    币种: ${call.parameters.symbol}`);
        logger.info(`    加仓金额: ${call.parameters.addAmountUsdt} USDT`);
        logger.info(`    策略: ${call.parameters.strategy}`);
        logger.info(`    原因: ${call.parameters.reason}`);
      });
      logger.info("\n");
    } else {
      logger.warn("❌ 测试失败：Agent 未调用 addPosition 工具\n");
      logger.warn("可能的原因：");
      logger.warn("  1. Agent 判断不满足加仓条件");
      logger.warn("  2. Agent 未正确理解加仓工具的使用场景");
      logger.warn("  3. Prompt 中的加仓规则描述不够清晰");
      logger.warn("  4. 模拟数据不够真实\n");
      
      if (toolCalls.length > 0) {
        logger.info("Agent 调用了其他工具：");
        toolCalls.forEach((call: any) => {
          logger.info(`  - ${call.name}`);
        });
        logger.info("\n");
      }
    }

    // 7. 输出 Agent 的文本响应
    if (response.text) {
      logger.info("💬 Agent 文本响应：");
      logger.info("----------------------------------------");
      logger.info(response.text);
      logger.info("----------------------------------------\n");
    }

  } catch (error: any) {
    logger.error("❌ 测试执行失败：" + error.message);
    logger.error(error.stack);
  }

  logger.info("========================================");
  logger.info("测试完成");
  logger.info("========================================");
}

// 运行测试
testAgentAddPositionCall().catch((error) => {
  logger.error("测试脚本执行失败：" + error.message);
  process.exit(1);
});
