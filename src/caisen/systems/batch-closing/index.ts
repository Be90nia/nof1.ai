/**
 * 蔡森策略分批平仓系统
 * CaiSen Strategy Batch Closing System
 *
 * 该模块负责根据AI设定的参数执行分批平仓操作
 * This module is responsible for executing batch closing operations based on AI-set parameters
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import {
  type IExchangeClient,
  createExchangeClient,
} from "../../../services/exchangeClient";
import type { StrategyParams } from "../../../strategies/types.js";
import { logger } from "../../../utils/loggerUtils";

/**
 * 持仓接口
 * Position Interface
 */
interface Position {
  /** 持仓ID - Position ID */
  id: number;
  /** 交易对 - Trading pair */
  symbol: string;
  /** 持仓数量 - Position quantity */
  quantity: number;
  /** 开仓价格 - Entry price */
  entry_price: number;
  /** 当前价格 - Current price */
  current_price: number;
  /** 强平价格 - Liquidation price */
  liquidation_price: number;
  /** 未实现盈亏 - Unrealized P&L */
  unrealized_pnl: number;
  /** 杠杆倍数 - Leverage */
  leverage: number;
  /** 持仓方向 - Position side */
  side: "long" | "short";
  /** 开仓订单ID - Entry order ID */
  entry_order_id: string;
  /** 开仓时间 - Entry time */
  opened_at: string;
  /** 金字塔加仓次数 - Pyramid add count */
  pyramidAddCount?: number;
  /** 最后加仓时间 - Last add time */
  lastAddTime?: number;
  /** 是否正在分批平仓 - Whether batch closing is in progress */
  batchClosingInProgress?: boolean;
}

/**
 * 平仓批次状态枚举
 * Closing Batch Status Enumeration
 */
export enum BatchStatus {
  PENDING = "pending", // 待执行 - Pending execution
  EXECUTING = "executing", // 执行中 - Executing
  COMPLETED = "completed", // 已完成 - Completed
  FAILED = "failed", // 执行失败 - Failed
  CANCELLED = "cancelled", // 已取消 - Cancelled
}

/**
 * 平仓类型枚举
 * Closing Type Enumeration
 */
export enum ClosingType {
  TAKE_PROFIT = "take_profit", // 止盈 - Take profit
  STOP_LOSS = "stop_loss", // 止损 - Stop loss
  PARTIAL_PROFIT = "partial_profit", // 分批止盈 - Partial profit
  RISK_MITIGATION = "risk_mitigation", // 风险缓解 - Risk mitigation
  EMERGENCY_CLOSE = "emergency_close", // 紧急平仓 - Emergency close
}

/**
 * 平仓批次配置接口
 * Closing Batch Configuration Interface
 */
export interface BatchConfig {
  /** 批次ID - Batch ID */
  batchId: string;

  /** 持仓ID - Position ID */
  positionId: string;

  /** 平仓类型 - Closing type */
  closingType: ClosingType;

  /** 平仓比例（0-1） - Closing ratio (0-1) */
  closingRatio: number;

  /** 平仓数量 - Closing quantity */
  closingQuantity: number;

  /** 触发条件 - Trigger condition */
  triggerCondition: {
    /** 触发类型 - Trigger type */
    triggerType:
      | "price"
      | "pnl_percent"
      | "time"
      | "manual"
      | "return_prediction"
      | "market_sentiment";

    /** 触发值 - Trigger value */
    triggerValue: number;

    /** 比较操作符 - Comparison operator */
    operator: ">" | "<" | "=" | ">=" | "<=";

    /** 动态调整参数 - Dynamic adjustment parameters */
    dynamicAdjustment?: {
      /** 是否启用动态调整 - Whether to enable dynamic adjustment */
      enabled: boolean;
      /** 调整步长 - Adjustment step */
      step: number;
      /** 最大调整次数 - Maximum adjustment count */
      maxAdjustments: number;
      /** 调整条件 - Adjustment condition */
      adjustmentCondition: {
        /** 调整触发类型 - Adjustment trigger type */
        type: "price_change" | "pnl_change" | "time_passed";
        /** 调整触发值 - Adjustment trigger value */
        value: number;
        /** 调整比较操作符 - Adjustment comparison operator */
        operator: ">" | "<" | "=" | ">=" | "<=";
      };
    };
  };

  /** 执行优先级 - Execution priority */
  priority: number;

  /** 创建时间 - Creation time */
  createdAt: number;

  /** 过期时间 - Expiration time */
  expiresAt?: number;

  /** AI预测信息 - AI prediction information */
  aiPrediction?: {
    /** 预测收益率（百分比） - Predicted return rate (percentage) */
    predictedReturn: number;
    /** 置信度（0-1） - Confidence level (0-1) */
    confidence: number;
    /** 推荐平仓策略 - Recommended closing strategy */
    recommendedStrategy: "full_close" | "batch_close" | "hold";
  };
}

/**
 * 平仓批次状态接口
 * Closing Batch State Interface
 */
export interface BatchState {
  /** 批次配置 - Batch configuration */
  config: BatchConfig;

  /** 当前状态 - Current status */
  status:
    | BatchStatus.PENDING
    | BatchStatus.EXECUTING
    | BatchStatus.COMPLETED
    | BatchStatus.FAILED
    | BatchStatus.CANCELLED;

  /** 执行时间 - Execution time */
  executedAt?: number;

  /** 完成时间 - Completion time */
  completedAt?: number;

  /** 取消时间 - Cancellation time */
  cancelledAt?: number;

  /** 执行结果 - Execution result */
  executionResult?: {
    /** 实际平仓数量 - Actual closing quantity */
    actualQuantity: number;

    /** 实际平仓价格 - Actual closing price */
    actualPrice: number;

    /** 平仓手续费 - Closing fee */
    fee: number;

    /** 平仓盈亏 - Closing P&L */
    pnl: number;
  };

  /** 错误信息 - Error message */
  errorMessage?: string;

  /** 重试次数 - Retry count */
  retryCount: number;
}

/**
 * 分批平仓系统配置接口
 * Batch Closing System Configuration Interface
 */
export interface BatchClosingConfig {
  /** 最大并发批次数量 - Maximum concurrent batch count */
  maxConcurrentBatches: number;

  /** 批次执行间隔（毫秒） - Batch execution interval (milliseconds) */
  batchExecutionInterval: number;

  /** 最大重试次数 - Maximum retry count */
  maxRetryCount: number;

  /** 是否启用自动执行 - Whether to enable automatic execution */
  enableAutoExecution: boolean;

  /** 价格偏差容忍度（百分比） - Price deviation tolerance (percentage) */
  priceDeviationTolerance: number;
}

/**
 * AI平仓参数接口
 * AI Closing Parameters Interface
 */
export interface AiClosingParams {
  /** 参数ID - Parameter ID */
  paramId: string;

  /** 决策ID - Decision ID */
  decisionId: string;

  /** 生效时间 - Effective time */
  effectiveTime: number;

  /** 过期时间 - Expiration time */
  expiresAt: number;

  /** 平仓批次配置列表 - List of closing batch configurations */
  batchConfigs: BatchConfig[];

  /** 整体平仓策略 - Overall closing strategy */
  overallClosingStrategy: "full_close" | "batch_close" | "hold";

  /** 收益率预测信息 - Return rate prediction information */
  returnPrediction?: {
    /** 预测收益率（百分比） - Predicted return rate (percentage) */
    predictedReturn: number;
    /** 置信度（0-1） - Confidence level (0-1) */
    confidence: number;
    /** 预测时间范围（分钟） - Prediction time range (minutes) */
    timeRange: number;
    /** 关键影响因素 - Key influencing factors */
    keyFactors: string[];
  };

  /** 市场情绪数据 - Market sentiment data */
  marketSentiment?: {
    /** 资金费率 - Funding rate */
    fundingRate: number;
    /** 持仓量变化 - Open interest change */
    openInterestChange: number;
    /** 大额订单数据 - Large order data */
    largeOrders: any[];
    /** 恐惧贪婪指数 - Fear and greed index */
    fearAndGreedIndex: number;
  };
}

/**
 * 蔡森策略分批平仓系统类
 * CaiSen Strategy Batch Closing System Class
 */
export class CaiSenBatchClosingSystem extends EventEmitter {
  private config: BatchClosingConfig;
  private exchangeClient: IExchangeClient;
  private strategyConfig: StrategyParams;
  private batchStates: Map<string, BatchState> = new Map();
  private aiClosingParams: Map<string, AiClosingParams> = new Map();
  private executionTimer: NodeJS.Timeout | null = null;

  /**
   * 构造函数
   * Constructor
   *
   * @param config 系统配置 - System configuration
   * @param strategyConfig 策略配置 - Strategy configuration
   */
  constructor(config: BatchClosingConfig, strategyConfig: StrategyParams) {
    super();

    this.config = config;
    this.exchangeClient = createExchangeClient();
    this.strategyConfig = strategyConfig;

    // 启动执行定时器 - Start execution timer
    this.startExecutionTimer();

    logger.info("CaiSen Batch Closing System initialized", { config });
  }

  /**
   * 设置AI平仓参数
   * Set AI closing parameters
   *
   * @param params AI平仓参数 - AI closing parameters
   * @returns Promise<boolean> 设置是否成功 - Whether setting was successful
   */
  async setAiClosingParams(params: AiClosingParams): Promise<boolean> {
    try {
      // 验证参数 - Validate parameters
      if (!this.validateClosingParams(params)) {
        logger.error("Invalid AI closing parameters", { params });
        return false;
      }

      // 存储参数 - Store parameters
      this.aiClosingParams.set(params.paramId, params);

      // 根据整体平仓策略决定操作 - Determine operation based on overall closing strategy
      if (params.overallClosingStrategy === "full_close") {
        // 全平仓策略 - Full close strategy
        await this.handleFullCloseStrategy(params);
      } else if (params.overallClosingStrategy === "batch_close") {
        // 分批平仓策略 - Batch close strategy
        await this.handleBatchCloseStrategy(params);
      } else {
        // 持有策略 - Hold strategy
        logger.info(
          "Hold strategy selected, no closing operations will be performed",
          {
            paramId: params.paramId,
            predictedReturn: params.returnPrediction?.predictedReturn,
          }
        );
      }

      // 发出参数设置事件 - Emit parameter set event
      this.emit("aiClosingParamsSet", { params });

      logger.info("AI closing parameters set", {
        paramId: params.paramId,
        strategy: params.overallClosingStrategy,
        batchCount: params.batchConfigs.length,
        predictedReturn: params.returnPrediction?.predictedReturn,
      });

      return true;
    } catch (error) {
      logger.error("设置AI平仓参数时出错", { error, params });
      return false;
    }
  }

  /**
   * 处理全平仓策略
   * Handle full close strategy
   *
   * @param params AI平仓参数 - AI closing parameters
   * @returns Promise<void> 处理结果 - Processing result
   */
  private async handleFullCloseStrategy(
    params: AiClosingParams
  ): Promise<void> {
    // 为每个持仓创建全平仓批次 - Create full close batches for each position
    const positionIds = new Set(
      params.batchConfigs.map((config) => config.positionId)
    );

    for (const positionId of positionIds) {
      // 查找该持仓的第一个批次配置作为基础 - Find the first batch config for this position as base
      const baseConfig = params.batchConfigs.find(
        (config) => config.positionId === positionId
      );
      if (!baseConfig) continue;

      // 创建全平仓批次配置 - Create full close batch config
      const fullCloseConfig: BatchConfig = {
        batchId: `full_close_${positionId}_${Date.now()}`,
        positionId,
        closingType: ClosingType.TAKE_PROFIT,
        closingRatio: 1.0,
        closingQuantity: baseConfig.closingQuantity / baseConfig.closingRatio, // 计算总数量
        triggerCondition: {
          triggerType: "manual",
          triggerValue: 0,
          operator: ">",
        },
        priority: baseConfig.priority,
        createdAt: Date.now(),
        expiresAt: params.expiresAt,
        aiPrediction: baseConfig.aiPrediction,
      };

      // 创建批次状态 - Create batch state
      const batchState: BatchState = {
        config: fullCloseConfig,
        status: BatchStatus.PENDING,
        retryCount: 0,
      };

      this.batchStates.set(fullCloseConfig.batchId, batchState);

      // 立即触发全平仓执行 - Immediately trigger full close execution
      await this.triggerBatchExecution(fullCloseConfig.batchId);
    }
  }

  /**
   * 处理分批平仓策略
   * Handle batch close strategy
   *
   * @param params AI平仓参数 - AI closing parameters
   * @returns Promise<void> 处理结果 - Processing result
   */
  private async handleBatchCloseStrategy(
    params: AiClosingParams
  ): Promise<void> {
    // 创建批次状态 - Create batch states
    for (const batchConfig of params.batchConfigs) {
      const batchState: BatchState = {
        config: batchConfig,
        status: BatchStatus.PENDING,
        retryCount: 0,
      };

      this.batchStates.set(batchConfig.batchId, batchState);
    }

    // 如果AI预测收益率为正且置信度高，可以考虑延迟执行或调整触发条件 - If AI predicted return is positive and confidence is high, consider delaying execution or adjusting trigger conditions
    if (
      params.returnPrediction &&
      params.returnPrediction.predictedReturn > 0 &&
      params.returnPrediction.confidence > 0.7
    ) {
      logger.info(
        "Positive return prediction with high confidence, considering delayed execution",
        {
          predictedReturn: params.returnPrediction.predictedReturn,
          confidence: params.returnPrediction.confidence,
        }
      );
    }
  }

  /**
   * 取消AI平仓参数
   * Cancel AI closing parameters
   *
   * @param paramId 参数ID - Parameter ID
   * @returns Promise<boolean> 取消是否成功 - Whether cancellation was successful
   */
  async cancelAiClosingParams(paramId: string): Promise<boolean> {
    try {
      // 检查参数是否存在 - Check if parameters exist
      const params = this.aiClosingParams.get(paramId);
      if (!params) {
        logger.warn("AI closing parameters not found", { paramId });
        return false;
      }

      // 取消所有相关批次 - Cancel all related batches
      for (const batchConfig of params.batchConfigs) {
        const batchState = this.batchStates.get(batchConfig.batchId);
        if (batchState && batchState.status === BatchStatus.PENDING) {
          batchState.status = BatchStatus.CANCELLED;
        }
      }

      // 删除参数 - Delete parameters
      this.aiClosingParams.delete(paramId);

      // 发出参数取消事件 - Emit parameter cancel event
      this.emit("aiClosingParamsCancelled", { paramId });

      logger.info("AI closing parameters cancelled", { paramId });

      return true;
    } catch (error) {
      logger.error("取消AI平仓参数时出错", { error, paramId });
      return false;
    }
  }

  /**
   * 手动触发批次执行
   * Manually trigger batch execution
   *
   * @param batchId 批次ID - Batch ID
   * @returns Promise<boolean> 触发是否成功 - Whether trigger was successful
   */
  async triggerBatchExecution(batchId: string): Promise<boolean> {
    try {
      const batchState = this.batchStates.get(batchId);
      if (!batchState) {
        logger.warn("Batch not found", { batchId });
        return false;
      }

      if (batchState.status !== BatchStatus.PENDING) {
        logger.warn("Batch is not in pending status", {
          batchId,
          status: batchState.status,
        });
        return false;
      }

      // 执行批次 - Execute batch
      await this.executeBatchInternal(batchState);

      return true;
    } catch (error) {
      logger.error("触发批次执行时出错", { error, batchId });
      return false;
    }
  }

  /**
   * 获取批次状态
   * Get batch state
   *
   * @param batchId 批次ID - Batch ID
   * @returns BatchState | null 批次状态 - Batch state
   */
  getBatchState(batchId: string): BatchState | null {
    return this.batchStates.get(batchId) || null;
  }

  /**
   * 获取所有批次状态
   * Get all batch states
   *
   * @returns BatchState[] 所有批次状态 - All batch states
   */
  getAllBatchStates(): BatchState[] {
    return Array.from(this.batchStates.values());
  }

  /**
   * 根据批次ID获取分批平仓状态
   * Get batch closing status by batch ID
   *
   * @param batchId 批次ID - Batch ID
   * @returns BatchState | null 批次状态 - Batch state
   */
  getBatchClosingStatusByBatchId(batchId: string): BatchState | null {
    return this.batchStates.get(batchId) || null;
  }

  /**
   * 获取AI平仓参数
   * Get AI closing parameters
   *
   * @param paramId 参数ID - Parameter ID
   * @returns AiClosingParams | null AI平仓参数 - AI closing parameters
   */
  getAiClosingParams(paramId: string): AiClosingParams | null {
    return this.aiClosingParams.get(paramId) || null;
  }

  /**
   * 获取所有AI平仓参数
   * Get all AI closing parameters
   *
   * @returns AiClosingParams[] 所有AI平仓参数 - All AI closing parameters
   */
  getAllAiClosingParams(): AiClosingParams[] {
    return Array.from(this.aiClosingParams.values());
  }

  /**
   * 更新系统配置
   * Update system configuration
   *
   * @param newConfig 新配置 - New configuration
   * @returns Promise<boolean> 更新是否成功 - Whether update was successful
   */
  async updateConfig(newConfig: Partial<BatchClosingConfig>): Promise<boolean> {
    try {
      this.config = { ...this.config, ...newConfig };

      // 重启执行定时器以应用新配置 - Restart execution timer to apply new configuration
      this.restartExecutionTimer();

      // 发出配置更新事件 - Emit configuration update event
      this.emit("configUpdated", { config: this.config });

      logger.info("批量平仓系统配置已更新", { newConfig });

      return true;
    } catch (error) {
      logger.error("更新批量平仓系统配置时出错", { error, newConfig });
      return false;
    }
  }

  /**
   * 启动执行定时器
   * Start execution timer
   * @private
   */
  private startExecutionTimer(): void {
    if (this.executionTimer) {
      clearInterval(this.executionTimer);
    }

    this.executionTimer = setInterval(async () => {
      await this.checkAndExecuteBatches();
    }, this.config.batchExecutionInterval);

    logger.debug("批量执行计时器已启动", {
      interval: this.config.batchExecutionInterval,
    });
  }

  /**
   * 重启执行定时器
   * Restart execution timer
   * @private
   */
  private restartExecutionTimer(): void {
    this.startExecutionTimer();
  }

  /**
   * 检查并执行批次
   * Check and execute batches
   * @private
   */
  private async checkAndExecuteBatches(): Promise<void> {
    try {
      if (!this.config.enableAutoExecution) {
        return;
      }

      // 获取所有待执行的批次 - Get all pending batches
      const pendingBatches = Array.from(this.batchStates.values())
        .filter((batch) => batch.status === BatchStatus.PENDING)
        .sort((a, b) => b.config.priority - a.config.priority); // 按优先级排序

      // 检查触发条件 - Check trigger conditions
      const readyBatches = pendingBatches.filter((batch) =>
        this.checkTriggerCondition(batch)
      );

      // 限制并发执行数量 - Limit concurrent execution count
      const executingBatches = Array.from(this.batchStates.values()).filter(
        (batch) => batch.status === BatchStatus.EXECUTING
      );

      const availableSlots =
        this.config.maxConcurrentBatches - executingBatches.length;
      const batchesToExecute = readyBatches.slice(0, availableSlots);

      // 执行批次 - Execute batches
      for (const batch of batchesToExecute) {
        await this.executeBatchInternal(batch);
      }
    } catch (error) {
      logger.error("检查和执行批次时出错", { error });
    }
  }

  /**
   * 检查触发条件
   * Check trigger condition
   * @private
   * @param batchState 批次状态 - Batch state
   * @returns boolean 是否满足触发条件 - Whether trigger condition is met
   */
  private async checkTriggerCondition(
    batchState: BatchState
  ): Promise<boolean> {
    try {
      const { triggerCondition } = batchState.config;

      // 检查是否过期 - Check if expired
      if (triggerCondition.triggerType === "time") {
        return Date.now() >= triggerCondition.triggerValue;
      }

      // 获取当前持仓信息 - Get current position information
      const position = await this.exchangeClient
        .getPositions()
        .then((positions) =>
          positions.find((p) => p.positionId === batchState.config.positionId)
        );
      if (!position) {
        logger.warn("Position not found for batch", {
          batchId: batchState.config.batchId,
          positionId: batchState.config.positionId,
        });
        return false;
      }

      // 动态调整触发条件 - Dynamically adjust trigger condition if needed
      await this.dynamicAdjustTriggerCondition(batchState, position);

      // 根据触发类型检查条件 - Check condition based on trigger type
      switch (triggerCondition.triggerType) {
        case "price":
          return this.compareValues(
            position.markPrice,
            triggerCondition.triggerValue,
            triggerCondition.operator
          );

        case "pnl_percent":
          return this.compareValues(
            position.pnlPercent,
            triggerCondition.triggerValue,
            triggerCondition.operator
          );

        case "manual":
          return false; // 手动触发不自动执行 - Manual trigger does not auto-execute

        case "return_prediction":
          // 根据AI预测的收益率检查条件 - Check condition based on AI predicted return rate
          return this.checkReturnPredictionCondition(batchState, position);

        case "market_sentiment":
          // 根据市场情绪数据检查条件 - Check condition based on market sentiment data
          return this.checkMarketSentimentCondition(batchState, position);

        default:
          logger.warn("Unknown trigger type", {
            triggerType: triggerCondition.triggerType,
          });
          return false;
      }
    } catch (error) {
      logger.error("检查触发条件时出错", {
        error,
        batchId: batchState.config.batchId,
      });
      return false;
    }
  }

  /**
   * 动态调整触发条件
   * Dynamically adjust trigger condition
   * @private
   * @param batchState 批次状态 - Batch state
   * @param position 持仓信息 - Position information
   * @returns Promise<void> 调整结果 - Adjustment result
   */
  private async dynamicAdjustTriggerCondition(
    batchState: BatchState,
    position: any
  ): Promise<void> {
    const { triggerCondition } = batchState.config;

    // 检查是否启用动态调整 - Check if dynamic adjustment is enabled
    if (
      !triggerCondition.dynamicAdjustment ||
      !triggerCondition.dynamicAdjustment.enabled
    ) {
      return;
    }

    const dynamicAdjustment = triggerCondition.dynamicAdjustment;

    // 检查调整条件 - Check adjustment condition
    let shouldAdjust = false;

    // 根据调整触发类型检查 - Check based on adjustment trigger type
    switch (dynamicAdjustment.adjustmentCondition.type) {
      case "price_change":
        // 计算价格变化 - Calculate price change
        const priceChange = Math.abs(
          ((position.markPrice - position.entryPrice) / position.entryPrice) *
            100
        );
        shouldAdjust = this.compareValues(
          priceChange,
          dynamicAdjustment.adjustmentCondition.value,
          dynamicAdjustment.adjustmentCondition.operator
        );
        break;

      case "pnl_change":
        // 使用当前PnL百分比 - Use current PnL percentage
        shouldAdjust = this.compareValues(
          position.pnlPercent,
          dynamicAdjustment.adjustmentCondition.value,
          dynamicAdjustment.adjustmentCondition.operator
        );
        break;

      case "time_passed":
        // 计算已过时间 - Calculate time passed
        const timePassed = Date.now() - batchState.config.createdAt;
        shouldAdjust = this.compareValues(
          timePassed,
          dynamicAdjustment.adjustmentCondition.value,
          dynamicAdjustment.adjustmentCondition.operator
        );
        break;

      default:
        return;
    }

    // 如果满足调整条件，调整触发值 - If adjustment condition is met, adjust trigger value
    if (shouldAdjust) {
      // 根据持仓方向调整触发值 - Adjust trigger value based on position direction
      if (position.side === "long") {
        // 多头持仓，提高触发值 - Long position, increase trigger value
        triggerCondition.triggerValue += dynamicAdjustment.step;
      } else {
        // 空头持仓，降低触发值 - Short position, decrease trigger value
        triggerCondition.triggerValue -= dynamicAdjustment.step;
      }

      logger.info("Trigger condition dynamically adjusted", {
        batchId: batchState.config.batchId,
        oldTriggerValue:
          triggerCondition.triggerValue -
          (position.side === "long"
            ? dynamicAdjustment.step
            : -dynamicAdjustment.step),
        newTriggerValue: triggerCondition.triggerValue,
        adjustmentStep: dynamicAdjustment.step,
      });
    }
  }

  /**
   * 检查收益率预测条件
   * Check return prediction condition
   * @private
   * @param batchState 批次状态 - Batch state
   * @param position 持仓信息 - Position information
   * @returns boolean 是否满足条件 - Whether condition is met
   */
  private checkReturnPredictionCondition(
    batchState: BatchState,
    position: any
  ): boolean {
    // 检查AI预测信息 - Check AI prediction information
    if (!batchState.config.aiPrediction) {
      return false;
    }

    const aiPrediction = batchState.config.aiPrediction;

    // 根据预测收益率和置信度决定 - Decide based on predicted return and confidence
    if (aiPrediction.confidence < 0.5) {
      // 置信度低，不满足条件 - Low confidence, condition not met
      return false;
    }

    // 根据推荐策略决定 - Decide based on recommended strategy
    if (aiPrediction.recommendedStrategy === "full_close") {
      return true;
    } else if (aiPrediction.recommendedStrategy === "batch_close") {
      // 检查当前收益率是否达到预测收益率的一定比例 - Check if current return reaches certain percentage of predicted return
      const currentReturn = position.pnlPercent;
      return currentReturn >= aiPrediction.predictedReturn * 0.7; // 达到预测收益率的70%即满足条件
    } else {
      // 推荐持有，不满足条件 - Recommended to hold, condition not met
      return false;
    }
  }

  /**
   * 检查市场情绪条件
   * Check market sentiment condition
   * @private
   * @param batchState 批次状态 - Batch state
   * @param position 持仓信息 - Position information
   * @returns boolean 是否满足条件 - Whether condition is met
   */
  private async checkMarketSentimentCondition(
    batchState: BatchState,
    position: any
  ): Promise<boolean> {
    try {
      // 获取市场情绪数据 - Get market sentiment data
      // 这里可以调用交易所客户端获取市场情绪相关数据
      // For now, we'll use a mock implementation
      const marketSentiment = {
        fundingRate: 0.01, // 1%
        openInterestChange: 0.05, // 5% increase
        fearAndGreedIndex: 65, // 65 (greed)
      };

      // 根据市场情绪数据决定 - Decide based on market sentiment data
      // 这里可以根据具体的市场情绪指标制定判断逻辑
      // For now, we'll use a simple rule
      if (marketSentiment.fearAndGreedIndex > 70) {
        // 极度贪婪，考虑平仓 - Extreme greed, consider closing
        return true;
      } else if (marketSentiment.fearAndGreedIndex < 30) {
        // 极度恐惧，考虑持有或加仓 - Extreme fear, consider holding or adding position
        return false;
      } else {
        // 中性情绪，根据其他指标决定 - Neutral sentiment, decide based on other indicators
        return this.compareValues(
          position.pnlPercent,
          batchState.config.triggerCondition.triggerValue,
          batchState.config.triggerCondition.operator
        );
      }
    } catch (error) {
      logger.error("检查市场情绪条件时出错", {
        error,
        batchId: batchState.config.batchId,
      });
      return false;
    }
  }

  /**
   * 比较值
   * Compare values
   * @private
   */
  private compareValues(
    actualValue: number,
    triggerValue: number,
    operator: string
  ): boolean {
    switch (operator) {
      case ">":
        return actualValue > triggerValue;
      case "<":
        return actualValue < triggerValue;
      case "=":
        return Math.abs(actualValue - triggerValue) < 0.0001;
      case ">=":
        return actualValue >= triggerValue;
      case "<=":
        return actualValue <= triggerValue;
      default:
        return false;
    }
  }

  /**
   * 执行批次（私有方法）
   * Execute batch (private method)
   * @private
   */
  private async executeBatchInternal(batchState: BatchState): Promise<void> {
    try {
      // 更新状态为执行中 - Update status to executing
      batchState.status = BatchStatus.EXECUTING;
      batchState.executedAt = Date.now();

      // 发出批次执行开始事件 - Emit batch execution start event
      this.emit("batchExecutionStarted", {
        batchId: batchState.config.batchId,
      });

      logger.info("Executing batch", {
        batchId: batchState.config.batchId,
        positionId: batchState.config.positionId,
        closingRatio: batchState.config.closingRatio,
        closingQuantity: batchState.config.closingQuantity,
      });

      // 计算实际平仓数量 - Calculate actual closing quantity
      const position = await this.exchangeClient
        .getPositions()
        .then((positions) =>
          positions.find((p) => p.positionId === batchState.config.positionId)
        );
      if (!position) {
        throw new Error(`Position ${batchState.config.positionId} not found`);
      }

      let actualQuantity = batchState.config.closingQuantity;
      if (actualQuantity <= 0) {
        // 如果未指定数量，按比例计算 - If quantity not specified, calculate by ratio
        actualQuantity = position.positionAmt * batchState.config.closingRatio;
      }

      // 执行平仓 - Execute closing
      const closeResult = await this.exchangeClient.closePosition({
        contract: batchState.config.positionId,
        size: actualQuantity,
      });

      // 更新执行结果 - Update execution result
      batchState.executionResult = {
        actualQuantity: closeResult.executedQty || actualQuantity,
        actualPrice: closeResult.avgPrice || position.markPrice,
        fee: closeResult.fee || 0,
        pnl: closeResult.realizedPnl || 0,
      };

      // 更新状态为已完成 - Update status to completed
      batchState.status = BatchStatus.COMPLETED;
      batchState.completedAt = Date.now();

      // 发出批次执行完成事件 - Emit batch execution completed event
      this.emit("batchExecutionCompleted", {
        batchId: batchState.config.batchId,
        result: batchState.executionResult,
      });

      logger.info("批量执行成功", {
        batchId: batchState.config.batchId,
        actualQuantity: batchState.executionResult.actualQuantity,
        actualPrice: batchState.executionResult.actualPrice,
        pnl: batchState.executionResult.pnl,
      });
    } catch (error) {
      // 更新状态为失败 - Update status to failed
      batchState.status = BatchStatus.FAILED;
      batchState.errorMessage =
        error instanceof Error ? error.message : String(error);
      batchState.retryCount++;

      // 发出批次执行失败事件 - Emit batch execution failed event
      this.emit("batchExecutionFailed", {
        batchId: batchState.config.batchId,
        error: batchState.errorMessage,
        retryCount: batchState.retryCount,
      });

      logger.error("批量执行失败", {
        batchId: batchState.config.batchId,
        error: batchState.errorMessage,
        retryCount: batchState.retryCount,
      });

      // 检查是否需要重试 - Check if retry is needed
      if (batchState.retryCount < this.config.maxRetryCount) {
        logger.info("Scheduling batch retry", {
          batchId: batchState.config.batchId,
          retryCount: batchState.retryCount,
        });

        // 重置状态为待执行 - Reset status to pending
        batchState.status = BatchStatus.PENDING;
      }
    }
  }

  /**
   * 验证平仓参数
   * Validate closing parameters
   * @private
   */
  private validateClosingParams(params: AiClosingParams): boolean {
    // 检查基本字段 - Check basic fields
    if (!params.paramId || !params.decisionId || !params.batchConfigs) {
      return false;
    }

    // 检查整体平仓策略 - Check overall closing strategy
    const validStrategies: Array<"full_close" | "batch_close" | "hold"> = [
      "full_close",
      "batch_close",
      "hold",
    ];
    if (!validStrategies.includes(params.overallClosingStrategy)) {
      return false;
    }

    // 检查时间有效性 - Check time validity
    const now = Date.now();
    if (params.effectiveTime > now || params.expiresAt <= now) {
      return false;
    }

    // 检查批次配置 - Check batch configurations
    for (const batchConfig of params.batchConfigs) {
      if (
        !batchConfig.batchId ||
        !batchConfig.positionId ||
        batchConfig.closingRatio <= 0 ||
        batchConfig.closingRatio > 1
      ) {
        return false;
      }

      // 检查AI预测信息的有效性 - Check validity of AI prediction information
      if (batchConfig.aiPrediction) {
        if (
          typeof batchConfig.aiPrediction.predictedReturn !== "number" ||
          typeof batchConfig.aiPrediction.confidence !== "number" ||
          batchConfig.aiPrediction.confidence < 0 ||
          batchConfig.aiPrediction.confidence > 1
        ) {
          return false;
        }
      }

      // 检查动态调整参数的有效性 - Check validity of dynamic adjustment parameters
      if (batchConfig.triggerCondition.dynamicAdjustment) {
        const dynamicAdjustment =
          batchConfig.triggerCondition.dynamicAdjustment;
        if (
          typeof dynamicAdjustment.step !== "number" ||
          dynamicAdjustment.step <= 0 ||
          dynamicAdjustment.maxAdjustments <= 0
        ) {
          return false;
        }
      }
    }

    // 检查收益率预测信息的有效性 - Check validity of return prediction information
    if (params.returnPrediction) {
      if (
        typeof params.returnPrediction.predictedReturn !== "number" ||
        typeof params.returnPrediction.confidence !== "number" ||
        typeof params.returnPrediction.timeRange !== "number" ||
        params.returnPrediction.confidence < 0 ||
        params.returnPrediction.confidence > 1 ||
        params.returnPrediction.timeRange <= 0
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * 设置批次平仓配置
   * Set batch closing configuration
   *
   * @param batchConfig 批次配置 - Batch configuration
   * @returns string 批次ID - Batch ID
   */
  setBatchClosing(batchConfig: BatchConfig): string {
    try {
      // 生成批次ID（如果没有提供）
      // Generate batch ID (if not provided)
      const batchId =
        batchConfig.batchId ||
        `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 创建新的批次配置
      // Create new batch configuration
      const newBatchConfig: BatchConfig = {
        ...batchConfig,
        batchId,
      };

      // 创建批次状态
      // Create batch state
      const batchState: BatchState = {
        config: newBatchConfig,
        status: BatchStatus.PENDING,
        retryCount: 0,
      };

      // 存储批次状态
      // Store batch state
      this.batchStates.set(batchId, batchState);

      logger.info("批量平仓配置已设置", {
        batchId,
        positionId: batchConfig.positionId,
        closingType: batchConfig.closingType,
        closingRatio: batchConfig.closingRatio,
        closingQuantity: batchConfig.closingQuantity,
      });

      return batchId;
    } catch (error) {
      logger.error("设置批量平仓配置时出错", { error, batchConfig });
      return "";
    }
  }

  /**
   * 激活批次平仓
   * Activate batch closing
   *
   * @param batchId 批次ID - Batch ID
   * @returns boolean 是否激活成功 - Whether activation was successful
   */
  activateBatchClosing(batchId: string): boolean {
    try {
      // 检查批次状态是否存在
      // Check if batch state exists
      const batchState = this.batchStates.get(batchId);
      if (!batchState) {
        logger.error("Batch state not found", { batchId });
        return false;
      }

      // 更新批次状态为执行中
      // Update batch status to executing
      batchState.status = BatchStatus.EXECUTING;
      this.batchStates.set(batchId, batchState);

      // 启动执行定时器（如果尚未启动）
      // Start execution timer (if not already started)
      if (!this.executionTimer) {
        this.startExecutionTimer();
      }

      logger.info("Batch closing activated", {
        batchId,
        positionId: batchState.config.positionId,
        closingType: batchState.config.closingType,
      });

      return true;
    } catch (error) {
      logger.error("激活批次平仓时出错", { error, batchId });
      return false;
    }
  }

  /**
   * 执行批次（公共方法）
   * Execute batch (public method)
   *
   * @param batchId 批次ID - Batch ID
   * @returns Promise<boolean> 是否成功执行 - Whether execution was successful
   */
  async executeBatch(batchId: string): Promise<boolean> {
    try {
      // 获取批次状态 - Get batch state
      const batchState = this.batchStates.get(batchId);
      if (!batchState) {
        logger.error("Batch state not found", { batchId });
        return false;
      }

      // 检查批次状态是否为待执行或执行中
      // Check if batch status is pending or executing
      if (
        batchState.status !== BatchStatus.PENDING &&
        batchState.status !== BatchStatus.EXECUTING
      ) {
        logger.warn("Batch is not in a state that can be executed", {
          batchId,
          status: batchState.status,
        });
        return false;
      }

      // 记录原始状态 - Record original status
      const originalStatus = batchState.status;

      // 执行批次 - Execute batch
      await this.executeBatchInternal(batchState);

      // 检查执行结果 - Check execution result
      const currentStatus = batchState.status as
        | BatchStatus.PENDING
        | BatchStatus.EXECUTING
        | BatchStatus.COMPLETED
        | BatchStatus.FAILED
        | BatchStatus.CANCELLED;
      return (
        currentStatus === BatchStatus.COMPLETED ||
        currentStatus === BatchStatus.FAILED
      );
    } catch (error) {
      logger.error("执行批次时出错", { batchId, error });
      return false;
    }
  }

  /**
   * 启动分批平仓
   * Start batch closing
   *
   * @param positionId 持仓ID - Position ID
   * @returns Promise<boolean> 是否成功启动 - Whether successfully started
   */
  public async startBatchClosing(positionId: string): Promise<boolean> {
    try {
      // 查找与该持仓ID相关的批次 - Find batches related to this position ID
      const relatedBatches: BatchState[] = [];

      for (const [batchId, batchState] of this.batchStates.entries()) {
        if (
          batchState.config.positionId === positionId &&
          batchState.status === BatchStatus.PENDING
        ) {
          relatedBatches.push(batchState);
        }
      }

      if (relatedBatches.length === 0) {
        logger.warn(`No pending batches found for position: ${positionId}`);
        return false;
      }

      // 按优先级排序 - Sort by priority
      relatedBatches.sort((a, b) => a.config.priority - b.config.priority);

      // 执行所有相关批次 - Execute all related batches
      for (const batchState of relatedBatches) {
        await this.executeBatch(batchState.config.batchId);
      }

      logger.info(`Started batch closing for position: ${positionId}`, {
        batchCount: relatedBatches.length,
      });
      return true;
    } catch (error) {
      logger.error(`启动持仓 ${positionId} 的分批平仓失败`, { error });
      return false;
    }
  }

  /**
   * 停止分批平仓
   * Stop batch closing
   *
   * @param positionId 持仓ID - Position ID
   * @returns Promise<boolean> 是否成功停止 - Whether successfully stopped
   */
  public async stopBatchClosing(positionId: string): Promise<boolean> {
    try {
      // 查找与该持仓ID相关的批次 - Find batches related to this position ID
      const relatedBatches: string[] = [];

      for (const [batchId, batchState] of this.batchStates.entries()) {
        if (
          batchState.config.positionId === positionId &&
          (batchState.status === BatchStatus.PENDING ||
            batchState.status === BatchStatus.EXECUTING)
        ) {
          relatedBatches.push(batchId);
        }
      }

      if (relatedBatches.length === 0) {
        logger.warn(`No active batches found for position: ${positionId}`);
        return false;
      }

      // 取消所有相关批次 - Cancel all related batches
      for (const batchId of relatedBatches) {
        await this.cancelBatchClosing(batchId);
      }

      logger.info(`Stopped batch closing for position: ${positionId}`, {
        batchCount: relatedBatches.length,
      });
      return true;
    } catch (error) {
      logger.error(`停止持仓 ${positionId} 的分批平仓失败`, { error });
      return false;
    }
  }

  /**
   * 取消批次平仓
   * Cancel batch closing
   *
   * @param batchId 批次ID - Batch ID
   * @returns boolean 是否取消成功 - Whether cancellation was successful
   */
  cancelBatchClosing(batchId: string): boolean {
    try {
      // 检查批次状态是否存在
      // Check if batch state exists
      const batchState = this.batchStates.get(batchId);
      if (!batchState) {
        logger.error("Batch state not found", { batchId });
        return false;
      }

      // 检查批次状态是否可以取消
      // Check if batch status can be cancelled
      if (
        batchState.status === BatchStatus.COMPLETED ||
        batchState.status === BatchStatus.CANCELLED
      ) {
        logger.warn("Batch is already completed or cancelled", {
          batchId,
          status: batchState.status,
        });
        return false;
      }

      // 更新批次状态为已取消
      // Update batch status to cancelled
      batchState.status = BatchStatus.CANCELLED;
      batchState.cancelledAt = Date.now();
      this.batchStates.set(batchId, batchState);

      // 发出批次取消事件
      // Emit batch cancellation event
      this.emit("batchCancelled", { batchId });

      logger.info("Batch closing cancelled", { batchId });

      return true;
    } catch (error) {
      logger.error("取消批次平仓时出错", { batchId, error });
      return false;
    }
  }

  /**
   * 根据持仓ID获取批次状态
   * Get batch states by position ID
   *
   * @param positionId 持仓ID - Position ID
   * @returns BatchState[] 批次状态列表 - List of batch states
   */
  getBatchStatesByPositionId(positionId: string): BatchState[] {
    return Array.from(this.batchStates.values()).filter(
      (batch) => batch.config.positionId === positionId
    );
  }

  /**
   * 检查批次平仓是否触发
   * Check if batch closing is triggered
   *
   * @param batchId 批次ID - Batch ID
   * @returns Promise<boolean> 是否触发 - Whether triggered
   */
  async checkBatchClosing(batchId: string): Promise<boolean> {
    try {
      const batchState = this.batchStates.get(batchId);
      if (!batchState) {
        logger.warn("Batch not found", { batchId });
        return false;
      }

      return await this.checkTriggerCondition(batchState);
    } catch (error) {
      logger.error("检查批次平仓时出错", { error, batchId });
      return false;
    }
  }

  /**
   * 销毁系统
   * Destroy system
   */
  destroy(): void {
    // 停止定时器 - Stop timers
    if (this.executionTimer) {
      clearInterval(this.executionTimer);
      this.executionTimer = null;
    }

    // 移除所有监听器 - Remove all listeners
    this.removeAllListeners();

    // 清空数据 - Clear data
    this.batchStates.clear();
    this.aiClosingParams.clear();

    logger.info("CaiSen Batch Closing System destroyed");
  }
}

/**
 * 默认分批平仓系统配置
 * Default batch closing system configuration
 */
export const DEFAULT_BATCH_CLOSING_CONFIG: BatchClosingConfig = {
  maxConcurrentBatches: 3,
  batchExecutionInterval: 10 * 1000, // 10秒 - 10 seconds
  maxRetryCount: 3,
  enableAutoExecution: true,
  priceDeviationTolerance: 0.5, // 0.5% - 0.5%
};

/**
 * 创建蔡森分批平仓系统实例
 * Create CaiSen batch closing system instance
 *
 * @param config 分批平仓系统配置 - Batch closing system configuration
 * @param strategyConfig 策略配置 - Strategy configuration
 * @returns CaiSenBatchClosingSystem 蔡森分批平仓系统实例 - CaiSen batch closing system instance
 */
export function createCaiSenBatchClosingSystem(
  config: BatchClosingConfig = DEFAULT_BATCH_CLOSING_CONFIG,
  strategyConfig: StrategyParams
): CaiSenBatchClosingSystem {
  return new CaiSenBatchClosingSystem(config, strategyConfig);
}
