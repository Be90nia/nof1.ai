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
 * 工具调用接口定义
 * Tool call interface definition
 */
export interface ToolCall {
	/** 工具名称 - Tool name */
	name: string;
	/** 工具参数 - Tool parameters */
	parameters: any;
}

import { jsonrepair } from "jsonrepair";
import { createLogger } from "./loggerUtils";

const logger = createLogger({ name: "tool-call-parser", level: "info" });

/**
 * 修复setPositionExitStrategy工具调用中的组件嵌套问题
 * Fix component nesting issues in setPositionExitStrategy tool calls
 *
 * @param parameters 工具调用参数对象 - Tool call parameters object
 * @returns 修复后的参数对象，所有组件都在顶层 - Fixed parameters object with all components at top level
 */
function fixComponentNesting(parameters: any): any {
	// 创建新的参数对象
	const newParams: any = {
		symbol: parameters.symbol,
		strategyType: parameters.strategyType || "combination",
		enabled: parameters.enabled !== undefined ? parameters.enabled : true,
	};

	// 递归查找组件的辅助函数
	const findComponent = (obj: any, componentName: string): any | null => {
		if (!obj || typeof obj !== "object") {
			return null;
		}

		if (obj[componentName]) {
			return obj[componentName];
		}

		for (const value of Object.values(obj)) {
			if (typeof value === "object" && value !== null) {
				const found = findComponent(value, componentName);
				if (found) {
					return found;
				}
			}
		}

		return null;
	};

	// 提取partialTakeProfit组件，支持从任何位置递归提取
	const partialTakeProfit = findComponent(parameters, "partialTakeProfit");
	if (partialTakeProfit) {
		// 清理可能存在的嵌套组件
		const cleanPartialTakeProfit: any = { ...partialTakeProfit };
		delete cleanPartialTakeProfit.dynamicStopLoss;
		delete cleanPartialTakeProfit.peakDrawdown;
		newParams.partialTakeProfit = cleanPartialTakeProfit;
	}

	// 提取dynamicStopLoss组件，支持从任何位置递归提取
	const dynamicStopLoss = findComponent(parameters, "dynamicStopLoss");
	if (dynamicStopLoss) {
		// 清理可能存在的嵌套组件
		const cleanDynamicStopLoss: any = { ...dynamicStopLoss };
		delete cleanDynamicStopLoss.partialTakeProfit;
		delete cleanDynamicStopLoss.peakDrawdown;
		newParams.dynamicStopLoss = cleanDynamicStopLoss;
	}

	// 提取peakDrawdown组件，支持从任何位置递归提取
	const peakDrawdown = findComponent(parameters, "peakDrawdown");
	if (peakDrawdown) {
		// 清理可能存在的嵌套组件
		const cleanPeakDrawdown: any = { ...peakDrawdown };
		delete cleanPeakDrawdown.partialTakeProfit;
		delete cleanPeakDrawdown.dynamicStopLoss;
		newParams.peakDrawdown = cleanPeakDrawdown;
	}

	// 添加其他顶层属性
	for (const [key, value] of Object.entries(parameters)) {
		if (
			![
				"symbol",
				"strategyType",
				"enabled",
				"partialTakeProfit",
				"dynamicStopLoss",
				"peakDrawdown",
			].includes(key)
		) {
			newParams[key] = value;
		}
	}

	return newParams;
}

/**
 * 修复常见的JSON格式错误
 * Fix common JSON format errors
 *
 * @param jsonString 可能有格式错误的JSON字符串 - JSON string with possible format errors
 * @returns 修复后的JSON字符串 - Fixed JSON string
 */
export function fixJsonFormat(jsonString: string): string {
	// 记录原始JSON字符串长度，用于调试
	const originalLength = jsonString.length;
	logger.debug(`开始修复JSON格式，原始长度: ${originalLength}字符`);

	try {
		// 1. 先尝试使用jsonrepair库修复JSON格式错误
		// Use jsonrepair library to fix JSON format errors
		const fixedJson = jsonrepair(jsonString);
		logger.debug(`jsonrepair修复成功，修复后长度: ${fixedJson.length}字符`);
		return fixedJson;
	} catch (error) {
		logger.error(
			`使用jsonrepair修复JSON失败: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{
				originalJson:
					jsonString.substring(0, 100) + (jsonString.length > 100 ? "..." : ""),
				originalLength,
				error,
			},
		);

		// 2. 如果jsonrepair修复失败，尝试手动修复常见错误
		try {
			let fixedJson = jsonString;
			logger.debug(
				`开始手动修复JSON，原始内容: ${fixedJson.substring(0, 50)}${
					fixedJson.length > 50 ? "..." : ""
				}`,
			);

			// 预处理：移除可能的注释
			// Remove possible comments
			fixedJson = fixedJson
				.replace(/\/\*[\s\S]*?\*\//g, "") // 多行注释
				.replace(/\/\/.*$/gm, ""); // 单行注释

			// 修复1: 处理无引号的属性名
			// 将 {type:value} 转换为 {"type":value}
			// 改进：处理属性名前后可能的空格，以及属性名包含连字符的情况
			fixedJson = fixedJson.replace(
				/([a-zA-Z_$][a-zA-Z0-9_$-]*)(\s*:)/g,
				'"$1"$2',
			);

			// 修复2: 处理单引号为双引号
			// 将 {'key':'value'} 转换为 {"key":"value"}
			// 改进：只替换属性名和字符串值中的单引号，不替换字符串内部的单引号
			fixedJson = fixedJson.replace(/'([^']*?)'(\s*[:},\]])/g, '"$1"$2');

			// 修复3: 处理尾部逗号
			// 将 {"key":"value",} 转换为 {"key":"value"}
			// 改进：处理数组和对象中的尾部逗号
			fixedJson = fixedJson.replace(/,\s*([}\]])/g, "$1");

			// 修复4: 处理数字属性名
			// 将 {123:"value"} 转换为 {"123":"value"}
			fixedJson = fixedJson.replace(/([0-9]+)(\s*:)/g, '"$1"$2');

			// 修复5: 处理布尔值和null，确保它们是小写的
			fixedJson = fixedJson
				.replace(/\bTRUE\b/g, "true")
				.replace(/\bFALSE\b/g, "false")
				.replace(/\bNULL\b/g, "null");

			// 修复6: 处理JSON字符串中的换行符和制表符
			// 改进：只处理字符串内部的换行符和制表符
			fixedJson = fixedJson.replace(/"([^"]*?)"/g, (match) => {
				return match
					.replace(/\n/g, "\\n")
					.replace(/\t/g, "\\t")
					.replace(/\r/g, "\\r");
			});

			// 修复7: 处理缺少引号的字符串值
			// 将 {key: value} 转换为 {"key": "value"}（当value不是数字、布尔值或null时）
			fixedJson = fixedJson.replace(
				/"([^"]*?)"\s*:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*[,}\]])/g,
				'"$1": "$2"$3',
			);

			// 修复8: 处理多余的空格
			// 移除JSON字符串中的多余空格，但保留字符串内部的空格
			fixedJson = fixedJson.replace(/([{}[\],:])(\s+)/g, "$1");
			fixedJson = fixedJson.replace(/(\s+)([{}[\],:])/g, "$2");
			fixedJson = fixedJson.trim();

			// 修复9: 处理特殊字符转义问题
			// 确保所有必要的字符都被正确转义
			fixedJson = fixedJson.replace(/(["\\])/g, "\\$1");

			// 修复10: 确保JSON字符串以{或[开头，并以相应的}或]结尾
			// 防止截断的JSON数据
			if (!fixedJson.startsWith("{") && !fixedJson.startsWith("[")) {
				// 尝试找到第一个{或[
				const startIndex = Math.min(
					fixedJson.indexOf("{") >= 0
						? fixedJson.indexOf("{")
						: Number.POSITIVE_INFINITY,
					fixedJson.indexOf("[") >= 0
						? fixedJson.indexOf("[")
						: Number.POSITIVE_INFINITY,
				);
				if (startIndex !== Number.POSITIVE_INFINITY) {
					fixedJson = fixedJson.substring(startIndex);
				}
			}

			// 修复11: 确保JSON字符串正确结束
			if (fixedJson.startsWith("{") && !fixedJson.endsWith("}")) {
				// 统计花括号数量
				const openBraces = (fixedJson.match(/{/g) || []).length;
				const closeBraces = (fixedJson.match(/}/g) || []).length;
				if (openBraces > closeBraces) {
					// 补充缺少的右花括号
					fixedJson += "}".repeat(openBraces - closeBraces);
				}
			} else if (fixedJson.startsWith("[") && !fixedJson.endsWith("]")) {
				// 统计方括号数量
				const openBrackets = (fixedJson.match(/\[/g) || []).length;
				const closeBrackets = (fixedJson.match(/\]/g) || []).length;
				if (openBrackets > closeBrackets) {
					// 补充缺少的右方括号
					fixedJson += "]".repeat(openBrackets - closeBrackets);
				}
			}

			// 修复12: 处理setPositionExitStrategy工具调用的特殊结构问题
			// 检测并修复组件被错误嵌套的情况
			if (
				fixedJson.includes("partialTakeProfit") ||
				fixedJson.includes("dynamicStopLoss") ||
				fixedJson.includes("peakDrawdown")
			) {
				logger.debug(
					"检测到setPositionExitStrategy工具调用，开始处理组件嵌套问题",
				);

				// 提取所有组件的正则表达式 - 支持从任何位置提取组件，包括嵌套结构
				// 改进：使用更强大的正则表达式，能够匹配嵌套在其他组件内部的组件
				const componentRegexes = {
					partialTakeProfit:
						/"partialTakeProfit"\s*:\s*\{([^{}]*|\{[^{}]*\})*\}/g,
					dynamicStopLoss: /"dynamicStopLoss"\s*:\s*\{([^{}]*|\{[^{}]*\})*\}/g,
					peakDrawdown: /"peakDrawdown"\s*:\s*\{([^{}]*|\{[^{}]*\})*\}/g,
				};

				// 提取各个组件
				const components: string[] = [];
				const extractedComponents = new Set<string>();
				const processedJson = fixedJson;

				// 提取组件的辅助函数
				const extractComponent = (name: string, regex: RegExp) => {
					// 先从原始fixedJson中查找组件，避免processedJson已被修改
					const matches = Array.from(fixedJson.matchAll(regex));
					if (matches.length > 0) {
						// 只取最后一个匹配结果，避免重复提取
						const component = matches[matches.length - 1][0];
						components.push(component);
						extractedComponents.add(name);
						logger.debug(`成功提取${name}组件`);
						logger.debug(
							`${name}组件内容: ${component.substring(0, 100)}${
								component.length > 100 ? "..." : ""
							}`,
						);
					} else {
						logger.debug(`未找到${name}组件`);
					}
				};

				// 专门提取peakDrawdown组件的函数，支持从嵌套结构中提取
				const extractPeakDrawdown = () => {
					// 使用更强大的正则表达式，能够匹配嵌套在任何位置的peakDrawdown组件
					const peakDrawdownRegex =
						/"peakDrawdown"\s*:\s*\{[^}]*\{[^}]*\}[^}]*\}/g;
					const matches = Array.from(fixedJson.matchAll(peakDrawdownRegex));
					if (matches.length > 0) {
						const component = matches[matches.length - 1][0];
						components.push(component);
						extractedComponents.add("peakDrawdown");
						logger.debug("成功提取嵌套的peakDrawdown组件");
						logger.debug(
							`peakDrawdown组件内容: ${component.substring(0, 100)}${
								component.length > 100 ? "..." : ""
							}`,
						);
						return true;
					}
					return false;
				};

				// 按顺序提取组件，先尝试专门的peakDrawdown提取，然后提取其他组件
				if (!extractPeakDrawdown()) {
					// 如果专门的提取失败，使用常规提取
					extractComponent("peakDrawdown", componentRegexes.peakDrawdown);
				}
				extractComponent("dynamicStopLoss", componentRegexes.dynamicStopLoss);
				extractComponent(
					"partialTakeProfit",
					componentRegexes.partialTakeProfit,
				);

				// 如果成功提取了组件，重新构建JSON
				if (components.length > 0) {
					logger.debug(`开始重构JSON结构，共提取了${components.length}个组件`);

					// 提取顶层属性（非组件属性）
					const baseProps: any = {};
					try {
						// 尝试解析原始JSON，提取顶层属性
						const parsedJson = JSON.parse(fixedJson);

						// 提取非组件的顶层属性
						for (const [key, value] of Object.entries(parsedJson)) {
							if (
								![
									"partialTakeProfit",
									"dynamicStopLoss",
									"peakDrawdown",
								].includes(key)
							) {
								baseProps[key] = value;
							}
						}
						logger.debug(
							`成功解析并提取顶层属性: ${JSON.stringify(baseProps)}`,
						);
					} catch (e) {
						// 如果解析失败，尝试使用正则表达式提取基础属性
						logger.debug("JSON解析失败，尝试使用正则表达式提取基础属性");

						// 提取symbol
						const symbolMatch = fixedJson.match(/"symbol"\s*:\s*"([^"]+)"/);
						if (symbolMatch) {
							baseProps.symbol = symbolMatch[1];
						}

						// 提取strategyType
						const strategyTypeMatch = fixedJson.match(
							/"strategyType"\s*:\s*"([^"]+)"/,
						);
						if (strategyTypeMatch) {
							baseProps.strategyType = strategyTypeMatch[1];
						}

						// 提取enabled
						const enabledMatch = fixedJson.match(
							/"enabled"\s*:\s*(true|false)/,
						);
						if (enabledMatch) {
							baseProps.enabled = enabledMatch[1] === "true";
						}

						logger.debug(
							`使用正则表达式提取到基础属性: ${JSON.stringify(baseProps)}`,
						);
					}

					// 构建正确的JSON结构
					let correctedJson = "{";

					// 添加基础属性
					if (Object.keys(baseProps).length > 0) {
						correctedJson += JSON.stringify(baseProps).slice(1, -1);
						correctedJson += ",";
					}

					// 添加所有组件，按标准顺序排列：partialTakeProfit, dynamicStopLoss, peakDrawdown
					const componentOrder = [
						"partialTakeProfit",
						"dynamicStopLoss",
						"peakDrawdown",
					];
					const componentMap = new Map<string, string>();

					// 构建组件映射
					components.forEach((component) => {
						if (component.includes("partialTakeProfit")) {
							componentMap.set("partialTakeProfit", component);
						} else if (component.includes("dynamicStopLoss")) {
							componentMap.set("dynamicStopLoss", component);
						} else if (component.includes("peakDrawdown")) {
							componentMap.set("peakDrawdown", component);
						}
					});

					// 按顺序添加组件
					const orderedComponents = componentOrder
						.filter((name) => componentMap.has(name))
						.map((name) => componentMap.get(name)!);

					correctedJson += orderedComponents.join(",");

					// 关闭JSON对象
					correctedJson += "}";

					// 清理多余的逗号
					correctedJson = correctedJson.replace(/,\s*}/g, "}");
					correctedJson = correctedJson.replace(/,\s*,/g, ",");

					fixedJson = correctedJson;
					logger.debug(
						`修复了组件嵌套问题，提取了${components.length}个组件: ${Array.from(
							extractedComponents,
						).join(", ")}`,
					);
					logger.debug(
						`修复后的JSON: ${fixedJson.substring(0, 150)}${
							fixedJson.length > 150 ? "..." : ""
						}`,
					);
				}
			}

			// 修复13: 再次确保花括号匹配
			const openBraces = (fixedJson.match(/{/g) || []).length;
			let closeBraces = (fixedJson.match(/}/g) || []).length;
			if (openBraces > closeBraces) {
				fixedJson += "}".repeat(openBraces - closeBraces);
			} else if (closeBraces > openBraces) {
				// 移除多余的右花括号
				while (closeBraces > openBraces) {
					const lastCloseBraceIndex = fixedJson.lastIndexOf("}");
					if (lastCloseBraceIndex !== -1) {
						fixedJson =
							fixedJson.substring(0, lastCloseBraceIndex) +
							fixedJson.substring(lastCloseBraceIndex + 1);
						closeBraces--;
					} else {
						break;
					}
				}
			}

			// 尝试解析修复后的JSON
			JSON.parse(fixedJson);
			logger.debug(`手动修复JSON成功，修复后长度: ${fixedJson.length}字符`);
			return fixedJson;
		} catch (manualFixError) {
			logger.error(
				`手动修复JSON失败: ${
					manualFixError instanceof Error
						? manualFixError.message
						: String(manualFixError)
				}`,
				{
					originalJson:
						jsonString.substring(0, 100) +
						(jsonString.length > 100 ? "..." : ""),
					originalLength,
					error: manualFixError,
				},
			);
			throw manualFixError;
		}
	}

	// 默认返回原始字符串，虽然正常情况下不会执行到这里
	return jsonString;
}

/**
 * 从文本中提取工具调用
 * Extract tool call from text
 *
 * @param text 包含工具调用的文本 - Text containing tool call
 * @param toolCalls 工具调用数组，提取的工具调用将添加到这个数组中 - Array to add extracted tool calls to
 * @param processedToolCalls 用于跟踪已处理的工具调用，避免重复 - Set to track processed tool calls to avoid duplicates
 */
function extractToolCallFromText(
	text: string,
	toolCalls: ToolCall[],
	processedToolCalls: Set<string>,
): void {
	// 1. 先尝试匹配标准格式的工具调用块
	const toolCallBlocksRegex =
		/(-\s*工具：\s*\w+)([\s\S]*?)(?=(?:\n-\s*工具：|$))/gs;
	let toolCallBlockMatch;
	let hasStandardCalls = false;

	// 使用循环匹配所有标准格式的工具调用块
	while ((toolCallBlockMatch = toolCallBlocksRegex.exec(text)) !== null) {
		hasStandardCalls = true;
		const toolCallBlock = toolCallBlockMatch[0];

		// 匹配工具名称
		const toolNameRegex = /-\s*工具：\s*(\w+)/;
		const toolNameMatch = toolCallBlock.match(toolNameRegex);

		if (toolNameMatch) {
			const toolName = toolNameMatch[1].trim();

			// 提取参数
			let params: any = {};

			// 提取策略
			const strategyRegex = /-\s*策略：\s*(.+?)(?=(?:\n-\s*|$))/s;
			const strategyMatch = toolCallBlock.match(strategyRegex);
			if (strategyMatch) {
				params.strategy = strategyMatch[1].trim();
			}

			// 提取币种
			const symbolRegex = /-\s*币种：\s*(\w+)/;
			const symbolMatch = toolCallBlock.match(symbolRegex);
			if (symbolMatch) {
				params.symbol = symbolMatch[1].trim();
			}

			// 提取阈值
			const thresholdRegex = /-\s*阈值：\s*(\d+(?:\.\d+)?)%/;
			const thresholdMatch = toolCallBlock.match(thresholdRegex);
			if (thresholdMatch) {
				params.threshold = Number.parseFloat(thresholdMatch[1]);
			}

			// 提取评估间隔
			const intervalRegex = /-\s*评估间隔：\s*(\d+)\s*分钟/;
			const intervalMatch = toolCallBlock.match(intervalRegex);
			if (intervalMatch) {
				params.evaluationInterval = Number.parseInt(intervalMatch[1]);
			}

			// 提取触发条件
			// 改进：支持换行分割的触发条件，匹配从"触发条件："开始到下一个参数或结束的所有内容
			const conditionsRegex = /-\s*触发条件：\s*([\s\S]*?)(?=(?:\n-\s*|$))/s;
			const conditionsMatch = toolCallBlock.match(conditionsRegex);
			if (conditionsMatch) {
				let conditionsStr = conditionsMatch[1].trim();
				try {
					// 预处理：移除所有换行符和多余空格，确保JSON格式正确
					// 保留数组和对象结构的换行，只移除多余的空白
					conditionsStr = conditionsStr
						.replace(/\s+/g, " ") // 将多个空白字符替换为单个空格
						.trim();

					// 确保条件字符串以"["开头，以"]"结尾
					if (!conditionsStr.startsWith("[")) {
						conditionsStr = `[${conditionsStr}]`;
					}
					if (!conditionsStr.endsWith("]")) {
						conditionsStr = `${conditionsStr}]`;
					}

					// 尝试直接解析
					params.conditions = JSON.parse(conditionsStr);
				} catch (e) {
					try {
						// 修复条件字符串，添加引号
						const fixedConditionsStr = conditionsStr
							.replace(/([a-zA-Z_$][a-zA-Z0-9_$-]*)(\s*:)/g, '"$1"$2')
							.replace(/'([^']*?)'(\s*[:},\]])/g, '"$1"$2');
						params.conditions = JSON.parse(fixedConditionsStr);
					} catch (e2) {
						try {
							// 尝试使用 fixJsonFormat 函数修复
							const fixedConditionsStr = fixJsonFormat(conditionsStr);
							params.conditions = JSON.parse(fixedConditionsStr);
						} catch (fixError) {
							logger.error(`解析触发条件失败: ${fixError}`, { conditionsStr });
							// 如果解析失败，保存原始字符串
							params.conditions = conditionsStr;
						}
					}
				}
			}

			// 处理 addPosition 特殊参数
			if (toolName === "addPosition") {
				// 提取加仓金额
				const amountRegex = /-\s*加仓金额：\s*(\d+(?:\.\d+)?)\s*USDT/;
				const amountMatch = toolCallBlock.match(amountRegex);
				if (amountMatch) {
					params.addAmountUsdt = Number.parseFloat(amountMatch[1]);
				}

				// 提取原因
				const reasonRegex = /-\s*原因：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const reasonMatch = toolCallBlock.match(reasonRegex);
				if (reasonMatch) {
					params.reason = reasonMatch[1].trim();
				}

				// 策略已在通用参数中提取
			}

			// 处理 setPartialTakeProfitParams 特殊参数
			if (toolName === "setPartialTakeProfitParams") {
				// 提取第一阶段
				const stage1Regex = /-\s*第一阶段：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const stage1Match = toolCallBlock.match(stage1Regex);
				if (stage1Match) {
					const stage1Text = stage1Match[1].trim();
					// 解析触发条件和平仓比例
					const triggerRegex = /触发条件\s*\+([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const triggerMatch = stage1Text.match(triggerRegex);
					const closePercentMatch = stage1Text.match(closePercentRegex);
					params.stage1 = {
						trigger: triggerMatch ? Number.parseFloat(triggerMatch[1]) : 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}

				// 提取第二阶段
				const stage2Regex = /-\s*第二阶段：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const stage2Match = toolCallBlock.match(stage2Regex);
				if (stage2Match) {
					const stage2Text = stage2Match[1].trim();
					const triggerRegex = /触发条件\s*\+([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const triggerMatch = stage2Text.match(triggerRegex);
					const closePercentMatch = stage2Text.match(closePercentRegex);
					params.stage2 = {
						trigger: triggerMatch ? Number.parseFloat(triggerMatch[1]) : 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}

				// 提取第三阶段
				const stage3Regex = /-\s*第三阶段：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const stage3Match = toolCallBlock.match(stage3Regex);
				if (stage3Match) {
					const stage3Text = stage3Match[1].trim();
					const triggerRegex = /触发条件\s*\+([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const triggerMatch = stage3Text.match(triggerRegex);
					const closePercentMatch = stage3Text.match(closePercentRegex);
					params.stage3 = {
						trigger: triggerMatch ? Number.parseFloat(triggerMatch[1]) : 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}
			}
			// 处理 setPeakDrawdownParams 特殊参数
			else if (toolName === "setPeakDrawdownParams") {
				// 提取第一级
				const level1Regex = /-\s*第一级：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const level1Match = toolCallBlock.match(level1Regex);
				if (level1Match) {
					const level1Text = level1Match[1].trim();
					// 解析回落阈值和平仓比例
					const drawdownRegex = /回落([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const drawdownMatch = level1Text.match(drawdownRegex);
					const closePercentMatch = level1Text.match(closePercentRegex);
					params.level1 = {
						drawdownThreshold: drawdownMatch
							? Number.parseFloat(drawdownMatch[1])
							: 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}

				// 提取第二级
				const level2Regex = /-\s*第二级：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const level2Match = toolCallBlock.match(level2Regex);
				if (level2Match) {
					const level2Text = level2Match[1].trim();
					const drawdownRegex = /回落([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const drawdownMatch = level2Text.match(drawdownRegex);
					const closePercentMatch = level2Text.match(closePercentRegex);
					params.level2 = {
						drawdownThreshold: drawdownMatch
							? Number.parseFloat(drawdownMatch[1])
							: 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}

				// 提取第三级
				const level3Regex = /-\s*第三级：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const level3Match = toolCallBlock.match(level3Regex);
				if (level3Match) {
					const level3Text = level3Match[1].trim();
					const drawdownRegex = /回落([\d.]+)%/;
					const closePercentRegex = /平仓比例\s*([\d.]+)%/;
					const drawdownMatch = level3Text.match(drawdownRegex);
					const closePercentMatch = level3Text.match(closePercentRegex);
					params.level3 = {
						drawdownThreshold: drawdownMatch
							? Number.parseFloat(drawdownMatch[1])
							: 0,
						closePercent: closePercentMatch
							? Number.parseFloat(closePercentMatch[1])
							: 0,
					};
				}

				// 提取最小持仓时间
				const minHoldingTimeRegex = /-\s*最小持仓时间：\s*(\d+)\s*分钟/;
				const minHoldingTimeMatch = toolCallBlock.match(minHoldingTimeRegex);
				if (minHoldingTimeMatch) {
					params.minHoldingTime = Number.parseInt(minHoldingTimeMatch[1]);
				}
			}
			// 处理 setPositionExitStrategy 特殊参数
			else if (toolName === "setPositionExitStrategy") {
				// 提取币种
				const symbolRegex = /-\s*币种：\s*(\w+)/;
				const symbolMatch = toolCallBlock.match(symbolRegex);
				if (symbolMatch) {
					params.symbol = symbolMatch[1].trim();
				}

				// 提取策略
				const strategyRegex = /-\s*策略：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const strategyMatch = toolCallBlock.match(strategyRegex);
				if (strategyMatch && strategyMatch[1].trim()) {
					params.strategy = strategyMatch[1].trim();
				}

				// 提取策略类型
				const strategyTypeRegex = /-\s*策略类型：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const strategyTypeMatch = toolCallBlock.match(strategyTypeRegex);
				if (strategyTypeMatch && strategyTypeMatch[1].trim()) {
					params.strategyType = strategyTypeMatch[1].trim();
				}

				// 提取启用状态
				const enabledRegex = /-\s*启用状态：\s*(.+?)(?=(?:\n-\s*|$))/s;
				const enabledMatch = toolCallBlock.match(enabledRegex);
				if (enabledMatch && enabledMatch[1].trim()) {
					params.enabled = enabledMatch[1].trim().toLowerCase() === "启用";
				}

				// 提取分批止盈设置
				const partialTakeProfitRegex =
					/-\s*分批止盈设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
				const partialTakeProfitMatch = toolCallBlock.match(
					partialTakeProfitRegex,
				);
				if (
					partialTakeProfitMatch &&
					partialTakeProfitMatch[1].trim() !== "未配置"
				) {
					const partialTakeProfitText = partialTakeProfitMatch[1].trim();
					params.partialTakeProfit = {};

					// 提取第一阶段
					const stage1Regex =
						/-\s*第一阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const stage1Match = partialTakeProfitText.match(stage1Regex);
					if (stage1Match) {
						params.partialTakeProfit.stage1 = {
							trigger: Number.parseFloat(stage1Match[1]),
							closePercent: Number.parseFloat(stage1Match[2]),
						};
					}

					// 提取第二阶段
					const stage2Regex =
						/-\s*第二阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const stage2Match = partialTakeProfitText.match(stage2Regex);
					if (stage2Match) {
						params.partialTakeProfit.stage2 = {
							trigger: Number.parseFloat(stage2Match[1]),
							closePercent: Number.parseFloat(stage2Match[2]),
						};
					}

					// 提取第三阶段
					const stage3Regex =
						/-\s*第三阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const stage3Match = partialTakeProfitText.match(stage3Regex);
					if (stage3Match) {
						params.partialTakeProfit.stage3 = {
							trigger: Number.parseFloat(stage3Match[1]),
							closePercent: Number.parseFloat(stage3Match[2]),
						};
					}
				}

				// 提取峰值回落设置
				const peakDrawdownRegex =
					/-\s*峰值回落设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
				const peakDrawdownMatch = toolCallBlock.match(peakDrawdownRegex);
				if (peakDrawdownMatch && peakDrawdownMatch[1].trim() !== "未配置") {
					const peakDrawdownText = peakDrawdownMatch[1].trim();
					params.peakDrawdown = {};

					// 提取第一级
					const level1Regex =
						/-\s*第一级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const level1Match = peakDrawdownText.match(level1Regex);
					if (level1Match) {
						params.peakDrawdown.level1 = {
							drawdownThreshold: Number.parseFloat(level1Match[1]),
							closePercent: Number.parseFloat(level1Match[2]),
						};
					}

					// 提取第二级
					const level2Regex =
						/-\s*第二级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const level2Match = peakDrawdownText.match(level2Regex);
					if (level2Match) {
						params.peakDrawdown.level2 = {
							drawdownThreshold: Number.parseFloat(level2Match[1]),
							closePercent: Number.parseFloat(level2Match[2]),
						};
					}

					// 提取第三级
					const level3Regex =
						/-\s*第三级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
					const level3Match = peakDrawdownText.match(level3Regex);
					if (level3Match) {
						params.peakDrawdown.level3 = {
							drawdownThreshold: Number.parseFloat(level3Match[1]),
							closePercent: Number.parseFloat(level3Match[2]),
						};
					}

					// 提取最小持仓时间
					const minHoldingTimeRegex = /-\s*最小持仓时间：\s*(\d+)\s*分钟/;
					const minHoldingTimeMatch =
						peakDrawdownText.match(minHoldingTimeRegex);
					if (minHoldingTimeMatch) {
						params.peakDrawdown.minHoldingTime = Number.parseInt(
							minHoldingTimeMatch[1],
						);
					}
				}

				// 提取动态止损设置
				const dynamicStopLossRegex =
					/-\s*动态止损设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
				const dynamicStopLossMatch = toolCallBlock.match(dynamicStopLossRegex);
				if (
					dynamicStopLossMatch &&
					dynamicStopLossMatch[1].trim() !== "未配置"
				) {
					const dynamicStopLossText = dynamicStopLossMatch[1].trim();
					params.dynamicStopLoss = {};

					// 提取初始止损幅度
					const initialStopLossRegex = /-\s*初始止损幅度：\s*([\d.]+)%/;
					const initialStopLossMatch =
						dynamicStopLossText.match(initialStopLossRegex);
					if (initialStopLossMatch) {
						params.dynamicStopLoss.initialStopLoss = Number.parseFloat(
							initialStopLossMatch[1],
						);
					}

					// 提取移动止损配置
					const trailingStopLossRegex =
						/-\s*第一级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
					const trailingStopLossMatch = dynamicStopLossText.match(
						trailingStopLossRegex,
					);
					if (trailingStopLossMatch) {
						params.dynamicStopLoss.trailingStopLoss = {
							level1: {
								trigger: Number.parseFloat(trailingStopLossMatch[1]),
								stopAt: Number.parseFloat(trailingStopLossMatch[2]),
							},
						};
					}

					// 提取第二级移动止损
					const trailingStopLoss2Regex =
						/-\s*第二级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
					const trailingStopLoss2Match = dynamicStopLossText.match(
						trailingStopLoss2Regex,
					);
					if (trailingStopLoss2Match) {
						if (!params.dynamicStopLoss.trailingStopLoss) {
							params.dynamicStopLoss.trailingStopLoss = {};
						}
						params.dynamicStopLoss.trailingStopLoss.level2 = {
							trigger: Number.parseFloat(trailingStopLoss2Match[1]),
							stopAt: Number.parseFloat(trailingStopLoss2Match[2]),
						};
					}

					// 提取第三级移动止损
					const trailingStopLoss3Regex =
						/-\s*第三级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
					const trailingStopLoss3Match = dynamicStopLossText.match(
						trailingStopLoss3Regex,
					);
					if (trailingStopLoss3Match) {
						if (!params.dynamicStopLoss.trailingStopLoss) {
							params.dynamicStopLoss.trailingStopLoss = {};
						}
						params.dynamicStopLoss.trailingStopLoss.level3 = {
							trigger: Number.parseFloat(trailingStopLoss3Match[1]),
							stopAt: Number.parseFloat(trailingStopLoss3Match[2]),
						};
					}
				}
			}

			// 提取其他可能的参数
			// 匹配格式："- 参数名：参数值"
			const otherParamsRegex = /-\s*([^：]+?)：\s*([^\n]+?)(?=(?:\n-\s*|$))/gs;
			let otherParamMatch;
			while (
				(otherParamMatch = otherParamsRegex.exec(toolCallBlock)) !== null
			) {
				const paramName = otherParamMatch[1].trim();
				const paramValue = otherParamMatch[2].trim();

				// 跳过已经处理过的参数
				if (
					![
						"工具",
						"策略",
						"币种",
						"阈值",
						"评估间隔",
						"触发条件",
						"第一阶段",
						"第二阶段",
						"第三阶段",
						"第一级",
						"第二级",
						"第三级",
						"最小持仓时间",
					].includes(paramName)
				) {
					params[paramName] = paramValue;
				}
			}

			// 修复setPositionExitStrategy工具调用中的组件嵌套问题
			if (toolName === "setPositionExitStrategy") {
				params = fixComponentNesting(params);
			}

			// 检查是否已经存在相同的工具调用，避免重复添加
			const uniqueKey = `${toolName}_${JSON.stringify(params)}`;
			if (!processedToolCalls.has(uniqueKey)) {
				toolCalls.push({ name: toolName, parameters: params });
				processedToolCalls.add(uniqueKey);
			}
		}
	}

	// 2. 如果没有找到标准格式的工具调用，尝试从自然语言中提取setPositionExitStrategy调用
	// 🔧 修复：禁用自动生成默认参数的逻辑，避免覆盖 AI 的自定义参数
	// 原因：当 AI 已经调用了 setPositionExitStrategy 并设置了自定义参数时，
	// 这个逻辑会再次生成默认参数的调用，覆盖 AI 的设置
	if (false && !hasStandardCalls) {
		logger.debug("未找到标准格式工具调用，尝试从自然语言中提取");

		// 检查是否包含持仓管理或设置退出策略的关键词
		if (
			(text.includes("持仓管理决策") ||
				text.includes("退出策略") ||
				text.includes("设置完整的退出策略") ||
				text.includes("设置退出策略")) &&
			!text.includes("工具：")
		) {
			logger.debug(
				"检测到自然语言中的退出策略设置，尝试提取setPositionExitStrategy调用",
			);

			// 提取币种信息，支持多个币种
			const symbolRegex = /(BTC|ETH|BNB|DOGE|ADA|XRP|SOL|DOT|MATIC|AVAX)/gi;
			const symbolMatches = [...text.matchAll(symbolRegex)];

			if (symbolMatches.length > 0) {
				// 去重并转换为大写
				const uniqueSymbols = Array.from(
					new Set(symbolMatches.map((match) => match[0].toUpperCase())),
				);
				logger.debug(`从自然语言中提取到币种: ${uniqueSymbols.join(", ")}`);

				// 为每个币种生成一个工具调用
				for (const symbol of uniqueSymbols) {
					// 构建默认的setPositionExitStrategy参数
					const defaultParams = {
						symbol: symbol,
						strategyType: "combination",
						enabled: true,
						// 添加默认的分批止盈设置
						partialTakeProfit: {
							stage1: { trigger: 5, closePercent: 30 },
							stage2: { trigger: 10, closePercent: 40 },
							stage3: { trigger: 15, closePercent: 30 },
						},
						// 添加默认的动态止损设置
						dynamicStopLoss: {
							initialStopLoss: 2,
							trailingStopLoss: {
								level1: { trigger: 3, stopAt: 1 },
								level2: { trigger: 6, stopAt: 3 },
								level3: { trigger: 10, stopAt: 5 },
							},
						},
						// 添加默认的峰值回落设置
						peakDrawdown: {
							level1: { drawdownThreshold: 2, closePercent: 30 },
							level2: { drawdownThreshold: 4, closePercent: 40 },
							level3: { drawdownThreshold: 6, closePercent: 30 },
							minHoldingTime: 5,
						},
					};

					// 检查是否已经存在相同的工具调用，避免重复添加
					const uniqueKey = `setPositionExitStrategy_${JSON.stringify(
						defaultParams,
					)}`;
					if (!processedToolCalls.has(uniqueKey)) {
						toolCalls.push({
							name: "setPositionExitStrategy",
							parameters: defaultParams,
						});
						processedToolCalls.add(uniqueKey);
						logger.debug(
							`从自然语言中成功提取setPositionExitStrategy调用，币种: ${symbol}`,
						);
					}
				}
			}
		}
	}
}

/**
 * 解析工具调用标记
 * Parse tool call markers
 *
 * @param text 包含工具调用标记的文本 - Text containing tool call markers
 * @returns 工具调用数组 - Array of tool calls
 */
export function parseToolCalls(text: string): ToolCall[] {
	const toolCalls: ToolCall[] = [];

	// 用于跟踪已处理的工具调用，避免重复
	const processedToolCalls = new Set<string>();
	const processedBlockIndices = new Set<number>();
	const processedBlocks: string[] = [];

	logger.debug(`开始解析工具调用，输入文本长度: ${text.length}字符`);

	// 1. 预处理文本，确保不会被截断
	// 移除可能的控制字符和无效字符
	const cleanedText = text.replace(/[\u0000-\u001F]/g, "");

	// 2. 处理单个工具调用标签（没有外层包装）
	// 支持格式：<｜tool▁call▁begin｜>工具名<｜tool▁sep｜>参数JSON<｜tool▁call▁end｜>
	// 支持分隔符前后有空格的情况
	const standaloneSingleToolRegex =
		/<｜tool▁call▁begin｜>([\s\S]*?)<\s*｜tool▁sep｜\s*>([\s\S]*?)<｜tool▁call▁end｜>/gs;

	let standaloneSingleToolMatch;
	while (
		(standaloneSingleToolMatch =
			standaloneSingleToolRegex.exec(cleanedText)) !== null
	) {
		const blockStartIndex = standaloneSingleToolMatch.index;
		const toolName = standaloneSingleToolMatch[1].trim();
		const paramsJson = standaloneSingleToolMatch[2].trim();

		// 检查是否已经处理过这个块
		if (!processedBlockIndices.has(blockStartIndex)) {
			// 标记为已处理
			processedBlockIndices.add(blockStartIndex);
			processedBlocks.push(standaloneSingleToolMatch[0]);

			try {
				// 尝试直接解析JSON
				let parameters = JSON.parse(paramsJson);

				// 修复组件嵌套问题
				if (toolName === "setPositionExitStrategy") {
					parameters = fixComponentNesting(parameters);
				}

				logger.debug(`成功解析工具调用: ${toolName}`);

				// 生成唯一键，避免重复添加
				const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
				if (!processedToolCalls.has(uniqueKey)) {
					toolCalls.push({ name: toolName, parameters });
					processedToolCalls.add(uniqueKey);
				}
			} catch (error) {
				try {
					// 增强修复：检查并修复缺少右括号的问题
					let enhancedFixedJson = paramsJson;

					// 统计左括号和右括号的数量
					const openBraces = (enhancedFixedJson.match(/\{/g) || []).length;
					const closeBraces = (enhancedFixedJson.match(/\}/g) || []).length;

					// 如果左括号数量多于右括号数量，添加缺少的右括号
					if (openBraces > closeBraces) {
						enhancedFixedJson += "}".repeat(openBraces - closeBraces);
						logger.debug(
							`修复JSON格式：添加了${openBraces - closeBraces}个右括号`,
						);
					}

					// 使用修复后的JSON再次尝试解析
					let parameters = JSON.parse(enhancedFixedJson);

					// 修复组件嵌套问题
					if (toolName === "setPositionExitStrategy") {
						parameters = fixComponentNesting(parameters);
					}

					logger.debug(`修复后成功解析工具调用: ${toolName}`);

					// 生成唯一键，避免重复添加
					const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
					if (!processedToolCalls.has(uniqueKey)) {
						toolCalls.push({ name: toolName, parameters });
						processedToolCalls.add(uniqueKey);
					}
				} catch (fixError1) {
					try {
						// 如果增强修复失败，尝试使用原有的fixJsonFormat函数
						const fixedJson = fixJsonFormat(paramsJson);
						let parameters = JSON.parse(fixedJson);

						// 修复组件嵌套问题
						if (toolName === "setPositionExitStrategy") {
							parameters = fixComponentNesting(parameters);
						}

						logger.debug(
							`使用fixJsonFormat修复后成功解析工具调用: ${toolName}`,
						);

						// 生成唯一键，避免重复添加
						const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
						if (!processedToolCalls.has(uniqueKey)) {
							toolCalls.push({ name: toolName, parameters });
							processedToolCalls.add(uniqueKey);
						}
					} catch (fixError2) {
						logger.error(
							`解析工具调用参数失败: ${
								fixError2 instanceof Error
									? fixError2.message
									: String(fixError2)
							}`,
							{
								toolName,
								originalParams:
									paramsJson.substring(0, 100) +
									(paramsJson.length > 100 ? "..." : ""),
								error: fixError2,
							},
						);
						// 即使解析失败，也保存原始参数，避免数据丢失
						const parameters = {
							error: "解析失败",
							originalParams: paramsJson,
						};
						const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
						if (!processedToolCalls.has(uniqueKey)) {
							toolCalls.push({ name: toolName, parameters });
							processedToolCalls.add(uniqueKey);
						}
					}
				}
			}
		}
	}

	// 3. 处理带外层包装的工具调用块
	// 匹配工具调用的正则表达式
	// 使用 [\s\S]*? 确保匹配所有内容，包括换行符，避免截断
	const toolCallRegex =
		/<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;

	// 查找所有工具调用块
	let toolCallBlockMatch;
	while ((toolCallBlockMatch = toolCallRegex.exec(cleanedText)) !== null) {
		const blockStartIndex = toolCallBlockMatch.index;
		const toolCallBlock = toolCallBlockMatch[1];

		logger.debug(`找到工具调用块，长度: ${toolCallBlock.length}字符`);

		// 检查是否已经处理过这个块
		if (!processedBlockIndices.has(blockStartIndex)) {
			// 标记为已处理
			processedBlockIndices.add(blockStartIndex);
			processedBlocks.push(toolCallBlockMatch[0]);

			// 检查是否包含单个工具调用标记
			if (toolCallBlock.includes("<｜tool▁call▁begin｜>")) {
				// 包含单个工具调用标记，使用单个工具调用正则表达式
				// 支持工具调用前的标题：允许在tool▁call▁begin前有标题文本
				const singleToolRegex =
					/([\s\S]*?)<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁sep｜>([\s\S]*?)<｜tool▁call▁end｜>/gs;

				// 查找块内的单个工具调用
				let singleToolMatch;
				while (
					(singleToolMatch = singleToolRegex.exec(toolCallBlock)) !== null
				) {
					// singleToolMatch[1] 是标题文本（可能为空），这里忽略标题
					const toolName = singleToolMatch[2].trim();
					const paramsJson = singleToolMatch[3].trim();

					try {
						// 尝试直接解析JSON
						let parameters = JSON.parse(paramsJson);

						// 修复组件嵌套问题
						if (toolName === "setPositionExitStrategy") {
							parameters = fixComponentNesting(parameters);
						}

						logger.debug(`成功解析单个工具调用: ${toolName}`);

						// 生成唯一键，避免重复添加
						const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
						if (!processedToolCalls.has(uniqueKey)) {
							toolCalls.push({ name: toolName, parameters });
							processedToolCalls.add(uniqueKey);
						}
					} catch (error) {
						try {
							// 修复JSON格式后再尝试解析
							const fixedJson = fixJsonFormat(paramsJson);
							let parameters = JSON.parse(fixedJson);

							// 修复组件嵌套问题
							if (toolName === "setPositionExitStrategy") {
								parameters = fixComponentNesting(parameters);
							}

							logger.debug(`修复后成功解析单个工具调用: ${toolName}`);

							// 生成唯一键，避免重复添加
							const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
							if (!processedToolCalls.has(uniqueKey)) {
								toolCalls.push({ name: toolName, parameters });
								processedToolCalls.add(uniqueKey);
							}
						} catch (fixError) {
							logger.error(
								`解析工具调用参数失败: ${
									fixError instanceof Error
										? fixError.message
										: String(fixError)
								}`,
								{
									toolName,
									originalParams:
										paramsJson.substring(0, 100) +
										(paramsJson.length > 100 ? "..." : ""),
									error: fixError,
								},
							);
							// 即使解析失败，也保存原始参数，避免数据丢失
							const parameters = {
								error: "解析失败",
								originalParams: paramsJson,
							};
							const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
							if (!processedToolCalls.has(uniqueKey)) {
								toolCalls.push({ name: toolName, parameters });
								processedToolCalls.add(uniqueKey);
							}
						}
					}
				}
			} else {
				// 不包含单个工具调用标记，直接从文本中提取工具调用（针对格式化后的工具调用）
				logger.debug("从文本中提取工具调用");
				extractToolCallFromText(toolCallBlock, toolCalls, processedToolCalls);
			}
		}
	}

	// 4. 处理不带标签的工具调用
	// 检查是否有未处理的文本，可能包含直接的工具调用
	let remainingText = cleanedText;
	for (const block of processedBlocks) {
		// 替换整个工具调用块，包括标签
		remainingText = remainingText.replace(block, "");
	}

	// 尝试从剩余文本中提取工具调用
	if (remainingText.trim().length > 0) {
		logger.debug(
			`从剩余文本中提取工具调用，剩余文本长度: ${remainingText.length}字符`,
		);
		extractToolCallFromText(remainingText, toolCalls, processedToolCalls);
	}

	logger.debug(`工具调用解析完成，共找到 ${toolCalls.length} 个工具调用`);
	return toolCalls;
}

/**
 * 从文本中提取并执行工具调用
 * Extract and execute tool calls from text
 *
 * @param text 包含工具调用的文本 - Text containing tool calls
 * @param availableTools 可用工具映射 - Map of available tools
 * @returns 执行结果数组 - Array of execution results
 */
export async function executeToolCalls(
	text: string,
	availableTools: Map<string, any>,
): Promise<any[]> {
	const toolCalls = parseToolCalls(text);
	const results: any[] = [];

	for (const toolCall of toolCalls) {
		const tool = availableTools.get(toolCall.name);
		if (tool) {
			try {
				const result = await tool.execute(toolCall.parameters);
				results.push({
					toolName: toolCall.name,
					success: true,
					result,
				});
			} catch (error) {
				results.push({
					toolName: toolCall.name,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		} else {
			results.push({
				toolName: toolCall.name,
				success: false,
				error: `工具 ${toolCall.name} 不存在`,
			});
		}
	}

	return results;
}

/**
 * 检测终端宽度
 * Detect terminal width
 *
 * @returns 终端宽度，默认80列 - Terminal width, default 80 columns
 */
function getTerminalWidth(): number {
	try {
		// 使用process.stdout.columns获取终端宽度
		return process.stdout.columns || 80;
	} catch (error) {
		// 如果获取失败，返回默认值80
		return 80;
	}
}

/**
 * 计算字符串的显示宽度，考虑中文等宽字符
 * Calculate display width of string, considering wide characters like Chinese
 *
 * @param str 要计算宽度的字符串 - String to calculate width for
 * @returns 字符串的显示宽度 - Display width of the string
 */
function getStringDisplayWidth(str: string): number {
	let width = 0;
	for (const char of str) {
		// 中文字符、全角符号等宽字符宽度为2，ASCII字符宽度为1
		// Chinese characters, full-width symbols, etc. have width 2, ASCII characters have width 1
		width += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char) ? 2 : 1;
	}
	return width;
}

/**
 * 长行自动换行处理
 * Auto-wrap long lines
 *
 * @param line 原始行文本 - Original line text
 * @param maxWidth 最大宽度 - Maximum width
 * @returns 换行后的文本数组 - Array of wrapped lines
 */
function wrapLine(line: string, maxWidth: number): string[] {
	if (!line || maxWidth <= 0) {
		return [line];
	}

	const lines: string[] = [];
	let currentLine = "";
	let currentWidth = 0;

	for (const char of line) {
		const charWidth = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)
			? 2
			: 1;

		// 如果当前字符加上当前行宽度超过最大宽度，换行
		if (currentWidth + charWidth > maxWidth) {
			lines.push(currentLine);
			currentLine = char;
			currentWidth = charWidth;
		} else {
			currentLine += char;
			currentWidth += charWidth;
		}
	}

	// 添加最后一行，确保不会丢失数据
	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
}

/**
 * 美化工具调用显示格式
 * Format tool calls for better display
 *
 * @param text 包含工具调用的文本 - Text containing tool calls
 * @returns 美化后的文本 - Formatted text
 */
export function formatToolCallsDisplay(text: string): string {
	// 获取终端宽度，留10个字符的边距
	const terminalWidth = getTerminalWidth();
	const maxLineWidth = terminalWidth - 10;

	// 使用正则表达式匹配所有工具调用块
	const toolCallRegex =
		/<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;
	// 匹配单个工具调用标记
	const singleToolRegex =
		/<｜tool▁call▁begin｜>([\s\S]*?)<\s*｜tool▁sep｜\s*>([\s\S]*?)<｜tool▁call▁end｜>/gs;
	let finalResult = text;

	// 1. 处理带外层包装的工具调用块
	// 检查是否有工具调用块
	const hasToolCalls = toolCallRegex.test(text);

	if (hasToolCalls) {
		// 重置正则表达式的lastIndex，以便重新匹配
		toolCallRegex.lastIndex = 0;

		// 匹配所有工具调用块，并逐个处理
		let toolCallMatch;
		while ((toolCallMatch = toolCallRegex.exec(text)) !== null) {
			const entireBlock = toolCallMatch[0];

			// 解析当前工具调用块中的工具调用
			const blockToolCalls = parseToolCalls(entireBlock);

			// 生成美化后的工具调用文本
			let formattedToolCalls = "\n**执行参数设置：**\n";

			for (const toolCall of blockToolCalls) {
				let line = `- 工具：${toolCall.name}`;
				formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

				// 根据不同的工具类型，使用不同的格式化方式
				const params = toolCall.parameters;

				if (toolCall.name === "setPartialTakeProfitParams") {
					// 分批止盈参数格式化
					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 币种：${params.symbol || "N/A"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第一阶段：触发条件 +${
						params.stage1?.trigger || 0
					}%，平仓比例 ${params.stage1?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第二阶段：触发条件 +${
						params.stage2?.trigger || 0
					}%，平仓比例 ${params.stage2?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第三阶段：触发条件 +${
						params.stage3?.trigger || 0
					}%，平仓比例 ${params.stage3?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;
				} else if (toolCall.name === "setPeakDrawdownParams") {
					// 峰值回落参数格式化
					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 币种：${params.symbol || "N/A"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第一阶段：回撤阈值 ${
						params.level1?.drawdownThreshold || 0
					}%，平仓比例 ${params.level1?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第二阶段：回撤阈值 ${
						params.level2?.drawdownThreshold || 0
					}%，平仓比例 ${params.level2?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 第三阶段：回撤阈值 ${
						params.level3?.drawdownThreshold || 0
					}%，平仓比例 ${params.level3?.closePercent || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 最小持仓时间：${params.minHoldingTime || 0} 分钟`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;
				} else if (toolCall.name === "setDynamicStopLossParams") {
					// 动态止损参数格式化
					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 币种：${params.symbol || "N/A"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 阈值：${params.threshold || 0}%`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 评估间隔：${params.evaluationInterval || 0} 分钟`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					if (params.conditions && params.conditions.length > 0) {
						// 将触发条件转换为易读文本格式，过滤掉无效条件
						const conditionsStr = params.conditions
							.filter(
								(condition: any) =>
									condition &&
									typeof condition === "object" &&
									condition.type &&
									condition.value !== undefined,
							)
							.map((condition: any) => {
								// 将条件类型转换为中文描述
								const typeMap: Record<string, string> = {
									volatility: "波动率",
									trend: "趋势",
									volume: "成交量",
									price: "价格",
									rsi: "RSI",
									macd: "MACD",
									news: "新闻",
								};
								const typeName = typeMap[condition.type] || condition.type;
								return `${typeName}: ${condition.value}`;
							})
							.join(", ");

						line = `- 触发条件：${conditionsStr}`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}
				} else if (toolCall.name === "resetStrategyParams") {
					// 重置策略参数格式化
					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 币种：${params.symbol || "所有币种"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;
				} else if (toolCall.name === "setPositionExitStrategy") {
					// 显示策略基本信息
					line = `- 币种：${params.symbol || "N/A"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 策略类型：${params.strategyType || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 启用状态：${params.enabled ? "启用" : "禁用"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					// 显示策略说明
					line = `- 策略说明：统一管理退出策略（分批止盈 + 峰值回落 + 动态止损）`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					// 显示分批止盈参数
					if (params.partialTakeProfit) {
						line = `- 分批止盈设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第一阶段：触发条件 +${
							params.partialTakeProfit.stage1?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage1?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第二阶段：触发条件 +${
							params.partialTakeProfit.stage2?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage2?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第三阶段：触发条件 +${
							params.partialTakeProfit.stage3?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage3?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					} else {
						line = `- 分批止盈设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}

					// 显示峰值回落参数
					if (params.peakDrawdown) {
						line = `- 峰值回落设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第一级：回落${
							params.peakDrawdown.level1?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level1?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第二级：回落${
							params.peakDrawdown.level2?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level2?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第三级：回落${
							params.peakDrawdown.level3?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level3?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						if (params.peakDrawdown.minHoldingTime) {
							line = `  - 最小持仓时间：${params.peakDrawdown.minHoldingTime} 分钟`;
							formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
								"\n",
							)}\n`;
						}
					} else {
						line = `- 峰值回落设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}

					// 显示完整的动态止损参数
					if (params.dynamicStopLoss) {
						line = `- 动态止损设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 初始止损幅度：${
							params.dynamicStopLoss.initialStopLoss || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						// 显示移动止损配置
						if (params.dynamicStopLoss.trailingStopLoss) {
							const trailingStop = params.dynamicStopLoss.trailingStopLoss;

							if (trailingStop.level1) {
								line = `  - 第一级移动止损：盈利达到 +${trailingStop.level1.trigger}%时，止损移至 +${trailingStop.level1.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}

							if (trailingStop.level2) {
								line = `  - 第二级移动止损：盈利达到 +${trailingStop.level2.trigger}%时，止损移至 +${trailingStop.level2.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}

							if (trailingStop.level3) {
								line = `  - 第三级移动止损：盈利达到 +${trailingStop.level3.trigger}%时，止损移至 +${trailingStop.level3.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}
						}
					} else {
						line = `- 动态止损设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}
				} else if (
					toolCall.name === "getCurrentStrategyParams" ||
					toolCall.name === "getAgentStrategyParams"
				) {
					// 获取策略参数格式化
					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 币种：${params.symbol || "所有币种"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;
				} else {
					// 其他工具，显示基本参数
					for (const [key, value] of Object.entries(params)) {
						let valueStr: string;
						if (typeof value === "object" && value !== null) {
							// 对象类型参数，完整显示，不简化
							valueStr = JSON.stringify(value, null, 2)
								.replace(/^\s*/gm, "") // 移除每行前的空格
								.replace(/\n/g, "; "); // 将换行替换为分号
						} else {
							valueStr = String(value);
						}

						line = `- ${key}：${valueStr}`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}
				}
			}

			// 替换当前工具调用块，只保留美化后的文本
			finalResult = finalResult.replace(entireBlock, formattedToolCalls);
		}
	}

	// 2. 处理单个工具调用标记（没有外层包装）
	finalResult = finalResult.replace(
		singleToolRegex,
		(match, toolName, paramsJson) => {
			try {
				// 解析参数并生成美化文本
				let parameters = JSON.parse(paramsJson);
				if (toolName.trim() === "setPositionExitStrategy") {
					parameters = fixComponentNesting(parameters);
				}

				const toolCall = { name: toolName.trim(), parameters };

				// 生成美化后的工具调用文本
				let formattedToolCalls = "\n**执行参数设置：**\n";

				let line = `- 工具：${toolCall.name}`;
				formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

				const params = toolCall.parameters;

				// 只处理setPositionExitStrategy工具的美化，其他工具显示基本参数
				if (toolCall.name === "setPositionExitStrategy") {
					// 显示策略基本信息
					line = `- 币种：${params.symbol || "N/A"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 策略：${params.strategy || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 策略类型：${params.strategyType || "默认"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					line = `- 启用状态：${params.enabled ? "启用" : "禁用"}`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					// 显示策略说明
					line = `- 策略说明：统一管理退出策略（分批止盈 + 峰值回落 + 动态止损）`;
					formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

					// 显示分批止盈参数
					if (params.partialTakeProfit) {
						line = `- 分批止盈设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第一阶段：触发条件 +${
							params.partialTakeProfit.stage1?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage1?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第二阶段：触发条件 +${
							params.partialTakeProfit.stage2?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage2?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第三阶段：触发条件 +${
							params.partialTakeProfit.stage3?.trigger || 0
						}%，平仓比例 ${
							params.partialTakeProfit.stage3?.closePercent || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					} else {
						line = `- 分批止盈设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}

					// 显示峰值回落参数
					if (params.peakDrawdown) {
						line = `- 峰值回落设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第一级：回落${
							params.peakDrawdown.level1?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level1?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第二级：回落${
							params.peakDrawdown.level2?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level2?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 第三级：回落${
							params.peakDrawdown.level3?.drawdownThreshold || 0
						}%，平仓比例 ${params.peakDrawdown.level3?.closePercent || 0}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						if (params.peakDrawdown.minHoldingTime) {
							line = `  - 最小持仓时间：${params.peakDrawdown.minHoldingTime} 分钟`;
							formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
								"\n",
							)}\n`;
						}
					} else {
						line = `- 峰值回落设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}

					// 显示完整的动态止损参数
					if (params.dynamicStopLoss) {
						line = `- 动态止损设置：`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						line = `  - 初始止损幅度：${
							params.dynamicStopLoss.initialStopLoss || 0
						}%`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;

						// 显示移动止损配置
						if (params.dynamicStopLoss.trailingStopLoss) {
							const trailingStop = params.dynamicStopLoss.trailingStopLoss;

							if (trailingStop.level1) {
								line = `  - 第一级移动止损：盈利达到 +${trailingStop.level1.trigger}%时，止损移至 +${trailingStop.level1.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}

							if (trailingStop.level2) {
								line = `  - 第二级移动止损：盈利达到 +${trailingStop.level2.trigger}%时，止损移至 +${trailingStop.level2.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}

							if (trailingStop.level3) {
								line = `  - 第三级移动止损：盈利达到 +${trailingStop.level3.trigger}%时，止损移至 +${trailingStop.level3.stopAt}%`;
								formattedToolCalls +=
									wrapLine(line, maxLineWidth).join("\n") + "\n";
							}
						}
					} else {
						line = `- 动态止损设置：未配置`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}
				} else {
					// 其他工具，显示基本参数
					for (const [key, value] of Object.entries(params)) {
						let valueStr: string;
						if (typeof value === "object" && value !== null) {
							// 对象类型参数，完整显示，不简化
							valueStr = JSON.stringify(value, null, 2)
								.replace(/^\s*/gm, "") // 移除每行前的空格
								.replace(/\n/g, "; "); // 将换行替换为分号
						} else {
							valueStr = String(value);
						}

						line = `- ${key}：${valueStr}`;
						formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
							"\n",
						)}\n`;
					}
				}

				return formattedToolCalls;
			} catch (error) {
				// 如果解析失败，移除原始工具调用标记
				return "";
			}
		},
	);

	return finalResult;
}
