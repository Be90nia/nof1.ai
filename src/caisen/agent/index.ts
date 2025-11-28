/**
 * 蔡森Agent主模块
 * CaiSen Agent Main Module
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { createLogger } from "../../utils/loggerUtils";
import { Agent } from "@voltagent/core";
import type { CaiSenTradingTools } from "./tools";
import type { Memory } from "@voltagent/core";

const logger = createLogger({ name: "caisen-agent", level: "info" });

/**
 * 蔡森Agent配置接口
 * CaiSen Agent Configuration Interface
 */
export interface CaiSenAgentConfig {
  /** 执行间隔（分钟） - Execution interval in minutes */
  intervalMinutes: number;

  /** 市场数据上下文 - Market data context */
  marketDataContext: any;

  /** 是否启用详细日志记录 - Whether to enable detailed logging */
  enableDetailedLogging?: boolean;

  /** 交易工具集 - Trading tools set */
  tools: any[];

  /** OpenAI客户端实例 - OpenAI client instance */
  openai: any;

  /** 内存管理器实例 - Memory manager instance */
  memory: Memory;

  /** 蔡森Agent交易工具 - CaiSen Agent trading tools */
  caiSenTradingTools: CaiSenTradingTools;
}

/**
 * 蔡森Agent状态接口
 * CaiSen Agent State Interface
 */
export interface CaiSenAgentState {
  /** Agent是否运行中 - Whether the agent is running */
  isRunning: boolean;

  /** 最后执行时间戳 - Last execution timestamp */
  lastExecutionTime: number;

  /** 执行次数 - Execution count */
  executionCount: number;

  /** 错误计数 - Error count */
  errorCount: number;

  /** 最后错误信息 - Last error message */
  lastError?: string;

  /** 当前策略配置 - Current strategy configuration */
  currentStrategyConfig?: any;
}

/**
 * 蔡森Agent管理类
 * CaiSen Agent Manager Class
 */
export class CaiSenAgentManager {
  private static instance: CaiSenAgentManager;
  private agents: Map<string, any> = new Map();

  private constructor() {
    // 私有构造函数，防止直接实例化
  }

  /**
   * 获取Agent管理器单例实例
   * Get Agent Manager Singleton Instance
   */
  public static getInstance(): CaiSenAgentManager {
    if (!CaiSenAgentManager.instance) {
      CaiSenAgentManager.instance = new CaiSenAgentManager();
    }
    return CaiSenAgentManager.instance;
  }

  /**
   * 添加Agent实例
   * Add Agent Instance
   *
   * @param agentId Agent ID
   * @param agent Agent instance
   */
  public addAgent(agentId: string, agent: any): void {
    this.agents.set(agentId, agent);
    logger.info(`蔡森Agent已添加: ${agentId}`);
  }

  /**
   * 获取Agent实例
   * Get Agent Instance
   *
   * @param agentId Agent ID
   * @returns Agent instance or undefined if not found
   */
  public getAgent(agentId: string): any | undefined {
    return this.agents.get(agentId);
  }

  /**
   * 移除Agent实例
   * Remove Agent Instance
   *
   * @param agentId Agent ID
   */
  public removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    logger.info(`蔡森Agent已移除: ${agentId}`);
  }

  /**
   * 获取所有Agent实例
   * Get All Agent Instances
   *
   * @returns Map of Agent ID to Agent instance
   */
  public getAllAgents(): Map<string, any> {
    return new Map(this.agents);
  }

  /**
   * 启动所有Agent
   * Start All Agents
   */
  public async startAllAgents(): Promise<void> {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.start) {
        await agent.start();
        logger.info(`蔡森Agent已启动: ${agentId}`);
      }
    }
  }

  /**
   * 停止所有Agent
   * Stop All Agents
   */
  public async stopAllAgents(): Promise<void> {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.stop) {
        await agent.stop();
        logger.info(`蔡森Agent已停止: ${agentId}`);
      }
    }
  }
}

/**
 * 创建蔡森Agent
 * Create CaiSen Agent
 *
 * @param config 蔡森Agent配置 - CaiSen Agent configuration
 * @returns 蔡森Agent实例 - CaiSen Agent instance
 */
export async function createCaiSenAgent(
  config: CaiSenAgentConfig
): Promise<Agent> {
  logger.info("创建蔡森Agent实例...");

  const {
    intervalMinutes,
    marketDataContext,
    enableDetailedLogging = false,
    tools,
    openai,
    memory,
    caiSenTradingTools,
  } = config;

  // 创建Agent实例（继承自@voltagent/core的Agent类）
  const caiSenAgent = new Agent({
    name: "cai-sen-agent",
    tools,
    memory,
    model: openai.chat(process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"), // 使用传入的openai参数
    instructions: "你是一个专业的加密货币交易AI，负责执行蔡森策略进行交易决策。", // 添加必要的instructions属性
  });

  // 扩展Agent实例，添加蔡森Agent特有的属性和方法
  Object.assign(caiSenAgent, {
    /** 蔡森Agent配置 - CaiSen Agent configuration */
    config,

    /** 市场数据上下文 - Market data context */
    marketDataContext,

    /** 执行间隔（分钟） - Execution interval in minutes */
    intervalMinutes,

    /** 是否启用详细日志记录 - Whether to enable detailed logging */
    enableDetailedLogging,

    /** 蔡森Agent交易工具 - CaiSen Agent trading tools */
    caiSenTradingTools,

    /** 蔡森Agent状态 - CaiSen Agent state */
    state: {
      isRunning: false,
      lastExecutionTime: 0,
      executionCount: 0,
      errorCount: 0,
      lastError: undefined as string | undefined, // 明确类型为string | undefined
    },

    /** 启动Agent - Start the agent */
    async start() {
      this.state.isRunning = true;
      logger.info("蔡森Agent已启动");
    },

    /** 停止Agent - Stop the agent */
    async stop() {
      this.state.isRunning = false;
      logger.info("蔡森Agent已停止");
    },

    /** 执行Agent逻辑 - Execute agent logic */
    async execute() {
      try {
        this.state.lastExecutionTime = Date.now();
        this.state.executionCount++;

        if (this.enableDetailedLogging) {
          logger.info("执行蔡森Agent逻辑...", {
            intervalMinutes: this.intervalMinutes,
            executionCount: this.state.executionCount,
          });
        }

        // 这里可以添加实际的蔡森Agent执行逻辑
        // Actual CaiSen Agent execution logic can be added here

        return { success: true, executionCount: this.state.executionCount };
      } catch (error) {
        this.state.errorCount++;
        this.state.lastError =
          error instanceof Error ? error.message : String(error);
        logger.error("蔡森Agent执行失败:", error);
        return { success: false, error: this.state.lastError };
      }
    },

    /** 获取Agent状态 - Get agent state */
    getState(): CaiSenAgentState {
      return { ...this.state };
    },

    /** 获取Agent配置 - Get agent configuration */
    getConfig(): CaiSenAgentConfig {
      return { ...this.config };
    },
  });

  // 将Agent添加到管理器
  const agentId = `caisen-agent-${Date.now()}`;
  CaiSenAgentManager.getInstance().addAgent(agentId, caiSenAgent);

  logger.info("蔡森Agent实例创建完成", { agentId });
  return caiSenAgent;
}
