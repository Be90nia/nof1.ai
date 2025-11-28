# 蔡森Agent分批平仓功能使用指南
# CaiSen Agent Batch Closing Functionality Usage Guide

## 概述 Overview

蔡森Agent分批平仓功能允许用户设置智能分批平仓策略，根据市场条件和盈利目标自动分批平仓，实现收益最大化。该功能集成了动态阈值设定系统，支持多种触发条件和执行策略。

The CaiSen Agent batch closing functionality allows users to set intelligent batch closing strategies that automatically close positions in batches based on market conditions and profit targets, maximizing returns. This feature integrates with the dynamic threshold setting system and supports multiple trigger conditions and execution strategies.

## 核心功能 Core Features

1. **分批平仓设置 Batch Closing Setup**: 设置多批次平仓计划，支持自定义批次比例和触发条件
2. **动态阈值管理 Dynamic Threshold Management**: 管理止损、止盈、移动止损和分批止盈阈值
3. **智能执行策略 Smart Execution Strategy**: 根据市场情况选择最优执行策略
4. **实时监控 Real-time Monitoring**: 实时监控持仓状态和触发条件
5. **灵活配置 Flexible Configuration**: 支持多种参数配置和自定义规则

## 使用方法 Usage

### 1. 设置分批平仓 Set Batch Closing

```typescript
// 蔡森Agent实例化
// CaiSen Agent instantiation
const caiSenAgent = new CaiSenAgent({
  id: 'caisen-agent-001',
  name: '蔡森交易代理',
  // ...其他配置
});

// 分批平仓参数
// Batch closing parameters
const batchClosingParams: BatchClosingParameters = {
  positionId: 'BTCUSDT-long-12345',
  batchCount: 3,
  batchPercentages: [30, 30, 40], // 三批次，分别平仓30%、30%、40%
  triggerConditions: [
    { type: 'profit', value: 5 },   // 第一批：盈利5%时触发
    { type: 'profit', value: 10 },  // 第二批：盈利10%时触发
    { type: 'profit', value: 20 }   // 第三批：盈利20%时触发
  ],
  executionStrategy: 'gradual', // 渐进式执行策略
  expirationTime: Date.now() + 24 * 60 * 60 * 1000 // 24小时后过期
};

// 设置分批平仓
// Set batch closing
const result = await caiSenAgent.callTool('setBatchClosing', { 
  parameters: batchClosingParams 
});

// 检查结果
// Check result
if (result.result === InterfaceCallResult.SUCCESS) {
  console.log('分批平仓设置成功:', result.data);
} else {
  console.error('设置失败:', result.errorMessage);
}
```

### 2. 设置止损止盈 Set Stop Profit and Loss

```typescript
// 止损止盈参数
// Stop profit and loss parameters
const stopProfitLossParams: StopProfitLossParameters = {
  positionId: 'BTCUSDT-long-12345',
  stopLoss: {
    type: 'percentage',  // 百分比类型
    value: 5,            // 5%止损
    enabled: true
  },
  takeProfit: {
    type: 'percentage',  // 百分比类型
    value: 15,           // 15%止盈
    enabled: true
  },
  trailingStop: {
    enabled: true,       // 启用移动止损
    triggerValue: 5,     // 5%盈利后启动
    stopValue: 2         // 回撤2%时止损
  }
};

// 设置止损止盈
// Set stop profit and loss
const result = await caiSenAgent.callTool('setStopProfitLoss', { 
  parameters: stopProfitLossParams 
});

// 检查结果
// Check result
if (result.result === InterfaceCallResult.SUCCESS) {
  console.log('止损止盈设置成功:', result.data);
} else {
  console.error('设置失败:', result.errorMessage);
}
```

### 3. 取消分批平仓 Cancel Batch Closing

```typescript
// 取消指定持仓的分批平仓
// Cancel batch closing for specific position
const result = await caiSenAgent.callTool('cancelBatchClosing', { 
  positionId: 'BTCUSDT-long-12345' 
});

// 检查结果
// Check result
if (result.result === InterfaceCallResult.SUCCESS) {
  console.log('分批平仓已取消:', result.data);
} else {
  console.error('取消失败:', result.errorMessage);
}
```

### 4. 直接使用动态阈值设定系统 Using Dynamic Threshold Setting System Directly

```typescript
// 获取动态阈值设定系统实例
// Get dynamic threshold setting system instance
const dynamicThresholdSetting = caiSenAgent.getDynamicThresholdSetting();

// 设置多个阈值
// Set multiple thresholds
const thresholdsData = [
  {
    type: ThresholdType.STOP_LOSS,
    positionId: 'BTCUSDT-long-12345',
    symbol: 'BTCUSDT',
    direction: 'long',
    entryPrice: 50000,
    currentPrice: 50000,
    calculationMethod: 'percentage',
    parameters: { percentage: 5 }
  },
  {
    type: ThresholdType.TAKE_PROFIT,
    positionId: 'BTCUSDT-long-12345',
    symbol: 'BTCUSDT',
    direction: 'long',
    entryPrice: 50000,
    currentPrice: 50000,
    calculationMethod: 'percentage',
    parameters: { percentage: 15 }
  },
  {
    type: ThresholdType.PARTIAL_PROFIT,
    positionId: 'BTCUSDT-long-12345',
    symbol: 'BTCUSDT',
    direction: 'long',
    entryPrice: 50000,
    currentPrice: 50000,
    calculationMethod: 'percentage',
    parameters: { percentage: 10 }
  }
];

// 批量设置阈值
// Batch set thresholds
const result = dynamicThresholdSetting.setThresholds(thresholdsData);

// 检查结果
// Check result
console.log('成功设置的阈值ID:', result.success);
console.log('设置失败的阈值:', result.errors);

// 获取指定持仓的所有阈值
// Get all thresholds for specific position
const thresholds = dynamicThresholdSetting.getThresholdsByPositionId('BTCUSDT-long-12345');
console.log('持仓阈值:', thresholds);

// 获取指定持仓的特定类型阈值
// Get specific type thresholds for specific position
const stopLossThresholds = dynamicThresholdSetting.getThresholdsByPositionId(
  'BTCUSDT-long-12345', 
  ThresholdType.STOP_LOSS
);
console.log('止损阈值:', stopLossThresholds);

// 获取指定持仓的特定状态阈值
// Get specific status thresholds for specific position
const activeThresholds = dynamicThresholdSetting.getThresholdsByPositionId(
  'BTCUSDT-long-12345', 
  undefined, 
  ThresholdStatus.ACTIVE
);
console.log('活跃阈值:', activeThresholds);
```

## 参数说明 Parameter Description

### BatchClosingParameters 分批平仓参数

| 参数 Parameter | 类型 Type | 必填 Required | 描述 Description |
|---|---|---|---|
| positionId | string | 是 | 持仓唯一标识 Position unique identifier |
| batchCount | number | 是 | 分批数量 Number of batches |
| batchPercentages | number[] | 是 | 各批次平仓比例，总和必须为100 Closing percentage for each batch, sum must be 100 |
| triggerConditions | TriggerCondition[] | 是 | 各批次触发条件 Trigger conditions for each batch |
| executionStrategy | string | 否 | 执行策略，默认'gradual' Execution strategy, default 'gradual' |
| expirationTime | number | 否 | 过期时间，默认24小时后 Expiration time, default 24 hours later |

### StopProfitLossParameters 止损止盈参数

| 参数 Parameter | 类型 Type | 必填 Required | 描述 Description |
|---|---|---|---|
| positionId | string | 是 | 持仓唯一标识 Position unique identifier |
| stopLoss | StopLossConfig | 否 | 止损配置 Stop loss configuration |
| takeProfit | TakeProfitConfig | 否 | 止盈配置 Take profit configuration |
| trailingStop | TrailingStopConfig | 否 | 移动止损配置 Trailing stop configuration |

### TriggerCondition 触发条件

| 参数 Parameter | 类型 Type | 必填 Required | 描述 Description |
|---|---|---|---|
| type | string | 是 | 触发类型：'profit', 'loss', 'price', 'time', 'volume' Trigger type |
| value | number | 是 | 触发值 Trigger value |
| operator | string | 否 | 比较操作符，默认'gt' Comparison operator, default 'gt' |
| timeWindow | number | 否 | 时间窗口（毫秒） Time window in milliseconds |

## 执行策略 Execution Strategies

1. **gradual 渐进式**: 按顺序依次执行各批次，确保市场影响最小
2. **immediate 立即式**: 立即执行所有符合条件的批次
3. **adaptive 自适应式**: 根据市场情况动态调整执行策略

## 触发条件类型 Trigger Condition Types

1. **profit 盈利**: 达到指定盈利百分比时触发
2. **loss 亏损**: 达到指定亏损百分比时触发
3. **price 价格**: 达到指定价格时触发
4. **time 时间**: 达到指定时间时触发
5. **volume 成交量**: 达到指定成交量时触发

## 最佳实践 Best Practices

1. **合理设置批次比例**: 建议初期小比例平仓，后期大比例平仓，降低风险
2. **多样化触发条件**: 结合价格、时间和成交量等多种触发条件，提高策略灵活性
3. **设置合理过期时间**: 避免长期未执行的策略占用系统资源
4. **定期监控和调整**: 根据市场变化及时调整分批平仓策略
5. **结合风险管理**: 将分批平仓与整体风险管理策略相结合

## 注意事项 Important Notes

1. 批次比例总和必须等于100
2. 触发条件数量必须与批次数量一致
3. 过期时间必须大于当前时间
4. 同一持仓只能有一个活跃的分批平仓计划
5. 取消分批平仓后，所有相关阈值将被清除

## 错误处理 Error Handling

系统会返回详细的错误信息，常见错误包括：

1. **PARAMETER_ERROR**: 参数错误，如批次比例不等于100%
2. **NOT_FOUND**: 未找到指定持仓或配置
3. **ALREADY_EXISTS**: 已存在分批平仓计划
4. **EXPIRED**: 配置已过期
5. **SYSTEM_ERROR**: 系统内部错误

## 示例场景 Example Scenarios

### 场景1：保守型分批止盈
```typescript
const conservativeBatchClosing: BatchClosingParameters = {
  positionId: 'ETHUSDT-long-67890',
  batchCount: 4,
  batchPercentages: [20, 20, 30, 30],
  triggerConditions: [
    { type: 'profit', value: 3 },   // 第一批：盈利3%时平仓20%
    { type: 'profit', value: 6 },   // 第二批：盈利6%时平仓20%
    { type: 'profit', value: 10 },  // 第三批：盈利10%时平仓30%
    { type: 'profit', value: 15 }   // 第四批：盈利15%时平仓30%
  ],
  executionStrategy: 'gradual',
  expirationTime: Date.now() + 48 * 60 * 60 * 1000 // 48小时后过期
};
```

### 场景2：激进型分批止盈
```typescript
const aggressiveBatchClosing: BatchClosingParameters = {
  positionId: 'BTCUSDT-short-11111',
  batchCount: 3,
  batchPercentages: [25, 35, 40],
  triggerConditions: [
    { type: 'profit', value: 8 },   // 第一批：盈利8%时平仓25%
    { type: 'profit', value: 15 },  // 第二批：盈利15%时平仓35%
    { type: 'profit', value: 25 }   // 第三批：盈利25%时平仓40%
  ],
  executionStrategy: 'adaptive',
  expirationTime: Date.now() + 12 * 60 * 60 * 1000 // 12小时后过期
};
```

### 场景3：时间与价格结合触发
```typescript
const hybridBatchClosing: BatchClosingParameters = {
  positionId: 'SOLUSDT-long-22222',
  batchCount: 3,
  batchPercentages: [30, 30, 40],
  triggerConditions: [
    { type: 'profit', value: 5 },                    // 第一批：盈利5%时触发
    { type: 'time', value: Date.now() + 4 * 60 * 60 * 1000 }, // 第二批：4小时后触发
    { type: 'price', value: 150 }                   // 第三批：价格达到150时触发
  ],
  executionStrategy: 'adaptive',
  expirationTime: Date.now() + 24 * 60 * 60 * 1000 // 24小时后过期
};
```

## 技术支持 Technical Support

如需技术支持或报告问题，请联系开发团队或查看项目文档。

For technical support or to report issues, please contact the development team or refer to the project documentation.