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

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  loadAllData();

  // 每3秒刷新账户和持仓数据，实时显示变化
  setInterval(async () => {
    await Promise.all([loadAccountData(), loadPositionsData()]);
    updateLastUpdateTime();
  }, 3000);

  // AI决策和交易历史每5分钟更新一次
  setInterval(async () => {
    await Promise.all([loadLogsData(), loadTradesData()]);
  }, 5 * 60 * 1000); // 5分钟 = 300000毫秒

  // 移动端优化：添加触摸滚动优化
  initMobileOptimizations();

  // 页面可见性API - 当页面不可见时暂停更新
  initVisibilityControl();
});

// 移动端优化
function initMobileOptimizations() {
  // 防止双击缩放（仅在非输入元素上）
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        // 不阻止输入框等元素的默认行为
        if (!event.target.matches("input, textarea, select")) {
          event.preventDefault();
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // 移动端滚动优化 - 让浏览器自己处理滚动
  // 移除了过度优化的代码，让面板可以正常滚动
}

// 页面可见性控制
let updateInterval = null;
function initVisibilityControl() {
  let hidden, visibilityChange;

  if (typeof document.hidden !== "undefined") {
    hidden = "hidden";
    visibilityChange = "visibilitychange";
  } else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden";
    visibilityChange = "msvisibilitychange";
  } else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden";
    visibilityChange = "webkitvisibilitychange";
  }

  if (typeof document[hidden] !== "undefined") {
    document.addEventListener(
      visibilityChange,
      () => {
        if (document[hidden]) {
          // 页面隐藏时，减少更新频率或暂停
          console.log("页面隐藏，暂停更新");
        } else {
          // 页面可见时，立即更新一次
          console.log("页面可见，恢复更新");
          loadAllData();
        }
      },
      false
    );
  }
}

// 加载所有数据
async function loadAllData() {
  await Promise.all([
    loadAccountData(),
    loadPositionsData(),
    loadLogsData(),
    loadTradesData(),
    loadSystemStatusData(),
  ]);
  updateLastUpdateTime();
}

// 获取终端宽度
function getTerminalWidth() {
  return (
    window.innerWidth ||
    document.documentElement.clientWidth ||
    document.body.clientWidth ||
    120
  );
}

// 换行处理
function wrapLine(line, maxWidth) {
  if (!line || line.length <= maxWidth) {
    return [line];
  }

  const lines = [];
  let currentLine = "";
  const words = line.split(" ");

  for (const word of words) {
    if ((currentLine + word).length <= maxWidth) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [line];
}

// 修复setPositionExitStrategy工具调用中的组件嵌套问题
function fixComponentNesting(parameters) {
  console.log("开始修复组件嵌套问题");
  console.log(`原始参数结构: ${JSON.stringify(parameters, null, 2)}`);

  // 创建新的参数对象
  const newParams = {
    symbol: parameters.symbol,
    strategyType: parameters.strategyType || "combination",
    enabled: parameters.enabled !== undefined ? parameters.enabled : true,
  };

  // 递归查找组件的辅助函数
  const findComponent = (obj, componentName) => {
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
  let partialTakeProfit = findComponent(parameters, "partialTakeProfit");
  if (partialTakeProfit) {
    // 清理可能存在的嵌套组件
    const cleanPartialTakeProfit = { ...partialTakeProfit };
    delete cleanPartialTakeProfit.dynamicStopLoss;
    delete cleanPartialTakeProfit.peakDrawdown;
    newParams.partialTakeProfit = cleanPartialTakeProfit;
    console.log(`成功提取partialTakeProfit组件`);
  }

  // 提取dynamicStopLoss组件，支持从任何位置递归提取
  let dynamicStopLoss = findComponent(parameters, "dynamicStopLoss");
  if (dynamicStopLoss) {
    // 清理可能存在的嵌套组件
    const cleanDynamicStopLoss = { ...dynamicStopLoss };
    delete cleanDynamicStopLoss.partialTakeProfit;
    delete cleanDynamicStopLoss.peakDrawdown;
    newParams.dynamicStopLoss = cleanDynamicStopLoss;
    console.log(`成功提取dynamicStopLoss组件`);
  }

  // 提取peakDrawdown组件，支持从任何位置递归提取
  let peakDrawdown = findComponent(parameters, "peakDrawdown");
  if (peakDrawdown) {
    // 清理可能存在的嵌套组件
    const cleanPeakDrawdown = { ...peakDrawdown };
    delete cleanPeakDrawdown.partialTakeProfit;
    delete cleanPeakDrawdown.dynamicStopLoss;
    newParams.peakDrawdown = cleanPeakDrawdown;
    console.log(`成功提取peakDrawdown组件`);
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
      console.log(`添加顶层属性: ${key} = ${JSON.stringify(value)}`);
    }
  }

  console.log(`修复后的参数结构: ${JSON.stringify(newParams, null, 2)}`);
  return newParams;
}

// 修复常见的JSON格式错误
function fixJsonFormat(jsonString) {
  try {
    // 先尝试直接解析
    JSON.parse(jsonString);
    return jsonString;
  } catch (error) {
    // 预处理：移除可能的注释
    let fixedJson = jsonString
      .replace(/\/\*[\s\S]*?\*\//g, "") // 多行注释
      .replace(/\/\/.*$/gm, ""); // 单行注释

    // 修复1: 处理无引号的属性名
    fixedJson = fixedJson.replace(
      /([a-zA-Z_$][a-zA-Z0-9_$-]*)(\s*:)/g,
      '"$1"$2'
    );

    // 修复2: 处理单引号为双引号
    fixedJson = fixedJson.replace(/'([^']*?)'(\s*[:},\]])/g, '"$1"$2');

    // 修复3: 处理尾部逗号
    fixedJson = fixedJson.replace(/,\s*([}\[\]])/g, "$1");

    // 修复4: 处理数字属性名
    fixedJson = fixedJson.replace(/([0-9]+)(\s*:)/g, '"$1"$2');

    // 修复5: 处理布尔值和null，确保它们是小写的
    fixedJson = fixedJson
      .replace(/\bTRUE\b/g, "true")
      .replace(/\bFALSE\b/g, "false")
      .replace(/\bNULL\b/g, "null");

    // 修复6: 处理JSON字符串中的换行符和制表符
    fixedJson = fixedJson.replace(/"([^"]*?)"/g, (match) => {
      return match
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\r/g, "\\r");
    });

    // 修复7: 处理缺少引号的字符串值
    fixedJson = fixedJson.replace(
      /"([^"]*?)"\s*:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*[,}\[\]])/g,
      '"$1": "$2"$3'
    );

    // 修复8: 处理多余的空格
    fixedJson = fixedJson.replace(/([{}[\],:])(\s+)/g, "$1");
    fixedJson = fixedJson.replace(/(\s+)([{}[\],:])/g, "$2");
    fixedJson = fixedJson.trim();

    // 修复9: 确保JSON字符串以{或[开头，并以相应的}或]结尾
    if (!fixedJson.startsWith("{") && !fixedJson.startsWith("[")) {
      const startIndex = Math.min(
        fixedJson.indexOf("{") >= 0 ? fixedJson.indexOf("{") : Infinity,
        fixedJson.indexOf("[") >= 0 ? fixedJson.indexOf("[") : Infinity
      );
      if (startIndex !== Infinity) {
        fixedJson = fixedJson.substring(startIndex);
      }
    }

    // 修复10: 确保JSON字符串正确结束
    if (fixedJson.startsWith("{") && !fixedJson.endsWith("}")) {
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closeBraces = (fixedJson.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixedJson += "}".repeat(openBraces - closeBraces);
      }
    } else if (fixedJson.startsWith("[") && !fixedJson.endsWith("]")) {
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        fixedJson += "]".repeat(openBrackets - closeBrackets);
      }
    }

    // 修复11: 处理setPositionExitStrategy工具调用的特殊结构问题
    // 检测并修复组件被错误嵌套的情况
    if (
      fixedJson.includes("partialTakeProfit") ||
      fixedJson.includes("dynamicStopLoss") ||
      fixedJson.includes("peakDrawdown")
    ) {
      console.log(
        "检测到setPositionExitStrategy工具调用，开始处理组件嵌套问题"
      );

      // 提取所有组件的正则表达式 - 支持从任何位置提取组件，包括嵌套结构
      const componentRegexes = {
        partialTakeProfit:
          /"partialTakeProfit"\s*:\s*\{([^{}]*)|\{[^{}]*\}\}\}/g,
        dynamicStopLoss: /"dynamicStopLoss"\s*:\s*\{([^{}]*)|\{[^{}]*\}\}\}/g,
        peakDrawdown: /"peakDrawdown"\s*:\s*\{([^{}]*)|\{[^{}]*\}\}\}/g,
      };

      // 提取各个组件
      const components = [];
      const extractedComponents = new Set();

      // 提取组件的辅助函数
      const extractComponent = (name, regex) => {
        const matches = Array.from(fixedJson.matchAll(regex));
        if (matches.length > 0) {
          // 只取最后一个匹配结果，避免重复提取
          const component = matches[matches.length - 1][0];
          components.push(component);
          extractedComponents.add(name);
          console.log(`成功提取${name}组件`);
        }
      };

      // 按顺序提取组件
      extractComponent("peakDrawdown", componentRegexes.peakDrawdown);
      extractComponent("dynamicStopLoss", componentRegexes.dynamicStopLoss);
      extractComponent("partialTakeProfit", componentRegexes.partialTakeProfit);

      // 如果成功提取了组件，重新构建JSON
      if (components.length > 0) {
        console.log(`开始重构JSON结构，共提取了${components.length}个组件`);

        // 提取顶层属性（非组件属性）
        let baseProps = {};
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
          console.log(`成功解析并提取顶层属性: ${JSON.stringify(baseProps)}`);
        } catch (e) {
          // 如果解析失败，尝试使用正则表达式提取基础属性
          console.log("JSON解析失败，尝试使用正则表达式提取基础属性");

          // 提取symbol
          const symbolMatch = fixedJson.match(/"symbol"\s*:\s*"([^"]+)"/);
          if (symbolMatch) {
            baseProps.symbol = symbolMatch[1];
          }

          // 提取strategyType
          const strategyTypeMatch = fixedJson.match(
            /"strategyType"\s*:\s*"([^"]+)"/
          );
          if (strategyTypeMatch) {
            baseProps.strategyType = strategyTypeMatch[1];
          }

          // 提取enabled
          const enabledMatch = fixedJson.match(/"enabled"\s*:\s*(true|false)/);
          if (enabledMatch) {
            baseProps.enabled = enabledMatch[1] === "true";
          }

          console.log(
            `使用正则表达式提取到基础属性: ${JSON.stringify(baseProps)}`
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
        const componentMap = new Map();

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
          .map((name) => componentMap.get(name));

        correctedJson += orderedComponents.join(",");

        // 关闭JSON对象
        correctedJson += "}";

        // 清理多余的逗号
        correctedJson = correctedJson.replace(/,\s*}/g, "}");
        correctedJson = correctedJson.replace(/,\s*,/g, ",");

        fixedJson = correctedJson;
        console.log(
          `修复了组件嵌套问题，提取了${components.length}个组件: ${Array.from(
            extractedComponents
          ).join(", ")}`
        );
        console.log(
          `修复后的JSON: ${fixedJson.substring(0, 150)}${
            fixedJson.length > 150 ? "..." : ""
          }`
        );
      }
    }

    return fixedJson;
  }
}

// 从文本中提取工具调用（处理已格式化的中文文本）
function extractToolCallFromText(text, toolCalls, processedToolCalls) {
  // 匹配标准格式的工具调用块：- 工具：xxx
  const toolCallBlocksRegex = /(-\s*工具：\s*\w+)([\s\S]*?)(?=(?:\n-\s*工具：|$))/gs;
  let toolCallBlockMatch;

  while ((toolCallBlockMatch = toolCallBlocksRegex.exec(text)) !== null) {
    const toolCallBlock = toolCallBlockMatch[0];

    // 匹配工具名称
    const toolNameRegex = /-\s*工具：\s*(\w+)/;
    const toolNameMatch = toolCallBlock.match(toolNameRegex);

    if (toolNameMatch) {
      const toolName = toolNameMatch[1].trim();
      let params = {};

      // 提取币种
      const symbolRegex = /-\s*币种：\s*(\w+)/;
      const symbolMatch = toolCallBlock.match(symbolRegex);
      if (symbolMatch && symbolMatch[1].trim()) {
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

      // 处理 setPositionExitStrategy 特殊参数
      if (toolName === "setPositionExitStrategy") {
        // 提取分批止盈设置
        const partialTakeProfitRegex = /-\s*分批止盈设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
        const partialTakeProfitMatch = toolCallBlock.match(partialTakeProfitRegex);
        if (partialTakeProfitMatch && partialTakeProfitMatch[1].trim() !== "未配置") {
          const partialTakeProfitText = partialTakeProfitMatch[1].trim();
          params.partialTakeProfit = {};

          // 提取三个阶段
          const stage1Regex = /-\s*第一阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const stage1Match = partialTakeProfitText.match(stage1Regex);
          if (stage1Match) {
            params.partialTakeProfit.stage1 = {
              trigger: parseFloat(stage1Match[1]),
              closePercent: parseFloat(stage1Match[2])
            };
          }

          const stage2Regex = /-\s*第二阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const stage2Match = partialTakeProfitText.match(stage2Regex);
          if (stage2Match) {
            params.partialTakeProfit.stage2 = {
              trigger: parseFloat(stage2Match[1]),
              closePercent: parseFloat(stage2Match[2])
            };
          }

          const stage3Regex = /-\s*第三阶段：\s*触发条件 \+([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const stage3Match = partialTakeProfitText.match(stage3Regex);
          if (stage3Match) {
            params.partialTakeProfit.stage3 = {
              trigger: parseFloat(stage3Match[1]),
              closePercent: parseFloat(stage3Match[2])
            };
          }
        }

        // 提取峰值回落设置
        const peakDrawdownRegex = /-\s*峰值回落设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
        const peakDrawdownMatch = toolCallBlock.match(peakDrawdownRegex);
        if (peakDrawdownMatch && peakDrawdownMatch[1].trim() !== "未配置") {
          const peakDrawdownText = peakDrawdownMatch[1].trim();
          params.peakDrawdown = {};

          const level1Regex = /-\s*第一级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const level1Match = peakDrawdownText.match(level1Regex);
          if (level1Match) {
            params.peakDrawdown.level1 = {
              drawdownThreshold: parseFloat(level1Match[1]),
              closePercent: parseFloat(level1Match[2])
            };
          }

          const level2Regex = /-\s*第二级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const level2Match = peakDrawdownText.match(level2Regex);
          if (level2Match) {
            params.peakDrawdown.level2 = {
              drawdownThreshold: parseFloat(level2Match[1]),
              closePercent: parseFloat(level2Match[2])
            };
          }

          const level3Regex = /-\s*第三级：\s*回落([\d.]+)%，平仓比例\s*([\d.]+)%/;
          const level3Match = peakDrawdownText.match(level3Regex);
          if (level3Match) {
            params.peakDrawdown.level3 = {
              drawdownThreshold: parseFloat(level3Match[1]),
              closePercent: parseFloat(level3Match[2])
            };
          }

          const minHoldingTimeRegex = /-\s*最小持仓时间：\s*(\d+)\s*分钟/;
          const minHoldingTimeMatch = peakDrawdownText.match(minHoldingTimeRegex);
          if (minHoldingTimeMatch) {
            params.peakDrawdown.minHoldingTime = parseInt(minHoldingTimeMatch[1]);
          }
        }

        // 提取动态止损设置
        const dynamicStopLossRegex = /-\s*动态止损设置：([\s\S]*?)(?=(?:\n-\s*[^ ]|$))/s;
        const dynamicStopLossMatch = toolCallBlock.match(dynamicStopLossRegex);
        if (dynamicStopLossMatch && dynamicStopLossMatch[1].trim() !== "未配置") {
          const dynamicStopLossText = dynamicStopLossMatch[1].trim();
          params.dynamicStopLoss = {};

          const initialStopLossRegex = /-\s*初始止损幅度：\s*([\d.]+)%/;
          const initialStopLossMatch = dynamicStopLossText.match(initialStopLossRegex);
          if (initialStopLossMatch) {
            params.dynamicStopLoss.initialStopLoss = parseFloat(initialStopLossMatch[1]);
          }

          // 提取移动止损配置
          params.dynamicStopLoss.trailingStopLoss = {};

          const level1Regex = /-\s*第一级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
          const level1Match = dynamicStopLossText.match(level1Regex);
          if (level1Match) {
            params.dynamicStopLoss.trailingStopLoss.level1 = {
              trigger: parseFloat(level1Match[1]),
              stopAt: parseFloat(level1Match[2])
            };
          }

          const level2Regex = /-\s*第二级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
          const level2Match = dynamicStopLossText.match(level2Regex);
          if (level2Match) {
            params.dynamicStopLoss.trailingStopLoss.level2 = {
              trigger: parseFloat(level2Match[1]),
              stopAt: parseFloat(level2Match[2])
            };
          }

          const level3Regex = /-\s*第三级移动止损：\s*盈利达到 \+([\d.]+)%时，止损移至 \+([\d.]+)%/;
          const level3Match = dynamicStopLossText.match(level3Regex);
          if (level3Match) {
            params.dynamicStopLoss.trailingStopLoss.level3 = {
              trigger: parseFloat(level3Match[1]),
              stopAt: parseFloat(level3Match[2])
            };
          }
        }

        // 修复组件嵌套问题
        params = fixComponentNesting(params);
      }

      // 检查是否已经存在相同的工具调用
      const uniqueKey = `${toolName}_${JSON.stringify(params)}`;
      if (!processedToolCalls.has(uniqueKey)) {
        toolCalls.push({ name: toolName, parameters: params });
        processedToolCalls.add(uniqueKey);
      }
    }
  }
}

// 解析工具调用
function parseToolCalls(text) {
  const toolCalls = [];
  const processedToolCalls = new Set();
  const processedBlockIndices = new Set();
  const processedBlocks = [];
  const cleanedText = text.replace(/[\u0000-\u001F]/g, "");

  // 1. 处理单个工具调用标签（没有外层包装）
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

    if (!processedBlockIndices.has(blockStartIndex)) {
      processedBlockIndices.add(blockStartIndex);
      processedBlocks.push(standaloneSingleToolMatch[0]);

      try {
        let parameters = JSON.parse(paramsJson);
        if (toolName === "setPositionExitStrategy") {
          parameters = fixComponentNesting(parameters);
        }
        const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
        if (!processedToolCalls.has(uniqueKey)) {
          toolCalls.push({ name: toolName, parameters });
          processedToolCalls.add(uniqueKey);
        }
      } catch (error) {
        console.error("解析工具调用参数失败:", error);
        // 即使解析失败，也保存原始参数
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

  // 2. 处理带外层包装的工具调用块
  const toolCallBlockRegex =
    /<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;
  let toolCallBlockMatch;

  while ((toolCallBlockMatch = toolCallBlockRegex.exec(cleanedText)) !== null) {
    const blockStartIndex = toolCallBlockMatch.index;
    const toolCallBlock = toolCallBlockMatch[1];

    if (!processedBlockIndices.has(blockStartIndex)) {
      processedBlockIndices.add(blockStartIndex);
      processedBlocks.push(toolCallBlockMatch[0]);

      if (toolCallBlock.includes("<｜tool▁call▁begin｜>")) {
        const singleToolRegex =
          /([\s\S]*?)<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁sep｜>([\s\S]*?)<｜tool▁call▁end｜>/gs;

        let singleToolMatch;
        while (
          (singleToolMatch = singleToolRegex.exec(toolCallBlock)) !== null
        ) {
          const toolName = singleToolMatch[2].trim();
          const paramsJson = singleToolMatch[3].trim();

          try {
            let parameters = JSON.parse(paramsJson);
            if (toolName === "setPositionExitStrategy") {
              parameters = fixComponentNesting(parameters);
            }
            const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
            if (!processedToolCalls.has(uniqueKey)) {
              toolCalls.push({ name: toolName, parameters });
              processedToolCalls.add(uniqueKey);
            }
          } catch (error) {
            console.error("解析工具调用参数失败:", error);
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

  // 3. 处理剩余的单个工具调用（没有外层包装） - 匹配格式：<｜tool▁call▁begin｜>工具名｜tool▁sep｜参数｜tool▁call▁end｜>
  const remainingSingleToolRegex =
    /<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁sep｜>([\s\S]*?)<｜tool▁call▁end｜>/gs;
  let remainingSingleToolMatch;

  while (
    (remainingSingleToolMatch = remainingSingleToolRegex.exec(cleanedText)) !==
    null
  ) {
    const blockStartIndex = remainingSingleToolMatch.index;
    const toolName = remainingSingleToolMatch[1].trim();
    const paramsJson = remainingSingleToolMatch[2].trim();

    if (!processedBlockIndices.has(blockStartIndex)) {
      processedBlockIndices.add(blockStartIndex);
      processedBlocks.push(remainingSingleToolMatch[0]);

      try {
        let parameters = JSON.parse(paramsJson);
        if (toolName === "setPositionExitStrategy") {
          parameters = fixComponentNesting(parameters);
        }
        const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
        if (!processedToolCalls.has(uniqueKey)) {
          toolCalls.push({ name: toolName, parameters });
          processedToolCalls.add(uniqueKey);
        }
      } catch (error) {
        try {
          // 增强修复：检查并修复缺少右括号的问题
          let enhancedFixedJson = paramsJson;
          const openBraces = (enhancedFixedJson.match(/{/g) || []).length;
          const closeBraces = (enhancedFixedJson.match(/}/g) || []).length;
          if (openBraces > closeBraces) {
            enhancedFixedJson += "}".repeat(openBraces - closeBraces);
          }
          let parameters = JSON.parse(enhancedFixedJson);
          if (toolName === "setPositionExitStrategy") {
            parameters = fixComponentNesting(parameters);
          }
          const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
          if (!processedToolCalls.has(uniqueKey)) {
            toolCalls.push({ name: toolName, parameters });
            processedToolCalls.add(uniqueKey);
          }
        } catch (fixError1) {
          try {
            const fixedJson = fixJsonFormat(paramsJson);
            let parameters = JSON.parse(fixedJson);
            if (toolName === "setPositionExitStrategy") {
              parameters = fixComponentNesting(parameters);
            }
            const uniqueKey = `${toolName}_${JSON.stringify(parameters)}`;
            if (!processedToolCalls.has(uniqueKey)) {
              toolCalls.push({ name: toolName, parameters });
              processedToolCalls.add(uniqueKey);
            }
          } catch (fixError2) {
            // 如果修复失败，保存原始参数
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

  // 4. 如果没有找到标准格式的工具调用，尝试从自然语言中提取setPositionExitStrategy调用
  // 🔧 修复：禁用自动生成默认参数的逻辑，避免在前端显示错误的参数
  // 原因：与后端保持一致，不再自动生成默认参数，只显示 AI 实际调用的工具
  if (false && toolCalls.length === 0) {
    console.log("未找到标准格式工具调用，尝试从自然语言中提取");

    // 检查是否包含持仓管理或设置退出策略的关键词
    if (
      (cleanedText.includes("持仓管理决策") ||
        cleanedText.includes("退出策略") ||
        cleanedText.includes("设置完整的退出策略") ||
        cleanedText.includes("设置退出策略")) &&
      !cleanedText.includes("工具：")
    ) {
      console.log(
        "检测到自然语言中的退出策略设置，尝试提取setPositionExitStrategy调用"
      );

      // 提取币种信息，支持多个币种
      const symbolRegex = /(BTC|ETH|BNB|DOGE|ADA|XRP|SOL|DOT|MATIC|AVAX)/gi;
      const symbolMatches = [...cleanedText.matchAll(symbolRegex)];

      if (symbolMatches.length > 0) {
        // 去重并转换为大写
        const uniqueSymbols = Array.from(
          new Set(symbolMatches.map((match) => match[0].toUpperCase()))
        );
        console.log(`从自然语言中提取到币种: ${uniqueSymbols.join(", ")}`);

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
            defaultParams
          )}`;
          if (!processedToolCalls.has(uniqueKey)) {
            toolCalls.push({
              name: "setPositionExitStrategy",
              parameters: defaultParams,
            });
            processedToolCalls.add(uniqueKey);
            console.log(
              `从自然语言中成功提取setPositionExitStrategy调用，币种: ${symbol}`
            );
          }
        }
      }
    }
  }

  // 4. 处理不带标签的工具调用
  // 检查是否有未处理的文本，可能包含直接的工具调用
  let remainingText = cleanedText;
  for (const block of processedBlocks) {
    remainingText = remainingText.replace(block, "");
  }

  // 尝试从剩余文本中提取工具调用
  if (remainingText.trim().length > 0) {
    console.log(`从剩余文本中提取工具调用，剩余文本长度: ${remainingText.length}字符`);
    extractToolCallFromText(remainingText, toolCalls, processedToolCalls);
  }

  console.log(`工具调用解析完成，共找到 ${toolCalls.length} 个工具调用`);
  return toolCalls;
}

// 格式化工具调用显示
function formatToolCallsDisplay(decision) {
  if (!decision || typeof decision !== "string") {
    return decision;
  }

  let finalResult = decision;

  // 获取终端宽度，留10个字符的边距
  const terminalWidth = getTerminalWidth();
  const maxLineWidth = terminalWidth - 10;

  // 使用正则表达式匹配所有工具调用块
  const toolCallRegex =
    /<｜tool▁calls▁begin｜>([\s\S]*?)<｜tool▁calls▁end｜>/gs;
  // 匹配单个工具调用标记
  const singleToolRegex =
    /<｜tool▁call▁begin｜>([\s\S]*?)<｜tool▁sep｜>([\s\S]*?)<｜tool▁call▁end｜>/gs;

  // 1. 处理带外层包装的工具调用块
  // 检查是否有工具调用块
  const hasToolCalls = toolCallRegex.test(decision);

  if (hasToolCalls) {
    // 重置正则表达式的lastIndex，以便重新匹配
    toolCallRegex.lastIndex = 0;

    // 匹配所有工具调用块，并逐个处理
    let toolCallMatch;
    while ((toolCallMatch = toolCallRegex.exec(decision)) !== null) {
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
                (condition) =>
                  condition &&
                  typeof condition === "object" &&
                  condition.type &&
                  condition.value !== undefined
              )
              .map((condition) => {
                // 将条件类型转换为中文描述
                const typeMap = {
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
              "\n"
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

          line = `- 策略说明：统一管理退出策略（分批止盈 + 峰值回落 + 动态止损）`;
          formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

          // 显示分批止盈参数
          if (params.partialTakeProfit) {
            line = `- 分批止盈设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第一阶段：触发条件 +${
              params.partialTakeProfit.stage1?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage1?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第二阶段：触发条件 +${
              params.partialTakeProfit.stage2?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage2?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第三阶段：触发条件 +${
              params.partialTakeProfit.stage3?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage3?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          } else {
            line = `- 分批止盈设置：未配置`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          }

          // 显示峰值回落参数
          if (params.peakDrawdown) {
            line = `- 峰值回落设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第一级：回落${
              params.peakDrawdown.level1?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level1?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第二级：回落${
              params.peakDrawdown.level2?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level2?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第三级：回落${
              params.peakDrawdown.level3?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level3?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            if (params.peakDrawdown.minHoldingTime) {
              line = `  - 最小持仓时间：${params.peakDrawdown.minHoldingTime} 分钟`;
              formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
                "\n"
              )}\n`;
            }
          } else {
            line = `- 峰值回落设置：未配置`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          }

          // 显示完整的动态止损参数
          if (params.dynamicStopLoss) {
            line = `- 动态止损设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 初始止损幅度：${
              params.dynamicStopLoss.initialStopLoss || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
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
              "\n"
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
            let valueStr;
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
              "\n"
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

          line = `- 策略说明：统一管理退出策略（分批止盈 + 峰值回落 + 动态止损）`;
          formattedToolCalls += `${wrapLine(line, maxLineWidth).join("\n")}\n`;

          // 显示分批止盈参数
          if (params.partialTakeProfit) {
            line = `- 分批止盈设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第一阶段：触发条件 +${
              params.partialTakeProfit.stage1?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage1?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第二阶段：触发条件 +${
              params.partialTakeProfit.stage2?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage2?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第三阶段：触发条件 +${
              params.partialTakeProfit.stage3?.trigger || 0
            }%，平仓比例 ${
              params.partialTakeProfit.stage3?.closePercent || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          } else {
            line = `- 分批止盈设置：未配置`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          }

          // 显示峰值回落参数
          if (params.peakDrawdown) {
            line = `- 峰值回落设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第一级：回落${
              params.peakDrawdown.level1?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level1?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第二级：回落${
              params.peakDrawdown.level2?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level2?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 第三级：回落${
              params.peakDrawdown.level3?.drawdownThreshold || 0
            }%，平仓比例 ${params.peakDrawdown.level3?.closePercent || 0}%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            if (params.peakDrawdown.minHoldingTime) {
              line = `  - 最小持仓时间：${params.peakDrawdown.minHoldingTime} 分钟`;
              formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
                "\n"
              )}\n`;
            }
          } else {
            line = `- 峰值回落设置：未配置`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;
          }

          // 显示完整的动态止损参数
          if (params.dynamicStopLoss) {
            line = `- 动态止损设置：`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
            )}\n`;

            line = `  - 初始止损幅度：${
              params.dynamicStopLoss.initialStopLoss || 0
            }%`;
            formattedToolCalls += `${wrapLine(line, maxLineWidth).join(
              "\n"
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
              "\n"
            )}\n`;
          }
        } else {
          // 其他工具，显示基本参数
          for (const [key, value] of Object.entries(params)) {
            let valueStr;
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
              "\n"
            )}\n`;
          }
        }

        return formattedToolCalls;
      } catch (error) {
        console.error("解析工具调用失败:", error);
        return match; // 如果解析失败，返回原始匹配
      }
    }
  );

  return finalResult;
}
