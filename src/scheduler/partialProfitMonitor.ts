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
 * 分批止盈监控器 - 每10秒执行一次
 *
 * 功能说明：
 * - 根据策略的 partialTakeProfit 配置自动执行分批平仓
 * - 通过 enableCodeLevelProtection 控制是否启用
 * - 跟踪 partial_close_percentage 防止重复触发
 *
 * 策略适用范围：
 * - enableCodeLevelProtection = false: 禁用，由 AI 主动决策
 * - enableCodeLevelProtection = true: 启用，代码自动执行
 *
 * 分批止盈规则（示例 - rebate-farming 策略）：
 * - Stage 1: 盈利达到 3% 时，平仓 70%
 * - Stage 2: 盈利达到 6% 时，平仓剩余 30%（累计 100%）
 * - Stage 3: 盈利达到 10% 时，全部平仓（兜底）
 *
 * 重要说明：
 * - 每个持仓独立跟踪已平仓比例
 * - 防止重复触发：已平仓比例 >= closePercent 时不再触发
 * - 数据存储：positions.partial_close_percentage
 */

import { createClient } from "@libsql/client";
import { getStrategyParams, getTradingStrategy } from "../agents/tradingAgent";
import { createExchangeClient } from "../services/exchangeClient";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { createLogger } from "../utils/loggerUtils";
import { getChinaTimeISO } from "../utils/timeUtils";
import { iterationCount } from "./tradingLoop";

const logger = createLogger({
  name: "partial-profit-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

// ==================== 峰值回落检测默认配置 ====================
// 当策略未配置时使用的默认值
const DEFAULT_PEAK_DRAWDOWN_CONFIG = {
  enabled: true,
  drawdownThreshold: 5, // 回落5%触发检测
  closePercent: 30, // 回落时平仓30%
  minHoldingTime: 5 * 60 * 1000, // 5分钟
  maxClosePercent: 50, // 单次最大平仓50%
};

// ==================== 数据结构 ====================
// 内存中维护每个持仓的峰值记录：symbol -> { peakPrice, lastUpdateTime, openedAt }
const positionPeakMap = new Map<
  string,
  {
    peakPrice: number;
    lastUpdateTime: number;
    openedAt: number; // 开仓时间，用于检查最小持仓时间
  }
>();

// 从数据库获取开仓时间的缓存：symbol -> openedAt
const positionOpenedAtMap = new Map<string, number>();

/**
 * 计算持仓盈利百分比（考虑杠杆）
 */
function calculatePnlPercent(
  entryPrice: number,
  currentPrice: number,
  side: string,
  leverage: number
): number {
  const priceChangePercent =
    entryPrice > 0
      ? ((currentPrice - entryPrice) / entryPrice) *
        100 *
        (side === "long" ? 1 : -1)
      : 0;
  return priceChangePercent * leverage;
}

/**
 * 检查峰值回落情况
 * 返回峰值价格、回落幅度和当前盈利百分比
 */
function checkPeakDrawdown(
  symbol: string,
  currentPrice: number,
  entryPrice: number,
  side: string,
  openedAt: number
): {
  peakPrice: number;
  drawdownPercent: number;
  currentProfitPercent: number;
} {
  // 获取或初始化峰值记录
  const peakInfo = positionPeakMap.get(symbol) || {
    peakPrice: currentPrice,
    lastUpdateTime: Date.now(),
    openedAt: openedAt,
  };

  // 更新峰值记录
  if (
    (side === "long" && currentPrice > peakInfo.peakPrice) ||
    (side === "short" && currentPrice < peakInfo.peakPrice)
  ) {
    peakInfo.peakPrice = currentPrice;
    peakInfo.lastUpdateTime = Date.now();
    positionPeakMap.set(symbol, peakInfo);
    return {
      peakPrice: currentPrice,
      drawdownPercent: 0,
      currentProfitPercent: 0,
    };
  }

  // 计算回落幅度
  const drawdownPercent =
    side === "long"
      ? ((peakInfo.peakPrice - currentPrice) / peakInfo.peakPrice) * 100
      : ((currentPrice - peakInfo.peakPrice) / peakInfo.peakPrice) * 100;

  // 计算当前盈利百分比
  const currentProfitPercent = calculatePnlPercent(
    entryPrice,
    currentPrice,
    side,
    1 // 不考虑杠杆，计算实际价格变化百分比
  );

  // 注意：这里不再直接返回是否触发，而是返回回落幅度等信息
  // 触发判断将在调用方根据策略配置进行
  return {
    peakPrice: peakInfo.peakPrice,
    drawdownPercent,
    currentProfitPercent,
  };
}

/**
 * 计算收益和手续费
 * 返回净收益、总手续费以及收益是否覆盖手续费
 */
async function calculateProfitAndFee(
  symbol: string,
  side: string,
  quantity: number,
  entryPrice: number,
  currentPrice: number
): Promise<{
  profit: number;
  totalFee: number;
  profitCoversFee: boolean;
  grossProfit: number;
}> {
  const contract = `${symbol}_USDT`;
  const quantoMultiplier = await getQuantoMultiplier(contract);

  // 计算毛收益
  const priceDiff =
    side === "long" ? currentPrice - entryPrice : entryPrice - currentPrice;
  const grossProfit = priceDiff * quantity * quantoMultiplier;

  // 计算手续费（开仓 + 平仓）
  const openFee = entryPrice * quantity * quantoMultiplier * 0.0005;
  const closeFee = currentPrice * quantity * quantoMultiplier * 0.0005;
  const totalFee = openFee + closeFee;

  // 净收益
  const profit = grossProfit - totalFee;

  return {
    profit,
    totalFee,
    profitCoversFee: profit > 0 && profit >= totalFee,
    grossProfit,
  };
}

/**
 * 检查是否应该触发分批止盈
 * 返回需要平仓的百分比，如果不需要平仓则返回 null
 */
function checkPartialProfit(
  currentPnlPercent: number,
  alreadyClosedPercent: number
): {
  shouldClose: boolean;
  stage: string;
  closePercent: number;
  totalClosedPercent: number;
  description: string;
} | null {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  if (!params.partialTakeProfit) {
    return null;
  }

  const { stage1, stage2, stage3 } = params.partialTakeProfit;

  // 按照从低到高的顺序检查（stage1 -> stage2 -> stage3）
  // 每个阶段只触发一次，检查是否已经平仓过
  const stages = [
    {
      name: "stage1",
      trigger: stage1.trigger,
      closePercent: stage1.closePercent,
    },
    {
      name: "stage2",
      trigger: stage2.trigger,
      closePercent: stage2.closePercent,
    },
    {
      name: "stage3",
      trigger: stage3.trigger,
      closePercent: stage3.closePercent,
    },
  ];

  for (const stage of stages) {
    // 检查是否达到触发条件
    if (currentPnlPercent >= stage.trigger) {
      // 检查是否已经平仓过这个阶段
      if (alreadyClosedPercent < stage.closePercent) {
        // 计算本次需要平仓的百分比
        const thisClosePercent = stage.closePercent - alreadyClosedPercent;

        return {
          shouldClose: true,
          stage: stage.name,
          closePercent: thisClosePercent,
          totalClosedPercent: stage.closePercent,
          description: `盈利${currentPnlPercent.toFixed(2)}%，触发${
            stage.name
          }分批止盈（${stage.trigger}%），平仓${thisClosePercent}%（累计${
            stage.closePercent
          }%）`,
        };
      }
    }
  }

  return null;
}

/**
 * 执行分批止盈平仓
 */
async function executePartialClose(
  symbol: string,
  side: string,
  totalQuantity: number,
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  pnlPercent: number,
  closePercent: number,
  totalClosedPercent: number,
  stage: string
): Promise<boolean> {
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;

  try {
    // 计算本次平仓数量
    let closeQuantity = Math.floor((totalQuantity * closePercent) / 100);

    // 特殊处理：如果累计平仓比例达到100%，直接平掉所有剩余仓位
    if (totalClosedPercent >= 100) {
      closeQuantity = totalQuantity;
      logger.warn(
        `${symbol} 累计平仓达到100%，平掉所有剩余仓位: ${closeQuantity} 张`
      );
    }
    // 如果计算结果为0但还有剩余持仓，至少平掉1张（避免小数量问题）
    else if (closeQuantity === 0 && totalQuantity > 0) {
      closeQuantity = Math.min(1, totalQuantity);
      logger.warn(
        `${symbol} 计算平仓数量为0，至少平掉1张: ${closeQuantity}/${totalQuantity} 张`
      );
    }

    if (closeQuantity === 0) {
      logger.warn(`${symbol} 计算平仓数量为0，跳过平仓`);
      return false;
    }

    const size = side === "long" ? -closeQuantity : closeQuantity;

    logger.warn(`【触发分批止盈 ${stage}】${symbol} ${side}`);
    logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
    logger.warn(`  平仓比例: ${closePercent}%`);
    logger.warn(`  平仓数量: ${closeQuantity}/${totalQuantity} 张`);
    logger.warn(`  累计平仓: ${totalClosedPercent}%`);

    // 1. 执行平仓订单
    const order = await exchangeClient.placeOrder({
      contract,
      size,
      price: 0,
      reduceOnly: true,
    });

    logger.info(`已下达分批止盈平仓订单 ${symbol}，订单ID: ${order.id}`);

    // 2. 等待订单完成并获取成交信息
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let actualExitPrice = 0;
    let actualQuantity = closeQuantity;
    let pnl = 0;
    let totalFee = 0;
    let orderFilled = false;

    // 尝试从订单获取成交信息
    if (order.id) {
      for (let retry = 0; retry < 5; retry++) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          const orderStatus = await exchangeClient.getOrder(
            order.id?.toString() || ""
          );

          if (orderStatus.status === "finished") {
            const fillPrice = Number.parseFloat(
              orderStatus.fill_price || orderStatus.price || "0"
            );
            actualQuantity = Math.abs(
              Number.parseFloat(orderStatus.size || "0") -
                Number.parseFloat(orderStatus.left || "0")
            );

            if (fillPrice > 0) {
              actualExitPrice = fillPrice;
              orderFilled = true;
              logger.info(`从订单获取成交价格: ${actualExitPrice}`);
              break;
            }
          }
        } catch (statusError: any) {
          logger.warn(
            `查询分批止盈订单状态失败 (重试${retry + 1}/5): ${
              statusError.message
            }`
          );
        }
      }
    }

    // 如果未能从订单获取价格，使用ticker价格
    if (actualExitPrice === 0) {
      try {
        const ticker = await exchangeClient.getFuturesTicker(contract);
        actualExitPrice = Number.parseFloat(
          ticker.last || ticker.markPrice || "0"
        );

        if (actualExitPrice > 0) {
          logger.warn(`未能从订单获取价格，使用ticker价格: ${actualExitPrice}`);
        } else {
          actualExitPrice = currentPrice;
          logger.warn(
            `ticker价格也无效，使用传入的currentPrice: ${actualExitPrice}`
          );
        }
      } catch (tickerError: any) {
        logger.error(
          `获取ticker价格失败: ${tickerError.message}，使用传入的currentPrice: ${currentPrice}`
        );
        actualExitPrice = currentPrice;
      }
    }

    // 计算盈亏
    if (actualExitPrice > 0) {
      try {
        const quantoMultiplier = await getQuantoMultiplier(contract);

        const priceChange =
          side === "long"
            ? actualExitPrice - entryPrice
            : entryPrice - actualExitPrice;

        const grossPnl = priceChange * actualQuantity * quantoMultiplier;

        // 计算手续费（开仓 + 平仓）
        const openFee = entryPrice * actualQuantity * quantoMultiplier * 0.0005;
        const closeFee =
          actualExitPrice * actualQuantity * quantoMultiplier * 0.0005;
        totalFee = openFee + closeFee;

        pnl = grossPnl - totalFee;

        logger.info(
          `分批止盈平仓成交: 价格=${actualExitPrice.toFixed(
            2
          )}, 数量=${actualQuantity}, 盈亏=${pnl.toFixed(2)} USDT`
        );
      } catch (calcError: any) {
        logger.error(`计算盈亏失败: ${calcError.message}`);
      }
    } else {
      logger.error(`无法获取有效的平仓价格`);
    }

    // 3. 记录到trades表
    await dbClient.execute({
      sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        order.id?.toString() || "",
        symbol,
        side,
        "close",
        actualExitPrice,
        actualQuantity,
        leverage,
        pnl,
        totalFee,
        getChinaTimeISO(),
        orderFilled ? "filled" : "pending",
      ],
    });

    // 4. 更新数据库中的 partial_close_percentage
    await dbClient.execute({
      sql: "UPDATE positions SET partial_close_percentage = ? WHERE symbol = ?",
      args: [totalClosedPercent, symbol],
    });

    // 5. 记录决策信息到agent_decisions表
    const decisionText = `【分批止盈触发 - ${stage}】${symbol} ${
      side === "long" ? "做多" : "做空"
    }
触发阶段: ${stage}
当前盈利: ${pnlPercent.toFixed(2)}%
平仓比例: ${closePercent}%
平仓数量: ${actualQuantity}/${totalQuantity} 张
累计平仓: ${totalClosedPercent}%
平仓价格: ${actualExitPrice.toFixed(2)}
平仓盈亏: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT

分批止盈策略: 逐步锁定利润，保护已获收益`;

    await dbClient.execute({
      sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        getChinaTimeISO(),
        iterationCount, // 使用当前AI策略回合数
        JSON.stringify({
          trigger: "partial_profit",
          symbol,
          pnlPercent,
          closePercent,
          totalClosedPercent,
        }),
        decisionText,
        JSON.stringify([
          {
            action: "partial_close",
            symbol,
            percentage: closePercent,
            reason: "partial_profit",
          },
        ]),
        0, // 稍后更新
        0, // 稍后更新
      ],
    });

    // 6. 如果已经全部平仓（100%），从数据库删除持仓记录
    if (totalClosedPercent >= 100) {
      await dbClient.execute({
        sql: "DELETE FROM positions WHERE symbol = ?",
        args: [symbol],
      });
      logger.info(`${symbol} 已全部平仓，从数据库删除持仓记录`);
    }

    logger.info(
      `分批止盈平仓完成 ${symbol}，盈亏：${pnl >= 0 ? "+" : ""}${pnl.toFixed(
        2
      )} USDT`
    );

    return true;
  } catch (error: any) {
    logger.error(`分批止盈平仓失败 ${symbol}: ${error.message}`);
    return false;
  }
}

/**
 * 执行峰值回落平仓
 * 当价格从峰值回落且满足条件时执行平仓
 */
async function executeDrawdownClose(
  symbol: string,
  side: string,
  totalQuantity: number,
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  pnlPercent: number,
  peakPrice: number,
  drawdownPercent: number,
  alreadyClosedPercent: number
): Promise<boolean> {
  // 获取当前策略参数
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  // 获取峰值回落检测配置，使用默认值作为回退
  const peakDrawdownConfig = {
    ...DEFAULT_PEAK_DRAWDOWN_CONFIG,
    ...params.peakDrawdownProtectionConfig,
  };

  // 计算平仓比例，不超过最大限制
  const closePercent = Math.min(
    peakDrawdownConfig.closePercent ||
      DEFAULT_PEAK_DRAWDOWN_CONFIG.closePercent,
    peakDrawdownConfig.maxClosePercent ||
      DEFAULT_PEAK_DRAWDOWN_CONFIG.maxClosePercent
  );
  const totalClosedPercent = alreadyClosedPercent + closePercent;

  // 使用现有的executePartialClose函数执行平仓
  return await executePartialClose(
    symbol,
    side,
    totalQuantity,
    entryPrice,
    currentPrice,
    leverage,
    pnlPercent,
    closePercent,
    totalClosedPercent,
    "peak_drawdown_protection"
  );
}

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否启用代码级分批止盈
 */
function isPartialProfitEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取分批止盈配置（用于日志输出）
 */
function getPartialProfitConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  if (!params.partialTakeProfit) {
    return null;
  }

  return {
    stage1: {
      description: `盈利达到 ${params.partialTakeProfit.stage1.trigger}% 时，平仓 ${params.partialTakeProfit.stage1.closePercent}%`,
      trigger: params.partialTakeProfit.stage1.trigger,
      closePercent: params.partialTakeProfit.stage1.closePercent,
    },
    stage2: {
      description: `盈利达到 ${params.partialTakeProfit.stage2.trigger}% 时，平仓 ${params.partialTakeProfit.stage2.closePercent}%`,
      trigger: params.partialTakeProfit.stage2.trigger,
      closePercent: params.partialTakeProfit.stage2.closePercent,
    },
    stage3: {
      description: `盈利达到 ${params.partialTakeProfit.stage3.trigger}% 时，平仓 ${params.partialTakeProfit.stage3.closePercent}%`,
      trigger: params.partialTakeProfit.stage3.trigger,
      closePercent: params.partialTakeProfit.stage3.closePercent,
    },
  };
}

/**
 * 检查所有持仓的分批止盈条件
 */
async function checkPartialProfitConditions() {
  if (!isRunning) {
    return;
  }

  // 检查是否启用代码级分批止盈
  const autoCloseEnabled = isPartialProfitEnabled();
  if (!autoCloseEnabled) {
    // 未启用，不执行自动平仓
    return;
  }

  try {
    const exchangeClient = createExchangeClient();

    // 获取当前策略参数
    const strategy = getTradingStrategy();
    const params = getStrategyParams(strategy);

    // 获取峰值回落检测配置，使用默认值作为回退
    const peakDrawdownConfig = {
      ...DEFAULT_PEAK_DRAWDOWN_CONFIG,
      ...params.peakDrawdownProtectionConfig,
    };

    // 如果未启用峰值回落检测，跳过相关逻辑
    if (!peakDrawdownConfig.enabled) {
      logger.debug("峰值回落检测未启用，跳过相关检查");
    }

    // 1. 获取所有持仓
    const gatePositions = await exchangeClient.getPositions();
    const activePositions = gatePositions.filter(
      (p: any) => Number.parseInt(p.size || "0") !== 0
    );

    if (activePositions.length === 0) {
      return;
    }

    // 2. 从数据库获取持仓信息（获取已平仓比例和开仓时间）
    const dbResult = await dbClient.execute(
      "SELECT symbol, partial_close_percentage, opened_at FROM positions"
    );
    const dbPartialCloseMap = new Map(
      dbResult.rows.map((row: any) => [
        row.symbol,
        Number.parseFloat((row.partial_close_percentage as string) || "0"),
      ])
    );

    // 构建开仓时间映射
    const dbOpenedAtMap = new Map(
      dbResult.rows.map((row: any) => [
        row.symbol,
        new Date(row.opened_at).getTime(),
      ])
    );

    // 3. 检查每个持仓
    for (const pos of activePositions) {
      const size = Number.parseInt(pos.size || "0");
      const symbol = pos.contract.replace("_USDT", "");
      const side = size > 0 ? "long" : "short";
      const quantity = Math.abs(size);
      const entryPrice = Number.parseFloat(pos.entryPrice || "0");
      const currentPrice = Number.parseFloat(pos.markPrice || "0");
      const leverage = Number.parseInt(pos.leverage || "1");

      // 获取开仓时间
      const openedAt = dbOpenedAtMap.get(symbol) || Date.now();

      // 更新开仓时间缓存
      positionOpenedAtMap.set(symbol, openedAt);

      // 验证数据有效性
      if (entryPrice === 0 || currentPrice === 0 || leverage === 0) {
        logger.warn(`${symbol} 数据无效，跳过分批止盈检查`);
        continue;
      }

      // 计算盈利百分比（考虑杠杆）
      const pnlPercent = calculatePnlPercent(
        entryPrice,
        currentPrice,
        side,
        leverage
      );

      // 获取已平仓比例
      const alreadyClosedPercent = dbPartialCloseMap.get(symbol) || 0;

      // ==================== 新增：峰值回落检测 ====================
      // 如果启用了峰值回落检测
      if (peakDrawdownConfig.enabled) {
        // 检查峰值回落情况
        const drawdownResult = checkPeakDrawdown(
          symbol,
          currentPrice,
          entryPrice,
          side,
          openedAt
        );

        // 如果触发回落检测
        if (
          drawdownResult.drawdownPercent >
          (peakDrawdownConfig.drawdownThreshold ||
            DEFAULT_PEAK_DRAWDOWN_CONFIG.drawdownThreshold)
        ) {
          // 检查持仓时间，避免刚开仓就触发回落平仓
          const holdingTime = Date.now() - openedAt;
          const minHoldingTime =
            peakDrawdownConfig.minHoldingTime ||
            DEFAULT_PEAK_DRAWDOWN_CONFIG.minHoldingTime;
          if (holdingTime < minHoldingTime) {
            logger.debug(
              `${symbol} 持仓时间不足${
                minHoldingTime / 1000 / 60
              }分钟，跳过回落检测`
            );
          } else {
            // 计算收益和手续费
            const profitResult = await calculateProfitAndFee(
              symbol,
              side,
              quantity,
              entryPrice,
              currentPrice
            );

            // 如果存在正收益且收益覆盖手续费
            if (profitResult.profitCoversFee) {
              logger.warn(`${symbol} 触发峰值回落保护:`);
              logger.warn(`  峰值价格: ${drawdownResult.peakPrice.toFixed(2)}`);
              logger.warn(`  当前价格: ${currentPrice.toFixed(2)}`);
              logger.warn(
                `  回落幅度: ${drawdownResult.drawdownPercent.toFixed(2)}%`
              );
              logger.warn(`  当前收益: ${profitResult.profit.toFixed(2)} USDT`);
              logger.warn(
                `  总手续费: ${profitResult.totalFee.toFixed(2)} USDT`
              );
              logger.warn(
                `  平仓比例: ${Math.min(
                  peakDrawdownConfig.closePercent ||
                    DEFAULT_PEAK_DRAWDOWN_CONFIG.closePercent,
                  peakDrawdownConfig.maxClosePercent ||
                    DEFAULT_PEAK_DRAWDOWN_CONFIG.maxClosePercent
                )}%`
              );

              // 执行回落平仓
              const success = await executeDrawdownClose(
                symbol,
                side,
                quantity,
                entryPrice,
                currentPrice,
                leverage,
                pnlPercent,
                drawdownResult.peakPrice,
                drawdownResult.drawdownPercent,
                alreadyClosedPercent
              );

              if (success) {
                logger.info(`${symbol} 峰值回落保护平仓成功`);
                continue; // 已平仓，跳过后续检查
              }
            } else {
              logger.debug(`${symbol} 收益未覆盖手续费，跳过回落平仓:`);
              logger.debug(
                `  毛收益: ${profitResult.grossProfit.toFixed(2)} USDT`
              );
              logger.debug(
                `  总手续费: ${profitResult.totalFee.toFixed(2)} USDT`
              );
              logger.debug(`  净收益: ${profitResult.profit.toFixed(2)} USDT`);
            }
          }
        }
      }

      // ==================== 原有：分批止盈检查 ====================
      // 检查是否应该触发分批止盈
      const partialProfitResult = checkPartialProfit(
        pnlPercent,
        alreadyClosedPercent
      );

      if (partialProfitResult && partialProfitResult.shouldClose) {
        logger.warn(`${symbol} 触发分批止盈:`);
        logger.warn(`  ${partialProfitResult.description}`);

        // 执行分批平仓
        const success = await executePartialClose(
          symbol,
          side,
          quantity,
          entryPrice,
          currentPrice,
          leverage,
          pnlPercent,
          partialProfitResult.closePercent,
          partialProfitResult.totalClosedPercent,
          partialProfitResult.stage
        );

        if (success) {
          logger.info(`${symbol} 分批止盈平仓成功`);
        }
      }
    }
  } catch (error: any) {
    logger.error(`分批止盈检查失败: ${error.message}`);
  }
}

/**
 * 启动分批止盈监控器
 */
export function startPartialProfitMonitor() {
  if (isRunning) {
    logger.warn("分批止盈监控已在运行中");
    return;
  }

  const strategy = getTradingStrategy();
  const autoCloseEnabled = isPartialProfitEnabled();

  isRunning = true;

  logger.info("=".repeat(60));
  logger.info("🚀 启动分批止盈监控器");
  logger.info("=".repeat(60));
  logger.info(`  当前策略: ${strategy}`);
  logger.info(`  检查间隔: 10秒`);
  logger.info(
    `  自动平仓: ${
      autoCloseEnabled ? "✅ 启用（代码级保护）" : "❌ 禁用（由 AI 决策）"
    }`
  );

  if (autoCloseEnabled) {
    const config = getPartialProfitConfig();
    if (config) {
      logger.info(``);
      logger.info(`  【分批止盈规则】`);
      logger.info(`    阶段1: ${config.stage1.description}`);
      logger.info(`    阶段2: ${config.stage2.description}`);
      logger.info(`    阶段3: ${config.stage3.description}`);
    }
  } else {
    logger.info(``);
    logger.info(`  【说明】`);
    logger.info(`    • 分批止盈由 AI 根据策略配置主动执行`);
    logger.info(`    • 代码不会自动触发分批平仓`);
  }
  logger.info("=".repeat(60));

  // 立即执行一次
  checkPartialProfitConditions();

  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkPartialProfitConditions();
  }, 10 * 1000);
}

/**
 * 停止分批止盈监控器
 */
export function stopPartialProfitMonitor() {
  if (!isRunning) {
    logger.warn("分批止盈监控未在运行");
    return;
  }

  isRunning = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  logger.info("分批止盈监控已停止");
}
