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

import {
  getStrategyParams,
  getTradingStrategy,
} from "../../agents/tradingAgent";
import { getAgentStrategyParams } from "../../tools/strategyParams";
import { createLogger } from "../../utils/loggerUtils";
import { generateCaiSenPrompt } from "./prompt";
import { dbClient } from "../../database/dbClient";
import {
  allocateDynamicTimeframeWeights,
  confirmSignal,
  calculateOptimizedSevenSegments,
  detectMarketState,
  calculateIntelligentTrailingStop,
  calculateDynamicPositionSize,
  runScenarioSimulations,
  calculatePortfolioDiversification,
} from "./optimization";
import type {
  CaiSenAnalysisResult,
  StrategyParams,
  StrategyPromptContext,
  MultiTimeframeAnalysis,
  SevenSegmentAnalysis,
} from "./types";
import type {
  MarketStateData,
  TrailingStopParams,
  DynamicPositionSizingParams,
} from "./optimization";

const logger = createLogger({
  name: "caisen-strategy-manager",
  level: "info",
});

/**
 * 蔡森策略管理类
 * 负责整合所有蔡森策略相关逻辑，提供策略查看和管理功能
 */
export class CaiSenStrategyManager {
  private static instance: CaiSenStrategyManager;
  private currentStrategyParams: any | null = null;
  // 新增：存储Agent设置的分币种参数
  private agentParamsBySymbol: Record<string, Record<string, any>> = {};
  private lastAnalysisResults: Map<string, CaiSenAnalysisResult> = new Map();
  private strategyExecutionHistory: Array<{
    timestamp: number;
    action: string;
    details: any;
  }> = [];

  private constructor() {
    // 私有构造函数，防止直接实例化
  }

  /**
   * 获取策略管理器单例实例
   */
  public static getInstance(): CaiSenStrategyManager {
    if (!CaiSenStrategyManager.instance) {
      CaiSenStrategyManager.instance = new CaiSenStrategyManager();
    }
    return CaiSenStrategyManager.instance;
  }

  /**
   * 初始化策略管理器
   */
  public async init(): Promise<void> {
    await this.loadStrategyParams();
    await this.refreshAgentParams();
    await this.syncStrategyParamsToDatabase();
    logger.info("蔡森策略管理器已初始化");
  }

  /**
   * 加载当前策略参数
   * 实现双向同步：先从文件加载，再从数据库同步最新配置
   */
  private async loadStrategyParams(): Promise<void> {
    try {
      const strategy = getTradingStrategy();
      if (strategy === "cai-sen") {
        // 1. 先从文件加载基础策略参数
        const baseParams = getStrategyParams(strategy);

        // 2. 从数据库加载最新的策略配置（如果有）
        const dbParams = await this.loadStrategyParamsFromDatabase();

        // 3. 合并参数：数据库参数优先，覆盖基础参数
        this.currentStrategyParams = {
          ...baseParams,
          ...dbParams,
        };

        logger.info("已加载蔡森策略参数（双向同步）");
      } else {
        logger.info(`当前策略不是蔡森策略，而是: ${strategy}`);
        this.currentStrategyParams = null;
      }
    } catch (error) {
      logger.error("加载策略参数失败:", error as any);
      this.currentStrategyParams = null;
    }
  }

  /**
   * 从数据库加载策略参数
   */
  private async loadStrategyParamsFromDatabase(): Promise<any> {
    try {
      const result = await dbClient.execute({
        sql: `SELECT value FROM strategy_params WHERE strategy = ? AND key = ?`,
        args: ["cai-sen", "positionExitStrategy"],
      });

      if (result.rows && result.rows.length > 0) {
        return JSON.parse(result.rows[0].value);
      }
    } catch (error) {
      logger.error("从数据库加载策略参数失败:", error as any);
    }
    return {};
  }

  /**
   * 将策略参数同步到数据库
   */
  private async syncStrategyParamsToDatabase(): Promise<void> {
    try {
      if (!this.currentStrategyParams) return;

      const strategy = getTradingStrategy();
      if (strategy === "cai-sen") {
        // 同步核心策略参数到数据库
        await dbClient.execute({
          sql: `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at) 
                VALUES (?, ?, ?, datetime('now'))`,
          args: [
            "positionExitStrategy",
            JSON.stringify(this.currentStrategyParams.positionExitStrategy),
            "cai-sen",
          ],
        });

        // 同步分币种参数
        for (const [symbol, params] of Object.entries(
          this.agentParamsBySymbol
        )) {
          await dbClient.execute({
            sql: `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
                  VALUES (?, ?, ?, datetime('now'), ?)`,
            args: [
              `agentParams_${symbol}`,
              JSON.stringify(params),
              "cai-sen",
              `Agent设置的${symbol}参数`,
            ],
          });
        }

        logger.info("策略参数已同步到数据库");
      }
    } catch (error) {
      logger.error("同步策略参数到数据库失败:", error as any);
    }
  }

  /**
   * 刷新Agent设置的策略参数
   * 在每个交易周期开始时调用，确保使用最新的参数
   */
  public async refreshAgentParams(): Promise<void> {
    try {
      const strategy = getTradingStrategy();
      if (strategy === "cai-sen") {
        // 1. 从Agent获取最新参数
        const agentParams = await getAgentStrategyParams(strategy);

        // 2. 从数据库获取持久化的参数
        const dbResult = await dbClient.execute({
          sql: `SELECT key, value FROM strategy_params WHERE strategy = ? AND key LIKE ?`,
          args: ["cai-sen", "agentParams_%"],
        });

        // 3. 合并参数：Agent参数优先，数据库参数作为备份
        const dbAgentParams: Record<string, Record<string, any>> = {};
        if (dbResult.rows) {
          for (const row of dbResult.rows) {
            const symbol = row.key.replace("agentParams_", "");
            dbAgentParams[symbol] = JSON.parse(row.value);
          }
        }

        // 合并：Agent参数覆盖数据库参数
        this.agentParamsBySymbol = {
          ...dbAgentParams,
          ...agentParams,
        };

        logger.info("已刷新Agent设置的策略参数");
        logger.debug("当前Agent参数:", this.agentParamsBySymbol);

        // 4. 将最新参数同步回数据库
        await this.syncStrategyParamsToDatabase();
      }
    } catch (error) {
      logger.error("刷新Agent策略参数失败:", error as any);
      this.agentParamsBySymbol = {};
    }
  }

  /**
   * 更新策略参数并同步到数据库
   */
  public async updateStrategyParams(
    params: Partial<StrategyParams>
  ): Promise<void> {
    try {
      if (!this.currentStrategyParams) {
        throw new Error("策略参数未初始化");
      }

      // 更新内存中的参数
      this.currentStrategyParams = {
        ...this.currentStrategyParams,
        ...params,
      };

      // 同步到数据库
      await this.syncStrategyParamsToDatabase();

      logger.info("策略参数已更新并同步到数据库");
    } catch (error) {
      logger.error("更新策略参数失败:", error as any);
      throw error;
    }
  }

  /**
   * 更新特定币种的Agent参数并同步到数据库
   */
  public async updateAgentParamsForSymbol(
    symbol: string,
    params: Record<string, any>
  ): Promise<void> {
    try {
      // 更新内存中的参数
      this.agentParamsBySymbol[symbol] = {
        ...this.agentParamsBySymbol[symbol],
        ...params,
      };

      // 同步到数据库
      await this.syncStrategyParamsToDatabase();

      logger.info(`已更新${symbol}的Agent参数并同步到数据库`);
    } catch (error) {
      logger.error(`更新${symbol}的Agent参数失败: ${error as any}`);
      throw error;
    }
  }

  /**
   * 获取当前蔡森策略配置
   */
  public getCurrentStrategy(): StrategyParams | null {
    if (!this.currentStrategyParams) {
      this.loadStrategyParams();
    }
    return this.currentStrategyParams;
  }

  /**
   * 获取当前策略的AI提示词
   */
  public async getCurrentPrompt(
    context: StrategyPromptContext
  ): Promise<string | null> {
    // 在获取提示词前刷新参数，确保使用最新设置
    await this.refreshAgentParams();

    const params = this.getCurrentStrategy();
    if (!params) {
      return null;
    }

    // 生成提示词时传递分币种参数
    return generateCaiSenPrompt(params, context, {
      // 这里可以添加更多数据，包括分币种参数
      agentParamsBySymbol: this.agentParamsBySymbol,
    });
  }

  /**
   * 获取特定币种的Agent设置参数
   */
  public getAgentParamsForSymbol(symbol: string): Record<string, any> {
    return this.agentParamsBySymbol[symbol] || {};
  }

  /**
   * 获取所有Agent设置的分币种参数
   */
  public getAllAgentParams(): Record<string, Record<string, any>> {
    return { ...this.agentParamsBySymbol };
  }

  /**
   * 记录策略执行历史
   */
  public recordExecution(action: string, details: any): void {
    this.strategyExecutionHistory.push({
      timestamp: Date.now(),
      action,
      details,
    });

    // 限制历史记录数量，最多保存100条
    if (this.strategyExecutionHistory.length > 100) {
      this.strategyExecutionHistory.shift();
    }
  }

  /**
   * 获取策略执行历史
   */
  public getExecutionHistory(): Array<{
    timestamp: number;
    action: string;
    details: any;
  }> {
    return [...this.strategyExecutionHistory];
  }

  /**
   * 保存分析结果
   */
  public saveAnalysisResult(
    symbol: string,
    result: CaiSenAnalysisResult
  ): void {
    this.lastAnalysisResults.set(symbol, result);
  }

  /**
   * 获取指定币种的最新分析结果
   */
  public getLastAnalysisResult(
    symbol: string
  ): CaiSenAnalysisResult | undefined {
    return this.lastAnalysisResults.get(symbol);
  }

  /**
   * 获取所有币种的最新分析结果
   */
  public getAllAnalysisResults(): Map<string, CaiSenAnalysisResult> {
    return new Map(this.lastAnalysisResults);
  }

  /**
   * 检查当前是否为蔡森策略
   */
  public isCaiSenStrategy(): boolean {
    return getTradingStrategy() === "cai-sen";
  }

  /**
   * 获取策略状态摘要
   */
  public getStrategyStatusSummary(): {
    isActive: boolean;
    strategyName: string;
    params: StrategyParams | null;
    lastAnalysisCount: number;
    executionHistoryCount: number;
  } {
    return {
      isActive: this.isCaiSenStrategy(),
      strategyName: getTradingStrategy(),
      params: this.getCurrentStrategy(),
      lastAnalysisCount: this.lastAnalysisResults.size,
      executionHistoryCount: this.strategyExecutionHistory.length,
    };
  }

  /**
   * 分配动态时间框架权重
   * @param volatility 市场波动率
   * @param trendStrength 趋势强度
   * @param marketState 市场状态
   * @returns 动态调整后的时间框架权重
   */
  public allocateDynamicWeights(
    volatility: number,
    trendStrength: number,
    marketState: string
  ): ReturnType<typeof allocateDynamicTimeframeWeights> {
    const params = this.getCurrentStrategy();
    if (!params?.caiSen?.timeframeAnalysis) {
      throw new Error("蔡森策略参数未配置");
    }

    const {
      dailyWeight,
      hourlyWeight,
      fifteenMinWeight = 0.3,
      fiveMinWeight,
    } = params.caiSen.timeframeAnalysis;

    return allocateDynamicTimeframeWeights(
      volatility,
      trendStrength,
      marketState,
      {
        daily: dailyWeight,
        hourly: hourlyWeight,
        fifteenMin: fifteenMinWeight,
        fiveMin: fiveMinWeight,
      }
    );
  }

  /**
   * 检测市场状态
   * @param marketData 市场数据
   * @returns 市场状态
   */
  public detectCurrentMarketState(
    marketData: MarketStateData
  ): ReturnType<typeof detectMarketState> {
    return detectMarketState(marketData);
  }

  /**
   * 确认交易信号
   * @param multiTimeframeAnalysis 多时间框架分析结果
   * @param sevenSegmentAnalysis 七分位分析结果
   * @param marketData 市场数据
   * @param microstructureData 微观结构数据（可选）
   * @returns 信号确认结果
   */
  public confirmTradingSignal(
    multiTimeframeAnalysis: MultiTimeframeAnalysis,
    sevenSegmentAnalysis: SevenSegmentAnalysis,
    marketData: MarketStateData,
    microstructureData?: any
  ): ReturnType<typeof confirmSignal> {
    return confirmSignal(
      multiTimeframeAnalysis,
      sevenSegmentAnalysis,
      marketData,
      microstructureData
    );
  }

  /**
   * 计算优化的七分位
   * @param marketData 市场数据
   * @param historicalPrices 历史价格数据
   * @param historicalVolumes 历史成交量数据
   * @returns 优化的七分位计算结果
   */
  public calculateOptimizedSegments(
    marketData: MarketStateData,
    historicalPrices: number[],
    historicalVolumes: number[]
  ): ReturnType<typeof calculateOptimizedSevenSegments> {
    return calculateOptimizedSevenSegments(
      marketData,
      historicalPrices,
      historicalVolumes
    );
  }

  /**
   * 计算智能移动止损
   * @param entryPrice 开仓价格
   * @param currentPrice 当前价格
   * @param direction 交易方向
   * @param atr 当前ATR值
   * @param holdingTime 持仓时间（分钟）
   * @param highestPrice 持仓期间最高价
   * @param lowestPrice 持仓期间最低价
   * @param params 移动止损参数
   * @returns 计算出的智能移动止损价格
   */
  public calculateTrailingStop(
    entryPrice: number,
    currentPrice: number,
    direction: "LONG" | "SHORT",
    atr: number,
    holdingTime: number,
    highestPrice: number,
    lowestPrice: number,
    params: TrailingStopParams
  ): ReturnType<typeof calculateIntelligentTrailingStop> {
    return calculateIntelligentTrailingStop(
      entryPrice,
      currentPrice,
      direction,
      atr,
      holdingTime,
      highestPrice,
      lowestPrice,
      params
    );
  }

  /**
   * 计算动态仓位大小
   * @param accountBalance 账户余额
   * @param entryPrice 开仓价格
   * @param stopLossPrice 止损价格
   * @param signalScore 信号得分
   * @param volatility 当前波动率
   * @param avgVolatility 平均波动率
   * @param trendStrength 趋势强度
   * @param params 动态仓位调整参数
   * @param currentPositions 当前持仓情况
   * @returns 计算出的仓位大小
   */
  public calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    stopLossPrice: number,
    signalScore: number,
    volatility: number,
    avgVolatility: number,
    trendStrength: number,
    params: DynamicPositionSizingParams,
    currentPositions: Array<{
      symbol: string;
      positionSize: number;
      direction: "LONG" | "SHORT";
    }>
  ): ReturnType<typeof calculateDynamicPositionSize> {
    return calculateDynamicPositionSize(
      accountBalance,
      entryPrice,
      stopLossPrice,
      signalScore,
      volatility,
      avgVolatility,
      trendStrength,
      params,
      currentPositions
    );
  }

  /**
   * 运行情景模拟
   * @param entryPrice 开仓价格
   * @param stopLossPrice 止损价格
   * @param takeProfitPrice 止盈价格
   * @param volatility 当前波动率
   * @param trendStrength 趋势强度
   * @param scenarioNames 要模拟的情景名称列表
   * @returns 情景模拟结果数组
   */
  public runScenarioAnalysis(
    entryPrice: number,
    stopLossPrice: number,
    takeProfitPrice: number,
    volatility: number,
    trendStrength: number,
    scenarioNames: string[] = ["base", "best", "worst"]
  ): ReturnType<typeof runScenarioSimulations> {
    return runScenarioSimulations(
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      volatility,
      trendStrength,
      scenarioNames
    );
  }

  /**
   * 计算投资组合分散度
   * @param positions 当前持仓列表
   * @returns 风险分散度得分
   */
  public calculatePortfolioDiversificationScore(
    positions: Array<{
      symbol: string;
      positionSize: number;
      direction: "LONG" | "SHORT";
    }>
  ): ReturnType<typeof calculatePortfolioDiversification> {
    return calculatePortfolioDiversification(positions);
  }

  /**
   * 重置策略状态
   */
  public resetStrategyState(): void {
    this.lastAnalysisResults.clear();
    this.strategyExecutionHistory = [];
    logger.info("蔡森策略状态已重置");
  }

  /**
   * 验证策略参数
   * @param params 策略参数
   * @returns 验证结果
   */
  public validateStrategyParams(params: StrategyParams): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 验证蔡森策略特定参数
    if (!params.caiSen) {
      errors.push("缺少蔡森策略特定参数");
      return { isValid: false, errors };
    }

    // 验证时间框架分析参数
    const { timeframeAnalysis } = params.caiSen;
    if (!timeframeAnalysis) {
      errors.push("缺少时间框架分析参数");
    } else {
      const totalWeight =
        timeframeAnalysis.dailyWeight +
        timeframeAnalysis.hourlyWeight +
        (timeframeAnalysis.fifteenMinWeight || 0) +
        timeframeAnalysis.fiveMinWeight;
      if (Math.abs(totalWeight - 1) > 0.01) {
        errors.push(
          `Timeframe weight sum must be 1, current is ${totalWeight}`
        );
      }
    }

    // 验证七分位策略参数
    if (!params.caiSen.sevenSegmentStrategy) {
      errors.push("缺少七分位策略参数");
    }

    // 验证动态点位交易参数
    if (!params.caiSen.dynamicPointTrading) {
      errors.push("缺少动态点位交易参数");
    }

    return { isValid: errors.length === 0, errors };
  }
}

// 导出单例实例
export const caiSenStrategyManager = CaiSenStrategyManager.getInstance();
