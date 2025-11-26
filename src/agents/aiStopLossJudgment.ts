/**
 * AI驱动的智能止损判断模块
 * AI-driven intelligent stop loss judgment module
 *
 * 该模块负责分析市场情况，区分偶发性波动和行情异常，为止损决策提供AI判断
 * This module is responsible for analyzing market conditions, distinguishing between occasional fluctuations and abnormal market movements, providing AI judgment for stop loss decisions
 */

import { createOpenAI } from "@ai-sdk/openai";
import { Agent, Memory, createTool } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { z } from "zod";
import * as tradingTools from "../tools/trading";
import { createLogger } from "../utils/loggerUtils";

// 创建日志记录器
const logger = createLogger({ name: "ai-stoploss-judgment", level: "info" });

/**
 * 市场波动类型枚举
 * Market volatility type enumeration
 */
export enum MarketVolatilityType {
	/** 偶发性波动 Occasional fluctuation */
	OCCASIONAL = "occasional",
	/** 行情异常 Abnormal market movement */
	ABNORMAL = "abnormal",
	/** 不确定 Uncertain */
	UNCERTAIN = "uncertain",
}

/**
 * AI止损判断结果接口
 * AI stop loss judgment result interface
 */
export interface AIStopLossJudgment {
	/** 波动类型 Volatility type */
	volatilityType: MarketVolatilityType;
	/** 判断信心度 Judgment confidence (0-1) */
	confidence: number;
	/** 判断理由 Judgment reason */
	reason: string;
	/** 建议行动 Recommended action */
	recommendedAction: "close_position" | "hold_position" | "reduce_position";
	/** 市场分析数据 Market analysis data */
	marketAnalysis: {
		/** 价格波动率 Price volatility */
		priceVolatility: number;
		/** 成交量变化 Volume change */
		volumeChange: number;
		/** 技术指标信号 Technical indicator signals */
		technicalSignals: string[];
		/** 市场情绪 Market sentiment */
		marketSentiment: "bullish" | "bearish" | "neutral";
	};
	/** 判断时间戳 Judgment timestamp */
	timestamp: number;
}

/**
 * AI止损判断配置接口
 * AI stop loss judgment configuration interface
 */
export interface AIStopLossJudgmentConfig {
	/** 判断间隔时间（秒） Judgment interval (seconds) */
	judgmentIntervalSeconds: number;
	/** 最小信心度阈值 Minimum confidence threshold */
	minConfidenceThreshold: number;
	/** 是否启用详细日志 Enable detailed logging */
	enableDetailedLogging: boolean;
	/** AI模型名称 AI model name */
	aiModelName: string;
	/** 市场数据历史窗口（分钟） Market data history window (minutes) */
	marketDataWindowMinutes: number;
}

/**
 * 默认AI止损判断配置
 * Default AI stop loss judgment configuration
 */
export const DEFAULT_AI_STOPLOSS_JUDGMENT_CONFIG: AIStopLossJudgmentConfig = {
	judgmentIntervalSeconds: 30,
	minConfidenceThreshold: 0.7,
	enableDetailedLogging: true,
	aiModelName: process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp",
	marketDataWindowMinutes: 60,
};

/**
 * 创建AI止损判断专用提示词
 * Create specialized prompt for AI stop loss judgment
 *
 * @param config 配置信息 Configuration information
 * @returns AI止损判断提示词 AI stop loss judgment prompt
 */
function generateAIStopLossJudgmentPrompt(
	config: AIStopLossJudgmentConfig,
): string {
	// 使用默认配置值，因为相关配置模块可能不存在
	const riskConfig = {
		extremeStopLossPercent: 10,
		maxHoldingHours: 24,
	};

	const strategy = {
		stopLoss: {
			low: 4,
			high: 6,
		},
		trailingStop: {
			level1: { trigger: 2 },
			level2: { trigger: 3 },
			level3: { trigger: 5 },
		},
	};

	return `
【AI智能止损判断系统】

你的角色：市场波动分析专家
- 你需要分析当前市场情况，判断价格波动是偶发性波动还是行情异常
- 基于分析结果，提供止损建议：继续持仓、减少仓位或立即平仓
- 你的判断将直接影响交易系统的止损决策

🎯 【判断标准】

▶ 偶发性波动特征：
  - 价格波动在正常范围内（通常<2%）
  - 成交量没有异常放大
  - 技术指标显示趋势未改变
  - 市场情绪稳定，没有恐慌或贪婪
  - 波动持续时间短，很快恢复

▶ 行情异常特征：
  - 价格波动超出正常范围（通常>3%）
  - 成交量异常放大（>2倍平均值）
  - 技术指标显示趋势可能反转
  - 市场情绪极端，恐慌或贪婪明显
  - 波动持续，没有恢复迹象
  - 重大新闻或事件影响

🎯 【分析维度】

▶ 价格分析：
  - 当前价格与关键支撑/阻力位的关系
  - 价格波动幅度与历史平均值的比较
  - 价格走势的连续性和突变性

▶ 成交量分析：
  - 当前成交量与历史平均成交量的比较
  - 成交量与价格变动的关系（量价配合）
  - 成交量突变的持续性

▶ 技术指标分析：
  - RSI、MACD、EMA等主要技术指标的状态
  - 技术指标的背离现象
  - 技术指标的超买超卖状态

▶ 市场情绪分析：
  - 市场整体情绪（恐慌、贪婪、中性）
  - 资金流向（流入、流出、平衡）
  - 大户持仓变化

🎯 【决策规则】

▶ 继续持仓（hold_position）：
  - 波动类型为偶发性
  - 信心度≥0.5
  - 技术指标显示趋势未改变
  - 市场情绪稳定

▶ 减少仓位（reduce_position）：
  - 波动类型不确定，且亏损大于2%
  - 信心度0.3-0.5
  - 技术指标显示趋势可能改变
  - 市场情绪开始波动

▶ 立即平仓（close_position）：
  - 波动类型为行情异常
  - 信心度≥0.5
  - 技术指标显示趋势反转
  - 市场情绪极端

🎯 【特殊情况处理】
- 当市场数据获取异常时，基于持仓盈亏百分比判断：
  * 亏损≤2%：建议继续持仓（hold_position）
  * 2%<亏损≤6%：建议减少仓位（reduce_position）
  * 亏损>6%：建议立即平仓（close_position）
- 空头仓位与多头仓位使用相同的判断逻辑
- 对于任何仓位，亏损≤2%都属于正常波动范围，不建议平仓

🎯 【输出格式】

请严格按照以下JSON格式输出你的判断结果，不要包含任何其他文本或解释：

{
  "volatilityType": "occasional|abnormal|uncertain",
  "confidence": 0.0-1.0,
  "reason": "详细解释你的判断理由",
  "recommendedAction": "hold_position|reduce_position|close_position",
  "marketAnalysis": {
    "priceVolatility": 0.0-1.0,
    "volumeChange": 0.0-1.0,
    "technicalSignals": ["信号1", "信号2", ...],
    "marketSentiment": "bullish|bearish|neutral"
  }
}

重要提示：只输出JSON格式，不要添加任何额外的解释、代码块标记或其他文本。

【当前配置】
- 风险配置：极端止损${riskConfig.extremeStopLossPercent}%，最大持仓${riskConfig.maxHoldingHours}小时
- 策略配置：止损范围${strategy.stopLoss.low}%-${strategy.stopLoss.high}%，移动止盈${strategy.trailingStop.level1.trigger}%-${strategy.trailingStop.level3.trigger}%
- 分析窗口：${config.marketDataWindowMinutes}分钟

记住：你的判断直接影响交易决策，请基于客观数据和专业分析，提供准确的判断。
`;
}

/**
 * 创建AI止损判断Agent
 * Create AI stop loss judgment agent
 *
 * @param config 配置 Configuration
 * @returns AI止损判断Agent实例 AI stop loss judgment agent instance
 */
export async function createAIStopLossJudgmentAgent(
	config: AIStopLossJudgmentConfig = DEFAULT_AI_STOPLOSS_JUDGMENT_CONFIG,
): Promise<Agent> {
	// 创建OpenAI实例
	const openai = createOpenAI({
		apiKey: process.env.OPENAI_API_KEY || "",
		baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
	});

	// 创建内存实例
	const memory = new Memory({
		storage: new LibSQLMemoryAdapter({
			url: "file:./.voltagent/ai-stop-loss-judgment.db",
		}),
	});

	// 创建AI止损判断专用工具集
	const tools = [
		// 市场价格分析工具
		createTool({
			name: "getMarketPrice",
			description: "获取当前市场价格和价格变化",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
			}),
			execute: async ({ symbol }) => {
				// 这里应该调用实际的市场价格API
				return {
					symbol,
					price: 0,
					change24h: 0,
					changePercent: 0,
					timestamp: Date.now(),
				};
			},
		}),

		// 技术指标分析工具
		createTool({
			name: "getTechnicalIndicators",
			description: "获取技术指标数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
				timeframe: z.string().describe("时间框架，如1m, 5m, 15m, 1h"),
			}),
			execute: async ({ symbol, timeframe }) => {
				// 这里应该调用实际的技术指标API
				return {
					symbol,
					timeframe,
					rsi: 50,
					macd: { value: 0, signal: 0, histogram: 0 },
					ema: { short: 0, medium: 0, long: 0 },
					timestamp: Date.now(),
				};
			},
		}),

		// 成交量分析工具
		createTool({
			name: "getVolumeAnalysis",
			description: "获取成交量分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
				period: z.string().describe("分析周期，如1h, 4h, 1d"),
			}),
			execute: async ({ symbol, period }) => {
				// 这里应该调用实际的成交量分析API
				return {
					symbol,
					period,
					currentVolume: 0,
					averageVolume: 0,
					volumeRatio: 0,
					timestamp: Date.now(),
				};
			},
		}),

		// 市场情绪分析工具
		createTool({
			name: "getMarketSentiment",
			description: "获取市场情绪分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
			}),
			execute: async ({ symbol }) => {
				// 这里应该调用实际的市场情绪分析API
				return {
					symbol,
					sentiment: "neutral",
					fearGreedIndex: 50,
					fundingRate: 0,
					longShortRatio: 1,
					timestamp: Date.now(),
				};
			},
		}),

		// 资金流向分析工具
		createTool({
			name: "getMoneyFlow",
			description: "获取资金流向分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
				period: z.string().describe("分析周期，如1h, 4h, 1d"),
			}),
			execute: async ({ symbol, period }) => {
				// 这里应该调用实际的资金流向分析API
				return {
					symbol,
					period,
					netFlow: 0,
					inflow: 0,
					outflow: 0,
					largeHolderFlow: 0,
					timestamp: Date.now(),
				};
			},
		}),

		// 关键价位分析工具
		createTool({
			name: "getKeyPriceLevels",
			description: "获取关键价位分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
			}),
			execute: async ({ symbol }) => {
				// 这里应该调用实际的关键价位分析API
				return {
					symbol,
					support: [0, 0, 0],
					resistance: [0, 0, 0],
					pivot: 0,
					timestamp: Date.now(),
				};
			},
		}),

		// 波动率分析工具
		createTool({
			name: "getVolatilityAnalysis",
			description: "获取波动率分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
				period: z.string().describe("分析周期，如1h, 4h, 1d"),
			}),
			execute: async ({ symbol, period }) => {
				// 这里应该调用实际的波动率分析API
				return {
					symbol,
					period,
					currentVolatility: 0,
					averageVolatility: 0,
					volatilityRatio: 0,
					timestamp: Date.now(),
				};
			},
		}),

		// 市场新闻分析工具
		createTool({
			name: "getMarketNews",
			description: "获取市场新闻分析数据",
			parameters: z.object({
				symbol: z.string().describe("交易对符号，如BTC/USDT"),
				timeWindow: z.string().describe("时间窗口，如1h, 4h, 1d"),
			}),
			execute: async ({ symbol, timeWindow }) => {
				// 这里应该调用实际的市场新闻分析API
				return {
					symbol,
					timeWindow,
					news: [],
					impact: "neutral",
					timestamp: Date.now(),
				};
			},
		}),
	];

	// 生成提示词
	const prompt = generateAIStopLossJudgmentPrompt(config);

	// 创建Agent
	const agent = new Agent({
		name: "ai-stoploss-judgment-agent",
		instructions: prompt,
		model: openai.chat(config.aiModelName),
		tools,
		memory,
		logger: logger.child({ component: "ai-stoploss-judgment-agent" }),
	});

	return agent;
}

/**
 * AI止损判断器类
 * AI stop loss judger class
 */
export class AIStopLossJudger {
	private agent?: Agent;
	private config?: AIStopLossJudgmentConfig;
	private judgmentCache: Map<string, AIStopLossJudgment> = new Map();
	private isInitialized = false;
	private logger: any;

	/**
	 * 初始化AI止损判断器
	 * Initialize AI stop loss judger
	 *
	 * @param config 配置 Configuration
	 */
	async initialize(
		config: AIStopLossJudgmentConfig = DEFAULT_AI_STOPLOSS_JUDGMENT_CONFIG,
	): Promise<void> {
		this.config = config;
		this.agent = await createAIStopLossJudgmentAgent(config);
		this.isInitialized = true;

		logger.info("AI止损判断器初始化完成", {
			judgmentIntervalSeconds: config.judgmentIntervalSeconds,
			minConfidenceThreshold: config.minConfidenceThreshold,
			aiModelName: config.aiModelName,
		});
	}

	/**
	 * 判断持仓是否应该止损
	 * Judge whether a position should be stopped loss
	 *
	 * @param positionId 持仓ID Position ID
	 * @param symbol 交易符号 Trading symbol
	 * @param currentPnLPercent 当前盈亏百分比 Current profit/loss percentage
	 * @param leverage 杠杆倍数 Leverage
	 * @returns AI止损判断结果 AI stop loss judgment result
	 */
	async judgeStopLoss(
		positionId: string,
		symbol: string,
		currentPnLPercent: number,
		leverage: number,
	): Promise<AIStopLossJudgment> {
		if (!this.isInitialized || !this.agent || !this.config) {
			throw new Error("AI止损判断器未初始化，请先调用initialize方法");
		}

		// 检查缓存
		const cacheKey = `${positionId}_${symbol}_${Math.floor(
			Date.now() / (this.config.judgmentIntervalSeconds * 1000),
		)}`;
		if (this.judgmentCache.has(cacheKey)) {
			const cachedResult = this.judgmentCache.get(cacheKey)!;
			if (this.config.enableDetailedLogging) {
				logger.debug("使用AI止损判断缓存", { positionId, symbol, cacheKey });
			}
			return cachedResult;
		}

		try {
			// 生成特定于当前持仓的提示词
			const specificPrompt = `
请分析以下持仓情况，判断是否应该止损：

持仓信息：
- 持仓ID: ${positionId}
- 交易符号: ${symbol}
- 当前盈亏: ${currentPnLPercent}%
- 杠杆倍数: ${leverage}x

请基于当前市场数据，判断这个持仓的亏损是偶发性波动还是行情异常，并提供相应的建议。

${generateAIStopLossJudgmentPrompt(this.config)}
`;

			// 执行AI分析
			let result;
			try {
				result = await this.agent.generateText(specificPrompt);
			} catch (error) {
				console.error("AI模型调用失败 AI model call failed:", error);
				throw new Error(`AI模型调用失败: ${error}`);
			}

			// 记录AI返回的原始结果
			console.log("AI返回的原始结果 Raw AI response:", result.text);

			// 检查结果是否为空
			if (!result.text || result.text.trim().length === 0) {
				console.error("AI返回结果为空 Empty AI response");
				// 不抛出错误，而是返回默认的安全结果
				const emptyResult: AIStopLossJudgment = {
					volatilityType: MarketVolatilityType.UNCERTAIN,
					confidence: 0.3,
					reason: "AI返回结果为空，采用保守策略",
					recommendedAction: "reduce_position",
					marketAnalysis: {
						priceVolatility: 0.5,
						volumeChange: 0.5,
						technicalSignals: ["AI返回结果为空"],
						marketSentiment: "neutral",
					},
					timestamp: Date.now(),
				};

				// 缓存结果
				this.judgmentCache.set(cacheKey, emptyResult);
				return emptyResult;
			}

			// 添加延迟，避免API调用过于频繁
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// 解析AI返回的JSON结果
			let judgmentResult: AIStopLossJudgment;
			try {
				// 尝试从结果中提取JSON - 改进的正则表达式，更精确地匹配JSON对象
				let jsonText = result.text;

				// 尝试多种方法提取JSON
				let jsonMatch = jsonText.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					// 尝试查找JSON代码块
					jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
					if (jsonMatch) {
						jsonText = jsonMatch[1];
					} else {
						// 尝试查找可能的JSON起始位置
						const startIndex = jsonText.indexOf("{");
						const endIndex = jsonText.lastIndexOf("}");
						if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
							jsonText = jsonText.substring(startIndex, endIndex + 1);
						} else {
							throw new Error("AI返回结果中未找到有效的JSON");
						}
					}
				} else {
					jsonText = jsonMatch[0];
				}

				// 清理JSON字符串，移除可能的注释和多余空格
				jsonText = jsonText
					.replace(/\/\*[\s\S]*?\*\//g, "")
					.replace(/\/\/.*$/gm, "")
					.trim();

				console.log("提取的JSON文本 Extracted JSON text:", jsonText); // 调试日志

				const parsedResult = JSON.parse(jsonText);

				// 验证必要字段
				if (
					!parsedResult.volatilityType ||
					!parsedResult.confidence ||
					!parsedResult.reason ||
					!parsedResult.recommendedAction ||
					!parsedResult.marketAnalysis
				) {
					console.log(
						"AI返回的JSON缺少必要字段 Missing required fields in AI response:",
						parsedResult,
					); // 调试日志
					throw new Error("AI返回的JSON缺少必要字段");
				}

				// 构建标准结果对象
				judgmentResult = {
					volatilityType: parsedResult.volatilityType as MarketVolatilityType,
					confidence: parsedResult.confidence,
					reason: parsedResult.reason,
					recommendedAction: parsedResult.recommendedAction,
					marketAnalysis: {
						priceVolatility: parsedResult.marketAnalysis.priceVolatility,
						volumeChange: parsedResult.marketAnalysis.volumeChange,
						technicalSignals: parsedResult.marketAnalysis.technicalSignals,
						marketSentiment: parsedResult.marketAnalysis.marketSentiment,
					},
					timestamp: Date.now(),
				};
			} catch (parseError) {
				console.error(
					"解析AI止损判断结果失败 Failed to parse AI stop loss judgment result:",
					{
						error: parseError,
						result: result.text,
					},
				);

				// 返回默认的安全结果
				judgmentResult = {
					volatilityType: MarketVolatilityType.UNCERTAIN,
					confidence: 0.5,
					reason: "AI判断结果解析失败，采用保守策略",
					recommendedAction: "reduce_position",
					marketAnalysis: {
						priceVolatility: 0.5,
						volumeChange: 0.5,
						technicalSignals: ["解析失败"],
						marketSentiment: "neutral",
					},
					timestamp: Date.now(),
				};
			}

			// 缓存结果
			this.judgmentCache.set(cacheKey, judgmentResult);

			// 记录日志
			if (this.config.enableDetailedLogging) {
				logger.info("AI止损判断完成", {
					positionId,
					symbol,
					currentPnLPercent,
					leverage,
					volatilityType: judgmentResult.volatilityType,
					confidence: judgmentResult.confidence,
					recommendedAction: judgmentResult.recommendedAction,
					reason: judgmentResult.reason,
				});
			}

			return judgmentResult;
		} catch (error) {
			logger.error("AI止损判断失败", { error, positionId, symbol });

			// 返回默认的安全结果
			const safeResult: AIStopLossJudgment = {
				volatilityType: MarketVolatilityType.UNCERTAIN,
				confidence: 0.3,
				reason: "AI判断过程出错，采用保守策略",
				recommendedAction: "reduce_position",
				marketAnalysis: {
					priceVolatility: 0.5,
					volumeChange: 0.5,
					technicalSignals: ["判断失败"],
					marketSentiment: "neutral",
				},
				timestamp: Date.now(),
			};

			return safeResult;
		}
	}

	/**
	 * 清理过期的缓存
	 * Clear expired cache
	 */
	clearExpiredCache(): void {
		if (!this.config) return;

		const now = Date.now();
		const expireTime = this.config.judgmentIntervalSeconds * 1000 * 2; // 缓存保留2个判断周期

		for (const [key, value] of this.judgmentCache.entries()) {
			if (now - value.timestamp > expireTime) {
				this.judgmentCache.delete(key);
			}
		}
	}

	/**
	 * 获取判断器状态
	 * Get judger status
	 *
	 * @returns 判断器状态 Judger status
	 */
	getStatus(): {
		isInitialized: boolean;
		cacheSize: number;
		config?: AIStopLossJudgmentConfig;
	} {
		return {
			isInitialized: this.isInitialized,
			cacheSize: this.judgmentCache.size,
			config: this.config,
		};
	}
}

// 导出默认的AI止损判断器实例
export default new AIStopLossJudger();
