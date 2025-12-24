/**
 * 蔡森策略AI参数控制机制
 * CaiSen Strategy AI Parameter Control Mechanism
 *
 * 该模块负责处理AI设定的平仓参数并确保系统严格按照这些参数执行
 * This module is responsible for handling AI-set closing parameters and ensuring the system executes strictly according to these parameters
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

import { EventEmitter } from "node:events";
import type { IExchangeClient } from "../../../services/exchangeClient";
import type { StrategyParams } from "../../../strategies/types.js";
import { logger } from "../../../utils/loggerUtils";
import {
	type AiClosingParams,
	BatchConfig,
	type CaiSenBatchClosingSystem,
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
 * 参数状态枚举
 * Parameter Status Enumeration
 */
export enum ParameterStatus {
	DRAFT = "draft", // 草稿 - Draft
	ACTIVE = "active", // 激活 - Active
	EXPIRED = "expired", // 已过期 - Expired
	SUPERSEDED = "superseded", // 已被取代 - Superseded
	CANCELLED = "cancelled", // 已取消 - Cancelled
}

/**
 * 参数类型枚举
 * Parameter Type Enumeration
 */
export enum ParameterType {
	CLOSING_PARAMS = "closing_params", // 平仓参数 - Closing parameters
	RISK_PARAMS = "risk_params", // 风险参数 - Risk parameters
	MONITORING_PARAMS = "monitoring_params", // 监控参数 - Monitoring parameters
	RETURN_PREDICTION = "return_prediction", // 收益率预测参数 - Return prediction parameters
}

/**
 * AI参数元数据接口
 * AI Parameter Metadata Interface
 */
export interface AiParameterMetadata {
	/** 参数ID - Parameter ID */
	paramId: string;

	/** 参数类型 - Parameter type */
	paramType: ParameterType;

	/** 决策ID - Decision ID */
	decisionId: string;

	/** 参数版本 - Parameter version */
	version: number;

	/** 创建时间 - Creation time */
	createdAt: number;

	/** 生效时间 - Effective time */
	effectiveTime: number;

	/** 过期时间 - Expiration time */
	expiresAt: number;

	/** 创建者 - Creator */
	creator: string;

	/** 描述 - Description */
	description?: string;

	/** 标签 - Tags */
	tags?: string[];

	/** 状态 - Status */
	status: ParameterStatus;

	/** 父参数ID（用于版本控制） - Parent parameter ID (for version control) */
	parentParamId?: string;

	/** 取代时间 - Superseded time */
	supersededAt?: number;
}

/**
 * 平仓参数详细配置接口
 * Closing Parameter Detailed Configuration Interface
 */
export interface ClosingParameterDetail extends AiParameterMetadata {
	/** 平仓参数 - Closing parameters */
	closingParams: AiClosingParams;
}

/**
 * 风险参数详细配置接口
 * Risk Parameter Detailed Configuration Interface
 */
export interface RiskParameterDetail extends AiParameterMetadata {
	/** 风险阈值 - Risk thresholds */
	riskThresholds: {
		/** 最大总亏损百分比 - Maximum total loss percentage */
		maxTotalLossPercent: number;

		/** 最大单仓亏损百分比 - Maximum single position loss percentage */
		maxSinglePositionLossPercent: number;

		/** 最大回撤百分比 - Maximum drawdown percentage */
		maxDrawdownPercent: number;

		/** 风险缓解策略 - Risk mitigation strategy */
		riskMitigationStrategy: "reduce_position" | "close_worst" | "close_all";
	};
}

/**
 * 监控参数详细配置接口
 * Monitoring Parameter Detailed Configuration Interface
 */
export interface MonitoringParameterDetail extends AiParameterMetadata {
	/** 持仓ID - Position ID */
	positionId: string;

	/** 监控配置 - Monitoring configuration */
	monitoringConfig: {
		/** 监控间隔 - Monitoring interval */
		monitoringInterval: number;

		/** 监控指标 - Monitoring indicators */
		monitoringIndicators: string[];

		/** 报警阈值 - Alert thresholds */
		alertThresholds: Record<string, number>;
	};

	/** 风险阈值 - Risk thresholds */
	riskThresholds: {
		/** 最大总亏损百分比 - Maximum total loss percentage */
		maxTotalLossPercent: number;

		/** 最大单仓亏损百分比 - Maximum single position loss percentage */
		maxSinglePositionLossPercent: number;

		/** 最大回撤百分比 - Maximum drawdown percentage */
		maxDrawdownPercent: number;

		/** 风险缓解策略 - Risk mitigation strategy */
		riskMitigationStrategy: "reduce_position" | "close_worst" | "close_all";
	};

	/** 监控间隔 - Monitoring interval */
	monitoringInterval: number;

	/** 最后更新时间 - Last updated time */
	lastUpdated: number;
}

/**
 * 收益率预测参数接口
 * Return Prediction Parameters Interface
 */
export interface ReturnPredictionParams {
	/** 参数ID - Parameter ID */
	paramId: string;

	/** 决策ID - Decision ID */
	decisionId: string;

	/** 生效时间 - Effective time */
	effectiveTime: number;

	/** 过期时间 - Expiration time */
	expiresAt: number;

	/** 预测结果 - Prediction results */
	predictions: {
		/** 预测收益率（百分比） - Predicted return rate (percentage) */
		returnRate?: number;

		/** 预测收益率区间（百分比） - Predicted return rate range (percentage) */
		returnRateRange?: {
			/** 最小值 - Minimum value */
			min: number;
			/** 最大值 - Maximum value */
			max: number;
		};

		/** 置信度（0-1） - Confidence level (0-1) */
		confidence: number;

		/** 预测时间范围（分钟） - Prediction time range (minutes) */
		timeRange: number;

		/** 关键影响因素 - Key influencing factors */
		keyFactors: string[];

		/** 推荐平仓策略 - Recommended closing strategy */
		recommendedClosingStrategy: "full_close" | "batch_close" | "hold";

		/** 分批平仓配置（如果推荐分批平仓） - Batch closing configuration (if batch_close is recommended) */
		batchClosingConfig?: {
			/** 批次数量 - Number of batches */
			batchCount: number;

			/** 各批次配置 - Configuration for each batch */
			batches: Array<{
				/** 批次索引 - Batch index */
				index: number;

				/** 平仓比例（0-1） - Closing ratio (0-1) */
				ratio: number;

				/** 触发条件 - Trigger condition */
				triggerCondition: {
					/** 触发类型 - Trigger type */
					triggerType: "price" | "pnl_percent" | "time" | "manual";

					/** 触发值 - Trigger value */
					triggerValue: number;

					/** 比较操作符 - Comparison operator */
					operator: ">" | "<" | "=" | ">=" | "<=";
				};
			}>;
		};
	}[];
}

/**
 * 收益率预测参数详细配置接口
 * Return Prediction Parameter Detailed Configuration Interface
 */
export interface ReturnPredictionParameterDetail extends AiParameterMetadata {
	/** 收益率预测参数 - Return prediction parameters */
	predictionParams: ReturnPredictionParams;
}

/**
 * 参数控制机制配置接口
 * Parameter Control Mechanism Configuration Interface
 */
export interface ParameterControlConfig {
	/** 是否启用参数验证 - Whether to enable parameter validation */
	enableParameterValidation: boolean;

	/** 是否启用参数版本控制 - Whether to enable parameter version control */
	enableVersionControl: boolean;

	/** 最大参数历史记录数 - Maximum parameter history count */
	maxParameterHistory: number;

	/** 参数过期检查间隔 - Parameter expiration check interval */
	expirationCheckInterval: number;

	/** 是否启用自动清理过期参数 - Whether to enable automatic cleanup of expired parameters */
	enableAutoCleanup: boolean;

	/** 参数兼容性检查 - Parameter compatibility check */
	compatibilityCheck: {
		/** 是否启用兼容性检查 - Whether to enable compatibility check */
		enabled: boolean;

		/** 最低兼容版本 - Minimum compatible version */
		minCompatibleVersion: number;
	};
}

/**
 * 蔡森策略AI参数控制机制类
 * CaiSen Strategy AI Parameter Control Mechanism Class
 */
export class CaiSenAiParameterControl extends EventEmitter {
	private config: ParameterControlConfig;
	private exchangeClient: IExchangeClient;
	private strategyConfig: StrategyParams;
	private batchClosingSystem: CaiSenBatchClosingSystem;

	// 参数存储 - Parameter storage
	private closingParams: Map<string, ClosingParameterDetail> = new Map();
	private riskParams: Map<string, RiskParameterDetail> = new Map();
	private monitoringParams: Map<string, MonitoringParameterDetail> = new Map();
	private returnPredictionParams: Map<string, ReturnPredictionParameterDetail> =
		new Map();

	// 当前激活参数 - Current active parameters
	private activeClosingParamId: string | null = null;
	private activeRiskParamId: string | null = null;
	private activeMonitoringParamId: string | null = null;
	private activeReturnPredictionParamId: string | null = null;

	// 定时器 - Timers
	private expirationCheckTimer: NodeJS.Timeout | null = null;

	/**
	 * 构造函数
	 * Constructor
	 *
	 * @param config 控制机制配置 - Control mechanism configuration
	 * @param exchangeClient 交易所客户端 - Exchange client
	 * @param strategyConfig 策略配置 - Strategy configuration
	 * @param batchClosingSystem 分批平仓系统 - Batch closing system
	 */
	constructor(
		config: ParameterControlConfig,
		exchangeClient: IExchangeClient,
		strategyConfig: StrategyParams,
		batchClosingSystem: CaiSenBatchClosingSystem,
	) {
		super();

		this.config = config;
		this.exchangeClient = exchangeClient;
		this.strategyConfig = strategyConfig;
		this.batchClosingSystem = batchClosingSystem;

		// 启动过期检查定时器 - Start expiration check timer
		this.startExpirationCheckTimer();

		logger.info("蔡森策略AI参数控制机制已初始化", { config });
	}

	/**
	 * 设置平仓参数
	 * Set closing parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @param decisionId 决策ID - Decision ID
	 * @param closingParams 平仓参数 - Closing parameters
	 * @param options 可选参数 - Optional parameters
	 * @returns Promise<boolean> 设置是否成功 - Whether setting was successful
	 */
	async setClosingParameters(
		paramId: string,
		decisionId: string,
		closingParams: AiClosingParams,
		options: {
			effectiveTime?: number;
			expiresAt?: number;
			description?: string;
			tags?: string[];
		} = {},
	): Promise<boolean> {
		try {
			// 验证参数 - Validate parameters
			if (
				this.config.enableParameterValidation &&
				!this.validateClosingParameters(closingParams)
			) {
				logger.error("无效的平仓参数", { paramId, closingParams });
				return false;
			}

			// 检查是否已存在 - Check if already exists
			if (this.closingParams.has(paramId)) {
				logger.warn("平仓参数已存在", { paramId });
				return false;
			}

			// 获取版本号 - Get version number
			let version = 1;
			if (this.config.enableVersionControl) {
				version = this.getNextVersion(ParameterType.CLOSING_PARAMS);
			}

			// 设置默认时间 - Set default times
			const now = Date.now();
			const effectiveTime = options.effectiveTime || now;
			const expiresAt = options.expiresAt || now + 24 * 60 * 60 * 1000; // 默认24小时过期

			// 创建参数详情 - Create parameter detail
			const paramDetail: ClosingParameterDetail = {
				paramId,
				paramType: ParameterType.CLOSING_PARAMS,
				decisionId,
				version,
				createdAt: now,
				effectiveTime,
				expiresAt,
				creator: "CaiSenAgent",
				description: options.description,
				tags: options.tags,
				status:
					effectiveTime <= now ? ParameterStatus.ACTIVE : ParameterStatus.DRAFT,
				closingParams,
			};

			// 存储参数 - Store parameters
			this.closingParams.set(paramId, paramDetail);

			// 如果是立即生效，设置为当前激活参数
			// If effective immediately, set as current active parameter
			if (effectiveTime <= now) {
				await this.activateClosingParameter(paramId);
			}

			// 发出参数设置事件 - Emit parameter set event
			this.emit("closingParametersSet", { paramId, paramDetail });

			logger.info("平仓参数已设置", {
				paramId,
				decisionId,
				version,
				effectiveTime: new Date(effectiveTime).toISOString(),
				expiresAt: new Date(expiresAt).toISOString(),
			});

			return true;
		} catch (error) {
			logger.error("设置平仓参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 激活平仓参数
	 * Activate closing parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 激活是否成功 - Whether activation was successful
	 */
	async activateClosingParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.closingParams.get(paramId);
			if (!paramDetail) {
				logger.error("未找到平仓参数", { paramId });
				return false;
			}

			// 检查是否可以激活 - Check if can be activated
			const now = Date.now();
			if (paramDetail.effectiveTime > now || paramDetail.expiresAt <= now) {
				logger.error("无法在有效时间范围外激活参数", {
					paramId,
					effectiveTime: paramDetail.effectiveTime,
					expiresAt: paramDetail.expiresAt,
					now,
				});
				return false;
			}

			// 取消当前激活的参数 - Deactivate currently active parameter
			if (this.activeClosingParamId) {
				await this.deactivateClosingParameter(this.activeClosingParamId);
			}

			// 激新参数 - Activate new parameter
			paramDetail.status = ParameterStatus.ACTIVE;
			this.activeClosingParamId = paramId;

			// 应用参数到分批平仓系统 - Apply parameters to batch closing system
			await this.batchClosingSystem.setAiClosingParams(
				paramDetail.closingParams,
			);

			// 发出参数激活事件 - Emit parameter activation event
			this.emit("closingParameterActivated", { paramId, paramDetail });

			logger.info("平仓参数已激活", {
				paramId,
				version: paramDetail.version,
				decisionId: paramDetail.decisionId,
			});

			return true;
		} catch (error) {
			logger.error("激活平仓参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 取消平仓参数
	 * Cancel closing parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 取消是否成功 - Whether cancellation was successful
	 */
	async cancelClosingParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.closingParams.get(paramId);
			if (!paramDetail) {
				logger.error("未找到平仓参数", { paramId });
				return false;
			}

			// 更新状态 - Update status
			paramDetail.status = ParameterStatus.CANCELLED;

			// 如果是当前激活参数，取消激活 - If currently active, deactivate
			if (this.activeClosingParamId === paramId) {
				this.activeClosingParamId = null;
				await this.batchClosingSystem.cancelAiClosingParams(
					paramDetail.closingParams.paramId,
				);
			}

			// 发出参数取消事件 - Emit parameter cancellation event
			this.emit("closingParameterCancelled", { paramId, paramDetail });

			logger.info("平仓参数已取消", { paramId });

			return true;
		} catch (error) {
			logger.error("取消平仓参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 停用平仓参数
	 * Deactivate closing parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 停用是否成功 - Whether deactivation was successful
	 */
	async deactivateClosingParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.closingParams.get(paramId);
			if (!paramDetail) {
				logger.error("Closing parameters not found", { paramId });
				return false;
			}

			// 更新状态 - Update status
			if (paramDetail.status === ParameterStatus.ACTIVE) {
				paramDetail.status = ParameterStatus.SUPERSEDED;
				paramDetail.supersededAt = Date.now();
			}

			// 如果是当前激活参数，清除激活状态 - If currently active, clear active status
			if (this.activeClosingParamId === paramId) {
				this.activeClosingParamId = null;
				await this.batchClosingSystem.cancelAiClosingParams(
					paramDetail.closingParams.paramId,
				);
			}

			// 发出参数停用事件 - Emit parameter deactivation event
			this.emit("closingParameterDeactivated", { paramId, paramDetail });

			logger.info("平仓参数已停用", { paramId });

			return true;
		} catch (error) {
			logger.error("停用平仓参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 获取当前激活的平仓参数
	 * Get current active closing parameters
	 *
	 * @returns ClosingParameterDetail | null 当前激活的平仓参数 - Current active closing parameters
	 */
	getActiveClosingParameters(): ClosingParameterDetail | null {
		if (!this.activeClosingParamId) {
			return null;
		}

		return this.closingParams.get(this.activeClosingParamId) || null;
	}

	/**
	 * 获取平仓参数详情
	 * Get closing parameter details
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns ClosingParameterDetail | null 平仓参数详情 - Closing parameter details
	 */
	getClosingParameterDetails(paramId: string): ClosingParameterDetail | null {
		return this.closingParams.get(paramId) || null;
	}

	/**
	 * 获取所有平仓参数
	 * Get all closing parameters
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns ClosingParameterDetail[] 所有平仓参数 - All closing parameters
	 */
	getAllClosingParameters(status?: ParameterStatus): ClosingParameterDetail[] {
		const params = Array.from(this.closingParams.values());

		if (status !== undefined) {
			return params.filter((param) => param.status === status);
		}

		return params;
	}

	/**
	 * 设置风险参数
	 * Set risk parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @param decisionId 决策ID - Decision ID
	 * @param riskThresholds 风险阈值 - Risk thresholds
	 * @param options 可选参数 - Optional parameters
	 * @returns Promise<boolean> 设置是否成功 - Whether setting was successful
	 */
	async setRiskParameters(
		paramId: string,
		decisionId: string,
		riskThresholds: RiskParameterDetail["riskThresholds"],
		options: {
			effectiveTime?: number;
			expiresAt?: number;
			description?: string;
			tags?: string[];
		} = {},
	): Promise<boolean> {
		try {
			// 验证参数 - Validate parameters
			if (
				this.config.enableParameterValidation &&
				!this.validateRiskParameters(riskThresholds)
			) {
				logger.error("Invalid risk parameters", { paramId, riskThresholds });
				return false;
			}

			// 检查是否已存在 - Check if already exists
			if (this.riskParams.has(paramId)) {
				logger.warn("Risk parameters already exist", { paramId });
				return false;
			}

			// 获取版本号 - Get version number
			let version = 1;
			if (this.config.enableVersionControl) {
				version = this.getNextVersion(ParameterType.RISK_PARAMS);
			}

			// 设置默认时间 - Set default times
			const now = Date.now();
			const effectiveTime = options.effectiveTime || now;
			const expiresAt = options.expiresAt || now + 24 * 60 * 60 * 1000; // 默认24小时过期

			// 创建参数详情 - Create parameter detail
			const paramDetail: RiskParameterDetail = {
				paramId,
				paramType: ParameterType.RISK_PARAMS,
				decisionId,
				version,
				createdAt: now,
				effectiveTime,
				expiresAt,
				creator: "CaiSenAgent",
				description: options.description,
				tags: options.tags,
				status:
					effectiveTime <= now ? ParameterStatus.ACTIVE : ParameterStatus.DRAFT,
				riskThresholds,
			};

			// 存储参数 - Store parameters
			this.riskParams.set(paramId, paramDetail);

			// 如果是立即生效，设置为当前激活参数
			// If effective immediately, set as current active parameter
			if (effectiveTime <= now) {
				await this.activateRiskParameter(paramId);
			}

			// 发出参数设置事件 - Emit parameter set event
			this.emit("riskParametersSet", { paramId, paramDetail });

			logger.info("风险参数已设置", {
				paramId,
				decisionId,
				version,
				effectiveTime: new Date(effectiveTime).toISOString(),
				expiresAt: new Date(expiresAt).toISOString(),
			});

			return true;
		} catch (error) {
			logger.error("设置风险参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 激活风险参数
	 * Activate risk parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 激活是否成功 - Whether activation was successful
	 */
	async activateRiskParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.riskParams.get(paramId);
			if (!paramDetail) {
				logger.error("未找到风险参数", { paramId });
				return false;
			}

			// 检查是否可以激活 - Check if can be activated
			const now = Date.now();
			if (paramDetail.effectiveTime > now || paramDetail.expiresAt <= now) {
				logger.error(
					"Cannot activate parameters outside effective time range",
					{
						paramId,
						effectiveTime: paramDetail.effectiveTime,
						expiresAt: paramDetail.expiresAt,
						now,
					},
				);
				return false;
			}

			// 取消当前激活的参数 - Deactivate currently active parameter
			if (this.activeRiskParamId) {
				await this.deactivateRiskParameter(this.activeRiskParamId);
			}

			// 激新参数 - Activate new parameter
			paramDetail.status = ParameterStatus.ACTIVE;
			this.activeRiskParamId = paramId;

			// 应用参数到监控系统 - Apply parameters to monitoring system
			// 这里可以调用相关监控系统的接口来应用风险参数

			// 发出参数激活事件 - Emit parameter activation event
			this.emit("riskParameterActivated", { paramId, paramDetail });

			logger.info("风险参数已激活", {
				paramId,
				version: paramDetail.version,
				decisionId: paramDetail.decisionId,
			});

			return true;
		} catch (error) {
			logger.error("激活风险参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 获取当前激活的风险参数
	 * Get current active risk parameters
	 *
	 * @returns RiskParameterDetail | null 当前激活的风险参数 - Current active risk parameters
	 */
	getActiveRiskParameters(): RiskParameterDetail | null {
		if (!this.activeRiskParamId) {
			return null;
		}

		return this.riskParams.get(this.activeRiskParamId) || null;
	}

	/**
	 * 获取风险参数详情
	 * Get risk parameter details
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns RiskParameterDetail | null 风险参数详情 - Risk parameter details
	 */
	getRiskParameterDetails(paramId: string): RiskParameterDetail | null {
		return this.riskParams.get(paramId) || null;
	}

	/**
	 * 获取所有风险参数
	 * Get all risk parameters
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns RiskParameterDetail[] 所有风险参数 - All risk parameters
	 */
	getAllRiskParameters(status?: ParameterStatus): RiskParameterDetail[] {
		const params = Array.from(this.riskParams.values());

		if (status !== undefined) {
			return params.filter((param) => param.status === status);
		}

		return params;
	}

	/**
	 * 设置收益率预测参数
	 * Set return prediction parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @param decisionId 决策ID - Decision ID
	 * @param predictionParams 收益率预测参数 - Return prediction parameters
	 * @param options 可选参数 - Optional parameters
	 * @returns Promise<boolean> 设置是否成功 - Whether setting was successful
	 */
	async setReturnPredictionParameters(
		paramId: string,
		decisionId: string,
		predictionParams: ReturnPredictionParams,
		options: {
			effectiveTime?: number;
			expiresAt?: number;
			description?: string;
			tags?: string[];
		} = {},
	): Promise<boolean> {
		try {
			// 验证参数 - Validate parameters
			if (
				this.config.enableParameterValidation &&
				!this.validateReturnPredictionParameters(predictionParams)
			) {
				logger.error("无效的收益率预测参数", { paramId, predictionParams });
				return false;
			}

			// 检查是否已存在 - Check if already exists
			if (this.returnPredictionParams.has(paramId)) {
				logger.warn("收益率预测参数已存在", { paramId });
				return false;
			}

			// 获取版本号 - Get version number
			let version = 1;
			if (this.config.enableVersionControl) {
				version = this.getNextVersion(ParameterType.RETURN_PREDICTION);
			}

			// 设置默认时间 - Set default times
			const now = Date.now();
			const effectiveTime = options.effectiveTime || now;
			const expiresAt = options.expiresAt || now + 24 * 60 * 60 * 1000; // 默认24小时过期

			// 创建参数详情 - Create parameter detail
			const paramDetail: ReturnPredictionParameterDetail = {
				paramId,
				paramType: ParameterType.RETURN_PREDICTION,
				decisionId,
				version,
				createdAt: now,
				effectiveTime,
				expiresAt,
				creator: "CaiSenAgent",
				description: options.description,
				tags: options.tags,
				status:
					effectiveTime <= now ? ParameterStatus.ACTIVE : ParameterStatus.DRAFT,
				predictionParams,
			};

			// 存储参数 - Store parameters
			this.returnPredictionParams.set(paramId, paramDetail);

			// 如果是立即生效，设置为当前激活参数
			// If effective immediately, set as current active parameter
			if (effectiveTime <= now) {
				await this.activateReturnPredictionParameter(paramId);
			}

			// 发出参数设置事件 - Emit parameter set event
			this.emit("returnPredictionParametersSet", { paramId, paramDetail });

			logger.info("收益率预测参数已设置", {
				paramId,
				decisionId,
				version,
				effectiveTime: new Date(effectiveTime).toISOString(),
				expiresAt: new Date(expiresAt).toISOString(),
			});

			return true;
		} catch (error) {
			logger.error("设置收益率预测参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 激活收益率预测参数
	 * Activate return prediction parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 激活是否成功 - Whether activation was successful
	 */
	async activateReturnPredictionParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.returnPredictionParams.get(paramId);
			if (!paramDetail) {
				logger.error("未找到收益率预测参数", { paramId });
				return false;
			}

			// 检查是否可以激活 - Check if can be activated
			const now = Date.now();
			if (paramDetail.effectiveTime > now || paramDetail.expiresAt <= now) {
				logger.error("无法在有效时间范围外激活参数", {
					paramId,
					effectiveTime: paramDetail.effectiveTime,
					expiresAt: paramDetail.expiresAt,
					now,
				});
				return false;
			}

			// 取消当前激活的参数 - Deactivate currently active parameter
			if (this.activeReturnPredictionParamId) {
				await this.deactivateReturnPredictionParameter(
					this.activeReturnPredictionParamId,
				);
			}

			// 激新参数 - Activate new parameter
			paramDetail.status = ParameterStatus.ACTIVE;
			this.activeReturnPredictionParamId = paramId;

			// 发出参数激活事件 - Emit parameter activation event
			this.emit("returnPredictionParameterActivated", { paramId, paramDetail });

			logger.info("收益率预测参数已激活", {
				paramId,
				version: paramDetail.version,
				decisionId: paramDetail.decisionId,
			});

			return true;
		} catch (error) {
			logger.error("激活收益率预测参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 停用收益率预测参数
	 * Deactivate return prediction parameters
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns Promise<boolean> 停用是否成功 - Whether deactivation was successful
	 */
	async deactivateReturnPredictionParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.returnPredictionParams.get(paramId);
			if (!paramDetail) {
				logger.error("未找到收益率预测参数", { paramId });
				return false;
			}

			// 更新状态 - Update status
			if (paramDetail.status === ParameterStatus.ACTIVE) {
				paramDetail.status = ParameterStatus.SUPERSEDED;
				paramDetail.supersededAt = Date.now();
			}

			// 如果是当前激活参数，清除激活状态 - If currently active, clear active status
			if (this.activeReturnPredictionParamId === paramId) {
				this.activeReturnPredictionParamId = null;
			}

			// 发出参数停用事件 - Emit parameter deactivation event
			this.emit("returnPredictionParameterDeactivated", {
				paramId,
				paramDetail,
			});

			logger.info("收益率预测参数已停用", { paramId });

			return true;
		} catch (error) {
			logger.error("停用收益率预测参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 获取当前激活的收益率预测参数
	 * Get current active return prediction parameters
	 *
	 * @returns ReturnPredictionParameterDetail | null 当前激活的收益率预测参数 - Current active return prediction parameters
	 */
	getActiveReturnPredictionParameters(): ReturnPredictionParameterDetail | null {
		if (!this.activeReturnPredictionParamId) {
			return null;
		}

		return (
			this.returnPredictionParams.get(this.activeReturnPredictionParamId) ||
			null
		);
	}

	/**
	 * 获取收益率预测参数详情
	 * Get return prediction parameter details
	 *
	 * @param paramId 参数ID - Parameter ID
	 * @returns ReturnPredictionParameterDetail | null 收益率预测参数详情 - Return prediction parameter details
	 */
	getReturnPredictionParameterDetails(
		paramId: string,
	): ReturnPredictionParameterDetail | null {
		return this.returnPredictionParams.get(paramId) || null;
	}

	/**
	 * 获取所有收益率预测参数
	 * Get all return prediction parameters
	 *
	 * @param status 可选的状态过滤器 - Optional status filter
	 * @returns ReturnPredictionParameterDetail[] 所有收益率预测参数 - All return prediction parameters
	 */
	getAllReturnPredictionParameters(
		status?: ParameterStatus,
	): ReturnPredictionParameterDetail[] {
		const params = Array.from(this.returnPredictionParams.values());

		if (status !== undefined) {
			return params.filter((param) => param.status === status);
		}

		return params;
	}

	/**
	 * 更新控制机制配置
	 * Update control mechanism configuration
	 *
	 * @param newConfig 新配置 - New configuration
	 * @returns Promise<boolean> 更新是否成功 - Whether update was successful
	 */
	async updateConfig(
		newConfig: Partial<ParameterControlConfig>,
	): Promise<boolean> {
		try {
			this.config = { ...this.config, ...newConfig };

			// 重启过期检查定时器以应用新配置 - Restart expiration check timer to apply new configuration
			this.restartExpirationCheckTimer();

			// 发出配置更新事件 - Emit configuration update event
			this.emit("configUpdated", { config: this.config });

			logger.info("AI参数控制配置已更新", { newConfig });

			return true;
		} catch (error) {
			logger.error("更新AI参数控制配置时出错", { error, newConfig });
			return false;
		}
	}

	/**
	 * 启动过期检查定时器
	 * Start expiration check timer
	 * @private
	 */
	private startExpirationCheckTimer(): void {
		if (this.expirationCheckTimer) {
			clearInterval(this.expirationCheckTimer);
		}

		this.expirationCheckTimer = setInterval(async () => {
			await this.checkExpiredParameters();
		}, this.config.expirationCheckInterval);

		logger.debug("过期检查定时器已启动", {
			interval: this.config.expirationCheckInterval,
		});
	}

	/**
	 * 重启过期检查定时器
	 * Restart expiration check timer
	 * @private
	 */
	private restartExpirationCheckTimer(): void {
		this.startExpirationCheckTimer();
	}

	/**
	 * 检查过期参数
	 * Check expired parameters
	 * @private
	 */
	private async checkExpiredParameters(): Promise<void> {
		try {
			const now = Date.now();

			// 检查平仓参数 - Check closing parameters
			for (const [paramId, paramDetail] of this.closingParams.entries()) {
				if (
					paramDetail.status === ParameterStatus.ACTIVE &&
					paramDetail.expiresAt <= now
				) {
					await this.deactivateClosingParameter(paramId);
					paramDetail.status = ParameterStatus.EXPIRED;

					// 发出参数过期事件 - Emit parameter expiration event
					this.emit("closingParameterExpired", { paramId, paramDetail });

					logger.info("平仓参数已过期", { paramId });
				}
			}

			// 检查风险参数 - Check risk parameters
			for (const [paramId, paramDetail] of this.riskParams.entries()) {
				if (
					paramDetail.status === ParameterStatus.ACTIVE &&
					paramDetail.expiresAt <= now
				) {
					await this.deactivateRiskParameter(paramId);
					paramDetail.status = ParameterStatus.EXPIRED;

					// 发出参数过期事件 - Emit parameter expiration event
					this.emit("riskParameterExpired", { paramId, paramDetail });

					logger.info("风险参数已过期", { paramId });
				}
			}

			// 检查收益率预测参数 - Check return prediction parameters
			for (const [
				paramId,
				paramDetail,
			] of this.returnPredictionParams.entries()) {
				if (
					paramDetail.status === ParameterStatus.ACTIVE &&
					paramDetail.expiresAt <= now
				) {
					await this.deactivateReturnPredictionParameter(paramId);
					paramDetail.status = ParameterStatus.EXPIRED;

					// 发出参数过期事件 - Emit parameter expiration event
					this.emit("returnPredictionParameterExpired", {
						paramId,
						paramDetail,
					});

					logger.info("收益率预测参数已过期", { paramId });
				}
			}

			// 自动清理过期参数 - Auto cleanup expired parameters
			if (this.config.enableAutoCleanup) {
				await this.cleanupExpiredParameters();
			}
		} catch (error) {
			logger.error("检查过期参数时出错", { error });
		}
	}

	/**
	 * 清理过期参数
	 * Cleanup expired parameters
	 * @private
	 */
	private async cleanupExpiredParameters(): Promise<void> {
		try {
			// 清理平仓参数 - Cleanup closing parameters
			const expiredClosingParams = Array.from(this.closingParams.entries())
				.filter(
					([_, paramDetail]) => paramDetail.status === ParameterStatus.EXPIRED,
				)
				.sort(([_, a], [__, b]) => a.expiresAt - b.expiresAt); // 按过期时间排序

			if (expiredClosingParams.length > this.config.maxParameterHistory) {
				const toDelete = expiredClosingParams.slice(
					0,
					expiredClosingParams.length - this.config.maxParameterHistory,
				);
				for (const [paramId] of toDelete) {
					this.closingParams.delete(paramId);
				}

				logger.info("已清理过期的平仓参数", {
					deletedCount: toDelete.length,
				});
			}

			// 清理风险参数 - Cleanup risk parameters
			const expiredRiskParams = Array.from(this.riskParams.entries())
				.filter(
					([_, paramDetail]) => paramDetail.status === ParameterStatus.EXPIRED,
				)
				.sort(([_, a], [__, b]) => a.expiresAt - b.expiresAt); // 按过期时间排序

			if (expiredRiskParams.length > this.config.maxParameterHistory) {
				const toDelete = expiredRiskParams.slice(
					0,
					expiredRiskParams.length - this.config.maxParameterHistory,
				);
				for (const [paramId] of toDelete) {
					this.riskParams.delete(paramId);
				}

				logger.info("已清理过期的风险参数", {
					deletedCount: toDelete.length,
				});
			}

			// 清理收益率预测参数 - Cleanup return prediction parameters
			const expiredReturnPredictionParams = Array.from(
				this.returnPredictionParams.entries(),
			)
				.filter(
					([_, paramDetail]) => paramDetail.status === ParameterStatus.EXPIRED,
				)
				.sort(([_, a], [__, b]) => a.expiresAt - b.expiresAt); // 按过期时间排序

			if (
				expiredReturnPredictionParams.length > this.config.maxParameterHistory
			) {
				const toDelete = expiredReturnPredictionParams.slice(
					0,
					expiredReturnPredictionParams.length -
						this.config.maxParameterHistory,
				);
				for (const [paramId] of toDelete) {
					this.returnPredictionParams.delete(paramId);
				}

				logger.info("已清理过期的收益率预测参数", {
					deletedCount: toDelete.length,
				});
			}
		} catch (error) {
			logger.error("清理过期参数时出错", { error });
		}
	}

	/**
	 * 获取下一个版本号
	 * Get next version number
	 * @private
	 */
	private getNextVersion(paramType: ParameterType): number {
		let maxVersion = 0;

		switch (paramType) {
			case ParameterType.CLOSING_PARAMS:
				for (const paramDetail of this.closingParams.values()) {
					if (paramDetail.version > maxVersion) {
						maxVersion = paramDetail.version;
					}
				}
				break;

			case ParameterType.RISK_PARAMS:
				for (const paramDetail of this.riskParams.values()) {
					if (paramDetail.version > maxVersion) {
						maxVersion = paramDetail.version;
					}
				}
				break;

			case ParameterType.MONITORING_PARAMS:
				for (const paramDetail of this.monitoringParams.values()) {
					if (paramDetail.version > maxVersion) {
						maxVersion = paramDetail.version;
					}
				}
				break;

			case ParameterType.RETURN_PREDICTION:
				for (const paramDetail of this.returnPredictionParams.values()) {
					if (paramDetail.version > maxVersion) {
						maxVersion = paramDetail.version;
					}
				}
				break;
		}

		return maxVersion + 1;
	}

	/**
	 * 验证平仓参数
	 * Validate closing parameters
	 * @private
	 */
	private validateClosingParameters(closingParams: AiClosingParams): boolean {
		// 检查基本字段 - Check basic fields
		if (
			!closingParams.paramId ||
			!closingParams.decisionId ||
			!closingParams.batchConfigs ||
			closingParams.batchConfigs.length === 0
		) {
			return false;
		}

		// 检查批次配置 - Check batch configurations
		for (const batchConfig of closingParams.batchConfigs) {
			if (
				!batchConfig.batchId ||
				!batchConfig.positionId ||
				batchConfig.closingRatio <= 0 ||
				batchConfig.closingRatio > 1
			) {
				return false;
			}
		}

		return true;
	}

	/**
	 * 验证风险参数
	 * Validate risk parameters
	 * @private
	 */
	private validateRiskParameters(
		riskThresholds: RiskParameterDetail["riskThresholds"],
	): boolean {
		// 检查基本字段 - Check basic fields
		if (
			riskThresholds.maxTotalLossPercent <= 0 ||
			riskThresholds.maxSinglePositionLossPercent <= 0 ||
			riskThresholds.maxDrawdownPercent <= 0
		) {
			return false;
		}

		// 检查风险缓解策略 - Check risk mitigation strategy
		const validStrategies: RiskParameterDetail["riskThresholds"]["riskMitigationStrategy"][] =
			["reduce_position", "close_worst", "close_all"];

		if (!validStrategies.includes(riskThresholds.riskMitigationStrategy)) {
			return false;
		}

		return true;
	}

	/**
	 * 验证收益率预测参数
	 * Validate return prediction parameters
	 * @private
	 */
	private validateReturnPredictionParameters(
		predictionParams: ReturnPredictionParams,
	): boolean {
		// 检查基本字段 - Check basic fields
		if (
			!predictionParams.paramId ||
			!predictionParams.decisionId ||
			!predictionParams.predictions ||
			predictionParams.predictions.length === 0
		) {
			return false;
		}

		// 检查预测结果 - Check prediction results
		for (const prediction of predictionParams.predictions) {
			// 检查returnRate和returnRateRange至少提供一个，但不能同时提供
			const hasReturnRate = typeof prediction.returnRate === "number";
			const hasReturnRateRange = prediction.returnRateRange !== undefined;

			if (!hasReturnRate && !hasReturnRateRange) {
				return false;
			}

			if (hasReturnRate && hasReturnRateRange) {
				return false;
			}

			// 检查returnRate的有效性
			if (hasReturnRate) {
				if (typeof prediction.returnRate !== "number") {
					return false;
				}
			}

			// 检查returnRateRange的有效性
			if (hasReturnRateRange) {
				// 使用类型断言告诉TypeScript prediction.returnRateRange在这个分支中肯定是定义的
				const returnRateRange = prediction.returnRateRange!;
				if (
					typeof returnRateRange.min !== "number" ||
					typeof returnRateRange.max !== "number" ||
					returnRateRange.min > returnRateRange.max
				) {
					return false;
				}
			}

			// 检查其他必填字段
			if (
				typeof prediction.confidence !== "number" ||
				typeof prediction.timeRange !== "number" ||
				prediction.confidence < 0 ||
				prediction.confidence > 1 ||
				prediction.timeRange <= 0
			) {
				return false;
			}

			// 检查推荐平仓策略 - Check recommended closing strategy
			const validStrategies: Array<"full_close" | "batch_close" | "hold"> = [
				"full_close",
				"batch_close",
				"hold",
			];
			if (!validStrategies.includes(prediction.recommendedClosingStrategy)) {
				return false;
			}

			// 如果推荐分批平仓，检查分批平仓配置 - If batch_close is recommended, check batch closing configuration
			if (
				prediction.recommendedClosingStrategy === "batch_close" &&
				(!prediction.batchClosingConfig ||
					prediction.batchClosingConfig.batchCount <= 0 ||
					!prediction.batchClosingConfig.batches ||
					prediction.batchClosingConfig.batches.length === 0)
			) {
				return false;
			}

			// 检查分批平仓配置的有效性 - Check validity of batch closing configuration
			if (prediction.batchClosingConfig) {
				for (const batch of prediction.batchClosingConfig.batches) {
					if (
						typeof batch.ratio !== "number" ||
						batch.ratio <= 0 ||
						batch.ratio > 1 ||
						!batch.triggerCondition ||
						!batch.triggerCondition.triggerType ||
						typeof batch.triggerCondition.triggerValue !== "number"
					) {
						return false;
					}
				}
			}
		}

		return true;
	}

	/**
	 * 停用风险参数
	 * Deactivate risk parameters
	 * @private
	 */
	private async deactivateRiskParameter(paramId: string): Promise<boolean> {
		try {
			const paramDetail = this.riskParams.get(paramId);
			if (!paramDetail) {
				logger.error("Risk parameters not found", { paramId });
				return false;
			}

			// 更新状态 - Update status
			if (paramDetail.status === ParameterStatus.ACTIVE) {
				paramDetail.status = ParameterStatus.SUPERSEDED;
				paramDetail.supersededAt = Date.now();
			}

			// 如果是当前激活参数，清除激活状态 - If currently active, clear active status
			if (this.activeRiskParamId === paramId) {
				this.activeRiskParamId = null;
			}

			// 发出参数停用事件 - Emit parameter deactivation event
			this.emit("riskParameterDeactivated", { paramId, paramDetail });

			logger.info("风险参数已停用", { paramId });

			return true;
		} catch (error) {
			logger.error("停用风险参数时出错", { error, paramId });
			return false;
		}
	}

	/**
	 * 启动参数控制机制
	 * Start parameter control mechanism
	 * @param {string} positionId - 持仓ID Position ID
	 * @returns {Promise<boolean>} 启动结果 Start result
	 */
	async startParameterControl(positionId: string): Promise<boolean> {
		try {
			logger.info("启动参数控制", { positionId });

			// 检查是否已有活跃的参数控制 - Check if there's already active parameter control
			if (this.monitoringParams.has(positionId)) {
				logger.warn("参数控制已激活", { positionId });
				return true;
			}

			// 创建监控参数 - Create monitoring parameters
			const monitoringParams: MonitoringParameterDetail = {
				paramId: `monitoring_${positionId}_${Date.now()}`,
				paramType: ParameterType.MONITORING_PARAMS,
				decisionId: `decision_${positionId}_${Date.now()}`,
				version: this.getNextVersion(ParameterType.MONITORING_PARAMS),
				createdAt: Date.now(),
				effectiveTime: Date.now(),
				expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24小时后过期
				creator: "CaiSenAgent",
				status: ParameterStatus.ACTIVE,
				positionId,
				monitoringConfig: {
					monitoringInterval: 30 * 1000, // 30秒
					monitoringIndicators: ["profit_loss", "drawdown", "exposure"],
					alertThresholds: {
						profit_loss_percent: -5.0,
						drawdown_percent: -10.0,
						exposure_limit: 0.8,
					},
				},
				riskThresholds: {
					maxTotalLossPercent: 5.0,
					maxSinglePositionLossPercent: 3.0,
					maxDrawdownPercent: 10.0,
					riskMitigationStrategy: "reduce_position",
				},
				monitoringInterval: 30 * 1000, // 30秒
				lastUpdated: Date.now(),
			};

			// 存储监控参数 - Store monitoring parameters
			this.monitoringParams.set(positionId, monitoringParams);

			// 设置为活跃状态 - Set as active
			this.activeMonitoringParamId = positionId;

			// 发出参数控制启动事件 - Emit parameter control start event
			this.emit("parameterControlStarted", { positionId, monitoringParams });

			logger.info("参数控制已启动", { positionId });

			return true;
		} catch (error) {
			logger.error("启动参数控制时出错", { error, positionId });
			return false;
		}
	}

	/**
	 * 停止参数控制机制
	 * Stop parameter control mechanism
	 * @param {string} positionId - 持仓ID Position ID
	 * @returns {Promise<boolean>} 停止结果 Stop result
	 */
	async stopParameterControl(positionId: string): Promise<boolean> {
		try {
			logger.info("停止参数控制", { positionId });

			// 检查是否存在监控参数 - Check if monitoring parameters exist
			const monitoringParams = this.monitoringParams.get(positionId);
			if (!monitoringParams) {
				logger.warn("未找到活跃的参数控制", { positionId });
				return true;
			}

			// 更新状态 - Update status
			if (monitoringParams.status === ParameterStatus.ACTIVE) {
				monitoringParams.status = ParameterStatus.SUPERSEDED;
				monitoringParams.supersededAt = Date.now();
			}

			// 如果是当前激活参数，清除激活状态 - If currently active, clear active status
			if (this.activeMonitoringParamId === positionId) {
				this.activeMonitoringParamId = null;
			}

			// 发出参数控制停止事件 - Emit parameter control stop event
			this.emit("parameterControlStopped", { positionId, monitoringParams });

			logger.info("参数控制已停止", { positionId });

			return true;
		} catch (error) {
			logger.error("停止参数控制时出错", { error, positionId });
			return false;
		}
	}

	/**
	 * 销毁控制机制
	 * Destroy control mechanism
	 */
	destroy(): void {
		// 停止定时器 - Stop timers
		if (this.expirationCheckTimer) {
			clearInterval(this.expirationCheckTimer);
			this.expirationCheckTimer = null;
		}

		// 移除所有监听器 - Remove all listeners
		this.removeAllListeners();

		// 清空数据 - Clear data
		this.closingParams.clear();
		this.riskParams.clear();
		this.monitoringParams.clear();
		this.returnPredictionParams.clear();

		this.activeClosingParamId = null;
		this.activeRiskParamId = null;
		this.activeMonitoringParamId = null;
		this.activeReturnPredictionParamId = null;

		logger.info("蔡森策略AI参数控制机制已销毁");
	}
}

/**
 * 默认参数控制机制配置
 * Default parameter control mechanism configuration
 */
export const DEFAULT_PARAMETER_CONTROL_CONFIG: ParameterControlConfig = {
	enableParameterValidation: true,
	enableVersionControl: true,
	maxParameterHistory: 100,
	expirationCheckInterval: 60 * 1000, // 1分钟 - 1 minute
	enableAutoCleanup: true,
	compatibilityCheck: {
		enabled: true,
		minCompatibleVersion: 1,
	},
};

/**
 * 创建蔡森策略AI参数控制机制实例的工厂函数
 * Factory function to create a CaiSen Strategy AI Parameter Control Mechanism instance
 *
 * @param exchangeClient - 交易所客户端 Exchange client
 * @param strategyConfig - 策略配置 Strategy configuration
 * @param batchClosingSystem - 批量平仓系统 Batch closing system
 * @param config - 参数控制机制配置 Parameter control mechanism configuration
 * @returns 蔡森策略AI参数控制机制实例 CaiSen Strategy AI Parameter Control Mechanism instance
 */
export function createCaiSenAiParameterControl(
	exchangeClient: IExchangeClient,
	strategyConfig: StrategyParams,
	batchClosingSystem: CaiSenBatchClosingSystem,
	config: Partial<ParameterControlConfig> = {},
): CaiSenAiParameterControl {
	// 合并默认配置和用户提供的配置 - Merge default configuration with user-provided configuration
	const finalConfig: ParameterControlConfig = {
		...DEFAULT_PARAMETER_CONTROL_CONFIG,
		...config,
	};

	// 创建并返回AI参数控制机制实例 - Create and return AI parameter control mechanism instance
	return new CaiSenAiParameterControl(
		finalConfig,
		exchangeClient,
		strategyConfig,
		batchClosingSystem,
	);
}
