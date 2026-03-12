# 动态止损优化系统 - 配置示例

## 概述

本文档提供了动态止损优化系统的各种配置示例，帮助用户根据不同的交易风格和市场环境选择合适的参数设置。

## 基础配置

### 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# 启用动态止损系统
ENABLE_DYNAMIC_STOP_LOSS=true

# 基础配置
DYNAMIC_STOP_LOSS_BASE_PERCENT=2.0          # 基础止损百分比
DYNAMIC_STOP_LOSS_AI_ENABLED=true           # 启用 AI 智能判断
DYNAMIC_STOP_LOSS_AI_CONFIDENCE=0.7         # AI 判断置信度阈值
DYNAMIC_STOP_LOSS_TRAILING_ENABLED=true     # 启用追踪止损

# AI 模型配置（必需）
OPENAI_API_KEY=your_openai_api_key
AI_MODEL_NAME=deepseek/deepseek-v3.2-exp
```

## 交易策略配置模板

### 1. 保守型策略（推荐新手）

适用于风险厌恶型交易者，注重资金保护。

```typescript
// 保守型配置
const conservativeConfig = {
  // 基础止损配置
  baseStopLossPercent: 1.5,              // 较小的基础止损
  
  // 动态因子权重（较小的调整幅度）
  trendFactorWeight: 0.15,               // 趋势因子权重
  volatilityFactorWeight: 0.2,           // 波动率因子权重
  sevenSegmentFactorWeight: 0.1,         // 七分位因子权重
  volumeFactorWeight: 0.08,              // 成交量因子权重
  timeDecayFactorWeight: 0.2,            // 时间衰减因子权重
  
  // 计算周期（较长周期，更稳定）
  trendPeriod: 30,                       // 趋势计算周期
  volatilityPeriod: 20,                  // 波动率计算周期
  sevenSegmentPeriod: 150,               // 七分位计算周期
  volumePeriod: 30,                      // 成交量计算周期
  
  // 追踪止损配置
  trailingStop: {
    enabled: true,
    atrMultiplier: 1.5,                  // 较小的 ATR 倍数
    minTrailingPercent: 0.3,             // 最小追踪百分比
    maxTrailingPercent: 3.0,             // 最大追踪百分比
    timeDecayRate: 0.05                  // 较慢的时间衰减
  },
  
  // AI 判断配置
  aiJudgment: {
    enabled: true,
    timeoutMs: 8000,                     // 较长的超时时间
    confidenceThreshold: 0.8,            // 较高的置信度阈值
    model: "deepseek/deepseek-v3.2-exp"
  },
  
  // 缓存配置
  cache: {
    indicatorsTTL: 90,                   // 较长的缓存时间
    caisenAnalysisTTL: 450,
    trailingStopTTL: 5400
  }
};
```

**环境变量设置**:
```env
DYNAMIC_STOP_LOSS_BASE_PERCENT=1.5
DYNAMIC_STOP_LOSS_AI_CONFIDENCE=0.8
```

### 2. 平衡型策略（推荐大多数用户）

在风险和收益之间取得平衡，适合大多数交易者。

```typescript
// 平衡型配置（默认配置）
const balancedConfig = {
  // 基础止损配置
  baseStopLossPercent: 2.0,              // 标准基础止损
  
  // 动态因子权重（标准调整幅度）
  trendFactorWeight: 0.2,                // 趋势因子权重
  volatilityFactorWeight: 0.3,           // 波动率因子权重
  sevenSegmentFactorWeight: 0.15,        // 七分位因子权重
  volumeFactorWeight: 0.1,               // 成交量因子权重
  timeDecayFactorWeight: 0.25,           // 时间衰减因子权重
  
  // 计算周期（标准周期）
  trendPeriod: 20,                       // 趋势计算周期
  volatilityPeriod: 14,                  // 波动率计算周期
  sevenSegmentPeriod: 100,               // 七分位计算周期
  volumePeriod: 20,                      // 成交量计算周期
  
  // 追踪止损配置
  trailingStop: {
    enabled: true,
    atrMultiplier: 2.0,                  // 标准 ATR 倍数
    minTrailingPercent: 0.5,             // 最小追踪百分比
    maxTrailingPercent: 5.0,             // 最大追踪百分比
    timeDecayRate: 0.1                   // 标准时间衰减
  },
  
  // AI 判断配置
  aiJudgment: {
    enabled: true,
    timeoutMs: 5000,                     // 标准超时时间
    confidenceThreshold: 0.7,            // 标准置信度阈值
    model: "deepseek/deepseek-v3.2-exp"
  },
  
  // 缓存配置
  cache: {
    indicatorsTTL: 60,                   // 标准缓存时间
    caisenAnalysisTTL: 300,
    trailingStopTTL: 3600
  }
};
```

**环境变量设置**:
```env
DYNAMIC_STOP_LOSS_BASE_PERCENT=2.0
DYNAMIC_STOP_LOSS_AI_CONFIDENCE=0.7
```

### 3. 激进型策略（适合经验丰富的交易者）

追求更高收益，承担相应风险，适合经验丰富的交易者。

```typescript
// 激进型配置
const aggressiveConfig = {
  // 基础止损配置
  baseStopLossPercent: 3.0,              // 较大的基础止损
  
  // 动态因子权重（较大的调整幅度）
  trendFactorWeight: 0.3,                // 趋势因子权重
  volatilityFactorWeight: 0.4,           // 波动率因子权重
  sevenSegmentFactorWeight: 0.2,         // 七分位因子权重
  volumeFactorWeight: 0.15,              // 成交量因子权重
  timeDecayFactorWeight: 0.3,            // 时间衰减因子权重
  
  // 计算周期（较短周期，更敏感）
  trendPeriod: 15,                       // 趋势计算周期
  volatilityPeriod: 10,                  // 波动率计算周期
  sevenSegmentPeriod: 80,                // 七分位计算周期
  volumePeriod: 15,                      // 成交量计算周期
  
  // 追踪止损配置
  trailingStop: {
    enabled: true,
    atrMultiplier: 2.5,                  // 较大的 ATR 倍数
    minTrailingPercent: 0.8,             // 最小追踪百分比
    maxTrailingPercent: 8.0,             // 最大追踪百分比
    timeDecayRate: 0.15                  // 较快的时间衰减
  },
  
  // AI 判断配置
  aiJudgment: {
    enabled: true,
    timeoutMs: 3000,                     // 较短的超时时间
    confidenceThreshold: 0.6,            // 较低的置信度阈值
    model: "deepseek/deepseek-v3.2-exp"
  },
  
  // 缓存配置
  cache: {
    indicatorsTTL: 30,                   // 较短的缓存时间
    caisenAnalysisTTL: 180,
    trailingStopTTL: 1800
  }
};
```

**环境变量设置**:
```env
DYNAMIC_STOP_LOSS_BASE_PERCENT=3.0
DYNAMIC_STOP_LOSS_AI_CONFIDENCE=0.6
```

### 4. 高频交易策略

适合高频交易场景，注重快速响应和低延迟。

```typescript
// 高频交易配置
const highFrequencyConfig = {
  // 基础止损配置
  baseStopLossPercent: 1.0,              // 较小的基础止损
  
  // 动态因子权重（快速调整）
  trendFactorWeight: 0.25,               // 趋势因子权重
  volatilityFactorWeight: 0.35,          // 波动率因子权重
  sevenSegmentFactorWeight: 0.1,         // 七分位因子权重
  volumeFactorWeight: 0.2,               // 成交量因子权重
  timeDecayFactorWeight: 0.4,            // 时间衰减因子权重
  
  // 计算周期（极短周期）
  trendPeriod: 10,                       // 趋势计算周期
  volatilityPeriod: 7,                   // 波动率计算周期
  sevenSegmentPeriod: 50,                // 七分位计算周期
  volumePeriod: 10,                      // 成交量计算周期
  
  // 追踪止损配置
  trailingStop: {
    enabled: true,
    atrMultiplier: 1.2,                  // 较小的 ATR 倍数
    minTrailingPercent: 0.2,             // 最小追踪百分比
    maxTrailingPercent: 2.0,             // 最大追踪百分比
    timeDecayRate: 0.2                   // 快速时间衰减
  },
  
  // AI 判断配置
  aiJudgment: {
    enabled: false,                      // 禁用 AI 判断以提高速度
    timeoutMs: 1000,                     // 极短超时时间
    confidenceThreshold: 0.5,            // 较低置信度阈值
    model: "deepseek/deepseek-v3.2-exp"
  },
  
  // 缓存配置
  cache: {
    indicatorsTTL: 15,                   // 极短缓存时间
    caisenAnalysisTTL: 60,
    trailingStopTTL: 300
  }
};
```

**环境变量设置**:
```env
DYNAMIC_STOP_LOSS_BASE_PERCENT=1.0
DYNAMIC_STOP_LOSS_AI_ENABLED=false
```

### 5. 长期持仓策略

适合长期持仓的投资者，注重趋势跟踪。

```typescript
// 长期持仓配置
const longTermConfig = {
  // 基础止损配置
  baseStopLossPercent: 4.0,              // 较大的基础止损
  
  // 动态因子权重（注重长期趋势）
  trendFactorWeight: 0.4,                // 高趋势因子权重
  volatilityFactorWeight: 0.2,           // 低波动率因子权重
  sevenSegmentFactorWeight: 0.25,        // 高七分位因子权重
  volumeFactorWeight: 0.05,              // 低成交量因子权重
  timeDecayFactorWeight: 0.1,            // 低时间衰减因子权重
  
  // 计算周期（长周期）
  trendPeriod: 50,                       // 趋势计算周期
  volatilityPeriod: 30,                  // 波动率计算周期
  sevenSegmentPeriod: 200,               // 七分位计算周期
  volumePeriod: 50,                      // 成交量计算周期
  
  // 追踪止损配置
  trailingStop: {
    enabled: true,
    atrMultiplier: 3.0,                  // 较大的 ATR 倍数
    minTrailingPercent: 1.0,             // 最小追踪百分比
    maxTrailingPercent: 10.0,            // 最大追踪百分比
    timeDecayRate: 0.02                  // 极慢的时间衰减
  },
  
  // AI 判断配置
  aiJudgment: {
    enabled: true,
    timeoutMs: 10000,                    // 较长超时时间
    confidenceThreshold: 0.75,           // 较高置信度阈值
    model: "deepseek/deepseek-v3.2-exp"
  },
  
  // 缓存配置
  cache: {
    indicatorsTTL: 300,                  // 较长缓存时间
    caisenAnalysisTTL: 1800,
    trailingStopTTL: 7200
  }
};
```

**环境变量设置**:
```env
DYNAMIC_STOP_LOSS_BASE_PERCENT=4.0
DYNAMIC_STOP_LOSS_AI_CONFIDENCE=0.75
```

## 市场环境适配配置

### 高波动率市场配置

适用于市场波动剧烈的时期：

```typescript
const highVolatilityConfig = {
  baseStopLossPercent: 3.5,
  volatilityFactorWeight: 0.5,          // 增加波动率权重
  trendFactorWeight: 0.15,              // 降低趋势权重
  aiJudgment: {
    enabled: true,
    confidenceThreshold: 0.6             // 降低置信度阈值
  },
  trailingStop: {
    atrMultiplier: 3.0,                  // 增加追踪距离
    maxTrailingPercent: 8.0
  }
};
```

### 低波动率市场配置

适用于市场相对平静的时期：

```typescript
const lowVolatilityConfig = {
  baseStopLossPercent: 1.5,
  volatilityFactorWeight: 0.2,          // 降低波动率权重
  trendFactorWeight: 0.3,               // 增加趋势权重
  aiJudgment: {
    enabled: true,
    confidenceThreshold: 0.8             // 提高置信度阈值
  },
  trailingStop: {
    atrMultiplier: 1.5,                  // 减少追踪距离
    maxTrailingPercent: 3.0
  }
};
```

### 趋势市场配置

适用于明显趋势的市场：

```typescript
const trendingMarketConfig = {
  baseStopLossPercent: 2.5,
  trendFactorWeight: 0.4,               // 增加趋势权重
  sevenSegmentFactorWeight: 0.2,        // 增加七分位权重
  timeDecayFactorWeight: 0.15,          // 降低时间衰减
  trailingStop: {
    enabled: true,
    atrMultiplier: 2.5,
    timeDecayRate: 0.05                  // 慢速时间衰减
  }
};
```

### 震荡市场配置

适用于横盘震荡的市场：

```typescript
const sidewaysMarketConfig = {
  baseStopLossPercent: 1.8,
  trendFactorWeight: 0.1,               // 降低趋势权重
  volumeFactorWeight: 0.2,              // 增加成交量权重
  timeDecayFactorWeight: 0.3,           // 增加时间衰减
  trailingStop: {
    enabled: false                       // 禁用追踪止损
  },
  aiJudgment: {
    confidenceThreshold: 0.75            // 提高判断标准
  }
};
```

## 配置应用方法

### 1. 通过代码应用配置

```typescript
import { updateConfig } from '../src/utils/dynamicStopLoss';

// 应用保守型配置
await updateConfig(conservativeConfig, '切换到保守型策略');

// 应用平衡型配置
await updateConfig(balancedConfig, '切换到平衡型策略');

// 应用激进型配置
await updateConfig(aggressiveConfig, '切换到激进型策略');
```

### 2. 通过环境变量应用配置

在 `.env` 文件中设置对应的环境变量，系统启动时会自动加载。

### 3. 运行时动态调整

```typescript
import { getConfig, updateConfig } from '../src/utils/dynamicStopLoss';

// 获取当前配置
const currentConfig = await getConfig();

// 根据市场条件动态调整
if (marketVolatility > 0.8) {
  await updateConfig({
    ...currentConfig,
    volatilityFactorWeight: 0.5,
    aiJudgment: {
      ...currentConfig.aiJudgment,
      confidenceThreshold: 0.6
    }
  }, '高波动率市场调整');
}
```

## 配置验证

系统会自动验证配置参数的合理性：

```typescript
// 参数范围检查
const validationRules = {
  baseStopLossPercent: [0.1, 10.0],      // 0.1% - 10%
  trendFactorWeight: [0.0, 1.0],         // 0 - 100%
  volatilityFactorWeight: [0.0, 1.0],    // 0 - 100%
  sevenSegmentFactorWeight: [0.0, 1.0],  // 0 - 100%
  volumeFactorWeight: [0.0, 1.0],        // 0 - 100%
  timeDecayFactorWeight: [0.0, 1.0],     // 0 - 100%
  
  trendPeriod: [5, 100],                 // 5 - 100 周期
  volatilityPeriod: [5, 50],             // 5 - 50 周期
  sevenSegmentPeriod: [20, 500],         // 20 - 500 周期
  volumePeriod: [5, 100],                // 5 - 100 周期
  
  'trailingStop.atrMultiplier': [0.5, 5.0],        // 0.5 - 5.0 倍
  'trailingStop.minTrailingPercent': [0.1, 2.0],   // 0.1% - 2%
  'trailingStop.maxTrailingPercent': [1.0, 20.0],  // 1% - 20%
  'trailingStop.timeDecayRate': [0.01, 0.5],       // 1% - 50%
  
  'aiJudgment.timeoutMs': [1000, 30000],            // 1 - 30 秒
  'aiJudgment.confidenceThreshold': [0.1, 0.95],   // 10% - 95%
  
  'cache.indicatorsTTL': [10, 600],                 // 10 秒 - 10 分钟
  'cache.caisenAnalysisTTL': [60, 3600],           // 1 分钟 - 1 小时
  'cache.trailingStopTTL': [300, 86400]            // 5 分钟 - 24 小时
};
```

## 监控和调优

### 性能指标监控

```typescript
import { getSystemStatus, getRunReport } from '../src/utils/dynamicStopLoss';

// 监控关键指标
const status = await getSystemStatus();
console.log('止损触发率:', status.stats.stopLossRate);
console.log('AI 准确率:', status.stats.aiAccuracy);
console.log('平均计算时间:', status.performance.avgCalculationTime);

// 生成性能报告
const report = await getRunReport();
console.log('缓存命中率:', report.performance.cacheHitRate);
console.log('错误率:', report.performance.errorRate);
```

### 配置优化建议

1. **监控止损触发频率**
   - 正常范围：5-15%
   - 过高：考虑放宽止损参数
   - 过低：考虑收紧止损参数

2. **观察 AI 判断准确率**
   - 目标：> 80%
   - 低于目标：调整置信度阈值或模型

3. **关注系统性能**
   - 计算时间：< 100ms
   - 缓存命中率：> 70%
   - 错误率：< 5%

## 故障排除

### 常见配置问题

1. **参数超出范围**
   ```
   错误：baseStopLossPercent 必须在 0.1-10.0 范围内
   解决：检查并调整参数值
   ```

2. **AI 判断超时**
   ```
   错误：AI 判断超时
   解决：增加 timeoutMs 或检查 API 配置
   ```

3. **缓存配置不当**
   ```
   错误：缓存 TTL 过短导致频繁计算
   解决：适当增加缓存时间
   ```

### 配置恢复

```typescript
import { resetConfig } from '../src/utils/dynamicStopLoss';

// 恢复默认配置
await resetConfig('恢复系统默认配置');
```

## 总结

选择合适的配置是动态止损系统发挥最佳效果的关键。建议：

1. **新手用户**：从保守型配置开始
2. **有经验用户**：使用平衡型配置
3. **专业交易者**：根据市场环境选择激进型或定制配置
4. **持续优化**：根据实际表现调整参数
5. **风险控制**：始终将风险控制放在首位

记住，没有一种配置适用于所有市场环境，需要根据实际情况灵活调整。