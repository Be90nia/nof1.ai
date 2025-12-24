/**
 * 蔡森策略空窗期接管机制
 * CaiSen Strategy Gap Period Takeover Mechanism
 *
 * 该模块负责在AI决策空窗期内接管资产监控和平仓操作
 * This module takes over asset monitoring and closing operations during AI decision gaps
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "node:events";
import { clearInterval, setInterval } from "node:timers";
import type { IExchangeClient } from "../../../services/exchangeClient";
import type { StrategyParams } from "../../../strategies/types";
import { logger } from "../../../utils/loggerUtils";

/**
 * AI决策引擎接口
 * AI Decision Engine Interface
 */
export interface AIDecisionEngine {
  /** 决策引擎ID - Decision engine ID */
  id: string;

  /** 获取最新决策 - Get latest decision */
  getLatestDecision(): AiDecisionParams | null;

  /** 设置决策参数 - Set decision parameters */
  setDecisionParams(params: AiDecisionParams): void;
}

/**
 * 空窗期接管状态枚举
 * Gap Period Takeover Status Enumeration
 */
export enum TakeoverStatus {
  IDLE = "idle", // 空闲状态 - Idle state
  ACTIVE = "active", // 活跃接管状态 - Active takeover state
  PAUSED = "paused", // 暂停状态 - Paused state
  ERROR = "error", // 错误状态 - Error state
}

/**
 * 空窗期接管配置接口
 * Gap Period Takeover Configuration Interface
 */
export interface TakeoverConfig {
  /** AI决策间隔时间（毫秒） - AI decision interval time (milliseconds) */
  aiDecisionInterval: number;

  /** 安全检查间隔时间（毫秒） - Safety check interval time (milliseconds) */
  safetyCheckInterval: number;

  /** 最大允许空窗期时间（毫秒） - Maximum allowed gap period time (milliseconds) */
  maxGapPeriod: number;

  /** 是否启用自动接管 - Whether to enable automatic takeover */
  enableAutoTakeover: boolean;

  /** 紧急平仓阈值（百分比） - Emergency closing threshold (percentage) */
  emergencyCloseThreshold: number;

  /** 风险监控阈值 - Risk monitoring threshold */
  riskMonitoringThreshold: {
    /** 最大亏损百分比 - Maximum loss percentage */
    maxLossPercent: number;
    /** 最大回撤百分比 - Maximum drawdown percentage */
    maxDrawdownPercent: number;
  };
}

/**
 * 空窗期接管状态接口
 * Gap Period Takeover State Interface
 */
export interface TakeoverState {
  /** 接管ID - Takeover ID */
  takeoverId: string;

  /** 当前状态 - Current status */
  status: TakeoverStatus;

  /** 最后一次AI决策时间 - Last AI decision time */
  lastAiDecisionTime: number;

  /** 接管开始时间 - Takeover start time */
  takeoverStartTime: number;

  /** 监控的持仓ID列表 - List of monitored position IDs */
  monitoredPositions: string[];

  /** 当前风险指标 - Current risk indicators */
  riskIndicators: {
    /** 当前总盈亏百分比 - Current total P&L percentage */
    totalPnlPercent: number;
    /** 当前回撤百分比 - Current drawdown percentage */
    drawdownPercent: number;
  };

  /** 接管原因 - Takeover reason */
  takeoverReason?: string;

  /** 原始系统 - Original system */
  originalSystem?: string;

  /** 接管类型 - Takeover type */
  takeoverType?: string;

  /** 预期持续时间 - Expected duration */
  expectedDuration?: number;

  /** 剩余持续时间 - Remaining duration */
  remainingDuration?: number;

  /** 元数据 - Metadata */
  metadata?: Record<string, any>;

  /** 错误信息 - Error message */
  errorMessage?: string;
}

/**
 * AI决策参数接口
 * AI Decision Parameters Interface
 */
export interface AiDecisionParams {
  /** 决策时间 - Decision time */
  decisionTime: number;

  /** 决策ID - Decision ID */
  decisionId: string;

  /** 平仓参数 - Closing parameters */
  closingParams: {
    /** 分批平仓比例 - Batch closing ratios */
    batchRatios: number[];
    /** 止盈阈值 - Take profit thresholds */
    takeProfitThresholds: number[];
    /** 止损阈值 - Stop loss thresholds */
    stopLossThresholds: number[];
  };
}

/**
 * 蔡森策略空窗期接管器类
 * CaiSen Strategy Gap Period Takeover Class
 */
export class CaiSenGapPeriodTakeover extends EventEmitter {
  private config: TakeoverConfig;
  private state: TakeoverState;
  private safetyCheckTimer: NodeJS.Timeout | null = null;
  private exchangeClient: IExchangeClient;
  private strategyConfig: StrategyParams;
  private aiDecisionEngine: AIDecisionEngine;

  /**
   * 构造函数
   * Constructor
   *
   * @param exchangeClient 交易所客户端 - Exchange client
   * @param aiDecisionEngine AI决策引擎 - AI decision engine
   * @param strategyConfig 策略配置 - Strategy configuration
   * @param config 接管配置 - Takeover configuration
   */
  constructor(
    exchangeClient: IExchangeClient,
    aiDecisionEngine: AIDecisionEngine,
    strategyConfig: StrategyParams,
    config: TakeoverConfig = DEFAULT_TAKEOVER_CONFIG
  ) {
    super();

    this.config = config;
    this.exchangeClient = exchangeClient;
    this.strategyConfig = strategyConfig;
    this.aiDecisionEngine = aiDecisionEngine;

    // 初始化状态 - Initialize state
    this.state = {
      takeoverId: "global-takeover", // 添加默认的接管ID
      status: TakeoverStatus.IDLE,
      lastAiDecisionTime: Date.now(),
      takeoverStartTime: 0,
      monitoredPositions: [],
      riskIndicators: {
        totalPnlPercent: 0,
        drawdownPercent: 0,
      },
      takeoverReason: undefined,
      originalSystem: undefined,
      takeoverType: "gap_period",
      expectedDuration: undefined,
      remainingDuration: undefined,
      metadata: {},
    };

    logger.info("CaiSen Gap Period Takeover initialized", { config });
  }

  /**
   * 设置接管配置
   * Set takeover configuration
   *
   * @param takeoverConfig 接管配置 - Takeover configuration
   * @returns string 接管ID - Takeover ID
   */
  setTakeoverConfig(takeoverConfig: TakeoverConfig): string {
    try {
      // 更新配置 - Update configuration
      this.config = { ...this.config, ...takeoverConfig };

      // 生成新的接管ID - Generate new takeover ID
      const takeoverId = `takeover_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      // 更新状态中的接管ID - Update takeover ID in state
      this.state.takeoverId = takeoverId;

      // 如果定时器正在运行，重启以应用新配置
      // If timer is running, restart to apply new configuration
      if (this.safetyCheckTimer) {
        this.stopSafetyCheckTimer();
        this.startSafetyCheckTimer();
      }

      // 发出配置更新事件 - Emit configuration update event
      this.emit("takeoverConfigSet", {
        takeoverId,
        config: this.config,
      });

      logger.info("接管配置已设置", {
        takeoverId,
        config: this.config,
      });

      return takeoverId;
    } catch (error) {
      this.handleError(error as Error, "setTakeoverConfig");
      return "";
    }
  }

  /**
   * 启动接管
   * Start takeover
   *
   * @param takeoverId 接管ID - Takeover ID
   * @returns Promise<boolean> 是否启动成功 - Whether start was successful
   */
  async startTakeover(takeoverId?: string): Promise<boolean> {
    try {
      // 如果提供了接管ID，检查是否匹配当前状态
      // If takeover ID is provided, check if it matches current state
      if (takeoverId && takeoverId !== this.state.takeoverId) {
        logger.warn("Takeover ID does not match current state", {
          providedId: takeoverId,
          currentId: this.state.takeoverId,
        });
        return false;
      }

      if (this.state.status === TakeoverStatus.ACTIVE) {
        logger.warn("Takeover is already active");
        return true;
      }

      // 更新状态 - Update state
      this.state.status = TakeoverStatus.ACTIVE;
      this.state.takeoverStartTime = Date.now();

      // 获取当前持仓 - Get current positions
      const positions = await this.exchangeClient.getPositions();
      this.state.monitoredPositions = positions
        .map((pos) => pos.id)
        .filter((id): id is string => id !== undefined);

      // 启动安全检查定时器 - Start safety check timer
      this.startSafetyCheckTimer();

      this.emit("takeoverStarted", {
        takeoverId: this.state.takeoverId,
        state: this.state,
      });
      logger.info("财森缺口期接管已启动", {
        takeoverId: this.state.takeoverId,
        monitoredPositions: this.state.monitoredPositions.length,
        config: this.config,
      });

      return true;
    } catch (error) {
      this.handleError(error as Error, "startTakeover");
      return false;
    }
  }

  /**
   * 停止空窗期接管机制
   * Stop the gap period takeover mechanism
   *
   * @returns Promise<boolean> 停止是否成功 - Whether stop was successful
   */
  async stopTakeover(): Promise<boolean> {
    try {
      if (this.state.status !== TakeoverStatus.ACTIVE) {
        logger.warn("Takeover is not active");
        return true;
      }

      // 停止安全检查定时器 - Stop safety check timer
      this.stopSafetyCheckTimer();

      // 更新状态 - Update state
      this.state.status = TakeoverStatus.IDLE;
      this.state.monitoredPositions = [];

      this.emit("takeoverStopped", { state: this.state });
      logger.info("财森缺口期接管已停止");

      return true;
    } catch (error) {
      this.handleError(error as Error, "stopTakeover");
      return false;
    }
  }

  /**
   * 更新AI决策时间
   * Update AI decision time
   *
   * @param decisionParams AI决策参数 - AI decision parameters
   * @returns Promise<boolean> 更新是否成功 - Whether update was successful
   */
  async updateAiDecision(decisionParams: AiDecisionParams): Promise<boolean> {
    try {
      // 更新最后决策时间 - Update last decision time
      this.state.lastAiDecisionTime = decisionParams.decisionTime;

      // 如果当前处于接管状态，检查是否需要停止接管
      // If currently in takeover state, check if takeover needs to be stopped
      if (this.state.status === TakeoverStatus.ACTIVE) {
        // 检查是否在安全时间内 - Check if within safe time
        const timeSinceLastDecision =
          Date.now() - this.state.lastAiDecisionTime;
        if (timeSinceLastDecision < this.config.maxGapPeriod) {
          await this.stopTakeover();
          logger.info("由于及时的AI决策而停止接管", {
            decisionId: decisionParams.decisionId,
            timeSinceLastDecision,
          });
        }
      }

      this.emit("aiDecisionUpdated", { decisionParams, state: this.state });
      logger.debug("AI决策时间已更新", {
        decisionId: decisionParams.decisionId,
        decisionTime: new Date(decisionParams.decisionTime).toISOString(),
      });

      return true;
    } catch (error) {
      this.handleError(error as Error, "updateAiDecision");
      return false;
    }
  }

  /**
   * 获取当前接管状态
   * Get current takeover state
   *
   * @returns TakeoverState 当前接管状态 - Current takeover state
   */
  getCurrentState(): TakeoverState {
    return {
      ...this.state,
      takeoverId: "global-takeover", // 添加默认的接管ID
    };
  }

  /**
   * 获取指定ID的接管状态
   * Get takeover state by ID
   *
   * @param takeoverId 接管ID - Takeover ID
   * @returns TakeoverState | null 接管状态 - Takeover state or null if not found
   */
  getTakeoverState(takeoverId: string): TakeoverState | null {
    // 在当前实现中，只有一个全局接管状态，所以忽略takeoverId参数
    // In current implementation, there's only one global takeover state, so ignore the takeoverId parameter
    return this.getCurrentState();
  }

  /**
   * 根据接管ID获取空窗期接管状态
   * Get gap period takeover status by takeover ID
   *
   * @param takeoverId 接管ID - Takeover ID
   * @returns Promise<TakeoverState | null> 接管状态 - Takeover state or null if not found
   */
  async getGapPeriodTakeoverStatusByTakeoverId(
    takeoverId: string
  ): Promise<TakeoverState | null> {
    try {
      return this.getTakeoverState(takeoverId);
    } catch (error) {
      logger.error("获取空窗期接管状态时出错", { error, takeoverId });
      return null;
    }
  }

  /**
   * 根据持仓ID获取接管状态
   * Get takeover states by position ID
   *
   * @param positionId 持仓ID - Position ID
   * @returns TakeoverState[] 接管状态列表 - List of takeover states
   */
  getTakeoverStatesByPositionId(positionId: string): TakeoverState[] {
    // 在当前实现中，只有一个全局接管状态
    // 检查该持仓是否在监控列表中
    // In current implementation, there's only one global takeover state
    // Check if the position is in the monitored list
    if (this.state.monitoredPositions.includes(positionId)) {
      return [this.getCurrentState()];
    }
    return [];
  }

  /**
   * 检查接管是否已触发
   * Check if takeover is triggered
   *
   * @param takeoverId 接管ID - Takeover ID
   * @returns boolean 是否已触发 - Whether triggered
   */
  checkTakeoverTriggered(takeoverId: string): boolean {
    // 在当前实现中，只有一个全局接管状态，所以忽略takeoverId参数
    // In current implementation, there's only one global takeover state, so ignore the takeoverId parameter

    // 检查当前状态是否为活跃状态
    // Check if current status is active
    if (this.state.status !== TakeoverStatus.ACTIVE) {
      return false;
    }

    // 检查是否超过最大空窗期时间
    // Check if maximum gap period time is exceeded
    const timeSinceLastDecision = Date.now() - this.state.lastAiDecisionTime;
    const isTriggered = timeSinceLastDecision >= this.config.maxGapPeriod;

    // 如果触发，发出接管触发事件
    // If triggered, emit takeover triggered event
    if (isTriggered) {
      this.emit("takeoverTriggered", {
        takeoverId,
        state: this.state,
        timestamp: Date.now(),
      });
    }

    return isTriggered;
  }

  /**
   * 执行接管
   * Execute takeover
   *
   * @param takeoverId 接管ID - Takeover ID
   * @returns boolean 是否执行成功 - Whether execution was successful
   */
  executeTakeover(takeoverId: string): boolean {
    try {
      // 在当前实现中，只有一个全局接管状态，所以忽略takeoverId参数
      // In current implementation, there's only one global takeover state, so ignore the takeoverId parameter

      // 检查当前状态是否为活跃状态
      // Check if current status is active
      if (this.state.status !== TakeoverStatus.ACTIVE) {
        logger.warn("Cannot execute takeover: takeover is not active");
        return false;
      }

      // 检查是否超过最大空窗期时间
      // Check if maximum gap period time is exceeded
      const timeSinceLastDecision = Date.now() - this.state.lastAiDecisionTime;
      if (timeSinceLastDecision < this.config.maxGapPeriod) {
        logger.warn("Cannot execute takeover: gap period not exceeded", {
          timeSinceLastDecision,
          maxGapPeriod: this.config.maxGapPeriod,
        });
        return false;
      }

      // 发出接管执行事件
      // Emit takeover execution event
      this.emit("takeoverExecuted", {
        takeoverId,
        state: this.state,
        timestamp: Date.now(),
      });

      logger.info("接管执行成功", {
        takeoverId,
        timeSinceLastDecision,
      });

      return true;
    } catch (error) {
      this.handleError(error as Error, "executeTakeover");
      return false;
    }
  }

  /**
   * 更新接管配置
   * Update takeover configuration
   *
   * @param newConfig 新配置 - New configuration
   * @returns Promise<boolean> 更新是否成功 - Whether update was successful
   */
  async updateConfig(newConfig: Partial<TakeoverConfig>): Promise<boolean> {
    try {
      this.config = { ...this.config, ...newConfig };

      // 如果定时器正在运行，重启以应用新配置
      // If timer is running, restart to apply new configuration
      if (this.safetyCheckTimer) {
        this.stopSafetyCheckTimer();
        this.startSafetyCheckTimer();
      }

      this.emit("configUpdated", { config: this.config });
      logger.info("接管配置已更新", { newConfig });

      return true;
    } catch (error) {
      this.handleError(error as Error, "updateConfig");
      return false;
    }
  }

  /**
   * 启动安全检查定时器
   * Start safety check timer
   * @private
   */
  private startSafetyCheckTimer(): void {
    if (this.safetyCheckTimer) {
      clearInterval(this.safetyCheckTimer);
    }

    this.safetyCheckTimer = setInterval(async () => {
      await this.performSafetyCheck();
    }, this.config.safetyCheckInterval);

    logger.debug("安全检查计时器已启动", {
      interval: this.config.safetyCheckInterval,
    });
  }

  /**
   * 停止安全检查定时器
   * Stop safety check timer
   * @private
   */
  private stopSafetyCheckTimer(): void {
    if (this.safetyCheckTimer) {
      clearInterval(this.safetyCheckTimer);
      this.safetyCheckTimer = null;
      logger.debug("安全检查计时器已停止");
    }
  }

  /**
   * 执行安全检查
   * Perform safety check
   * @private
   */
  private async performSafetyCheck(): Promise<void> {
    try {
      // 检查是否需要紧急平仓 - Check if emergency closing is needed
      const needEmergencyClose = await this.checkEmergencyCloseConditions();
      if (needEmergencyClose) {
        logger.warn(
          "Emergency close conditions detected, executing emergency close"
        );
        await this.executeEmergencyClose();
        return;
      }

      // 更新风险指标 - Update risk indicators
      await this.updateRiskIndicators();

      // 检查风险阈值 - Check risk thresholds
      const riskThresholdExceeded = this.checkRiskThresholds();
      if (riskThresholdExceeded) {
        logger.warn("Risk thresholds exceeded, executing risk mitigation");
        await this.executeRiskMitigation();
      }

      // 发出心跳事件 - Emit heartbeat event
      this.emit("safetyCheckCompleted", {
        state: this.state,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.handleError(error as Error, "performSafetyCheck");
    }
  }

  /**
   * 检查紧急平仓条件
   * Check emergency close conditions
   * @private
   * @returns Promise<boolean> 是否需要紧急平仓 - Whether emergency close is needed
   */
  private async checkEmergencyCloseConditions(): Promise<boolean> {
    try {
      // 获取当前持仓信息来计算风险 - Get current position information to calculate risk
      const positions = await this.exchangeClient.getPositions();

      // 计算总盈亏百分比 - Calculate total P&L percentage
      const totalPnlPercent =
        positions.reduce((sum, pos) => sum + (pos.pnlPercent || 0), 0) /
          positions.length || 0;
      if (totalPnlPercent <= -this.config.emergencyCloseThreshold) {
        logger.warn("Emergency close threshold exceeded", {
          totalPnlPercent,
          threshold: this.config.emergencyCloseThreshold,
        });
        return true;
      }

      // 检查单个持仓是否超过紧急阈值 - Check if any position exceeds emergency threshold
      for (const position of positions) {
        if (position.pnlPercent <= -this.config.emergencyCloseThreshold) {
          logger.warn("Position emergency close threshold exceeded", {
            positionId: position.id,
            symbol: position.symbol,
            pnlPercent: position.pnlPercent,
            threshold: this.config.emergencyCloseThreshold,
          });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error("检查紧急平仓条件时出错", { error });
      return false;
    }
  }

  /**
   * 执行紧急平仓
   * Execute emergency close
   * @private
   */
  private async executeEmergencyClose(): Promise<void> {
    try {
      logger.warn("Executing emergency close for all positions");

      // 获取所有持仓 - Get all positions
      const positions = await this.exchangeClient.getPositions();

      // 平仓所有持仓 - Close all positions
      const closePromises = positions.map((position: any) =>
        this.exchangeClient.closePosition({
          contract: position.contract || position.symbol,
          size: Math.abs(Number.parseFloat(position.size || position.amount)),
        })
      );

      await Promise.all(closePromises);

      // 更新状态 - Update state
      this.state.monitoredPositions = [];

      // 发出紧急平仓事件 - Emit emergency close event
      this.emit("emergencyCloseExecuted", {
        positionsClosed: positions.length,
        timestamp: Date.now(),
      });

      logger.info("紧急平仓执行成功", {
        positionsClosed: positions.length,
      });
    } catch (error) {
      this.handleError(error as Error, "executeEmergencyClose");
    }
  }

  /**
   * 更新风险指标
   * Update risk indicators
   * @private
   */
  private async updateRiskIndicators(): Promise<void> {
    try {
      // 获取持仓信息来计算风险指标 - Get position information to calculate risk indicators
      const positions = await this.exchangeClient.getPositions();

      // 计算总盈亏百分比 - Calculate total P&L percentage
      this.state.riskIndicators.totalPnlPercent =
        positions.reduce((sum, pos) => sum + (pos.pnlPercent || 0), 0) /
          positions.length || 0;

      // 计算回撤百分比 - Calculate drawdown percentage (使用持仓数据估算)
      // Calculate drawdown percentage (estimate using position data)
      const totalUnrealizedPnl = positions.reduce(
        (sum, pos) => sum + Number.parseFloat(pos.unrealisedPnl || "0"),
        0
      );
      const totalNotional = positions.reduce(
        (sum, pos) => sum + Math.abs(pos.notional || 0),
        0
      );

      if (totalNotional > 0) {
        this.state.riskIndicators.drawdownPercent = Math.abs(
          (totalUnrealizedPnl / totalNotional) * 100
        );
      }
    } catch (error) {
      logger.error("更新风险指标时出错", { error });
    }
  }

  /**
   * 检查风险阈值
   * Check risk thresholds
   * @private
   * @returns boolean 是否超过风险阈值 - Whether risk thresholds are exceeded
   */
  private checkRiskThresholds(): boolean {
    const { maxLossPercent, maxDrawdownPercent } =
      this.config.riskMonitoringThreshold;

    // 检查总亏损是否超过阈值 - Check if total loss exceeds threshold
    if (this.state.riskIndicators.totalPnlPercent <= -maxLossPercent) {
      logger.warn("Total loss threshold exceeded", {
        totalPnlPercent: this.state.riskIndicators.totalPnlPercent,
        threshold: maxLossPercent,
      });
      return true;
    }

    // 检查回撤是否超过阈值 - Check if drawdown exceeds threshold
    if (this.state.riskIndicators.drawdownPercent >= maxDrawdownPercent) {
      logger.warn("Drawdown threshold exceeded", {
        drawdownPercent: this.state.riskIndicators.drawdownPercent,
        threshold: maxDrawdownPercent,
      });
      return true;
    }

    return false;
  }

  /**
   * 执行风险缓解
   * Execute risk mitigation
   * @private
   */
  private async executeRiskMitigation(): Promise<void> {
    try {
      logger.info("Executing risk mitigation strategy");

      // 获取当前持仓 - Get current positions
      const positions = await this.exchangeClient.getPositions();

      // 按盈亏排序，优先平仓亏损最大的持仓
      // Sort by P&L, prioritize closing the most losing positions
      positions.sort((a, b) => a.pnlPercent - b.pnlPercent);

      // 计算需要平仓的仓位数量 - Calculate the number of positions to close
      const positionsToCloseCount = Math.ceil(positions.length / 2); // 平仓一半仓位

      // 平仓最亏损的持仓 - Close the most losing positions
      for (let i = 0; i < positionsToCloseCount; i++) {
        const position: any = positions[i];
        await this.exchangeClient.closePosition({
          contract: position.contract || position.symbol,
          size: Math.abs(Number.parseFloat(position.size || position.amount)),
        });
        logger.info("Position closed for risk mitigation", {
          positionId: position.id,
          symbol: position.symbol,
          pnlPercent: position.pnlPercent,
        });
      }

      // 更新监控的持仓列表 - Update monitored positions list
      this.state.monitoredPositions = positions
        .slice(positionsToCloseCount)
        .map((pos) => pos.id)
        .filter((id): id is string => id !== undefined);

      // 发出风险缓解事件 - Emit risk mitigation event
      this.emit("riskMitigationExecuted", {
        positionsClosed: positionsToCloseCount,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.handleError(error as Error, "executeRiskMitigation");
    }
  }

  /**
   * 处理错误
   * Handle error
   * @private
   */
  private handleError(error: Error, context: string): void {
    logger.error(`Error in ${context}`, { error });

    // 更新状态为错误 - Update state to error
    this.state.status = TakeoverStatus.ERROR;
    this.state.errorMessage = error.message;

    // 发出错误事件 - Emit error event
    this.emit("error", { error, context, state: this.state });
  }

  /**
   * 销毁接管器
   * Destroy takeover
   */
  destroy(): void {
    // 停止定时器 - Stop timers
    this.stopSafetyCheckTimer();

    // 移除所有监听器 - Remove all listeners
    this.removeAllListeners();

    logger.info("CaiSen Gap Period Takeover destroyed");
  }
}

/**
 * 默认接管配置
 * Default takeover configuration
 */
export const DEFAULT_TAKEOVER_CONFIG: TakeoverConfig = {
  aiDecisionInterval: 5 * 60 * 1000, // 5分钟 - 5 minutes
  safetyCheckInterval: 30 * 1000, // 30秒 - 30 seconds
  maxGapPeriod: 10 * 60 * 1000, // 10分钟 - 10 minutes
  enableAutoTakeover: true,
  emergencyCloseThreshold: 15, // 15% - 15%
  riskMonitoringThreshold: {
    maxLossPercent: 10, // 10% - 10%
    maxDrawdownPercent: 12, // 12% - 12%
  },
};

/**
 * 创建蔡森空窗期接管实例
 * Create CaiSen gap period takeover instance
 *
 * @param exchangeClient 交易所客户端 - Exchange client
 * @param aiDecisionEngine AI决策引擎 - AI decision engine
 * @param strategyConfig 策略配置 - Strategy configuration
 * @param config 接管配置 - Takeover configuration
 * @returns CaiSenGapPeriodTakeover 蔡森空窗期接管实例 - CaiSen gap period takeover instance
 */
export function createCaiSenGapPeriodTakeover(
  exchangeClient: IExchangeClient,
  aiDecisionEngine: AIDecisionEngine,
  strategyConfig: StrategyParams,
  config: TakeoverConfig = DEFAULT_TAKEOVER_CONFIG
): CaiSenGapPeriodTakeover {
  return new CaiSenGapPeriodTakeover(
    exchangeClient,
    aiDecisionEngine,
    strategyConfig,
    config
  );
}
