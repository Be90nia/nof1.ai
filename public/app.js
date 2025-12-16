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
  ]);

  updateLastUpdateTime();
}

// 加载账户数据
async function loadAccountData() {
  try {
    const response = await fetch("/api/account");
    const data = await response.json();

    // 更新可用余额
    updateValueWithAnimation(
      "availableBalance",
      data.availableBalance.toFixed(2)
    );

    // 更新未实现盈亏（带符号和颜色）
    // 这个值会根据持仓的实时价格变化而实时更新
    const unrealisedPnlEl = document.getElementById("unrealisedPnl");
    const pnlValue = 
      (data.unrealisedPnl >= 0 ? "+" : "") + data.unrealisedPnl.toFixed(2);
    updateValueWithAnimation("unrealisedPnl", pnlValue);
    unrealisedPnlEl.className = 
      "value " + (data.unrealisedPnl >= 0 ? "positive" : "negative");

    // 更新总资产
    // API 返回的 totalBalance 不包含未实现盈亏
    // 显示的总资产需要加上未实现盈亏，以便实时反映持仓盈亏
    const totalBalanceWithPnl = data.totalBalance + data.unrealisedPnl;
    updateValueWithAnimation("totalBalance", totalBalanceWithPnl.toFixed(2));

    // 更新收益率（带符号和颜色）
    // 收益率 = (总资产 - 初始资金) / 初始资金 * 100
    // 使用包含未实现盈亏的总资产计算，会实时变化
    const returnPercentEl = document.getElementById("returnPercent");
    const returnPercent = 
      ((totalBalanceWithPnl - data.initialBalance) / data.initialBalance) * 100;
    const returnValue = 
      (returnPercent >= 0 ? "+" : "") + returnPercent.toFixed(2) + "%";
    updateValueWithAnimation("returnPercent", returnValue);
    returnPercentEl.className = 
      "value " + (returnPercent >= 0 ? "positive" : "negative");
  } catch (error) {
    console.error("加载账户数据失败:", error);
  }
}

// 带动画效果的数值更新
function updateValueWithAnimation(elementId, newValue) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const oldValue = element.textContent;

  // 如果值没有变化，不更新
  if (oldValue === newValue) return;

  // 添加闪烁效果表示数据更新
  element.style.transition = "background-color 0.3s ease";
  element.style.backgroundColor = "rgba(59, 130, 246, 0.2)";

  // 更新数值
  element.textContent = newValue;

  // 恢复背景色
  setTimeout(() => {
    element.style.backgroundColor = "";
  }, 300);
}

// 加载持仓数据
async function loadPositionsData() {
  try {
    const response = await fetch("/api/positions");
    const data = await response.json();

    const container = document.getElementById("positionsContainer");
    const countEl = document.getElementById("positionsCount");

    if (!data.positions || data.positions.length === 0) {
      container.innerHTML = '<p class="no-data">当前无持仓</p>';
      countEl.textContent = "";
      return;
    }

    countEl.textContent = `(${data.positions.length})`;

    container.innerHTML = data.positions
      .map(
        (pos) => `
            <div class="position-item ${pos.side}">
                <div class="position-header">
                    <div class="position-symbol">${pos.symbol}</div>
                    <div class="position-side ${pos.side}">${
          pos.side === "long" ? "多" : "空"
        }</div>
                </div>
                <div class="position-grid">
                    <div class="position-field">
                        <div class="label">数量</div>
                        <div class="value">${pos.quantity}</div>
                    </div>
                    <div class="position-field">
                        <div class="label">开仓价</div>
                        <div class="value">${pos.entryPrice.toFixed(4)}</div>
                    </div>
                    <div class="position-field">
                        <div class="label">开仓价值</div>
                        <div class="value">${pos.openValue.toFixed(
                          2
                        )} USDT</div>
                    </div>
                    <div class="position-field">
                        <div class="label">当前价</div>
                        <div class="value">${pos.currentPrice.toFixed(4)}</div>
                    </div>
                    <div class="position-field">
                        <div class="label">杠杆</div>
                        <div class="value">${pos.leverage}x</div>
                    </div>
                    <div class="position-field">
                        <div class="label">盈亏</div>
                        <div class="value ${
                          pos.unrealizedPnl >= 0 ? "positive" : "negative"
                        }">
                            ${
                              pos.unrealizedPnl >= 0 ? "+" : ""
                            }${pos.unrealizedPnl.toFixed(2)}
                        </div>
                    </div>
                    <div class="position-field">
                        <div class="label">强平价</div>
                        <div class="value">${pos.liquidationPrice.toFixed(
                          4
                        )}</div>
                    </div>
                    ${
                      pos.stopLoss
                        ? `
                    <div class="position-field">
                        <div class="label">止损</div>
                        <div class="value">${pos.stopLoss.toFixed(4)}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      pos.profitTarget
                        ? `
                    <div class="position-field">
                        <div class="label">止盈</div>
                        <div class="value">${pos.profitTarget.toFixed(4)}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `
      )
      .join("");
  } catch (error) {
    console.error("加载持仓数据失败:", error);
  }
}

// 加载决策日志
async function loadLogsData() {
  try {
    const response = await fetch("/api/logs?limit=1");
    const data = await response.json();

    const container = document.getElementById("logsContainer");

    if (!data.logs || data.logs.length === 0) {
      container.innerHTML = '<p class="no-data">暂无决策日志</p>';
      return;
    }

    container.innerHTML = data.logs
      .map((log, index) => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });

        // 处理log.decision，美化工具调用标记
        const formattedDecision = formatToolCallsDisplay(log.decision);

        return `
                <div class="log-item">
                    <div class="log-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="log-time">${timeStr}</div>
                            <div class="log-iteration">#${log.iteration}</div>
                        </div>
                        <button class="copy-btn" onclick="copyLog(${index})" title="复制决策内容">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="log-decision" id="log-decision-${index}">${formattedDecision}</div>
                </div>
            `;
      })
      .join("");

    // 保存日志数据供复制功能使用
    window.logsData = data.logs;
  } catch (error) {
    console.error("加载日志失败:", error);
  }
}

// 加载交易历史
async function loadTradesData() {
  try {
    // 不传 contract 参数，获取所有合约的成交记录
    const response = await fetch("/api/trades?limit=100");
    const data = await response.json();

    const container = document.getElementById("tradesContainer");
    const countEl = document.getElementById("tradesCount");

    if (!data.trades || data.trades.length === 0) {
      container.innerHTML = '<p class="no-data">暂无交易记录</p>';
      countEl.textContent = "";
      return;
    }

    countEl.textContent = `(${data.trades.length})`;

    container.innerHTML = data.trades
      .map((trade) => {
        const date = new Date(trade.timestamp);
        const timeStr = date.toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        // 对于平仓交易，显示盈亏
        const pnlHtml = 
          trade.type === "close" && 
          trade.pnl !== null && 
          trade.pnl !== undefined
            ? `<div class="trade-field">
                    <span class="label">盈亏</span>
                    <span class="value ${trade.pnl >= 0 ? "profit" : "loss"}">${
                trade.pnl >= 0 ? "+" : ""
              }${trade.pnl.toFixed(2)} USDT</span>
                   </div>`
            : "";

        return `
                <div class="trade-item">
                    <div class="trade-header">
                        <div class="trade-symbol">${trade.symbol}</div>
                        <div class="trade-time">${timeStr}</div>
                    </div>
                    <div class="trade-info">
                        <div class="trade-field">
                            <span class="label">方向</span>
                            <span class="value ${trade.side}">${
          trade.side === "long" ? "做多" : trade.side === "short" ? "做空" : "-"
        }</span>
                        </div>
                        <div class="trade-field">
                            <span class="label">类型</span>
                            <span class="value">${
                              trade.type === "open" ? "开仓" : "平仓"
                            }</span>
                        </div>
                        <div class="trade-field">
                            <span class="label">数量</span>
                            <span class="value">${trade.quantity.toFixed(
                              4
                            )}</span>
                        </div>
                        <div class="trade-field">
                            <span class="label">价格</span>
                            <span class="value">${trade.price.toFixed(4)}</span>
                        </div>
                        <div class="trade-field">
                            <span class="label">杠杆</span>
                            <span class="value">${trade.leverage}x</span>
                        </div>
                        <div class="trade-field">
                            <span class="label">手续费</span>
                            <span class="value">${trade.fee.toFixed(4)}</span>
                        </div>
                        ${pnlHtml}
                    </div>
                </div>
            `;
      })
      .join("");
  } catch (error) {
    console.error("加载交易历史失败:", error);
  }
}

// 更新最后更新时间
function updateLastUpdateTime() {
  const now = new Date();
  document.getElementById("lastUpdate").textContent = now.toLocaleTimeString(
    "zh-CN",
    {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }
  );
}

// 解析和美化AI决策数据中的工具调用标记
function formatToolCallsDisplay(decision) {
  if (!decision || typeof decision !== "string") {
    return decision;
  }

  let result = decision;
  
  // 定义工具调用块的正则表达式，兼容全角和半角字符
  const toolCallBlocksRegex = /<[|｜]tool[-_▁]calls[-_▁]begin[|｜]>([\s\S]*?)<[|｜]tool[-_▁]calls[-_▁]end[|｜]>/gs;
  // 单个工具调用正则表达式，兼容全角和半角字符，处理可能的重复标记和灵活分隔
  const singleToolRegex = /<[|｜]tool[-_▁]call[-_▁]begin[|｜]>([\s\S]*?)<[|｜]tool[-_▁]call[-_▁]end[|｜]>/gs;
  
  // 修复组件嵌套问题，与后端逻辑保持一致
  function fixComponentNesting(parameters) {
    const newParams = {
      symbol: parameters.symbol,
      strategyType: parameters.strategyType || "combination",
      enabled: parameters.enabled !== undefined ? parameters.enabled : true,
    };

    // 提取partialTakeProfit组件，支持从任何位置提取
    if (parameters.partialTakeProfit) {
      newParams.partialTakeProfit = parameters.partialTakeProfit;
    } else if (parameters.dynamicStopLoss?.partialTakeProfit) {
      newParams.partialTakeProfit = parameters.dynamicStopLoss.partialTakeProfit;
    } else if (parameters.peakDrawdown?.partialTakeProfit) {
      newParams.partialTakeProfit = parameters.peakDrawdown.partialTakeProfit;
    }

    // 提取dynamicStopLoss组件，并移除可能存在的嵌套组件
    if (parameters.dynamicStopLoss) {
      const cleanDynamicStopLoss = { ...parameters.dynamicStopLoss };
      delete cleanDynamicStopLoss.peakDrawdown;
      delete cleanDynamicStopLoss.partialTakeProfit;
      newParams.dynamicStopLoss = cleanDynamicStopLoss;
    }

    // 提取peakDrawdown组件，支持从嵌套结构中提取
    if (parameters.peakDrawdown) {
      newParams.peakDrawdown = parameters.peakDrawdown;
    } else if (parameters.dynamicStopLoss?.peakDrawdown) {
      newParams.peakDrawdown = parameters.dynamicStopLoss.peakDrawdown;
    } else if (parameters.partialTakeProfit?.peakDrawdown) {
      newParams.peakDrawdown = parameters.partialTakeProfit.peakDrawdown;
    }

    // 添加其他顶层属性
    for (const [key, value] of Object.entries(parameters)) {
      if (!["symbol", "strategyType", "enabled", "partialTakeProfit", "dynamicStopLoss", "peakDrawdown"].includes(key)) {
        newParams[key] = value;
      }
    }

    return newParams;
  }

  // 格式化单个setPositionExitStrategy工具调用
  function formatSetPositionExitStrategy(toolName, paramsJson) {
    try {
      // 修复JSON解析问题
      let fixedArgs = paramsJson;

      // 1. 移除多余的括号和字符
      // 处理 {(` 开头和 `)` 结尾的特殊格式
      if (fixedArgs.startsWith("{(")) {
        // 移除开头的 {( 和结尾的 )
        // 例如：{(`symbol":"BCH", ...)} -> {"symbol":"BCH", ...}
        fixedArgs = fixedArgs.substring(1); // 移除开头的 {
        fixedArgs = fixedArgs.substring(1, fixedArgs.length - 1); // 移除开头的 ( 和结尾的 )
        fixedArgs = "{" + fixedArgs + "}"; // 添加正确的 {} 包裹
      }
      // 处理普通括号包裹的情况
      else if (fixedArgs.startsWith("(") && fixedArgs.endsWith(")")) {
        fixedArgs = fixedArgs.substring(1, fixedArgs.length - 1);
        fixedArgs = "{" + fixedArgs + "}";
      }

      // 2. 修复可能存在的引号问题
      // 将单引号替换为双引号
      fixedArgs = fixedArgs.replace(
        /'([^']*?)'(\s*[:},\]])/g,
        '"$1"$2'
      );

      // 3. 修复尾部逗号
      fixedArgs = fixedArgs.replace(/,\s*([}\[\]])/g, "$1");

      // 4. 确保JSON的完整性
      // 统计括号数量，确保平衡
      const openBraces = (fixedArgs.match(/{/g) || []).length;
      const closeBraces = (fixedArgs.match(/}/g) || []).length;
      const openBrackets = (fixedArgs.match(/\[/g) || []).length;
      const closeBrackets = (fixedArgs.match(/\]/g) || []).length;

      // 补全缺失的括号
      if (openBraces > closeBraces) {
        fixedArgs += "}".repeat(openBraces - closeBraces);
      }
      if (openBrackets > closeBrackets) {
        fixedArgs += "]".repeat(openBrackets - closeBrackets);
      }

      // 尝试解析JSON参数
      let parameters = JSON.parse(fixedArgs);
      if (toolName.trim() === "setPositionExitStrategy") {
        parameters = fixComponentNesting(parameters);
      }

      const params = parameters;

      // 生成美化后的HTML
      let formattedHtml = `<div class="tool-calls-container">
                          <div class="tool-calls-header">执行参数设置：</div>
                          <div class="tool-calls-content">
                            <div class="tool-call">`;

      // 显示基本信息
      formattedHtml += `<div class="tool-name">工具: ${toolName}</div>`;
      formattedHtml += `<div class="tool-params">
                        - 币种：${params.symbol || "N/A"}<br>
                        - 策略：${params.strategy || "默认"}<br>
                        - 策略类型：${params.strategyType || "默认"}<br>
                        - 启用状态：${params.enabled ? "启用" : "禁用"}<br>
                        - 策略说明：统一管理退出策略（分批止盈 + 峰值回落 + 动态止损）<br>`;

      // 显示分批止盈设置
      if (params.partialTakeProfit) {
        formattedHtml += `<br>- 分批止盈设置：<br>`;
        
        const stage1 = params.partialTakeProfit.stage1;
        if (stage1) {
          formattedHtml += `  - 第一阶段：触发条件 +${stage1.trigger || 0}%，平仓比例 ${stage1.closePercent || 0}%<br>`;
        }
        
        const stage2 = params.partialTakeProfit.stage2;
        if (stage2) {
          formattedHtml += `  - 第二阶段：触发条件 +${stage2.trigger || 0}%，平仓比例 ${stage2.closePercent || 0}%<br>`;
        }
        
        const stage3 = params.partialTakeProfit.stage3;
        if (stage3) {
          formattedHtml += `  - 第三阶段：触发条件 +${stage3.trigger || 0}%，平仓比例 ${stage3.closePercent || 0}%<br>`;
        }
      } else {
        formattedHtml += `<br>- 分批止盈设置：未配置<br>`;
      }

      // 显示峰值回落设置
      if (params.peakDrawdown) {
        formattedHtml += `<br>- 峰值回落设置：<br>`;
        
        const level1 = params.peakDrawdown.level1;
        if (level1) {
          formattedHtml += `  - 第一级：回落${level1.drawdownThreshold || 0}%，平仓比例 ${level1.closePercent || 0}%<br>`;
        }
        
        const level2 = params.peakDrawdown.level2;
        if (level2) {
          formattedHtml += `  - 第二级：回落${level2.drawdownThreshold || 0}%，平仓比例 ${level2.closePercent || 0}%<br>`;
        }
        
        const level3 = params.peakDrawdown.level3;
        if (level3) {
          formattedHtml += `  - 第三级：回落${level3.drawdownThreshold || 0}%，平仓比例 ${level3.closePercent || 0}%<br>`;
        }
        
        if (params.peakDrawdown.minHoldingTime) {
          formattedHtml += `  - 最小持仓时间：${params.peakDrawdown.minHoldingTime} 分钟<br>`;
        }
      } else {
        formattedHtml += `<br>- 峰值回落设置：未配置<br>`;
      }

      // 显示动态止损设置
      if (params.dynamicStopLoss) {
        formattedHtml += `<br>- 动态止损设置：<br>`;
        
        formattedHtml += `  - 初始止损幅度：${params.dynamicStopLoss.initialStopLoss || 0}%<br>`;
        
        if (params.dynamicStopLoss.trailingStopLoss) {
          const trailingStop = params.dynamicStopLoss.trailingStopLoss;
          
          if (trailingStop.level1) {
            formattedHtml += `  - 第一级移动止损：盈利达到 +${trailingStop.level1.trigger}%时，止损移至 +${trailingStop.level1.stopAt}%<br>`;
          }
          
          if (trailingStop.level2) {
            formattedHtml += `  - 第二级移动止损：盈利达到 +${trailingStop.level2.trigger}%时，止损移至 +${trailingStop.level2.stopAt}%<br>`;
          }
          
          if (trailingStop.level3) {
            formattedHtml += `  - 第三级移动止损：盈利达到 +${trailingStop.level3.trigger}%时，止损移至 +${trailingStop.level3.stopAt}%<br>`;
          }
        }
      } else {
        formattedHtml += `<br>- 动态止损设置：未配置<br>`;
      }

      formattedHtml += `</div>
                      </div>
                    </div>
                  </div>`;

      return formattedHtml;
    } catch (e) {
      console.error("解析失败:", e, "参数:", paramsJson);
      // 如果解析失败，使用简化显示
      return `<div class="tool-calls-container">
              <div class="tool-calls-header">执行工具调用:</div>
              <div class="tool-calls-content">
                <div class="tool-call">
                  <div class="tool-name">工具: ${toolName}</div>
                  <div class="tool-params">参数: 解析失败，显示原始参数</div>
                </div>
              </div>
            </div>`;
    }
  }

  // 处理带外层包装的工具调用块
  let match;
  while ((match = toolCallBlocksRegex.exec(result)) !== null) {
    const entireBlock = match[0];
    const innerContent = match[1];
    
    // 查找工具名称 - 直接查找setPositionExitStrategy字符串
    const toolNameRegex = /setPositionExitStrategy/;
    const toolNameMatch = innerContent.match(toolNameRegex);
    
    if (toolNameMatch) {
      // 提取工具名称
      const toolName = toolNameMatch[0];
      
      // 查找参数部分 - 从工具名称后的竖线开始，提取JSON部分
      // 查找第一个{，然后匹配对应的}
      const jsonStartRegex = /{/;
      const jsonStartMatch = innerContent.match(jsonStartRegex);
      
      if (jsonStartMatch) {
        // 提取从第一个{到最后一个}的内容作为JSON参数
        let jsonContent = innerContent.substring(jsonStartMatch.index);
        
        // 查找最后一个}
        const lastBraceIndex = jsonContent.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          jsonContent = jsonContent.substring(0, lastBraceIndex + 1);
          
          // 格式化工具调用
          const formattedContent = formatSetPositionExitStrategy(toolName, jsonContent);
          result = result.replace(entireBlock, formattedContent);
        }
      }
    }
  }

  // 重置正则表达式的lastIndex，处理单个工具调用
  singleToolRegex.lastIndex = 0;
  
  // 处理单个工具调用标记（没有外层包装）
  while ((match = singleToolRegex.exec(result)) !== null) {
    const entireMatch = match[0];
    const callContent = match[1];
    
    // 查找工具名称 - 直接查找setPositionExitStrategy字符串
    const toolNameRegex = /setPositionExitStrategy/;
    const toolNameMatch = callContent.match(toolNameRegex);
    
    if (toolNameMatch) {
      // 提取工具名称
      const toolName = toolNameMatch[0];
      
      // 查找参数部分 - 提取JSON部分
      // 查找第一个{，然后匹配对应的}
      const jsonStartRegex = /{/;
      const jsonStartMatch = callContent.match(jsonStartRegex);
      
      if (jsonStartMatch) {
        // 提取从第一个{到最后一个}的内容作为JSON参数
        let jsonContent = callContent.substring(jsonStartMatch.index);
        
        // 查找最后一个}
        const lastBraceIndex = jsonContent.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          jsonContent = jsonContent.substring(0, lastBraceIndex + 1);
          
          // 格式化工具调用
          const formattedContent = formatSetPositionExitStrategy(toolName, jsonContent);
          result = result.replace(entireMatch, formattedContent);
        }
      }
    }
  }

  return result;
}

// 复制日志决策内容
function copyLog(index) {
  if (!window.logsData || !window.logsData[index]) {
    console.error("日志数据不存在");
    return;
  }

  const log = window.logsData[index];
  const logText = `时间: ${new Date(log.timestamp).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  })}\n迭代: #${log.iteration}\n\n决策:\n${log.decision}`;

  navigator.clipboard
    .writeText(logText)
    .then(() => {
      // 显示复制成功提示
      const btn = event.target.closest(".copy-btn");
      if (btn) {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = 
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        btn.style.color = "#10b981";

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.style.color = "";
        }, 2000);
      }
    })
    .catch((err) => {
      console.error("复制失败:", err);
      alert("复制失败，请手动复制");
    });
}