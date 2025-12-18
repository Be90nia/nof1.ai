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
 * 实时峰值监控器 - 每10秒执行一次（适用所有策略）
 * 同时监控持仓峰值盈利和账户净值峰值
 *
 * 功能分层：
 *
 * 【核心功能 1 - 持仓峰值盈利监控（所有策略共享）】
 * 1. 每10秒从 Gate.io 获取最新持仓价格（markPrice）
 * 2. 计算每个持仓的当前盈利和峰值盈利
 * 3. 实时更新数据库中的峰值盈利（peak_pnl_percent）
 * 4. 确保 AI 在每个交易周期看到准确的持仓峰值回撤数据
 *
 * 【核心功能 2 - 账户净值峰值监控（所有策略共享）】
 * 5. 每10秒从 Gate.io 获取账户信息（total + unrealisedPnl）
 * 6. 计算账户总净值（包含未实现盈亏）
 * 7. 如果净值创新高，立即记录到 account_history 表
 * 8. 确保 AI 在每个交易周期看到准确的账户峰值回撤数据
 *
 * 【扩展功能 - 代码级自动平仓（根据策略配置启用）】
 * 9. 使用策略的 trailingStop 配置（3级规则）判断是否触发移动止盈
 * 10. 触发时立即平仓，记录到交易历史和决策数据
 *
 * 策略适用范围：
 * - enableCodeLevelProtection = false（默认大多数策略）:
 *   功能1-8（持仓峰值 + 账户峰值，AI 主动止盈）
 * - enableCodeLevelProtection = true（如 swing-trend）:
 *   功能1-10（完整功能，包含自动平仓）
 *
 * 移动止盈规则（示例 - swing-trend 策略，使用 trailingStop 配置）：
 * - Level 1: 峰值达到 15% 时，回落至 8% 平仓
 * - Level 2: 峰值达到 30% 时，回落至 20% 平仓
 * - Level 3: 峰值达到 50% 时，回落至 35% 平仓
 *
 * 重要说明：
 * - 持仓峰值：每个持仓独立跟踪，盈利计算已考虑杠杆倍数
 * - 账户峰值：总净值包含未实现盈亏，净值创新高时立即入库
 * - 数据存储：持仓峰值存储在 positions.peak_pnl_percent
 * - 数据存储：账户峰值可通过 MAX(account_history.total_value) 查询
 * - 解决问题：彻底解决"交易周期长导致错过峰值"的问题
 * - 记录策略：账户净值创新高才入库，避免数据库记录过多
 */

import { createClient } from "@libsql/client";
import { getStrategyParams, getTradingStrategy } from "../agents/tradingAgent";
import { createExchangeClient } from "../services/exchangeClient";
import { getQuantoMultiplier } from "../utils/contractUtils";
import { createLogger } from "../utils/loggerUtils";
import { getChinaTimeISO } from "../utils/timeUtils";
import { recordAccountAssets } from "./accountRecorder";
import { iterationCount } from "./tradingLoop";

const logger = createLogger({
  name: "trailing-stop-monitor",
  level: "info",
});

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

/**
 * 根据峰值盈利和当前盈利判断是否触发移动止盈或峰值回落保护
 * 使用策略的 trailingStop 配置或持仓的 exitStrategy 配置
 *
 * @returns { shouldClose: boolean, level: string, description: string, type: string, closePercent?: number }
 */
function checkExitConditions(
  peakPnlPercent: number,
  currentPnlPercent: number,
  exitStrategy?: any,
  partialClosePercentage: number = 0,
  executedLevels: Set<string> = new Set() // 已执行的平仓级别，用于避免重复执行
): {
  shouldClose: boolean;
  level: string;
  description: string;
  type: string;
  closePercent?: number;
  stopAt?: number;
  drawdownThreshold?: number;
} {
  // 参数验证
  if (!peakPnlPercent || !currentPnlPercent) {
    return {
      shouldClose: false,
      level: "无效参数",
      description: "峰值盈利或当前盈利参数无效",
      type: "error",
    };
  }

  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  // 1. 如果存在持仓的 exitStrategy 配置，优先使用它
  if (exitStrategy) {
    return checkPositionExitStrategy(
      exitStrategy,
      peakPnlPercent,
      currentPnlPercent,
      partialClosePercentage,
      executedLevels
    );
  }

  // 2. 检查策略参数中的 positionExitStrategy 配置
  if (params.positionExitStrategy && params.positionExitStrategy.enabled) {
    return checkPositionExitStrategy(
      params.positionExitStrategy,
      peakPnlPercent,
      currentPnlPercent,
      partialClosePercentage,
      executedLevels
    );
  }

  // 3. 检查分批止盈条件（旧配置，向后兼容）
  if (params.partialTakeProfit) {
    const { stage1, stage2, stage3 } = params.partialTakeProfit;

    // 按照从低到高的顺序检查（stage1 -> stage2 -> stage3）
    const stages = [];

    // 检查并添加stage1
    if (
      stage1 &&
      stage1.trigger !== undefined &&
      stage1.closePercent !== undefined
    ) {
      stages.push({
        name: "stage1",
        trigger: stage1.trigger,
        closePercent: stage1.closePercent,
      });
    }

    // 检查并添加stage2
    if (
      stage2 &&
      stage2.trigger !== undefined &&
      stage2.closePercent !== undefined
    ) {
      stages.push({
        name: "stage2",
        trigger: stage2.trigger,
        closePercent: stage2.closePercent,
      });
    }

    // 检查并添加stage3
    if (
      stage3 &&
      stage3.trigger !== undefined &&
      stage3.closePercent !== undefined
    ) {
      stages.push({
        name: "stage3",
        trigger: stage3.trigger,
        closePercent: stage3.closePercent,
      });
    }

    // 如果没有有效的阶段，直接返回
    if (stages.length === 0) {
      return {
        shouldClose: false,
        level: "无效配置",
        description: "分批止盈配置无效，没有有效的阶段",
        type: "error",
      };
    }

    // 按照触发阈值从低到高排序，确保正确的检查顺序
    stages.sort((a, b) => a.trigger - b.trigger);

    // 计算累计已平仓百分比
    let cumulativeClosePercent = 0;
    for (const stage of stages) {
      // 参数验证
      if (!stage.trigger || !stage.closePercent) {
        continue;
      }

      // 检查该阶段是否已执行，避免重复执行
      if (executedLevels.has(stage.name)) {
        logger.debug(`${stage.name} 已执行，跳过`);
        continue;
      }

      // 计算当前阶段的累计平仓百分比
      cumulativeClosePercent += stage.closePercent;

      // 如果当前累计平仓百分比 <= 已平仓百分比，说明该阶段已经执行过，跳过
      if (cumulativeClosePercent <= partialClosePercentage) {
        // 标记为已执行，避免后续重复检查
        executedLevels.add(stage.name);
        continue;
      }

      // 检查是否达到触发阈值
      if (currentPnlPercent >= stage.trigger) {
        // 获取对应的drawdownThreshold
        let drawdownThreshold = 0;
        if (
          params.partialTakeProfit &&
          // 修复类型错误：添加类型断言和更严格的检查
          (params.partialTakeProfit as any).dynamicStopLoss &&
          (params.partialTakeProfit as any).dynamicStopLoss.peakDrawdown
        ) {
          const peakDrawdown = (params.partialTakeProfit as any).dynamicStopLoss
            .peakDrawdown;
          if (stage.name === "stage1" && peakDrawdown.level1) {
            drawdownThreshold = peakDrawdown.level1.drawdownThreshold;
          } else if (stage.name === "stage2" && peakDrawdown.level2) {
            drawdownThreshold = peakDrawdown.level2.drawdownThreshold;
          } else if (stage.name === "stage3" && peakDrawdown.level3) {
            drawdownThreshold = peakDrawdown.level3.drawdownThreshold;
          }
        }

        return {
          shouldClose: true,
          level: stage.name,
          description: `当前盈利${currentPnlPercent.toFixed(
            2
          )}%达到分批止盈触发阈值${stage.trigger}%，将平仓${
            stage.closePercent
          }%`,
          type: "partial_take_profit",
          closePercent: stage.closePercent,
          drawdownThreshold: drawdownThreshold,
        };
      }
    }
  }

  // 4. 使用策略的 trailingStop 配置（旧配置，向后兼容）
  if (params.trailingStop) {
    const { level1, level2, level3 } = params.trailingStop;

    // 按照从高到低的顺序检查（level3 -> level2 -> level1）
    // 盈利达到 trigger% 时，如果当前盈利回落到 stopAt% 或以下，触发平仓
    const levels = [
      {
        name: "level3",
        trigger: level3.trigger,
        stopAt: level3.stopAt,
      },
      {
        name: "level2",
        trigger: level2.trigger,
        stopAt: level2.stopAt,
      },
      {
        name: "level1",
        trigger: level1.trigger,
        stopAt: level1.stopAt,
      },
    ];

    for (const level of levels) {
      // 参数验证
      if (!level.trigger || !level.stopAt) {
        continue;
      }

      if (peakPnlPercent >= level.trigger) {
        // 峰值达到了触发点
        if (currentPnlPercent <= level.stopAt) {
          // 当前盈利回落到止损点或以下，检查该级别是否已执行
          if (executedLevels.has(level.name)) {
            // 该级别已经执行过，跳过
            logger.debug(`${level.name} 已执行，跳过`);
            continue;
          }
          // 触发平仓
          return {
            shouldClose: true,
            level: level.name,
            description: `峰值${peakPnlPercent.toFixed(2)}%，触发${
              level.trigger
            }%移动止盈，当前${currentPnlPercent.toFixed(2)}%已回落至${
              level.stopAt
            }%止损线`,
            type: "trailing_stop",
            stopAt: level.stopAt,
            closePercent: 100, // 默认全部平仓
          };
        } else {
          // 还在止损线之上，继续持有
          return {
            shouldClose: false,
            level: level.name,
            description: `峰值${peakPnlPercent.toFixed(2)}%，触发${
              level.trigger
            }%移动止盈，止损线${level.stopAt}%，当前${currentPnlPercent.toFixed(
              2
            )}%`,
            type: "trailing_stop_monitoring",
            stopAt: level.stopAt,
          };
        }
      }
    }
  }

  // 5. 检查峰值回落保护（旧配置，向后兼容）
  if (params.peakDrawdownProtection) {
    const drawdownPercent = peakPnlPercent - currentPnlPercent;
    if (drawdownPercent >= params.peakDrawdownProtection) {
      return {
        shouldClose: true,
        level: "peak_drawdown",
        description: `峰值${peakPnlPercent.toFixed(
          2
        )}%，当前${currentPnlPercent.toFixed(
          2
        )}%，回落${drawdownPercent.toFixed(2)}%，达到峰值回落保护阈值${
          params.peakDrawdownProtection
        }%`,
        type: "peak_drawdown",
        closePercent: 100, // 默认全部平仓
      };
    }
  }

  // 峰值未达到任何触发点
  return {
    shouldClose: false,
    level: "未触发",
    description: `峰值${peakPnlPercent.toFixed(2)}%，未达到任何触发点`,
    type: "no_trigger",
  };
}

/**
 * 根据持仓的 exitStrategy 配置检查是否触发平仓条件
 * 支持分批止盈和峰值回落机制
 */
function checkPositionExitStrategy(
  exitStrategy: any,
  peakPnlPercent: number,
  currentPnlPercent: number,
  partialClosePercentage: number = 0,
  executedLevels: Set<string> = new Set() // 已执行的平仓级别，用于避免重复执行
): {
  shouldClose: boolean;
  level: string;
  description: string;
  type: string;
  closePercent?: number;
  stopAt?: number;
  drawdownThreshold?: number;
} {
  // 参数验证
  if (!exitStrategy || !exitStrategy.strategyType) {
    return {
      shouldClose: false,
      level: "无效配置",
      description: "exitStrategy配置无效",
      type: "error",
    };
  }

  const { strategyType, partialTakeProfit, peakDrawdown } = exitStrategy;

  // 计算回落幅度
  const drawdownPercent = peakPnlPercent - currentPnlPercent;

  // 1. 检查分批止盈策略（支持 partialTakeProfit 和 combination 类型）
  if (
    (strategyType === "partialTakeProfit" || strategyType === "combination") &&
    partialTakeProfit
  ) {
    logger.debug(`检查分批止盈策略，strategyType: ${strategyType}`);
    logger.debug(`partialTakeProfit: ${JSON.stringify(partialTakeProfit)}`);
    logger.debug(`currentPnlPercent: ${currentPnlPercent.toFixed(2)}%`);

    // 分批止盈的三个阶段（从低到高排序，方便计算累计平仓百分比）
    const stages = [];

    // 检查并添加stage1
    if (
      partialTakeProfit.stage1 &&
      partialTakeProfit.stage1.trigger !== undefined &&
      partialTakeProfit.stage1.closePercent !== undefined
    ) {
      stages.push({
        name: "stage1",
        trigger: partialTakeProfit.stage1.trigger,
        closePercent: partialTakeProfit.stage1.closePercent,
      });
    }

    // 检查并添加stage2
    if (
      partialTakeProfit.stage2 &&
      partialTakeProfit.stage2.trigger !== undefined &&
      partialTakeProfit.stage2.closePercent !== undefined
    ) {
      stages.push({
        name: "stage2",
        trigger: partialTakeProfit.stage2.trigger,
        closePercent: partialTakeProfit.stage2.closePercent,
      });
    }

    // 检查并添加stage3
    if (
      partialTakeProfit.stage3 &&
      partialTakeProfit.stage3.trigger !== undefined &&
      partialTakeProfit.stage3.closePercent !== undefined
    ) {
      stages.push({
        name: "stage3",
        trigger: partialTakeProfit.stage3.trigger,
        closePercent: partialTakeProfit.stage3.closePercent,
      });
    }

    logger.debug(`stages数组: ${JSON.stringify(stages)}`);

    // 如果没有有效的阶段，直接返回
    if (stages.length === 0) {
      logger.debug("stages数组为空，返回无效配置");
      return {
        shouldClose: false,
        level: "无效配置",
        description: "分批止盈配置无效，没有有效的阶段",
        type: "error",
      };
    }

    // 按照触发阈值从低到高排序，确保正确的检查顺序
    stages.sort((a, b) => a.trigger - b.trigger);
    logger.debug(`排序后的stages数组: ${JSON.stringify(stages)}`);

    // 计算累计已平仓百分比
    let cumulativeClosePercent = 0;
    for (const stage of stages) {
      // 参数验证
      if (!stage.trigger || !stage.closePercent) {
        logger.debug(`跳过无效阶段: ${JSON.stringify(stage)}`);
        continue;
      }

      // 检查该阶段是否已执行，避免重复执行
      if (executedLevels.has(stage.name)) {
        logger.debug(`${stage.name} 已执行，跳过`);
        continue;
      }

      // 计算当前阶段的累计平仓百分比
      cumulativeClosePercent += stage.closePercent;
      logger.debug(
        `检查阶段 ${stage.name}: trigger=${stage.trigger}, closePercent=${stage.closePercent}, cumulativeClosePercent=${cumulativeClosePercent}, partialClosePercentage=${partialClosePercentage}`
      );

      // 如果当前累计平仓百分比 <= 已平仓百分比，说明该阶段已经执行过，跳过
      if (cumulativeClosePercent <= partialClosePercentage) {
        // 标记为已执行，避免后续重复检查
        executedLevels.add(stage.name);
        logger.debug(
          `${stage.name} 已执行（累计平仓百分比 <= 已平仓百分比），跳过`
        );
        continue;
      }

      // 检查是否达到触发阈值
      logger.debug(
        `检查 ${
          stage.name
        } 是否达到触发阈值: currentPnlPercent=${currentPnlPercent.toFixed(
          2
        )}% >= trigger=${stage.trigger}%: ${currentPnlPercent >= stage.trigger}`
      );
      if (currentPnlPercent >= stage.trigger) {
        // 获取对应的drawdownThreshold
        let drawdownThreshold = 0;
        if (
          exitStrategy &&
          exitStrategy.dynamicStopLoss &&
          exitStrategy.dynamicStopLoss.peakDrawdown
        ) {
          const peakDrawdown = exitStrategy.dynamicStopLoss.peakDrawdown;
          if (stage.name === "stage1" && peakDrawdown.level1) {
            drawdownThreshold = peakDrawdown.level1.drawdownThreshold;
          } else if (stage.name === "stage2" && peakDrawdown.level2) {
            drawdownThreshold = peakDrawdown.level2.drawdownThreshold;
          } else if (stage.name === "stage3" && peakDrawdown.level3) {
            drawdownThreshold = peakDrawdown.level3.drawdownThreshold;
          }
        }

        logger.debug(`触发 ${stage.name} 分批止盈`);
        return {
          shouldClose: true,
          level: stage.name,
          description: `当前盈利${currentPnlPercent.toFixed(
            2
          )}%达到分批止盈触发阈值${stage.trigger}%，将平仓${
            stage.closePercent
          }%`,
          type: "partial_take_profit",
          closePercent: stage.closePercent,
          drawdownThreshold: drawdownThreshold,
        };
      }
    }

    logger.debug("没有达到任何分批止盈触发阈值");
  }

  // 2. 检查峰值回落策略（支持 peakDrawdown 和 combination 类型）
  const dynamicStopLoss = exitStrategy.dynamicStopLoss;
  const actualPeakDrawdown = dynamicStopLoss
    ? dynamicStopLoss.peakDrawdown
    : peakDrawdown;

  if (
    (strategyType === "peakDrawdown" || strategyType === "combination") &&
    actualPeakDrawdown
  ) {
    // 确定当前盈利所处的分批止盈阶段，以便匹配对应的峰值回落级别
    let currentStage: "stage1" | "stage2" | "stage3" | null = null;
    let peakLevel: {
      name: string;
      trigger: number;
      closePercent: number;
    } | null = null;

    // 如果是组合策略，需要根据峰值盈利确定所处阶段
    // 关键逻辑：峰值回落级别应该基于峰值盈利所处的阶段，而不是当前盈利
    if (strategyType === "combination" && partialTakeProfit) {
      // 按照分批止盈阶段从高到低检查，确定峰值盈利所处的阶段
      if (
        partialTakeProfit.stage3 &&
        peakPnlPercent >= partialTakeProfit.stage3.trigger
      ) {
        currentStage = "stage3";
        peakLevel = {
          name: "peak_level3",
          trigger: actualPeakDrawdown.level3.drawdownThreshold,
          closePercent: actualPeakDrawdown.level3.closePercent,
        };
      } else if (
        partialTakeProfit.stage2 &&
        peakPnlPercent >= partialTakeProfit.stage2.trigger
      ) {
        currentStage = "stage2";
        peakLevel = {
          name: "peak_level2",
          trigger: actualPeakDrawdown.level2.drawdownThreshold,
          closePercent: actualPeakDrawdown.level2.closePercent,
        };
      } else if (
        partialTakeProfit.stage1 &&
        peakPnlPercent >= partialTakeProfit.stage1.trigger
      ) {
        currentStage = "stage1";
        peakLevel = {
          name: "peak_level1",
          trigger: actualPeakDrawdown.level1.drawdownThreshold,
          closePercent: actualPeakDrawdown.level1.closePercent,
        };
      } else {
        // 峰值盈利未达到任何分批止盈阶段，使用level1作为默认保护
        currentStage = "stage1";
        peakLevel = {
          name: "peak_level1",
          trigger: actualPeakDrawdown.level1.drawdownThreshold,
          closePercent: actualPeakDrawdown.level1.closePercent,
        };
      }

      logger.debug(
        `峰值盈利${peakPnlPercent.toFixed(
          2
        )}%处于${currentStage}阶段，当前盈利${currentPnlPercent.toFixed(
          2
        )}%，使用${peakLevel.name}峰值回落保护（阈值${peakLevel.trigger}%）`
      );
    } else {
      // 非组合策略，按照原有逻辑检查所有级别
      const levels = [
        {
          name: "peak_level3",
          trigger: actualPeakDrawdown.level3.drawdownThreshold,
          closePercent: actualPeakDrawdown.level3.closePercent,
        },
        {
          name: "peak_level2",
          trigger: actualPeakDrawdown.level2.drawdownThreshold,
          closePercent: actualPeakDrawdown.level2.closePercent,
        },
        {
          name: "peak_level1",
          trigger: actualPeakDrawdown.level1.drawdownThreshold,
          closePercent: actualPeakDrawdown.level1.closePercent,
        },
      ];

      // 按照触发阈值从高到低检查
      for (const level of levels) {
        // 参数验证
        if (!level.trigger) {
          continue;
        }

        // 检查是否达到峰值回落触发阈值
        if (drawdownPercent >= level.trigger) {
          // 检查该级别是否已执行
          if (executedLevels.has(level.name)) {
            // 该级别已经执行过，跳过
            logger.debug(`${level.name} 已执行，跳过`);
            continue;
          }
          return {
            shouldClose: true,
            level: level.name,
            description: `峰值${peakPnlPercent.toFixed(
              2
            )}%，当前${currentPnlPercent.toFixed(
              2
            )}%，回落${drawdownPercent.toFixed(2)}%，超过峰值回落保护阈值${
              level.trigger
            }%`,
            type: "peak_drawdown_protection",
            closePercent: level.closePercent || 100,
            drawdownThreshold: level.trigger,
          };
        }
      }
    }

    // 组合策略：检查当前阶段对应的峰值回落级别
    if (peakLevel && peakLevel.trigger) {
      // 检查是否达到峰值回落触发阈值
      if (drawdownPercent >= peakLevel.trigger) {
        // 检查该级别是否已执行
        if (executedLevels.has(peakLevel.name)) {
          logger.debug(`${peakLevel.name} 已执行，跳过`);
        } else {
          return {
            shouldClose: true,
            level: peakLevel.name,
            description: `${currentStage}阶段：峰值${peakPnlPercent.toFixed(
              2
            )}%，当前${currentPnlPercent.toFixed(
              2
            )}%，回落${drawdownPercent.toFixed(2)}%，超过峰值回落保护阈值${
              peakLevel.trigger
            }%`,
            type: "peak_drawdown_protection",
            closePercent: peakLevel.closePercent || 100,
            drawdownThreshold: peakLevel.trigger,
          };
        }
      }
    }
  }

  // 3. 传统的batch策略支持（向后兼容）
  const { batchParams, peakDrawdownParams } = exitStrategy;
  if (strategyType === "batch" && batchParams && batchParams.stages) {
    // 按照触发阈值从高到低排序
    const sortedStages = [...batchParams.stages].sort(
      (a, b) => b.trigger - a.trigger
    );

    for (const stage of sortedStages) {
      // 参数验证
      if (!stage.trigger || !stage.closePercent) {
        continue;
      }

      // 检查是否达到触发阈值
      if (currentPnlPercent >= stage.trigger) {
        return {
          shouldClose: true,
          level: `batch_stage_${stage.trigger}%`,
          description: `当前盈利${currentPnlPercent.toFixed(
            2
          )}%达到分批止盈触发阈值${stage.trigger}%，将平仓${
            stage.closePercent
          }%`,
          type: "batch_take_profit",
          closePercent: stage.closePercent,
        };
      }
    }

    // 检查分批止盈配置中的峰值回落保护
    if (
      batchParams.peakDrawdownProtection &&
      drawdownPercent >= batchParams.peakDrawdownProtection
    ) {
      return {
        shouldClose: true,
        level: "batch_peak_drawdown",
        description: `分批止盈策略下，峰值${peakPnlPercent.toFixed(
          2
        )}%，当前${currentPnlPercent.toFixed(
          2
        )}%，回落${drawdownPercent.toFixed(2)}%，超过峰值回落保护阈值${
          batchParams.peakDrawdownProtection
        }%`,
        type: "batch_peak_drawdown",
        closePercent: 100, // 分批止盈的峰值回落保护默认全部平仓
      };
    }
  }

  // 4. 检查简单止盈止损策略（向后兼容）
  if (strategyType === "simple") {
    const { stopLoss, takeProfit } = exitStrategy;

    if (stopLoss && currentPnlPercent <= -stopLoss) {
      return {
        shouldClose: true,
        level: "simple_stop_loss",
        description: `当前亏损${Math.abs(currentPnlPercent).toFixed(
          2
        )}%，达到止损阈值${stopLoss}%`,
        type: "simple_stop_loss",
        closePercent: 100,
      };
    }

    if (takeProfit && currentPnlPercent >= takeProfit) {
      return {
        shouldClose: true,
        level: "simple_take_profit",
        description: `当前盈利${currentPnlPercent.toFixed(
          2
        )}%，达到止盈阈值${takeProfit}%`,
        type: "simple_take_profit",
        closePercent: 100,
      };
    }
  }

  // 5. 传统的峰值回落策略支持（向后兼容）
  if (strategyType === "peakDrawdown" && peakDrawdownParams) {
    if (
      peakDrawdownParams.protectionThreshold &&
      peakDrawdownParams.trigger &&
      peakPnlPercent >= peakDrawdownParams.trigger &&
      drawdownPercent >= peakDrawdownParams.protectionThreshold
    ) {
      return {
        shouldClose: true,
        level: "peak_drawdown_strategy",
        description: `峰值回落策略下，峰值${peakPnlPercent.toFixed(
          2
        )}%达到触发值${
          peakDrawdownParams.trigger
        }%，当前回落${drawdownPercent.toFixed(2)}%，超过保护阈值${
          peakDrawdownParams.protectionThreshold
        }%`,
        type: "peak_drawdown_strategy",
        closePercent: 100,
      };
    }
  }

  // 未触发任何平仓条件
  return {
    shouldClose: false,
    level: "未触发",
    description: `当前盈利${currentPnlPercent.toFixed(2)}%，未达到任何平仓条件`,
    type: "no_trigger",
  };
}

// 持仓盈利记录：symbol -> { peakPnlPercent, lastCheckTime, priceHistory, initialQuantity, executedLevels }
const positionPnlHistory = new Map<
  string,
  {
    peakPnlPercent: number;
    lastCheckTime: number;
    checkCount: number; // 检查次数，用于日志
    initialQuantity: number; // 初始开仓数量，用于计算已平仓百分比
    baseQuantityForPartialClose: number; // 分批平仓的基准数量（首次触发分批平仓时的持仓量，包含加仓）
    executedLevels: Set<string>; // 已执行的平仓级别，用于避免重复执行
  }
>();

// 账户净值峰值记录（用于精确捕获账户净值峰值）
let accountPeakBalance = 0;
let lastAccountCheckTime = 0;
let accountCheckCount = 0;

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * 检查当前策略是否启用代码级移动止盈
 */
function isTrailingStopEnabled(): boolean {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);
  return params.enableCodeLevelProtection === true;
}

/**
 * 获取移动止盈和分批止盈配置（用于日志输出）
 */
function getTrailingStopConfig() {
  const strategy = getTradingStrategy();
  const params = getStrategyParams(strategy);

  const config: any = {};

  // 添加移动止盈配置
  if (params.trailingStop) {
    config.trailingStop = {
      level1: {
        description: `峰值达到 ${params.trailingStop.level1.trigger}% 时，回落至 ${params.trailingStop.level1.stopAt}% 平仓`,
        trigger: params.trailingStop.level1.trigger,
        stopAt: params.trailingStop.level1.stopAt,
      },
      level2: {
        description: `峰值达到 ${params.trailingStop.level2.trigger}% 时，回落至 ${params.trailingStop.level2.stopAt}% 平仓`,
        trigger: params.trailingStop.level2.trigger,
        stopAt: params.trailingStop.level2.stopAt,
      },
      level3: {
        description: `峰值达到 ${params.trailingStop.level3.trigger}% 时，回落至 ${params.trailingStop.level3.stopAt}% 平仓`,
        trigger: params.trailingStop.level3.trigger,
        stopAt: params.trailingStop.level3.stopAt,
      },
    };
  }

  // 添加分批止盈配置
  if (params.partialTakeProfit) {
    config.partialTakeProfit = {
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

  return config;
}

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
 * 修复移动止盈交易记录
 * 如果价格为0或盈亏不正确，从开仓记录重新计算
 */
async function fixTrailingStopTradeRecord(symbol: string): Promise<void> {
  const exchangeClient = createExchangeClient();

  try {
    // 查找最近的平仓记录
    const closeResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'close' ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol],
    });

    if (!closeResult.rows || closeResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 的平仓记录`);
      return;
    }

    const closeTrade = closeResult.rows[0];
    const id = closeTrade.id;
    const side = closeTrade.side as string;
    let closePrice = Number.parseFloat(closeTrade.price as string);
    const quantity = Number.parseFloat(closeTrade.quantity as string);
    const recordedPnl = Number.parseFloat((closeTrade.pnl as string) || "0");
    const recordedFee = Number.parseFloat((closeTrade.fee as string) || "0");
    const timestamp = closeTrade.timestamp as string;

    // 查找对应的开仓记录
    const openResult = await dbClient.execute({
      sql: `SELECT * FROM trades WHERE symbol = ? AND type = 'open' AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`,
      args: [symbol, timestamp],
    });

    if (!openResult.rows || openResult.rows.length === 0) {
      logger.warn(`未找到 ${symbol} 对应的开仓记录，无法修复`);
      return;
    }

    const openTrade = openResult.rows[0];
    const openPrice = Number.parseFloat(openTrade.price as string);

    // 如果平仓价格为0或无效，尝试获取当前价格作为近似值
    if (closePrice === 0 || !Number.isFinite(closePrice)) {
      try {
        const contract = `${symbol}_USDT`;
        const ticker = await exchangeClient.getFuturesTicker(contract);
        closePrice = Number.parseFloat(ticker.last || ticker.markPrice || "0");

        if (closePrice > 0) {
          logger.info(
            `使用当前ticker价格修复 ${symbol} 平仓价格: ${closePrice}`
          );
        } else {
          logger.error(`无法获取有效价格修复 ${symbol} 交易记录`);
          return;
        }
      } catch (error: any) {
        logger.error(`获取ticker价格失败: ${error.message}`);
        return;
      }
    }

    // 获取合约乘数
    const contract = `${symbol}_USDT`;
    const quantoMultiplier = await getQuantoMultiplier(contract);

    // 重新计算正确的盈亏
    const priceChange =
      side === "long" ? closePrice - openPrice : openPrice - closePrice;

    const grossPnl = priceChange * quantity * quantoMultiplier;
    const openFee = openPrice * quantity * quantoMultiplier * 0.0005;
    const closeFee = closePrice * quantity * quantoMultiplier * 0.0005;
    const totalFee = openFee + closeFee;
    const correctPnl = grossPnl - totalFee;

    // 计算差异
    const priceDiff = Math.abs(
      Number.parseFloat(closeTrade.price as string) - closePrice
    );
    const pnlDiff = Math.abs(recordedPnl - correctPnl);
    const feeDiff = Math.abs(recordedFee - totalFee);

    // 如果需要修复（价格为0或差异大于阈值）
    if (priceDiff > 0.01 || pnlDiff > 0.5 || feeDiff > 0.1) {
      logger.warn(`【修复交易记录】${symbol} ${side}`);
      logger.warn(`  开仓价: ${openPrice.toFixed(4)}`);
      logger.warn(
        `  平仓价: ${Number.parseFloat(closeTrade.price as string).toFixed(
          4
        )} → ${closePrice.toFixed(4)}`
      );
      logger.warn(
        `  盈亏: ${recordedPnl.toFixed(2)} → ${correctPnl.toFixed(
          2
        )} USDT (差异: ${pnlDiff.toFixed(2)})`
      );
      logger.warn(
        `  手续费: ${recordedFee.toFixed(4)} → ${totalFee.toFixed(4)} USDT`
      );

      // 更新数据库
      await dbClient.execute({
        sql: `UPDATE trades SET price = ?, pnl = ?, fee = ? WHERE id = ?`,
        args: [closePrice, correctPnl, totalFee, id],
      });

      logger.info(`【修复完成】${symbol} 交易记录已修复`);
    } else {
      logger.debug(`${symbol} 交易记录正确，无需修复`);
    }
  } catch (error: any) {
    logger.error(`修复 ${symbol} 交易记录失败: ${error.message}`);
    throw error;
  }
}

/**
 * 执行移动止盈平仓
 */
async function executeTrailingStopClose(
  symbol: string,
  side: string,
  quantity: number,
  entryPrice: number,
  currentPrice: number,
  leverage: number,
  pnlPercent: number,
  peakPnlPercent: number,
  drawdownPercent: number,
  drawdownThreshold: number,
  stage: string,
  closePercent: number = 100,
  initialQuantity?: number // 新增：初始持仓数量，用于分批平仓计算
): Promise<boolean> {
  const exchangeClient = createExchangeClient();
  const contract = `${symbol}_USDT`;

  try {
    // 计算实际平仓数量
    // 如果提供了初始数量，则基于初始数量计算；否则基于当前数量计算
    const baseQuantity = initialQuantity || quantity;
    const actualCloseQuantity = Math.min(
      (baseQuantity * closePercent) / 100,
      quantity // 确保不超过当前持仓数量
    );
    const size = side === "long" ? -actualCloseQuantity : actualCloseQuantity;
    const isFullClose = closePercent === 100;

    logger.warn(`【触发平仓 ${stage}】${symbol} ${side}`);
    logger.warn(`  峰值盈利: ${peakPnlPercent.toFixed(2)}%`);
    logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
    logger.warn(
      `  回撤幅度: ${drawdownPercent.toFixed(
        2
      )}% (阈值: ${drawdownThreshold.toFixed(2)}%)`
    );
    logger.warn(`  平仓百分比: ${closePercent}%`);
    logger.warn(
      `  平仓数量: ${actualCloseQuantity} (当前: ${quantity}, 初始: ${baseQuantity})`
    );

    // 1. 执行平仓订单 - 使用优化后的closePosition方法，支持部分平仓
    const order = await exchangeClient.closePosition({
      contract,
      size: actualCloseQuantity, // 指定平仓数量，实现分批平仓
    });

    logger.info(`已下达平仓订单 ${symbol}，订单ID: ${order?.id || "N/A"}`);

    // 2. 计算盈亏
    const actualExitPrice = currentPrice; // 使用当前价格作为默认值
    let pnl = 0;
    let totalFee = 0;
    const orderFilled = true; // 假设平仓成功

    try {
      // 获取合约乘数
      const quantoMultiplier = await getQuantoMultiplier(contract);

      // 计算盈亏
      const priceChange =
        side === "long"
          ? actualExitPrice - entryPrice
          : entryPrice - actualExitPrice;

      const grossPnl = priceChange * actualCloseQuantity * quantoMultiplier;

      // 计算手续费（开仓 + 平仓）
      const openFee =
        entryPrice * actualCloseQuantity * quantoMultiplier * 0.0005;
      const closeFee =
        actualExitPrice * actualCloseQuantity * quantoMultiplier * 0.0005;
      totalFee = openFee + closeFee;

      // 净盈亏
      pnl = grossPnl - totalFee;

      logger.info(
        `平仓成交: 价格=${actualExitPrice.toFixed(
          2
        )}, 数量=${actualCloseQuantity}, 盈亏=${pnl.toFixed(2)} USDT`
      );
    } catch (calcError: any) {
      logger.error(`计算盈亏失败: ${calcError.message}`);
    }

    // 3. 记录到trades表
    const insertResult = await dbClient.execute({
      sql: `INSERT INTO trades (order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        order.id?.toString() || "",
        symbol,
        side,
        "close",
        actualExitPrice,
        actualCloseQuantity,
        leverage,
        pnl,
        totalFee,
        getChinaTimeISO(),
        orderFilled ? "filled" : "pending",
      ],
    });

    // 3.1 立即调用修复工具修复这条交易记录
    try {
      logger.info(`正在验证和修复 ${symbol} 的交易记录...`);
      await fixTrailingStopTradeRecord(symbol);
    } catch (fixError: any) {
      logger.warn(
        `修复交易记录失败: ${fixError.message}，将在下次周期自动修复`
      );
    }

    // 4. 记录决策信息到agent_decisions表
    const decisionText = `【平仓触发 - ${stage}】${symbol} ${
      side === "long" ? "做多" : "做空"
    }
触发阶段: ${stage}
峰值盈利: ${peakPnlPercent.toFixed(2)}%
当前盈利: ${pnlPercent.toFixed(2)}%
回撤幅度: ${drawdownPercent.toFixed(2)}% (阈值: ${drawdownThreshold.toFixed(
      2
    )}%)
平仓百分比: ${closePercent}%
平仓价格: ${actualExitPrice.toFixed(2)}
平仓盈亏: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT

触发条件: 盈利从峰值${peakPnlPercent.toFixed(2)}%回退${drawdownPercent.toFixed(
      2
    )}%，达到${stage}回退阈值${drawdownThreshold.toFixed(2)}%`;

    await dbClient.execute({
      sql: `INSERT INTO agent_decisions 
            (timestamp, iteration, market_analysis, decision, actions_taken, account_value, positions_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        getChinaTimeISO(),
        iterationCount, // 使用当前AI策略回合数
        JSON.stringify({
          trigger: isFullClose ? "full_close" : "partial_close",
          symbol,
          pnlPercent,
          peakPnlPercent,
          drawdownPercent,
          closePercent,
        }),
        decisionText,
        JSON.stringify([
          {
            action: isFullClose ? "close_position" : "partial_close_position",
            symbol,
            reason: "trailing_stop",
            closePercent,
          },
        ]),
        0, // 稍后更新
        0, // 稍后更新
      ],
    });

    // 5. 更新或删除数据库中的持仓记录
    if (isFullClose) {
      // 全部平仓，删除持仓记录
      await dbClient.execute({
        sql: "DELETE FROM positions WHERE symbol = ?",
        args: [symbol],
      });
      // 从内存中清除记录
      positionPnlHistory.delete(symbol);
    } else {
      // 部分平仓，更新持仓数量并添加已执行级别
      const remainingQuantity = quantity - actualCloseQuantity;
      
      // 先获取当前的 executed_levels
      const posResult = await dbClient.execute({
        sql: "SELECT executed_levels FROM positions WHERE symbol = ?",
        args: [symbol],
      });
      const currentExecutedLevelsStr = String(posResult.rows[0]?.executed_levels || "[]");
      
      // 解析当前已执行级别
      let currentExecutedLevels: string[] = [];
      try {
        currentExecutedLevels = JSON.parse(currentExecutedLevelsStr);
      } catch (e) {
        logger.warn(`解析executed_levels失败，使用空数组: ${e}`);
        currentExecutedLevels = [];
      }
      
      // 添加新执行的级别（避免重复）
      if (!currentExecutedLevels.includes(stage)) {
        currentExecutedLevels.push(stage);
        logger.info(`${symbol} 添加已执行级别: ${stage}`);
      }
      
      // 获取当前数据库中的持仓信息
      const posInfoResult = await dbClient.execute({
        sql: "SELECT quantity, partial_close_percentage FROM positions WHERE symbol = ?",
        args: [symbol],
      });
      const currentDbQuantity = Number.parseFloat(posInfoResult.rows[0]?.quantity as string || "0");
      const currentPartialClosePercentage = Number.parseFloat(posInfoResult.rows[0]?.partial_close_percentage as string || "0");
      
      // 计算本次平仓百分比（基于平仓前的数量，即 quantity 参数）
      // 注意：quantity 参数是平仓前的数量，currentDbQuantity 应该等于 quantity
      const thisClosePercent = closePercent; // 直接使用传入的 closePercent 参数
      
      // 累加本次平仓百分比
      const newPartialClosePercentage = currentPartialClosePercentage + thisClosePercent;
      
      logger.info(
        `${symbol} 更新已平仓百分比: ${currentPartialClosePercentage.toFixed(2)}% + ${thisClosePercent.toFixed(2)}% = ${newPartialClosePercentage.toFixed(2)}%`
      );
      
      // 更新数量、已执行级别和已平仓百分比
      await dbClient.execute({
        sql: "UPDATE positions SET quantity = ?, executed_levels = ?, partial_close_percentage = ? WHERE symbol = ?",
        args: [remainingQuantity, JSON.stringify(currentExecutedLevels), newPartialClosePercentage, symbol],
      });
      
      logger.info(
        `${symbol} 部分平仓后更新数据库: 剩余数量=${remainingQuantity}, 已执行级别=${currentExecutedLevels.join(", ")}`
      );
      
      // 更新内存中的持仓记录，保留峰值盈利信息
      const history = positionPnlHistory.get(symbol);
      if (history) {
        // 同步更新内存中的已执行级别
        history.executedLevels = new Set(currentExecutedLevels);
        // 保留峰值盈利，不重置
        logger.info(
          `${symbol} 部分平仓后，保留峰值盈利: ${history.peakPnlPercent.toFixed(
            2
          )}%`
        );
      }
    }

    logger.info(
      `${isFullClose ? "全部平仓" : "部分平仓"}完成 ${symbol}，盈亏：${
        pnl >= 0 ? "+" : ""
      }${pnl.toFixed(2)} USDT`
    );

    return true;
  } catch (error: any) {
    logger.error(`平仓失败 ${symbol}: ${error.message}`);
    return false;
  }
}

/**
 * 检查所有持仓的峰值盈利并执行移动止盈（如果启用）
 * @param autoCloseEnabled 是否启用自动平仓（仅波段策略）
 */
async function checkPeakPnlAndTrailingStop(autoCloseEnabled: boolean) {
  if (!isRunning) {
    return;
  }

  try {
    const exchangeClient = createExchangeClient();
    const now = Date.now();

    // 1. ===== 账户净值峰值监控（所有策略共享）=====
    // 每 10 秒检查一次账户净值，如果创新高则记录到数据库
    try {
      accountCheckCount++;

      // 获取账户信息
      const account = await exchangeClient.getFuturesAccount();
      const accountTotal = Number.parseFloat(account.total || "0");
      const unrealisedPnl = Number.parseFloat(account.unrealisedPnl || "0");
      const totalBalance = accountTotal + unrealisedPnl; // 包含未实现盈亏的真实总资产

      // 初始化峰值（首次运行）
      if (accountPeakBalance === 0) {
        // 从数据库获取历史峰值
        const peakResult = await dbClient.execute(
          "SELECT MAX(total_value) as peak FROM account_history"
        );
        accountPeakBalance = peakResult.rows[0]?.peak
          ? Number.parseFloat(peakResult.rows[0].peak as string)
          : totalBalance;

        logger.info(
          `账户净值峰值初始化: ${accountPeakBalance.toFixed(2)} USDT`
        );
      }

      // 如果当前净值创新高，立即记录到数据库
      if (totalBalance > accountPeakBalance) {
        const oldPeak = accountPeakBalance;
        accountPeakBalance = totalBalance;

        // 记录到数据库（跳过日志，避免过多输出）
        await recordAccountAssets(true);

        logger.info(
          `💰 账户净值创新高: ${oldPeak.toFixed(
            2
          )} USDT → ${accountPeakBalance.toFixed(2)} USDT`
        );
      } else {
        // 每 60 次检查（约 10 分钟）输出一次调试日志
        if (accountCheckCount % 60 === 0) {
          const drawdown =
            accountPeakBalance > 0
              ? ((accountPeakBalance - totalBalance) / accountPeakBalance) * 100
              : 0;
          logger.debug(
            `账户净值监控: 当前=${totalBalance.toFixed(2)} USDT, ` +
              `峰值=${accountPeakBalance.toFixed(2)} USDT, ` +
              `回撤=${drawdown.toFixed(2)}%`
          );
        }
      }

      lastAccountCheckTime = now;
    } catch (error: any) {
      logger.warn(`账户净值监控失败: ${error.message}`);
    }

    // 2. 获取所有持仓
    const gatePositions = await exchangeClient.getPositions();
    const activePositions = gatePositions.filter(
      (p: any) => Number.parseInt(p.size || "0") !== 0
    );

    if (activePositions.length === 0) {
      // 清空内存记录
      positionPnlHistory.clear();
      return;
    }

    // 3. 从数据库获取持仓信息（获取开仓时间、exitStrategy、峰值盈利、初始数量、已执行级别和加权平均成本）
    const dbResult = await dbClient.execute(
      "SELECT symbol, opened_at, exit_strategy, peak_pnl_percent, quantity, executed_levels, average_entry_price, entry_price FROM positions"
    );
    const dbInfoMap = new Map(
      dbResult.rows.map((row: any) => [
        row.symbol,
        {
          openedAt: row.opened_at,
          exitStrategy: row.exit_strategy
            ? JSON.parse(row.exit_strategy)
            : null,
          peakPnlPercent: row.peak_pnl_percent || 0,
          initialQuantity: row.quantity || 0,
          executedLevels: row.executed_levels
            ? new Set(JSON.parse(row.executed_levels))
            : new Set<string>(),
          averageEntryPrice: row.average_entry_price || row.entry_price || 0, // 加权平均成本
        },
      ])
    );

    // 4. 检查每个持仓
    for (const pos of activePositions) {
      const size = Number.parseInt(pos.size || "0");
      const symbol = pos.contract.replace("_USDT", "");
      const side = size > 0 ? "long" : "short";
      const quantity = Math.abs(size);
      
      // 优先使用数据库中的加权平均成本，如果没有则使用交易所的开仓价
      const dbInfo = dbInfoMap.get(symbol);
      const exchangeEntryPrice = Number.parseFloat(pos.entryPrice || "0");
      const entryPrice = dbInfo?.averageEntryPrice || exchangeEntryPrice;
      
      const currentPrice = Number.parseFloat(pos.markPrice || "0");
      const leverage = Number.parseInt(pos.leverage || "1");

      // 验证数据有效性
      if (
        entryPrice === 0 ||
        currentPrice === 0 ||
        leverage === 0 ||
        quantity === 0
      ) {
        logger.warn(
          `${symbol} 数据无效（entryPrice: ${entryPrice}, currentPrice: ${currentPrice}, leverage: ${leverage}, quantity: ${quantity}），跳过峰值监控`
        );
        continue;
      }

      // 计算盈利百分比（考虑杠杆）
      const pnlPercent = calculatePnlPercent(
        entryPrice,
        currentPrice,
        side,
        leverage
      );

      // 获取或初始化盈利历史记录
      let history = positionPnlHistory.get(symbol);
      if (!history) {
        // 初始化峰值盈利，优先使用数据库中的值，否则使用当前盈利
        // dbInfo 已经在上面声明过了，直接使用
        const initialPeak = dbInfo?.peakPnlPercent || pnlPercent;
        // 使用当前持仓数量作为初始数量，只在首次创建时设置，后续不再更新
        const initialQuantity = quantity;
        // 使用从数据库加载的已执行级别集合，确保类型为Set<string>
        const dbExecutedLevels = dbInfo?.executedLevels || new Set<string>();
        // 确保类型安全，将Set<unknown>转换为Set<string>
        const initialExecutedLevels = new Set<string>(
          Array.from(dbExecutedLevels).filter(
            (item) => typeof item === "string"
          )
        );

        history = {
          peakPnlPercent: initialPeak,
          lastCheckTime: now,
          checkCount: 0,
          initialQuantity: initialQuantity,
          baseQuantityForPartialClose: 0, // 初始为0，首次触发分批平仓时设置
          executedLevels: initialExecutedLevels, // 使用从数据库加载的已执行级别集合
        };
        positionPnlHistory.set(symbol, history);
        logger.info(
          `${symbol} 开始跟踪峰值盈利${
            autoCloseEnabled ? "和移动止盈" : "（仅更新峰值）"
          }，初始盈利: ${pnlPercent.toFixed(
            2
          )}%，初始峰值: ${initialPeak.toFixed(
            2
          )}%，初始数量: ${initialQuantity}，已执行级别: ${
            Array.from(initialExecutedLevels).join(", ") || "无"
          }`
        );
      }

      // 确保history已初始化
      if (!history) {
        logger.error(`${symbol} 历史记录初始化失败，跳过`);
        continue;
      }

      // 增加检查次数
      history.checkCount++;

      // ===== 核心功能：更新峰值盈利（所有策略共享）=====
      if (pnlPercent > history.peakPnlPercent) {
        const oldPeak = history.peakPnlPercent;
        history.peakPnlPercent = pnlPercent;

        // 同时更新数据库中的峰值盈利
        await dbClient.execute({
          sql: "UPDATE positions SET peak_pnl_percent = ? WHERE symbol = ?",
          args: [pnlPercent, symbol],
        });

        logger.info(
          `${symbol} 更新峰值盈利: ${oldPeak.toFixed(
            2
          )}% → ${pnlPercent.toFixed(2)}%`
        );
      }

      // 更新最后检查时间
      history.lastCheckTime = now;

      // 获取持仓的 exitStrategy 配置（dbInfo 已经在上面声明过了，直接使用）
      const exitStrategy = dbInfo?.exitStrategy || null;

      // 使用内存中保存的初始数量计算已平仓百分比
      const initialQuantity = history.initialQuantity;
      const closedQuantity = initialQuantity - quantity;
      const partialClosePercentage =
        initialQuantity > 0 ? (closedQuantity / initialQuantity) * 100 : 0;

      // ===== 检查平仓条件（适用于所有启用自动平仓的策略）=====
      if (autoCloseEnabled || (exitStrategy && exitStrategy.strategyType)) {
        // 使用新的检查函数，支持多种平仓策略，传递已平仓百分比和已执行级别
        const exitResult = checkExitConditions(
          history.peakPnlPercent,
          pnlPercent,
          exitStrategy,
          partialClosePercentage,
          history.executedLevels // 传递已执行的平仓级别
        );

        // 调试日志：每10次检查输出一次
        if (history.checkCount % 10 === 0) {
          logger.debug(`${symbol} 平仓策略监控: ${exitResult.description}`);
        }

        // 计算回退百分比（绝对值）
        const drawdownPercent = history.peakPnlPercent - pnlPercent;

        // 检查是否应该平仓
        if (exitResult.shouldClose) {
          // 首次触发分批平仓时，记录基准数量（包含所有加仓后的总持仓）
          if (history.baseQuantityForPartialClose === 0) {
            history.baseQuantityForPartialClose = quantity;
            logger.info(
              `${symbol} 首次触发分批平仓，记录基准数量: ${quantity}张`
            );
          }

          logger.warn(`${symbol} 触发平仓:`);
          logger.warn(`  触发类型: ${exitResult.type}`);
          logger.warn(`  触发级别: ${exitResult.level}`);
          logger.warn(`  ${exitResult.description}`);
          logger.warn(`  峰值盈利: ${history.peakPnlPercent.toFixed(2)}%`);
          logger.warn(`  当前盈利: ${pnlPercent.toFixed(2)}%`);
          logger.warn(`  回退幅度: ${drawdownPercent.toFixed(2)}%`);
          if (exitResult.stopAt) {
            logger.warn(`  止损线: ${exitResult.stopAt}%`);
          }
          if (exitResult.closePercent) {
            logger.warn(`  平仓百分比: ${exitResult.closePercent}%`);
          }

          // 执行平仓，支持分批平仓
          const closePercent = exitResult.closePercent || 100;
          // 使用基准数量（首次触发时的总持仓）计算平仓数量
          const baseQuantity = history.baseQuantityForPartialClose || quantity;
          const success = await executeTrailingStopClose(
            symbol,
            side,
            quantity, // 当前持仓数量
            entryPrice,
            currentPrice,
            leverage,
            pnlPercent,
            history.peakPnlPercent,
            drawdownPercent,
            exitResult.drawdownThreshold || exitResult.stopAt || 0,
            exitResult.level,
            closePercent,
            baseQuantity // 传入基准数量（首次触发时的总持仓）
          );

          if (success) {
            logger.info(`${symbol} 平仓成功`);

            // 注意：executed_levels 已经在 executeTrailingStopClose 函数中更新到数据库
            // 这里只需要同步更新内存中的记录即可
            history.executedLevels.add(exitResult.level);
            logger.info(`${symbol} 内存中记录已执行平仓级别: ${exitResult.level}`);

            // 如果是分批平仓，更新持仓相关信息
            if (closePercent < 100) {
              // 部分平仓后，继续跟踪当前峰值，不重置为当前盈利
              // 这样可以让剩余仓位继续享受潜在的上涨空间
              logger.info(
                `${symbol} 部分平仓后，继续跟踪当前峰值: ${history.peakPnlPercent.toFixed(
                  2
                )}%`
              );
            }
          }
        } else {
          // 每10次检查输出一次调试日志
          if (history.checkCount % 10 === 0) {
            logger.debug(
              `${symbol} ${
                exitResult.type
              } 监控中: 峰值${history.peakPnlPercent.toFixed(
                2
              )}%, 当前${pnlPercent.toFixed(2)}%, 回退${drawdownPercent.toFixed(
                2
              )}%`
            );
          }
        }
      } else if (!autoCloseEnabled) {
        // 非自动平仓策略：仅更新峰值，不执行自动平仓
        continue;
      }
    }

    // 6. 清理已平仓的记录
    const activeSymbols = new Set(
      activePositions.map((p: any) => p.contract.replace("_USDT", ""))
    );

    for (const symbol of positionPnlHistory.keys()) {
      if (!activeSymbols.has(symbol)) {
        positionPnlHistory.delete(symbol);
        logger.debug(`清理已平仓的记录: ${symbol}`);
      }
    }
  } catch (error: any) {
    logger.error(`移动止盈检查失败: ${error.message}`);
  }
}

/**
 * 启动峰值盈利监控和移动止盈（适用所有策略）
 * - 所有策略：每10秒更新持仓峰值盈利
 * - 波段策略：额外执行自动移动止盈平仓
 */
export function startTrailingStopMonitor() {
  if (isRunning) {
    logger.warn("峰值盈利监控已在运行中");
    return;
  }

  const strategy = getTradingStrategy();
  const autoCloseEnabled = isTrailingStopEnabled(); // swing-trend 策略返回 true

  isRunning = true;

  logger.info("=".repeat(60));
  logger.info("🚀 启动实时峰值监控（持仓 + 账户）");
  logger.info("=".repeat(60));
  logger.info(`  当前策略: ${strategy}`);
  logger.info(`  检查间隔: 10秒`);
  logger.info(``);
  logger.info(`  【持仓峰值监控】`);
  logger.info(`    峰值更新: ✅ 启用（所有策略）`);
  logger.info(
    `    自动平仓: ${
      autoCloseEnabled ? "✅ 启用（波段策略）" : "❌ 禁用（由 AI 决策）"
    }`
  );
  logger.info(``);
  logger.info(`  【账户净值峰值监控】`);
  logger.info(`    峰值更新: ✅ 启用（所有策略）`);
  logger.info(`    精确记录: 净值创新高时立即写入数据库`);
  logger.info(`    解决问题: 交易周期长导致错过净值峰值`);

  if (autoCloseEnabled) {
    const config = getTrailingStopConfig();
    if (config) {
      // 显示移动止盈规则
      if (config.trailingStop) {
        logger.info(``);
        logger.info(`  【移动止盈规则】`);
        logger.info(`    Level1: ${config.trailingStop.level1.description}`);
        logger.info(`    Level2: ${config.trailingStop.level2.description}`);
        logger.info(`    Level3: ${config.trailingStop.level3.description}`);
      }

      // 显示分批止盈规则
      if (config.partialTakeProfit) {
        logger.info(``);
        logger.info(`  【分批止盈规则】`);
        logger.info(
          `    Stage1: ${config.partialTakeProfit.stage1.description}`
        );
        logger.info(
          `    Stage2: ${config.partialTakeProfit.stage2.description}`
        );
        logger.info(
          `    Stage3: ${config.partialTakeProfit.stage3.description}`
        );
      }
    }
  } else {
    logger.info(``);
    logger.info(`  【说明】`);
    logger.info(`    • 持仓：仅更新峰值盈利，不执行自动平仓`);
    logger.info(`    • 账户：精确捕获净值峰值，供 AI 计算回撤`);
    logger.info(`    • 决策：所有平仓决策由 AI 根据峰值数据判断`);
  }
  logger.info("=".repeat(60));

  // 立即执行一次
  checkPeakPnlAndTrailingStop(autoCloseEnabled);

  // 每10秒执行一次
  monitorInterval = setInterval(() => {
    checkPeakPnlAndTrailingStop(autoCloseEnabled);
  }, 10 * 1000);
}

/**
 * 停止移动止盈监控
 */
export function stopTrailingStopMonitor() {
  if (!isRunning) {
    logger.warn("移动止盈监控未在运行");
    return;
  }

  isRunning = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  positionPnlHistory.clear();
  logger.info("移动止盈监控已停止");
}
