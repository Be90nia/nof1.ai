import Big from "big.js";
import type { IExchangeClient } from "../services/exchangeClient";
/**
 * 平仓结果验证工具
 * Close Position Result Validator
 *
 * 用于验证平仓结果，确保没有残留货币
 * Used to validate close position results and ensure no residual currency
 */
import { createLogger } from "./loggerUtils";

const logger = createLogger({
	name: "close-position-validator",
	level: "info",
});

/**
 * 平仓验证结果接口
 * Close Position Validation Result Interface
 */
export interface ClosePositionValidationResult {
	/** 是否成功 */
	success: boolean;
	/** 验证结果信息 */
	message: string;
	/** 详细验证结果 */
	details: {
		/** 数量校验结果 */
		quantityCheck: {
			passed: boolean;
			message: string;
			positionSize: number;
		};
		/** 余额校验结果 */
		balanceCheck: {
			passed: boolean;
			message: string;
			balance: number;
		};
		/** 状态校验结果 */
		statusCheck: {
			passed: boolean;
			message: string;
			status: string;
		};
	};
	/** 错误信息（如果有） */
	error?: any;
}

/**
 * 平仓结果验证器类
 * Close Position Result Validator Class
 */
export class ClosePositionValidator {
	private exchangeClient: IExchangeClient;

	constructor(exchangeClient: IExchangeClient) {
		this.exchangeClient = exchangeClient;
	}

	/**
	 * 验证平仓结果
	 * Validate close position result
	 *
	 * @param contract 合约名称
	 * @param expectedCloseSize 预期平仓数量
	 * @returns Promise<ClosePositionValidationResult> 验证结果
	 */
	async validateClosePosition(
		contract: string,
		expectedCloseSize: number,
	): Promise<ClosePositionValidationResult> {
		try {
			logger.info(`开始验证平仓结果: ${contract}`);

			// 1. 数量校验：检查持仓数量是否为0
			const quantityCheckResult = await this.validatePositionQuantity(contract);

			// 2. 余额校验：检查账户余额是否正确
			const balanceCheckResult = await this.validateAccountBalance();

			// 3. 状态校验：检查持仓状态是否已关闭
			const statusCheckResult = await this.validatePositionStatus(contract);

			// 综合验证结果
			const allChecksPassed =
				quantityCheckResult.passed &&
				balanceCheckResult.passed &&
				statusCheckResult.passed;

			const validationResult: ClosePositionValidationResult = {
				success: allChecksPassed,
				message: allChecksPassed
					? "平仓验证成功，无残留货币"
					: "平仓验证失败，存在残留货币",
				details: {
					quantityCheck: quantityCheckResult,
					balanceCheck: balanceCheckResult,
					statusCheck: statusCheckResult,
				},
			};

			if (!allChecksPassed) {
				logger.error(`平仓验证失败: ${contract}`, validationResult);
				// 发出告警
				this.emitAlert(contract, validationResult);
			} else {
				logger.info(`平仓验证成功: ${contract}`, validationResult);
			}

			return validationResult;
		} catch (error: any) {
			logger.error(`验证平仓结果时出错: ${contract}`, error);

			return {
				success: false,
				message: `验证平仓结果时出错: ${error.message}`,
				details: {
					quantityCheck: {
						passed: false,
						message: `数量校验失败: ${error.message}`,
						positionSize: 0,
					},
					balanceCheck: {
						passed: false,
						message: `余额校验失败: ${error.message}`,
						balance: 0,
					},
					statusCheck: {
						passed: false,
						message: `状态校验失败: ${error.message}`,
						status: "unknown",
					},
				},
				error,
			};
		}
	}

	/**
	 * 验证持仓数量
	 * Validate position quantity
	 *
	 * @param contract 合约名称
	 * @returns Promise<{ passed: boolean; message: string; positionSize: number }> 数量校验结果
	 */
	private async validatePositionQuantity(
		contract: string,
	): Promise<{ passed: boolean; message: string; positionSize: number }> {
		try {
			const positions = await this.exchangeClient.getPositions();
			const position = positions.find((p: any) => p.contract === contract);

			if (!position) {
				// 没有找到持仓，验证通过
				return {
					passed: true,
					message: "未找到持仓，验证通过",
					positionSize: 0,
				};
			}

			// 使用 Big.js 精确检查持仓数量
			const positionSizeBig = new Big(position.size);
			const positionSize = Number.parseFloat(positionSizeBig.toString());

			if (positionSizeBig.eq(0)) {
				return {
					passed: true,
					message: "持仓数量为0，验证通过",
					positionSize: 0,
				};
			} else {
				return {
					passed: false,
					message: `存在残留持仓，数量: ${positionSize}`,
					positionSize: positionSize,
				};
			}
		} catch (error: any) {
			logger.error(`验证持仓数量时出错: ${contract}`, error);
			return {
				passed: false,
				message: `验证持仓数量时出错: ${error.message}`,
				positionSize: 0,
			};
		}
	}

	/**
	 * 验证账户余额
	 * Validate account balance
	 *
	 * @returns Promise<{ passed: boolean; message: string; balance: number }> 余额校验结果
	 */
	private async validateAccountBalance(): Promise<{
		passed: boolean;
		message: string;
		balance: number;
	}> {
		try {
			const account = await this.exchangeClient.getFuturesAccount();
			const balance = Number.parseFloat(account.available || "0");

			if (balance >= 0) {
				return {
					passed: true,
					message: `账户余额正常: ${balance} USDT`,
					balance: balance,
				};
			} else {
				return {
					passed: false,
					message: `账户余额异常: ${balance} USDT`,
					balance: balance,
				};
			}
		} catch (error: any) {
			logger.error("验证账户余额时出错", error);
			return {
				passed: false,
				message: `验证账户余额时出错: ${error.message}`,
				balance: 0,
			};
		}
	}

	/**
	 * 验证持仓状态
	 * Validate position status
	 *
	 * @param contract 合约名称
	 * @returns Promise<{ passed: boolean; message: string; status: string }> 状态校验结果
	 */
	private async validatePositionStatus(
		contract: string,
	): Promise<{ passed: boolean; message: string; status: string }> {
		try {
			const positions = await this.exchangeClient.getPositions();
			const position = positions.find((p: any) => p.contract === contract);

			if (!position) {
				// 没有找到持仓，验证通过
				return {
					passed: true,
					message: "未找到持仓，验证通过",
					status: "closed",
				};
			}

			// 检查持仓状态
			const status = position.status || "unknown";
			if (status === "closed" || Number.parseFloat(position.size) === 0) {
				return {
					passed: true,
					message: `持仓状态正常: ${status}`,
					status: status,
				};
			} else {
				return {
					passed: false,
					message: `持仓状态异常: ${status}`,
					status: status,
				};
			}
		} catch (error: any) {
			logger.error(`验证持仓状态时出错: ${contract}`, error);
			return {
				passed: false,
				message: `验证持仓状态时出错: ${error.message}`,
				status: "error",
			};
		}
	}

	/**
	 * 发出告警
	 * Emit alert
	 *
	 * @param contract 合约名称
	 * @param validationResult 验证结果
	 */
	private emitAlert(
		contract: string,
		validationResult: ClosePositionValidationResult,
	): void {
		// 这里可以实现告警逻辑，比如发送邮件、短信或者通过其他方式通知
		logger.error(`🚨 平仓验证失败告警: ${contract}`, validationResult);

		// 可以添加更多告警方式，比如：
		// - 发送到监控系统
		// - 发送邮件通知
		// - 发送短信通知
		// - 发送到即时通讯工具（如 Slack、Discord 等）
	}
}

/**
 * 创建平仓结果验证器
 * Create close position validator
 *
 * @param exchangeClient 交易所客户端
 * @returns ClosePositionValidator 平仓结果验证器实例
 */
export function createClosePositionValidator(
	exchangeClient: IExchangeClient,
): ClosePositionValidator {
	return new ClosePositionValidator(exchangeClient);
}
