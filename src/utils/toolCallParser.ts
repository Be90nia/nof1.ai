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
      }
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
  // 使用 [\s\S]*? 确保匹配所有内容，包括换行符，避免截断
  const toolCallRegex =
    /<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;
  const singleToolRegex =
    /<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁sep｜>([\s\S]*?)<｜tool▁call▁end｜>/gs;

  // 查找所有工具调用块
  let toolCallBlockMatch;
  while ((toolCallBlockMatch = toolCallRegex.exec(text)) !== null) {
    const toolCallBlock = toolCallBlockMatch[1];

    // 查找块内的单个工具调用
    let singleToolMatch;
    while ((singleToolMatch = singleToolRegex.exec(toolCallBlock)) !== null) {
      const toolName = singleToolMatch[1].trim();
      const paramsJson = singleToolMatch[2].trim();

      try {
        // 尝试直接解析JSON
        const parameters = JSON.parse(paramsJson);
        toolCalls.push({ name: toolName, parameters });
      } catch (error) {
        try {
          // 修复JSON格式后再尝试解析
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
            }
          );
          // 即使解析失败，也保存原始参数，避免数据丢失
          toolCalls.push({
            name: toolName,
            parameters: { error: "解析失败", originalParams: paramsJson },
          });
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
  availableTools: Map<string, any>
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

  let processedText = text;

  // 检查并处理工具调用
  if (text.includes("<｜tool▁calls▁begin｜>")) {
    // 解析工具调用
    const toolCalls = parseToolCalls(text);
    if (toolCalls.length > 0) {
      // 生成美化后的工具调用文本
      let formattedToolCalls = "\n**执行参数设置：**\n";

      for (const toolCall of toolCalls) {
        let line = `- 工具：${toolCall.name}`;
        formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

        // 根据不同的工具类型，使用不同的格式化方式
        const params = toolCall.parameters;

        if (toolCall.name === "setPartialTakeProfitParams") {
          // 分批止盈参数格式化
          line = `- 策略：${params.strategy || "默认"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 币种：${params.symbol || "N/A"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第一阶段：触发条件 +${
            params.stage1?.trigger || 0
          }%，平仓比例 ${params.stage1?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第二阶段：触发条件 +${
            params.stage2?.trigger || 0
          }%，平仓比例 ${params.stage2?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第三阶段：触发条件 +${
            params.stage3?.trigger || 0
          }%，平仓比例 ${params.stage3?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";
        } else if (toolCall.name === "setPeakDrawdownParams") {
          // 峰值回落参数格式化
          line = `- 策略：${params.strategy || "默认"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 币种：${params.symbol || "N/A"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第一阶段：回撤阈值 ${
            params.level1?.drawdownThreshold || 0
          }%，平仓比例 ${params.level1?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第二阶段：回撤阈值 ${
            params.level2?.drawdownThreshold || 0
          }%，平仓比例 ${params.level2?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 第三阶段：回撤阈值 ${
            params.level3?.drawdownThreshold || 0
          }%，平仓比例 ${params.level3?.closePercent || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 最小持仓时间：${params.minHoldingTime || 0} 分钟`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";
        } else if (toolCall.name === "setDynamicStopLossParams") {
          // 动态止损参数格式化
          line = `- 策略：${params.strategy || "默认"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 币种：${params.symbol || "N/A"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 阈值：${params.threshold || 0}%`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 评估间隔：${params.evaluationInterval || 0} 分钟`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          if (params.conditions && params.conditions.length > 0) {
            line = `- 触发条件：${JSON.stringify(params.conditions).replace(
              /"/g,
              ""
            )}`;
            formattedToolCalls +=
              wrapLine(line, maxLineWidth).join("\n") + "\n";
          }
        } else if (toolCall.name === "resetStrategyParams") {
          // 重置策略参数格式化
          line = `- 策略：${params.strategy || "默认"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 币种：${params.symbol || "所有币种"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";
        } else if (
          toolCall.name === "getCurrentStrategyParams" ||
          toolCall.name === "getAgentStrategyParams"
        ) {
          // 获取策略参数格式化
          line = `- 策略：${params.strategy || "默认"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";

          line = `- 币种：${params.symbol || "所有币种"}`;
          formattedToolCalls += wrapLine(line, maxLineWidth).join("\n") + "\n";
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
            formattedToolCalls +=
              wrapLine(line, maxLineWidth).join("\n") + "\n";
          }
        }

        formattedToolCalls += "\n";
      }

      // 替换原始文本中的工具调用标记部分为美化后的工具调用，保留其他上下文信息
      // 使用正则表达式匹配工具调用块并替换，确保匹配所有内容
      const toolCallBlockRegex =
        /<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;
      processedText = processedText.replace(
        toolCallBlockRegex,
        formattedToolCalls
      );
    }
  }

  // 处理终端输出编号问题，确保冒号后的数据完整
  // 匹配类似 "Terminal#296-296 " 或 "Terminal#297-317 " 格式的文本
  // 简化处理逻辑，避免无限循环
  const terminalRegex = /(Terminal#\d+-\d+)\s*:\s*/g;

  // 先保存所有匹配结果
  const matches: RegExpExecArray[] = [];
  let match;
  while ((match = terminalRegex.exec(processedText)) !== null) {
    matches.push({ ...match });
  }

  if (matches.length > 0) {
    let result = "";
    let lastIndex = 0;

    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];

      // 添加匹配前的文本
      result += processedText.slice(lastIndex, currentMatch.index);

      // 添加终端ID和中文冒号
      result += `${currentMatch[1]}：`;

      // 获取当前匹配结束位置
      const currentEnd = currentMatch.index + currentMatch[0].length;

      // 查找下一个终端输出的位置或文本结束位置
      const nextEnd =
        i < matches.length - 1 ? matches[i + 1].index : processedText.length;

      // 提取当前终端输出的数据，确保完整
      const data = processedText.slice(currentEnd, nextEnd);

      // 添加完整的数据
      result += data;

      // 更新lastIndex
      lastIndex = nextEnd;
    }

    // 添加剩余文本
    result += processedText.slice(lastIndex);
    processedText = result;
  } else {
    // 如果没有匹配到终端输出，直接替换所有的英文冒号为中文冒号
    processedText = processedText.replace(/(Terminal#\d+-\d+)\s*:/g, "$1：");
  }

  // 对所有文本进行行包装处理，确保没有长文本截断
  const lines = processedText.split("\n");
  const wrappedLines: string[] = [];

  for (const line of lines) {
    wrappedLines.push(...wrapLine(line, maxLineWidth));
  }

  return wrappedLines.join("\n");
}
