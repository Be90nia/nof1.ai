/**
 * 蔡森监控器独立系统
 * CaiSen Monitor Independent System
 *
 * 该模块实现蔡森监控器与原有监控系统的独立分割，确保功能和数据完全独立
 * This module implements the independent separation of CaiSen monitor from the original monitoring system, ensuring complete independence of functionality and data
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "node:events";
import { logger } from "../../../utils/loggerUtils";
import {
	type CaiSenStandardizedInterface,
	GapPeriodTakeoverStatus,
	OpeningMonitoringAssociationStatus,
} from "../../interface/standardized-interface";
import {
	BatchClosingParameters,
	type InterfaceCallResponse,
	InterfaceCallResult,
	StopProfitLossParameters,
} from "../../interface/types";
import {
	type CaiSenAiParameterControl,
	ClosingParameterDetail,
	ParameterStatus,
	ParameterType,
} from "../ai-parameter-control";
import {
	BatchConfig,
	type BatchState,
	BatchStatus,
	type CaiSenBatchClosingSystem,
	ClosingType,
} from "../batch-closing";
import {
	type CaiSenBatchClosingInstructionRecognizer,
	InstructionPriority,
	InstructionStatus,
	InstructionType,
} from "../batch-closing-instruction-recognizer";
import {
	type CaiSenDynamicThresholdSetting,
	type DynamicThreshold,
	ThresholdCalculationMethod,
	ThresholdSettingConfig,
	ThresholdSource,
	ThresholdStatus,
	ThresholdType,
} from "../dynamic-threshold";
import {
	type CaiSenGapPeriodTakeover,
	TakeoverConfig,
	type TakeoverState,
} from "../gap-period-takeover";
import {
	type CaiSenOpeningMonitoringAssociation,
	MonitoringStatus,
	OpeningStatus,
} from "../opening-monitoring-association";

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
 * 蔡森监控器状态枚举
 * CaiSen Monitor Status Enumeration
 */
export enum CaiSenMonitorStatus {
	IDLE = "idle", // 空闲 - Idle
	INITIALIZING = "initializing", // 初始化中 - Initializing
	ACTIVE = "active", // 活跃 - Active
	PAUSED = "paused", // 暂停 - Paused
	STOPPING = "stopping", // 停止中 - Stopping
	STOPPED = "stopped", // 已停止 - Stopped
	ERROR = "error", // 错误 - Error
}

/**
 * 蔡森监控器配置接口
 * CaiSen Monitor Configuration Interface
 */
export interface CaiSenMonitorConfig {
	/** 监控器ID - Monitor ID */
	monitorId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 是否启用 - Whether enabled */
	enabled: boolean;

	/** 监控类型 - Monitoring types */
	monitoringTypes: (
		| "stop_loss"
		| "take_profit"
		| "trailing_stop"
		| "partial_profit"
	)[];

	/** 监控间隔 - Monitoring interval (ms) */
	monitoringInterval: number;

	/** 数据源 - Data source */
	dataSource: "exchange" | "database" | "cache" | "custom";

	/** 自定义数据源函数 - Custom data source function */
	customDataSource?: () => Promise<any>;

	/** 是否启用事件 - Whether to enable events */
	enableEvents: boolean;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 蔡森监控器状态接口
 * CaiSen Monitor State Interface
 */
export interface CaiSenMonitorState {
	/** 监控器ID - Monitor ID */
	monitorId: string;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 状态 - Status */
	status: CaiSenMonitorStatus;

	/** 开始时间 - Start time */
	startTime: number;

	/** 最后更新时间 - Last update time */
	lastUpdateTime: number;

	/** 最后检查时间 - Last check time */
	lastCheckTime: number;

	/** 检查次数 - Check count */
	checkCount: number;

	/** 错误次数 - Error count */
	errorCount: number;

	/** 最后错误 - Last error */
	lastError?: string;

	/** 持仓信息 - Position information */
	positionInfo?: any;

	/** 阈值列表 - Threshold list */
	thresholds: DynamicThreshold[];

	/** 分批平仓列表 - Batch closing list */
	batchClosings: BatchState[];

	/** 空窗期接管状态 - Gap period takeover state */
	gapPeriodTakeover?: TakeoverState;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 蔡森监控器独立系统类
 * CaiSen Monitor Independent System Class
 */
export class CaiSenMonitorIndependentSystem extends EventEmitter {
	private monitors: Map<string, CaiSenMonitorConfig> = new Map();
	private monitorStates: Map<string, CaiSenMonitorState> = new Map();
	private monitorTimers: Map<string, NodeJS.Timeout> = new Map();

	private gapPeriodTakeover: CaiSenGapPeriodTakeover;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: CaiSenAiParameterControl;
	private openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation;
	private batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer;
	private dynamicThresholdSetting: CaiSenDynamicThresholdSetting;
	private standardizedInterface: CaiSenStandardizedInterface;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param gapPeriodTakeover 空窗期接管系统 - Gap period takeover system
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 * @param openingMonitoringAssociation 开仓监控关联系统 - Opening monitoring association system
	 * @param batchClosingInstructionRecognizer 分批平仓指令识别系统 - Batch closing instruction recognizer system
	 * @param dynamicThresholdSetting 动态阈值设定系统 - Dynamic threshold setting system
	 * @param standardizedInterface 标准化接口 - Standardized interface
	 */
	constructor(
		gapPeriodTakeover: CaiSenGapPeriodTakeover,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: CaiSenAiParameterControl,
		openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation,
		batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer,
		dynamicThresholdSetting: CaiSenDynamicThresholdSetting,
		standardizedInterface: CaiSenStandardizedInterface,
	) {
		super();

		this.gapPeriodTakeover = gapPeriodTakeover;
		this.batchClosingSystem = batchClosingSystem;
		this.aiParameterControl = aiParameterControl;
		this.openingMonitoringAssociation = openingMonitoringAssociation;
		this.batchClosingInstructionRecognizer = batchClosingInstructionRecognizer;
		this.dynamicThresholdSetting = dynamicThresholdSetting;
		this.standardizedInterface = standardizedInterface;

		// 设置系统间事件监听 - Set up inter-system event listening
		this.setupInterSystemEventListening();

		logger.info("CaiSen Monitor Independent System initialized");
	}

	/**
	 * 创建监控器
	 * Create monitor
	 *
	 * @param config 监控器配置 - Monitor configuration
	 * @returns Promise<InterfaceCallResponse<string>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * createMonitor({
	 *   monitorId: "monitor_12345",
	 *   positionId: "pos_12345",
	 *   symbol: "BTCUSDT",
	 *   direction: "long",
	 *   enabled: true,
	 *   monitoringTypes: ["stop_loss", "take_profit", "trailing_stop"],
	 *   monitoringInterval: 5000,
	 *   dataSource: "exchange",
	 *   enableEvents: true
	 * })
	 */
	async createMonitor(
		config: CaiSenMonitorConfig,
	): Promise<InterfaceCallResponse<string>> {
		const startTime = Date.now();

		try {
			// 验证配置 - Validate configuration
			const validationResult = this.validateMonitorConfig(config);
			if (!validationResult.valid) {
				return {
					result: InterfaceCallResult.PARAM_ERROR,
					errorMessage: validationResult.errorMessage,
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 检查监控器是否已存在 - Check if monitor already exists
			if (this.monitors.has(config.monitorId)) {
				return {
					result: InterfaceCallResult.CONFLICT,
					errorMessage: "Monitor already exists",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 保存监控器配置 - Save monitor configuration
			this.monitors.set(config.monitorId, config);

			// 创建监控器状态 - Create monitor state
			const monitorState: CaiSenMonitorState = {
				monitorId: config.monitorId,
				positionId: config.positionId,
				status: CaiSenMonitorStatus.IDLE,
				startTime: 0,
				lastUpdateTime: Date.now(),
				lastCheckTime: 0,
				checkCount: 0,
				errorCount: 0,
				thresholds: [],
				batchClosings: [],
				metadata: config.metadata,
			};

			this.monitorStates.set(config.monitorId, monitorState);

			// 如果启用，启动监控器 - If enabled, start monitor
			if (config.enabled) {
				const startResult = await this.startMonitor(config.monitorId);
				if (startResult.result !== InterfaceCallResult.SUCCESS) {
					// 清理已创建的监控器 - Clean up created monitor
					this.monitors.delete(config.monitorId);
					this.monitorStates.delete(config.monitorId);

					return {
						result: startResult.result,
						errorMessage: startResult.errorMessage,
						callTime: startResult.callTime,
						processingTime: startResult.processingTime,
					};
				}
			}

			// 发出监控器创建事件 - Emit monitor created event
			this.emit("monitorCreated", { monitorId: config.monitorId, config });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: config.monitorId,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("创建监控时出错", { error, config });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 启动监控器
	 * Start monitor
	 *
	 * @param monitorId 监控器ID - Monitor ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * startMonitor("monitor_12345")
	 */
	async startMonitor(
		monitorId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		try {
			// 检查监控器是否存在 - Check if monitor exists
			const monitor = this.monitors.get(monitorId);
			if (!monitor) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 获取监控器状态 - Get monitor state
			const monitorState = this.monitorStates.get(monitorId);
			if (!monitorState) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor state not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 检查监控器状态 - Check monitor status
			if (monitorState.status === CaiSenMonitorStatus.ACTIVE) {
				return {
					result: InterfaceCallResult.CONFLICT,
					errorMessage: "Monitor is already active",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 更新状态为初始化中 - Update status to initializing
			monitorState.status = CaiSenMonitorStatus.INITIALIZING;
			monitorState.lastUpdateTime = Date.now();

			// 获取持仓信息 - Get position information
			const positionInfoResult =
				await this.standardizedInterface.getPositionManagementStatus(
					monitor.positionId,
				);
			if (positionInfoResult.result === InterfaceCallResult.SUCCESS) {
				monitorState.positionInfo = positionInfoResult.data;
			}

			// 获取相关阈值 - Get related thresholds
			monitorState.thresholds =
				this.dynamicThresholdSetting.getThresholdsByPositionId(
					monitor.positionId,
				);

			// 获取相关分批平仓 - Get related batch closings
			monitorState.batchClosings =
				this.batchClosingSystem.getBatchStatesByPositionId(monitor.positionId);

			// 获取空窗期接管状态 - Get gap period takeover state
			const takeoverStates =
				this.gapPeriodTakeover.getTakeoverStatesByPositionId(
					monitor.positionId,
				);
			if (takeoverStates.length > 0) {
				monitorState.gapPeriodTakeover = takeoverStates[0];
			}

			// 设置监控定时器 - Set up monitoring timer
			const timer = setInterval(
				() => this.performMonitoringCheck(monitorId),
				monitor.monitoringInterval,
			);
			this.monitorTimers.set(monitorId, timer);

			// 更新状态为活跃 - Update status to active
			monitorState.status = CaiSenMonitorStatus.ACTIVE;
			monitorState.startTime = Date.now();
			monitorState.lastUpdateTime = Date.now();

			// 发出监控器启动事件 - Emit monitor started event
			this.emit("monitorStarted", { monitorId, config: monitor });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: true,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("启动监控时出错", { error, monitorId });

			// 更新状态为错误 - Update status to error
			const monitorState = this.monitorStates.get(monitorId);
			if (monitorState) {
				monitorState.status = CaiSenMonitorStatus.ERROR;
				monitorState.lastError =
					error instanceof Error ? error.message : "Unknown error";
				monitorState.errorCount += 1;
				monitorState.lastUpdateTime = Date.now();
			}

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 停止监控器
	 * Stop monitor
	 *
	 * @param monitorId 监控器ID - Monitor ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * stopMonitor("monitor_12345")
	 */
	async stopMonitor(
		monitorId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		try {
			// 检查监控器是否存在 - Check if monitor exists
			const monitor = this.monitors.get(monitorId);
			if (!monitor) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 获取监控器状态 - Get monitor state
			const monitorState = this.monitorStates.get(monitorId);
			if (!monitorState) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor state not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 检查监控器状态 - Check monitor status
			if (
				monitorState.status === CaiSenMonitorStatus.STOPPED ||
				monitorState.status === CaiSenMonitorStatus.IDLE
			) {
				return {
					result: InterfaceCallResult.CONFLICT,
					errorMessage: "Monitor is already stopped",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 更新状态为停止中 - Update status to stopping
			monitorState.status = CaiSenMonitorStatus.STOPPING;
			monitorState.lastUpdateTime = Date.now();

			// 清除定时器 - Clear timer
			const timer = this.monitorTimers.get(monitorId);
			if (timer) {
				clearInterval(timer);
				this.monitorTimers.delete(monitorId);
			}

			// 更新状态为已停止 - Update status to stopped
			monitorState.status = CaiSenMonitorStatus.STOPPED;
			monitorState.lastUpdateTime = Date.now();

			// 发出监控器停止事件 - Emit monitor stopped event
			this.emit("monitorStopped", { monitorId, config: monitor });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: true,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("停止监控时出错", { error, monitorId });

			// 更新状态为错误 - Update status to error
			const monitorState = this.monitorStates.get(monitorId);
			if (monitorState) {
				monitorState.status = CaiSenMonitorStatus.ERROR;
				monitorState.lastError =
					error instanceof Error ? error.message : "Unknown error";
				monitorState.errorCount += 1;
				monitorState.lastUpdateTime = Date.now();
			}

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 删除监控器
	 * Delete monitor
	 *
	 * @param monitorId 监控器ID - Monitor ID
	 * @returns Promise<InterfaceCallResponse<boolean>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * deleteMonitor("monitor_12345")
	 */
	async deleteMonitor(
		monitorId: string,
	): Promise<InterfaceCallResponse<boolean>> {
		const startTime = Date.now();

		try {
			// 检查监控器是否存在 - Check if monitor exists
			const monitor = this.monitors.get(monitorId);
			if (!monitor) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			// 停止监控器 - Stop monitor
			if (monitor.enabled) {
				const stopResult = await this.stopMonitor(monitorId);
				if (
					stopResult.result !== InterfaceCallResult.SUCCESS &&
					stopResult.result !== InterfaceCallResult.CONFLICT
				) {
					return stopResult;
				}
			}

			// 删除监控器配置和状态 - Delete monitor configuration and state
			this.monitors.delete(monitorId);
			this.monitorStates.delete(monitorId);

			// 发出监控器删除事件 - Emit monitor deleted event
			this.emit("monitorDeleted", { monitorId, config: monitor });

			return {
				result: InterfaceCallResult.SUCCESS,
				data: true,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("删除监控时出错", { error, monitorId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 获取监控器状态
	 * Get monitor state
	 *
	 * @param monitorId 监控器ID - Monitor ID
	 * @returns Promise<InterfaceCallResponse<CaiSenMonitorState>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getMonitorState("monitor_12345")
	 */
	async getMonitorState(
		monitorId: string,
	): Promise<InterfaceCallResponse<CaiSenMonitorState>> {
		const startTime = Date.now();

		try {
			// 获取监控器状态 - Get monitor state
			const monitorState = this.monitorStates.get(monitorId);

			if (!monitorState) {
				return {
					result: InterfaceCallResult.NOT_FOUND,
					errorMessage: "Monitor not found",
					callTime: startTime,
					processingTime: Date.now() - startTime,
				};
			}

			return {
				result: InterfaceCallResult.SUCCESS,
				data: monitorState,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("获取监控器状态时出错", { error, monitorId });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 获取所有监控器状态
	 * Get all monitor states
	 *
	 * @returns Promise<InterfaceCallResponse<CaiSenMonitorState[]>> 调用结果 - Call result
	 *
	 * 示例 Example:
	 * getAllMonitorStates()
	 */
	async getAllMonitorStates(): Promise<
		InterfaceCallResponse<CaiSenMonitorState[]>
	> {
		const startTime = Date.now();

		try {
			// 获取所有监控器状态 - Get all monitor states
			const monitorStates = Array.from(this.monitorStates.values());

			return {
				result: InterfaceCallResult.SUCCESS,
				data: monitorStates,
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("获取所有监控器状态时出错", { error });

			return {
				result: InterfaceCallResult.SYSTEM_ERROR,
				errorMessage: error instanceof Error ? error.message : "Unknown error",
				callTime: startTime,
				processingTime: Date.now() - startTime,
			};
		}
	}

	/**
	 * 执行监控检查
	 * Perform monitoring check
	 * @private
	 */
	private async performMonitoringCheck(monitorId: string): Promise<void> {
		try {
			// 获取监控器配置和状态 - Get monitor configuration and state
			const monitor = this.monitors.get(monitorId);
			const monitorState = this.monitorStates.get(monitorId);

			if (!monitor || !monitorState) {
				logger.warn(`Monitor ${monitorId} not found during check`);
				return;
			}

			// 更新检查信息 - Update check information
			monitorState.lastCheckTime = Date.now();
			monitorState.checkCount += 1;

			// 获取最新持仓信息 - Get latest position information
			const positionInfoResult =
				await this.standardizedInterface.getPositionManagementStatus(
					monitor.positionId,
				);
			if (positionInfoResult.result === InterfaceCallResult.SUCCESS) {
				monitorState.positionInfo = positionInfoResult.data;
			}

			// 检查阈值 - Check thresholds
			await this.checkThresholds(monitorId, monitor, monitorState);

			// 检查分批平仓 - Check batch closings
			await this.checkBatchClosings(monitorId, monitor, monitorState);

			// 检查空窗期接管 - Check gap period takeover
			await this.checkGapPeriodTakeover(monitorId, monitor, monitorState);

			// 更新状态 - Update state
			monitorState.lastUpdateTime = Date.now();

			// 发出监控检查事件 - Emit monitoring check event
			if (monitor.enableEvents) {
				this.emit("monitoringCheck", {
					monitorId,
					positionId: monitor.positionId,
					checkCount: monitorState.checkCount,
					lastCheckTime: monitorState.lastCheckTime,
				});
			}
		} catch (error) {
			logger.error(`监控器 ${monitorId} 检查期间出错`, { error });

			// 更新错误信息 - Update error information
			const monitorState = this.monitorStates.get(monitorId);
			if (monitorState) {
				monitorState.lastError =
					error instanceof Error ? error.message : "Unknown error";
				monitorState.errorCount += 1;
				monitorState.lastUpdateTime = Date.now();

				// 如果错误次数过多，停止监控器 - If error count is too high, stop monitor
				if (monitorState.errorCount >= 5) {
					logger.warn(`Stopping monitor ${monitorId} due to too many errors`);
					await this.stopMonitor(monitorId);
				}
			}

			// 发出监控错误事件 - Emit monitoring error event
			this.emit("monitoringError", {
				monitorId,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	/**
	 * 检查阈值
	 * Check thresholds
	 * @private
	 */
	private async checkThresholds(
		monitorId: string,
		monitor: CaiSenMonitorConfig,
		monitorState: CaiSenMonitorState,
	): Promise<void> {
		if (!monitorState.positionInfo) {
			return;
		}

		// 获取当前阈值 - Get current thresholds
		const thresholds = this.dynamicThresholdSetting.getThresholdsByPositionId(
			monitor.positionId,
		);
		monitorState.thresholds = thresholds;

		// 检查每个阈值 - Check each threshold
		for (const threshold of thresholds) {
			if (threshold.status !== ThresholdStatus.ACTIVE) {
				continue;
			}

			// 检查阈值是否触发 - Check if threshold is triggered
			const triggered =
				await this.dynamicThresholdSetting.checkThresholdTrigger(
					threshold.thresholdId,
				);

			if (triggered) {
				// 发出阈值触发事件 - Emit threshold triggered event
				this.emit("thresholdTriggered", {
					monitorId,
					positionId: monitor.positionId,
					threshold,
				});

				// 执行阈值操作 - Execute threshold action
				await this.executeThresholdAction(monitorId, threshold);
			}
		}
	}

	/**
	 * 检查分批平仓
	 * Check batch closings
	 * @private
	 */
	private async checkBatchClosings(
		monitorId: string,
		monitor: CaiSenMonitorConfig,
		monitorState: CaiSenMonitorState,
	): Promise<void> {
		if (!monitorState.positionInfo) {
			return;
		}

		// 获取当前分批平仓 - Get current batch closings
		const batchClosings = this.batchClosingSystem.getBatchStatesByPositionId(
			monitor.positionId,
		);
		monitorState.batchClosings = batchClosings;

		// 检查每个分批平仓 - Check each batch closing
		for (const batchClosing of batchClosings) {
			if (batchClosing.status !== BatchStatus.PENDING) {
				continue;
			}

			// 检查分批平仓是否触发 - Check if batch closing is triggered
			const triggered = await this.batchClosingSystem.checkBatchClosing(
				batchClosing.config.batchId,
			);

			if (triggered) {
				// 发出分批平仓触发事件 - Emit batch closing triggered event
				this.emit("batchClosingTriggered", {
					monitorId,
					positionId: monitor.positionId,
					batchClosing,
				});

				// 执行分批平仓操作 - Execute batch closing action
				await this.executeBatchClosingAction(monitorId, batchClosing);
			}
		}
	}

	/**
	 * 检查空窗期接管
	 * Check gap period takeover
	 * @private
	 */
	private async checkGapPeriodTakeover(
		monitorId: string,
		monitor: CaiSenMonitorConfig,
		monitorState: CaiSenMonitorState,
	): Promise<void> {
		// 获取当前空窗期接管状态 - Get current gap period takeover state
		const takeoverStates = this.gapPeriodTakeover.getTakeoverStatesByPositionId(
			monitor.positionId,
		);

		if (takeoverStates.length > 0) {
			monitorState.gapPeriodTakeover = takeoverStates[0];

			const takeoverState = takeoverStates[0];

			// 检查空窗期接管是否触发 - Check if gap period takeover is triggered
			const triggered = this.gapPeriodTakeover.checkTakeoverTriggered(
				takeoverState.takeoverId,
			);

			if (triggered) {
				// 发出空窗期接管触发事件 - Emit gap period takeover triggered event
				this.emit("gapPeriodTakeoverTriggered", {
					monitorId,
					positionId: monitor.positionId,
					takeoverState,
				});

				// 执行空窗期接管操作 - Execute gap period takeover action
				await this.executeGapPeriodTakeoverAction(monitorId, takeoverState);
			}
		}
	}

	/**
	 * 执行阈值操作
	 * Execute threshold action
	 * @private
	 */
	private async executeThresholdAction(
		monitorId: string,
		threshold: DynamicThreshold,
	): Promise<void> {
		try {
			// 根据阈值类型执行不同操作 - Execute different actions based on threshold type
			switch (threshold.type) {
				case ThresholdType.STOP_LOSS:
					// 执行止损 - Execute stop loss
					await this.executeStopLoss(monitorId, threshold);
					break;

				case ThresholdType.TAKE_PROFIT:
					// 执行止盈 - Execute take profit
					await this.executeTakeProfit(monitorId, threshold);
					break;

				case ThresholdType.TRAILING_STOP:
					// 执行移动止损 - Execute trailing stop
					await this.executeTrailingStop(monitorId, threshold);
					break;

				case ThresholdType.PARTIAL_PROFIT:
					// 执行分批止盈 - Execute partial profit
					await this.executePartialProfit(monitorId, threshold);
					break;

				default:
					logger.warn(`Unknown threshold type: ${threshold.type}`);
			}
		} catch (error) {
			logger.error(`为监控器 ${monitorId} 执行阈值操作时出错`, {
				error,
				threshold,
			});
		}
	}

	/**
	 * 执行分批平仓操作
	 * Execute batch closing action
	 * @private
	 */
	private async executeBatchClosingAction(
		monitorId: string,
		batchClosing: BatchState,
	): Promise<void> {
		try {
			// 执行分批平仓 - Execute batch closing
			const executed = await this.batchClosingSystem.executeBatch(
				batchClosing.config.batchId,
			);

			if (executed) {
				logger.info(`Batch closing executed for monitor ${monitorId}`, {
					batchId: batchClosing.config.batchId,
				});
			} else {
				logger.warn(
					`Failed to execute batch closing for monitor ${monitorId}`,
					{ batchId: batchClosing.config.batchId },
				);
			}
		} catch (error) {
			logger.error(`为监控器 ${monitorId} 执行分批平仓操作时出错`, {
				error,
				batchClosing,
			});
		}
	}

	/**
	 * 执行空窗期接管操作
	 * Execute gap period takeover action
	 * @private
	 */
	private async executeGapPeriodTakeoverAction(
		monitorId: string,
		takeoverState: TakeoverState,
	): Promise<void> {
		try {
			// 执行空窗期接管 - Execute gap period takeover
			const executed = this.gapPeriodTakeover.executeTakeover(
				takeoverState.takeoverId,
			);

			if (executed) {
				logger.info(`Gap period takeover executed for monitor ${monitorId}`, {
					takeoverId: takeoverState.takeoverId,
				});
			} else {
				logger.warn(
					`Failed to execute gap period takeover for monitor ${monitorId}`,
					{ takeoverId: takeoverState.takeoverId },
				);
			}
		} catch (error) {
			logger.error(`为监控器 ${monitorId} 执行空窗期接管操作时出错`, {
				error,
				takeoverState,
			});
		}
	}

	/**
	 * 执行止损
	 * Execute stop loss
	 * @private
	 */
	private async executeStopLoss(
		monitorId: string,
		threshold: DynamicThreshold,
	): Promise<void> {
		// 这里应该调用交易所API执行止损
		// Here you should call the exchange API to execute stop loss
		logger.info(`Executing stop loss for monitor ${monitorId}`, { threshold });
	}

	/**
	 * 执行止盈
	 * Execute take profit
	 * @private
	 */
	private async executeTakeProfit(
		monitorId: string,
		threshold: DynamicThreshold,
	): Promise<void> {
		// 这里应该调用交易所API执行止盈
		// Here you should call the exchange API to execute take profit
		logger.info(`Executing take profit for monitor ${monitorId}`, {
			threshold,
		});
	}

	/**
	 * 执行移动止损
	 * Execute trailing stop
	 * @private
	 */
	private async executeTrailingStop(
		monitorId: string,
		threshold: DynamicThreshold,
	): Promise<void> {
		// 这里应该调用交易所API执行移动止损
		// Here you should call the exchange API to execute trailing stop
		logger.info(`Executing trailing stop for monitor ${monitorId}`, {
			threshold,
		});
	}

	/**
	 * 执行分批止盈
	 * Execute partial profit
	 * @private
	 */
	private async executePartialProfit(
		monitorId: string,
		threshold: DynamicThreshold,
	): Promise<void> {
		// 这里应该调用交易所API执行分批止盈
		// Here you should call the exchange API to execute partial profit
		logger.info(`Executing partial profit for monitor ${monitorId}`, {
			threshold,
		});
	}

	/**
	 * 设置系统间事件监听
	 * Set up inter-system event listening
	 * @private
	 */
	private setupInterSystemEventListening(): void {
		// 监听空窗期接管事件 - Listen to gap period takeover events
		this.gapPeriodTakeover.on("takeoverTriggered", (data) => {
			// 转发事件 - Forward event
			this.emit("gapPeriodTakeoverTriggered", data);
		});

		// 监听分批平仓事件 - Listen to batch closing events
		this.batchClosingSystem.on("batchExecuted", (data) => {
			// 转发事件 - Forward event
			this.emit("batchClosingExecuted", data);
		});

		// 监听阈值事件 - Listen to threshold events
		this.dynamicThresholdSetting.on("thresholdTriggered", (data) => {
			// 转发事件 - Forward event
			this.emit("thresholdTriggered", data);
		});

		// 监听AI参数控制事件 - Listen to AI parameter control events
		this.aiParameterControl.on("parameterActivated", (data) => {
			// 转发事件 - Forward event
			this.emit("aiParameterActivated", data);
		});

		// 监听开仓监控关联事件 - Listen to opening monitoring association events
		this.openingMonitoringAssociation.on("monitoringStarted", (data) => {
			// 转发事件 - Forward event
			this.emit("monitoringStarted", data);
		});

		// 监听分批平仓指令识别事件 - Listen to batch closing instruction recognizer events
		this.batchClosingInstructionRecognizer.on(
			"instructionRecognized",
			(data) => {
				// 转发事件 - Forward event
				this.emit("batchClosingInstructionRecognized", data);
			},
		);
	}

	/**
	 * 验证监控器配置
	 * Validate monitor configuration
	 * @private
	 */
	private validateMonitorConfig(config: CaiSenMonitorConfig): {
		valid: boolean;
		errorMessage?: string;
	} {
		if (!config.monitorId) {
			return { valid: false, errorMessage: "Monitor ID is required" };
		}

		if (!config.positionId) {
			return { valid: false, errorMessage: "Position ID is required" };
		}

		if (!config.symbol) {
			return { valid: false, errorMessage: "Symbol is required" };
		}

		if (!config.direction || !["long", "short"].includes(config.direction)) {
			return {
				valid: false,
				errorMessage: 'Direction must be either "long" or "short"',
			};
		}

		if (!config.monitoringTypes || config.monitoringTypes.length === 0) {
			return {
				valid: false,
				errorMessage: "Monitoring types must be specified",
			};
		}

		if (!config.monitoringInterval || config.monitoringInterval <= 0) {
			return {
				valid: false,
				errorMessage: "Monitoring interval must be greater than 0",
			};
		}

		if (
			!config.dataSource ||
			!["exchange", "database", "cache", "custom"].includes(config.dataSource)
		) {
			return {
				valid: false,
				errorMessage:
					'Data source must be one of "exchange", "database", "cache", or "custom"',
			};
		}

		if (config.dataSource === "custom" && !config.customDataSource) {
			return {
				valid: false,
				errorMessage:
					'Custom data source function is required when data source is "custom"',
			};
		}

		return { valid: true };
	}
}

/**
 * 创建蔡森监控器独立系统实例
 * Create CaiSen monitor independent system instance
 *
 * @param gapPeriodTakeover 空窗期接管系统 - Gap period takeover system
 * @param batchClosingSystem 分批平仓系统 - Batch closing system
 * @param aiParameterControl AI参数控制系统 - AI parameter control system
 * @param openingMonitoringAssociation 开仓监控关联系统 - Opening monitoring association system
 * @param batchClosingInstructionRecognizer 分批平仓指令识别系统 - Batch closing instruction recognizer system
 * @param dynamicThresholdSetting 动态阈值设定系统 - Dynamic threshold setting system
 * @param standardizedInterface 标准化接口 - Standardized interface
 * @returns CaiSenMonitorIndependentSystem 蔡森监控器独立系统实例 - CaiSen monitor independent system instance
 */
export function createCaiSenMonitorIndependentSystem(
	gapPeriodTakeover: CaiSenGapPeriodTakeover,
	batchClosingSystem: CaiSenBatchClosingSystem,
	aiParameterControl: CaiSenAiParameterControl,
	openingMonitoringAssociation: CaiSenOpeningMonitoringAssociation,
	batchClosingInstructionRecognizer: CaiSenBatchClosingInstructionRecognizer,
	dynamicThresholdSetting: CaiSenDynamicThresholdSetting,
	standardizedInterface: CaiSenStandardizedInterface,
): CaiSenMonitorIndependentSystem {
	return new CaiSenMonitorIndependentSystem(
		gapPeriodTakeover,
		batchClosingSystem,
		aiParameterControl,
		openingMonitoringAssociation,
		batchClosingInstructionRecognizer,
		dynamicThresholdSetting,
		standardizedInterface,
	);
}
