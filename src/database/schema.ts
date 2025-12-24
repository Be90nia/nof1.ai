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
 * 数据库模式定义
 */

export interface Trade {
  id: number;
  order_id: string;
  symbol: string;
  side: "long" | "short";
  type: "open" | "close";
  price: number;
  quantity: number;
  leverage: number;
  pnl?: number;
  fee?: number;
  timestamp: string;
  status: "pending" | "filled" | "cancelled";
}

export interface Position {
  id: number;
  symbol: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  liquidation_price: number;
  unrealized_pnl: number;
  leverage: number;
  side: "long" | "short";
  profit_target?: number;
  stop_loss?: number;
  tp_order_id?: string;
  sl_order_id?: string;
  entry_order_id: string;
  opened_at: string;
  confidence?: number;
  risk_usd?: number;
  peak_pnl_percent?: number; // 历史最高盈亏百分比（考虑杠杆）
  partial_close_percentage?: number; // 已通过分批止盈平掉的百分比 (0-100)

  // 加仓相关字段
  initial_quantity?: number; // 初始开仓数量（用于金字塔加仓计算）
  add_position_count?: number; // 加仓次数
  average_entry_price?: number; // 加权平均成本
  last_add_position_time?: string; // 最后加仓时间
  total_add_amount_usdt?: number; // 总加仓金额(USDT)
  add_position_history?: string; // 加仓历史记录(JSON格式)

  // 蔡森策略专用加仓字段
  caisen_seven_segment_level?: number; // 七分位水平
  caisen_timeframe_confirmation_score?: number; // 时间框架确认分数
  caisen_ai_risk_adjustment_factor?: number; // AI风险调整因子
}

export interface AccountHistory {
  id: number;
  timestamp: string;
  total_value: number;
  available_cash: number;
  unrealized_pnl: number;
  realized_pnl: number;
  return_percent: number;
  sharpe_ratio?: number;
}

export interface TradingSignal {
  id: number;
  symbol: string;
  timestamp: string;
  price: number;
  ema_20: number;
  ema_50?: number;
  macd: number;
  rsi_7: number;
  rsi_14: number;
  volume: number;
  open_interest?: number;
  funding_rate?: number;
  atr_3?: number;
  atr_14?: number;
}

export interface AgentDecision {
  id: number;
  timestamp: string;
  iteration: number;
  market_analysis: string;
  decision: string;
  actions_taken: string;
  account_value: number;
  positions_count: number;
}

export interface SystemConfig {
  id: number;
  key: string;
  value: string;
  updated_at: string;
}

export interface CaiSenMonitorData {
  id: number;
  symbol: string;
  timestamp: number;
  data_type: string;
  data_json: string;
  created_at: string;
}

export interface ExecutionLock {
  id: number;
  lock_key: string;
  is_executing: boolean;
  last_execution_time: number;
  created_at: string;
  updated_at: string;
}

/**
 * 策略参数表 - 存储Agent动态设置的策略参数
 */
export interface StrategyParam {
  id: number;
  key: string;
  value: string;
  strategy: string;
  updated_at: string;
  description?: string;
}

/**
 * SQL 建表语句
 */
export const CREATE_TABLES_SQL = `
-- 交易记录表
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  leverage INTEGER NOT NULL,
  pnl REAL,
  fee REAL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

-- 持仓表
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  current_price REAL NOT NULL,
  liquidation_price REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  leverage INTEGER NOT NULL,
  side TEXT NOT NULL,
  profit_target REAL,
  stop_loss REAL,
  tp_order_id TEXT,
  sl_order_id TEXT,
  entry_order_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  confidence REAL,
  risk_usd REAL,
  peak_pnl_percent REAL DEFAULT 0,
  partial_close_percentage REAL DEFAULT 0,
  closing_type TEXT,
  batch_params TEXT,
  exit_strategy TEXT,
  
  -- 加仓相关字段
  initial_quantity REAL,
  add_position_count INTEGER DEFAULT 0,
  average_entry_price REAL,
  last_add_position_time TEXT,
  total_add_amount_usdt REAL DEFAULT 0,
  add_position_history TEXT,
  
  -- 蔡森策略专用加仓字段
  caisen_seven_segment_level INTEGER,
  caisen_timeframe_confirmation_score REAL,
  caisen_ai_risk_adjustment_factor REAL,
  
  -- 移动止盈已执行级别
  executed_levels TEXT DEFAULT '[]'
);

-- 账户历史表
CREATE TABLE IF NOT EXISTS account_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  total_value REAL NOT NULL,
  available_cash REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  return_percent REAL NOT NULL,
  sharpe_ratio REAL
);

-- 技术指标表
CREATE TABLE IF NOT EXISTS trading_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  price REAL NOT NULL,
  ema_20 REAL NOT NULL,
  ema_50 REAL,
  macd REAL NOT NULL,
  rsi_7 REAL NOT NULL,
  rsi_14 REAL NOT NULL,
  volume REAL NOT NULL,
  open_interest REAL,
  funding_rate REAL,
  atr_3 REAL,
  atr_14 REAL
);

-- Agent 决策记录表
CREATE TABLE IF NOT EXISTS agent_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  market_analysis TEXT NOT NULL,
  decision TEXT NOT NULL,
  actions_taken TEXT NOT NULL,
  account_value REAL NOT NULL,
  positions_count INTEGER NOT NULL
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 策略参数表 - 存储Agent动态设置的策略参数
CREATE TABLE IF NOT EXISTS strategy_params (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  strategy TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  description TEXT,
  UNIQUE(key, strategy)
);

-- 数据库版本管理表
CREATE TABLE IF NOT EXISTS database_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL DEFAULT 1,
  migration_name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  description TEXT
);

-- 蔡森策略监控数据表
CREATE TABLE IF NOT EXISTS cai_sen_monitor_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 执行锁表 - 用于防止关键操作重复执行
CREATE TABLE IF NOT EXISTS execution_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lock_key TEXT NOT NULL UNIQUE,
  is_executing INTEGER NOT NULL DEFAULT 0,
  last_execution_time INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_account_history_timestamp ON account_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_trading_signals_timestamp ON trading_signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_trading_signals_symbol ON trading_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_timestamp ON agent_decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_cai_sen_monitor_timestamp ON cai_sen_monitor_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_cai_sen_monitor_symbol ON cai_sen_monitor_data(symbol);
CREATE INDEX IF NOT EXISTS idx_cai_sen_monitor_type ON cai_sen_monitor_data(data_type);
CREATE INDEX IF NOT EXISTS idx_execution_locks_key ON execution_locks(lock_key);
CREATE INDEX IF NOT EXISTS idx_execution_locks_executing ON execution_locks(is_executing);
`;
