/**
 * 蔡森策略分批平仓指令识别系统
 * CaiSen Strategy Batch Closing Instruction Recognition System
 *
 * 该模块负责识别和解析蔡森Agent发起的分批平仓指令及相关参数
 * This module is responsible for recognizing and parsing batch closing instructions and related parameters initiated by the CaiSen Agent
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "events";
import type { IExchangeClient } from "../../../services/exchangeClient";
import type { StrategyParams } from "../../../strategies/types";
import { logger } from "../../../utils/loggerUtils";
import {
	type CaiSenAiParameterControl,
	ClosingParameterDetail,
	createCaiSenAiParameterControl,
} from "../ai-parameter-control";
import {
	type AiClosingParams,
	type BatchConfig,
	type CaiSenBatchClosingSystem,
	ClosingType,
	DEFAULT_BATCH_CLOSING_CONFIG,
	createCaiSenBatchClosingSystem,
} from "../batch-closing";

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
 * 指令类型枚举
 * Instruction Type Enumeration
 */
export enum InstructionType {
	BATCH_CLOSING = "batch_closing", // 分批平仓 - Batch closing
	EMERGENCY_CLOSING = "emergency_closing", // 紧急平仓 - Emergency closing
	MODIFY_BATCH_PARAMS = "modify_batch_params", // 修改分批参数 - Modify batch parameters
	CANCEL_BATCH_CLOSING = "cancel_batch_closing", // 取消分批平仓 - Cancel batch closing
	PAUSE_BATCH_CLOSING = "pause_batch_closing", // 暂停分批平仓 - Pause batch closing
	RESUME_BATCH_CLOSING = "resume_batch_closing", // 恢复分批平仓 - Resume batch closing
}

/**
 * 指令状态枚举
 * Instruction Status Enumeration
 */
export enum InstructionStatus {
	PENDING = "pending", // 待处理 - Pending
	VALIDATING = "validating", // 验证中 - Validating
	VALIDATED = "validated", // 已验证 - Validated
	EXECUTING = "executing", // 执行中 - Executing
	COMPLETED = "completed", // 已完成 - Completed
	FAILED = "failed", // 失败 - Failed
	CANCELLED = "cancelled", // 已取消 - Cancelled
}

/**
 * 指令来源枚举
 * Instruction Source Enumeration
 */
export enum InstructionSource {
	AI_AGENT = "ai_agent", // AI代理 - AI Agent
	MANUAL = "manual", // 手动 - Manual
	SYSTEM = "system", // 系统 - System
	API = "api", // API - API
}

/**
 * 指令优先级枚举
 * Instruction Priority Enumeration
 */
export enum InstructionPriority {
	LOW = 1, // 低 - Low
	NORMAL = 2, // 正常 - Normal
	HIGH = 3, // 高 - High
	CRITICAL = 4, // 紧急 - Critical
}

/**
 * 分批平仓指令接口
 * Batch Closing Instruction Interface
 */
export interface BatchClosingInstruction {
	/** 指令ID - Instruction ID */
	instructionId: string;

	/** 指令类型 - Instruction type */
	type: InstructionType;

	/** 指令状态 - Instruction status */
	status: InstructionStatus;

	/** 指令来源 - Instruction source */
	source: InstructionSource;

	/** 指令优先级 - Instruction priority */
	priority: InstructionPriority;

	/** 持仓ID - Position ID */
	positionId: string;

	/** 交易对 - Symbol */
	symbol: string;

	/** 方向 - Direction */
	direction: "long" | "short";

	/** 总数量 - Total quantity */
	totalQuantity: number;

	/** 分批配置 - Batch configuration */
	batchConfig: BatchConfig;

	/** 触发条件 - Trigger conditions */
	triggerConditions?: TriggerCondition[];

	/** 执行参数 - Execution parameters */
	executionParams?: ExecutionParameters;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 更新时间 - Update time */
	updatedAt: number;

	/** 执行时间 - Execution time */
	executedAt?: number;

	/** 完成时间 - Completion time */
	completedAt?: number;

	/** 过期时间 - Expiration time */
	expiresAt?: number;

	/** 错误信息 - Error message */
	errorMessage?: string;

	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 触发条件接口
 * Trigger Condition Interface
 */
export interface TriggerCondition {
	/** 条件ID - Condition ID */
	conditionId: string;

	/** 条件类型 - Condition type */
	type: "price" | "time" | "pnl" | "volume" | "indicator";

	/** 条件参数 - Condition parameters */
	parameters: Record<string, any>;

	/** 是否启用 - Whether enabled */
	enabled: boolean;

	/** 是否已触发 - Whether triggered */
	triggered: boolean;

	/** 触发时间 - Trigger time */
	triggeredAt?: number;
}

/**
 * 执行参数接口
 * Execution Parameters Interface
 */
export interface ExecutionParameters {
	/** 是否启用限价单 - Whether to use limit orders */
	useLimitOrders: boolean;

	/** 限价单偏移 - Limit order offset */
	limitOrderOffset: number;

	/** 是否启用IOC订单 - Whether to use IOC orders */
	useIocOrders: boolean;

	/** 执行间隔 - Execution interval */
	executionInterval: number;

	/** 最大重试次数 - Maximum retry count */
	maxRetries: number;

	/** 重试延迟 - Retry delay */
	retryDelay: number;
}

/**
 * 指令识别配置接口
 * Instruction Recognition Configuration Interface
 */
export interface InstructionRecognitionConfig {
	/** 是否启用自动验证 - Whether to enable automatic validation */
	enableAutoValidation: boolean;

	/** 是否启用自动执行 - Whether to enable automatic execution */
	enableAutoExecution: boolean;

	/** 指令验证超时时间 - Instruction validation timeout */
	validationTimeout: number;

	/** 指令执行超时时间 - Instruction execution timeout */
	executionTimeout: number;

	/** 是否启用指令过期 - Whether to enable instruction expiration */
	enableInstructionExpiration: boolean;

	/** 默认指令过期时间 - Default instruction expiration time */
	defaultInstructionExpiration: number;

	/** 是否启用指令优先级排序 - Whether to enable instruction priority sorting */
	enablePrioritySorting: boolean;

	/** 是否启用指令去重 - Whether to enable instruction deduplication */
	enableInstructionDeduplication: boolean;

	/** 指令去重时间窗口 - Instruction deduplication time window */
	deduplicationTimeWindow: number;
}

/**
 * 蔡森策略分批平仓指令识别系统类
 * CaiSen Strategy Batch Closing Instruction Recognition System Class
 */
export class CaiSenBatchClosingInstructionRecognizer extends EventEmitter {
	private config: InstructionRecognitionConfig;
	private batchClosingSystem: CaiSenBatchClosingSystem;
	private aiParameterControl: CaiSenAiParameterControl;
	private exchangeClient: IExchangeClient;

	// 存储指令 - Storage instructions
	private instructions: Map<string, BatchClosingInstruction> = new Map();

	// 索引 - Indexes
	private positionIdToInstructionIds: Map<string, string[]> = new Map();
	private statusToInstructionIds: Map<InstructionStatus, string[]> = new Map();

	// 定时器 - Timers
	private validationTimer: NodeJS.Timeout | null = null;
	private executionTimer: NodeJS.Timeout | null = null;
	private expirationTimer: NodeJS.Timeout | null = null;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param config 识别配置 - Recognition configuration
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 * @param aiParameterControl AI参数控制系统 - AI parameter control system
	 * @param exchangeClient 交易所客户端 - Exchange client
	 */
	constructor(
		config: InstructionRecognitionConfig,
		batchClosingSystem: CaiSenBatchClosingSystem,
		aiParameterControl: CaiSenAiParameterControl,
		exchangeClient: IExchangeClient,
	) {
		super();

		this.config = config;
		this.batchClosingSystem = batchClosingSystem;
		this.aiParameterControl = aiParameterControl;
		this.exchangeClient = exchangeClient;

		// 初始化状态索引 - Initialize status index
		Object.values(InstructionStatus).forEach((status) => {
			this.statusToInstructionIds.set(status as InstructionStatus, []);
		});

		// 启动定时器 - Start timers
		this.startValidationTimer();
		this.startExecutionTimer();
		this.startExpirationTimer();

		logger.info("CaiSen Batch Closing Instruction Recognizer initialized", {
			config,
		});
	}

	/**
	 * 识别和解析分批平仓指令
	 * Recognize and parse batch closing instruction
	 *
	 * @param instructionData 指令数据 - Instruction data
	 * @param source 指令来源 - Instruction source
	 * @param priority 指令优先级 - Instruction priority
	 * @param metadata 元数据 - Metadata
	 * @returns string | null 指令ID - Instruction ID
	 */
	recognizeBatchClosingInstruction(
		instructionData: any,
		source: InstructionSource = InstructionSource.AI_AGENT,
		priority: InstructionPriority = InstructionPriority.NORMAL,
		metadata?: Record<string, any>,
	): string | null {
		try {
			// 生成指令ID - Generate instruction ID
			const instructionId = `ins_batch_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`;

			// 解析指令数据 - Parse instruction data
			const parsedInstruction = this.parseInstructionData(instructionData);
			if (!parsedInstruction) {
				logger.error("解析指令数据失败", { instructionData });
				return null;
			}

			// 创建指令对象 - Create instruction object
			const now = Date.now();
			const instruction: BatchClosingInstruction = {
				instructionId,
				type: InstructionType.BATCH_CLOSING,
				status: InstructionStatus.PENDING,
				source,
				priority,
				positionId: parsedInstruction.positionId,
				symbol: parsedInstruction.symbol,
				direction: parsedInstruction.direction,
				totalQuantity: parsedInstruction.totalQuantity,
				batchConfig: parsedInstruction.batchConfig,
				triggerConditions: parsedInstruction.triggerConditions,
				executionParams: parsedInstruction.executionParams,
				createdAt: now,
				updatedAt: now,
				expiresAt: this.config.enableInstructionExpiration
					? now + this.config.defaultInstructionExpiration
					: undefined,
				metadata,
			};

			// 检查指令去重 - Check instruction deduplication
			if (
				this.config.enableInstructionDeduplication &&
				this.isDuplicateInstruction(instruction)
			) {
				logger.warn("Duplicate instruction detected", {
					instructionId,
					positionId: instruction.positionId,
				});
				return null;
			}

			// 存储指令 - Store instruction
			this.instructions.set(instructionId, instruction);

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出指令识别事件 - Emit instruction recognition event
			this.emit("instructionRecognized", { instructionId, instruction });

			logger.info("Batch closing instruction recognized", {
				instructionId,
				positionId: instruction.positionId,
				symbol: instruction.symbol,
				direction: instruction.direction,
				totalQuantity: instruction.totalQuantity,
				source,
				priority,
			});

			// 如果启用自动验证，开始验证
			// If auto validation is enabled, start validation
			if (this.config.enableAutoValidation) {
				this.validateInstruction(instructionId);
			}

			return instructionId;
		} catch (error) {
			logger.error("识别批量平仓指令时出错", { error, instructionData });
			return null;
		}
	}

	/**
	 * 识别和解析紧急平仓指令
	 * Recognize and parse emergency closing instruction
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param symbol 交易对 - Symbol
	 * @param direction 方向 - Direction
	 * @param totalQuantity 总数量 - Total quantity
	 * @param source 指令来源 - Instruction source
	 * @param metadata 元数据 - Metadata
	 * @returns string | null 指令ID - Instruction ID
	 */
	recognizeEmergencyClosingInstruction(
		positionId: string,
		symbol: string,
		direction: "long" | "short",
		totalQuantity: number,
		source: InstructionSource = InstructionSource.AI_AGENT,
		metadata?: Record<string, any>,
	): string | null {
		try {
			// 生成指令ID - Generate instruction ID
			const instructionId = `ins_emergency_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`;

			// 创建紧急平仓指令对象 - Create emergency closing instruction object
			const now = Date.now();
			const instruction: BatchClosingInstruction = {
				instructionId,
				type: InstructionType.EMERGENCY_CLOSING,
				status: InstructionStatus.PENDING,
				source,
				priority: InstructionPriority.CRITICAL,
				positionId,
				symbol,
				direction,
				totalQuantity,
				batchConfig: {
					batchId: "emergency_batch",
					positionId: positionId,
					closingType: ClosingType.TAKE_PROFIT,
					closingRatio: 1.0,
					closingQuantity: totalQuantity,
					triggerCondition: {
						triggerType: "price",
						triggerValue: direction === "long" ? 0 : Number.MAX_SAFE_INTEGER,
						operator: direction === "long" ? "<" : ">",
					},
					priority: 1,
					createdAt: now,
				},
				executionParams: {
					useLimitOrders: false,
					limitOrderOffset: 0,
					useIocOrders: true,
					executionInterval: 0,
					maxRetries: 3,
					retryDelay: 1000,
				},
				createdAt: now,
				updatedAt: now,
				metadata: {
					...metadata,
					emergency: true,
				},
			};

			// 存储指令 - Store instruction
			this.instructions.set(instructionId, instruction);

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出指令识别事件 - Emit instruction recognition event
			this.emit("instructionRecognized", { instructionId, instruction });

			logger.info("Emergency closing instruction recognized", {
				instructionId,
				positionId,
				symbol,
				direction,
				totalQuantity,
				source,
			});

			// 紧急指令立即验证和执行
			// Emergency instructions are immediately validated and executed
			this.validateInstruction(instructionId);

			return instructionId;
		} catch (error) {
			logger.error("识别紧急平仓指令时出错", {
				error,
				positionId,
				symbol,
				direction,
				totalQuantity,
			});
			return null;
		}
	}

	/**
	 * 识别和解析修改分批参数指令
	 * Recognize and parse modify batch parameters instruction
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param newBatchConfig 新的分批配置 - New batch configuration
	 * @param source 指令来源 - Instruction source
	 * @param metadata 元数据 - Metadata
	 * @returns string | null 指令ID - Instruction ID
	 */
	recognizeModifyBatchParamsInstruction(
		positionId: string,
		newBatchConfig: BatchConfig,
		source: InstructionSource = InstructionSource.AI_AGENT,
		metadata?: Record<string, any>,
	): string | null {
		try {
			// 生成指令ID - Generate instruction ID
			const instructionId = `ins_modify_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`;

			// 查找现有指令 - Find existing instruction
			const existingInstructionIds =
				this.positionIdToInstructionIds.get(positionId) || [];
			let existingInstruction: BatchClosingInstruction | null = null;

			for (const existingInstructionId of existingInstructionIds) {
				const instruction = this.instructions.get(existingInstructionId);
				if (
					instruction &&
					(instruction.type === InstructionType.BATCH_CLOSING ||
						instruction.type === InstructionType.MODIFY_BATCH_PARAMS) &&
					instruction.status !== InstructionStatus.COMPLETED &&
					instruction.status !== InstructionStatus.FAILED &&
					instruction.status !== InstructionStatus.CANCELLED
				) {
					existingInstruction = instruction;
					break;
				}
			}

			if (!existingInstruction) {
				logger.error(
					"No existing batch closing instruction found for modification",
					{ positionId },
				);
				return null;
			}

			// 创建修改分批参数指令对象 - Create modify batch parameters instruction object
			const now = Date.now();
			const instruction: BatchClosingInstruction = {
				instructionId,
				type: InstructionType.MODIFY_BATCH_PARAMS,
				status: InstructionStatus.PENDING,
				source,
				priority: existingInstruction.priority,
				positionId,
				symbol: existingInstruction.symbol,
				direction: existingInstruction.direction,
				totalQuantity: existingInstruction.totalQuantity,
				batchConfig: newBatchConfig,
				triggerConditions: existingInstruction.triggerConditions,
				executionParams: existingInstruction.executionParams,
				createdAt: now,
				updatedAt: now,
				metadata: {
					...metadata,
					originalInstructionId: existingInstruction.instructionId,
				},
			};

			// 存储指令 - Store instruction
			this.instructions.set(instructionId, instruction);

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出指令识别事件 - Emit instruction recognition event
			this.emit("instructionRecognized", { instructionId, instruction });

			logger.info("Modify batch parameters instruction recognized", {
				instructionId,
				positionId,
				originalInstructionId: existingInstruction.instructionId,
				source,
			});

			// 立即验证修改指令
			// Immediately validate modification instruction
			this.validateInstruction(instructionId);

			return instructionId;
		} catch (error) {
			logger.error("识别修改批量参数指令时出错", {
				error,
				positionId,
				newBatchConfig,
			});
			return null;
		}
	}

	/**
	 * 识别和解析取消分批平仓指令
	 * Recognize and parse cancel batch closing instruction
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param source 指令来源 - Instruction source
	 * @param metadata 元数据 - Metadata
	 * @returns string | null 指令ID - Instruction ID
	 */
	recognizeCancelBatchClosingInstruction(
		positionId: string,
		source: InstructionSource = InstructionSource.AI_AGENT,
		metadata?: Record<string, any>,
	): string | null {
		try {
			// 生成指令ID - Generate instruction ID
			const instructionId = `ins_cancel_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`;

			// 查找现有指令 - Find existing instruction
			const existingInstructionIds =
				this.positionIdToInstructionIds.get(positionId) || [];
			let existingInstruction: BatchClosingInstruction | null = null;

			for (const existingInstructionId of existingInstructionIds) {
				const instruction = this.instructions.get(existingInstructionId);
				if (
					instruction &&
					(instruction.type === InstructionType.BATCH_CLOSING ||
						instruction.type === InstructionType.PAUSE_BATCH_CLOSING) &&
					instruction.status !== InstructionStatus.COMPLETED &&
					instruction.status !== InstructionStatus.FAILED &&
					instruction.status !== InstructionStatus.CANCELLED
				) {
					existingInstruction = instruction;
					break;
				}
			}

			if (!existingInstruction) {
				logger.error(
					"No existing batch closing instruction found for cancellation",
					{ positionId },
				);
				return null;
			}

			// 创建取消分批平仓指令对象 - Create cancel batch closing instruction object
			const now = Date.now();
			const instruction: BatchClosingInstruction = {
				instructionId,
				type: InstructionType.CANCEL_BATCH_CLOSING,
				status: InstructionStatus.PENDING,
				source,
				priority: InstructionPriority.HIGH,
				positionId,
				symbol: existingInstruction.symbol,
				direction: existingInstruction.direction,
				totalQuantity: existingInstruction.totalQuantity,
				batchConfig: existingInstruction.batchConfig,
				triggerConditions: existingInstruction.triggerConditions,
				executionParams: existingInstruction.executionParams,
				createdAt: now,
				updatedAt: now,
				metadata: {
					...metadata,
					originalInstructionId: existingInstruction.instructionId,
				},
			};

			// 存储指令 - Store instruction
			this.instructions.set(instructionId, instruction);

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出指令识别事件 - Emit instruction recognition event
			this.emit("instructionRecognized", { instructionId, instruction });

			logger.info("Cancel batch closing instruction recognized", {
				instructionId,
				positionId,
				originalInstructionId: existingInstruction.instructionId,
				source,
			});

			// 立即验证取消指令
			// Immediately validate cancellation instruction
			this.validateInstruction(instructionId);

			return instructionId;
		} catch (error) {
			logger.error("识别取消批量平仓指令时出错", { error, positionId });
			return null;
		}
	}

	/**
	 * 验证指令
	 * Validate instruction
	 *
	 * @param instructionId 指令ID - Instruction ID
	 * @returns Promise<boolean> 验证是否成功 - Whether validation was successful
	 */
	async validateInstruction(instructionId: string): Promise<boolean> {
		try {
			const instruction = this.instructions.get(instructionId);
			if (!instruction) {
				logger.error("Instruction not found for validation", { instructionId });
				return false;
			}

			// 更新状态为验证中 - Update status to validating
			instruction.status = InstructionStatus.VALIDATING;
			instruction.updatedAt = Date.now();

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出验证开始事件 - Emit validation start event
			this.emit("validationStarted", { instructionId, instruction });

			// 根据指令类型进行验证
			// Validate based on instruction type
			let isValid = false;

			switch (instruction.type) {
				case InstructionType.BATCH_CLOSING:
					isValid = await this.validateBatchClosingInstruction(instruction);
					break;

				case InstructionType.EMERGENCY_CLOSING:
					isValid = await this.validateEmergencyClosingInstruction(instruction);
					break;

				case InstructionType.MODIFY_BATCH_PARAMS:
					isValid =
						await this.validateModifyBatchParamsInstruction(instruction);
					break;

				case InstructionType.CANCEL_BATCH_CLOSING:
					isValid =
						await this.validateCancelBatchClosingInstruction(instruction);
					break;

				default:
					logger.error("Unknown instruction type for validation", {
						instructionId,
						type: instruction.type,
					});
					return false;
			}

			if (isValid) {
				// 更新状态为已验证 - Update status to validated
				instruction.status = InstructionStatus.VALIDATED;
				instruction.updatedAt = Date.now();

				// 发出验证成功事件 - Emit validation success event
				this.emit("validationSucceeded", { instructionId, instruction });

				logger.info("Instruction validation succeeded", { instructionId });

				// 如果启用自动执行，开始执行
				// If auto execution is enabled, start execution
				if (this.config.enableAutoExecution) {
					this.executeInstruction(instructionId);
				}

				return true;
			} else {
				// 更新状态为失败 - Update status to failed
				instruction.status = InstructionStatus.FAILED;
				instruction.updatedAt = Date.now();
				instruction.errorMessage = "Instruction validation failed";

				// 发出验证失败事件 - Emit validation failure event
				this.emit("validationFailed", { instructionId, instruction });

				logger.error("指令验证失败", { instructionId });

				return false;
			}
		} catch (error) {
			// 更新状态为失败 - Update status to failed
			const instruction = this.instructions.get(instructionId);
			if (instruction) {
				instruction.status = InstructionStatus.FAILED;
				instruction.updatedAt = Date.now();
				instruction.errorMessage =
					error instanceof Error ? error.message : String(error);
			}

			// 发出验证错误事件 - Emit validation error event
			this.emit("validationError", { instructionId, error });

			logger.error("验证指令时出错", { error, instructionId });

			return false;
		}
	}

	/**
	 * 执行指令
	 * Execute instruction
	 *
	 * @param instructionId 指令ID - Instruction ID
	 * @returns Promise<boolean> 执行是否成功 - Whether execution was successful
	 */
	async executeInstruction(instructionId: string): Promise<boolean> {
		try {
			const instruction = this.instructions.get(instructionId);
			if (!instruction) {
				logger.error("Instruction not found for execution", { instructionId });
				return false;
			}

			// 更新状态为执行中 - Update status to executing
			instruction.status = InstructionStatus.EXECUTING;
			instruction.updatedAt = Date.now();
			instruction.executedAt = Date.now();

			// 更新索引 - Update indexes
			this.updateIndexes(instruction);

			// 发出执行开始事件 - Emit execution start event
			this.emit("executionStarted", { instructionId, instruction });

			// 根据指令类型进行执行
			// Execute based on instruction type
			let isSuccess = false;

			switch (instruction.type) {
				case InstructionType.BATCH_CLOSING:
					isSuccess = await this.executeBatchClosingInstruction(instruction);
					break;

				case InstructionType.EMERGENCY_CLOSING:
					isSuccess =
						await this.executeEmergencyClosingInstruction(instruction);
					break;

				case InstructionType.MODIFY_BATCH_PARAMS:
					isSuccess =
						await this.executeModifyBatchParamsInstruction(instruction);
					break;

				case InstructionType.CANCEL_BATCH_CLOSING:
					isSuccess =
						await this.executeCancelBatchClosingInstruction(instruction);
					break;

				default:
					logger.error("Unknown instruction type for execution", {
						instructionId,
						type: instruction.type,
					});
					return false;
			}

			if (isSuccess) {
				// 更新状态为已完成 - Update status to completed
				instruction.status = InstructionStatus.COMPLETED;
				instruction.updatedAt = Date.now();
				instruction.completedAt = Date.now();

				// 更新索引 - Update indexes
				this.updateIndexes(instruction);

				// 发出执行成功事件 - Emit execution success event
				this.emit("executionSucceeded", { instructionId, instruction });

				logger.info("Instruction execution succeeded", { instructionId });

				return true;
			} else {
				// 更新状态为失败 - Update status to failed
				instruction.status = InstructionStatus.FAILED;
				instruction.updatedAt = Date.now();
				instruction.errorMessage = "Instruction execution failed";

				// 更新索引 - Update indexes
				this.updateIndexes(instruction);

				// 发出执行失败事件 - Emit execution failure event
				this.emit("executionFailed", { instructionId, instruction });

				logger.error("指令执行失败", { instructionId });

				return false;
			}
		} catch (error) {
			// 更新状态为失败 - Update status to failed
			const instruction = this.instructions.get(instructionId);
			if (instruction) {
				instruction.status = InstructionStatus.FAILED;
				instruction.updatedAt = Date.now();
				instruction.errorMessage =
					error instanceof Error ? error.message : String(error);

				// 更新索引 - Update indexes
				this.updateIndexes(instruction);
			}

			// 发出执行错误事件 - Emit execution error event
			this.emit("executionError", { instructionId, error });

			logger.error("执行指令时出错", { error, instructionId });

			return false;
		}
	}

	/**
	 * 获取指令
	 * Get instruction
	 *
	 * @param instructionId 指令ID - Instruction ID
	 * @returns BatchClosingInstruction | null 指令 - Instruction
	 */
	getInstruction(instructionId: string): BatchClosingInstruction | null {
		return this.instructions.get(instructionId) || null;
	}

	/**
	 * 根据持仓ID获取指令
	 * Get instructions by position ID
	 *
	 * @param positionId 持仓ID - Position ID
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns BatchClosingInstruction[] 指令列表 - List of instructions
	 */
	getInstructionsByPositionId(
		positionId: string,
		status?: InstructionStatus,
	): BatchClosingInstruction[] {
		const instructionIds =
			this.positionIdToInstructionIds.get(positionId) || [];
		const instructions: BatchClosingInstruction[] = [];

		for (const instructionId of instructionIds) {
			const instruction = this.instructions.get(instructionId);
			if (
				instruction &&
				(status === undefined || instruction.status === status)
			) {
				instructions.push(instruction);
			}
		}

		// 如果启用优先级排序，按优先级排序
		// If priority sorting is enabled, sort by priority
		if (this.config.enablePrioritySorting) {
			instructions.sort((a, b) => b.priority - a.priority);
		}

		return instructions;
	}

	/**
	 * 根据状态获取指令
	 * Get instructions by status
	 *
	 * @param status 状态 - Status
	 * @returns BatchClosingInstruction[] 指令列表 - List of instructions
	 */
	getInstructionsByStatus(
		status: InstructionStatus,
	): BatchClosingInstruction[] {
		const instructionIds = this.statusToInstructionIds.get(status) || [];
		const instructions: BatchClosingInstruction[] = [];

		for (const instructionId of instructionIds) {
			const instruction = this.instructions.get(instructionId);
			if (instruction) {
				instructions.push(instruction);
			}
		}

		// 如果启用优先级排序，按优先级排序
		// If priority sorting is enabled, sort by priority
		if (this.config.enablePrioritySorting) {
			instructions.sort((a, b) => b.priority - a.priority);
		}

		return instructions;
	}

	/**
	 * 获取所有指令
	 * Get all instructions
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns BatchClosingInstruction[] 所有指令 - All instructions
	 */
	getAllInstructions(status?: InstructionStatus): BatchClosingInstruction[] {
		const instructions = Array.from(this.instructions.values());

		if (status !== undefined) {
			return instructions.filter(
				(instruction) => instruction.status === status,
			);
		}

		// 如果启用优先级排序，按优先级排序
		// If priority sorting is enabled, sort by priority
		if (this.config.enablePrioritySorting) {
			instructions.sort((a, b) => b.priority - a.priority);
		}

		return instructions;
	}

	/**
	 * 更新识别配置
	 * Update recognition configuration
	 *
	 * @param newConfig 新配置 - New configuration
	 * @returns boolean 更新是否成功 - Whether update was successful
	 */
	updateConfig(newConfig: Partial<InstructionRecognitionConfig>): boolean {
		try {
			this.config = { ...this.config, ...newConfig };

			// 重启定时器以应用新配置 - Restart timers to apply new configuration
			this.restartValidationTimer();
			this.restartExecutionTimer();
			this.restartExpirationTimer();

			// 发出配置更新事件 - Emit configuration update event
			this.emit("configUpdated", { config: this.config });

			logger.info("批量平仓指令识别器配置已更新", { newConfig });

			return true;
		} catch (error) {
			logger.error("更新批量平仓指令识别器配置时出错", { error, newConfig });
			return false;
		}
	}

	/**
	 * 解析指令数据
	 * Parse instruction data
	 * @private
	 */
	private parseInstructionData(instructionData: any): any | null {
		try {
			// 检查必需字段 - Check required fields
			if (
				!instructionData.positionId ||
				!instructionData.symbol ||
				!instructionData.direction ||
				!instructionData.totalQuantity
			) {
				logger.error("Missing required fields in instruction data", {
					instructionData,
				});
				return null;
			}

			// 解析分批配置 - Parse batch configuration
			let batchConfig: BatchConfig;
			if (instructionData.batchConfig) {
				batchConfig = instructionData.batchConfig;
			} else {
				// 使用默认分批配置 - Use default batch configuration
				batchConfig = {
					batchId: "default_batch",
					positionId: instructionData.positionId,
					closingType: ClosingType.TAKE_PROFIT,
					closingRatio: 1.0,
					closingQuantity: instructionData.totalQuantity,
					triggerCondition: {
						triggerType: "price",
						triggerValue:
							instructionData.direction === "long"
								? instructionData.avgPrice * 1.05
								: instructionData.avgPrice * 0.95,
						operator: instructionData.direction === "long" ? ">" : "<",
					},
					priority: 1,
					createdAt: Date.now(),
				};
			}

			// 解析触发条件 - Parse trigger conditions
			let triggerConditions: TriggerCondition[] | undefined;
			if (
				instructionData.triggerConditions &&
				Array.isArray(instructionData.triggerConditions)
			) {
				triggerConditions = instructionData.triggerConditions.map(
					(condition: any, index: number) => ({
						conditionId: condition.conditionId || `condition_${index}`,
						type: condition.type || "price",
						parameters: condition.parameters || {},
						enabled: condition.enabled !== false,
						triggered: false,
					}),
				);
			}

			// 解析执行参数 - Parse execution parameters
			let executionParams: ExecutionParameters;
			if (instructionData.executionParams) {
				executionParams = instructionData.executionParams;
			} else {
				// 使用默认执行参数 - Use default execution parameters
				executionParams = {
					useLimitOrders: true,
					limitOrderOffset: 0.001,
					useIocOrders: false,
					executionInterval: 5000,
					maxRetries: 3,
					retryDelay: 2000,
				};
			}

			return {
				positionId: instructionData.positionId,
				symbol: instructionData.symbol,
				direction: instructionData.direction,
				totalQuantity: instructionData.totalQuantity,
				batchConfig,
				triggerConditions,
				executionParams,
			};
		} catch (error) {
			logger.error("解析指令数据时出错", { error, instructionData });
			return null;
		}
	}

	/**
	 * 检查是否为重复指令
	 * Check if instruction is duplicate
	 * @private
	 */
	private isDuplicateInstruction(
		instruction: BatchClosingInstruction,
	): boolean {
		try {
			const positionInstructions = this.getInstructionsByPositionId(
				instruction.positionId,
			);

			for (const existingInstruction of positionInstructions) {
				// 检查时间窗口内的相同类型指令
				// Check for same type instructions within time window
				if (
					existingInstruction.type === instruction.type &&
					existingInstruction.status !== InstructionStatus.COMPLETED &&
					existingInstruction.status !== InstructionStatus.FAILED &&
					existingInstruction.status !== InstructionStatus.CANCELLED &&
					Math.abs(existingInstruction.createdAt - instruction.createdAt) <
						this.config.deduplicationTimeWindow
				) {
					return true;
				}
			}

			return false;
		} catch (error) {
			logger.error("检查重复指令时出错", { error, instruction });
			return false;
		}
	}

	/**
	 * 更新索引
	 * Update indexes
	 * @private
	 */
	private updateIndexes(instruction: BatchClosingInstruction): void {
		try {
			// 更新持仓ID到指令ID的索引 - Update position ID to instruction ID index
			if (!this.positionIdToInstructionIds.has(instruction.positionId)) {
				this.positionIdToInstructionIds.set(instruction.positionId, []);
			}

			const positionInstructionIds = this.positionIdToInstructionIds.get(
				instruction.positionId,
			)!;
			if (!positionInstructionIds.includes(instruction.instructionId)) {
				positionInstructionIds.push(instruction.instructionId);
			}

			// 更新状态到指令ID的索引 - Update status to instruction ID index
			for (const [
				status,
				instructionIds,
			] of this.statusToInstructionIds.entries()) {
				const index = instructionIds.indexOf(instruction.instructionId);
				if (status === instruction.status) {
					if (index === -1) {
						instructionIds.push(instruction.instructionId);
					}
				} else if (index !== -1) {
					instructionIds.splice(index, 1);
				}
			}
		} catch (error) {
			logger.error("更新索引时出错", { error, instruction });
		}
	}

	/**
	 * 验证分批平仓指令
	 * Validate batch closing instruction
	 * @private
	 */
	private async validateBatchClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 验证基本参数 - Validate basic parameters
			if (instruction.totalQuantity <= 0) {
				logger.error("Invalid total quantity", {
					instructionId: instruction.instructionId,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			// 验证分批配置 - Validate batch configuration
			if (!instruction.batchConfig) {
				logger.error("无效的批量配置", {
					instructionId: instruction.instructionId,
				});
				return false;
			}

			// 验证平仓比例 - Validate closing ratio
			if (
				instruction.batchConfig.closingRatio <= 0 ||
				instruction.batchConfig.closingRatio > 1
			) {
				logger.error("Invalid closing ratio", {
					instructionId: instruction.instructionId,
					closingRatio: instruction.batchConfig.closingRatio,
				});
				return false;
			}

			// 验证平仓数量 - Validate closing quantity
			if (
				instruction.batchConfig.closingQuantity <= 0 ||
				instruction.batchConfig.closingQuantity > instruction.totalQuantity
			) {
				logger.error("Invalid closing quantity", {
					instructionId: instruction.instructionId,
					closingQuantity: instruction.batchConfig.closingQuantity,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			// 验证触发条件 - Validate trigger condition
			if (instruction.batchConfig.triggerCondition) {
				if (instruction.batchConfig.triggerCondition.triggerValue <= 0) {
					logger.error("Invalid trigger value", {
						instructionId: instruction.instructionId,
						triggerValue: instruction.batchConfig.triggerCondition.triggerValue,
					});
					return false;
				}
			}

			// 验证执行参数 - Validate execution parameters
			if (instruction.executionParams) {
				if (instruction.executionParams.executionInterval < 0) {
					logger.error("Invalid execution interval", {
						instructionId: instruction.instructionId,
						executionInterval: instruction.executionParams.executionInterval,
					});
					return false;
				}

				if (instruction.executionParams.maxRetries < 0) {
					logger.error("Invalid max retries", {
						instructionId: instruction.instructionId,
						maxRetries: instruction.executionParams.maxRetries,
					});
					return false;
				}

				if (instruction.executionParams.retryDelay < 0) {
					logger.error("Invalid retry delay", {
						instructionId: instruction.instructionId,
						retryDelay: instruction.executionParams.retryDelay,
					});
					return false;
				}
			}

			return true;
		} catch (error) {
			logger.error("验证批量平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 验证紧急平仓指令
	 * Validate emergency closing instruction
	 * @private
	 */
	private async validateEmergencyClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 验证基本参数 - Validate basic parameters
			if (instruction.totalQuantity <= 0) {
				logger.error("Invalid total quantity", {
					instructionId: instruction.instructionId,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			// 紧急平仓指令的验证相对简单，主要是确保基本参数正确
			// Emergency closing instruction validation is relatively simple, mainly ensuring basic parameters are correct

			return true;
		} catch (error) {
			logger.error("验证紧急平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 验证修改分批参数指令
	 * Validate modify batch parameters instruction
	 * @private
	 */
	private async validateModifyBatchParamsInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 验证基本参数 - Validate basic parameters
			if (instruction.totalQuantity <= 0) {
				logger.error("Invalid total quantity", {
					instructionId: instruction.instructionId,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			// 验证新的分批配置 - Validate new batch configuration
			if (!instruction.batchConfig) {
				logger.error("无效的批量配置", {
					instructionId: instruction.instructionId,
				});
				return false;
			}

			// 验证平仓比例 - Validate closing ratio
			if (
				instruction.batchConfig.closingRatio <= 0 ||
				instruction.batchConfig.closingRatio > 1
			) {
				logger.error("Invalid closing ratio", {
					instructionId: instruction.instructionId,
					closingRatio: instruction.batchConfig.closingRatio,
				});
				return false;
			}

			// 验证平仓数量 - Validate closing quantity
			if (
				instruction.batchConfig.closingQuantity <= 0 ||
				instruction.batchConfig.closingQuantity > instruction.totalQuantity
			) {
				logger.error("Invalid closing quantity", {
					instructionId: instruction.instructionId,
					closingQuantity: instruction.batchConfig.closingQuantity,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			return true;
		} catch (error) {
			logger.error("验证修改分批参数指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 验证取消分批平仓指令
	 * Validate cancel batch closing instruction
	 * @private
	 */
	private async validateCancelBatchClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 验证基本参数 - Validate basic parameters
			if (instruction.totalQuantity <= 0) {
				logger.error("Invalid total quantity", {
					instructionId: instruction.instructionId,
					totalQuantity: instruction.totalQuantity,
				});
				return false;
			}

			// 取消指令的验证相对简单，主要是确保基本参数正确
			// Cancellation instruction validation is relatively simple, mainly ensuring basic parameters are correct

			return true;
		} catch (error) {
			logger.error("验证取消分批平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 执行分批平仓指令
	 * Execute batch closing instruction
	 * @private
	 */
	private async executeBatchClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 构建AI平仓参数 - Build AI closing parameters
			const aiParams: AiClosingParams = {
				paramId: instruction.instructionId,
				decisionId: instruction.instructionId,
				effectiveTime: instruction.createdAt,
				expiresAt: instruction.expiresAt || Date.now() + 24 * 60 * 60 * 1000, // 默认24小时后过期
				batchConfigs: [instruction.batchConfig],
				overallClosingStrategy: "batch_close",
			};

			// 设置AI平仓参数 - Set AI closing parameters
			const success =
				await this.batchClosingSystem.setAiClosingParams(aiParams);

			if (success) {
				// 触发批次执行 - Trigger batch execution
				await this.batchClosingSystem.triggerBatchExecution(
					instruction.batchConfig.batchId,
				);
			}

			return success;
		} catch (error) {
			logger.error("执行批量平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 执行紧急平仓指令
	 * Execute emergency closing instruction
	 * @private
	 */
	private async executeEmergencyClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 构建AI平仓参数 - Build AI closing parameters
			const aiParams: AiClosingParams = {
				paramId: instruction.instructionId,
				decisionId: instruction.instructionId,
				effectiveTime: instruction.createdAt,
				expiresAt: instruction.expiresAt || Date.now() + 24 * 60 * 60 * 1000, // 默认24小时后过期
				batchConfigs: [instruction.batchConfig],
				overallClosingStrategy: "full_close",
			};

			// 设置紧急平仓参数 - Set emergency closing parameters
			const success =
				await this.batchClosingSystem.setAiClosingParams(aiParams);

			if (success) {
				// 立即触发批次执行 - Immediately trigger batch execution
				await this.batchClosingSystem.triggerBatchExecution(
					instruction.batchConfig.batchId,
				);
			}

			return success;
		} catch (error) {
			logger.error("执行紧急平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 执行修改分批参数指令
	 * Execute modify batch parameters instruction
	 * @private
	 */
	private async executeModifyBatchParamsInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 取消现有的AI平仓参数 - Cancel existing AI closing parameters
			await this.batchClosingSystem.cancelAiClosingParams(
				instruction.instructionId,
			);

			// 构建新的AI平仓参数 - Build new AI closing parameters
			const aiParams: AiClosingParams = {
				paramId: instruction.instructionId,
				decisionId: instruction.instructionId,
				effectiveTime: instruction.createdAt,
				expiresAt: instruction.expiresAt || Date.now() + 24 * 60 * 60 * 1000, // 默认24小时后过期
				batchConfigs: [instruction.batchConfig],
				overallClosingStrategy: "batch_close",
			};

			// 设置新的AI平仓参数 - Set new AI closing parameters
			const success =
				await this.batchClosingSystem.setAiClosingParams(aiParams);

			return success;
		} catch (error) {
			logger.error("执行修改分批参数指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 执行取消分批平仓指令
	 * Execute cancel batch closing instruction
	 * @private
	 */
	private async executeCancelBatchClosingInstruction(
		instruction: BatchClosingInstruction,
	): Promise<boolean> {
		try {
			// 取消AI平仓参数 - Cancel AI closing parameters
			const success = await this.batchClosingSystem.cancelAiClosingParams(
				instruction.instructionId,
			);

			return success;
		} catch (error) {
			logger.error("执行取消分批平仓指令时出错", {
				error,
				instructionId: instruction.instructionId,
			});
			return false;
		}
	}

	/**
	 * 启动验证定时器
	 * Start validation timer
	 * @private
	 */
	private startValidationTimer(): void {
		if (this.validationTimer) {
			clearInterval(this.validationTimer);
		}

		this.validationTimer = setInterval(
			async () => {
				await this.processPendingValidations();
			},
			1000, // 每秒检查一次 - Check every second
		);

		logger.debug("验证计时器已启动");
	}

	/**
	 * 重启验证定时器
	 * Restart validation timer
	 * @private
	 */
	private restartValidationTimer(): void {
		this.startValidationTimer();
	}

	/**
	 * 启动执行定时器
	 * Start execution timer
	 * @private
	 */
	private startExecutionTimer(): void {
		if (this.executionTimer) {
			clearInterval(this.executionTimer);
		}

		this.executionTimer = setInterval(
			async () => {
				await this.processPendingExecutions();
			},
			1000, // 每秒检查一次 - Check every second
		);

		logger.debug("执行计时器已启动");
	}

	/**
	 * 重启执行定时器
	 * Restart execution timer
	 * @private
	 */
	private restartExecutionTimer(): void {
		this.startExecutionTimer();
	}

	/**
	 * 启动过期定时器
	 * Start expiration timer
	 * @private
	 */
	private startExpirationTimer(): void {
		if (this.expirationTimer) {
			clearInterval(this.expirationTimer);
		}

		this.expirationTimer = setInterval(
			async () => {
				await this.checkInstructionExpiration();
			},
			60000, // 每分钟检查一次 - Check every minute
		);

		logger.debug("过期计时器已启动");
	}

	/**
	 * 重启过期定时器
	 * Restart expiration timer
	 * @private
	 */
	private restartExpirationTimer(): void {
		this.startExpirationTimer();
	}

	/**
	 * 处理待验证指令
	 * Process pending validations
	 * @private
	 */
	private async processPendingValidations(): Promise<void> {
		try {
			const pendingInstructions = this.getInstructionsByStatus(
				InstructionStatus.PENDING,
			);

			for (const instruction of pendingInstructions) {
				// 检查是否已经开始验证 - Check if validation has already started
				if (instruction.status !== InstructionStatus.PENDING) {
					continue;
				}

				// 开始验证 - Start validation
				await this.validateInstruction(instruction.instructionId);
			}
		} catch (error) {
			logger.error("处理待验证指令时出错", { error });
		}
	}

	/**
	 * 处理待执行指令
	 * Process pending executions
	 * @private
	 */
	private async processPendingExecutions(): Promise<void> {
		try {
			const validatedInstructions = this.getInstructionsByStatus(
				InstructionStatus.VALIDATED,
			);

			for (const instruction of validatedInstructions) {
				// 检查是否已经开始执行 - Check if execution has already started
				if (instruction.status !== InstructionStatus.VALIDATED) {
					continue;
				}

				// 开始执行 - Start execution
				await this.executeInstruction(instruction.instructionId);
			}
		} catch (error) {
			logger.error("处理待执行指令时出错", { error });
		}
	}

	/**
	 * 检查指令过期
	 * Check instruction expiration
	 * @private
	 */
	private async checkInstructionExpiration(): Promise<void> {
		try {
			if (!this.config.enableInstructionExpiration) {
				return;
			}

			const now = Date.now();
			const activeInstructions = this.getAllInstructions().filter(
				(instruction) =>
					instruction.status !== InstructionStatus.COMPLETED &&
					instruction.status !== InstructionStatus.FAILED &&
					instruction.status !== InstructionStatus.CANCELLED &&
					instruction.expiresAt &&
					instruction.expiresAt < now,
			);

			for (const instruction of activeInstructions) {
				// 更新状态为已取消 - Update status to cancelled
				instruction.status = InstructionStatus.CANCELLED;
				instruction.updatedAt = now;
				instruction.errorMessage = "Instruction expired";

				// 更新索引 - Update indexes
				this.updateIndexes(instruction);

				// 发出指令过期事件 - Emit instruction expiration event
				this.emit("instructionExpired", {
					instructionId: instruction.instructionId,
					instruction,
				});

				logger.info("Instruction expired", {
					instructionId: instruction.instructionId,
					expiresAt: instruction.expiresAt,
				});
			}
		} catch (error) {
			logger.error("检查指令过期时出错", { error });
		}
	}

	/**
	 * 销毁实例
	 * Destroy instance
	 */
	destroy(): void {
		// 停止定时器 - Stop timers
		if (this.validationTimer) {
			clearInterval(this.validationTimer);
			this.validationTimer = null;
		}

		if (this.executionTimer) {
			clearInterval(this.executionTimer);
			this.executionTimer = null;
		}

		if (this.expirationTimer) {
			clearInterval(this.expirationTimer);
			this.expirationTimer = null;
		}

		// 移除所有监听器 - Remove all listeners
		this.removeAllListeners();

		// 清空数据 - Clear data
		this.instructions.clear();
		this.positionIdToInstructionIds.clear();
		this.statusToInstructionIds.clear();

		logger.info("CaiSen Batch Closing Instruction Recognizer destroyed");
	}
}

/**
 * 默认指令识别配置
 * Default instruction recognition configuration
 */
export const DEFAULT_INSTRUCTION_RECOGNITION_CONFIG: InstructionRecognitionConfig =
	{
		enableAutoValidation: true,
		enableAutoExecution: true,
		validationTimeout: 30 * 1000, // 30秒 - 30 seconds
		executionTimeout: 5 * 60 * 1000, // 5分钟 - 5 minutes
		enableInstructionExpiration: true,
		defaultInstructionExpiration: 24 * 60 * 60 * 1000, // 24小时 - 24 hours
		enablePrioritySorting: true,
		enableInstructionDeduplication: true,
		deduplicationTimeWindow: 60 * 1000, // 1分钟 - 1 minute
	};

/**
 * 创建蔡森分批平仓指令识别器实例的工厂函数
 * Factory function to create a CaiSen Batch Closing Instruction Recognizer instance
 *
 * @param exchangeClient 交易所客户端 - Exchange client
 * @param config 指令识别配置 - Instruction recognition configuration
 * @returns {CaiSenBatchClosingInstructionRecognizer} 蔡森分批平仓指令识别器实例 - CaiSen Batch Closing Instruction Recognizer instance
 *
 * 示例 Example:
 * ```typescript
 * import { createCaiSenBatchClosingInstructionRecognizer } from './caiSenBatchClosingInstructionRecognizer';
 * import { createCaiSenBatchClosingSystem } from './caiSenBatchClosingSystem';
 * import { createCaiSenAiParameterControl } from './caiSenAiParameterControl';
 *
 * // 使用默认配置创建实例 - Create instance with default configuration
 * const recognizer = createCaiSenBatchClosingInstructionRecognizer(exchangeClient);
 *
 * // 使用自定义配置创建实例 - Create instance with custom configuration
 * const customRecognizer = createCaiSenBatchClosingInstructionRecognizer(exchangeClient, {
 *   enableAutoValidation: false,
 *   enableAutoExecution: true,
 *   validationTimeout: 60000
 * });
 * ```
 */
export const createCaiSenBatchClosingInstructionRecognizer = (
	exchangeClient: IExchangeClient,
	config?: Partial<InstructionRecognitionConfig>,
): CaiSenBatchClosingInstructionRecognizer => {
	// 合并默认配置和用户配置 - Merge default configuration with user configuration
	const finalConfig = {
		...DEFAULT_INSTRUCTION_RECOGNITION_CONFIG,
		...config,
	};

	// 创建依赖系统实例 - Create dependency system instances
	const batchClosingSystem = createCaiSenBatchClosingSystem(
		DEFAULT_BATCH_CLOSING_CONFIG,
		{} as StrategyParams,
	);
	const aiParameterControl = createCaiSenAiParameterControl(
		exchangeClient,
		{} as StrategyParams,
		batchClosingSystem,
	);

	// 创建并返回新实例 - Create and return new instance
	return new CaiSenBatchClosingInstructionRecognizer(
		finalConfig,
		batchClosingSystem,
		aiParameterControl,
		exchangeClient,
	);
};
