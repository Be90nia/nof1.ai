/**
 * 蔡森策略模块主入口
 * CaiSen Strategy Module Main Entry
 *
 * @author CaiSen Strategy Team
 * @version 1.0.0
 */

// 导出Agent相关 - Export agent related
import * as agent from "./agent";
// 导出标准化接口 - Export standardized interface
import * as standardInterface from "./interface";
// 导出策略相关 - Export strategy related
import * as strategy from "./strategy";
// 导出分批平仓系统 - Export batch closing system
import * as batchClosingSystem from "./systems/batch-closing";

// 导出蔡森策略配置和提示词生成 - Export CaiSen strategy config and prompt generation
export const { getCaiSenStrategy, generateCaiSenPrompt } = strategy;

// 导出蔡森Agent交易工具 - Export CaiSen Agent trading tools
export { createCaiSenTradingTools } from "./agent/tools";
export type { CaiSenTradingTools } from "./agent/tools";

// 导出蔡森标准化接口 - Export CaiSen standardized interface
export {
	CaiSenStandardizedInterface,
	createCaiSenStandardizedInterface,
	InterfaceCallResult,
} from "./interface";

// 导出蔡森分批平仓系统 - Export CaiSen batch closing system
export {
	CaiSenBatchClosingSystem,
	createCaiSenBatchClosingSystem,
	DEFAULT_BATCH_CLOSING_CONFIG,
	BatchStatus,
	ClosingType,
} from "./systems/batch-closing";

// 导出蔡森AI参数控制系统 - Export CaiSen AI parameter control system
export {
	CaiSenAiParameterControl,
	createCaiSenAiParameterControl,
	DEFAULT_PARAMETER_CONTROL_CONFIG,
} from "./systems/ai-parameter-control";

// 导出蔡森动态阈值设定系统 - Export CaiSen dynamic threshold setting system
export {
	CaiSenDynamicThresholdSetting,
	createCaiSenDynamicThresholdSetting,
	DEFAULT_THRESHOLD_SETTING_CONFIG,
	ThresholdType,
	ThresholdStatus,
	ThresholdSource,
	ThresholdCalculationMethod,
} from "./systems/dynamic-threshold";

// 导出所有类型定义 - Export all type definitions
export * from "./strategy/types";
export * from "./interface/types";
export * from "./systems/batch-closing";
