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

/**
 * 修复常见的JSON格式错误
 * Fix common JSON format errors
 *
 * @param jsonString 可能有格式错误的JSON字符串 - JSON string with possible format errors
 * @returns 修复后的JSON字符串 - Fixed JSON string
 */
export function fixJsonFormat(jsonString: string): string {
	try {
		// 使用jsonrepair库修复JSON格式错误
		// Use jsonrepair library to fix JSON format errors
		const fixedJson = jsonrepair(jsonString);
		return fixedJson;
	} catch (error) {
		console.error(
			`使用jsonrepair修复JSON失败: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{
				originalJson: jsonString,
				error,
			},
		);
		throw error;
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

	// 匹配工具调用的正则表达式
	// Regular expression to match tool calls
	const toolCallRegex = /<｜tool▁calls▁begin｜>(.*?)<｜tool▁calls▁end｜>/gs;
	const singleToolRegex =
		/<｜tool▁call▁begin｜>(.*?)<｜tool▁sep｜>(.*?)<｜tool▁call▁end｜>/gs;

	// 查找所有工具调用块
	// Find all tool call blocks
	let toolCallBlockMatch;
	while ((toolCallBlockMatch = toolCallRegex.exec(text)) !== null) {
		const toolCallBlock = toolCallBlockMatch[1];

		// 查找块内的单个工具调用
		// Find individual tool calls within the block
		let singleToolMatch;
		while ((singleToolMatch = singleToolRegex.exec(toolCallBlock)) !== null) {
			const toolName = singleToolMatch[1].trim();
			const paramsJson = singleToolMatch[2].trim();

			try {
				// 尝试直接解析JSON
				// Try to parse JSON directly
				const parameters = JSON.parse(paramsJson);
				toolCalls.push({ name: toolName, parameters });
			} catch (error) {
				try {
					// 修复JSON格式后再尝试解析
					// Try parsing after fixing JSON format
					const fixedJson = fixJsonFormat(paramsJson);
					const parameters = JSON.parse(fixedJson);
					toolCalls.push({ name: toolName, parameters });
				} catch (fixError) {
					console.error(
						`解析工具调用参数失败: ${
							fixError instanceof Error ? fixError.message : String(fixError)
						}`,
						{
							toolName,
							originalParams: paramsJson,
							error: fixError,
						},
					);
				}
			}
		}
	}

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
