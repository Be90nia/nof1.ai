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

/**
 * OKX API 客户端封装
 */
import * as crypto from "crypto";
import { RISK_PARAMS } from "../config/riskParams";
import { createLogger } from "../utils/loggerUtils";
import { getOkxWebSocketClient } from "./okxWebSocket";

const logger = createLogger({
	name: "okx-client",
	level: "info",
});

export class OkxClient {
	private readonly apiKey: string;
	private readonly apiSecret: string;
	private readonly passphrase: string;
	private readonly baseUrl: string;
	private readonly isTestnet: boolean;
	private readonly useWebSocket: boolean;
	private positionModeSet = false;
	private serverTimeOffset = 0; // 服务器时间偏移量（毫秒）
	private lastServerTimeSync = 0; // 上次同步服务器时间的时间戳
	private readonly SERVER_TIME_SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟同步一次服务器时间

	constructor(apiKey: string, apiSecret: string, passphrase: string) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
		this.passphrase = passphrase;

		// OKX 测试网和正式网使用相同的域名，通过 header 区分
		this.baseUrl = "https://www.okx.com";

		// 根据环境变量决定使用测试网还是正式网
		this.isTestnet = process.env.OKX_USE_TESTNET === "true";

		// 是否使用 WebSocket 获取行情数据（默认开启）
		this.useWebSocket = process.env.OKX_USE_WEBSOCKET !== "false";

		if (this.isTestnet) {
			logger.info("使用 OKX 测试网 (x-simulated-trading: 1)");
		} else {
			logger.info("使用 OKX 正式网");
		}

		if (this.useWebSocket) {
			logger.info("使用 WebSocket 获取行情数据");
			// 初始化 WebSocket 连接
			this.initWebSocket();
		} else {
			logger.info("使用 REST API 获取行情数据");
		}

		// 初始化时同步服务器时间
		this.initServerTimeSync();

		logger.info("OKX API 客户端初始化完成");
	}

	/**
	 * 初始化服务器时间同步
	 * Initialize server time synchronization
	 */
	private async initServerTimeSync(): Promise<void> {
		try {
			await this.getServerTime();
			logger.info("OKX 服务器时间同步初始化完成");
		} catch (error) {
			logger.warn("初始化OKX服务器时间同步失败，将使用本地时间:", error);
		}
	}

	/**
	 * 初始化 WebSocket 连接
	 */
	private async initWebSocket(): Promise<void> {
		try {
			const wsClient = getOkxWebSocketClient();
			await wsClient.connect();
			logger.info("WebSocket 连接初始化成功");
		} catch (error) {
			logger.error("WebSocket 连接初始化失败:", error);
			// 不抛出错误，允许降级到 REST API
		}
	}

	/**
	 * 获取OKX服务器时间
	 * Get OKX server time
	 * @returns {Promise<string>} ISO格式的时间戳 ISO format timestamp
	 */
	private async getServerTime(): Promise<string> {
		try {
			const url = `${this.baseUrl}/api/v5/public/time`;
			const response = await fetch(url);
			const data = await response.json();

			if (data.code !== "0") {
				throw new Error(`获取服务器时间失败: ${data.msg}`);
			}

			// OKX返回的时间戳是毫秒级
			const serverTimestamp = Number.parseInt(data.data[0].ts);
			const localTimestamp = Date.now();

			// 计算服务器时间与本地时间的偏移量
			this.serverTimeOffset = serverTimestamp - localTimestamp;
			this.lastServerTimeSync = localTimestamp;

			logger.debug(`服务器时间同步完成，偏移量: ${this.serverTimeOffset}ms`);

			// 返回服务器时间的ISO格式
			return new Date(serverTimestamp).toISOString();
		} catch (error) {
			logger.error("获取OKX服务器时间失败:", error);
			// 如果获取服务器时间失败，使用本地时间
			return new Date().toISOString();
		}
	}

	/**
	 * 获取同步后的时间戳
	 * Get synchronized timestamp
	 * @returns {string} ISO格式的时间戳 ISO format timestamp
	 */
	private async getTimestamp(): Promise<string> {
		const now = Date.now();

		// 如果距离上次同步超过设定间隔，重新同步服务器时间
		if (now - this.lastServerTimeSync > this.SERVER_TIME_SYNC_INTERVAL) {
			await this.getServerTime();
		}

		// 使用本地时间加上偏移量来模拟服务器时间
		const syncedTime = new Date(now + this.serverTimeOffset);
		return syncedTime.toISOString();
	}

	/**
	 * 生成 OKX API 签名
	 */
	private sign(
		timestamp: string,
		method: string,
		requestPath: string,
		body = "",
	): string {
		const message = timestamp + method + requestPath + body;
		const hmac = crypto.createHmac("sha256", this.apiSecret);
		hmac.update(message);
		return hmac.digest("base64");
	}

	/**
	 * 发送 HTTP 请求
	 */
	private async request(
		method: string,
		endpoint: string,
		params?: Record<string, any>,
		body?: Record<string, any>,
	): Promise<any> {
		// 使用同步后的时间戳
		const timestamp = await this.getTimestamp();

		// 构建查询字符串
		let queryString = "";
		if (params && Object.keys(params).length > 0) {
			queryString =
				"?" +
				new URLSearchParams(
					Object.entries(params).reduce(
						(acc, [key, value]) => {
							if (value !== undefined && value !== null) {
								acc[key] = String(value);
							}
							return acc;
						},
						{} as Record<string, string>,
					),
				).toString();
		}

		const requestPath = endpoint + queryString;
		const bodyStr = body ? JSON.stringify(body) : "";
		const sign = this.sign(timestamp, method, requestPath, bodyStr);

		// 构建请求头
		const headers: Record<string, string> = {
			"OK-ACCESS-KEY": this.apiKey,
			"OK-ACCESS-SIGN": sign,
			"OK-ACCESS-TIMESTAMP": timestamp,
			"OK-ACCESS-PASSPHRASE": this.passphrase,
			"Content-Type": "application/json",
		};

		// 测试网标识
		if (this.isTestnet) {
			headers["x-simulated-trading"] = "1";
		}

		const url = this.baseUrl + requestPath;

		try {
			const response = await fetch(url, {
				method,
				headers,
				body: bodyStr || undefined,
			});

			const data = await response.json();

			// 记录详细的请求和响应信息（仅在出错时）
			if (data.code !== "0") {
				logger.error(`OKX API 错误响应: ${method} ${endpoint}`, {
					requestBody: bodyStr ? JSON.parse(bodyStr) : undefined,
					responseCode: data.code,
					responseMsg: data.msg,
					responseData: data.data,
					httpStatus: response.status,
				});
			}

			// OKX API 返回格式: {code, msg, data}
			if (data.code !== "0") {
				// 如果是时间戳过期错误，尝试重新同步时间并重试一次
				if (data.code === "50102" && this.lastServerTimeSync > 0) {
					logger.warn("检测到时间戳过期错误，重新同步服务器时间并重试");
					// 强制重新同步服务器时间
					this.lastServerTimeSync = 0;
					const newTimestamp = await this.getTimestamp();

					// 重新生成签名
					const newSign = this.sign(newTimestamp, method, requestPath, bodyStr);
					headers["OK-ACCESS-TIMESTAMP"] = newTimestamp;
					headers["OK-ACCESS-SIGN"] = newSign;

					// 重试请求
					const retryResponse = await fetch(url, {
						method,
						headers,
						body: bodyStr || undefined,
					});

					const retryData = await retryResponse.json();
					if (retryData.code === "0") {
						return retryData.data;
					} else {
						// 重试也失败，抛出错误
						let detailedError = retryData.msg;
						if (
							retryData.data &&
							Array.isArray(retryData.data) &&
							retryData.data.length > 0
						) {
							const firstError = retryData.data[0];
							if (firstError.sMsg) {
								detailedError = `${retryData.msg} - ${firstError.sMsg} (sCode: ${firstError.sCode})`;
							}
						}
						throw new Error(
							`OKX API Error: ${detailedError} (code: ${retryData.code})`,
						);
					}
				}

				// 如果有详细的错误数据，提取出来
				let detailedError = data.msg;
				if (data.data && Array.isArray(data.data) && data.data.length > 0) {
					const firstError = data.data[0];
					if (firstError.sMsg) {
						detailedError = `${data.msg} - ${firstError.sMsg} (sCode: ${firstError.sCode})`;
					}
				}
				throw new Error(`OKX API Error: ${detailedError} (code: ${data.code})`);
			}

			return data.data;
		} catch (error: any) {
			logger.error(`OKX API 请求失败: ${method} ${endpoint}`, error);
			throw error;
		}
	}

	/**
	 * 将 Gate 格式的合约名转换为 OKX 格式
	 * Gate: BTC_USDT -> OKX: BTC-USDT-SWAP
	 */
	private toOkxContract(gateContract: string): string {
		const symbol = gateContract.replace("_USDT", "");
		return `${symbol}-USDT-SWAP`;
	}

	/**
	 * 将 OKX 格式的合约名转换为 Gate 格式
	 * OKX: BTC-USDT-SWAP -> Gate: BTC_USDT
	 */
	private toGateContract(okxContract: string): string {
		const symbol = okxContract.replace("-USDT-SWAP", "");
		return `${symbol}_USDT`;
	}

	/**
	 * 获取合约ticker价格（带重试机制）
	 * 优先使用 WebSocket，失败时降级到 REST API
	 */
	async getFuturesTicker(contract: string, retries = 2): Promise<any> {
		const instId = this.toOkxContract(contract);

		// 尝试使用 WebSocket
		if (this.useWebSocket) {
			try {
				const wsClient = getOkxWebSocketClient();

				// 检查缓存
				let ticker = wsClient.getCachedTicker(instId);

				if (!ticker) {
					// 订阅并等待数据
					await wsClient.subscribe("tickers", instId);
					ticker = await wsClient.waitForTicker(instId, 3000);
				}

				if (ticker) {
					// 转换为 Gate 格式的返回值
					return {
						contract,
						last: ticker.last,
						markPrice: ticker.idxPx, // OKX 使用 idxPx 作为指数价格
						indexPrice: ticker.idxPx,
						high24h: ticker.high24h,
						low24h: ticker.low24h,
						volume24h: ticker.vol24h,
						changePercentage: (
							((Number.parseFloat(ticker.last) -
								Number.parseFloat(ticker.open24h)) /
								Number.parseFloat(ticker.open24h)) *
							100
						).toFixed(2),
					};
				}
			} catch (error) {
				logger.warn(
					`WebSocket 获取 ${contract} 价格失败，降级到 REST API:`,
					error,
				);
			}
		}

		// 降级到 REST API
		let lastError: any;
		for (let i = 0; i <= retries; i++) {
			try {
				const data = await this.request("GET", "/api/v5/market/ticker", {
					instId,
				});

				if (!data || data.length === 0) {
					throw new Error("No ticker data returned");
				}

				const ticker = data[0];

				// 转换为 Gate 格式的返回值
				return {
					contract,
					last: ticker.last,
					markPrice: ticker.idxPx, // OKX 使用 idxPx 作为指数价格
					indexPrice: ticker.idxPx,
					high24h: ticker.high24h,
					low24h: ticker.low24h,
					volume24h: ticker.vol24h,
					changePercentage: (
						((Number.parseFloat(ticker.last) -
							Number.parseFloat(ticker.open24h)) /
							Number.parseFloat(ticker.open24h)) *
						100
					).toFixed(2),
				};
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取 ${contract} 价格失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
				}
			}
		}

		logger.error(`获取 ${contract} 价格失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 获取合约K线数据（带重试机制）
	 * K线数据使用 REST API 获取，因为需要获取历史数据
	 */
	async getFuturesCandles(
		contract: string,
		interval = "5m",
		limit = 100,
		retries = 2,
	): Promise<any[]> {
		const instId = this.toOkxContract(contract);

		// 转换时间周期格式: Gate (5m) -> OKX (5m)
		// OKX 支持: 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M
		let bar = interval;
		if (interval === "1h") bar = "1H";
		else if (interval === "4h") bar = "4H";

		// K线数据直接使用 REST API，避免 WebSocket 复杂性
		// WebSocket 主要用于实时 ticker 推送
		let lastError: any;
		for (let i = 0; i <= retries; i++) {
			try {
				const data = await this.request("GET", "/api/v5/market/candles", {
					instId,
					bar,
					limit: Math.min(limit, 300), // OKX 最大 300
				});

				// OKX K线格式: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
				// 转换为 Gate 格式: {t, o, h, l, c, v, sum}
				return data
					.map((candle: string[]) => ({
						t: Number.parseInt(candle[0]) / 1000, // OKX 返回毫秒时间戳
						o: candle[1],
						h: candle[2],
						l: candle[3],
						c: candle[4],
						v: candle[5],
						sum: candle[7], // volCcyQuote
					}))
					.reverse(); // OKX 返回倒序，需要反转
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(
						`获取 ${contract} K线数据失败，重试 ${i + 1}/${retries}...`,
					);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
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
	async getFuturesAccount(retries = 2): Promise<any> {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				const data = await this.request("GET", "/api/v5/account/balance");

				if (!data || data.length === 0) {
					throw new Error("No account data returned");
				}

				const account = data[0];
				const usdtDetail = account.details?.find((d: any) => d.ccy === "USDT");

				if (!usdtDetail) {
					throw new Error("USDT account not found");
				}

				// 转换为 Gate 格式
				return {
					currency: "USDT",
					total: usdtDetail.eq, // 币种总权益
					available: usdtDetail.availBal, // 可用保证金
					positionMargin: usdtDetail.frozenBal, // 持仓占用保证金
					orderMargin: usdtDetail.ordFrozen || "0", // 挂单占用保证金
					unrealisedPnl: account.details
						.reduce((sum: number, d: any) => {
							return sum + Number.parseFloat(d.upl || "0");
						}, 0)
						.toString(),
				};
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取账户余额失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
				}
			}
		}

		logger.error(`获取账户余额失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 获取当前持仓（带重试机制，只返回允许的币种）
	 */
	async getPositions(retries = 2): Promise<any[]> {
		let lastError: any;

		for (let i = 0; i <= retries; i++) {
			try {
				const data = await this.request("GET", "/api/v5/account/positions", {
					instType: "SWAP",
				});

				// 过滤：只保留允许的币种
				const allowedSymbols = RISK_PARAMS.TRADING_SYMBOLS;

				// 记录原始持仓数据（用于调试）
				if (data && data.length > 0) {
					logger.debug(
						`OKX 原始持仓数据 (${data.length} 个):`,
						data.slice(0, 3).map((p: any) => ({
							instId: p.instId,
							pos: p.pos,
							posSide: p.posSide,
							avgPx: p.avgPx,
							notionalUsd: p.notionalUsd,
							margin: p.margin,
							lever: p.lever,
						})),
					);
				}

				const filteredPositions =
					data
						?.filter((p: any) => {
							const gateContract = this.toGateContract(p.instId);
							const symbol = gateContract.split("_")[0];
							return (
								symbol &&
								allowedSymbols.includes(symbol) &&
								Number.parseFloat(p.pos || "0") !== 0
							);
						})
						.map((p: any) => {
							const gateContract = this.toGateContract(p.instId);

							// OKX 使用双向持仓模式
							// posSide: long/short/net
							// pos: 持仓数量（正数）
							// 转换为 Gate 格式的 size（正数=多，负数=空）
							let size = Number.parseFloat(p.pos || "0");
							if (p.posSide === "short") {
								size = -size;
							}

							// 计算开仓价值（保证金）
							// OKX: notionalUsd = 持仓价值（USD）, margin = 保证金余额
							// 保证金 = 持仓价值 / 杠杆
							const notionalUsd = Number.parseFloat(p.notionalUsd || "0");
							const leverage = Number.parseFloat(p.lever || "1");
							const marginValue = notionalUsd / leverage;

							const result = {
								contract: gateContract,
								size: size.toString(),
								leverage: p.lever,
								entryPrice: p.avgPx,
								markPrice: p.markPx,
								liqPrice: p.liqPx || "0",
								unrealisedPnl: p.upl,
								realisedPnl: p.realizedPnl || "0",
								margin: marginValue.toString(), // 使用计算的保证金
								notionalUsd: p.notionalUsd, // 持仓价值（USD）
							};

							// 记录转换后的数据
							logger.debug(`持仓转换: ${gateContract}`, {
								原始notionalUsd: p.notionalUsd,
								杠杆: leverage,
								计算保证金: marginValue,
								未实现盈亏: p.upl,
							});

							return result;
						}) || [];

				return filteredPositions;
			} catch (error) {
				lastError = error;
				if (i < retries) {
					logger.warn(`获取持仓失败，重试 ${i + 1}/${retries}...`);
					await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
				}
			}
		}

		logger.error(`获取持仓失败（${retries}次重试）:`, lastError);
		throw lastError;
	}

	/**
	 * 设置持仓模式（单向/双向）
	 */
	async setPositionMode(
		posMode: "long_short_mode" | "net_mode" = "long_short_mode",
	): Promise<void> {
		// 如果已经设置过，跳过
		if (this.positionModeSet) {
			return;
		}

		try {
			logger.info(`设置持仓模式为: ${posMode}`);

			const data = await this.request(
				"POST",
				"/api/v5/account/set-position-mode",
				undefined,
				{
					posMode,
				},
			);

			logger.info("持仓模式设置成功");
			this.positionModeSet = true;
		} catch (error: any) {
			// 如果已经设置过，可能会报错，这是正常的
			if (
				error.message.includes("Position mode is already") ||
				error.message.includes("59120") || // OKX 错误码：持仓模式已存在
				error.message.includes("59121") || // OKX 错误码：有持仓时不能修改
				error.message.includes("59000") || // OKX 错误码：有持仓或挂单时不能修改
				error.message.includes(
					"Setting failed. Cancel any open orders, close positions, and stop trading bots first.",
				)
			) {
				logger.info("持仓模式已经设置或无法修改，跳过");
				this.positionModeSet = true;
			} else {
				logger.warn(`设置持仓模式失败:`, error.message);
				// 不抛出异常，允许继续下单尝试
			}
		}
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
	}): Promise<any> {
		const instId = this.toOkxContract(params.contract);

		// 验证 size 参数
		if (params.size === 0 || !Number.isFinite(params.size)) {
			throw new Error(
				`Invalid order size: ${params.size}. Size must be a non-zero finite number.`,
			);
		}

		try {
			// 首次下单前确保持仓模式已设置（双向持仓）
			// 这个调用会被缓存，不会重复设置
			await this.setPositionMode("long_short_mode");
			// 确定订单方向和持仓方向
			const side = params.size > 0 ? "buy" : "sell";
			const posSide = params.reduceOnly
				? params.size > 0
					? "short"
					: "long" // 平仓时方向相反
				: params.size > 0
					? "long"
					: "short"; // 开仓时方向一致

			// OKX 订单类型
			let ordType = "market";
			let px = "";

			if (params.price && params.price > 0) {
				ordType = "limit";
				px = params.price.toString();
			}

			// 构建订单参数
			const order: any = {
				instId,
				tdMode: "cross", // 全仓模式
				side,
				posSide,
				ordType,
				sz: Math.abs(params.size).toString(),
			};

			if (ordType === "limit") {
				order.px = px;
			}

			// 平仓标识
			if (params.reduceOnly) {
				order.reduceOnly = true;
			}

			logger.info(`OKX 下单请求:`, {
				contract: params.contract,
				instId,
				size: params.size,
				price: params.price,
				reduceOnly: params.reduceOnly,
				orderParams: order,
			});

			const data = await this.request(
				"POST",
				"/api/v5/trade/order",
				undefined,
				order,
			);

			if (!data || data.length === 0) {
				throw new Error("No order response");
			}

			const result = data[0];

			logger.info(`OKX 下单响应:`, {
				ordId: result.ordId,
				sCode: result.sCode,
				sMsg: result.sMsg,
			});

			if (result.sCode !== "0") {
				throw new Error(`Order failed: ${result.sMsg} (code: ${result.sCode})`);
			}

			// 转换为 Gate 格式
			return {
				id: result.ordId,
				contract: params.contract,
				size: params.size,
				price: params.price || 0,
				status: "open",
			};
		} catch (error: any) {
			const errorMessage = error.message || "Unknown error";
			logger.error("OKX 下单失败:", errorMessage);
			throw new Error(`下单失败: ${errorMessage}`);
		}
	}

	/**
	 * 获取订单详情
	 * @param orderId 订单ID
	 * @param contract 合约名称（可选）。如果提供，将直接查询；否则将遍历未完成订单和历史订单查找
	 */
	async getOrder(orderId: string, contract?: string): Promise<any> {
		try {
			let order: any = null;

			if (contract) {
				// 如果提供了合约名称，直接查询（OKX API 要求同时提供 instId 和 ordId）
				const instId = this.toOkxContract(contract);
				const data = await this.request("GET", "/api/v5/trade/order", {
					instId,
					ordId: orderId,
				});

				if (!data || data.length === 0) {
					logger.debug(`订单 ${orderId} 在合约 ${contract} 中未找到`);
					return null;
				}
				order = data[0];
			} else {
				// 如果没有提供合约名称，先从未完成订单中查找
				logger.debug(`未提供合约名称，从订单列表中查找订单 ${orderId}`);

				const openOrders = await this.getOpenOrders();
				order = openOrders.find((o: any) => o.id === orderId);

				// 如果未完成订单中找不到，再从历史订单中查找（最近100条）
				if (!order) {
					logger.debug(`未完成订单中未找到，查询历史订单`);
					// 先查询已成交订单
					let historyOrders = await this.getOrderHistory(undefined, 100);
					order = historyOrders.find((o: any) => o.id === orderId);

					// 如果已成交订单中找不到，再查询已取消订单
					if (!order) {
						logger.debug(`已成交订单中未找到，查询已取消订单`);
						historyOrders = await this.getOrderHistory(
							undefined,
							100,
							"canceled",
						);
						order = historyOrders.find((o: any) => o.id === orderId);
					}
				}

				if (!order) {
					logger.debug(`订单 ${orderId} 未在未完成订单或最近历史订单中找到`);
					return null;
				}

				// 如果从列表中找到，已经是转换后的格式，直接返回
				return order;
			}

			// 转换原始 OKX 订单格式为统一格式
			const gateContract = this.toGateContract(order.instId);

			// OKX 订单状态: live, partially_filled, filled, canceled
			let status = "open";
			if (order.state === "filled") status = "finished";
			else if (order.state === "canceled") status = "cancelled";

			// 计算已成交数量
			const totalSize = Number.parseFloat(order.sz || "0");
			const filledSize = Number.parseFloat(order.accFillSz || "0");
			const leftSize = totalSize - filledSize;

			// 转换为 Gate 格式（带符号的 size）
			let size = totalSize;
			if (order.side === "sell") {
				size = -size;
			}

			let left = leftSize;
			if (order.side === "sell") {
				left = -left;
			}

			return {
				id: order.ordId,
				contract: gateContract,
				size: size.toString(),
				left: left.toString(),
				price: order.px || "0",
				fill_price: order.avgPx || "0",
				status,
				create_time: Number.parseInt(order.cTime) / 1000,
				finish_time: order.uTime
					? Number.parseInt(order.uTime) / 1000
					: undefined,
			};
		} catch (error: any) {
			logger.error(`获取订单 ${orderId} 详情失败:`, error);
			throw error;
		}
	}

	/**
	 * 取消订单
	 */
	async cancelOrder(orderId: string): Promise<any> {
		try {
			// 需要先获取订单信息以获取 instId
			const orderInfo = await this.getOrder(orderId);
			const instId = this.toOkxContract(orderInfo.contract);

			const data = await this.request(
				"POST",
				"/api/v5/trade/cancel-order",
				undefined,
				{
					instId,
					ordId: orderId,
				},
			);

			if (!data || data.length === 0) {
				throw new Error("Cancel order failed");
			}

			const result = data[0];

			if (result.sCode !== "0") {
				throw new Error(`Cancel failed: ${result.sMsg}`);
			}

			return {
				id: result.ordId,
				status: "cancelled",
			};
		} catch (error: any) {
			logger.error(`取消订单 ${orderId} 失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取未成交订单
	 */
	async getOpenOrders(contract?: string): Promise<any[]> {
		try {
			const params: any = {
				instType: "SWAP",
			};

			if (contract) {
				params.instId = this.toOkxContract(contract);
			}

			const data = await this.request(
				"GET",
				"/api/v5/trade/orders-pending",
				params,
			);

			return (data || []).map((order: any) => {
				const gateContract = this.toGateContract(order.instId);

				let size = Number.parseFloat(order.sz || "0");
				if (order.side === "sell") {
					size = -size;
				}

				let left =
					Number.parseFloat(order.sz || "0") -
					Number.parseFloat(order.accFillSz || "0");
				if (order.side === "sell") {
					left = -left;
				}

				return {
					id: order.ordId,
					contract: gateContract,
					size: size.toString(),
					left: left.toString(),
					price: order.px || "0",
					status: "open",
					is_reduce_only: order.reduceOnly === "true",
					create_time: Number.parseInt(order.cTime) / 1000,
				};
			});
		} catch (error: any) {
			logger.error("获取未成交订单失败:", error);
			throw error;
		}
	}

	/**
	 * 设置仓位杠杆
	 */
	async setLeverage(contract: string, leverage: number): Promise<any> {
		try {
			const instId = this.toOkxContract(contract);

			logger.info(`设置 ${contract} 杠杆为 ${leverage}x`);

			const data = await this.request(
				"POST",
				"/api/v5/account/set-leverage",
				undefined,
				{
					instId,
					lever: leverage.toString(),
					mgnMode: "cross", // 全仓模式
				},
			);

			if (!data || data.length === 0) {
				throw new Error("Set leverage failed");
			}

			const result = data[0];

			if (result.sCode !== "0") {
				throw new Error(`Set leverage failed: ${result.sMsg}`);
			}

			return {
				leverage: result.lever,
			};
		} catch (error: any) {
			logger.warn(`设置 ${contract} 杠杆失败（可能已有持仓）:`, error.message);
			return null;
		}
	}

	/**
	 * 获取资金费率
	 */
	async getFundingRate(contract: string): Promise<any> {
		try {
			const instId = this.toOkxContract(contract);

			const data = await this.request("GET", "/api/v5/public/funding-rate", {
				instId,
			});

			if (!data || data.length === 0) {
				throw new Error("No funding rate data");
			}

			const fundingRate = data[0];

			return {
				r: fundingRate.fundingRate,
				t: Number.parseInt(fundingRate.fundingTime) / 1000,
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 资金费率失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取合约信息（包含持仓量等）
	 */
	async getContractInfo(contract: string): Promise<any> {
		try {
			const instId = this.toOkxContract(contract);

			const data = await this.request("GET", "/api/v5/public/instruments", {
				instType: "SWAP",
				instId,
			});

			if (!data || data.length === 0) {
				throw new Error("Contract not found");
			}

			const info = data[0];

			// 转换为 Gate 格式
			return {
				name: contract,
				orderSizeMin: Number.parseFloat(info.minSz || "1"),
				orderSizeMax: Number.parseFloat(info.maxLmtSz || "1000000"),
				quantoMultiplier: Number.parseFloat(info.ctVal || "0.01"), // 合约乘数（使用驼峰命名与 Gate 保持一致）
				lotSize: Number.parseFloat(info.lotSz || "1"), // 下单数量精度
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 合约信息失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取所有合约列表
	 */
	async getAllContracts(): Promise<any[]> {
		try {
			const data = await this.request("GET", "/api/v5/public/instruments", {
				instType: "SWAP",
			});

			return (data || [])
				.filter((inst: any) => inst.instId.endsWith("-USDT-SWAP"))
				.map((inst: any) => {
					const gateContract = this.toGateContract(inst.instId);
					return {
						name: gateContract,
						orderSizeMin: Number.parseFloat(inst.minSz || "1"),
						orderSizeMax: Number.parseFloat(inst.maxLmtSz || "1000000"),
						lotSize: Number.parseFloat(inst.lotSz || "1"),
					};
				});
		} catch (error: any) {
			logger.error("获取合约列表失败:", error);
			throw error;
		}
	}

	/**
	 * 获取订单簿
	 * 优先使用 WebSocket，失败时降级到 REST API
	 */
	async getOrderBook(contract: string, limit = 10): Promise<any> {
		const instId = this.toOkxContract(contract);

		// 尝试使用 WebSocket
		if (this.useWebSocket) {
			try {
				const wsClient = getOkxWebSocketClient();

				// 检查缓存
				let orderBook = wsClient.getCachedOrderBook(instId);

				if (!orderBook) {
					// 订阅并等待数据
					await wsClient.subscribe("books", instId);
					// 等待一小段时间，确保数据已经到达
					await new Promise((resolve) => setTimeout(resolve, 100));
					orderBook = wsClient.getCachedOrderBook(instId);
				}

				if (orderBook) {
					// 转换为 Gate 格式的返回值
					return {
						bids: (orderBook.bids || [])
							.slice(0, limit)
							.map((bid: string[]) => ({
								p: bid[0],
								s: bid[1],
							})),
						asks: (orderBook.asks || [])
							.slice(0, limit)
							.map((ask: string[]) => ({
								p: ask[0],
								s: ask[1],
							})),
					};
				}
			} catch (error) {
				logger.warn(
					`WebSocket 获取 ${contract} 订单簿失败，降级到 REST API:`,
					error,
				);
			}
		}

		// 降级到 REST API
		try {
			const data = await this.request("GET", "/api/v5/market/books", {
				instId,
				sz: Math.min(limit, 400).toString(),
			});

			if (!data || data.length === 0) {
				throw new Error("No order book data");
			}

			const book = data[0];

			// OKX 格式: [price, size, deprecated, orders]
			// 转换为 Gate 格式: {p: price, s: size}
			return {
				bids: (book.bids || []).map((bid: string[]) => ({
					p: bid[0],
					s: bid[1],
				})),
				asks: (book.asks || []).map((ask: string[]) => ({
					p: ask[0],
					s: ask[1],
				})),
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 订单簿失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取实时订单簿深度数据
	 */
	async getRealTimeOrderBookDepth(contract: string, depth = 20): Promise<any> {
		const instId = this.toOkxContract(contract);

		if (!this.useWebSocket) {
			throw new Error("WebSocket 未启用，无法获取实时订单簿深度数据");
		}

		try {
			const wsClient = getOkxWebSocketClient();

			// 订阅并等待数据
			await wsClient.subscribe("books", instId);

			// 等待数据到达
			let orderBook = wsClient.getCachedOrderBook(instId);
			let attempts = 0;
			while (!orderBook && attempts < 5) {
				await new Promise((resolve) => setTimeout(resolve, 100));
				orderBook = wsClient.getCachedOrderBook(instId);
				attempts++;
			}

			if (!orderBook) {
				throw new Error("无法获取实时订单簿数据");
			}

			// 计算深度变化率
			const calculateDepthChangeRate = (current: any[], previous: any[]) => {
				if (!previous || previous.length === 0) return 0;

				const currentDepth = current.slice(0, depth).reduce((sum, item) => {
					return sum + Number.parseFloat(item[1]);
				}, 0);

				const previousDepth = previous.slice(0, depth).reduce((sum, item) => {
					return sum + Number.parseFloat(item[1]);
				}, 0);

				if (previousDepth === 0) return 0;

				return ((currentDepth - previousDepth) / previousDepth) * 100;
			};

			// 计算大额订单（>10万美元）
			const currentPrice = Number.parseFloat(orderBook.bids[0][0]);
			const largeOrderThreshold = 100000; // 10万美元

			const largeBids = orderBook.bids.filter((bid: string[]) => {
				const price = Number.parseFloat(bid[0]);
				const size = Number.parseFloat(bid[1]);
				const value = price * size;
				return value > largeOrderThreshold;
			});

			const largeAsks = orderBook.asks.filter((ask: string[]) => {
				const price = Number.parseFloat(ask[0]);
				const size = Number.parseFloat(ask[1]);
				const value = price * size;
				return value > largeOrderThreshold;
			});

			// 计算买卖价差
			const bidPrice = Number.parseFloat(orderBook.bids[0][0]);
			const askPrice = Number.parseFloat(orderBook.asks[0][0]);
			const spread = askPrice - bidPrice;
			const spreadPercentage = (spread / bidPrice) * 100;

			// 计算订单簿不平衡度
			const bidVolume = orderBook.bids
				.slice(0, depth)
				.reduce((sum: number, bid: string[]) => {
					return sum + Number.parseFloat(bid[1]);
				}, 0);

			const askVolume = orderBook.asks
				.slice(0, depth)
				.reduce((sum: number, ask: string[]) => {
					return sum + Number.parseFloat(ask[1]);
				}, 0);

			const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume) || 0;

			return {
				contract,
				timestamp: orderBook.lastUpdate,
				bids: orderBook.bids.slice(0, depth).map((bid: string[]) => ({
					p: bid[0],
					s: bid[1],
				})),
				asks: orderBook.asks.slice(0, depth).map((ask: string[]) => ({
					p: ask[0],
					s: ask[1],
				})),
				metrics: {
					bidDepthChangeRate: calculateDepthChangeRate(
						orderBook.bids,
						orderBook.prevBids,
					),
					askDepthChangeRate: calculateDepthChangeRate(
						orderBook.asks,
						orderBook.prevAsks,
					),
					spread: spread.toFixed(4),
					spreadPercentage: spreadPercentage.toFixed(4),
					orderBookImbalance: imbalance.toFixed(4),
					largeBids: largeBids.length,
					largeAsks: largeAsks.length,
					largeBidVolume: largeBids.reduce((sum: number, bid: string[]) => {
						return sum + Number.parseFloat(bid[0]) * Number.parseFloat(bid[1]);
					}, 0),
					largeAskVolume: largeAsks.reduce((sum: number, ask: string[]) => {
						return sum + Number.parseFloat(ask[0]) * Number.parseFloat(ask[1]);
					}, 0),
				},
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 实时订单簿深度数据失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取历史成交记录（我的成交）
	 */
	async getMyTrades(contract?: string, limit = 10): Promise<any[]> {
		try {
			const params: any = {
				instType: "SWAP",
				limit: Math.min(limit, 100).toString(),
			};

			if (contract) {
				params.instId = this.toOkxContract(contract);
			}

			const data = await this.request("GET", "/api/v5/trade/fills", params);

			return (data || []).map((trade: any) => {
				const gateContract = this.toGateContract(trade.instId);
				return {
					contract: gateContract,
					id: trade.tradeId,
					order_id: trade.ordId,
					size: trade.side === "sell" ? `-${trade.fillSz}` : trade.fillSz,
					price: trade.fillPx,
					fee: trade.fee,
					time: Number.parseInt(trade.ts) / 1000,
				};
			});
		} catch (error: any) {
			logger.error("获取我的历史成交记录失败:", error);
			throw error;
		}
	}

	/**
	 * 获取tick级交易数据
	 */
	async getTickTrades(contract: string, limit = 100): Promise<any> {
		const instId = this.toOkxContract(contract);

		let trades: any[] = [];
		let isWebSocketUsed = false;

		// 优先使用WebSocket获取数据
		if (this.useWebSocket) {
			try {
				const wsClient = getOkxWebSocketClient();

				// 订阅并等待数据
				await wsClient.subscribe("trades", instId);

				// 等待数据到达
				let cachedTrades = wsClient.getCachedTrades(instId);
				let attempts = 0;
				while (!cachedTrades && attempts < 10) {
					await new Promise((resolve) => setTimeout(resolve, 200));
					cachedTrades = wsClient.getCachedTrades(instId);
					attempts++;
				}

				if (cachedTrades) {
					trades = cachedTrades;
					isWebSocketUsed = true;
				}
			} catch (error: any) {
				logger.warn(
					`WebSocket获取 ${contract} tick级交易数据失败，尝试使用REST API:`,
					error,
				);
			}
		}

		// WebSocket获取失败或未启用，使用REST API获取
		if (trades.length === 0) {
			try {
				logger.info(`使用REST API获取 ${contract} tick级交易数据`);
				const restTrades = await this.request("GET", "/api/v5/market/trades", {
					instId: instId,
					limit: limit.toString(),
				});
				trades = restTrades || [];
			} catch (error: any) {
				logger.error(`REST API获取 ${contract} tick级交易数据失败:`, error);
				throw new Error("无法获取tick级交易数据");
			}
		}

		// 过滤最近5分钟的交易
		const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
		const recentTrades = trades
			.filter((trade: any) => {
				const tradeTime = Number.parseInt(trade.ts);
				return tradeTime >= fiveMinutesAgo;
			})
			.slice(0, limit);

		// 计算成交分布特征
		const calculateTradeDistribution = (trades: any[]) => {
			if (trades.length === 0) {
				return {
					totalTrades: 0,
					totalVolume: 0,
					totalValue: 0,
					avgTradeSize: 0,
					avgTradeValue: 0,
					buySellRatio: 0,
					priceRange: {
						min: 0,
						max: 0,
						avg: 0,
					},
					volumeDistribution: {
						small: 0,
						medium: 0,
						large: 0,
					},
				};
			}

			// 计算总成交量和总成交额
			const totalVolume = trades.reduce((sum, trade) => {
				return sum + Number.parseFloat(trade.sz);
			}, 0);

			const totalValue = trades.reduce((sum, trade) => {
				const price = Number.parseFloat(trade.px);
				const size = Number.parseFloat(trade.sz);
				return sum + price * size;
			}, 0);

			// 计算买卖比例
			const buyTrades = trades.filter((trade) => trade.side === "buy").length;
			const sellTrades = trades.filter((trade) => trade.side === "sell").length;
			const buySellRatio =
				sellTrades === 0 ? buyTrades : buyTrades / sellTrades;

			// 计算价格范围
			const prices = trades.map((trade) => Number.parseFloat(trade.px));
			const minPrice = Math.min(...prices);
			const maxPrice = Math.max(...prices);
			const avgPrice =
				prices.reduce((sum, price) => sum + price, 0) / prices.length;

			// 计算成交量分布（小、中、大订单）
			const avgTradeSize = totalVolume / trades.length;
			const smallTrades = trades.filter(
				(trade) => Number.parseFloat(trade.sz) < avgTradeSize * 0.5,
			).length;
			const mediumTrades = trades.filter((trade) => {
				const size = Number.parseFloat(trade.sz);
				return size >= avgTradeSize * 0.5 && size <= avgTradeSize * 2;
			}).length;
			const largeTrades = trades.filter(
				(trade) => Number.parseFloat(trade.sz) > avgTradeSize * 2,
			).length;

			return {
				totalTrades: trades.length,
				totalVolume: totalVolume.toFixed(4),
				totalValue: totalValue.toFixed(4),
				avgTradeSize: (totalVolume / trades.length).toFixed(4),
				avgTradeValue: (totalValue / trades.length).toFixed(4),
				buySellRatio: buySellRatio.toFixed(4),
				priceRange: {
					min: minPrice.toFixed(4),
					max: maxPrice.toFixed(4),
					avg: avgPrice.toFixed(4),
				},
				volumeDistribution: {
					small: smallTrades,
					medium: mediumTrades,
					large: largeTrades,
				},
			};
		};

		// 计算订单执行速度（基于最近10笔交易）
		const calculateExecutionSpeed = (trades: any[]) => {
			if (trades.length < 2) return 0;

			// 按时间排序
			const sortedTrades = [...trades].sort((a, b) => {
				return Number.parseInt(a.ts) - Number.parseInt(b.ts);
			});

			// 计算平均时间间隔
			let totalInterval = 0;
			for (let i = 1; i < sortedTrades.length; i++) {
				const prevTime = Number.parseInt(sortedTrades[i - 1].ts);
				const currTime = Number.parseInt(sortedTrades[i].ts);
				totalInterval += currTime - prevTime;
			}

			const avgInterval = totalInterval / (sortedTrades.length - 1);
			// 执行速度 = 1 / 平均时间间隔（毫秒）
			return avgInterval > 0 ? ((1 / avgInterval) * 1000).toFixed(4) : 0;
		};

		// 计算流动性比率
		const calculateLiquidityRatio = (trades: any[]) => {
			if (trades.length === 0) return 0;

			// 计算价格变化
			let priceChanges = 0;
			for (let i = 1; i < trades.length; i++) {
				const prevPrice = Number.parseFloat(trades[i - 1].px);
				const currPrice = Number.parseFloat(trades[i].px);
				priceChanges += Math.abs(currPrice - prevPrice);
			}

			if (priceChanges === 0) return 0;

			// 流动性比率 = 总成交额 / 价格变化
			const totalValue = trades.reduce((sum, trade) => {
				const price = Number.parseFloat(trade.px);
				const size = Number.parseFloat(trade.sz);
				return sum + price * size;
			}, 0);

			return (totalValue / priceChanges).toFixed(4);
		};

		// 转换为统一格式的交易数据
		const formattedTrades = recentTrades.map((trade: any) => ({
			id: trade.tradeId,
			price: trade.px,
			size: trade.sz,
			side: trade.side,
			time: Number.parseInt(trade.ts) / 1000,
		}));

		return {
			contract,
			timestamp: Date.now(),
			trades: formattedTrades,
			distribution: calculateTradeDistribution(recentTrades),
			executionSpeed: calculateExecutionSpeed(recentTrades),
			liquidityRatio: calculateLiquidityRatio(recentTrades),
		};
	}

	/**
	 * 获取市场微观结构指标
	 */
	async getMarketMicrostructureMetrics(contract: string): Promise<any> {
		try {
			logger.info(`开始获取 ${contract} 市场微观结构指标`);
			// 并行获取订单簿和交易数据
			const [orderBookData, tradeData] = await Promise.all([
				this.getRealTimeOrderBookDepth(contract),
				this.getTickTrades(contract),
			]);
			logger.info(`成功获取 ${contract} 订单簿和交易数据`);

			// 计算额外的市场微观结构指标

			// 计算成交量加权平均价格（VWAP）
			const calculateVWAP = (trades: any[]) => {
				if (trades.length === 0) return 0;

				const totalValue = trades.reduce((sum, trade) => {
					const price = Number.parseFloat(trade.price);
					const size = Number.parseFloat(trade.size);
					return sum + price * size;
				}, 0);

				const totalVolume = trades.reduce((sum, trade) => {
					return sum + Number.parseFloat(trade.size);
				}, 0);

				return totalVolume > 0 ? (totalValue / totalVolume).toFixed(4) : 0;
			};

			// 计算订单簿斜率
			const calculateOrderBookSlope = (bids: any[], asks: any[]) => {
				if (bids.length < 2 || asks.length < 2)
					return { bidSlope: 0, askSlope: 0 };

				// 计算买单斜率
				const bidPrice1 = Number.parseFloat(bids[0].p);
				const bidPrice2 = Number.parseFloat(bids[1].p);
				const bidSize1 = Number.parseFloat(bids[0].s);
				const bidSize2 = Number.parseFloat(bids[1].s);
				const bidSlope =
					bidSize1 > bidSize2
						? ((bidSize1 - bidSize2) / (bidPrice1 - bidPrice2)).toFixed(4)
						: 0;

				// 计算卖单斜率
				const askPrice1 = Number.parseFloat(asks[0].p);
				const askPrice2 = Number.parseFloat(asks[1].p);
				const askSize1 = Number.parseFloat(asks[0].s);
				const askSize2 = Number.parseFloat(asks[1].s);
				const askSlope =
					askSize2 > askSize1
						? ((askSize2 - askSize1) / (askPrice2 - askPrice1)).toFixed(4)
						: 0;

				return { bidSlope, askSlope };
			};

			// 计算价格冲击成本
			const calculatePriceImpact = (orderBook: any, tradeValue: number) => {
				// 模拟买入tradeValue金额的资产，计算价格冲击
				let remainingValue = tradeValue;
				let totalSize = 0;
				let totalCost = 0;

				for (const ask of orderBook.asks) {
					const price = Number.parseFloat(ask.p);
					const size = Number.parseFloat(ask.s);
					const askValue = price * size;

					if (remainingValue <= askValue) {
						const buySize = remainingValue / price;
						totalSize += buySize;
						totalCost += remainingValue;
						break;
					} else {
						totalSize += size;
						totalCost += askValue;
						remainingValue -= askValue;
					}
				}

				if (totalSize === 0) return 0;

				const avgPrice = totalCost / totalSize;
				const midPrice =
					(Number.parseFloat(orderBook.bids[0].p) +
						Number.parseFloat(orderBook.asks[0].p)) /
					2;

				return (((avgPrice - midPrice) / midPrice) * 100).toFixed(4);
			};

			// 计算VWAP
			const vwap = calculateVWAP(tradeData.trades);

			// 计算订单簿斜率
			const orderBookSlope = calculateOrderBookSlope(
				orderBookData.bids,
				orderBookData.asks,
			);

			// 计算价格冲击成本（模拟10万美元的买入）
			const priceImpact = calculatePriceImpact(orderBookData, 100000);

			return {
				contract,
				timestamp: Date.now(),
				orderBookMetrics: orderBookData.metrics,
				tradeMetrics: {
					distribution: tradeData.distribution,
					executionSpeed: tradeData.executionSpeed,
					liquidityRatio: tradeData.liquidityRatio,
					vwap,
				},
				additionalMetrics: {
					orderBookSlope,
					priceImpact,
				},
				rawData: {
					orderBook: orderBookData,
					trades: tradeData.trades,
				},
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 市场微观结构指标失败:`, error);
			throw error;
		}
	}

	/**
	 * 蔡森策略滞后性补偿机制
	 * 使用实时微观结构数据修正技术指标的滞后性
	 */
	async getCaiSenLagCompensatedMetrics(contract: string): Promise<any> {
		try {
			// 并行获取所需数据
			const [marketData, microstructureMetrics] = await Promise.all([
				this.getFuturesTicker(contract),
				this.getMarketMicrostructureMetrics(contract),
			]);

			// 获取1分钟K线数据用于实时指标计算
			const candles1m = await this.getFuturesCandles(contract, "1m", 100);

			// 计算实时技术指标
			const { calculateIndicators } = await import(
				"../tools/trading/marketData"
			);
			const realTimeIndicators = calculateIndicators(candles1m);

			// 实现蔡森策略的滞后性补偿算法
			const compensateLag = (
				indicatorValue: number,
				microstructureData: any,
			) => {
				// 基于市场微观结构数据修正指标滞后
				const { orderBookMetrics, tradeMetrics } = microstructureData;

				// 计算补偿因子
				let compensationFactor = 1.0;

				// 1. 基于订单簿深度变化率调整
				const depthChange =
					(orderBookMetrics.bidDepthChangeRate +
						orderBookMetrics.askDepthChangeRate) /
					2;
				compensationFactor += depthChange * 0.1;

				// 2. 基于大额订单影响调整
				const largeOrderImpact =
					(orderBookMetrics.largeBids - orderBookMetrics.largeAsks) * 0.05;
				compensationFactor += largeOrderImpact;

				// 3. 基于成交分布特征调整
				const tradeDistributionImpact =
					(tradeMetrics.distribution.buySellRatio - 1) * 0.2;
				compensationFactor += tradeDistributionImpact;

				// 4. 基于流动性比率调整
				const liquidityImpact =
					(Number.parseFloat(tradeMetrics.liquidityRatio) - 1) * 0.1;
				compensationFactor += liquidityImpact;

				// 确保补偿因子在合理范围内
				compensationFactor = Math.max(0.5, Math.min(1.5, compensationFactor));

				// 应用补偿因子
				return indicatorValue * compensationFactor;
			};

			// 对关键技术指标进行滞后性补偿
			const compensatedIndicators = {
				...realTimeIndicators,
				ema20: compensateLag(realTimeIndicators.ema20, microstructureMetrics),
				ema50: compensateLag(realTimeIndicators.ema50, microstructureMetrics),
				macd: compensateLag(realTimeIndicators.macd, microstructureMetrics),
				rsi14: compensateLag(realTimeIndicators.rsi14, microstructureMetrics),
				// 保留原始指标用于对比
				raw: realTimeIndicators,
			};

			// 计算滚动5分钟变化率
			const candles5m = await this.getFuturesCandles(contract, "5m", 2);
			const indicators5m = calculateIndicators(candles5m);

			const calculateChangeRate = (current: number, previous: number) => {
				if (previous === 0) return 0;
				return ((current - previous) / previous) * 100;
			};

			const changeRates = {
				ema20: calculateChangeRate(
					compensatedIndicators.ema20,
					indicators5m.ema20,
				),
				ema50: calculateChangeRate(
					compensatedIndicators.ema50,
					indicators5m.ema50,
				),
				macd: calculateChangeRate(
					compensatedIndicators.macd,
					indicators5m.macd,
				),
				rsi14: calculateChangeRate(
					compensatedIndicators.rsi14,
					indicators5m.rsi14,
				),
				volume: calculateChangeRate(
					compensatedIndicators.volume,
					indicators5m.volume,
				),
			};

			return {
				contract,
				timestamp: Date.now(),
				price: Number.parseFloat(marketData.last),
				indicators: compensatedIndicators,
				changeRates,
				microstructure: microstructureMetrics,
			};
		} catch (error: any) {
			logger.error(`获取 ${contract} 蔡森策略滞后补偿指标失败:`, error);
			throw error;
		}
	}

	/**
	 * 获取历史仓位记录（已平仓的仓位结算记录）
	 */
	async getPositionHistory(
		contract?: string,
		limit = 100,
		offset = 0,
	): Promise<any[]> {
		try {
			const params: any = {
				instType: "SWAP",
				limit: Math.min(limit, 100).toString(),
			};

			if (contract) {
				params.instId = this.toOkxContract(contract);
			}

			// OKX 使用 positions-history API
			const data = await this.request(
				"GET",
				"/api/v5/account/positions-history",
				params,
			);

			return (data || []).map((pos: any) => {
				const gateContract = this.toGateContract(pos.instId);
				return {
					contract: gateContract,
					size: pos.posSide === "short" ? `-${pos.closeAvgPx}` : pos.closeAvgPx,
					pnl: pos.pnl,
					close_time: Number.parseInt(pos.uTime) / 1000,
				};
			});
		} catch (error: any) {
			logger.error("获取历史仓位记录失败:", error);
			throw error;
		}
	}

	/**
	 * 获取历史结算记录（更详细的历史仓位信息）
	 */
	async getSettlementHistory(
		contract?: string,
		limit = 100,
		offset = 0,
	): Promise<any[]> {
		// OKX 没有单独的结算历史API，使用仓位历史代替
		return this.getPositionHistory(contract, limit, offset);
	}

	/**
	 * 获取订单历史
	 * @param contract 合约名称（可选）
	 * @param limit 返回数量，默认10条
	 * @param state 订单状态，默认filled（已成交），可选canceled（已取消）
	 */
	async getOrderHistory(
		contract?: string,
		limit = 10,
		state: "filled" | "canceled" = "filled",
	): Promise<any[]> {
		try {
			const params: any = {
				instType: "SWAP",
				limit: Math.min(limit, 100).toString(),
				state: state,
			};

			if (contract) {
				params.instId = this.toOkxContract(contract);
			}

			const data = await this.request(
				"GET",
				"/api/v5/trade/orders-history",
				params,
			);

			return (data || []).map((order: any) => {
				const gateContract = this.toGateContract(order.instId);

				let size = Number.parseFloat(order.sz || "0");
				if (order.side === "sell") {
					size = -size;
				}

				return {
					id: order.ordId,
					contract: gateContract,
					size: size.toString(),
					price: order.px || "0",
					fill_price: order.avgPx || "0",
					status: state === "filled" ? "finished" : "cancelled",
					create_time: Number.parseInt(order.cTime) / 1000,
					finish_time: Number.parseInt(order.uTime) / 1000,
				};
			});
		} catch (error: any) {
			logger.error("获取订单历史失败:", error);
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
				(p) => p.contract === params.contract,
			);

			if (!targetPosition || Number.parseFloat(targetPosition.size) === 0) {
				logger.warn(`合约 ${params.contract} 无持仓，无需平仓`);
				return null;
			}

			// 确定平仓数量
			const positionSize = Math.abs(Number.parseFloat(targetPosition.size));
			const closeSize = params.size
				? Math.min(params.size, positionSize)
				: positionSize;

			// 确定平仓方向（与持仓方向相反）
			const isLong = Number.parseFloat(targetPosition.size) > 0;
			const orderSize = isLong ? -closeSize : closeSize;

			// 执行平仓订单
			const result = await this.placeOrder({
				contract: params.contract,
				size: orderSize,
				price: params.price || 0, // 不指定价格则使用市价
				reduceOnly: true, // 确保只减仓
				tif: params.price ? "gtc" : "ioc", // 市价单使用IOC
			});

			logger.info(`平仓订单已提交: ${params.contract}, 数量: ${orderSize}`);
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
	 * 1. 价格动量（20%权重）：基于最近价格变化率
	 * 2. 波动率（20%权重）：基于ATR
	 * 3. 资金费率（20%权重）：反映市场情绪
	 * 4. 持仓量（20%权重）：反映市场参与度
	 * 5. 订单簿不平衡（20%权重）：反映买卖压力
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
				(acc, candle) => {
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
}

/**
 * 全局 OKX 客户端实例（单例模式）
 */
let okxClientInstance: OkxClient | null = null;

/**
 * 创建全局 OKX 客户端实例（单例模式）
 */
export function createOkxClient(): OkxClient {
	// 如果已存在实例，直接返回
	if (okxClientInstance) {
		return okxClientInstance;
	}

	const apiKey = process.env.OKX_API_KEY;
	const apiSecret = process.env.OKX_API_SECRET;
	const passphrase = process.env.OKX_API_PASSPHRASE;

	if (!apiKey || !apiSecret || !passphrase) {
		throw new Error(
			"OKX_API_KEY、OKX_API_SECRET 和 OKX_API_PASSPHRASE 必须在环境变量中设置",
		);
	}

	// 创建并缓存实例
	okxClientInstance = new OkxClient(apiKey, apiSecret, passphrase);
	return okxClientInstance;
}
