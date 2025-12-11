/**
 * 蔡森策略状态管理器
 * 负责管理策略的运行状态、异常事件和等待时间阈值
 */

import { createLogger } from "../../utils/loggerUtils";
import { getChinaTimeISO } from "../../utils/timeUtils";
import { dbClient } from "../../database/dbClient";

const logger = createLogger({ name: "caisen-state-manager", level: "info" });

/**
 * 异常波动等级
 */
export enum VolatilityLevel {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

/**
 * 策略运行状态
 */
export enum StrategyState {
	IDLE = "idle",
	RUNNING = "running",
	PAUSED = "paused",
	ERROR = "error",
}

/**
 * 持仓状态
 */
export enum PositionState {
	NO_POSITION = "no_position",
	HAS_POSITION = "has_position",
}

/**
 * 异常事件类型
 */
export enum EventType {
	PRICE_VOLATILITY = "price_volatility",
	CRASH_DETECTED = "crash_detected",
	RECOVERY_SIGNAL = "recovery_signal",
	PYRAMID_ADD = "pyramid_add",
	STOP_LOSS_TRIGGERED = "stop_loss_triggered",
	TAKE_PROFIT_TRIGGERED = "take_profit_triggered",
}

/**
 * 异常事件接口
 */
export interface ExceptionEvent {
	id: string;
	timestamp: string;
	symbol: string;
	eventType: EventType;
	volatilityLevel: VolatilityLevel;
	description: string;
	data: any;
	processed: boolean;
}

/**
 * 状态管理器配置
 */
export interface StateManagerConfig {
	// 无持仓状态下的扫描间隔（分钟）
	noPositionScanInterval: number;
	// 有持仓状态下的监控间隔（秒）
	hasPositionMonitorInterval: number;
	// 异常监控的基础等待时间（秒）
	baseWaitTime: number;
	// 不同等级异常的等待时间倍数
	volatilityWaitMultipliers: Record<VolatilityLevel, number>;
}

/**
 * 状态管理器类
 */
export class CaiSenStateManager {
	private state: StrategyState = StrategyState.IDLE;
	private positionState: PositionState = PositionState.NO_POSITION;
	private exceptionEvents: Map<string, ExceptionEvent> = new Map();
	private lastWakeTime: number = Date.now();
	private waitTimeThreshold = 0;
	private config: StateManagerConfig;

	constructor(config?: Partial<StateManagerConfig>) {
		// 默认配置
		this.config = {
			noPositionScanInterval: 15, // 15分钟
			hasPositionMonitorInterval: 10, // 10秒
			baseWaitTime: 300, // 5分钟
			volatilityWaitMultipliers: {
				[VolatilityLevel.LOW]: 1,
				[VolatilityLevel.MEDIUM]: 1.5,
				[VolatilityLevel.HIGH]: 2,
				[VolatilityLevel.CRITICAL]: 3,
			},
			...config,
		};

		// 初始化数据库表
		this.initDatabase();

		// 初始化等待时间阈值
		this.resetWaitTimeThreshold();
	}

	/**
	 * 初始化数据库表
	 */
	private async initDatabase(): Promise<void> {
		try {
			// 创建异常事件表
			await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS caisen_exception_events (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          symbol TEXT NOT NULL,
          event_type TEXT NOT NULL,
          volatility_level TEXT NOT NULL,
          description TEXT NOT NULL,
          data TEXT NOT NULL,
          processed BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);

			// 创建状态表
			await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS caisen_strategy_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
		} catch (error) {
			logger.error("初始化数据库失败:", error as any);
		}
	}

	/**
	 * 更新策略运行状态
	 */
	public async updateStrategyState(state: StrategyState): Promise<void> {
		this.state = state;
		await this.persistState("strategy_state", state);
		logger.info(`策略状态更新为: ${state}`);
	}

	/**
	 * 获取策略运行状态
	 */
	public getStrategyState(): StrategyState {
		return this.state;
	}

	/**
	 * 更新持仓状态
	 */
	public async updatePositionState(state: PositionState): Promise<void> {
		this.positionState = state;
		await this.persistState("position_state", state);
		logger.info(`持仓状态更新为: ${state}`);
	}

	/**
	 * 获取持仓状态
	 */
	public getPositionState(): PositionState {
		return this.positionState;
	}

	/**
	 * 获取当前扫描/监控间隔
	 */
	public getCurrentInterval(): number {
		if (this.positionState === PositionState.NO_POSITION) {
			return this.config.noPositionScanInterval * 60 * 1000; // 转换为毫秒
		} else {
			return this.config.hasPositionMonitorInterval * 1000; // 转换为毫秒
		}
	}

	/**
	 * 记录异常事件
	 */
	public async recordExceptionEvent(
		symbol: string,
		eventType: EventType,
		volatilityLevel: VolatilityLevel,
		description: string,
		data: any,
	): Promise<string> {
		const eventId = `event-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;
		const event: ExceptionEvent = {
			id: eventId,
			timestamp: getChinaTimeISO(),
			symbol,
			eventType,
			volatilityLevel,
			description,
			data,
			processed: false,
		};

		// 保存到内存
		this.exceptionEvents.set(eventId, event);

		// 保存到数据库
		try {
			await dbClient.execute({
				sql: `INSERT INTO caisen_exception_events 
              (id, timestamp, symbol, event_type, volatility_level, description, data, created_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					event.id,
					event.timestamp,
					event.symbol,
					event.eventType,
					event.volatilityLevel,
					event.description,
					JSON.stringify(event.data),
					getChinaTimeISO(),
				],
			});
		} catch (error) {
			logger.error("保存异常事件失败:", error as any);
		}

		logger.info(`记录异常事件: ${eventType} - ${volatilityLevel} - ${symbol}`, {
			description,
			data,
		});

		return eventId;
	}

	/**
	 * 标记异常事件为已处理
	 */
	public async markEventAsProcessed(eventId: string): Promise<void> {
		const event = this.exceptionEvents.get(eventId);
		if (event) {
			event.processed = true;
			this.exceptionEvents.set(eventId, event);

			try {
				await dbClient.execute({
					sql: `UPDATE caisen_exception_events SET processed = 1 WHERE id = ?`,
					args: [eventId],
				});
			} catch (error) {
				logger.error("更新事件处理状态失败:", error as any);
			}
		}
	}

	/**
	 * 获取未处理的异常事件
	 */
	public getUnprocessedEvents(): ExceptionEvent[] {
		return Array.from(this.exceptionEvents.values()).filter(
			(event) => !event.processed,
		);
	}

	/**
	 * 检查是否应该唤醒Agent
	 */
	public shouldWakeAgent(): boolean {
		const now = Date.now();
		const timeSinceLastWake = now - this.lastWakeTime;

		// 检查是否超过等待时间阈值
		if (timeSinceLastWake < this.waitTimeThreshold) {
			logger.debug(
				`距离上次唤醒时间 ${timeSinceLastWake}ms，未超过等待阈值 ${this.waitTimeThreshold}ms，跳过唤醒`,
			);
			return false;
		}

		// 检查是否有未处理的异常事件
		const unprocessedEvents = this.getUnprocessedEvents();
		if (unprocessedEvents.length > 0) {
			logger.info(
				`发现 ${unprocessedEvents.length} 个未处理的异常事件，需要唤醒Agent`,
			);
			return true;
		}

		return false;
	}

	/**
	 * 重置等待时间阈值
	 */
	public resetWaitTimeThreshold(): void {
		this.waitTimeThreshold = this.config.baseWaitTime * 1000; // 转换为毫秒
		logger.debug(`重置等待时间阈值为: ${this.waitTimeThreshold}ms`);
	}

	/**
	 * 根据异常等级调整等待时间阈值
	 */
	public adjustWaitTimeByVolatility(volatilityLevel: VolatilityLevel): void {
		const multiplier = this.config.volatilityWaitMultipliers[volatilityLevel];
		this.waitTimeThreshold = this.config.baseWaitTime * multiplier * 1000; // 转换为毫秒
		logger.info(
			`根据异常等级 ${volatilityLevel} 调整等待时间阈值为: ${this.waitTimeThreshold}ms`,
		);
	}

	/**
	 * 重置唤醒时间
	 */
	public resetWakeTime(): void {
		this.lastWakeTime = Date.now();
		logger.debug(`重置唤醒时间为当前时间`);
	}

	/**
	 * 持久化状态到数据库
	 */
	private async persistState(key: string, value: any): Promise<void> {
		try {
			await dbClient.execute({
				sql: `INSERT OR REPLACE INTO caisen_strategy_state 
              (key, value, updated_at) 
              VALUES (?, ?, ?)`,
				args: [key, JSON.stringify(value), getChinaTimeISO()],
			});
		} catch (error) {
			logger.error(`持久化状态失败: ${key}`, error as any);
		}
	}
}
