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
import type {
  CaiSenAnalysisResult,
  StrategyParams,
  StrategyPromptContext,
} from "./types";

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
  private currentStrategyParams: StrategyParams | null = null;
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
  public init(): void {
    this.loadStrategyParams();
    this.refreshAgentParams();
    logger.info("蔡森策略管理器已初始化");
  }

  /**
   * 加载当前策略参数
   */
  private loadStrategyParams(): void {
    try {
      const strategy = getTradingStrategy();
      if (strategy === "cai-sen") {
        this.currentStrategyParams = getStrategyParams(strategy);
        logger.info("已加载蔡森策略参数");
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
   * 刷新Agent设置的策略参数
   * 在每个交易周期开始时调用，确保使用最新的参数
   */
  public async refreshAgentParams(): Promise<void> {
    try {
      const strategy = getTradingStrategy();
      if (strategy === "cai-sen") {
        this.agentParamsBySymbol = await getAgentStrategyParams(strategy);
        logger.info("已刷新Agent设置的策略参数");
        logger.debug("当前Agent参数:", this.agentParamsBySymbol);
      }
    } catch (error) {
      logger.error("刷新Agent策略参数失败:", error as any);
      this.agentParamsBySymbol = {};
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
}

// 导出单例实例
export const caiSenStrategyManager = CaiSenStrategyManager.getInstance();
