# 蔡森策略开发计划文档

## 概述

本文档详细描述了蔡森策略的开发计划、实现细节和使用方法。蔡森策略是一种基于蔡森分析指标的多维度技术分析策略，通过综合评估市场趋势、动量、波动率和超买超卖状态，生成高质量的交易信号。

## 策略核心特性

### 1. 多维度技术分析
- **趋势强度分析**：基于EMA多周期排列和MACD指标
- **波动率评估**：ATR动态波动率测量
- **动量指标**：RSI和MACD组合分析
- **七分位价格水平**：基于历史价格分布的关键水平识别
- **暴跌检测**：6小时跌幅>15%且成交量放大>2倍的紧急信号

### 2. 智能信号评分系统
- **趋势评分**：评估多周期EMA排列和MACD状态
- **动量评分**：RSI超买超卖状态和MACD动量强度
- **超买超卖评分**：综合RSI和价格偏离度评估
- **综合评分**：加权计算最终信号强度

### 3. 动态仓位管理
- **基于信号强度调整仓位大小**：强信号30-35%，中等信号20-25%，弱信号15-20%
- **波动率自适应杠杆**：高波动率降低杠杆，低波动率提高杠杆
- **风险控制**：初始止损根据杠杆和波动率动态调整

### 4. 自动监控系统
- **实时监控**：每10秒检查一次持仓状态
- **动态止盈止损**：3级移动止盈规则和波动率自适应止损
- **暴跌保护**：检测到暴跌信号立即平仓
- **七分位止盈**：达到关键价格水平时部分止盈

## 文件结构

```
src/
├── strategies/
│   ├── caiSen.ts              # 蔡森策略核心实现
│   ├── index.ts               # 策略注册和导出
│   └── types.ts               # 策略类型定义
├── scheduler/
│   └── caiSenMonitor.ts       # 蔡森策略自动监控系统
└── index.ts                   # 主程序集成
```

## 核心实现

### 1. 蔡森策略核心指标计算

#### 趋势强度计算
```typescript
/**
 * 计算趋势强度
 * 基于EMA多周期排列和MACD指标
 * @param data 市场数据
 * @returns 趋势强度值 (0-100)
 */
function calculateTrendStrength(data: MarketData): number {
  // EMA多周期排列评分
  const emaScore = calculateEMAScore(data);
  
  // MACD趋势评分
  const macdScore = calculateMACDScore(data);
  
  // 加权平均
  return emaScore * 0.6 + macdScore * 0.4;
}
```

#### 波动率计算
```typescript
/**
 * 计算波动率
 * 基于ATR指标
 * @param data 市场数据
 * @returns 波动率值
 */
function calculateVolatility(data: MarketData): number {
  // 计算ATR
  const atr = calculateATR(data);
  
  // 相对波动率（ATR/当前价格）
  return atr / data.price;
}
```

#### 七分位价格水平计算
```typescript
/**
 * 计算七分位价格水平
 * 基于历史价格分布的关键水平
 * @param data 市场数据
 * @returns 七分位价格水平
 */
function calculateSevenLevelPrices(data: MarketData): SevenLevelPrices {
  // 获取历史价格数据
  const prices = getHistoricalPrices(data.symbol, 100);
  
  // 计算七分位数
  const sortedPrices = prices.sort((a, b) => a - b);
  const levels = [];
  for (let i = 1; i <= 7; i++) {
    const index = Math.floor(sortedPrices.length * i / 7);
    levels.push(sortedPrices[index]);
  }
  
  return {
    level1: levels[0], // 最低价
    level2: levels[1],
    level3: levels[2],
    level4: levels[3], // 中位数
    level5: levels[4],
    level6: levels[5],
    level7: levels[6], // 最高价
  };
}
```

### 2. 信号评分系统

#### 趋势评分
```typescript
/**
 * 计算趋势评分
 * @param indicators 技术指标
 * @returns 趋势评分 (0-100)
 */
function calculateTrendScore(indicators: TechnicalIndicators): number {
  let score = 50; // 基础分
  
  // EMA排列评分
  if (indicators.ema5 > indicators.ema20 && indicators.ema20 > indicators.ema50) {
    score += 20; // 多头排列
  } else if (indicators.ema5 < indicators.ema20 && indicators.ema20 < indicators.ema50) {
    score -= 20; // 空头排列
  }
  
  // MACD评分
  if (indicators.macd > indicators.macdSignal && indicators.macdHistogram > 0) {
    score += 15; // MACD多头
  } else if (indicators.macd < indicators.macdSignal && indicators.macdHistogram < 0) {
    score -= 15; // MACD空头
  }
  
  // 限制在0-100范围内
  return Math.max(0, Math.min(100, score));
}
```

#### 动量评分
```typescript
/**
 * 计算动量评分
 * @param indicators 技术指标
 * @returns 动量评分 (0-100)
 */
function calculateMomentumScore(indicators: TechnicalIndicators): number {
  let score = 50; // 基础分
  
  // RSI评分
  if (indicators.rsi14 > 50 && indicators.rsi14 < 70) {
    score += 15; // RSI多头但未超买
  } else if (indicators.rsi14 < 50 && indicators.rsi14 > 30) {
    score -= 15; // RSI空头但未超卖
  } else if (indicators.rsi14 >= 70) {
    score -= 10; // RSI超买
  } else if (indicators.rsi14 <= 30) {
    score += 10; // RSI超卖
  }
  
  // MACD动量评分
  if (indicators.macdHistogram > 0 && indicators.macdHistogram > indicators.macdHistogramPrev) {
    score += 10; // MACD动量增强
  } else if (indicators.macdHistogram < 0 && indicators.macdHistogram < indicators.macdHistogramPrev) {
    score -= 10; // MACD动量减弱
  }
  
  // 限制在0-100范围内
  return Math.max(0, Math.min(100, score));
}
```

### 3. 交易信号生成

#### 信号生成逻辑
```typescript
/**
 * 生成交易信号
 * @param indicators 技术指标
 * @param marketData 市场数据
 * @returns 交易信号
 */
function generateTradingSignal(
  indicators: CaiSenIndicators, 
  marketData: MarketData
): TradingSignal {
  // 计算各维度评分
  const trendScore = calculateTrendScore(indicators);
  const momentumScore = calculateMomentumScore(indicators);
  const overboughtOversoldScore = calculateOverboughtOversoldScore(indicators);
  
  // 计算综合评分
  const overallScore = (
    trendScore * 0.4 + 
    momentumScore * 0.35 + 
    overboughtOversoldScore * 0.25
  );
  
  // 生成信号
  if (overallScore >= 70) {
    return { action: "long", strength: overallScore, confidence: "high" };
  } else if (overallScore <= 30) {
    return { action: "short", strength: 100 - overallScore, confidence: "high" };
  } else if (overallScore >= 60) {
    return { action: "long", strength: overallScore, confidence: "medium" };
  } else if (overallScore <= 40) {
    return { action: "short", strength: 100 - overallScore, confidence: "medium" };
  } else {
    return { action: "hold", strength: 50, confidence: "low" };
  }
}
```

### 4. 自动监控系统

#### 监控主循环
```typescript
/**
 * 执行蔡森策略监控
 * 每10秒执行一次
 */
async function executeCaiSenMonitoring(): Promise<void> {
  try {
    // 获取当前持仓
    const positions = await getCurrentPositions();
    
    // 获取当前市场数据
    const marketData = await getCurrentMarketData();
    
    // 检查每个持仓
    for (const position of positions) {
      // 检查移动止盈
      await checkTrailingStop(position, marketData[position.symbol]);
      
      // 检查暴跌保护
      await checkCrashProtection(position, marketData[position.symbol]);
      
      // 检查七分位止盈
      await checkSevenLevelTakeProfit(position, marketData[position.symbol]);
      
      // 更新监控历史
      await updateMonitoringHistory(position, marketData[position.symbol]);
    }
  } catch (error) {
    logger.error("蔡森策略监控执行失败:", error);
  }
}
```

#### 移动止盈逻辑
```typescript
/**
 * 检查移动止盈
 * @param position 持仓信息
 * @param marketData 市场数据
 */
async function checkTrailingStop(position: Position, marketData: MarketData): Promise<void> {
  // 计算当前盈亏百分比
  const pnlPercent = calculatePnlPercent(position.entry_price, marketData.price, position.side, position.leverage);
  
  // 获取监控历史
  const monitorHistory = getMonitorHistory(position.symbol);
  
  // 更新峰值
  if (pnlPercent > monitorHistory.peakPnl) {
    monitorHistory.peakPnl = pnlPercent;
  }
  
  // 检查移动止盈触发条件
  let shouldClose = false;
  let stopLevel = "";
  
  if (monitorHistory.peakPnl >= 15 && pnlPercent <= monitorHistory.peakPnl - 5) {
    shouldClose = true;
    stopLevel = "Level 3";
  } else if (monitorHistory.peakPnl >= 10 && pnlPercent <= monitorHistory.peakPnl - 3) {
    shouldClose = true;
    stopLevel = "Level 2";
  } else if (monitorHistory.peakPnl >= 5 && pnlPercent <= monitorHistory.peakPnl - 1.5) {
    shouldClose = true;
    stopLevel = "Level 1";
  }
  
  // 执行平仓
  if (shouldClose) {
    await closePosition(position, `移动止盈触发 - ${stopLevel}`);
    logger.info(`蔡森策略移动止盈: ${position.symbol} ${stopLevel} 触发，平仓盈亏: ${pnlPercent.toFixed(2)}%`);
  }
}
```

## 配置参数

### 策略参数
```typescript
export const caiSenStrategyParams: StrategyParams = {
  name: "蔡森策略",
  description: "基于蔡森分析指标的多维度技术分析策略",
  
  // 杠杆配置
  leverageMin: 2,
  leverageMax: 8,
  
  // 仓位配置
  positionSizeMin: 15,
  positionSizeMax: 35,
  
  // 止损配置
  stopLoss: {
    low: -8,    // 低杠杆止损
    mid: -6,    // 中等杠杆止损
    high: -4,   // 高杠杆止损
  },
  
  // 移动止盈配置
  trailingStop: {
    level1: { trigger: 5, stopAt: 1.5 },   // 5%峰值后回退1.5%平仓
    level2: { trigger: 10, stopAt: 3 },    // 10%峰值后回退3%平仓
    level3: { trigger: 15, stopAt: 5 },    // 15%峰值后回退5%平仓
  },
  
  // 分批止盈配置
  partialTakeProfit: {
    stage1: { trigger: 8, closePercent: 30 },   // 8%盈利时平仓30%
    stage2: { trigger: 15, closePercent: 40 },  // 15%盈利时再平仓40%
    stage3: { trigger: 25, closePercent: 30 },  // 25%盈利时再平仓30%
  },
  
  // 代码级保护开关
  enableCodeLevelProtection: true,
  allowAiOverrideProtection: true,
};
```

## 使用方法

### 1. 策略配置

在`.env`文件中设置：
```bash
TRADING_STRATEGY=cai-sen
TRADING_INTERVAL_MINUTES=15
MAX_LEVERAGE=10
MAX_POSITIONS=3
```

### 2. 启动系统

```bash
npm start
```

系统将自动启动蔡森策略和相关的监控系统。

### 3. 监控界面

访问 `http://localhost:3141/` 查看系统运行状态和交易记录。

## 性能指标

### 预期收益
- **月目标收益**：25-40%
- **胜率目标**：40-50%
- **盈亏比目标**：≥2.5:1
- **夏普比率**：≥1.8

### 风险控制
- **最大回撤**：≤15%
- **单笔最大亏损**：≤8%
- **最大持仓杠杆**：8倍
- **最大同时持仓数**：3个

## 优化方向

### 1. 短期优化
- 优化七分位价格水平计算算法
- 增加更多技术指标组合
- 改进信号评分权重分配

### 2. 中期优化
- 增加机器学习模型辅助决策
- 实现自适应参数调整
- 增加市场情绪分析

### 3. 长期优化
- 开发多资产组合策略
- 实现跨市场套利功能
- 增加宏观经济指标分析

## 注意事项

1. **市场适应性**：蔡森策略适用于趋势明显的市场，在震荡市场中可能表现不佳
2. **参数调整**：建议根据不同币种特性调整参数
3. **风险控制**：严格遵守止损规则，避免单笔大额亏损
4. **监控频率**：每10秒监控一次，确保及时响应市场变化

## 更新日志

### v1.0.0 (2025-01-19)
- 初始版本发布
- 实现核心指标计算
- 实现信号评分系统
- 实现自动监控系统
- 集成到主程序

---

*本文档最后更新时间：2025-01-19*