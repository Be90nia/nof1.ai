/**
 * 蔡森策略开仓与监控强关联机制
 * CaiSen Strategy Opening and Monitoring Strong Association Mechanism
 *
 * 该模块负责建立开仓操作与监控系统的强关联，确保开仓操作完成后自动触发监控系统启动
 * This module is responsible for establishing a strong association between opening operations and monitoring systems, ensuring that monitoring systems are automatically triggered after opening operations are completed
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "node:events";
import {
	type IExchangeClient,
	createExchangeClient,
} from "../../../services/exchangeClient";
import type { StrategyParams } from "../../../strategies/types";
import { logger } from "../../../utils/loggerUtils";
import {
	CaiSenStandardizedInterface,
	type OpeningMonitoringAssociationStatus,
} from "../../interface/standardized-interface";
import type { CaiSenAiParameterControl } from "../ai-parameter-control";
import type { CaiSenBatchClosingSystem } from "../batch-closing";
import type { CaiSenGapPeriodTakeover } from "../gap-period-takeover";
import type { CaiSenMonitorIndependentSystem } from "../monitor/independent-system";

/**
 * 持仓接口
 * Position Interface
 */
interface Position {
	/** 持仓ID - Position ID */
	id: number;
	/** 交易对 - Trading pair */
	symbol: string;
	/** 持仓数量 - Position quantity */
	quantity: number;
	/** 开仓价格 - Entry price */
	entry_price: number;
	/** 当前价格 - Current price */
	current_price: number;
	/** 强平价格 - Liquidation price */
	liquidation_price: number;
	/** 未实现盈亏 - Unrealized P&L */
	unrealized_pnl: number;
	/** 杠杆倍数 - Leverage */
	leverage: number;
	/** 持仓方向 - Position side */
	side: "long" | "short";
	/** 开仓订单ID - Entry order ID */
	entry_order_id: string;
	/** 开仓时间 - Entry time */
	opened_at: string;
	/** 金字塔加仓次数 - Pyramid add count */
	pyramidAddCount?: number;
	/** 最后加仓时间 - Last add time */
	lastAddTime?: number;
	/** 是否正在分批平仓 - Whether batch closing is in progress */
	batchClosingInProgress?: boolean;
}

/**
 * 开仓状态枚举
 * Opening Status Enumeration
 */
export enum OpeningStatus {
	PENDING = "pending", // 待处理 - Pending
	SUBMITTED = "submitted", // 已提交 - Submitted
	PARTIAL_FILLED = "partial_filled", // 部分成交 - Partially filled
	FILLED = "filled", // 完全成交 - Fully filled
	FAILED = "failed", // 失败 - Failed
	CANCELLED = "cancelled", // 已取消 - Cancelled
}

/**
 * 监控状态枚举
 * Monitoring Status Enumeration
 */
export enum MonitoringStatus {
	INACTIVE = "inactive", // 未激活 - Inactive
	INITIALIZING = "initializing", // 初始化中 - Initializing
	ACTIVE = "active", // 激活 - Active
	PAUSED = "paused", // 暂停 - Paused
	STOPPED = "stopped", // 已停止 - Stopped
	ERROR = "error", // 错误 - Error
}

/**
 * 开仓记录接口
 * Opening Record Interface
 */
export interface OpeningRecord {
	/** 开仓ID - Opening ID */
	openingId: string;

	/** 决策ID - Decision ID */
	decisionId: string;

	/** 策略ID - Strategy ID */
	strategyId: string;

	/** 交易所 - Exchange */
	exchange: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 订单ID - Order ID */
	orderId: string;

	/** 目标数量 - Target quantity */
	targetQuantity: number;

	/** 成交数量 - Filled quantity */
	filledQuantity: number;

	/** 平均成交价格 - Average fill price */
	avgFillPrice: number;

	/** 杠杆倍数 - Leverage */
	leverage: number;

	/** 状态 - Status */
	status: OpeningStatus;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 更新时间 - Update time */
	updatedAt: number;

	/** 完成时间 - Completion time */
	completedAt?: number;

	/** 错误信息 - Error message */
	errorMessage?: string;

	/** 标签 - Tags */
	tags?: string[];
}

/**
 * 监控关联记录接口
 * Monitoring Association Record Interface
 */
export interface MonitoringAssociationRecord {
	/** 关联ID - Association ID */
	associationId: string;

	/** 开仓ID - Opening ID */
	openingId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 监控系统类型 - Monitoring system type */
	monitoringSystemType:
		| "gap_period_takeover"
		| "batch_closing"
		| "ai_parameter_control";

	/** 监控状态 - Monitoring status */
	status: MonitoringStatus;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 更新时间 - Update time */
	updatedAt: number;

	/** 启动时间 - Start time */
	startedAt?: number;

	/** 停止时间 - Stop time */
	stoppedAt?: number;

	/** 错误信息 - Error message */
	errorMessage?: string;

	/** 监控参数 - Monitoring parameters */
	monitoringParams?: Record<string, any>;
}

/**
 * 强关联机制配置接口
 * Strong Association Mechanism Configuration Interface
 */
export interface AssociationConfig {
	/** 是否启用自动监控启动 - Whether to enable automatic monitoring startup */
	enableAutoMonitoringStartup: boolean;

	/** 开仓完成检查间隔 - Opening completion check interval */
	openingCheckInterval: number;

	/** 开仓完成超时时间 - Opening completion timeout */
	openingCompletionTimeout: number;

	/** 监控启动延迟 - Monitoring startup delay */
	monitoringStartupDelay: number;

	/** 是否启用状态同步 - Whether to enable state synchronization */
	enableStateSynchronization: boolean;

	/** 状态同步间隔 - State synchronization interval */
	stateSyncInterval: number;

	/** 是否启用错误恢复 - Whether to enable error recovery */
	enableErrorRecovery: boolean;

	/** 错误恢复重试次数 - Error recovery retry count */
	errorRecoveryRetries: number;

	/** 错误恢复延迟 - Error recovery delay */
	errorRecoveryDelay: number;
}

/**
 * 蔡森策略开仓与监控强关联机制类
 * CaiSen Strategy Opening and Monitoring Strong Association Mechanism Class
 */
export class CaiSenOpeningMonitoringAssociation extends EventEmitter {
	private config: AssociationConfig;
	private exchangeClient: IExchangeClient;
	private strategyConfig: StrategyParams;
	private gapPeriodTakeover: CaiSenGapPeriodTakeover;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: CaiSenAiParameterControl;
	private monitorIndependentSystem: CaiSenMonitorIndependentSystem;

	// 存储记录 - Storage records
	private openingRecords: Map<string, OpeningRecord> = new Map();
	private monitoringAssociations: Map<string, MonitoringAssociationRecord> =
		new Map();

	// 索引 - Indexes
	private openingIdToAssociationId: Map<string, string> = new Map();
	private positionIdToAssociationId: Map<string, string> = new Map();
	private decisionIdToOpeningIds: Map<string, string[]> = new Map();

	// 定时器 - Timers
	private openingCheckTimer: NodeJS.Timeout | null = null;
	private stateSyncTimer: NodeJS.Timeout | null = null;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param config 关联机制配置 - Association mechanism configuration
	 * @param exchangeService 交易所服务 - Exchange service
	 * @param strategyConfig 策略配置 - Strategy configuration
	 * @param gapPeriodTakeover 空窗期接管系统 - Gap period takeover system
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 */
	constructor(
		config: AssociationConfig,
		strategyConfig: StrategyParams,
		gapPeriodTakeover: CaiSenGapPeriodTakeover,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: CaiSenAiParameterControl,
		monitorIndependentSystem: CaiSenMonitorIndependentSystem,
	) {
		super();

		this.config = config;
		this.exchangeClient = createExchangeClient();
		this.strategyConfig = strategyConfig;
		this.gapPeriodTakeover = gapPeriodTakeover;
		this.batchClosingSystem = batchClosingSystem;
		this.aiParameterControl = aiParameterControl;
		this.monitorIndependentSystem = monitorIndependentSystem;

		// 启动定时器 - Start timers
		this.startOpeningCheckTimer();
		this.startStateSyncTimer();

		logger.info("CaiSen Opening Monitoring Association initialized", {
			config,
		});
	}

	/**
	 * 注册开仓操作
	 * Register opening operation
	 *
	 * @param openingId 开仓ID - Opening ID
	 * @param decisionId 决策ID - Decision ID
	 * @param strategyId 策略ID - Strategy ID
	 * @param exchange 交易所 - Exchange
	 * @param symbol 交易对 - Symbol
	 * @param direction 方向 - Direction
	 * @param orderId 订单ID - Order ID
	 * @param targetQuantity 目标数量 - Target quantity
	 * @param leverage 杠杆倍数 - Leverage
	 * @param tags 标签 - Tags
	 * @returns boolean 注册是否成功 - Whether registration was successful
	 */
	registerOpeningOperation(
		openingId: string,
		decisionId: string,
		strategyId: string,
		exchange: string,
		symbol: string,
		direction: "long" | "short",
		orderId: string,
		targetQuantity: number,
		leverage: number,
		tags?: string[],
	): boolean {
		try {
			// 检查是否已存在 - Check if already exists
			if (this.openingRecords.has(openingId)) {
				logger.warn("Opening record already exists", { openingId });
				return false;
			}

			// 创建开仓记录 - Create opening record
			const now = Date.now();
			const openingRecord: OpeningRecord = {
				openingId,
				decisionId,
				strategyId,
				exchange,
				symbol,
				direction,
				orderId,
				targetQuantity,
				filledQuantity: 0,
				avgFillPrice: 0,
				leverage,
				status: OpeningStatus.PENDING,
				createdAt: now,
				updatedAt: now,
				tags,
			};

			// 存储记录 - Store record
			this.openingRecords.set(openingId, openingRecord);

			// 更新决策ID到开仓ID的索引 - Update decision ID to opening ID index
			if (!this.decisionIdToOpeningIds.has(decisionId)) {
				this.decisionIdToOpeningIds.set(decisionId, []);
			}
			this.decisionIdToOpeningIds.get(decisionId)?.push(openingId);

			// 发出开仓注册事件 - Emit opening registration event
			this.emit("openingRegistered", { openingId, openingRecord });

			logger.info("Opening operation registered", {
				openingId,
				decisionId,
				strategyId,
				symbol,
				direction,
				targetQuantity,
				leverage,
			});

			return true;
		} catch (error) {
			logger.error("注册开仓操作时出错", { error, openingId });
			return false;
		}
	}

	/**
	 * 更新开仓状态
	 * Update opening status
	 *
	 * @param openingId 开仓ID - Opening ID
	 * @param status 状态 - Status
	 * @param filledQuantity 成交数量 - Filled quantity
	 * @param avgFillPrice 平均成交价格 - Average fill price
	 * @param errorMessage 错误信息 - Error message
	 * @returns boolean 更新是否成功 - Whether update was successful
	 */
	updateOpeningStatus(
		openingId: string,
		status: OpeningStatus,
		filledQuantity?: number,
		avgFillPrice?: number,
		errorMessage?: string,
	): boolean {
		try {
			const openingRecord = this.openingRecords.get(openingId);
			if (!openingRecord) {
				logger.error("Opening record not found", { openingId });
				return false;
			}

			// 更新记录 - Update record
			openingRecord.status = status;
			openingRecord.updatedAt = Date.now();

			if (filledQuantity !== undefined) {
				openingRecord.filledQuantity = filledQuantity;
			}

			if (avgFillPrice !== undefined) {
				openingRecord.avgFillPrice = avgFillPrice;
			}

			if (errorMessage) {
				openingRecord.errorMessage = errorMessage;
			}

			// 如果状态变为已完成，记录完成时间
			// If status changes to completed, record completion time
			if (
				status === OpeningStatus.FILLED ||
				status === OpeningStatus.FAILED ||
				status === OpeningStatus.CANCELLED
			) {
				openingRecord.completedAt = openingRecord.updatedAt;
			}

			// 发出状态更新事件 - Emit status update event
			this.emit("openingStatusUpdated", { openingId, openingRecord, status });

			// 如果开仓完成，触发监控启动
			// If opening is completed, trigger monitoring startup
			if (
				status === OpeningStatus.FILLED &&
				this.config.enableAutoMonitoringStartup
			) {
				this.scheduleMonitoringStartup(openingId);
			}

			logger.info("开仓状态已更新", {
				openingId,
				status,
				filledQuantity,
				avgFillPrice,
				errorMessage,
			});

			return true;
		} catch (error) {
			logger.error("更新开仓状态时出错", { error, openingId, status });
			return false;
		}
	}

	/**
	 * 创建监控关联
	 * Create monitoring association
	 *
	 * @param openingId 开仓ID - Opening ID
	 * @param positionId 持仓ID - Position ID
	 * @param monitoringSystemType 监控系统类型 - Monitoring system type
	 * @param monitoringParams 监控参数 - Monitoring parameters
	 * @returns string 关联ID - Association ID
	 */
	createMonitoringAssociation(
		openingId: string,
		positionId: string,
		monitoringSystemType: MonitoringAssociationRecord["monitoringSystemType"],
		monitoringParams?: Record<string, any>,
	): string | null {
		try {
			// 检查开仓记录 - Check opening record
			const openingRecord = this.openingRecords.get(openingId);
			if (!openingRecord) {
				logger.error("Opening record not found", { openingId });
				return null;
			}

			// 检查是否已存在关联 - Check if association already exists
			const existingAssociationId =
				this.openingIdToAssociationId.get(openingId);
			if (existingAssociationId) {
				logger.warn("Monitoring association already exists", {
					openingId,
					existingAssociationId,
				});
				return existingAssociationId;
			}

			// 生成关联ID - Generate association ID
			const associationId = `assoc_${openingId}_${Date.now()}`;

			// 创建关联记录 - Create association record
			const now = Date.now();
			const associationRecord: MonitoringAssociationRecord = {
				associationId,
				openingId,
				positionId,
				monitoringSystemType,
				status: MonitoringStatus.INACTIVE,
				createdAt: now,
				updatedAt: now,
				monitoringParams,
			};

			// 存储记录 - Store record
			this.monitoringAssociations.set(associationId, associationRecord);

			// 更新索引 - Update indexes
			this.openingIdToAssociationId.set(openingId, associationId);
			this.positionIdToAssociationId.set(positionId, associationId);

			// 发出关联创建事件 - Emit association creation event
			this.emit("monitoringAssociationCreated", {
				associationId,
				openingId,
				positionId,
				monitoringSystemType,
			});

			logger.info("监控关联已创建", {
				associationId,
				openingId,
				positionId,
				monitoringSystemType,
			});

			return associationId;
		} catch (error) {
			logger.error("创建监控关联时出错", {
				error,
				openingId,
				positionId,
				monitoringSystemType,
			});
			return null;
		}
	}

	/**
	 * 启动监控
	 * Start monitoring
	 *
	 * @param associationId 关联ID - Association ID
	 * @returns boolean 启动是否成功 - Whether startup was successful
	 */
	async startMonitoring(associationId: string): Promise<boolean> {
		try {
			const associationRecord = this.monitoringAssociations.get(associationId);
			if (!associationRecord) {
				logger.error("Monitoring association not found", { associationId });
				return false;
			}

			// 检查状态 - Check status
			if (associationRecord.status !== MonitoringStatus.INACTIVE) {
				logger.warn("无法启动监控，状态不是非活跃", {
					associationId,
					status: associationRecord.status,
				});
				return false;
			}

			// 更新状态为初始化中 - Update status to initializing
			associationRecord.status = MonitoringStatus.INITIALIZING;
			associationRecord.updatedAt = Date.now();

			// 根据监控系统类型启动相应的监控 - Start corresponding monitoring based on monitoring system type
			let success = false;

			switch (associationRecord.monitoringSystemType) {
				case "gap_period_takeover":
					success = await this.startGapPeriodTakeover(associationRecord);
					break;

				case "batch_closing":
					success = await this.startBatchClosing(associationRecord);
					break;

				case "ai_parameter_control":
					success = await this.startAiParameterControl(associationRecord);
					break;

				default:
					logger.error("Unknown monitoring system type", {
						associationId,
						monitoringSystemType: associationRecord.monitoringSystemType,
					});
					return false;
			}

			if (success) {
				// 更新状态为激活 - Update status to active
				associationRecord.status = MonitoringStatus.ACTIVE;
				associationRecord.startedAt = Date.now();
				associationRecord.updatedAt = Date.now();

				// 发出监控启动事件 - Emit monitoring start event
				this.emit("monitoringStarted", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});

				logger.info("监控已启动", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});
			} else {
				// 更新状态为错误 - Update status to error
				associationRecord.status = MonitoringStatus.ERROR;
				associationRecord.updatedAt = Date.now();
				associationRecord.errorMessage = "Failed to start monitoring";

				// 发出监控启动失败事件 - Emit monitoring start failure event
				this.emit("monitoringStartFailed", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});

				logger.error("启动监控失败", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});
			}

			return success;
		} catch (error) {
			// 更新状态为错误 - Update status to error
			const associationRecord = this.monitoringAssociations.get(associationId);
			if (associationRecord) {
				associationRecord.status = MonitoringStatus.ERROR;
				associationRecord.updatedAt = Date.now();
				associationRecord.errorMessage =
					error instanceof Error ? error.message : String(error);
			}

			logger.error("启动监控时出错", { error, associationId });
			return false;
		}
	}

	/**
	 * 停止监控
	 * Stop monitoring
	 *
	 * @param associationId 关联ID - Association ID
	 * @returns boolean 停止是否成功 - Whether stop was successful
	 */
	async stopMonitoring(associationId: string): Promise<boolean> {
		try {
			const associationRecord = this.monitoringAssociations.get(associationId);
			if (!associationRecord) {
				logger.error("Monitoring association not found", { associationId });
				return false;
			}

			// 检查状态 - Check status
			if (
				associationRecord.status !== MonitoringStatus.ACTIVE &&
				associationRecord.status !== MonitoringStatus.PAUSED
			) {
				logger.warn("无法停止监控，状态不是活跃或暂停", {
					associationId,
					status: associationRecord.status,
				});
				return false;
			}

			// 根据监控系统类型停止相应的监控 - Stop corresponding monitoring based on monitoring system type
			let success = false;

			switch (associationRecord.monitoringSystemType) {
				case "gap_period_takeover":
					success = await this.stopGapPeriodTakeover(associationRecord);
					break;

				case "batch_closing":
					success = await this.stopBatchClosing(associationRecord);
					break;

				case "ai_parameter_control":
					success = await this.stopAiParameterControl(associationRecord);
					break;

				default:
					logger.error("Unknown monitoring system type", {
						associationId,
						monitoringSystemType: associationRecord.monitoringSystemType,
					});
					return false;
			}

			if (success) {
				// 更新状态为已停止 - Update status to stopped
				associationRecord.status = MonitoringStatus.STOPPED;
				associationRecord.stoppedAt = Date.now();
				associationRecord.updatedAt = Date.now();

				// 发出监控停止事件 - Emit monitoring stop event
				this.emit("monitoringStopped", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});

				logger.info("监控已停止", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});
			} else {
				// 更新状态为错误 - Update status to error
				associationRecord.status = MonitoringStatus.ERROR;
				associationRecord.updatedAt = Date.now();
				associationRecord.errorMessage = "Failed to stop monitoring";

				// 发出监控停止失败事件 - Emit monitoring stop failure event
				this.emit("monitoringStopFailed", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});

				logger.error("停止监控失败", {
					associationId,
					openingId: associationRecord.openingId,
					positionId: associationRecord.positionId,
					monitoringSystemType: associationRecord.monitoringSystemType,
				});
			}

			return success;
		} catch (error) {
			// 更新状态为错误 - Update status to error
			const associationRecord = this.monitoringAssociations.get(associationId);
			if (associationRecord) {
				associationRecord.status = MonitoringStatus.ERROR;
				associationRecord.updatedAt = Date.now();
				associationRecord.errorMessage =
					error instanceof Error ? error.message : String(error);
			}

			logger.error("停止监控时出错", { error, associationId });
			return false;
		}
	}

	/**
	 * 获取开仓记录
	 * Get opening record
	 *
	 * @param openingId 开仓ID - Opening ID
	 * @returns OpeningRecord | null 开仓记录 - Opening record
	 */
	getOpeningRecord(openingId: string): OpeningRecord | null {
		return this.openingRecords.get(openingId) || null;
	}

	/**
	 * 获取监控关联记录
	 * Get monitoring association record
	 *
	 * @param associationId 关联ID - Association ID
	 * @returns MonitoringAssociationRecord | null 监控关联记录 - Monitoring association record
	 */
	getMonitoringAssociation(
		associationId: string,
	): MonitoringAssociationRecord | null {
		return this.monitoringAssociations.get(associationId) || null;
	}

	/**
	 * 根据开仓ID获取监控关联
	 * Get monitoring association by opening ID
	 *
	 * @param openingId 开仓ID - Opening ID
	 * @returns MonitoringAssociationRecord | null 监控关联记录 - Monitoring association record
	 */
	getMonitoringAssociationByOpeningId(
		openingId: string,
	): MonitoringAssociationRecord | null {
		const associationId = this.openingIdToAssociationId.get(openingId);
		if (!associationId) {
			return null;
		}

		return this.monitoringAssociations.get(associationId) || null;
	}

	/**
	 * 根据持仓ID获取监控关联
	 * Get monitoring association by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns MonitoringAssociationRecord | null 监控关联记录 - Monitoring association record
	 */
	getMonitoringAssociationByPositionId(
		positionId: string,
	): MonitoringAssociationRecord | null {
		const associationId = this.positionIdToAssociationId.get(positionId);
		if (!associationId) {
			return null;
		}

		return this.monitoringAssociations.get(associationId) || null;
	}

	/**
	 * 获取监控关联状态
	 * Get monitoring association status
	 *
	 * @param positionId 持仓ID - Position ID
	 * @returns OpeningMonitoringAssociationStatus | null 监控关联状态 - Monitoring association status
	 */
	async getStatus(
		positionId: string,
	): Promise<OpeningMonitoringAssociationStatus | null> {
		try {
			// 获取监控关联记录 - Get monitoring association record
			const associationRecord =
				this.getMonitoringAssociationByPositionId(positionId);
			if (!associationRecord) {
				return null;
			}

			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);

			// 获取持仓信息 - Get position information
			const positions = await this.exchangeClient.getPositions();
			const position = positions.find((p) => p.positionId === positionId);

			// 构建状态对象 - Build status object
			const status: OpeningMonitoringAssociationStatus = {
				openingId: associationRecord.openingId,
				positionId: associationRecord.positionId,
				status: associationRecord.status,
				associatedAt: associationRecord.createdAt,
				lastUpdatedAt: associationRecord.updatedAt,
				metadata: {
					associationId: associationRecord.associationId,
					monitoringSystemType: associationRecord.monitoringSystemType,
					startedAt: associationRecord.startedAt,
					stoppedAt: associationRecord.stoppedAt,
					errorMessage: associationRecord.errorMessage,
					monitoringParams: associationRecord.monitoringParams,
					openingStatus: openingRecord?.status || OpeningStatus.PENDING,
					symbol: openingRecord?.symbol || "",
					direction: openingRecord?.direction || "long",
					size: position?.size || 0,
					entryPrice: position?.entryPrice || 0,
				},
			};

			return status;
		} catch (error) {
			logger.error("获取监控关联状态时出错", { error, positionId });
			return null;
		}
	}

	/**
	 * 根据决策ID获取开仓记录
	 * Get opening records by decision ID
	 *
	 * @param decisionId 决策ID - Decision ID
	 * @returns OpeningRecord[] 开仓记录列表 - List of opening records
	 */
	getOpeningRecordsByDecisionId(decisionId: string): OpeningRecord[] {
		const openingIds = this.decisionIdToOpeningIds.get(decisionId) || [];
		const openingRecords: OpeningRecord[] = [];

		for (const openingId of openingIds) {
			const openingRecord = this.openingRecords.get(openingId);
			if (openingRecord) {
				openingRecords.push(openingRecord);
			}
		}

		return openingRecords;
	}

	/**
	 * 获取所有开仓记录
	 * Get all opening records
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns OpeningRecord[] 所有开仓记录 - All opening records
	 */
	getAllOpeningRecords(status?: OpeningStatus): OpeningRecord[] {
		const records = Array.from(this.openingRecords.values());

		if (status !== undefined) {
			return records.filter((record) => record.status === status);
		}

		return records;
	}

	/**
	 * 获取所有监控关联记录
	 * Get all monitoring association records
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns MonitoringAssociationRecord[] 所有监控关联记录 - All monitoring association records
	 */
	getAllMonitoringAssociations(
		status?: MonitoringStatus,
	): MonitoringAssociationRecord[] {
		const records = Array.from(this.monitoringAssociations.values());

		if (status !== undefined) {
			return records.filter((record) => record.status === status);
		}

		return records;
	}

	/**
	 * 更新关联机制配置
	 * Update association mechanism configuration
	 *
	 * @param newConfig 新配置 - New configuration
	 * @returns boolean 更新是否成功 - Whether update was successful
	 */
	updateConfig(newConfig: Partial<AssociationConfig>): boolean {
		try {
			this.config = { ...this.config, ...newConfig };

			// 重启定时器以应用新配置 - Restart timers to apply new configuration
			this.restartOpeningCheckTimer();
			this.restartStateSyncTimer();

			// 发出配置更新事件 - Emit configuration update event
			this.emit("configUpdated", { config: this.config });

			logger.info("开仓监控关联配置已更新", { newConfig });

			return true;
		} catch (error) {
			logger.error("更新开仓监控关联配置时出错", { error, newConfig });
			return false;
		}
	}

	/**
	 * 安排监控启动
	 * Schedule monitoring startup
	 * @private
	 */
	private scheduleMonitoringStartup(openingId: string): void {
		setTimeout(async () => {
			try {
				// 获取开仓记录 - Get opening record
				const openingRecord = this.openingRecords.get(openingId);
				if (!openingRecord) {
					logger.error("未找到用于启动监控的开仓记录", { openingId });
					return;
				}

				// 检查是否已有关联 - Check if association already exists
				const existingAssociation =
					this.getMonitoringAssociationByOpeningId(openingId);
				if (existingAssociation) {
					logger.info("Monitoring association already exists", {
						openingId,
						associationId: existingAssociation.associationId,
					});
					return;
				}

				// 获取持仓信息 - Get position information
				const positions = await this.exchangeClient.getPositions();
				const position = positions.find(
					(p) => p.symbol === openingRecord.symbol,
				);

				if (!position) {
					logger.error("未找到用于启动监控的持仓", {
						openingId,
						symbol: openingRecord.symbol,
					});
					return;
				}

				// 创建监控关联 - Create monitoring association
				const associationId = this.createMonitoringAssociation(
					openingId,
					position.positionId,
					"gap_period_takeover",
				);

				if (associationId) {
					// 启动监控 - Start monitoring
					await this.startMonitoring(associationId);
				}
			} catch (error) {
				logger.error("定时监控启动出错", { error, openingId });
			}
		}, this.config.monitoringStartupDelay);
	}

	/**
	 * 启动空窗期接管监控
	 * Start gap period takeover monitoring
	 * @private
	 */
	private async startGapPeriodTakeover(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);
			if (!openingRecord) {
				logger.error("Opening record not found", {
					openingId: associationRecord.openingId,
				});
				return false;
			}

			// 启动空窗期接管 - Start gap period takeover
			await this.gapPeriodTakeover.startTakeover();

			return true;
		} catch (error) {
			logger.error("启动缺口期接管时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 启动分批平仓监控
	 * Start batch closing monitoring
	 * @private
	 */
	private async startBatchClosing(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);
			if (!openingRecord) {
				logger.error("Opening record not found", {
					openingId: associationRecord.openingId,
				});
				return false;
			}

			// 启动分批平仓监控 - Start batch closing monitoring
			// 调用batchClosingSystem的startBatchClosing方法
			// Call the startBatchClosing method of batchClosingSystem
			await this.batchClosingSystem.startBatchClosing(
				associationRecord.positionId,
			);

			return true;
		} catch (error) {
			logger.error("启动批量平仓时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 启动AI参数控制监控
	 * Start AI parameter control monitoring
	 * @private
	 */
	private async startAiParameterControl(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);
			if (!openingRecord) {
				logger.error("Opening record not found", {
					openingId: associationRecord.openingId,
				});
				return false;
			}

			// 启动AI参数控制 - Start AI parameter control
			// 调用aiParameterControl的startParameterControl方法
			// Call the startParameterControl method of aiParameterControl
			await this.aiParameterControl.startParameterControl(
				associationRecord.positionId,
			);

			return true;
		} catch (error) {
			logger.error("启动AI参数控制时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 停止空窗期接管监控
	 * Stop gap period takeover monitoring
	 * @private
	 */
	private async stopGapPeriodTakeover(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 停止空窗期接管 - Stop gap period takeover
			await this.gapPeriodTakeover.stopTakeover();

			return true;
		} catch (error) {
			logger.error("停止缺口期接管时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 停止分批平仓监控
	 * Stop batch closing monitoring
	 * @private
	 */
	private async stopBatchClosing(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);
			if (!openingRecord) {
				logger.error("Opening record not found", {
					openingId: associationRecord.openingId,
				});
				return false;
			}

			// 停止分批平仓监控 - Stop batch closing monitoring
			// 调用batchClosingSystem的stopBatchClosing方法
			// Call the stopBatchClosing method of batchClosingSystem
			await this.batchClosingSystem.stopBatchClosing(
				associationRecord.positionId,
			);

			return true;
		} catch (error) {
			logger.error("停止批量平仓时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 停止AI参数控制监控
	 * Stop AI parameter control monitoring
	 * @private
	 */
	private async stopAiParameterControl(
		associationRecord: MonitoringAssociationRecord,
	): Promise<boolean> {
		try {
			// 获取开仓记录 - Get opening record
			const openingRecord = this.openingRecords.get(
				associationRecord.openingId,
			);
			if (!openingRecord) {
				logger.error("Opening record not found", {
					openingId: associationRecord.openingId,
				});
				return false;
			}

			// 停止AI参数控制 - Stop AI parameter control
			// 调用aiParameterControl的stopParameterControl方法
			// Call the stopParameterControl method of aiParameterControl
			await this.aiParameterControl.stopParameterControl(
				associationRecord.positionId,
			);

			return true;
		} catch (error) {
			logger.error("停止AI参数控制时出错", {
				error,
				associationId: associationRecord.associationId,
			});
			return false;
		}
	}

	/**
	 * 启动开仓检查定时器
	 * Start opening check timer
	 * @private
	 */
	private startOpeningCheckTimer(): void {
		if (this.openingCheckTimer) {
			clearInterval(this.openingCheckTimer);
		}

		this.openingCheckTimer = setInterval(async () => {
			await this.checkOpeningStatus();
		}, this.config.openingCheckInterval);

		logger.debug("开仓检查计时器已启动", {
			interval: this.config.openingCheckInterval,
		});
	}

	/**
	 * 重启开仓检查定时器
	 * Restart opening check timer
	 * @private
	 */
	private restartOpeningCheckTimer(): void {
		this.startOpeningCheckTimer();
	}

	/**
	 * 启动状态同步定时器
	 * Start state sync timer
	 * @private
	 */
	private startStateSyncTimer(): void {
		if (this.stateSyncTimer) {
			clearInterval(this.stateSyncTimer);
		}

		this.stateSyncTimer = setInterval(async () => {
			await this.syncMonitoringState();
		}, this.config.stateSyncInterval);

		logger.debug("状态同步计时器已启动", {
			interval: this.config.stateSyncInterval,
		});
	}

	/**
	 * 重启状态同步定时器
	 * Restart state sync timer
	 * @private
	 */
	private restartStateSyncTimer(): void {
		this.startStateSyncTimer();
	}

	/**
	 * 检查开仓状态
	 * Check opening status
	 * @private
	 */
	private async checkOpeningStatus(): Promise<void> {
		try {
			const now = Date.now();

			for (const openingRecord of this.openingRecords.values()) {
				// 只检查待处理和已提交状态的开仓记录
				// Only check opening records with pending or submitted status
				if (
					openingRecord.status !== OpeningStatus.PENDING &&
					openingRecord.status !== OpeningStatus.SUBMITTED &&
					openingRecord.status !== OpeningStatus.PARTIAL_FILLED
				) {
					continue;
				}

				// 检查是否超时 - Check if timeout
				if (
					now - openingRecord.createdAt >
					this.config.openingCompletionTimeout
				) {
					logger.warn("Opening operation timeout", {
						openingId: openingRecord.openingId,
						status: openingRecord.status,
						createdAt: openingRecord.createdAt,
						timeout: this.config.openingCompletionTimeout,
					});

					// 更新状态为失败 - Update status to failed
					this.updateOpeningStatus(
						openingRecord.openingId,
						OpeningStatus.FAILED,
						undefined,
						undefined,
						"Opening operation timeout",
					);

					continue;
				}

				// 查询订单状态 - Query order status
				try {
					const order = await this.exchangeClient.getOrder(
						openingRecord.orderId,
					);

					if (order) {
						// 根据订单状态更新开仓状态
						// Update opening status based on order status
						if (order.status === "filled") {
							this.updateOpeningStatus(
								openingRecord.openingId,
								OpeningStatus.FILLED,
								order.filledQuantity,
								order.avgPrice,
							);
						} else if (order.status === "partial_filled") {
							this.updateOpeningStatus(
								openingRecord.openingId,
								OpeningStatus.PARTIAL_FILLED,
								order.filledQuantity,
								order.avgPrice,
							);
						} else if (order.status === "cancelled") {
							this.updateOpeningStatus(
								openingRecord.openingId,
								OpeningStatus.CANCELLED,
								order.filledQuantity,
								order.avgPrice,
							);
						} else if (order.status === "failed") {
							this.updateOpeningStatus(
								openingRecord.openingId,
								OpeningStatus.FAILED,
								order.filledQuantity,
								order.avgPrice,
								order.errorMessage,
							);
						}
					}
				} catch (error) {
					logger.error("查询订单状态时出错", {
						error,
						openingId: openingRecord.openingId,
						orderId: openingRecord.orderId,
						symbol: openingRecord.symbol,
					});
				}
			}
		} catch (error) {
			logger.error("检查开仓状态时出错", { error });
		}
	}

	/**
	 * 同步监控状态
	 * Sync monitoring state
	 * @private
	 */
	private async syncMonitoringState(): Promise<void> {
		try {
			// 如果未启用状态同步，直接返回
			// If state synchronization is not enabled, return directly
			if (!this.config.enableStateSynchronization) {
				return;
			}

			for (const associationRecord of this.monitoringAssociations.values()) {
				// 只同步激活状态的监控关联
				// Only sync monitoring associations with active status
				if (associationRecord.status !== MonitoringStatus.ACTIVE) {
					continue;
				}

				try {
					// 根据监控系统类型同步状态
					// Sync state based on monitoring system type
					switch (associationRecord.monitoringSystemType) {
						case "gap_period_takeover":
							// 同步空窗期接管状态 - Sync gap period takeover state
							// 这里可以添加具体的同步逻辑
							// Here you can add specific sync logic
							break;

						case "batch_closing":
							// 同步分批平仓状态 - Sync batch closing state
							// 这里可以添加具体的同步逻辑
							// Here you can add specific sync logic
							break;

						case "ai_parameter_control":
							// 同步AI参数控制状态 - Sync AI parameter control state
							// 这里可以添加具体的同步逻辑
							// Here you can add specific sync logic
							break;
					}
				} catch (error) {
					logger.error("同步监控状态时出错", {
						error,
						associationId: associationRecord.associationId,
						monitoringSystemType: associationRecord.monitoringSystemType,
					});

					// 如果启用错误恢复，尝试恢复
					// If error recovery is enabled, try to recover
					if (this.config.enableErrorRecovery) {
						await this.attemptErrorRecovery(associationRecord);
					}
				}
			}
		} catch (error) {
			logger.error("同步监控状态时出错", { error });
		}
	}

	/**
	 * 尝试错误恢复
	 * Attempt error recovery
	 * @private
	 */
	private async attemptErrorRecovery(
		associationRecord: MonitoringAssociationRecord,
	): Promise<void> {
		try {
			// 更新状态为错误 - Update status to error
			associationRecord.status = MonitoringStatus.ERROR;
			associationRecord.updatedAt = Date.now();
			associationRecord.errorMessage = "Monitoring state sync error";

			// 发出错误事件 - Emit error event
			this.emit("monitoringError", {
				associationId: associationRecord.associationId,
				openingId: associationRecord.openingId,
				positionId: associationRecord.positionId,
				monitoringSystemType: associationRecord.monitoringSystemType,
			});

			// 延迟后尝试重启监控 - Attempt to restart monitoring after delay
			setTimeout(async () => {
				try {
					// 更新状态为未激活 - Update status to inactive
					associationRecord.status = MonitoringStatus.INACTIVE;
					associationRecord.updatedAt = Date.now();

					// 尝试重新启动监控 - Try to restart monitoring
					await this.startMonitoring(associationRecord.associationId);

					logger.info("监控错误恢复成功", {
						associationId: associationRecord.associationId,
					});
				} catch (error) {
					logger.error("监控错误恢复失败", {
						error,
						associationId: associationRecord.associationId,
					});
				}
			}, this.config.errorRecoveryDelay);
		} catch (error) {
			logger.error("错误恢复时出错", {
				error,
				associationId: associationRecord.associationId,
			});
		}
	}

	/**
	 * 销毁关联机制
	 * Destroy association mechanism
	 */
	destroy(): void {
		// 停止定时器 - Stop timers
		if (this.openingCheckTimer) {
			clearInterval(this.openingCheckTimer);
			this.openingCheckTimer = null;
		}

		if (this.stateSyncTimer) {
			clearInterval(this.stateSyncTimer);
			this.stateSyncTimer = null;
		}

		// 移除所有监听器 - Remove all listeners
		this.removeAllListeners();

		// 清空数据 - Clear data
		this.openingRecords.clear();
		this.monitoringAssociations.clear();
		this.openingIdToAssociationId.clear();
		this.positionIdToAssociationId.clear();
		this.decisionIdToOpeningIds.clear();

		logger.info("CaiSen Opening Monitoring Association destroyed");
	}
}

/**
 * 默认关联机制配置
 * Default association mechanism configuration
 */
export const DEFAULT_ASSOCIATION_CONFIG: AssociationConfig = {
	enableAutoMonitoringStartup: true,
	openingCheckInterval: 5 * 1000, // 5秒 - 5 seconds
	openingCompletionTimeout: 5 * 60 * 1000, // 5分钟 - 5 minutes
	monitoringStartupDelay: 2 * 1000, // 2秒 - 2 seconds
	enableStateSynchronization: true,
	stateSyncInterval: 30 * 1000, // 30秒 - 30 seconds
	enableErrorRecovery: true,
	errorRecoveryRetries: 3,
	errorRecoveryDelay: 10 * 1000, // 10秒 - 10 seconds
};

/**
 * 创建蔡森开仓监控关联实例
 * Create CaiSen opening monitoring association instance
 *
 * @param config 关联机制配置 - Association mechanism configuration
 * @param strategyConfig 策略配置 - Strategy configuration
 * @param gapPeriodTakeover 空窗期接管系统 - Gap period takeover system
 * @param batchClosingSystem 分批平仓系统 - Batch closing system
 * @param aiParameterControl AI参数控制系统 - AI parameter control system
 * @param monitorIndependentSystem 监控独立系统 - Monitor independent system
 * @returns CaiSenOpeningMonitoringAssociation 蔡森开仓监控关联实例 - CaiSen opening monitoring association instance
 */
export function createCaiSenOpeningMonitoringAssociation(
	config: AssociationConfig = DEFAULT_ASSOCIATION_CONFIG,
	strategyConfig?: StrategyParams,
	gapPeriodTakeover?: CaiSenGapPeriodTakeover,
	batchClosingSystem?: CaiSenBatchClosingSystem,
	aiParameterControl?: CaiSenAiParameterControl,
	monitorIndependentSystem?: CaiSenMonitorIndependentSystem,
): CaiSenOpeningMonitoringAssociation {
	// 创建默认配置 - Create default configurations
	const defaultStrategyConfig: StrategyParams = {
		name: "default",
		description: "Default strategy configuration",
		leverageMin: 1,
		leverageMax: 10,
		leverageRecommend: {
			normal: "15x",
			good: "19x",
			strong: "25x",
		},
		positionSizeMin: 0.001,
		positionSizeMax: 0.1,
		positionSizeRecommend: {
			normal: "25-28%",
			good: "28-30%",
			strong: "30-32%",
		},
		stopLoss: { low: 0, mid: 0, high: 0 },
		trailingStop: {
			level1: { trigger: 0, stopAt: 0 },
			level2: { trigger: 0, stopAt: 0 },
			level3: { trigger: 0, stopAt: 0 },
		},
		partialTakeProfit: {
			stage1: { trigger: 0, closePercent: 0 },
			stage2: { trigger: 0, closePercent: 0 },
			stage3: { trigger: 0, closePercent: 0 },
		},
		peakDrawdownProtection: 0,
		volatilityAdjustment: {
			highVolatility: { leverageFactor: 0.8, positionFactor: 0.85 },
			normalVolatility: { leverageFactor: 1.0, positionFactor: 1.0 },
			lowVolatility: { leverageFactor: 1.2, positionFactor: 1.1 },
		},
		entryCondition: "Default entry condition",
		riskTolerance: "Medium",
		tradingStyle: "Swing",
		enableCodeLevelProtection: true,
		allowAiOverrideProtection: false,
	};

	// 如果没有提供必要的实例，则返回null，要求调用者提供所有必要的依赖
	// If necessary instances are not provided, return null, requiring the caller to provide all necessary dependencies
	if (
		!strategyConfig ||
		!gapPeriodTakeover ||
		!batchClosingSystem ||
		!aiParameterControl ||
		!monitorIndependentSystem
	) {
		throw new Error(
			"All required dependencies must be provided: strategyConfig, gapPeriodTakeover, batchClosingSystem, aiParameterControl, monitorIndependentSystem",
		);
	}

	return new CaiSenOpeningMonitoringAssociation(
		config,
		strategyConfig,
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		monitorIndependentSystem,
	);
}
