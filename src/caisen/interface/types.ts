/**
 * 蔡森策略标准化接口类型定义
 * CaiSen Strategy Standardized Interface Type Definitions
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

/**
 * 接口调用结果枚举
 * Interface Call Result Enumeration
 */
export enum InterfaceCallResult {
	/** 成功 - Success */
	SUCCESS = "success",
	/** 参数错误 - Parameter error */
	PARAM_ERROR = "param_error",
	/** 系统错误 - System error */
	SYSTEM_ERROR = "system_error",
	/** 超时 - Timeout */
	TIMEOUT = "timeout",
	/** 权限错误 - Permission error */
	PERMISSION_ERROR = "permission_error",
	/** 资源不存在 - Resource not found */
	NOT_FOUND = "not_found",
	/** 操作冲突 - Operation conflict */
	CONFLICT = "conflict",
}

/**
 * 接口调用响应接口
 * Interface Call Response Interface
 */
export interface InterfaceCallResponse<T = any> {
	/** 调用结果 - Call result */
	result: InterfaceCallResult;
	/** 响应数据 - Response data */
	data?: T;
	/** 错误信息 - Error message */
	errorMessage?: string;
	/** 调用时间 - Call time */
	callTime: number;
	/** 处理时间（毫秒） - Processing time (milliseconds) */
	processingTime: number;
	/** 错误详情 - Error details */
	error?: {
		/** 错误代码 - Error code */
		code: string;
		/** 错误消息 - Error message */
		message: string;
		/** 错误详情 - Error details */
		details?: any;
	};
	/** 是否成功 - Whether successful */
	success?: boolean;
}

/**
 * 分批平仓参数接口
 * Batch Closing Parameters Interface
 */
export interface BatchClosingParameters {
	/** 持仓ID - Position ID */
	positionId: string;
	/** 批次数量 - Batch count */
	batchCount: number;
	/** 批次百分比列表 - Batch percentages list */
	batchPercentages: number[];
	/** 触发条件列表 - Trigger conditions list */
	triggerConditions: Array<{
		/** 触发类型 - Trigger type */
		type: "profit" | "loss" | "price" | "time" | "custom";
		/** 触发值 - Trigger value */
		value: number;
		/** 触发参数 - Trigger parameters */
		parameters?: Record<string, any>;
	}>;
	/** 执行策略 - Execution strategy */
	executionStrategy?: "immediate" | "gradual" | "adaptive";
	/** 过期时间 - Expiration time */
	expirationTime?: number;
}

/**
 * 止盈止损参数接口
 * Stop Profit/Loss Parameters Interface
 */
export interface StopProfitLossParameters {
	/** 持仓ID - Position ID */
	positionId: string;
	/** 止损参数 - Stop loss parameters */
	stopLoss?: {
		/** 是否启用 - Whether enabled */
		enabled: boolean;
		/** 止损类型 - Stop loss type */
		type:
			| "percentage"
			| "fixed"
			| "atr"
			| "bollinger"
			| "fibonacci"
			| "pivot"
			| "custom";
		/** 止损值 - Stop loss value */
		value: number;
		/** 是否启用移动止损 - Whether to enable trailing stop */
		trailing?: boolean;
		/** 移动止损参数 - Trailing stop parameters */
		trailingParameters?: {
			/** 步进值 - Step value */
			step: number;
			/** 方向 - Direction */
			direction: "up" | "down";
		};
		/** 其他参数 - Other parameters */
		parameters?: Record<string, any>;
	};
	/** 止盈参数 - Take profit parameters */
	takeProfit?: {
		/** 是否启用 - Whether enabled */
		enabled: boolean;
		/** 止盈类型 - Take profit type */
		type:
			| "percentage"
			| "fixed"
			| "atr"
			| "bollinger"
			| "fibonacci"
			| "pivot"
			| "custom";
		/** 止盈值 - Take profit value */
		value: number;
		/** 是否启用分批止盈 - Whether to enable partial take profit */
		partial?: boolean;
		/** 分批止盈参数 - Partial take profit parameters */
		partialParameters?: {
			/** 批次数量 - Batch count */
			batchCount: number;
			/** 批次百分比列表 - Batch percentages list */
			batchPercentages: number[];
			/** 触发条件列表 - Trigger conditions list */
			triggerConditions: Array<{
				/** 触发类型 - Trigger type */
				type: "profit" | "loss" | "price" | "time" | "custom";
				/** 触发值 - Trigger value */
				value: number;
				/** 其他参数 - Other parameters */
				parameters?: Record<string, any>;
			}>;
		};
		/** 其他参数 - Other parameters */
		parameters?: Record<string, any>;
	};
	/** 元数据 - Metadata */
	metadata?: Record<string, any>;
}

/**
 * 动态阈值配置接口
 * Dynamic Threshold Configuration Interface
 */
export interface DynamicThresholdConfig {
	/** 更新间隔（毫秒） - Update interval (milliseconds) */
	updateInterval: number;
	/** 是否启用阈值过期 - Whether to enable threshold expiration */
	enableThresholdExpiration: boolean;
	/** 默认阈值过期时间（毫秒） - Default threshold expiration time (milliseconds) */
	defaultThresholdExpiration: number;
	/** 是否启用阈值缓存 - Whether to enable threshold caching */
	enableThresholdCaching: boolean;
	/** 缓存过期时间（毫秒） - Cache expiration time (milliseconds) */
	cacheExpiration: number;
	/** 是否启用阈值验证 - Whether to enable threshold validation */
	enableThresholdValidation: boolean;
	/** 最大阈值数量 - Maximum threshold count */
	maxThresholdCount: number;
}

/**
 * 缺口期接管配置接口
 * Gap Period Takeover Configuration Interface
 */
export interface GapPeriodTakeoverConfig {
	/** 是否启用缺口期接管 - Whether to enable gap period takeover */
	enableGapPeriodTakeover: boolean;
	/** 缺口期定义（分钟） - Gap period definition (minutes) */
	gapPeriodDefinition: number;
	/** 接管决策延迟（秒） - Takeover decision delay (seconds) */
	takeoverDecisionDelay: number;
	/** 接管执行延迟（秒） - Takeover execution delay (seconds) */
	takeoverExecutionDelay: number;
	/** 缺口期结束后恢复延迟（秒） - Recovery delay after gap period ends (seconds) */
	recoveryDelayAfterGapEnd: number;
	/** 缺口期检测间隔（秒） - Gap period detection interval (seconds) */
	gapDetectionInterval: number;
}

/**
 * 开仓监控关联配置接口
 * Opening Monitoring Association Configuration Interface
 */
export interface OpeningMonitoringAssociationConfig {
	/** 监控间隔（毫秒） - Monitoring interval (milliseconds) */
	monitoringInterval: number;
	/** 最大重试次数 - Maximum retry count */
	maxRetryCount: number;
	/** 重试间隔（毫秒） - Retry interval (milliseconds) */
	retryInterval: number;
	/** 是否启用自动恢复 - Whether to enable automatic recovery */
	enableAutoRecovery: boolean;
	/** 自动恢复延迟（毫秒） - Automatic recovery delay (milliseconds) */
	autoRecoveryDelay: number;
}

/**
 * 分批平仓指令识别配置接口
 * Batch Closing Instruction Recognizer Configuration Interface
 */
export interface BatchClosingInstructionRecognizerConfig {
	/** 是否启用指令识别 - Whether to enable instruction recognition */
	enableInstructionRecognition: boolean;
	/** 指令识别阈值 - Instruction recognition threshold */
	recognitionThreshold: number;
	/** 最大指令缓存数量 - Maximum instruction cache count */
	maxInstructionCache: number;
	/** 指令过期时间（毫秒） - Instruction expiration time (milliseconds) */
	instructionExpiration: number;
}

/**
 * AI参数控制配置接口
 * AI Parameter Control Configuration Interface
 */
export interface AiParameterControlConfig {
	/** 是否启用AI参数控制 - Whether to enable AI parameter control */
	enableAiParameterControl: boolean;
	/** 参数调整频率限制（秒） - Parameter adjustment frequency limit (seconds) */
	parameterAdjustmentFrequencyLimit: number;
	/** 最大参数调整幅度（百分比） - Maximum parameter adjustment amplitude (percentage) */
	maxParameterAdjustmentAmplitude: number;
	/** 是否启用参数验证 - Whether to enable parameter validation */
	enableParameterValidation: boolean;
	/** 参数验证规则 - Parameter validation rules */
	parameterValidationRules: any;
}
