/**
 * 蔡森策略独立Agent实现
 * Cai Sen Strategy Independent Agent Implementation
 *
 * 该文件实现了一个独立的蔡森策略Agent，包含完整的多时间框架分析、七分位策略引擎、
 * 动态点位交易系统和AI动态订单执行器功能。该Agent可以独立运行，也可以集成到
 * 主交易系统中，通过策略切换机制与其他Agent协同工作。
 *
 * This file implements an independent Cai Sen strategy agent with complete multi-timeframe analysis,
 * seven-segment strategy engine, dynamic point trading system, and AI dynamic order execution.
 * The agent can run independently or be integrated into the main trading system, working
 * with other agents through strategy switching mechanisms.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { Agent, Memory, createTool } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { z } from "zod";
import { getCaiSenStrategy } from "../caisen";
import { type CaiSenTradingTools, createCaiSenTradingTools } from "../caisen";
import { RISK_PARAMS } from "../config/riskParams";
import {
  getCurrentPositions,
  getCurrentPrice,
  getKlineData,
} from "../scheduler/caiSenMonitor";
import { isCaiSenStrategy } from "../scheduler/caiSenMonitor";
import { getCaiSenParams } from "../scheduler/caiSenMonitor";
import * as tradingTools from "../tools/trading";
import { createLogger } from "../utils/loggerUtils";

// 创建日志记录器
const logger = createLogger({ name: "caisen-agent", level: "info" });

/**
 * 账户风险配置
 */
interface AccountRiskConfig {
  stopLossUsdt: number;
  takeProfitUsdt: number;
  syncOnStartup: boolean;
  extremeStopLossPercent: number;
  maxHoldingHours: number;
  maxPositions: number;
}

/**
 * 从环境变量读取账户风险配置
 */
function getAccountRiskConfig(): AccountRiskConfig {
  return {
    stopLossUsdt: Number.parseFloat(process.env.ACCOUNT_STOP_LOSS_USDT || "50"),
    takeProfitUsdt: Number.parseFloat(
      process.env.ACCOUNT_TAKE_PROFIT_USDT || "10000"
    ),
    syncOnStartup: process.env.SYNC_CONFIG_ON_STARTUP === "true",
    extremeStopLossPercent: Number.parseFloat(
      process.env.EXTREME_STOP_LOSS_PERCENT || "10"
    ),
    maxHoldingHours: Number.parseFloat(process.env.MAX_HOLDING_HOURS || "24"),
    maxPositions: Number.parseFloat(process.env.MAX_POSITIONS || "5"),
  };
}

/**
 * 蔡森策略Agent配置接口
 * Interface for Cai Sen strategy agent configuration
 */
export interface CaiSenAgentConfig {
  /** 交易间隔时间（分钟） Trading interval in minutes */
  intervalMinutes: number;
  /** 市场数据上下文 Market data context */
  marketDataContext?: any;
  /** 是否启用详细日志 Enable detailed logging */
  enableDetailedLogging?: boolean;
  // 可选的依赖项，如果不提供则创建新的
  tools?: any[];
  openai?: any;
  memory?: Memory;
  /** 蔡森交易工具集 CaiSen trading tools */
  caiSenTradingTools?: CaiSenTradingTools;
}

/**
 * 蔡森策略Agent状态接口
 * Interface for Cai Sen strategy agent state
 */
export interface CaiSenAgentState {
  /** 当前运行状态 Current running status */
  status: "idle" | "analyzing" | "trading" | "monitoring";
  /** 最后分析时间 Last analysis time */
  lastAnalysisTime?: Date;
  /** 当前交易信号 Current trading signal */
  currentSignal?: "bullish" | "bearish" | "neutral";
  /** 持仓状态 Position status */
  positionStatus: "none" | "long" | "short" | "both";
  /** 七分位分析结果 Seven-segment analysis result */
  sevenSegmentResult?: {
    isCrashDetected: boolean;
    crashPercentage?: number;
    levels?: number[];
    currentLevel?: number;
    recoverySignal?: boolean;
  };
  /** 多时间框架分析结果 Multi-timeframe analysis result */
  multiTimeframeResult?: {
    daily: { trend: string; strength: number; signal: string };
    hourly: { trend: string; strength: number; signal: string };
    fiveMin: { trend: string; strength: number; signal: string };
    overall: { signal: string; confidence: number };
  };
}

/**
 * 生成蔡森策略专属提示词
 * Generate specialized prompt for Cai Sen strategy
 *
 * @param config Agent配置 Agent configuration
 * @returns 蔡森策略提示词 Cai Sen strategy prompt
 */
function generateCaiSenPrompt(config: CaiSenAgentConfig): string {
  // 获取蔡森策略参数
  const strategy = getCaiSenStrategy(85); // 默认使用最大杠杆85
  const riskConfig = getAccountRiskConfig();
  const caiSenParams = getCaiSenParams();

  // 计算杠杆推荐值
  const levMin = strategy.leverageMin;
  const levMax = strategy.leverageMax;
  const levNormal = levMin;
  const levGood = Math.ceil((levMin + levMax) / 2);
  const levStrong = levMax;

  return `
【蔡森策略 - 多时间框架分析+七分位策略引擎】

你的角色：蔡森策略AI交易专家
- 你需要综合多时间框架分析、七分位策略和动态点位交易系统
- 精准捕捉买卖点和暴跌后的反弹机会
- 严格执行风险管理，保护账户资金

🎯 【多时间框架分析体系】
这是蔡森策略的基础，必须按顺序分析：

▶ 日线趋势分析（权重50%）：
  - 作用：判断市场主趋势方向和强度
  - 分析指标：EMA12/26、MACD、RSI
  - 趋势判断：连续3根K线在EMA同侧为趋势确认
  - 强势信号：价格距离EMA>1%且MACD柱状图连续同向扩大

▶ 小时线方向确认（权重30%）：
  - 作用：验证日线趋势是否延续
  - 分析指标：EMA20、MACD、成交量
  - 确认条件：至少1个指标与日线方向一致
  - 背离警示：价格新高但MACD或RSI未创新高

▶ 5分钟线买卖点分析（权重20%）：
  - 作用：确定具体入场和出场点位
  - 分析指标：RSI、布林带、成交量
  - 买入信号：RSI<30后回升+成交量放大+突破布林带下轨
  - 卖出信号：RSI>70后回落+成交量放大+突破布林带上轨

🎯 【七分位策略引擎】
专门针对暴跌后的反弹机会：

▶ 暴跌检测：
  - 暴跌定义：4小时内价格下跌超过15%
  - 触发条件：检测到暴跌后启动七分位分析
  - 数据记录：记录暴跌前最高价和最低价

▶ 七分位水平计算：
  - 七分位单位 = (暴跌前最高价 - 暴跌前最低价) / 7
  - 1/7区域：暴跌前最低价 + 七分位单位 * 1
  - 2/7区域：暴跌前最低价 + 七分位单位 * 2
  - 3/7区域：暴跌前最低价 + 七分位单位 * 3
  - 4/7区域：暴跌前最低价 + 七分位单位 * 4
  - 5/7区域：暴跌前最低价 + 七分位单位 * 5
  - 6/7区域：暴跌前最低价 + 七分位单位 * 6
  - 7/7区域：暴跌前最高价

▶ 价格位置分析：
  - 确定当前价格在七分位中的位置
  - 1/7区域：超卖反弹，HIGH信心做多
  - 1/2区域：中等支撑，MEDIUM信心做多
  - 6/7区域：反弹阻力，MEDIUM信心做空
  - 突破高点：趋势反转，HIGH信心做多

▶ 恢复交易计划：
  - 阶段1：超跌反弹（1-4小时，高风险）
  - 阶段2：震荡整理（4-12小时，中风险）
  - 阶段3：趋势恢复（12-24小时，低风险）

🎯 【动态点位交易系统】
精准计算入场和出场点位：

▶ 动态点位计算：
  - 斐波那契回撤位：0.618、0.500、0.382
  - 成交量密集区：分析过去100根K线的成交量分布
  - 动态入场点位：基础点位 ± ATR * 调整系数

▶ 动态仓位管理：
  - 基础仓位 = 账户资金 * 风险比例 / 单笔最大损失
  - 信心度调整：HIGH*1.2、MEDIUM*1.0、LOW*0.6
  - 波动率调整：高波动*0.6、中等波动*0.7、低波动*1.2
  - 金字塔加仓：价格有利移动1.5%时加仓30%

🎯 【AI动态订单执行器】
智能执行入场和出场：

▶ 智能入场系统：
  - 开仓信号总得分 = 趋势信号权重 * 趋势得分 + 突破信号权重 * 突破得分 + 指标权重 * RSI得分
  - 信心度级别：HIGH(得分>0.8) / MEDIUM(0.5-0.8) / LOW(<0.5)
  - 调整后入场价格 = 原始入场价格 * (1 ± 滑点调整比例)

▶ 智能出场系统：
  - 移动止损更新条件：盈利达到目标的N%且价格继续向有利方向移动
  - 移动止损点位 = 入场价格 + (当前价格 - 入场价格) * 止损锁定比例
  - 分批止盈数量 = 总仓位 * 每批止盈比例

▶ 多币种交易管理：
  - 币种综合评分 = 趋势强度 * 0.3 + 波动率评分 * 0.2 + 交易量评分 * 0.2 + 相关性评分 * 0.15 + 风险评分 * 0.15
  - 资金分配比例 = 币种评分 / 所有币种评分总和 * 100%
  - 最大单币种资金比例 = 总资金 * 单币种最大比例限制

🎯 【风险管理规则】
严格执行风险控制：

▶ 单笔交易风险：最大1%账户资金
▶ 单日最大损失：5%账户资金
▶ 单笔最大损失：3%账户资金
▶ 动态止损 = 入场价格 - ATR * 止损系数 * 波动率调整（多头）
▶ 动态止损 = 入场价格 + ATR * 止损系数 * 波动率调整（空头）
▶ 分批止盈位：第一目标1.0倍、第二目标2.0倍、第三目标3.0倍风险回报比

🎯 【执行流程】
严格按照以下步骤执行：

1. 数据获取：获取日线、小时线和5分钟线K线数据
2. 多时间框架分析：日线趋势分析、小时线方向确认、5分钟线买卖点分析
3. 七分位策略分析：暴跌检测、七分位水平计算、价格位置分析、恢复信号生成
4. 动态点位计算：支撑阻力位、入场点位、止损止盈位
5. 动态仓位计算：根据信号信心度、波动率和市场状况计算仓位大小
6. 订单执行：取消未成交订单、执行入场订单、设置条件单
7. 持仓管理：监控订单状态、动态调整止损、金字塔加仓、分批止盈
8. 绩效跟踪：记录交易决策、计算绩效指标、生成策略报告

⚠️ 【蔡森策略铁律】
1. 多时间框架分析必须按顺序进行，日线趋势优先
2. 暴跌后必须启动七分位分析，1/7区域是黄金做多机会
3. 严格执行风险管理，单笔风险不超过1%
4. 动态止损必须及时调整，保护本金和利润
5. 分批止盈必须执行，锁定利润避免回吐

【当前配置】
- 杠杆范围：${levMin}-${levMax}倍
- 仓位大小：${strategy.positionSizeMin}-${strategy.positionSizeMax}%
- 止损设置：低杠杆${strategy.stopLoss.low}%、中杠杆${strategy.stopLoss.mid}%、高杠杆${strategy.stopLoss.high}%
- 分批止盈：+${strategy.partialTakeProfit.stage1.trigger}%平${strategy.partialTakeProfit.stage1.closePercent}%，+${strategy.partialTakeProfit.stage2.trigger}%平${strategy.partialTakeProfit.stage2.closePercent}%，+${strategy.partialTakeProfit.stage3.trigger}%全部清仓

记住：蔡森策略的核心是多维度分析和精准点位，严格执行策略流程，才能实现稳定收益。

可用工具：
- 市场数据：getMarketPrice、getTechnicalIndicators、getFundingRate、getOrderBook
- 持仓管理：openPosition（市价单）、closePosition（市价单）、cancelOrder
- 账户信息：getAccountBalance、getPositions、getOpenOrders
- 风险分析：calculateRisk、checkOrderStatus
- 蔡森策略专用：setBatchClosing、cancelBatchClosing、setStopProfitLoss、getBatchClosingStatus、getStopProfitLossStatus

蔡森策略专用工具说明：
- setBatchClosing：设置分批平仓策略，支持自定义批次数量、比例和触发条件
- cancelBatchClosing：取消已设置的分批平仓策略
- setStopProfitLoss：设置止盈止损策略，支持固定值、百分比、ATR等多种计算方式
- getBatchClosingStatus：查询指定持仓的分批平仓状态
- getStopProfitLossStatus：查询指定持仓的止盈止损状态

世界顶级交易员行动准则：

作为世界顶级交易员，您必须果断行动，用实力创造卓越成果！
- **立即执行**：不要只说"我会平仓"、"应该开仓"，而是立即调用工具实际执行
- **决策落地**：每个决策都要转化为实际的工具调用（closePosition、openPosition等）
- **专业判断**：基于技术指标和数据分析，同时结合您的专业经验做最优决策
- **灵活调整**：策略框架是参考基准，您有权根据市场实际情况灵活调整
- **风控底线**：在风控红线内您有完全自主权，但风控底线绝不妥协

您的卓越目标：
- **追求卓越**：用您的专业能力实现超越基准的优异表现（夏普比率≥2.0）
- **胜率追求**：≥60-70%（凭借您的专业能力和严格的入场条件）

风控层级：
- 系统硬性底线（强制执行）：
  * 单笔亏损 ≤ ${riskConfig.extremeStopLossPercent}%：强制平仓
  * 持仓时间 ≥ ${riskConfig.maxHoldingHours}小时：强制平仓
  * 移动止盈（3级规则，自动监控每10秒）：
    - Level 1: 峰值达到 ${strategy.trailingStop.level1.trigger}% 时，回落至 ${strategy.trailingStop.level1.stopAt}% 平仓
    - Level 2: 峰值达到 ${strategy.trailingStop.level2.trigger}% 时，回落至 ${strategy.trailingStop.level2.stopAt}% 平仓
    - Level 3: 峰值达到 ${strategy.trailingStop.level3.trigger}% 时，回落至 ${strategy.trailingStop.level3.stopAt}% 平仓
- AI战术决策（专业建议，灵活执行）：
  * 策略止损线：${strategy.stopLoss.low}% 到 ${strategy.stopLoss.high}%（强烈建议遵守）
  * 分批止盈（蔡森策略）：+${strategy.partialTakeProfit.stage1.trigger}%/+${strategy.partialTakeProfit.stage2.trigger}%/+${strategy.partialTakeProfit.stage3.trigger}%（使用 percentage 参数）
  * 峰值回撤 ≥ ${strategy.peakDrawdownProtection}%：危险信号，强烈建议平仓

仓位管理：
- 严禁双向持仓：同一币种不能同时持有多单和空单
- 允许加仓：对盈利>5%的持仓，趋势强化时可加仓≤50%，最多2次
- 杠杆限制：加仓时必须使用相同或更低杠杆（禁止提高）
- 最多持仓：${riskConfig.maxPositions}个币种
- 双向交易：做多和做空都能赚钱，不要只盯着做多机会

执行参数：
- 执行周期：每${config.intervalMinutes}分钟
- 杠杆范围：${strategy.leverageMin}-${strategy.leverageMax}倍（${levNormal}/${levGood}/${levStrong}）
- 仓位大小：${strategy.positionSizeRecommend.normal}（普通）/${strategy.positionSizeRecommend.good}（良好）/${strategy.positionSizeRecommend.strong}（强）
- 交易费用：0.1%往返，潜在利润≥2-3%才交易

决策优先级：
1. 账户健康检查（回撤保护） → 立即调用 getAccountBalance
2. 现有持仓管理（止损/止盈） → 立即调用 getPositions + closePosition
3. 分析市场寻找机会 → 立即调用 getTechnicalIndicators
4. 评估并执行新开仓 → 立即调用 openPosition

世界顶级交易员智慧：
- **行情识别第一**：正确识别单边和震荡行情，根据行情类型调整策略
- **数据驱动+经验判断**：基于技术指标和多时间框架分析，同时运用您的专业判断和市场洞察力
- **趋势为友**：顺应趋势是核心原则，但您有能力识别反转机会（3个时间框架反转是强烈警告信号）
- **灵活止盈止损**：策略建议的止损和止盈点是参考基准，您可以根据关键支撑位、趋势强度、市场情绪灵活调整
- **让利润奔跑**：盈利交易要让它充分奔跑，但要用移动止盈保护利润，避免贪婪导致回吐
- **快速止损**：亏损交易要果断止损，不要让小亏变大亏，保护本金永远是第一位
- **概率思维**：您的专业能力让胜率更高，但市场永远有不确定性，用概率和期望值思考
- **风控红线**：在系统硬性底线（${riskConfig.extremeStopLossPercent}%强制平仓、${riskConfig.maxHoldingHours}小时强制平仓）内您有完全自主权
- **技术说明**：pnl_percent已包含杠杆效应，直接比较即可
- **蔡森策略核心**：多时间框架分析+七分位策略引擎，在暴跌后的1/7区域是黄金做多机会

【决策输出要求】
每一次决策必须明确包含以下信息：
1. 对于新开仓的货币：
   - 止盈阈值（百分比）
   - 止损阈值（百分比）
   - 平仓方式（"full"表示一次性平仓，"batch"表示分批平仓）
   - 如果是分批平仓，需明确批次数量、每批百分比和触发条件

2. 对于已有持仓的货币：
   - 是否调整止盈止损阈值
   - 是否调整平仓方式
   - 如果调整，需明确新的参数

3. 决策必须清晰明确，便于系统解析和执行

市场数据按时间顺序排列（最旧 → 最新），跨多个时间框架。使用此数据识别多时间框架趋势和关键水平。`;
}

/**
 * 创建蔡森策略独立Agent
 * Create an independent Cai Sen strategy agent
 *
 * @param config Agent配置 Agent configuration
 * @returns 蔡森策略Agent实例 Cai Sen strategy agent instance
 *
 * @example
 * ```typescript
 * // 创建蔡森策略Agent
 * const caiSenAgent = await createCaiSenAgent({
 *   intervalMinutes: 5,
 *   enableDetailedLogging: true
 * });
 *
 * // 执行交易分析
 * const result = await caiSenAgent.run();
 * ```
 */
export async function createCaiSenAgent(
  config: CaiSenAgentConfig
): Promise<Agent> {
  // 使用传入的依赖项或创建新的
  const openai =
    config.openai ||
    createOpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
    });

  const memory =
    config.memory ||
    new Memory({
      storage: new LibSQLMemoryAdapter({
        url: "file:./.voltagent/caisen-memory.db",
        logger: logger.child({ component: "libsql" }),
      }),
    });

  // 创建或使用传入的蔡森交易工具集
  const caiSenTradingTools = config.caiSenTradingTools;
  if (!caiSenTradingTools) {
    // 如果没有提供交易工具集，需要创建一个默认的
    // 这里需要导入 CaiSenStandardizedInterface，但由于循环依赖问题，我们使用空对象
    // 实际使用时，应该在外部创建并传入
    logger.warn("未提供蔡森交易工具集，某些功能可能不可用");
  }

  // 创建蔡森策略专用工具
  const caiSenSpecificTools = caiSenTradingTools
    ? [
        createTool({
          name: "setBatchClosing",
          description: "设置分批平仓策略，支持自定义批次数量、比例和触发条件",
          parameters: z.object({
            positionId: z.string().describe("持仓ID"),
            batchCount: z
              .number()
              .min(1)
              .max(10)
              .describe("分批平仓的批次数量"),
            batchPercentages: z
              .array(z.number())
              .describe("每批次平仓的百分比"),
            triggerConditions: z
              .array(
                z.object({
                  type: z
                    .enum(["profit", "loss", "time", "price", "custom"])
                    .describe("触发条件类型"),
                  value: z.number().describe("触发条件值"),
                  parameters: z.record(z.any()).optional().describe("触发参数"),
                })
              )
              .describe("触发条件列表"),
            executionStrategy: z
              .enum(["immediate", "gradual", "adaptive"])
              .describe("执行策略"),
            delayTime: z.number().optional().describe("延迟时间"),
            expirationTime: z.number().optional().describe("过期时间戳"),
            metadata: z.record(z.any()).optional().describe("元数据"),
          }),
          execute: async (args) => caiSenTradingTools.setBatchClosing(args),
        }),
        createTool({
          name: "cancelBatchClosing",
          description: "取消已设置的分批平仓策略",
          parameters: z.object({
            batchId: z.string().describe("分批ID"),
          }),
          execute: async (args) =>
            caiSenTradingTools.cancelBatchClosing(args.batchId),
        }),
        createTool({
          name: "setStopProfitLoss",
          description:
            "设置止盈止损策略，支持固定值、百分比、ATR等多种计算方式",
          parameters: z.object({
            positionId: z.string().describe("持仓ID"),
            stopLoss: z
              .object({
                enabled: z.boolean().describe("是否启用止损"),
                type: z
                  .enum([
                    "fixed",
                    "percentage",
                    "atr",
                    "bollinger",
                    "fibonacci",
                    "pivot",
                    "custom",
                  ])
                  .describe("止损类型"),
                value: z.number().describe("止损值"),
                parameters: z.record(z.any()).optional().describe("止损参数"),
                trailing: z.boolean().optional().describe("是否为移动止损"),
                trailingParameters: z
                  .object({
                    step: z.number().describe("移动步长"),
                    direction: z.enum(["up", "down"]).describe("移动方向"),
                  })
                  .optional()
                  .describe("移动止损参数"),
              })
              .optional()
              .describe("止损配置"),
            takeProfit: z
              .object({
                enabled: z.boolean().describe("是否启用止盈"),
                type: z
                  .enum([
                    "fixed",
                    "percentage",
                    "atr",
                    "bollinger",
                    "fibonacci",
                    "pivot",
                    "custom",
                  ])
                  .describe("止盈类型"),
                value: z.number().describe("止盈值"),
                parameters: z.record(z.any()).optional().describe("止盈参数"),
                partial: z.boolean().optional().describe("是否分批止盈"),
                partialParameters: z
                  .object({
                    batchCount: z.number().describe("分批数量"),
                    batchPercentages: z.array(z.number()).describe("分批比例"),
                    triggerConditions: z
                      .array(
                        z.object({
                          type: z
                            .enum(["profit", "time", "price", "custom"])
                            .describe("触发类型"),
                          value: z.number().describe("触发值"),
                          parameters: z
                            .record(z.any())
                            .optional()
                            .describe("触发参数"),
                        })
                      )
                      .describe("触发条件"),
                  })
                  .optional()
                  .describe("分批止盈参数"),
              })
              .optional()
              .describe("止盈配置"),
            metadata: z.record(z.any()).optional().describe("元数据"),
          }),
          execute: async (args) => caiSenTradingTools.setStopProfitLoss(args),
        }),
        createTool({
          name: "getBatchClosingStatus",
          description: "查询指定持仓的分批平仓状态",
          parameters: z.object({
            positionId: z.string().describe("持仓ID"),
          }),
          execute: async (args) =>
            caiSenTradingTools.getBatchClosingStatus(args.positionId),
        }),
        createTool({
          name: "getStopProfitLossStatus",
          description: "查询指定持仓的止盈止损状态",
          parameters: z.object({
            positionId: z.string().describe("持仓ID"),
          }),
          execute: async (args) =>
            caiSenTradingTools.getStopProfitLossStatus(args.positionId),
        }),
      ]
    : [];

  // 使用传入的工具集或默认工具集，并添加蔡森策略专用工具
  const tools = [
    ...(config.tools || [
      tradingTools.getMarketPriceTool,
      tradingTools.getTechnicalIndicatorsTool,
      tradingTools.getFundingRateTool,
      tradingTools.getOrderBookTool,
      tradingTools.openPositionTool,
      tradingTools.closePositionTool,
      tradingTools.cancelOrderTool,
      tradingTools.getAccountBalanceTool,
      tradingTools.getPositionsTool,
      tradingTools.getOpenOrdersTool,
      tradingTools.checkOrderStatusTool,
      tradingTools.calculateRiskTool,
      tradingTools.syncPositionsTool,
    ]),
    ...caiSenSpecificTools,
  ];

  // 记录Agent创建日志
  logger.info("创建蔡森策略独立Agent", {
    intervalMinutes: config.intervalMinutes,
    enableDetailedLogging: config.enableDetailedLogging,
    hasCustomTools: !!config.tools,
    hasCustomMemory: !!config.memory,
    hasCustomOpenAI: !!config.openai,
    hasCaiSenTradingTools: !!caiSenTradingTools,
    caiSenSpecificToolsCount: caiSenSpecificTools.length,
  });

  // 创建蔡森策略Agent
  const agent = new Agent({
    name: "caisen-strategy-agent",
    instructions: generateCaiSenPrompt(config),
    model: openai.chat(
      process.env.AI_MODEL_NAME || "deepseek/deepseek-v3.2-exp"
    ),
    tools,
    memory,
    logger,
  });

  return agent;
}

/**
 * 蔡森策略Agent管理器类
 * Cai Sen strategy agent manager class
 *
 * 该类负责管理蔡森策略Agent的生命周期，包括创建、启动、停止和状态监控。
 * This class manages the lifecycle of the Cai Sen strategy agent, including creation, startup, shutdown, and status monitoring.
 */
export class CaiSenAgentManager {
  private agent?: Agent;
  private config?: CaiSenAgentConfig;
  private isRunning = false;
  private runInterval?: NodeJS.Timeout;
  private state: CaiSenAgentState = {
    status: "idle",
    positionStatus: "none",
  };

  /**
   * 初始化蔡森策略Agent
   * Initialize the Cai Sen strategy agent
   *
   * @param config Agent配置 Agent configuration
   */
  async initialize(config: CaiSenAgentConfig): Promise<void> {
    this.config = config;
    this.agent = await createCaiSenAgent(config);

    logger.info("蔡森策略Agent初始化完成", {
      intervalMinutes: config.intervalMinutes,
    });
  }

  /**
   * 启动蔡森策略Agent
   * Start the Cai Sen strategy agent
   */
  async start(): Promise<void> {
    if (!this.agent || !this.config) {
      throw new Error("蔡森策略Agent未初始化，请先调用initialize方法");
    }

    if (this.isRunning) {
      logger.warn("蔡森策略Agent已在运行中");
      return;
    }

    this.isRunning = true;
    this.state.status = "analyzing";

    logger.info("启动蔡森策略Agent", {
      intervalMinutes: this.config.intervalMinutes,
    });

    // 设置定时执行
    this.runInterval = setInterval(async () => {
      try {
        this.state.status = "analyzing";

        // 生成提示词
        const prompt = generateCaiSenPrompt(this.config!);

        // 执行Agent
        const result = await this.agent!.generateText(prompt);

        // 更新状态
        this.state.status = "monitoring";
        this.state.lastAnalysisTime = new Date();

        logger.debug("蔡森策略Agent执行完成", { result });
      } catch (error) {
        logger.error("蔡森策略Agent执行错误", { error });
        this.state.status = "idle";
      }
    }, this.config.intervalMinutes * 60 * 1000);

    // 立即执行一次
    try {
      const prompt = generateCaiSenPrompt(this.config);
      await this.agent.generateText(prompt);
      this.state.lastAnalysisTime = new Date();
      this.state.status = "monitoring";
    } catch (error) {
      logger.error("蔡森策略Agent首次执行错误", { error });
      this.state.status = "idle";
    }
  }

  /**
   * 停止蔡森策略Agent
   * Stop the Cai Sen strategy agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("蔡森策略Agent未在运行");
      return;
    }

    this.isRunning = false;
    this.state.status = "idle";

    if (this.runInterval) {
      clearInterval(this.runInterval);
      this.runInterval = undefined;
    }

    logger.info("蔡森策略Agent已停止");
  }

  /**
   * 获取Agent状态
   * Get the agent status
   *
   * @returns Agent状态 Agent status
   */
  getState(): CaiSenAgentState {
    return { ...this.state };
  }

  /**
   * 更新Agent状态
   * Update the agent state
   *
   * @param newState 新状态 New state
   */
  updateState(newState: Partial<CaiSenAgentState>): void {
    this.state = { ...this.state, ...newState };
  }

  /**
   * 检查Agent是否在运行
   * Check if the agent is running
   *
   * @returns 是否在运行 Whether it's running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// 导出默认的Agent管理器实例
export default new CaiSenAgentManager();
