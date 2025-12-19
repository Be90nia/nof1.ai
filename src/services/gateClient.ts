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

import Big from "big.js";
/**
 * GATE.IO API 客户端封装
 */
// @ts-ignore - gate-api 的类型定义可能不完整
import * as GateApi from "gate-api";
import { RISK_PARAMS } from "../config/riskParams";
import { createLogger } from "../utils/loggerUtils";

const logger = createLogger({
	name: "gate-client",
	level: "info",
});

export class GateClient {
	private readonly client: any;
	private readonly futuresApi: any;
	private readonly spotApi: any;
	private readonly settle = "usdt"; // 使用 USDT 结算

	constructor(apiKey: string, apiSecret: string) {
		// @ts-ignore
		this.client = new GateApi.ApiClient();

		// 根据环境变量决定使用测试网还是正式网
		const isTestnet = process.env.GATE_USE_TESTNET === "true";
		if (isTestnet) {
			this.client.basePath = "https://api-testnet.gateapi.io/api/v4";
			logger.info("使用 GATE 测试网");
		} else {
			// 正式网地址（默认）
			this.client.basePath = "https://api.gateio.ws/api/v4";
			logger.info("使用 GATE 正式网");
		}

		this.client.setApiKeySecret(apiKey, apiSecret);

		// @ts-ignore
		this.futuresApi = new GateApi.FuturesApi(this.client);
		// @ts-ignore
		this.spotApi = new GateApi.SpotApi(this.client);

		logger.info("GATE API 客户端初始化完成");
	}

	/**
	 * 获取合约ticker价格（带重试机制）
	 */
	async getFuturesTicker(contract: string, retries = 2) {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				const result = await this.futuresApi.listFuturesTickers(this.settle, {
					contract,
				});
				return result.body[0];
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取 ${contract} 价格失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
				}
			}
		}

		logger.error(`获取 ${contract} 价格失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 获取合约K线数据（带重试机制）
	 */
	async getFuturesCandles(
		contract: string,
		interval = "5m",
		limit = 100,
		retries = 2,
	) {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				const result = await this.futuresApi.listFuturesCandlesticks(
					this.settle,
					contract,
					{
						interval: interval as any,
						limit,
					},
				);
				return result.body;
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(
						`获取 ${contract} K线数据失败，重试 ${i + 1}/${retries}...`,
					);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
				}
			}
		}

		logger.error(
			`获取 ${contract} K线数据失败（${retries}次重试）:`,
			lastError,
		);
		throw lastError;
	}

	/**
	 * 获取账户余额（带重试机制）
	 */
	async getFuturesAccount(retries = 2) {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				const result = await this.futuresApi.listFuturesAccounts(this.settle);
				return result.body;
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取账户余额失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
				}
			}
		}

		logger.error(`获取账户余额失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 获取当前持仓（带重试机制，只返回允许的币种）
	 * 注意：需要指定 position mode 参数
	 */
	async getPositions(retries = 2) {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				// Gate.io API 调用 listPositions
				// 注意：不传第二个参数表示查询所有模式的持仓
				const result = await this.futuresApi.listPositions(this.settle);
				const allPositions = result.body;

				// 过滤：只保留允许的币种
				const allowedSymbols = RISK_PARAMS.TRADING_SYMBOLS;
				const filteredPositions =
					allPositions?.filter((p: any) => {
						// 从 contract（如 "BTC_USDT"）中提取币种名称（如 "BTC"）
						const symbol = p.contract?.split("_")[0];
						return symbol && allowedSymbols.includes(symbol);
					}) || [];

				return filteredPositions;
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取持仓失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1))); // 递增延迟
				}
			}
		}

		logger.error(`获取持仓失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 下单 - 开仓或平仓
	 */
	async placeOrder(params: {
		contract: string;
		size: number;
		price?: number;
		tif?: string;
		reduceOnly?: boolean;
		autoSize?: string;
		stopLoss?: number;
		takeProfit?: number;
	}) {
		// 验证 size 参数
		if (params.size === 0 || !Number.isFinite(params.size)) {
			throw new Error(
				`Invalid order size: ${params.size}. Size must be a non-zero finite number.`,
			);
		}

		// 验证并调整数量（在 try 外部定义，以便在 catch 中使用）
		let adjustedSize = params.size;

		try {
			// 获取合约信息以验证数量
			const contractInfo = await this.getContractInfo(params.contract);

			const absSize = Math.abs(params.size);

			// Gate.io API 的单笔订单数量限制（根据错误信息）
			const API_MAX_SIZE = 10000000;

			// 检查最小数量限制（使用驼峰命名）
			if (contractInfo.orderSizeMin && absSize < contractInfo.orderSizeMin) {
				logger.warn(
					`订单数量 ${absSize} 小于最小限制 ${contractInfo.orderSizeMin}，调整为最小值`,
				);
				adjustedSize =
					params.size > 0
						? contractInfo.orderSizeMin
						: -contractInfo.orderSizeMin;
			}

			// 检查最大数量限制（使用合约限制和 API 限制中的较小值）
			const maxSize = contractInfo.orderSizeMax
				? Math.min(contractInfo.orderSizeMax, API_MAX_SIZE)
				: API_MAX_SIZE;

			if (absSize > maxSize) {
				logger.warn(
					`订单数量 ${absSize} 超过最大限制 ${maxSize}，调整为最大值`,
				);
				adjustedSize = params.size > 0 ? maxSize : -maxSize;
			}

			// 验证价格偏离（针对限价单）
			let adjustedPrice = params.price;
			if (params.price && params.price > 0) {
				// 获取当前标记价格
				const ticker = await this.getFuturesTicker(params.contract);
				const markPrice = Number.parseFloat(
					ticker.markPrice || ticker.last || "0",
				);

				if (markPrice > 0) {
					const priceDeviation = Math.abs(params.price - markPrice) / markPrice;
					const maxDeviation = 0.015; // 1.5% 限制，留一些缓冲空间（API限制是2%）

					if (priceDeviation > maxDeviation) {
						// 调整价格到允许范围内（留0.5%缓冲）
						if (params.size > 0) {
							// 买入订单：价格不能太高
							adjustedPrice = markPrice * (1 + maxDeviation);
						} else {
							// 卖出订单：价格不能太低
							adjustedPrice = markPrice * (1 - maxDeviation);
						}
						logger.warn(
							`订单价格 ${params.price.toFixed(
								6,
							)} 偏离标记价格 ${markPrice} 超过 ${
								maxDeviation * 100
							}%，调整为 ${adjustedPrice.toFixed(6)}`,
						);
					}
				}
			}

			// 格式化价格，确保不超过精度限制
			// Gate.io API 要求价格精度不超过 12 位小数
			// 注意：price: "0" 表示市价单
			const formatPrice = (price: number | undefined): string => {
				if (!price || price === 0) return "0"; // 市价单

				// 先四舍五入到 8 位小数，避免浮点数精度问题
				const roundedPrice = Math.round(price * 100000000) / 100000000;

				// 转为字符串
				let priceStr = roundedPrice.toString();

				// 如果包含小数点，移除末尾的零
				if (priceStr.includes(".")) {
					priceStr = priceStr.replace(/\.?0+$/, "");
				}

				return priceStr;
			};

			// 格式化数量，确保精度不丢失
			// 对于平仓操作，需要保持原始精度，避免数量截断
			const formatSize = (size: number): string => {
				// 直接转换为字符串，保持原始精度
				return size.toString();
			};

			// 使用 FuturesOrder 类型的结构
			// 注意：gate-api SDK 使用驼峰命名，会自动转换为下划线命名
			const order: any = {
				contract: params.contract,
				size: formatSize(adjustedSize), // 使用格式化函数保持精度
				price: formatPrice(adjustedPrice), // 市价单传 "0"
			};

			// 根据订单类型设置 tif
			const formattedPrice = formatPrice(adjustedPrice);
			if (formattedPrice !== "0") {
				// 限价单：设置 tif 为 GTC（Good Till Cancel）
				order.tif = params.tif || "gtc";
			} else {
				// 市价单：必须设置 IOC（Immediate or Cancel）或 FOK（Fill or Kill）
				// Gate.io API 要求市价单必须指定 IOC 或 FOK
				order.tif = "ioc"; // 立即成交或取消
			}

			// Gate API SDK 使用驼峰命名：isReduceOnly -> is_reduce_only
			// 注意：只使用 isReduceOnly，不使用 isClose，避免保证金计算冲突
			// isReduceOnly 已足够确保只减仓不开仓，反向订单本身就会执行平仓
			if (params.reduceOnly === true) {
				order.isReduceOnly = true;
				order.reduceOnly = true;
				order.reduce_only = true;
				order.is_reduce_only = true;
			}

			// 驼峰命名：autoSize -> auto_size
			if (params.autoSize !== undefined) {
				order.autoSize = params.autoSize;
			}

			// 止盈止损参数（如果有提供）
			if (params.stopLoss !== undefined && params.stopLoss > 0) {
				order.stopLoss = params.stopLoss.toString();
				logger.info(`设置止损价格: ${params.stopLoss}`);
			}

			if (params.takeProfit !== undefined && params.takeProfit > 0) {
				order.takeProfit = params.takeProfit.toString();
				logger.info(`设置止盈价格: ${params.takeProfit}`);
			}

			logger.info(`下单: ${JSON.stringify(order)}`);
			const result = await this.futuresApi.createFuturesOrder(
				this.settle,
				order,
			);
			return result.body;
		} catch (error: any) {
			// 获取详细的 API 错误信息
			const errorDetails = {
				message: error.message,
				status: error.response?.status,
				statusText: error.response?.statusText,
				apiError: error.response?.body || error.response?.data,
			};
			logger.error("下单失败:", errorDetails);

			// 🛡️ 兜底机制：如果 reduceOnly 订单因保证金不足失败，则去除 reduceOnly 重试
			// 这种情况可能发生在某些边缘场景，去除 reduceOnly 后按反向开仓处理可能更稳妥
			if (
				params.reduceOnly === true &&
				errorDetails.apiError?.label === "INSUFFICIENT_AVAILABLE"
			) {
				logger.warn(
					`⚠️  reduceOnly 平仓失败（保证金不足），尝试去除 reduceOnly 参数重试: ${params.contract} size=${adjustedSize}`,
				);

				try {
					// 去除 reduceOnly 参数，重新构建订单
					// 重新格式化价格
					const formatPrice = (price: number | undefined): string => {
						if (!price || price === 0) return "0";
						const roundedPrice = Math.round(price * 100000000) / 100000000;
						let priceStr = roundedPrice.toString();
						if (priceStr.includes(".")) {
							priceStr = priceStr.replace(/\.?0+$/, "");
						}
						return priceStr;
					};

					// 格式化数量，确保精度不丢失
					const formatSize = (size: number): string => {
						// 直接转换为字符串，保持原始精度
						return size.toString();
					};

					const formattedPrice = formatPrice(params.price);

					const retryOrder: any = {
						contract: params.contract,
						size: formatSize(adjustedSize), // 使用格式化函数保持精度
						price: formattedPrice,
						tif: formattedPrice !== "0" ? params.tif || "gtc" : "ioc",
					};

					// 不设置 isReduceOnly

					// 保留其他参数
					if (params.autoSize !== undefined) {
						retryOrder.autoSize = params.autoSize;
					}
					if (params.stopLoss !== undefined && params.stopLoss > 0) {
						retryOrder.stopLoss = params.stopLoss.toString();
					}
					if (params.takeProfit !== undefined && params.takeProfit > 0) {
						retryOrder.takeProfit = params.takeProfit.toString();
					}

					logger.info(
						`重试下单（无 reduceOnly）: ${JSON.stringify(retryOrder)}`,
					);
					const retryResult = await this.futuresApi.createFuturesOrder(
						this.settle,
						retryOrder,
					);

					logger.warn(`✅ 去除 reduceOnly 后下单成功: ${params.contract}`);
					return retryResult.body;
				} catch (retryError: any) {
					// 重试也失败，记录错误并继续抛出原始错误
					const retryErrorDetails = {
						message: retryError.message,
						status: retryError.response?.status,
						apiError: retryError.response?.body || retryError.response?.data,
					};
					logger.error("去除 reduceOnly 后重试仍然失败:", retryErrorDetails);
					// 继续抛出原始错误
				}
			}

			// 特殊处理资金不足的情况（原始错误提示）
			if (errorDetails.apiError?.label === "INSUFFICIENT_AVAILABLE") {
				const msg = errorDetails.apiError.message || "可用保证金不足";
				throw new Error(`资金不足，无法开仓 ${params.contract}: ${msg}`);
			}

			// 抛出更详细的错误信息
			const detailedMessage =
				errorDetails.apiError?.message ||
				errorDetails.apiError?.label ||
				error.message;
			throw new Error(
				`下单失败: ${detailedMessage} (${params.contract}, size: ${adjustedSize})`,
			);
		}
	}

	/**
	 * 获取订单详情
	 * @param orderId 订单ID
	 * @param contract 合约名称（可选，Gate.io 不需要此参数）
	 */
	async getOrder(orderId: string, contract?: string) {
		try {
			// Gate.io API 不需要 contract 参数，忽略该参数
			const result = await this.futuresApi.getFuturesOrder(
				this.settle,
				orderId,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取订单 ${orderId} 详情失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 取消订单
	 */
	async cancelOrder(orderId: string) {
		try {
			const result = await this.futuresApi.cancelFuturesOrder(
				this.settle,
				orderId,
			);
			return result.body;
		} catch (error) {
			logger.error(`取消订单 ${orderId} 失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取未成交订单
	 */
	async getOpenOrders(contract?: string) {
		try {
			const result = await this.futuresApi.listFuturesOrders(
				this.settle,
				"open",
				{
					contract,
				},
			);
			return result.body;
		} catch (error) {
			logger.error("获取未成交订单失败:", error as any);
			throw error;
		}
	}

	/**
	 * 设置仓位杠杆
	 */
	async setLeverage(contract: string, leverage: number) {
		try {
			logger.info(`设置 ${contract} 杠杆为 ${leverage}x`);
			const result = await this.futuresApi.updatePositionLeverage(
				this.settle,
				contract,
				leverage.toString(),
			);
			return result.body;
		} catch (error: any) {
			// 如果已有持仓，某些交易所不允许修改杠杆，这是正常的
			// 记录警告但不抛出错误，让交易继续
			logger.warn(`设置 ${contract} 杠杆失败（可能已有持仓）:`, error.message);
			return null;
		}
	}

	/**
	 * 获取资金费率
	 */
	async getFundingRate(contract: string) {
		try {
			const result = await this.futuresApi.listFuturesFundingRateHistory(
				this.settle,
				contract,
				{ limit: 1 },
			);
			return result.body[0];
		} catch (error) {
			logger.error(`获取 ${contract} 资金费率失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取合约信息（包含持仓量等）
	 */
	async getContractInfo(contract: string) {
		try {
			const result = await this.futuresApi.getFuturesContract(
				this.settle,
				contract,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取 ${contract} 合约信息失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取所有合约列表
	 */
	async getAllContracts() {
		try {
			const result = await this.futuresApi.listFuturesContracts(this.settle);
			return result.body;
		} catch (error) {
			logger.error("获取合约列表失败:", error as any);
			throw error;
		}
	}

	/**
	 * 获取订单簿
	 */
	async getOrderBook(contract: string, limit = 10) {
		try {
			const result = await this.futuresApi.listFuturesOrderBook(
				this.settle,
				contract,
				{ limit },
			);
			return result.body;
		} catch (error) {
			logger.error(`获取 ${contract} 订单簿失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取历史成交记录（我的成交）
	 * 用于分析最近的交易历史和盈亏情况
	 * @param contract 合约名称（可选，不传则获取所有合约）
	 * @param limit 返回数量，默认10条
	 */
	async getMyTrades(contract?: string, limit = 10) {
		try {
			const options: any = { limit };
			if (contract) {
				options.contract = contract;
			}

			// Gate.io API: 使用 getMyFuturesTrades 方法
			// 注意：SDK 方法名可能是 getMyFuturesTrades 而不是 listMyTrades
			const result = await this.futuresApi.getMyFuturesTrades(
				this.settle,
				options,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取我的历史成交记录失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取历史仓位记录（已平仓的仓位结算记录）
	 * @param contract 合约名称（可选，不传则获取所有合约）
	 * @param limit 返回数量，默认100条
	 * @param offset 偏移量，默认0，用于分页
	 */
	async getPositionHistory(contract?: string, limit = 100, offset = 0) {
		try {
			const options: any = { limit, offset };
			if (contract) {
				options.contract = contract;
			}

			// Gate.io API: 使用 listFuturesLiquidatedOrders 方法获取已清算仓位
			// 注意：这个方法返回的是已清算（平仓）的仓位历史
			const result = await this.futuresApi.listFuturesLiquidatedOrders(
				this.settle,
				options,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取历史仓位记录失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取历史结算记录（更详细的历史仓位信息）
	 * @param contract 合约名称（可选，不传则获取所有合约）
	 * @param limit 返回数量，默认100条
	 * @param offset 偏移量，默认0，用于分页
	 */
	async getSettlementHistory(contract?: string, limit = 100, offset = 0) {
		try {
			const options: any = { limit, offset };
			if (contract) {
				options.contract = contract;
			}

			// Gate.io API: 使用 listFuturesSettlementHistory 方法获取结算历史
			const result = await this.futuresApi.listFuturesSettlementHistory(
				this.settle,
				options,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取历史结算记录失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取已完成的订单历史
	 * @param contract 合约名称（可选）
	 * @param limit 返回数量，默认10条
	 */
	async getOrderHistory(contract?: string, limit = 10) {
		try {
			const options: any = { limit };
			if (contract) {
				options.contract = contract;
			}

			const result = await this.futuresApi.listFuturesOrders(
				this.settle,
				"finished",
				options,
			);
			return result.body;
		} catch (error) {
			logger.error(`获取订单历史失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 平仓 - 直接平掉指定合约的持仓
	 * @param params 平仓参数
	 */
	async closePosition(params: {
		contract: string;
		size?: number; // 可选，不指定则平掉全部持仓
		price?: number; // 可选，不指定则使用市价
	}) {
		try {
			// 获取当前持仓
			const positions = await this.getPositions();
			const targetPosition = positions.find(
				(p: { contract: string; size: string }) =>
					p.contract === params.contract,
			);

			if (!targetPosition) {
				logger.warn(`合约 ${params.contract} 无持仓，无需平仓`);
				return null;
			}

			// 使用 Big.js 精确处理数值
			const positionSizeBig = new Big(targetPosition.size);
			if (positionSizeBig.eq(0)) {
				logger.warn(`合约 ${params.contract} 无持仓，无需平仓`);
				return null;
			}

			// 确定平仓数量
			const absolutePositionSize = positionSizeBig.abs();
			const closeSizeBig = params.size
				? (() => {
						const requestedSize = new Big(params.size);
						return requestedSize.gt(absolutePositionSize)
							? absolutePositionSize
							: requestedSize;
					})()
				: absolutePositionSize;

			// 确保平仓数量为正数
			if (closeSizeBig.lte(0)) {
				logger.warn(
					`合约 ${params.contract} 平仓数量无效: ${closeSizeBig.toString()}`,
				);
				return null;
			}

			// 确定平仓方向（与持仓方向相反）
			const isLong = positionSizeBig.gt(0);
			const orderSizeBig = isLong ? closeSizeBig.neg() : closeSizeBig;
			const orderSize = Number.parseFloat(orderSizeBig.toString());

			// 执行平仓订单
			const result = await this.placeOrder({
				contract: params.contract,
				size: orderSize,
				price: params.price || 0, // 不指定价格则使用市价
				reduceOnly: true, // 确保只减仓
				tif: params.price ? "gtc" : "ioc", // 市价单使用IOC
			});

			logger.info(`平仓订单已提交: ${params.contract}, 数量: ${orderSize}`);

			// 验证平仓结果 - 确保没有残留货币
			const { ClosePositionValidator } = await import(
				"../utils/closePositionValidator"
			);
			const validator = new ClosePositionValidator(this);
			const validationResult = await validator.validateClosePosition(
				params.contract,
				Math.abs(orderSize),
			);

			// 如果验证失败，记录错误但不影响返回结果
			if (!validationResult.success) {
				logger.error(`平仓验证失败: ${params.contract}`, validationResult);
			}

			return result;
		} catch (error: any) {
			logger.error(`平仓失败: ${params.contract}`, error);
			throw error;
		}
	}

	/**
	 * 计算ATR（平均真实波幅）
	 * @param candles K线数据
	 * @param period 计算周期
	 * @returns ATR值
	 */
	private calculateATR(candles: any[], period: number): number {
		if (candles.length < period + 1) {
			return 0;
		}

		let trSum = 0;

		// 计算真实波幅
		for (let i = 1; i < candles.length; i++) {
			const current = candles[i];
			const previous = candles[i - 1];

			const high = Number.parseFloat(current.h);
			const low = Number.parseFloat(current.l);
			const prevClose = Number.parseFloat(previous.c);

			const tr1 = high - low;
			const tr2 = Math.abs(high - prevClose);
			const tr3 = Math.abs(low - prevClose);

			const tr = Math.max(tr1, tr2, tr3);
			trSum += tr;
		}

		// 计算ATR
		return trSum / (candles.length - 1);
	}

	/**
	 * 获取市场恐惧贪婪指数
	 * 基于交易所真实数据计算，范围：0-100，0表示极度恐惧，100表示极度贪婪
	 * 计算方法：
	 * 1. 价格动量（25%权重）：基于最近价格变化率
	 * 2. 波动率（25%权重）：基于ATR
	 * 3. 资金费率（25%权重）：反映市场情绪
	 * 4. 订单簿不平衡（25%权重）：反映买卖压力
	 *
	 * @param baseSymbol 基础币种，默认为 BTC
	 * @returns 恐惧贪婪指数对象，包含计算结果和各组件得分
	 */
	async getFearAndGreedIndex(baseSymbol = "BTC") {
		try {
			// 动态生成合约名称，避免硬编码
			const contract = `${baseSymbol}_USDT`;

			// 1. 获取价格动量数据
			const ticker = await this.getFuturesTicker(contract);
			const candles24h = await this.getFuturesCandles(contract, "1h", 24);

			// 2. 计算价格动量（24小时变化率）
			const currentPrice = Number.parseFloat(ticker.last);
			const openPrice24h = Number.parseFloat(candles24h[0].o);
			const priceChangeRate =
				((currentPrice - openPrice24h) / openPrice24h) * 100;

			// 3. 计算波动率（ATR）
			const candlesForAtr = await this.getFuturesCandles(contract, "1h", 21);
			const atr = this.calculateATR(candlesForAtr, 20);
			const atrPercent = (atr / currentPrice) * 100;

			// 4. 获取资金费率
			const fundingRateData = await this.getFundingRate(contract);
			const fundingRate = Number.parseFloat(fundingRateData.r) * 100;

			// 5. 获取订单簿数据
			const orderBook = await this.getOrderBook(contract, 20);

			// 计算订单簿不平衡
			const bidVolume = orderBook.bids.reduce(
				(sum: number, bid: any) => sum + Number.parseFloat(bid.s),
				0,
			);
			const askVolume = orderBook.asks.reduce(
				(sum: number, ask: any) => sum + Number.parseFloat(ask.s),
				0,
			);
			const orderBookImbalance =
				((bidVolume - askVolume) / (bidVolume + askVolume)) * 100;

			// 5. 计算交易量分布（上涨/下跌时的交易量比例）
			const volumeDistribution = candles24h.reduce(
				(
					acc: { upVolume: number; downVolume: number; totalVolume: number },
					candle: { o: string; c: string; v: string },
				) => {
					const open = Number.parseFloat(candle.o);
					const close = Number.parseFloat(candle.c);
					const volume = Number.parseFloat(candle.v);

					if (close > open) {
						acc.upVolume += volume;
					} else if (close < open) {
						acc.downVolume += volume;
					}

					acc.totalVolume += volume;
					return acc;
				},
				{ upVolume: 0, downVolume: 0, totalVolume: 0 },
			);

			const volumeRatio =
				volumeDistribution.totalVolume > 0
					? (volumeDistribution.upVolume - volumeDistribution.downVolume) /
						volumeDistribution.totalVolume
					: 0;

			// 计算各项指标得分（0-100）
			// 价格动量得分：上涨为贪婪，下跌为恐惧
			const priceMomentumScore = Math.min(
				Math.max(50 + priceChangeRate * 2, 0),
				100,
			);

			// 波动率得分：低波动为贪婪，高波动为恐惧
			const volatilityScore = Math.min(Math.max(100 - atrPercent * 5, 0), 100);

			// 资金费率得分：正费率为贪婪，负费率为恐惧
			const fundingRateScore = Math.min(
				Math.max(50 + fundingRate * 100, 0),
				100,
			);

			// 订单簿不平衡得分：买盘强为贪婪，卖盘强为恐惧
			const orderBookScore = Math.min(
				Math.max(50 + orderBookImbalance, 0),
				100,
			);

			// 交易量分布得分：上涨时交易量占比高为贪婪，下跌时交易量占比高为恐惧
			const volumeDistributionScore = Math.min(
				Math.max(50 + volumeRatio * 100, 0),
				100,
			);

			// 计算最终恐惧贪婪指数（加权平均，增加交易量分布指标）
			const fearGreedIndex = Math.round(
				priceMomentumScore * 0.2 +
					volatilityScore * 0.2 +
					fundingRateScore * 0.2 +
					orderBookScore * 0.2 +
					volumeDistributionScore * 0.2,
			);

			// 确定描述
			let description = "中性";
			if (fearGreedIndex < 30) {
				description = "恐惧";
			} else if (fearGreedIndex > 70) {
				description = "贪婪";
			}

			return {
				value: fearGreedIndex,
				timestamp: Date.now(),
				description,
				baseSymbol,
				contract,
				components: {
					priceMomentum: priceMomentumScore,
					volatility: volatilityScore,
					fundingRate: fundingRateScore,
					orderBook: orderBookScore,
					volumeDistribution: volumeDistributionScore,
				},
				// 添加计算公式说明
				calculationMethod: {
					formula:
						"恐惧贪婪指数 = 0.2*价格动量得分 + 0.2*波动率得分 + 0.2*资金费率得分 + 0.2*订单簿不平衡得分 + 0.2*交易量分布得分",
					components: {
						priceMomentum: "价格动量得分 = 50 + 价格变化率(%) * 2",
						volatility: "波动率得分 = 100 - ATR百分比 * 5",
						fundingRate: "资金费率得分 = 50 + 资金费率(%) * 100",
						orderBook: "订单簿不平衡得分 = 50 + 订单簿不平衡百分比",
						volumeDistribution:
							"交易量分布得分 = 50 + (上涨交易量-下跌交易量)/总交易量 * 100",
					},
				},
			};
		} catch (error) {
			logger.error(`获取${baseSymbol}市场恐惧贪婪指数失败:`, error as any);
			throw error;
		}
	}

	/**
	 * 获取市场微观结构指标
	 * 实现基础版本，包含从现有数据计算得出的指标
	 */
	async getMarketMicrostructureMetrics(contract: string) {
		try {
			// 获取订单簿数据
			const orderBook = await this.getOrderBook(contract, 20);

			// 获取最近成交数据
			const recentTrades = await this.futuresApi.listFuturesTrades(
				this.settle,
				contract,
				{
					limit: 100,
				},
			);

			// 获取当前ticker数据
			const ticker = await this.getFuturesTicker(contract);

			// 计算订单簿指标
			const bidVolume = orderBook.bids.reduce(
				(sum: number, bid: any) => sum + Number.parseFloat(bid.s),
				0,
			);
			const askVolume = orderBook.asks.reduce(
				(sum: number, ask: any) => sum + Number.parseFloat(ask.s),
				0,
			);
			const orderBookImbalance =
				((bidVolume - askVolume) / (bidVolume + askVolume)) * 100;

			// 计算买卖价差
			const spread =
				Number.parseFloat(orderBook.asks[0].p) -
				Number.parseFloat(orderBook.bids[0].p);

			// 计算大额订单数量（>100k USD）
			const largeOrderThreshold = 100000;
			const largeBids = orderBook.bids.filter(
				(bid: any) =>
					Number.parseFloat(bid.p) * Number.parseFloat(bid.s) >
					largeOrderThreshold,
			).length;
			const largeAsks = orderBook.asks.filter(
				(ask: any) =>
					Number.parseFloat(ask.p) * Number.parseFloat(ask.s) >
					largeOrderThreshold,
			).length;

			// 计算成交指标
			const trades = recentTrades.body;
			const totalTrades = trades.length;
			const buyTrades = trades.filter(
				(trade: any) => trade.side === "buy",
			).length;
			const sellTrades = trades.filter(
				(trade: any) => trade.side === "sell",
			).length;
			const buySellRatio = sellTrades > 0 ? buyTrades / sellTrades : buyTrades;

			// 计算执行速度（简化版，使用最近成交的时间差）
			let executionSpeed = 0;
			if (trades.length > 1) {
				const firstTradeTime = new Date(trades[0].create_time).getTime();
				const lastTradeTime = new Date(
					trades[trades.length - 1].create_time,
				).getTime();
				executionSpeed = (lastTradeTime - firstTradeTime) / trades.length;
			}

			// 计算流动性比率
			const liquidityRatio =
				bidVolume + askVolume > 0 ? spread / (bidVolume + askVolume) : 0;

			// 返回基础微观结构指标
			return {
				orderBookMetrics: {
					orderBookImbalance,
					spread,
					largeBids,
					largeAsks,
					bidDepthChangeRate: 0, // Gate.io API不直接提供，设为0
					askDepthChangeRate: 0, // Gate.io API不直接提供，设为0
				},
				tradeMetrics: {
					distribution: {
						totalTrades,
						buySellRatio,
					},
					executionSpeed,
					liquidityRatio,
					vwap: Number.parseFloat(ticker.last), // 使用当前价格作为简化版VWAP
				},
				additionalMetrics: {
					orderBookSlope: {
						bidSlope: 0, // Gate.io API不直接提供，设为0
						askSlope: 0, // Gate.io API不直接提供，设为0
					},
					priceImpact: 0, // Gate.io API不直接提供，设为0
				},
			};
		} catch (error) {
			logger.error(`获取${contract}微观结构指标失败:`, error as any);
			throw error;
		}
	}
}

/**
 * 全局 GATE 客户端实例（单例模式）
 */
let gateClientInstance: GateClient | null = null;

/**
 * 创建全局 GATE 客户端实例（单例模式）
 */
export function createGateClient(): GateClient {
	// 如果已存在实例，直接返回
	if (gateClientInstance) {
		return gateClientInstance;
	}

	const apiKey = process.env.GATE_API_KEY;
	const apiSecret = process.env.GATE_API_SECRET;

	if (!apiKey || !apiSecret) {
		throw new Error("GATE_API_KEY 和 GATE_API_SECRET 必须在环境变量中设置");
	}

	// 创建并缓存实例
	gateClientInstance = new GateClient(apiKey, apiSecret);
	return gateClientInstance;
}
