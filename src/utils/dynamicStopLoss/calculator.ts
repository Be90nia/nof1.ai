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
 * 动态止损计算器
 *
 * 负责计算动态止损阈值和追踪止损价格
 */

import { createLogger } from "../loggerUtils";
import {
  CalculationError,
  ValidationError,
  retryWithBackoff,
} from "../errorHandler";
import type { IndicatorCalculator } from "./indicatorCalculator";
import type {
  DynamicStopLossFactors,
  DynamicThresholdParams,
  DynamicThresholdResult,
  TrailingStopParams,
} from "./types";

const logger = createLogger({
  name: "dynamic-stop-loss-calculator",
  level: "info",
});

/**
 * 动态止损计算器类
 */
export class DynamicStopLossCalculator {
  private indicatorCalculator: IndicatorCalculator;

  constructor(indicatorCalculator: IndicatorCalculator) {
    this.indicatorCalculator = indicatorCalculator;
  }

  /**
   * 根据杠杆倍数获取基础止损阈值
   * @param leverage 杠杆倍数
   * @returns 基础止损阈值（负数）
   */
  private getBaseThreshold(leverage: number): number {
    // 根据杠杆倍数确定基础止损阈值
    // 杠杆越高，止损越严格
    if (leverage >= 13) {
      return -8; // 高杠杆：-8%
    }
    if (leverage >= 8) {
      return -10; // 中杠杆：-10%
    }
    return -15; // 低杠杆：-15%
  }

  /**
   * 计算动态因子
   * 将指标值转换为因子值
   *
   * @param trendStrength 趋势强度 (-100 到 100)
   * @param volatilityNormalized 归一化波动率 (0-100)
   * @param sevenSegmentLevel 七分位位置 (1-7)
   * @param volumeFactor 成交量因子 (0-100)
   * @param timeDecayFactor 时间衰减因子 (0-1)
   * @returns 动态因子
   */
  private calculateDynamicFactors(
    trendStrength: number,
    volatilityNormalized: number,
    sevenSegmentLevel: number,
    volumeFactor: number,
    timeDecayFactor: number
  ): DynamicStopLossFactors {
    // 1. 趋势强度因子 (-0.2 到 0.3)
    // 趋势越强（正值越大），因子越大，止损越宽松
    const trendFactor = (trendStrength / 100) * 0.25; // 映射到 -0.25 到 0.25
    const clampedTrendFactor = Math.max(-0.2, Math.min(0.3, trendFactor));

    // 2. 波动率因子 (0 到 0.5)
    // 波动率越高，因子越大，止损越宽松
    const volatilityFactor = (volatilityNormalized / 100) * 0.5;

    // 3. 七分位因子 (-0.1 到 0.2)
    // 低位七分位（1-3）：较窄止损（负因子）
    // 高位七分位（4-7）：较宽止损（正因子）
    let sevenSegmentFactor = 0;
    if (sevenSegmentLevel <= 3) {
      // 低位：-0.1 到 0
      sevenSegmentFactor = ((sevenSegmentLevel - 1) / 2 - 1) * 0.1;
    } else {
      // 高位：0 到 0.2
      sevenSegmentFactor = ((sevenSegmentLevel - 4) / 3) * 0.2;
    }

    // 4. 成交量因子 (0 到 0.3)
    // 成交量异常放大时，收紧止损
    const volumeFactorValue =
      volumeFactor > 70 ? ((volumeFactor - 50) / 50) * 0.3 : 0;

    // 5. 时间衰减因子 (0 到 0.4)
    // 持仓时间越长，收紧止损
    const timeDecayFactorValue = timeDecayFactor * 0.4;

    return {
      trendStrength: clampedTrendFactor,
      volatility: volatilityFactor,
      sevenSegment: sevenSegmentFactor,
      volume: volumeFactorValue,
      timeDecay: timeDecayFactorValue,
    };
  }

  /**
   * 计算动态止损阈值
   *
   * @param params 动态阈值参数
   * @returns 动态止损阈值结果
   */
  async calculateDynamicThreshold(
    params: DynamicThresholdParams
  ): Promise<DynamicThresholdResult> {
    logger.info({
      action: "calculate_dynamic_threshold_start",
      symbol: params.symbol,
      leverage: params.leverage,
      message: "开始计算动态止损阈值",
    });

    return retryWithBackoff(
      async () => {
        try {
          if (!params.symbol || !params.currentPrice || !params.entryPrice) {
            throw new ValidationError("缺少必要参数", {
              symbol: params.symbol,
              currentPrice: params.currentPrice,
              entryPrice: params.entryPrice,
            });
          }

          if (params.leverage <= 0) {
            throw new ValidationError("杠杆倍数必须大于0", {
              leverage: params.leverage,
            });
          }

          const baseThreshold = this.getBaseThreshold(params.leverage);

          const indicators =
            await this.indicatorCalculator.calculateAllIndicators(
              params.symbol,
              params.currentPrice,
              params.holdingTime
            );

          const factors = this.calculateDynamicFactors(
            indicators.trendStrength,
            indicators.volatility.normalized,
            indicators.sevenSegmentLevel,
            indicators.volumeFactor,
            indicators.timeDecayFactor
          );

          const factorSum =
            1 +
            factors.trendStrength +
            factors.volatility +
            factors.sevenSegment -
            factors.volume -
            factors.timeDecay;

          const dynamicThreshold = baseThreshold * factorSum;

          const minThreshold = baseThreshold * 1.5;
          const maxThreshold = baseThreshold * 0.5;
          const clampedThreshold = Math.max(
            minThreshold,
            Math.min(maxThreshold, dynamicThreshold)
          );

          const description = `动态止损阈值: ${clampedThreshold.toFixed(
            2
          )}% (基础: ${baseThreshold}%, 趋势: ${(
            factors.trendStrength * 100
          ).toFixed(1)}%, 波动: ${(factors.volatility * 100).toFixed(
            1
          )}%, 七分位: ${(factors.sevenSegment * 100).toFixed(1)}%, 成交量: -${(
            factors.volume * 100
          ).toFixed(1)}%, 时间: -${(factors.timeDecay * 100).toFixed(1)}%)`;

          logger.info({
            action: "calculate_dynamic_threshold_success",
            symbol: params.symbol,
            baseThreshold,
            dynamicThreshold,
            clampedThreshold,
            factors,
            indicators: {
              trendStrength: indicators.trendStrength,
              volatility: indicators.volatility.normalized,
              sevenSegmentLevel: indicators.sevenSegmentLevel,
              volumeFactor: indicators.volumeFactor,
              timeDecayFactor: indicators.timeDecayFactor,
            },
            message: "动态止损阈值计算成功",
          });

          return {
            threshold: clampedThreshold,
            baseThreshold,
            factors,
            description,
          };
        } catch (error) {
          if (
            error instanceof CalculationError ||
            error instanceof ValidationError
          ) {
            throw error;
          }
          throw new CalculationError(
            `计算动态止损阈值失败: ${(error as Error).message}`,
            {
              symbol: params.symbol,
              leverage: params.leverage,
              currentPrice: params.currentPrice,
            }
          );
        }
      },
      {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 500,
      }
    );
  }

  /**
   * 计算追踪止损价格
   *
   * @param params 追踪止损参数
   * @returns 追踪止损价格
   */
  async calculateTrailingStopPrice(
    params: TrailingStopParams
  ): Promise<number> {
    logger.info({
      action: "calculate_trailing_stop_start",
      symbol: params.symbol,
      side: params.side,
      currentPrice: params.currentPrice,
      peakPrice: params.peakPrice,
      message: "开始计算追踪止损价格",
    });

    return retryWithBackoff(
      async () => {
        try {
          if (!params.symbol || !params.currentPrice || !params.peakPrice) {
            throw new ValidationError("缺少必要参数", {
              symbol: params.symbol,
              currentPrice: params.currentPrice,
              peakPrice: params.peakPrice,
            });
          }

          if (params.currentPrice <= 0 || params.peakPrice <= 0) {
            throw new ValidationError("价格必须大于0", {
              currentPrice: params.currentPrice,
              peakPrice: params.peakPrice,
            });
          }

          if (params.side !== "long" && params.side !== "short") {
            throw new ValidationError("无效的交易方向", {
              side: params.side,
            });
          }

          let retracePercent: number;
          if (params.side === "long") {
            retracePercent =
              ((params.currentPrice - params.peakPrice) / params.peakPrice) *
              100;
          } else {
            retracePercent =
              ((params.peakPrice - params.currentPrice) / params.peakPrice) *
              100;
          }

          let trailingDistance: number;
          if (Math.abs(retracePercent) < 2) {
            trailingDistance = 3;
          } else if (Math.abs(retracePercent) < 5) {
            trailingDistance = 2;
          } else {
            trailingDistance = 1.5;
          }

          let trailingStopPrice: number;
          if (params.side === "long") {
            trailingStopPrice = params.peakPrice * (1 - trailingDistance / 100);
          } else {
            trailingStopPrice = params.peakPrice * (1 + trailingDistance / 100);
          }

          logger.info({
            action: "calculate_trailing_stop_success",
            symbol: params.symbol,
            side: params.side,
            currentPrice: params.currentPrice,
            peakPrice: params.peakPrice,
            retracePercent: retracePercent.toFixed(2),
            trailingDistance: trailingDistance.toFixed(2),
            trailingStopPrice,
            message: "追踪止损价格计算成功",
          });

          return trailingStopPrice;
        } catch (error) {
          if (
            error instanceof CalculationError ||
            error instanceof ValidationError
          ) {
            throw error;
          }
          throw new CalculationError(
            `计算追踪止损价格失败: ${(error as Error).message}`,
            {
              symbol: params.symbol,
              side: params.side,
              currentPrice: params.currentPrice,
            }
          );
        }
      },
      {
        maxAttempts: 2,
        initialDelay: 50,
        maxDelay: 200,
      }
    );
  }

  /**
   * 判断是否应该触发动态止损
   *
   * @param params 动态阈值参数
   * @returns 是否应该触发止损
   */
  async shouldTriggerDynamicStopLoss(
    params: DynamicThresholdParams
  ): Promise<boolean> {
    logger.info({
      action: "check_stop_loss_trigger_start",
      symbol: params.symbol,
      side: params.side,
      currentPrice: params.currentPrice,
      entryPrice: params.entryPrice,
      message: "开始检查是否触发动态止损",
    });

    return retryWithBackoff(
      async () => {
        try {
          if (!params.symbol || !params.currentPrice || !params.entryPrice) {
            throw new ValidationError("缺少必要参数", {
              symbol: params.symbol,
              currentPrice: params.currentPrice,
              entryPrice: params.entryPrice,
            });
          }

          if (params.side !== "long" && params.side !== "short") {
            throw new ValidationError("无效的交易方向", {
              side: params.side,
            });
          }

          const thresholdResult = await this.calculateDynamicThreshold(params);

          let pnlPercent: number;
          if (params.side === "long") {
            pnlPercent =
              ((params.currentPrice - params.entryPrice) / params.entryPrice) *
              100;
          } else {
            pnlPercent =
              ((params.entryPrice - params.currentPrice) / params.entryPrice) *
              100;
          }

          const shouldTrigger = pnlPercent <= thresholdResult.threshold;

          logger.info({
            action: "check_stop_loss_trigger_result",
            symbol: params.symbol,
            side: params.side,
            currentPrice: params.currentPrice,
            entryPrice: params.entryPrice,
            pnlPercent: pnlPercent.toFixed(2),
            threshold: thresholdResult.threshold,
            shouldTrigger,
            description: thresholdResult.description,
            message: shouldTrigger ? "触发动态止损" : "未触发动态止损",
          });

          return shouldTrigger;
        } catch (error) {
          if (
            error instanceof CalculationError ||
            error instanceof ValidationError
          ) {
            throw error;
          }
          throw new CalculationError(
            `检查动态止损触发失败: ${(error as Error).message}`,
            {
              symbol: params.symbol,
              side: params.side,
              currentPrice: params.currentPrice,
            }
          );
        }
      },
      {
        maxAttempts: 2,
        initialDelay: 50,
        maxDelay: 200,
      }
    );
  }
}

/**
 * 创建动态止损计算器实例
 *
 * @param indicatorCalculator 指标计算器实例
 * @returns 动态止损计算器实例
 */
export function createDynamicStopLossCalculator(
  indicatorCalculator: IndicatorCalculator
): DynamicStopLossCalculator {
  return new DynamicStopLossCalculator(indicatorCalculator);
}
