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
 * 策略参数工具 - 允许Agent动态设置策略参数
 *
 * 该工具提供了Agent设置和获取策略参数的功能，包括：
 * - 设置分批止盈参数
 * - 设置峰值回落平仓参数
 * - 获取当前策略参数
 * - 重置策略参数到默认值
 */

import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { TradingStrategy } from "../strategies";
import { createLogger } from "../utils/loggerUtils";
import { RISK_PARAMS } from "../config/riskParams";
import { dbClient } from "../database/dbClient";

const logger = createLogger({
  name: "strategy-params-tool",
  level: "info",
});

/**
 * 在现有数据库连接上验证strategy_params表是否存在，如果不存在则创建
 * @param client 数据库客户端连接
 */
async function verifyStrategyParamsTable(): Promise<void> {
  try {
    logger.debug({
      action: "verify_table",
      table: "strategy_params",
      message: "验证表是否存在",
    });

    // 检查表是否存在
    const tableCheckResult = await dbClient.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='strategy_params'`
    );

    if (tableCheckResult.rows.length === 0) {
      logger.warn({
        action: "verify_table",
        table: "strategy_params",
        message: "表不存在，开始创建",
      });

      // 创建表
      await dbClient.execute(
        `CREATE TABLE IF NOT EXISTS strategy_params (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            strategy TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            description TEXT,
            UNIQUE(key, strategy)
          );
          CREATE INDEX IF NOT EXISTS idx_strategy_params_strategy ON strategy_params(strategy);
          CREATE INDEX IF NOT EXISTS idx_strategy_params_key ON strategy_params(key);`
      );

      logger.info({
        action: "create_table",
        table: "strategy_params",
        message: "表创建成功",
      });
    } else {
      logger.debug({
        action: "verify_table",
        table: "strategy_params",
        message: "表已存在",
      });
    }
  } catch (error) {
    logger.error({
      action: "verify_or_create_table",
      table: "strategy_params",
      message: "验证或创建表失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

/**
 * 动态止损条件类型
 */
export type DynamicStopLossCondition = {
  type: "volatility" | "trend" | "news";
  value: number;
};

/**
 * 动态止损参数类型
 */
export type DynamicStopLossParams = {
  enabled: boolean;
  initialStopLoss: number; // 初始止损幅度（百分比）
  trailingStopLoss: {
    level1: { trigger: number; stopAt: number }; // 盈利达到trigger%时，止损线移至stopAt%盈利位
    level2: { trigger: number; stopAt: number };
    level3: { trigger: number; stopAt: number };
  };
};

/**
 * 分批止盈参数类型
 */
export type PartialTakeProfitParams = {
  stage1: { trigger: number; closePercent: number };
  stage2: { trigger: number; closePercent: number };
  stage3: { trigger: number; closePercent: number };
};

/**
 * 峰值回落参数类型
 */
export type PeakDrawdownParams = {
  level1: { drawdownThreshold: number; closePercent: number };
  level2: { drawdownThreshold: number; closePercent: number };
  level3: { drawdownThreshold: number; closePercent: number };
  minHoldingTime: number;
};

/**
 * 仓位退出策略参数类型
 */
export type PositionExitStrategyParams = {
  strategyType: "partialTakeProfit" | "peakDrawdown" | "combination";
  partialTakeProfit?: PartialTakeProfitParams;
  dynamicStopLoss?: DynamicStopLossParams;
  peakDrawdown?: PeakDrawdownParams;
  enabled: boolean;
};

/**
 * 内部核心函数：设置分批止盈参数
 */
async function _setPartialTakeProfitParams(
  strategy: TradingStrategy,
  symbol: string,
  stage1: { trigger: number; closePercent: number },
  stage2: { trigger: number; closePercent: number },
  stage3: { trigger: number; closePercent: number }
): Promise<string> {
  logger.info({
    action: "tool_call",
    function: "setPartialTakeProfitParams",
    strategy,
    symbol,
    params: {
      stage1: { trigger: stage1.trigger, closePercent: stage1.closePercent },
      stage2: { trigger: stage2.trigger, closePercent: stage2.closePercent },
      stage3: { trigger: stage3.trigger, closePercent: stage3.closePercent },
    },
    message: "调用设置分批止盈参数工具",
  });

  try {
    // 负数转正数处理：无论多空，止盈阈值必须为正值
    stage1.trigger = Math.abs(stage1.trigger);
    stage2.trigger = Math.abs(stage2.trigger);
    stage3.trigger = Math.abs(stage3.trigger);

    // 验证参数有效性
    if (stage1.trigger <= 0 || stage2.trigger <= 0 || stage3.trigger <= 0) {
      throw new Error("止盈触发阈值必须大于0，无论做多还是做空");
    }
    if (
      stage1.closePercent <= 0 ||
      stage2.closePercent <= 0 ||
      stage3.closePercent <= 0
    ) {
      throw new Error("平仓百分比必须大于0");
    }

    logger.debug({
      action: "db_use_pool",
      function: "setPartialTakeProfitParams",
      message: "使用数据库连接池",
    });

    // 验证表是否存在
    await verifyStrategyParamsTable();

    const params = { stage1, stage2, stage3 };
    // 使用包含币种的key命名规则
    const paramKey = `partialTakeProfit_${symbol}`;
    logger.debug({
      action: "db_execute",
      function: "setPartialTakeProfitParams",
      sql: "INSERT OR REPLACE INTO strategy_params",
      params: { paramKey, strategy },
      message: "执行SQL插入或替换操作",
    });

    const result = await dbClient.execute(
      `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
            VALUES (?, ?, ?, ?, ?)`,
      [
        paramKey,
        JSON.stringify(params),
        strategy,
        new Date().toISOString(),
        `Agent为${symbol}设置的分批止盈参数`,
      ]
    );

    logger.debug({
      action: "db_execute_result",
      function: "setPartialTakeProfitParams",
      affectedRows: result.rowsAffected,
      message: "SQL执行成功",
    });

    // 验证数据是否已正确存储
    logger.debug({
      action: "db_verify",
      function: "setPartialTakeProfitParams",
      params: { paramKey, strategy },
      message: "验证数据是否已正确存储",
    });
    const verifyResult = await dbClient.execute(
      "SELECT key, value FROM strategy_params WHERE strategy = ? AND key = ?",
      [strategy, paramKey]
    );
    logger.debug({
      action: "db_verify_result",
      function: "setPartialTakeProfitParams",
      rowCount: verifyResult.rows.length,
      message: `数据验证结果：${verifyResult.rows.length}条记录`,
    });

    const returnMessage = `成功为${symbol}设置${strategy}策略的分批止盈参数：
阶段1：盈利达到${stage1.trigger}%时，平仓${stage1.closePercent}%
阶段2：盈利达到${stage2.trigger}%时，平仓${stage2.closePercent}%
阶段3：盈利达到${stage3.trigger}%时，平仓${stage3.closePercent}%`;

    logger.info({
      action: "tool_success",
      function: "setPartialTakeProfitParams",
      strategy,
      symbol,
      message: "工具执行成功",
      result: returnMessage.replace(/\n/g, " "),
    });

    return returnMessage;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "setPartialTakeProfitParams",
      strategy,
      symbol,
      message: "工具执行失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `设置分批止盈参数失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function setPartialTakeProfitParams(
  strategy: TradingStrategy,
  symbol: string,
  stage1: { trigger: number; closePercent: number },
  stage2: { trigger: number; closePercent: number },
  stage3: { trigger: number; closePercent: number }
): Promise<string> {
  return await _setPartialTakeProfitParams(
    strategy,
    symbol,
    stage1,
    stage2,
    stage3
  );
}

/**
 * 导出为工具，供Agent使用
 */

/**
 * 内部核心函数：设置峰值回落平仓参数
 */
async function _setPeakDrawdownParams(
  strategy: TradingStrategy,
  symbol: string,
  level1: { drawdownThreshold: number; closePercent: number },
  level2: { drawdownThreshold: number; closePercent: number },
  level3: { drawdownThreshold: number; closePercent: number },
  minHoldingTime: number = 5
): Promise<string> {
  logger.info({
    action: "tool_call",
    function: "setPeakDrawdownParams",
    strategy,
    symbol,
    params: {
      level1: {
        drawdownThreshold: level1.drawdownThreshold,
        closePercent: level1.closePercent,
      },
      level2: {
        drawdownThreshold: level2.drawdownThreshold,
        closePercent: level2.closePercent,
      },
      level3: {
        drawdownThreshold: level3.drawdownThreshold,
        closePercent: level3.closePercent,
      },
      minHoldingTime,
    },
    message: "调用设置峰值回落平仓参数工具",
  });

  try {
    // 负数转正数处理：无论多空，回落阈值必须为正值
    level1.drawdownThreshold = Math.abs(level1.drawdownThreshold);
    level2.drawdownThreshold = Math.abs(level2.drawdownThreshold);
    level3.drawdownThreshold = Math.abs(level3.drawdownThreshold);

    // 最小持仓时间不能为负数
    minHoldingTime = Math.max(0, minHoldingTime);

    // 验证参数有效性
    if (
      level1.drawdownThreshold <= 0 ||
      level2.drawdownThreshold <= 0 ||
      level3.drawdownThreshold <= 0
    ) {
      throw new Error("回落触发阈值必须大于0，无论做多还是做空");
    }
    if (
      level1.closePercent <= 0 ||
      level2.closePercent <= 0 ||
      level3.closePercent <= 0
    ) {
      throw new Error("平仓百分比必须大于0");
    }

    logger.debug({
      action: "db_use_pool",
      function: "setPeakDrawdownParams",
      message: "使用数据库连接池",
    });

    // 验证表是否存在
    await verifyStrategyParamsTable();

    const params = {
      enabled: true,
      levels: [
        {
          drawdownThreshold: level1.drawdownThreshold,
          closePercent: level1.closePercent,
        },
        {
          drawdownThreshold: level2.drawdownThreshold,
          closePercent: level2.closePercent,
        },
        {
          drawdownThreshold: level3.drawdownThreshold,
          closePercent: level3.closePercent,
        },
      ],
      minHoldingTime: minHoldingTime * 60 * 1000, // 转换为毫秒
      maxClosePercent: 100,
    };

    // 使用包含币种的key命名规则
    const paramKey = `peakDrawdownProtectionConfig_${symbol}`;
    logger.debug({
      action: "db_execute",
      function: "setPeakDrawdownParams",
      sql: "INSERT OR REPLACE INTO strategy_params",
      params: { paramKey, strategy },
      message: "执行SQL插入或替换操作",
    });

    const result = await dbClient.execute(
      `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
            VALUES (?, ?, ?, ?, ?)`,
      [
        paramKey,
        JSON.stringify(params),
        strategy,
        new Date().toISOString(),
        `Agent为${symbol}设置的峰值回落平仓参数`,
      ]
    );

    logger.debug({
      action: "db_execute_result",
      function: "setPeakDrawdownParams",
      affectedRows: result.rowsAffected,
      message: "SQL执行成功",
    });

    // 验证数据是否已正确存储
    logger.debug({
      action: "db_verify",
      function: "setPeakDrawdownParams",
      params: { paramKey, strategy },
      message: "验证数据是否已正确存储",
    });
    const verifyResult = await dbClient.execute(
      "SELECT key, value FROM strategy_params WHERE strategy = ? AND key = ?",
      [strategy, paramKey]
    );
    logger.debug({
      action: "db_verify_result",
      function: "setPeakDrawdownParams",
      rowCount: verifyResult.rows.length,
      message: `数据验证结果：${verifyResult.rows.length}条记录`,
    });

    const returnMessage = `成功为${symbol}设置${strategy}策略的多级峰值回落平仓参数：
第一级：回落${level1.drawdownThreshold}%时平仓${level1.closePercent}%
第二级：回落${level2.drawdownThreshold}%时平仓${level2.closePercent}%
第三级：回落${level3.drawdownThreshold}%时平仓${level3.closePercent}%
最小持仓时间：${minHoldingTime}分钟`;

    logger.info({
      action: "tool_success",
      function: "setPeakDrawdownParams",
      strategy,
      symbol,
      message: "工具执行成功",
      result: returnMessage.replace(/\n/g, " "),
    });

    return returnMessage;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "setPeakDrawdownParams",
      strategy,
      symbol,
      message: "工具执行失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `设置峰值回落参数失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function setPeakDrawdownParams(
  strategy: TradingStrategy,
  symbol: string,
  level1: { drawdownThreshold: number; closePercent: number },
  level2: { drawdownThreshold: number; closePercent: number },
  level3: { drawdownThreshold: number; closePercent: number },
  minHoldingTime: number = 5
): Promise<string> {
  return await _setPeakDrawdownParams(
    strategy,
    symbol,
    level1,
    level2,
    level3,
    minHoldingTime
  );
}

/**
 * 导出为工具，供Agent使用
 */

/**
 * 内部核心函数：获取当前策略参数
 */
async function _getCurrentStrategyParams(
  strategy: TradingStrategy,
  symbol?: string
): Promise<string> {
  try {
    logger.info({
      action: "tool_call",
      function: "getCurrentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "调用获取当前策略参数工具",
    });

    logger.debug({
      action: "db_use_pool",
      function: "getCurrentStrategyParams",
      message: "使用数据库连接池",
    });

    let sql =
      "SELECT key, value, description FROM strategy_params WHERE strategy = ?";
    const args: any[] = [strategy];

    // 如果指定了币种，只查询该币种的参数
    if (symbol) {
      sql += " AND (key LIKE ? OR key NOT LIKE '%_%')";
      args.push(`%_${symbol}`);
    }

    logger.debug({
      action: "db_query",
      function: "getCurrentStrategyParams",
      sql: sql.replace(/\s+/g, " ").trim(),
      args: args.map((arg) =>
        typeof arg === "string" && arg.includes("file:")
          ? arg.replace(/^file:/, "file:***")
          : arg
      ),
      message: "执行数据库查询",
    });
    const result = await dbClient.execute(sql, args);

    logger.debug({
      action: "db_query_result",
      function: "getCurrentStrategyParams",
      rowCount: result.rows.length,
      message: `查询结果：${result.rows.length}条记录`,
    });

    if (result.rows.length === 0) {
      const msg = symbol
        ? `ℹ️ 当前${strategy}策略没有为${symbol}设置任何自定义参数，将使用默认值`
        : `ℹ️ 当前${strategy}策略没有设置任何自定义参数，将使用默认值`;
      logger.info({
        action: "tool_result",
        function: "getCurrentStrategyParams",
        strategy,
        symbol: symbol || "所有币种",
        message: msg,
      });
      return msg;
    }

    const responsePrefix = symbol
      ? `当前${strategy}策略为${symbol}设置的自定义参数：\n`
      : `当前${strategy}策略的所有自定义参数：\n`;
    let response = responsePrefix;

    for (const row of result.rows as any[]) {
      logger.debug({
        action: "process_param",
        function: "getCurrentStrategyParams",
        key: row.key,
        message: "处理参数",
      });
      try {
        const value = JSON.parse(row.value);
        response += `\n${row.key}：${JSON.stringify(value, null, 2)}\n描述：${
          row.description || "无"
        }\n`;
      } catch (e) {
        response += `\n${row.key}：${row.value}\n描述：${
          row.description || "无"
        }\n`;
      }
    }

    logger.info({
      action: "tool_success",
      function: "getCurrentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "成功获取策略参数",
      rowCount: result.rows.length,
    });
    return response;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "getCurrentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "获取当前策略参数失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `获取当前策略参数失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function getCurrentStrategyParams(
  strategy: TradingStrategy,
  symbol?: string
): Promise<string> {
  return await _getCurrentStrategyParams(strategy, symbol);
}

/**
 * 导出为工具，供Agent使用
 */
export const getCurrentStrategyParamsTool = createTool({
  name: "getCurrentStrategyParams",
  description: "获取当前策略参数",
  parameters: z.object({
    symbol: z
      .enum(RISK_PARAMS.TRADING_SYMBOLS)
      .optional()
      .describe("可选，交易币种（如BTC、ETH），不提供则获取所有币种参数"),
  }),
  execute: async ({ symbol }) => {
    // 使用默认策略，因为策略参数是Agent动态设置的
    const strategy = "balanced" as TradingStrategy;
    return await _getCurrentStrategyParams(strategy, symbol);
  },
});

/**
 * 内部核心函数：重置策略参数到默认值
 */
async function _resetStrategyParams(
  strategy: TradingStrategy,
  symbol?: string
): Promise<string> {
  try {
    logger.info({
      action: "tool_call",
      function: "resetStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "调用重置策略参数工具",
    });

    logger.debug({
      action: "db_use_pool",
      function: "resetStrategyParams",
      message: "使用数据库连接池",
    });

    let sql = "DELETE FROM strategy_params WHERE strategy = ?";
    const args: any[] = [strategy];

    // 如果指定了币种，只重置该币种的参数
    if (symbol) {
      sql += " AND (key LIKE ? OR key NOT LIKE '%_%')";
      args.push(`%_${symbol}`);
    }

    logger.debug({
      action: "db_execute",
      function: "resetStrategyParams",
      sql: sql.replace(/\s+/g, " ").trim(),
      args: args.map((arg) =>
        typeof arg === "string" && arg.includes("file:")
          ? arg.replace(/^file:/, "file:***")
          : arg
      ),
      message: "执行数据库删除操作",
    });
    const result = await dbClient.execute(sql, args);

    logger.debug({
      action: "db_execute_result",
      function: "resetStrategyParams",
      affectedRows: result.rowsAffected,
      message: `数据库删除操作完成`,
    });

    const msg = symbol
      ? `✅ Agent成功重置了${strategy}策略下${symbol}的所有参数，现在将使用默认值`
      : `✅ Agent成功重置了${strategy}策略的所有参数，现在将使用默认值`;

    logger.info({
      action: "tool_success",
      function: "resetStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: msg,
      affectedRows: result.rowsAffected,
    });

    return msg;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "resetStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "重置策略参数失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `重置策略参数失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function resetStrategyParams(
  strategy: TradingStrategy,
  symbol?: string
): Promise<string> {
  return await _resetStrategyParams(strategy, symbol);
}

/**
 * 导出为工具，供Agent使用
 */
export const resetStrategyParamsTool = createTool({
  name: "resetStrategyParams",
  description: "重置策略参数到默认值",
  parameters: z.object({
    symbol: z
      .enum(RISK_PARAMS.TRADING_SYMBOLS)
      .optional()
      .describe("可选，交易币种（如BTC、ETH），不提供则重置所有币种参数"),
  }),
  execute: async ({ symbol }) => {
    // 使用默认策略，因为策略参数是Agent动态设置的
    const strategy = "balanced" as TradingStrategy;
    return await _resetStrategyParams(strategy, symbol);
  },
});

/**
 * 内部核心函数：设置动态止损阈值参数
 */
async function _setDynamicStopLossParams(
  strategy: TradingStrategy,
  symbol: string,
  threshold: number,
  evaluationInterval: number = 30,
  conditions?: DynamicStopLossCondition[]
): Promise<string> {
  logger.info({
    action: "tool_call",
    function: "setDynamicStopLossParams",
    strategy,
    symbol,
    params: {
      threshold,
      evaluationInterval,
      conditions: conditions?.length ? `${conditions.length}个条件` : "无",
    },
    message: "调用设置动态止损参数工具",
  });

  try {
    // 负数转正数处理：无论多空，止损阈值必须为正值
    threshold = Math.abs(threshold);
    evaluationInterval = Math.max(0, evaluationInterval);

    // 验证参数有效性
    if (threshold <= 0) {
      throw new Error("止损阈值必须大于0，无论做多还是做空");
    }
    if (evaluationInterval <= 0) {
      throw new Error("评估间隔必须大于0");
    }

    // 验证和转换 conditions 参数
    let processedConditions: DynamicStopLossCondition[] = [];
    if (conditions) {
      // 确保 conditions 是数组
      const conditionsArray = Array.isArray(conditions)
        ? conditions
        : [conditions];

      // 处理每个条件
      for (const condition of conditionsArray) {
        // 确保条件是对象格式
        if (typeof condition === "object" && condition !== null) {
          // 验证条件类型
          const validTypes = ["volatility", "trend", "volume", "price_change"];
          const conditionType = String(condition.type || "").toLowerCase();

          if (validTypes.includes(conditionType)) {
            // 验证条件值
            const value = Number(condition.value);
            if (!isNaN(value) && value >= 0 && value <= 1) {
              processedConditions.push({
                type: conditionType as "volatility" | "trend" | "news",
                value: value,
              });
            }
          }
        }
      }
    }

    logger.debug({
      action: "db_use_pool",
      function: "setDynamicStopLossParams",
      message: "使用数据库连接池",
    });

    // 验证表是否存在
    await verifyStrategyParamsTable();

    const params = {
      threshold,
      evaluationInterval: evaluationInterval * 60 * 1000, // 转换为毫秒
      conditions: processedConditions,
      enabled: true,
      lastEvaluated: new Date().toISOString(),
    };

    // 使用包含币种的key命名规则
    const paramKey = `dynamicStopLoss_${symbol}`;
    logger.debug({
      action: "db_execute",
      function: "setDynamicStopLossParams",
      sql: "INSERT OR REPLACE INTO strategy_params",
      params: { paramKey, strategy },
      message: "执行SQL插入或替换操作",
    });

    const result = await dbClient.execute(
      `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
            VALUES (?, ?, ?, ?, ?)`,
      [
        paramKey,
        JSON.stringify(params),
        strategy,
        new Date().toISOString(),
        `Agent为${symbol}设置的动态止损参数`,
      ]
    );

    logger.debug({
      action: "db_execute_result",
      function: "setDynamicStopLossParams",
      affectedRows: result.rowsAffected,
      message: "SQL执行成功",
    });

    // 验证数据是否已正确存储
    logger.debug({
      action: "db_verify",
      function: "setDynamicStopLossParams",
      params: { paramKey, strategy },
      message: "验证数据是否已正确存储",
    });
    const verifyResult = await dbClient.execute(
      "SELECT key, value FROM strategy_params WHERE strategy = ? AND key = ?",
      [strategy, paramKey]
    );
    logger.debug({
      action: "db_verify_result",
      function: "setDynamicStopLossParams",
      rowCount: verifyResult.rows.length,
      message: `数据验证结果：${verifyResult.rows.length}条记录`,
    });

    const returnMessage = `成功为${symbol}设置${strategy}策略的动态止损参数：
止损阈值：${threshold}%
评估间隔：${evaluationInterval}分钟
触发条件：${conditions ? JSON.stringify(conditions) : "无"}`;

    logger.info({
      action: "tool_success",
      function: "setDynamicStopLossParams",
      strategy,
      symbol,
      message: "工具执行成功",
      result: returnMessage.replace(/\n/g, " "),
    });

    return returnMessage;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "setDynamicStopLossParams",
      strategy,
      symbol,
      message: "工具执行失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `设置动态止损参数失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function setDynamicStopLossParams(
  strategy: TradingStrategy,
  symbol: string,
  threshold: number,
  evaluationInterval: number = 30,
  conditions?: DynamicStopLossCondition[]
): Promise<string> {
  return await _setDynamicStopLossParams(
    strategy,
    symbol,
    threshold,
    evaluationInterval,
    conditions
  );
}

/**
 * 导出为工具，供Agent使用
 */
export const setDynamicStopLossParamsTool = createTool({
  name: "setDynamicStopLossParams",
  description: "设置策略的动态止损阈值参数",
  parameters: z.object({
    symbol: z
      .enum(RISK_PARAMS.TRADING_SYMBOLS)
      .describe("交易币种（如BTC、ETH）"),
    threshold: z.number().describe("止损阈值百分比"),
    evaluationInterval: z.number().default(30).describe("评估间隔（分钟）"),
    conditions: z
      .array(
        z.object({
          type: z.enum(["volatility", "trend", "news"]).describe("条件类型"),
          value: z.number().describe("条件值"),
        })
      )
      .optional()
      .describe("可选，触发条件数组"),
  }),
  execute: async ({
    symbol,
    threshold,
    evaluationInterval = 30,
    conditions,
  }) => {
    // 使用默认策略，因为策略参数是Agent动态设置的
    const strategy = "balanced" as TradingStrategy;
    return await _setDynamicStopLossParams(
      strategy,
      symbol,
      threshold,
      evaluationInterval,
      conditions as DynamicStopLossCondition[] | undefined
    );
  },
});

/**
 * 获取默认策略参数
 * @returns 默认策略参数对象
 */
function getDefaultStrategyParams(): Record<string, any> {
  return {
    partialTakeProfit: {
      stage1: { trigger: 5, closePercent: 30 },
      stage2: { trigger: 10, closePercent: 40 },
      stage3: { trigger: 15, closePercent: 30 },
    },
    peakDrawdownProtectionConfig: {
      enabled: true,
      levels: [
        { drawdownThreshold: 1, closePercent: 30 },
        { drawdownThreshold: 2, closePercent: 50 },
        { drawdownThreshold: 3, closePercent: 100 },
      ],
      minHoldingTime: 5 * 60 * 1000,
      maxClosePercent: 100,
    },
    dynamicStopLoss: {
      threshold: 3,
      evaluationInterval: 30 * 60 * 1000,
      conditions: [],
      enabled: true,
      lastEvaluated: new Date().toISOString(),
    },
  };
}

/**
 * 从数据库读取Agent设置的策略参数 - 内部核心函数
 */
async function _getAgentStrategyParams(
  strategy: TradingStrategy,
  symbol?: string,
  testMode?: "error"
): Promise<Record<string, any>> {
  try {
    logger.info({
      action: "get_agent_params",
      function: "getAgentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      testMode: testMode || "正常模式",
      message: "调用获取Agent策略参数",
    });

    // 测试模式：模拟错误情况
    if (testMode === "error") {
      logger.debug({
        action: "test_mode",
        function: "getAgentStrategyParams",
        message: "进入测试模式，模拟数据库连接错误",
      });
      throw new Error("测试模式：模拟数据库连接失败");
    }

    logger.debug({
      action: "db_use_pool",
      function: "getAgentStrategyParams",
      message: "使用数据库连接池",
    });

    // 验证表是否存在
    await verifyStrategyParamsTable();

    logger.debug({
      action: "db_query",
      function: "getAgentStrategyParams",
      sql: "SELECT key, value FROM strategy_params WHERE strategy = ?",
      args: [strategy],
      message: "执行数据库查询",
    });
    const result = await dbClient.execute(
      "SELECT key, value FROM strategy_params WHERE strategy = ?",
      [strategy]
    );

    logger.debug({
      action: "db_query_result",
      function: "getAgentStrategyParams",
      rowCount: result.rows.length,
      message: `查询结果：${result.rows.length}条记录`,
    });

    // 按币种组织参数，结构：{ [symbol]: { paramType: paramValue, ... }, ... }
    const paramsBySymbol: Record<string, Record<string, any>> = {};
    const defaultParams = getDefaultStrategyParams();

    for (const row of result.rows as any[]) {
      logger.debug({
        action: "process_param",
        function: "getAgentStrategyParams",
        key: row.key,
        message: "处理策略参数",
      });

      try {
        // 尝试解析JSON值
        const value = JSON.parse(row.value);

        // 检查key是否包含币种后缀（如：partialTakeProfit_BTC 或 positionExitStrategy_BTC）
        const keyParts = row.key.split("_");
        if (keyParts.length === 2) {
          // 分币种参数，格式：paramType_symbol
          const [paramType, symbolPart] = keyParts;

          // 初始化该币种的参数对象，如果不存在则使用默认参数
          if (!paramsBySymbol[symbolPart]) {
            paramsBySymbol[symbolPart] = { ...defaultParams };
          }

          // 特殊处理统一工具参数：positionExitStrategy
          if (paramType === "positionExitStrategy") {
            // 解析统一工具参数为各个组件参数
            logger.debug({
              action: "parse_unified_param",
              function: "getAgentStrategyParams",
              symbol: symbolPart,
              paramType,
              message: "解析统一工具参数为各个组件参数",
            });

            // 提取各个组件参数并存储
            if (value.partialTakeProfit) {
              paramsBySymbol[symbolPart]["partialTakeProfit"] =
                value.partialTakeProfit;
              logger.debug({
                action: "store_unified_component",
                function: "getAgentStrategyParams",
                symbol: symbolPart,
                component: "partialTakeProfit",
                message: "存储统一工具参数中的分批止盈组件",
              });
            }
            if (value.dynamicStopLoss) {
              paramsBySymbol[symbolPart]["dynamicStopLoss"] =
                value.dynamicStopLoss;
              logger.debug({
                action: "store_unified_component",
                function: "getAgentStrategyParams",
                symbol: symbolPart,
                component: "dynamicStopLoss",
                message: "存储统一工具参数中的动态止损组件",
              });
            }
            if (value.peakDrawdown) {
              // 将统一工具中的peakDrawdown转换为系统使用的peakDrawdownProtectionConfig格式
              paramsBySymbol[symbolPart]["peakDrawdownProtectionConfig"] = {
                enabled: true,
                levels: [
                  value.peakDrawdown.level1,
                  value.peakDrawdown.level2,
                  value.peakDrawdown.level3,
                ],
                minHoldingTime: value.peakDrawdown.minHoldingTime * 60 * 1000, // 转换为毫秒
                maxClosePercent: 100,
              };
              logger.debug({
                action: "store_unified_component",
                function: "getAgentStrategyParams",
                symbol: symbolPart,
                component: "peakDrawdown",
                message: "存储统一工具参数中的峰值回落组件",
              });
            }
            // 同时存储完整的统一工具参数，便于后续查询
            paramsBySymbol[symbolPart][paramType] = value;
          } else {
            // 存储普通参数，覆盖默认值
            paramsBySymbol[symbolPart][paramType] = value;
            logger.debug({
              action: "param_store",
              function: "getAgentStrategyParams",
              symbol: symbolPart,
              paramType,
              message: `成功解析并存储参数`,
            });
          }
        } else {
          // 全局参数（不带币种后缀）
          paramsBySymbol["global"] = paramsBySymbol["global"] || {
            ...defaultParams,
          };
          paramsBySymbol["global"][row.key] = value;
          logger.debug({
            action: "param_store",
            function: "getAgentStrategyParams",
            symbol: "global",
            paramType: row.key,
            message: `成功解析并存储全局参数`,
          });
        }
      } catch (e) {
        // 无法解析JSON，作为字符串处理
        logger.debug({
          action: "param_parse_error",
          function: "getAgentStrategyParams",
          key: row.key,
          message: "无法解析参数值，作为字符串处理",
        });

        const keyParts = row.key.split("_");
        if (keyParts.length === 2) {
          const [paramType, symbolPart] = keyParts;
          if (!paramsBySymbol[symbolPart]) {
            paramsBySymbol[symbolPart] = { ...defaultParams };
          }
          paramsBySymbol[symbolPart][paramType] = row.value;
        } else {
          paramsBySymbol["global"] = paramsBySymbol["global"] || {
            ...defaultParams,
          };
          paramsBySymbol["global"][row.key] = row.value;
        }
      }
    }

    // 如果没有找到任何参数，添加默认参数
    if (result.rows.length === 0) {
      logger.info({
        action: "use_default_params",
        function: "getAgentStrategyParams",
        strategy,
        message: "未找到策略参数，使用默认参数初始化",
      });
      // 为所有交易币种添加默认参数
      const { RISK_PARAMS } = await import("../config/riskParams");
      const tradingSymbols = RISK_PARAMS.TRADING_SYMBOLS;

      // 为每个交易币种添加默认参数
      tradingSymbols.forEach((sym) => {
        paramsBySymbol[sym] = { ...defaultParams };
      });

      // 同时保留global默认参数，用于未指定币种的情况
      paramsBySymbol["global"] = defaultParams;

      logger.info({
        action: "default_params_init",
        function: "getAgentStrategyParams",
        strategy,
        symbols: tradingSymbols.join(", "),
        message: "已为所有交易币种初始化默认参数",
      });
    }

    // 构建最终返回结果：按币种组织的参数
    const finalParams = { ...paramsBySymbol };

    // 精简日志输出，只保留关键信息
    logger.debug({
      action: "params_processed",
      function: "getAgentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      queryResultCount: result.rows.length,
      returnedSymbolsCount: Object.keys(finalParams).length,
      message: "参数处理完成",
    });

    logger.info({
      action: "success",
      function: "getAgentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      returnedSymbolsCount: Object.keys(finalParams).length,
      message: "成功读取策略参数",
    });

    return finalParams;
  } catch (error) {
    logger.error({
      action: "error",
      function: "getAgentStrategyParams",
      strategy,
      symbol: symbol || "所有币种",
      message: "获取策略参数失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    // 发生错误时返回按币种组织的默认参数结构，保持一致性
    try {
      const defaultParams = getDefaultStrategyParams();
      const paramsBySymbol: Record<string, Record<string, any>> = {};

      // 获取所有交易币种
      const { RISK_PARAMS } = await import("../config/riskParams");
      const tradingSymbols = RISK_PARAMS.TRADING_SYMBOLS;

      // 为每个交易币种添加默认参数
      tradingSymbols.forEach((sym) => {
        paramsBySymbol[sym] = { ...defaultParams };
      });

      // 同时保留global默认参数，用于未指定币种的情况
      paramsBySymbol["global"] = defaultParams;

      logger.info({
        action: "error_recovery",
        function: "getAgentStrategyParams",
        strategy,
        symbols: tradingSymbols.join(", "),
        message: "已在错误情况下为所有交易币种初始化默认参数",
      });

      return paramsBySymbol;
    } catch (importError) {
      // 如果获取交易币种失败，至少返回一个包含global默认参数的结构
      const defaultParams = getDefaultStrategyParams();
      logger.debug({
        action: "import_error_recovery",
        function: "getAgentStrategyParams",
        strategy,
        message: "获取交易币种失败，返回全局默认参数",
      });
      return { global: defaultParams };
    }
  }
}

/**
 * 从数据库读取Agent设置的策略参数 - 导出为普通函数，供代码直接调用
 */
export async function getAgentStrategyParams(
  strategy: TradingStrategy,
  symbol?: string,
  testMode?: "error"
): Promise<Record<string, any>> {
  return await _getAgentStrategyParams(strategy, symbol, testMode);
}

/**
 * 从数据库读取Agent设置的策略参数 - 导出为工具，供Agent使用
 */
export const getAgentStrategyParamsTool = createTool({
  name: "getAgentStrategyParams",
  description: "从数据库读取Agent设置的策略参数",
  parameters: z.object({
    symbol: z
      .enum(RISK_PARAMS.TRADING_SYMBOLS)
      .optional()
      .describe(
        "可选，交易币种（如BTC、ETH），用于将对应币种的参数扁平化为直接可用格式"
      ),
    testMode: z
      .enum(["error"])
      .optional()
      .describe("可选，测试模式，用于模拟错误情况"),
  }),
  execute: async ({ symbol, testMode }) => {
    // 使用默认策略，因为策略参数是Agent动态设置的
    const strategy = "balanced" as TradingStrategy;
    return await _getAgentStrategyParams(strategy, symbol, testMode);
  },
});

/**
 * 内部核心函数：设置仓位退出策略参数
 */
async function _setPositionExitStrategy(
  strategy: TradingStrategy,
  symbol: string,
  strategyType: "partialTakeProfit" | "peakDrawdown" | "combination",
  enabled: boolean,
  partialTakeProfit?: PartialTakeProfitParams,
  dynamicStopLoss?: DynamicStopLossParams,
  peakDrawdown?: PeakDrawdownParams
): Promise<string> {
  logger.info({
    action: "tool_call",
    function: "setPositionExitStrategy",
    strategy,
    symbol,
    params: {
      strategyType,
      enabled,
      partialTakeProfit,
      dynamicStopLoss,
      peakDrawdown,
    },
    message: "调用设置仓位退出策略参数工具",
  });

  try {
    // 统一工具调用系统检查
    logger.debug({
      action: "system_check",
      function: "setPositionExitStrategy",
      message: "开始统一工具调用系统检查",
    });

    // 1. 验证策略类型有效性
    const validStrategyTypes: Array<
      "partialTakeProfit" | "peakDrawdown" | "combination"
    > = ["partialTakeProfit", "peakDrawdown", "combination"];
    if (!validStrategyTypes.includes(strategyType)) {
      throw new Error(
        `无效的策略类型：${strategyType}，必须是 ${validStrategyTypes.join(
          ", "
        )} 之一`
      );
    }

    // 2. 验证组件完整性（根据策略类型）
    logger.debug({
      action: "validate_components",
      function: "setPositionExitStrategy",
      strategyType,
      hasPartialTakeProfit: !!partialTakeProfit,
      hasDynamicStopLoss: !!dynamicStopLoss,
      hasPeakDrawdown: !!peakDrawdown,
      message: "开始验证组件完整性",
    });

    if (strategyType === "combination") {
      // 组合策略必须包含所有三个组件
      const missingComponents = [];
      if (!partialTakeProfit) missingComponents.push("分批止盈");
      if (!dynamicStopLoss) missingComponents.push("动态止损");
      if (!peakDrawdown) missingComponents.push("峰值回落");

      if (missingComponents.length > 0) {
        logger.error({
          action: "validate_components_error",
          function: "setPositionExitStrategy",
          strategyType,
          missingComponents,
          receivedParams: { partialTakeProfit, dynamicStopLoss, peakDrawdown },
          message: `组合策略缺少必要组件: ${missingComponents.join("、")}`,
        });
        throw new Error(
          `❌ 组合策略必须包含${missingComponents.join("、")}配置。\n` +
            `📌 接收到的参数：\n` +
            `- 分批止盈：${partialTakeProfit ? "已配置" : "未配置"}\n` +
            `- 动态止损：${dynamicStopLoss ? "已配置" : "未配置"}\n` +
            `- 峰值回落：${peakDrawdown ? "已配置" : "未配置"}\n` +
            `📌 请检查工具调用的JSON格式是否正确：\n` +
            `- 确保所有组件都是顶层字段\n` +
            `- 检查括号是否正确匹配\n` +
            `- 确保组件名称拼写正确\n` +
            `- 示例格式：{\"strategyType\":\"combination\",\"enabled\":true,\"partialTakeProfit\":{...},\"dynamicStopLoss\":{...},\"peakDrawdown\":{...}}`
        );
      }
    } else if (strategyType === "partialTakeProfit") {
      // 分批止盈策略至少需要分批止盈配置
      if (!partialTakeProfit) {
        logger.error({
          action: "validate_components_error",
          function: "setPositionExitStrategy",
          strategyType,
          receivedParams: { partialTakeProfit },
          message: "分批止盈策略缺少partialTakeProfit组件",
        });
        throw new Error(
          `❌ 分批止盈策略必须包含分批止盈配置。\n` +
            `📌 接收到的参数：\n` +
            `- 分批止盈：${partialTakeProfit ? "已配置" : "未配置"}\n` +
            `📌 请检查工具调用的JSON格式是否正确，特别是括号是否匹配。\n` +
            `- 示例格式：{\"strategyType\":\"partialTakeProfit\",\"enabled\":true,\"partialTakeProfit\":{...}}`
        );
      }
    } else if (strategyType === "peakDrawdown") {
      // 峰值回落策略至少需要峰值回落配置
      if (!peakDrawdown) {
        logger.error({
          action: "validate_components_error",
          function: "setPositionExitStrategy",
          strategyType,
          receivedParams: { peakDrawdown },
          message: "峰值回落策略缺少peakDrawdown组件",
        });
        throw new Error(
          `❌ 峰值回落策略必须包含峰值回落配置。\n` +
            `📌 接收到的参数：\n` +
            `- 峰值回落：${peakDrawdown ? "已配置" : "未配置"}\n` +
            `📌 请检查工具调用的JSON格式是否正确，特别是括号是否匹配。\n` +
            `- 示例格式：{\"strategyType\":\"peakDrawdown\",\"enabled\":true,\"peakDrawdown\":{...}}`
        );
      }
    }

    logger.debug({
      action: "validate_components_success",
      function: "setPositionExitStrategy",
      strategyType,
      message: "组件完整性验证通过",
    });

    // 3. 验证参数有效性
    if (partialTakeProfit) {
      // 验证分批止盈参数
      if (!partialTakeProfit.stage1 || !partialTakeProfit.stage2) {
        throw new Error("分批止盈配置至少需要包含两个阶段");
      }
      // 验证触发阈值递增
      if (
        partialTakeProfit.stage2.trigger <= partialTakeProfit.stage1.trigger
      ) {
        throw new Error("第二阶段触发阈值必须大于第一阶段");
      }
      if (
        partialTakeProfit.stage3 &&
        partialTakeProfit.stage3.trigger <= partialTakeProfit.stage2.trigger
      ) {
        throw new Error("第三阶段触发阈值必须大于第二阶段");
      }
      // 验证平仓百分比合理
      const totalClosePercent =
        (partialTakeProfit.stage1.closePercent || 0) +
        (partialTakeProfit.stage2.closePercent || 0) +
        (partialTakeProfit.stage3?.closePercent || 0);
      if (totalClosePercent > 100) {
        throw new Error("分批止盈总平仓百分比不能超过100%");
      }
    }

    if (dynamicStopLoss) {
      // 验证动态止损参数
      if (dynamicStopLoss.initialStopLoss <= 0) {
        throw new Error("初始止损幅度必须大于0");
      }
      if (dynamicStopLoss.trailingStopLoss) {
        const { trailingStopLoss } = dynamicStopLoss;
        if (trailingStopLoss.level1 && trailingStopLoss.level1.trigger <= 0) {
          throw new Error("移动止损触发阈值必须大于0");
        }
      }
    }

    if (peakDrawdown) {
      // 验证峰值回落参数
      if (!peakDrawdown.level1 || !peakDrawdown.level2) {
        throw new Error("峰值回落配置至少需要包含两个级别");
      }
      // 验证回落阈值递增
      if (
        peakDrawdown.level2.drawdownThreshold <=
        peakDrawdown.level1.drawdownThreshold
      ) {
        throw new Error("第二级回落阈值必须大于第一级");
      }
      if (
        peakDrawdown.level3 &&
        peakDrawdown.level3.drawdownThreshold <=
          peakDrawdown.level2.drawdownThreshold
      ) {
        throw new Error("第三级回落阈值必须大于第二级");
      }
      // 验证最小持仓时间合理
      if (
        peakDrawdown.minHoldingTime < 1 ||
        peakDrawdown.minHoldingTime > 1440
      ) {
        throw new Error("最小持仓时间必须在1-1440分钟之间");
      }
    }

    // 4. 验证数据库连接和表状态
    logger.debug({
      action: "db_check",
      function: "setPositionExitStrategy",
      message: "检查数据库连接和表状态",
    });
    await verifyStrategyParamsTable();

    // 5. 验证币种有效性
    if (!RISK_PARAMS.TRADING_SYMBOLS.includes(symbol as any)) {
      logger.warn({
        action: "symbol_validation_warning",
        function: "setPositionExitStrategy",
        symbol,
        message: "币种不在默认交易对列表中，但仍允许设置",
      });
    }

    logger.debug({
      action: "system_check_passed",
      function: "setPositionExitStrategy",
      message: "统一工具调用系统检查通过",
    });

    // 构建参数对象
    const params: PositionExitStrategyParams & { lastUpdated: string } = {
      strategyType,
      enabled,
      ...(partialTakeProfit && { partialTakeProfit }),
      ...(dynamicStopLoss && { dynamicStopLoss }),
      ...(peakDrawdown && { peakDrawdown }),
      lastUpdated: new Date().toISOString(),
    };

    // 使用包含币种的key命名规则
    const paramKey = `positionExitStrategy_${symbol}`;
    logger.debug({
      action: "db_execute",
      function: "setPositionExitStrategy",
      sql: "INSERT OR REPLACE INTO strategy_params",
      params: { paramKey, strategy },
      message: "执行SQL插入或替换操作",
    });

    const result = await dbClient.execute(
      `INSERT OR REPLACE INTO strategy_params (key, value, strategy, updated_at, description) 
            VALUES (?, ?, ?, ?, ?)`,
      [
        paramKey,
        JSON.stringify(params),
        strategy,
        new Date().toISOString(),
        `Agent为${symbol}设置的仓位退出策略`,
      ]
    );

    logger.debug({
      action: "db_execute_result",
      function: "setPositionExitStrategy",
      affectedRows: result.rowsAffected,
      message: "SQL执行成功",
    });

    // 验证数据是否已正确存储
    logger.debug({
      action: "db_verify",
      function: "setPositionExitStrategy",
      params: { paramKey, strategy },
      message: "验证数据是否已正确存储",
    });
    const verifyResult = await dbClient.execute(
      "SELECT key, value FROM strategy_params WHERE strategy = ? AND key = ?",
      [strategy, paramKey]
    );
    logger.debug({
      action: "db_verify_result",
      function: "setPositionExitStrategy",
      rowCount: verifyResult.rows.length,
      message: `数据验证结果：${verifyResult.rows.length}条记录`,
    });

    // 验证存储的数据结构完整性
    if (verifyResult.rows.length > 0) {
      const storedParams = JSON.parse(verifyResult.rows[0].value as string);
      logger.debug({
        action: "data_structure_verify",
        function: "setPositionExitStrategy",
        storedParams: storedParams,
        message: "验证存储的数据结构完整性",
      });
    }

    const returnMessage = `成功为${symbol}设置${strategy}策略的仓位退出策略：
策略类型：${strategyType}
启用状态：${enabled ? "启用" : "禁用"}
分批止盈：${partialTakeProfit ? "已配置" : "未配置"}
动态止损：${dynamicStopLoss ? "已配置" : "未配置"}
峰值回落：${peakDrawdown ? "已配置" : "未配置"}`;

    logger.info({
      action: "tool_success",
      function: "setPositionExitStrategy",
      strategy,
      symbol,
      message: "工具执行成功",
      result: returnMessage.replace(/\n/g, " "),
    });

    return returnMessage;
  } catch (error) {
    logger.error({
      action: "tool_error",
      function: "setPositionExitStrategy",
      strategy,
      symbol,
      message: "工具执行失败",
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    return `设置仓位退出策略失败: ${(error as Error).message}`;
  }
}

/**
 * 导出为普通函数，供代码直接调用
 */
export async function setPositionExitStrategy(
  strategy: TradingStrategy,
  symbol: string,
  strategyType: "partialTakeProfit" | "peakDrawdown" | "combination",
  enabled: boolean,
  partialTakeProfit?: PartialTakeProfitParams,
  dynamicStopLoss?: DynamicStopLossParams,
  peakDrawdown?: PeakDrawdownParams
): Promise<string> {
  return await _setPositionExitStrategy(
    strategy,
    symbol,
    strategyType,
    enabled,
    partialTakeProfit,
    dynamicStopLoss,
    peakDrawdown
  );
}

/**
 * 导出为工具，供Agent使用
 */
export const setPositionExitStrategyTool = createTool({
  name: "setPositionExitStrategy",
  description:
    "设置策略的仓位退出策略，完整包含分批止盈、动态止损和峰值回落三个核心组件",
  parameters: z.object({
    symbol: z
      .enum(RISK_PARAMS.TRADING_SYMBOLS)
      .describe("交易币种（如BTC、ETH）"),
    strategyType: z
      .enum(["partialTakeProfit", "peakDrawdown", "combination"])
      .describe(
        "策略类型：partialTakeProfit（分批止盈）、peakDrawdown（峰值回落）、combination（组合策略）"
      ),
    enabled: z.boolean().describe("是否启用该策略"),
    partialTakeProfit: z
      .object({
        stage1: z.object({
          trigger: z.number().describe("第一阶段止盈触发阈值（百分比）"),
          closePercent: z.number().describe("第一阶段平仓百分比"),
        }),
        stage2: z.object({
          trigger: z.number().describe("第二阶段止盈触发阈值（百分比）"),
          closePercent: z.number().describe("第二阶段平仓百分比"),
        }),
        stage3: z.object({
          trigger: z.number().describe("第三阶段止盈触发阈值（百分比）"),
          closePercent: z.number().describe("第三阶段平仓百分比"),
        }),
      })
      .optional()
      .describe("可选，分批止盈配置"),
    dynamicStopLoss: z
      .object({
        enabled: z.boolean().describe("是否启用动态止损"),
        initialStopLoss: z.number().describe("初始止损幅度（百分比）"),
        trailingStopLoss: z.object({
          level1: z.object({
            trigger: z
              .number()
              .describe("第一阶段移动止损触发阈值（百分比盈利）"),
            stopAt: z.number().describe("第一阶段移动止损位置（百分比盈利）"),
          }),
          level2: z.object({
            trigger: z
              .number()
              .describe("第二阶段移动止损触发阈值（百分比盈利）"),
            stopAt: z.number().describe("第二阶段移动止损位置（百分比盈利）"),
          }),
          level3: z.object({
            trigger: z
              .number()
              .describe("第三阶段移动止损触发阈值（百分比盈利）"),
            stopAt: z.number().describe("第三阶段移动止损位置（百分比盈利）"),
          }),
        }),
      })
      .optional()
      .describe("可选，动态止损配置"),
    peakDrawdown: z
      .object({
        level1: z.object({
          drawdownThreshold: z
            .number()
            .describe("第一级回落触发阈值（百分比）"),
          closePercent: z.number().describe("第一级平仓百分比"),
        }),
        level2: z.object({
          drawdownThreshold: z
            .number()
            .describe("第二级回落触发阈值（百分比）"),
          closePercent: z.number().describe("第二级平仓百分比"),
        }),
        level3: z.object({
          drawdownThreshold: z
            .number()
            .describe("第三级回落触发阈值（百分比）"),
          closePercent: z.number().describe("第三级平仓百分比"),
        }),
        minHoldingTime: z.number().default(5).describe("最小持仓时间（分钟）"),
      })
      .optional()
      .describe("可选，峰值回落配置"),
  }),
  execute: async ({
    symbol,
    strategyType,
    enabled,
    partialTakeProfit,
    dynamicStopLoss,
    peakDrawdown,
  }) => {
    // 使用默认策略，因为策略参数是Agent动态设置的
    const strategy = "balanced" as TradingStrategy;
    return await _setPositionExitStrategy(
      strategy,
      symbol,
      strategyType,
      enabled,
      partialTakeProfit,
      dynamicStopLoss,
      peakDrawdown
    );
  },
});
