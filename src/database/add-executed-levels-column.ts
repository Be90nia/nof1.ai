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
 * 添加已执行阶段字段到positions表
 */

import { createClient } from "@libsql/client";

const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
const dbClient = createClient({
	url: dbUrl,
});

async function addExecutedLevelsColumn() {
	try {
		console.log("开始数据库迁移：添加 executed_levels 字段...");

		// 检查字段是否已存在
		const tableInfo = await dbClient.execute("PRAGMA table_info(positions)");
		const columnExists = tableInfo.rows.some(
			(row: any) => row.name === "executed_levels",
		);

		if (columnExists) {
			console.log("✅ executed_levels 字段已存在，无需迁移");
			return;
		}

		// 添加字段
		await dbClient.execute(`
      ALTER TABLE positions 
      ADD COLUMN executed_levels TEXT DEFAULT '[]'
    `);

		console.log("✅ 成功添加 executed_levels 字段到 positions 表");
		console.log("数据库迁移完成");
	} catch (error: any) {
		console.error("❌ 数据库迁移失败:", error.message);
		process.exit(1);
	} finally {
		await dbClient.close();
	}
}

addExecutedLevelsColumn();
