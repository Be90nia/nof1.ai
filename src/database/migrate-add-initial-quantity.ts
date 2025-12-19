/**
 * open-nof1.ai - AI 加密货币自动交易系统
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * 数据库迁移：添加 initial_quantity 字段
 * 用于存储初始开仓数量，金字塔加仓时基于此数量计算
 */

import { dbClient } from "./dbClient.js";
import { createLogger } from "../utils/loggerUtils.js";

const logger = createLogger({
	name: "db-migration-initial-quantity",
	level: "info",
});

async function migrate() {
	try {
		logger.info({
			action: "migration_start",
			message: "开始添加 initial_quantity 字段",
		});

		// 检查字段是否已存在
		const tableInfo = await dbClient.execute("PRAGMA table_info(positions)");

		const fieldExists = tableInfo.rows.some(
			(row: any) => row.name === "initial_quantity",
		);

		if (!fieldExists) {
			// 添加字段
			await dbClient.execute(
				"ALTER TABLE positions ADD COLUMN initial_quantity REAL",
			);

			logger.info({
				action: "field_added",
				message: "initial_quantity 字段添加成功",
			});

			// 为现有持仓设置初始值（使用当前数量）
			await dbClient.execute(
				"UPDATE positions SET initial_quantity = quantity WHERE initial_quantity IS NULL",
			);

			logger.info({
				action: "data_migrated",
				message: "已为现有持仓设置 initial_quantity",
			});
		} else {
			logger.info({
				action: "migration_skip",
				message: "initial_quantity 字段已存在，跳过迁移",
			});
		}

		logger.info({
			action: "migration_complete",
			message: "数据库迁移完成",
		});
	} catch (error) {
		logger.error({
			action: "migration_error",
			error: (error as Error).message,
			stack: (error as Error).stack,
		});
		throw error;
	}
}

migrate()
	.then(() => {
		logger.info("迁移脚本执行成功");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("迁移脚本执行失败", error);
		process.exit(1);
	});
