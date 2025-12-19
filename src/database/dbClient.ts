/**
 * 数据库连接池管理
 * 单例模式，统一管理数据库连接
 * 支持WAL模式和重试机制
 */

import { type Client, createClient } from "@libsql/client";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
	name: "database-client",
	level: "info",
});

interface ExecuteParams {
	sql: string;
	args?: any[];
}

class DBClient {
	private static instance: DBClient;
	private client: Client;
	private isInitialized = false;

	/**
	 * 私有构造函数，防止外部实例化
	 */
	private constructor() {
		const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
		this.client = createClient({
			url: dbUrl,
		});
	}

	/**
	 * 获取单例实例
	 */
	public static getInstance(): DBClient {
		if (!DBClient.instance) {
			DBClient.instance = new DBClient();
		}
		return DBClient.instance;
	}

	/**
	 * 初始化数据库连接，设置WAL模式和其他优化配置
	 */
	private async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			logger.info({ action: "db_init", message: "开始初始化数据库连接" });

			// 启用WAL模式
			await this.client.execute("PRAGMA journal_mode=WAL;");
			logger.debug({ action: "db_config", config: "WAL mode enabled" });

			// 设置繁忙超时时间为5秒
			await this.client.execute("PRAGMA busy_timeout=5000;");
			logger.debug({ action: "db_config", config: "busy_timeout=5000" });

			// 设置缓存大小为20MB（-20000表示20MB）
			await this.client.execute("PRAGMA cache_size=-20000;");
			logger.debug({ action: "db_config", config: "cache_size=-20000" });

			// 启用外键约束
			await this.client.execute("PRAGMA foreign_keys=ON;");
			logger.debug({ action: "db_config", config: "foreign_keys=ON" });

			// 优化同步模式
			await this.client.execute("PRAGMA synchronous=NORMAL;");
			logger.debug({ action: "db_config", config: "synchronous=NORMAL" });

			this.isInitialized = true;
			logger.info({ action: "db_init", message: "数据库连接初始化完成" });
		} catch (error) {
			logger.error({
				action: "db_init_error",
				message: "数据库连接初始化失败",
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
			throw error;
		}
	}

	/**
	 * 带有重试机制的SQL执行方法
	 * @param sqlOrParams SQL语句或包含sql和args的对象
	 * @param args 参数数组（仅当第一个参数是字符串时使用）
	 * @param maxRetries 最大重试次数，默认3次
	 * @param initialDelayMs 初始延迟时间，默认100ms
	 */
	public async execute(
		sqlOrParams: string | ExecuteParams,
		args?: any[],
		maxRetries = 3,
		initialDelayMs = 100,
	): Promise<any> {
		// 确保初始化完成
		await this.initialize();

		// 解析参数
		let sql: string;
		let params: any[] = [];

		if (typeof sqlOrParams === "string") {
			// 传统调用方式：execute(sql, args)
			sql = sqlOrParams;
			params = args || [];
		} else {
			// 对象调用方式：execute({ sql, args })
			if (typeof sqlOrParams.sql !== "string") {
				throw new Error("Invalid SQL type: sql must be a string");
			}
			sql = sqlOrParams.sql;
			params = sqlOrParams.args || [];
		}

		let lastError: Error = new Error("数据库执行失败");

		for (let i = 0; i < maxRetries; i++) {
			try {
				return await this.client.execute({ sql, args: params });
			} catch (error) {
				lastError = error as Error;
				const errorMessage = lastError.message.toLowerCase();

				// 只重试SQLITE_BUSY错误
				if (
					errorMessage.includes("sqlite_busy") ||
					errorMessage.includes("database is locked")
				) {
					logger.warn({
						action: "db_busy_retry",
						message: `数据库繁忙，第${i + 1}次重试...`,
						sql: sql.replace(/\s+/g, " ").trim(),
						retryDelay: initialDelayMs * Math.pow(2, i),
					});

					// 指数退避重试
					await new Promise((resolve) =>
						setTimeout(resolve, initialDelayMs * Math.pow(2, i)),
					);
					continue;
				}

				// 其他错误直接抛出
				logger.error({
					action: "db_execute_error",
					message: "数据库执行失败",
					sql: sql.replace(/\s+/g, " ").trim(),
					error: lastError.message,
					stack: lastError.stack,
				});
				throw error;
			}
		}

		// 超过最大重试次数，抛出错误
		logger.error({
			action: "db_execute_failed_after_retries",
			message: `数据库执行失败，已重试${maxRetries}次`,
			error: lastError.message,
			stack: lastError.stack,
		});
		throw lastError;
	}

	/**
	 * 关闭数据库连接
	 */
	public async close(): Promise<void> {
		try {
			await this.client.close();
			this.isInitialized = false;
			logger.info({ action: "db_close", message: "数据库连接已关闭" });
		} catch (error) {
			logger.error({
				action: "db_close_error",
				message: "关闭数据库连接失败",
				error: (error as Error).message,
				stack: (error as Error).stack,
			});
		}
	}
}

/**
 * 导出单例实例
 */
export const dbClient = DBClient.getInstance();
