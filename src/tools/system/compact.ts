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

import fs from "fs";
import path from "path";
import { dbClient } from "../../database/dbClient";

/**
 * 系统清理与优化工具
 */
export class SystemCompactor {
	private retentionDays = 30;

	constructor(retentionDays = 30) {
		this.retentionDays = retentionDays;
	}

	/**
	 * 清理旧交易记录
	 */
	private async cleanupOldTradeRecords(): Promise<void> {
		console.log("🔍 清理旧交易记录...");

		try {
			// 计算截止日期
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
			const cutoffTimestamp = cutoffDate.getTime();

			// 删除旧的交易记录
			const deleteResult = await dbClient.execute({
				sql: `DELETE FROM trades WHERE timestamp < ?`,
				args: [cutoffTimestamp],
			});

			console.log(`✅ 已删除 ${deleteResult.rowsAffected || 0} 条旧交易记录`);

			// 删除旧的位置记录
			const deletePositionsResult = await dbClient.execute({
				sql: `DELETE FROM positions WHERE updated_at < ?`,
				args: [cutoffTimestamp],
			});

			console.log(
				`✅ 已删除 ${deletePositionsResult.rowsAffected || 0} 条旧位置记录`,
			);

			// 删除旧的账户历史记录
			const deleteHistoryResult = await dbClient.execute({
				sql: `DELETE FROM account_history WHERE timestamp < ?`,
				args: [cutoffTimestamp],
			});

			console.log(
				`✅ 已删除 ${deleteHistoryResult.rowsAffected || 0} 条旧账户历史记录`,
			);
		} catch (error) {
			console.error("❌ 清理旧交易记录失败:", error);
			throw error;
		}
	}

	/**
	 * 优化数据库
	 */
	private async optimizeDatabase(): Promise<void> {
		console.log("🔧 优化数据库...");

		try {
			// 获取优化前数据库大小
			const sizeBeforeResult = await dbClient.execute({
				sql: `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`,
			});
			const sizeBefore = sizeBeforeResult.rows[0] as { size: number };

			if (sizeBefore) {
				const sizeInMB = (sizeBefore.size / (1024 * 1024)).toFixed(2);
				console.log(`优化前数据库大小: ${sizeInMB} MB`);
			}

			// 执行 VACUUM 命令来优化数据库
			await dbClient.execute({ sql: "VACUUM" });

			// 获取优化后数据库大小
			const sizeAfterResult = await dbClient.execute({
				sql: `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`,
			});
			const sizeAfter = sizeAfterResult.rows[0] as { size: number };

			if (sizeAfter) {
				const sizeInMB = (sizeAfter.size / (1024 * 1024)).toFixed(2);
				console.log(`优化后数据库大小: ${sizeInMB} MB`);
			}

			console.log("✅ 数据库优化完成");
		} catch (error) {
			console.error("❌ 数据库优化失败:", error);
			throw error;
		}
	}

	/**
	 * 清理日志文件
	 */
	private async cleanupLogFiles(): Promise<void> {
		console.log("🗑️ 清理日志文件...");

		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

		// 清理 PM2 日志
		await this.cleanupDirectory(".pm2/logs", cutoffDate);

		// 清理应用日志
		await this.cleanupDirectory("logs", cutoffDate);

		// 清理系统日志
		await this.cleanupDirectory(".voltagent", cutoffDate, [".log"]);

		console.log("✅ 日志文件清理完成");
	}

	/**
	 * 清理指定目录中的文件
	 */
	private async cleanupDirectory(
		dirPath: string,
		cutoffDate: Date,
		extensions: string[] = [".log"],
	): Promise<void> {
		const fullPath = path.join(process.cwd(), dirPath);

		if (!fs.existsSync(fullPath)) {
			return;
		}

		const files = fs.readdirSync(fullPath);
		let deletedCount = 0;

		for (const file of files) {
			const filePath = path.join(fullPath, file);
			const stat = fs.statSync(filePath);

			if (stat.isFile()) {
				const hasMatchingExtension =
					extensions.length === 0 ||
					extensions.some((ext) => file.endsWith(ext));

				if (hasMatchingExtension && stat.mtime < cutoffDate) {
					fs.unlinkSync(filePath);
					deletedCount++;
				}
			}
		}

		if (deletedCount > 0) {
			console.log(`  - ${dirPath}: 已删除 ${deletedCount} 个文件`);
		}
	}

	/**
	 * 清理缓存和临时文件
	 */
	private async cleanupCacheAndTempFiles(): Promise<void> {
		console.log("🧹 清理缓存和临时文件...");

		// 清理 Node.js 缓存
		const nodeCachePath = path.join(process.cwd(), "node_modules", ".cache");
		if (fs.existsSync(nodeCachePath)) {
			fs.rmSync(nodeCachePath, { recursive: true, force: true });
			console.log("  - Node.js 缓存已清理");
		}

		// 清理 TypeScript 编译缓存
		const distPath = path.join(process.cwd(), "dist");
		if (fs.existsSync(distPath)) {
			fs.rmSync(distPath, { recursive: true, force: true });
			console.log("  - TypeScript 编译缓存已清理");
		}

		// 清理临时文件
		const rootDir = process.cwd();
		const files = fs.readdirSync(rootDir);
		let tempFilesDeleted = 0;

		for (const file of files) {
			const filePath = path.join(rootDir, file);
			const stat = fs.statSync(filePath);

			if (stat.isFile() && (file.endsWith(".tmp") || file === ".DS_Store")) {
				fs.unlinkSync(filePath);
				tempFilesDeleted++;
			}
		}

		if (tempFilesDeleted > 0) {
			console.log(`  - 已删除 ${tempFilesDeleted} 个临时文件`);
		}

		console.log("✅ 缓存和临时文件清理完成");
	}

	/**
	 * 执行完整的系统清理与优化
	 */
	async compact(): Promise<void> {
		console.log(
			"================================================================================",
		);
		console.log("🧹 AI 加密货币自动交易系统 - 系统清理与优化");
		console.log(
			"================================================================================",
		);
		console.log("");
		console.log(`配置参数:`);
		console.log(`  保留天数: ${this.retentionDays} 天`);
		console.log("");

		try {
			// 步骤 1: 清理旧交易记录
			await this.cleanupOldTradeRecords();
			console.log("");

			// 步骤 2: 优化数据库
			await this.optimizeDatabase();
			console.log("");

			// 步骤 3: 清理日志文件
			await this.cleanupLogFiles();
			console.log("");

			// 步骤 4: 清理缓存和临时文件
			await this.cleanupCacheAndTempFiles();
			console.log("");

			console.log(
				"================================================================================",
			);
			console.log("✅ 系统清理与优化完成！");
			console.log(
				"================================================================================",
			);
			console.log("");
			console.log("已完成的操作：");
			console.log("  1. 清理了旧交易记录");
			console.log("  2. 优化了数据库");
			console.log("  3. 清理了日志文件");
			console.log("  4. 清理了缓存和临时文件");
			console.log("");
			console.log("接下来可以：");
			console.log("  npm run trading:start  - 重新启动交易系统");
			console.log("  npm run dev            - 开发模式运行");
			console.log("  npm run docker:start   - Docker 模式运行");
			console.log("");
		} catch (error) {
			console.error("❌ 系统清理与优化失败:", error);
			process.exit(1);
		}
	}
}

// 如果直接运行此脚本，执行清理操作
if (require.main === module) {
	const retentionDays = Number.parseInt(process.argv[2]) || 30;
	const compactor = new SystemCompactor(retentionDays);
	compactor.compact().catch(console.error);
}
