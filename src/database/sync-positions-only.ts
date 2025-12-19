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
 * 快速同步持仓（不重置数据库）
 * 从交易所同步持仓到本地数据库（支持 Gate.io 和 OKX）
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import {
	createExchangeClient,
	getExchangeType,
} from "../services/exchangeClient";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
	name: "sync-positions",
	level: "info",
});

async function syncPositionsOnly() {
	try {
		const exchangeType = getExchangeType();
		const exchangeName = exchangeType === "okx" ? "OKX" : "Gate.io";
		logger.info(`🔄 从 ${exchangeName} 同步持仓...`);

		// 1. 连接数据库
		const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
		const client = createClient({
			url: dbUrl,
		});

		// 2. 检查表是否存在，不存在则创建
		try {
			await client.execute("SELECT COUNT(*) FROM positions");
			logger.info("✅ 数据库表已存在");
		} catch (error) {
			logger.warn("⚠️  数据库表不存在，正在创建...");
			// 创建必要的表
			await client.execute(`
        CREATE TABLE IF NOT EXISTS positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
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
          entry_order_id TEXT,
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          confidence REAL,
          risk_usd REAL,
          peak_pnl_percent REAL DEFAULT 0,
          partial_close_percentage REAL DEFAULT 0,
          closing_type TEXT,
          batch_params TEXT,
          exit_strategy TEXT
        )
      `);
			logger.info("✅ 数据库表创建完成");
		}

		// 3. 从交易所获取持仓
		const exchangeClient = createExchangeClient();
		const positions = await exchangeClient.getPositions();
		const activePositions = positions.filter(
			(p) => Number.parseInt(p.size || "0") !== 0,
		);

		logger.info(`\n📊 ${exchangeName} 当前持仓数: ${activePositions.length}`);

		// 4. 清空本地持仓表
		await client.execute("DELETE FROM positions");
		logger.info("✅ 已清空本地持仓表");

		// 5. 同步持仓到数据库
		if (activePositions.length > 0) {
			logger.info(`\n🔄 同步 ${activePositions.length} 个持仓到数据库...`);

			for (const pos of activePositions) {
				const size = Number.parseInt(pos.size || "0");
				if (size === 0) continue;

				const symbol = pos.contract.replace("_USDT", "");
				const entryPrice = Number.parseFloat(pos.entryPrice || "0");
				const currentPrice = Number.parseFloat(pos.markPrice || "0");
				const leverage = Number.parseInt(pos.leverage || "1");
				const side = size > 0 ? "long" : "short";
				const quantity = Math.abs(size);
				const pnl = Number.parseFloat(pos.unrealisedPnl || "0");
				const liqPrice = Number.parseFloat(pos.liqPrice || "0");

				// 默认退出策略配置
				const defaultExitStrategy = {
					strategyType: "combination",
					enabled: true,
					partialTakeProfit: {
						stage1: { trigger: 5, closePercent: 30 },
						stage2: { trigger: 10, closePercent: 40 },
						stage3: { trigger: 15, closePercent: 30 },
					},
					dynamicStopLoss: {
						enabled: true,
						trailingStop: {
							level1: { trigger: 5, stopAt: 2 },
							level2: { trigger: 10, stopAt: 5 },
							level3: { trigger: 15, stopAt: 8 },
						},
					},
					peakDrawdown: {
						enabled: true,
						stage1: { drawdownThreshold: 1.0, closePercent: 30 },
						stage2: { drawdownThreshold: 2.0, closePercent: 50 },
						stage3: { drawdownThreshold: 3.0, closePercent: 100 },
					},
				};

				await client.execute({
					sql: `INSERT INTO positions 
                (symbol, quantity, entry_price, current_price, liquidation_price, unrealized_pnl, 
                 leverage, side, entry_order_id, opened_at, exit_strategy, executed_levels)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [
						symbol,
						quantity,
						entryPrice,
						currentPrice,
						liqPrice,
						pnl,
						leverage,
						side,
						"synced",
						new Date().toISOString(),
						JSON.stringify(defaultExitStrategy),
						"[]", // 初始化 executed_levels 为空数组
					],
				});

				logger.info(
					`   ✅ ${symbol}: ${quantity} 张 (${side}) @ ${entryPrice} | 盈亏: ${
						pnl >= 0 ? "+" : ""
					}${pnl.toFixed(2)} USDT`,
				);
			}
		} else {
			logger.info("✅ 当前无持仓");
		}

		client.close();
		logger.info("\n✅ 持仓同步完成");
	} catch (error) {
		logger.error("❌ 同步失败:", error);
		process.exit(1);
	}
}

// 执行同步
syncPositionsOnly();
