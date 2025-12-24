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
 * 数据库迁移：添加动态止损优化系统表
 *
 * 创建以下表：
 * 1. dynamic_stop_loss_indicators - 动态止损指标数据
 * 2. stop_loss_decisions - 止损决策记录
 * 3. caisen_strategy_results - 蔡森策略分析结果
 * 4. stop_loss_config_history - 止损配置变更历史
 */

import { createLogger } from "../utils/loggerUtils";
import { dbClient } from "./dbClient";

const logger = createLogger({
	name: "db-migration-dynamic-stop-loss",
	level: "info",
});

/**
 * 检查表是否存在
 */
async function tableExists(tableName: string): Promise<boolean> {
	const result = await dbClient.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
		[tableName],
	);
	return result.rows.length > 0;
}

/**
 * 创建 dynamic_stop_loss_indicators 表
 */
async function createDynamicIndicatorsTable(): Promise<void> {
	const tableName = "dynamic_stop_loss_indicators";

	if (await tableExists(tableName)) {
		logger.info({
			action: "table_exists",
			table: tableName,
			message: "表已存在，跳过创建",
		});
		return;
	}

	await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      trend_strength REAL NOT NULL,
      volatility_atr REAL NOT NULL,
      volatility_historical REAL NOT NULL,
      volatility_normalized REAL NOT NULL,
      seven_segment_level INTEGER NOT NULL,
      volume_factor REAL NOT NULL,
      time_decay_factor REAL NOT NULL,
      market_sentiment REAL NOT NULL,
      rsi REAL,
      macd REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// 创建索引
	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_indicators_symbol_timestamp 
    ON ${tableName}(symbol, timestamp)
  `);

	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_indicators_timestamp 
    ON ${tableName}(timestamp)
  `);

	logger.info({
		action: "table_created",
		table: tableName,
		message: "表创建成功",
	});
}

/**
 * 创建 stop_loss_decisions 表
 */
async function createStopLossDecisionsTable(): Promise<void> {
	const tableName = "stop_loss_decisions";

	if (await tableExists(tableName)) {
		logger.info({
			action: "table_exists",
			table: tableName,
			message: "表已存在，跳过创建",
		});
		return;
	}

	await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      position_id TEXT NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      pnl_percent REAL NOT NULL,
      leverage INTEGER NOT NULL,
      base_threshold REAL NOT NULL,
      dynamic_threshold REAL NOT NULL,
      dynamic_factors TEXT NOT NULL,
      decision TEXT NOT NULL,
      ai_judgment TEXT,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// 创建索引
	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_decisions_symbol_timestamp 
    ON ${tableName}(symbol, timestamp)
  `);

	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_decisions_position_id 
    ON ${tableName}(position_id)
  `);

	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_decisions_timestamp 
    ON ${tableName}(timestamp)
  `);

	logger.info({
		action: "table_created",
		table: tableName,
		message: "表创建成功",
	});
}

/**
 * 创建 caisen_strategy_results 表
 */
async function createCaisenStrategyResultsTable(): Promise<void> {
	const tableName = "caisen_strategy_results";

	if (await tableExists(tableName)) {
		logger.info({
			action: "table_exists",
			table: tableName,
			message: "表已存在，跳过创建",
		});
		return;
	}

	await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      daily_trend TEXT NOT NULL,
      hourly_trend TEXT NOT NULL,
      five_minute_trend TEXT NOT NULL,
      multi_timeframe_score REAL NOT NULL,
      support_level REAL,
      resistance_level REAL,
      seven_segment_analysis TEXT,
      trend_consistency REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// 创建索引
	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_caisen_symbol_timestamp 
    ON ${tableName}(symbol, timestamp)
  `);

	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_caisen_timestamp 
    ON ${tableName}(timestamp)
  `);

	logger.info({
		action: "table_created",
		table: tableName,
		message: "表创建成功",
	});
}

/**
 * 创建 stop_loss_config_history 表
 */
async function createConfigHistoryTable(): Promise<void> {
	const tableName = "stop_loss_config_history";

	if (await tableExists(tableName)) {
		logger.info({
			action: "table_exists",
			table: tableName,
			message: "表已存在，跳过创建",
		});
		return;
	}

	await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      config_key TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      changed_by TEXT,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

	// 创建索引
	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_config_history_timestamp 
    ON ${tableName}(timestamp)
  `);

	await dbClient.execute(`
    CREATE INDEX IF NOT EXISTS idx_config_history_key 
    ON ${tableName}(config_key)
  `);

	logger.info({
		action: "table_created",
		table: tableName,
		message: "表创建成功",
	});
}

/**
 * 执行迁移
 */
async function migrate(): Promise<void> {
	try {
		logger.info({
			action: "migration_start",
			message: "开始动态止损系统数据库迁移",
		});

		await createDynamicIndicatorsTable();
		await createStopLossDecisionsTable();
		await createCaisenStrategyResultsTable();
		await createConfigHistoryTable();

		logger.info({
			action: "migration_complete",
			message: "动态止损系统数据库迁移完成",
		});
	} catch (error) {
		logger.error({
			action: "migration_error",
			message: "数据库迁移失败",
			error: (error as Error).message,
			stack: (error as Error).stack,
		});
		throw error;
	}
}

export { migrate };
