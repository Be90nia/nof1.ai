/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { dbClient } from "./dbClient.js";
import { createLogger } from "../utils/loggerUtils.js";

const logger = createLogger({
  name: "migrate-add-position",
  level: "info",
});

/**
 * 加仓功能数据库迁移脚本
 * 为现有持仓数据初始化加仓相关字段
 */
export async function migrateAddPositionFields(): Promise<void> {
  try {
    logger.info("开始执行加仓功能数据库迁移...");

    // 1. 检查数据库版本
    const versionResult = await dbClient.execute(
      "SELECT version FROM database_version ORDER BY id DESC LIMIT 1"
    );

    const currentVersion =
      versionResult.rows.length > 0
        ? (versionResult.rows[0].version as number)
        : 1;

    if (currentVersion >= 2) {
      logger.info("数据库已是最新版本，无需迁移");
      return;
    }

    // 2. 检查是否已存在加仓字段
    const tableInfo = await dbClient.execute("PRAGMA table_info(positions)");
    const existingColumns = tableInfo.rows.map((row: any) => row.name);

    const requiredColumns = [
      "add_position_count",
      "average_entry_price",
      "last_add_position_time",
      "total_add_amount_usdt",
      "add_position_history",
      "caisen_seven_segment_level",
      "caisen_timeframe_confirmation_score",
      "caisen_ai_risk_adjustment_factor",
    ];

    // 3. 添加缺失的字段
    for (const column of requiredColumns) {
      if (!existingColumns.includes(column)) {
        let columnDef = "";
        switch (column) {
          case "add_position_count":
            columnDef = "INTEGER DEFAULT 0";
            break;
          case "average_entry_price":
            columnDef = "REAL";
            break;
          case "last_add_position_time":
            columnDef = "TEXT";
            break;
          case "total_add_amount_usdt":
            columnDef = "REAL DEFAULT 0";
            break;
          case "add_position_history":
            columnDef = "TEXT";
            break;
          case "caisen_seven_segment_level":
            columnDef = "INTEGER";
            break;
          case "caisen_timeframe_confirmation_score":
            columnDef = "REAL";
            break;
          case "caisen_ai_risk_adjustment_factor":
            columnDef = "REAL";
            break;
        }

        await dbClient.execute(`ALTER TABLE positions ADD COLUMN ${column} ${columnDef}`);
        logger.info(`成功添加字段: ${column}`);
      }
    }

    // 4. 为现有持仓数据初始化加仓字段
    const positions = await dbClient.execute("SELECT * FROM positions");

    for (const position of positions.rows) {
      const positionId = position.id as number;
      const entryPrice = position.entry_price as number;
      const averageEntryPrice = position.average_entry_price as number | null;

      // 如果average_entry_price为空，使用entry_price作为初始值
      if (!averageEntryPrice) {
        await dbClient.execute({
          sql: `UPDATE positions 
                SET average_entry_price = ?,
                    add_position_count = 0,
                    total_add_amount_usdt = 0,
                    add_position_history = '[]'
                WHERE id = ?`,
          args: [entryPrice, positionId],
        });
      }
    }

    logger.info(`成功初始化${positions.rows.length}个持仓的加仓字段`);

    // 5. 更新数据库版本
    await dbClient.execute({
      sql: `INSERT INTO database_version (version, migration_name, applied_at, description)
            VALUES (?, ?, ?, ?)`,
      args: [
        2,
        "add_position_migration",
        new Date().toISOString(),
        "加仓功能数据库迁移",
      ],
    });

    logger.info("加仓功能数据库迁移完成");
  } catch (error) {
    logger.error("数据库迁移失败:", error as any);
    throw error;
  }
}

// 如果直接运行此脚本，执行迁移
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAddPositionFields()
    .then(() => {
      logger.info("迁移脚本执行完成");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("迁移脚本执行失败:", error);
      process.exit(1);
    });
}
