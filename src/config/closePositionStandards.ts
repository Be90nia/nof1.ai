/**
 * 统一平仓标准配置
 * Unified Close Position Standards Configuration
 *
 * 定义所有平仓系统必须遵循的统一标准
 * Define unified standards that all close position systems must follow
 */

/**
 * 平仓精度标准枚举
 * Close Position Precision Standard Enumeration
 */
export enum ClosePositionPrecision {
	/** 高精度：0.0001 */
	HIGH = 0.0001,
	/** 中精度：0.001 */
	MEDIUM = 0.001,
	/** 低精度：0.01 */
	LOW = 0.01,
}

/**
 * 平仓质量控制标准
 * Close Position Quality Control Standards
 */
export interface ClosePositionQualityControl {
	/** 最大允许残留货币量 */
	maxResidualAmount: number;
	/** 最大允许手续费偏差百分比 */
	maxFeeDeviationPercent: number;
	/** 最大允许滑点百分比 */
	maxSlippagePercent: number;
	/** 最大允许平仓延迟（毫秒） */
	maxCloseDelayMs: number;
	/** 平仓成功率要求（百分比） */
	successRateRequirement: number;
}

/**
 * 统一平仓标准配置
 * Unified Close Position Standards Configuration
 */
export const CLOSE_POSITION_STANDARDS = {
	/**
	 * 精度标准
	 * Precision Standards
	 */
	precision: {
		/** 数量精度 */
		quantity: ClosePositionPrecision.HIGH,
		/** 价格精度 */
		price: ClosePositionPrecision.HIGH,
		/** 盈亏精度 */
		pnl: ClosePositionPrecision.MEDIUM,
		/** 手续费精度 */
		fee: ClosePositionPrecision.MEDIUM,
	},

	/**
	 * 质量控制标准
	 * Quality Control Standards
	 */
	qualityControl: {
		/** 最大允许残留货币量：0 */
		maxResidualAmount: 0,
		/** 最大允许手续费偏差百分比：0.1% */
		maxFeeDeviationPercent: 0.1,
		/** 最大允许滑点百分比：3% */
		maxSlippagePercent: 3,
		/** 最大允许平仓延迟：5000毫秒 */
		maxCloseDelayMs: 5000,
		/** 平仓成功率要求：100% */
		successRateRequirement: 100,
	} as ClosePositionQualityControl,

	/**
	 * 执行标准
	 * Execution Standards
	 */
	execution: {
		/** 禁止多次平仓尝试 */
		allowMultipleAttempts: false,
		/** 必须使用精确数值计算 */
		usePreciseCalculation: true,
		/** 必须验证平仓结果 */
		validateResult: true,
		/** 必须记录详细日志 */
		recordDetailedLogs: true,
		/** 必须使用统一的手续费计算方法 */
		useUnifiedFeeCalculation: true,
	},

	/**
	 * 验证标准
	 * Validation Standards
	 */
	validation: {
		/** 必须验证数量 */
		validateQuantity: true,
		/** 必须验证余额 */
		validateBalance: true,
		/** 必须验证状态 */
		validateStatus: true,
		/** 验证超时时间（毫秒） */
		validationTimeoutMs: 3000,
		/** 验证重试次数 */
		validationRetryCount: 3,
	},

	/**
	 * 告警标准
	 * Alert Standards
	 */
	alerts: {
		/** 残留货币告警阈值 */
		residualAmountAlertThreshold: 0,
		/** 手续费异常告警阈值（百分比） */
		feeAnomalyAlertThreshold: 0.5,
		/** 滑点异常告警阈值（百分比） */
		slippageAnomalyAlertThreshold: 5,
		/** 平仓失败告警 */
		alertOnCloseFailure: true,
	},
};

/**
 * 平仓系统类型枚举
 * Close Position System Type Enumeration
 */
export enum ClosePositionSystemType {
	/** 常规平仓 */
	REGULAR = "regular",
	/** 分批平仓 */
	BATCH = "batch",
	/** 自动平仓 */
	AUTO = "auto",
	/** Agent平仓 */
	AGENT = "agent",
	/** 蔡森平仓系统 */
	CAISEN = "caisen",
}

/**
 * 平仓系统配置接口
 * Close Position System Configuration Interface
 */
export interface ClosePositionSystemConfig {
	/** 系统类型 */
	systemType: ClosePositionSystemType;
	/** 系统名称 */
	systemName: string;
	/** 系统版本 */
	systemVersion: string;
	/** 是否启用 */
	enabled: boolean;
	/** 是否遵循统一标准 */
	followsUnifiedStandards: boolean;
	/** 自定义配置 */
	customConfig?: any;
}

/**
 * 验证平仓结果是否符合统一标准
 * Validate if close position result meets unified standards
 *
 * @param result 平仓结果
 * @returns boolean 是否符合标准
 */
export function validateClosePositionResult(result: any): boolean {
	// 检查是否有残留货币
	if (
		result.residualAmount >
		CLOSE_POSITION_STANDARDS.qualityControl.maxResidualAmount
	) {
		return false;
	}

	// 检查手续费偏差
	if (
		result.feeDeviationPercent >
		CLOSE_POSITION_STANDARDS.qualityControl.maxFeeDeviationPercent
	) {
		return false;
	}

	// 检查滑点
	if (
		result.slippagePercent >
		CLOSE_POSITION_STANDARDS.qualityControl.maxSlippagePercent
	) {
		return false;
	}

	// 检查平仓延迟
	if (
		result.closeDelayMs >
		CLOSE_POSITION_STANDARDS.qualityControl.maxCloseDelayMs
	) {
		return false;
	}

	return true;
}

/**
 * 获取平仓系统配置模板
 * Get close position system configuration template
 *
 * @param systemType 系统类型
 * @param systemName 系统名称
 * @param systemVersion 系统版本
 * @returns ClosePositionSystemConfig 系统配置模板
 */
export function getClosePositionSystemConfigTemplate(
	systemType: ClosePositionSystemType,
	systemName: string,
	systemVersion: string,
): ClosePositionSystemConfig {
	return {
		systemType,
		systemName,
		systemVersion,
		enabled: true,
		followsUnifiedStandards: true,
		customConfig: {},
	};
}
