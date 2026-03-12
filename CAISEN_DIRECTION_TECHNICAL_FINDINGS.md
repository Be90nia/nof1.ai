# 蔡森策略交易方向技术细节分析

## 1. 核心方向映射规则

### 1.1 Gate.io 合约方向映射

```
持仓方向 ←→ 订单大小符号
多头(long) ←→ size > 0 (正数)
空头(short) ←→ size < 0 (负数)
```

### 1.2 代码实现验证

#### 开仓时的方向映射

**文件**: `src/tools/trading/tradeExecution.ts:456`

```typescript
const size = side === "long" ? quantity : -quantity;
```

✅ **验证**:
- 多头: `size = quantity` (正数) → 买入
- 空头: `size = -quantity` (负数) → 卖出

#### 平仓时的方向反转

**文件**: `src/services/gateClient.ts:730-735`

```typescript
const isLong = positionSizeBig.gt(0);
const orderSizeBig = isLong ? closeSizeBig.neg() : closeSizeBig;
const orderSize = Number.parseFloat(orderSizeBig.toString());
```

✅ **验证**:
- 多头平仓: `isLong=true` → `orderSize = -closeSizeBig` (负数) → 卖出
- 空头平仓: `isLong=false` → `orderSize = closeSizeBig` (正数) → 买入

---

## 2. 分批止盈方向逻辑详解

### 2.1 止盈价格计算

**文件**: `src/caisen/systems/dynamic-threshold/index.ts:1331-1334`

```typescript
if (threshold.direction === "long") {
  return threshold.entryPrice * (1 + percentage);
}
// 对于空头
return threshold.entryPrice * (1 - percentage);
```

### 2.2 数学验证

#### 多头止盈

```
入场价: 100 USDT
止盈比例: 5%
止盈价格 = 100 × (1 + 0.05) = 105 USDT

当前价格 ≥ 105 时触发止盈 ✅
```

#### 空头止盈

```
入场价: 100 USDT
止盈比例: 5%
止盈价格 = 100 × (1 - 0.05) = 95 USDT

当前价格 ≤ 95 时触发止盈 ✅
```

### 2.3 触发条件验证

**文件**: `src/caisen/systems/dynamic-threshold/index.ts:773-778`

```typescript
if (
  (threshold.direction === "long" &&
    threshold.currentPrice >= calculatedValue) ||
  (threshold.direction === "short" &&
    threshold.currentPrice <= calculatedValue)
) {
  isTriggered = true;
}
```

✅ **验证**:
- 多头: `currentPrice ≥ targetPrice` → 触发 ✅
- 空头: `currentPrice ≤ targetPrice` → 触发 ✅

---

## 3. 动态止损方向逻辑详解

### 3.1 止损价格计算

**文件**: `src/caisen/systems/dynamic-threshold/index.ts:1325-1330`

```typescript
if (threshold.type === ThresholdType.STOP_LOSS) {
  if (threshold.direction === "long") {
    return threshold.entryPrice * (1 - percentage);
  }
}
// 对于空头
return threshold.entryPrice * (1 + percentage);
```

### 3.2 数学验证

#### 多头止损

```
入场价: 100 USDT
止损比例: 3%
止损价格 = 100 × (1 - 0.03) = 97 USDT

当前价格 ≤ 97 时触发止损 ✅
```

#### 空头止损

```
入场价: 100 USDT
止损比例: 3%
止损价格 = 100 × (1 + 0.03) = 103 USDT

当前价格 ≥ 103 时触发止损 ✅
```

### 3.3 触发条件验证

**文件**: `src/caisen/systems/dynamic-threshold/index.ts:743-748`

```typescript
if (
  (threshold.direction === "long" &&
    threshold.currentPrice <= calculatedValue) ||
  (threshold.direction === "short" &&
    threshold.currentPrice >= calculatedValue)
) {
  isTriggered = true;
}
```

✅ **验证**:
- 多头: `currentPrice ≤ stopPrice` → 触发 ✅
- 空头: `currentPrice ≥ stopPrice` → 触发 ✅

---

## 4. 峰值回落方向逻辑详解

### 4.1 趋势判断

**文件**: `src/caisen/systems/monitor/index.ts:1159-1170`

```typescript
// 计算短期趋势
const ema10 = prices.reduce((sum, p) => sum + p, 0) / prices.length;
const currentPriceForCheck = prices[prices.length - 1];
const trendUp = currentPriceForCheck > ema10;

// 判断趋势是否对我们不利
if (side === "long" && !trendUp) {
  trendAgainstUs = true;  // 多头时，趋势向下为不利
} else if (side === "short" && trendUp) {
  trendAgainstUs = true;  // 空头时，趋势向上为不利
}
```

### 4.2 趋势判断矩阵

| 持仓方向 | 趋势方向 | 判断 | 说明 |
|---------|---------|------|------|
| 多头 | 向上 | 有利 | 价格继续上升 |
| 多头 | 向下 | 不利 | 价格开始下跌 |
| 空头 | 向上 | 不利 | 价格开始上升 |
| 空头 | 向下 | 有利 | 价格继续下跌 |

✅ **验证**: 逻辑完全正确

### 4.3 峰值回落触发

**文件**: `src/caisen/systems/monitor/index.ts:1200-1250`

```typescript
// 计算从峰值的回落幅度
const drawdownFromPeak = peakPnlPercent > 0 ? peakPnlPercent - pnlPercent : 0;

// 根据回落幅度选择保护级别
if (drawdownFromPeak >= level3.drawdownThreshold) {
  activeLevel = level3;  // 最严格的保护
} else if (drawdownFromPeak >= level2.drawdownThreshold) {
  activeLevel = level2;
} else if (drawdownFromPeak >= level1.drawdownThreshold) {
  activeLevel = level1;
}

// 执行平仓
if (shouldTrigger) {
  const closeQuantity = initialQuantity * activeLevel.closePercent;
  await batchClosingSystem.executeBatch(batchId);
}
```

✅ **验证**: 
- 峰值回落计算正确
- 级别选择正确
- 平仓执行正确

---

## 5. 加仓方向逻辑详解

### 5.1 金字塔加仓

**文件**: `src/caisen/systems/monitor/index.ts:625-630`

```typescript
// 确定订单方向
const orderSize = side === "long" ? addSize : -addSize;

logger.warn(`【执行金字塔加仓】${symbol} ${side}`);
logger.warn(`  加仓原因: ${description}`);
logger.warn(`  初始持仓: ${baseSize} 张`);
logger.warn(`  当前持仓: ${currentSize} 张`);
logger.warn(`  加仓数量: ${addSize} 张 (${(addRatio * 100).toFixed(0)}%)`);
```

### 5.2 加仓方向验证

| 持仓方向 | 加仓订单 | 说明 |
|---------|---------|------|
| 多头 | `size > 0` | 继续买入 |
| 空头 | `size < 0` | 继续卖出 |

✅ **验证**: 加仓方向正确

---

## 6. 数据库持仓方向存储

### 6.1 持仓表结构

**表**: `positions`

```sql
CREATE TABLE positions (
  symbol TEXT,
  side TEXT,  -- "long" 或 "short"
  quantity REAL,
  entry_price REAL,
  average_entry_price REAL,  -- 加权平均成本
  current_price REAL,
  leverage INTEGER,
  opened_at TEXT,
  add_position_count INTEGER,
  last_add_position_time TEXT,
  peak_pnl_percent REAL,
  executed_levels TEXT,  -- JSON 数组
  exit_strategy TEXT,  -- JSON 对象
  ...
);
```

### 6.2 方向存储验证

**文件**: `src/tools/trading/tradeExecution.ts:620`

```typescript
await dbClient.execute({
  sql: `INSERT INTO positions (
    symbol, side, quantity, entry_price, leverage, opened_at, ...
  ) VALUES (?, ?, ?, ?, ?, ?, ...)`,
  args: [
    symbol,
    side,  // "long" 或 "short"
    quantity,
    entryPrice,
    leverage,
    getChinaTimeISO(),
    ...
  ]
});
```

✅ **验证**: 方向存储正确

---

## 7. 方向一致性检查

### 7.1 开仓时的方向检查

**文件**: `src/tools/trading/tradeExecution.ts:105-124`

```typescript
// 检查是否已有相反方向的持仓
const existingPosition = await dbClient.execute(
  "SELECT * FROM positions WHERE symbol = ? LIMIT 1",
  [symbol]
);

if (existingPosition.rows.length > 0) {
  const existingSide = existingSize > 0 ? "long" : "short";
  
  if (existingSide !== side) {
    return {
      success: false,
      message: `禁止同时持有双向持仓`
    };
  }
}
```

✅ **验证**: 防止双向持仓的检查正确

### 7.2 平仓时的方向验证

**文件**: `src/tools/trading/tradeExecution.ts:873-876`

```typescript
// 从交易所获取实时数据
const gateSize = Number.parseFloat(gatePosition?.size || "0");
const exchangeSide = gateSize > 0 ? "long" : "short";

// 优先使用数据库中的持仓信息
const side = dbPosition?.side || exchangeSide;
```

✅ **验证**: 方向获取正确

---

## 8. 潜在问题分析

### 问题1：空头价格变动计算缺失

**文件**: `src/caisen/systems/monitor/index.ts:461-465`

```typescript
// 计算价格变动百分比（基于加权平均成本）
let priceChangePercent = 0;
if (side === "long") {
  priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
} else {
  // ⚠️ 缺少空头的计算
}
```

**影响**: 
- 空头持仓的盈亏计算可能不准确
- 可能导致峰值回落判断错误

**修复建议**:
```typescript
if (side === "long") {
  priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
} else {
  priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
}
```

### 问题2：平仓决策记录中的方向计算

**文件**: `src/caisen/systems/monitor/recordClosingDecision.ts:115-116`

```typescript
const actualPriceChange =
  params.side === "long" ? priceChangePercent : -priceChangePercent;
```

**分析**:
- 对于多头: `actualPriceChange = priceChangePercent` ✅
- 对于空头: `actualPriceChange = -priceChangePercent` 

**验证**:
```
多头: 入场100，当前110
priceChangePercent = (110-100)/100 = 10%
actualPriceChange = 10% ✅

空头: 入场100，当前90
priceChangePercent = (90-100)/100 = -10%
actualPriceChange = -(-10%) = 10% ✅
```

✅ **结论**: 逻辑正确

### 问题3：加权平均成本的方向处理

**文件**: `src/caisen/systems/monitor/index.ts:749`

```typescript
// 🔧 关键：优先使用数据库中的加权平均成本（考虑加仓后的平均成本）
const dbInfo = dbInfoMap.get(symbol);
const exchangeEntryPrice = Number.parseFloat(position.entryPrice);
const entryPrice = dbInfo?.averageEntryPrice || exchangeEntryPrice;
```

✅ **验证**: 正确使用加权平均成本

---

## 9. 方向逻辑流程图

### 9.1 开仓流程

```
AI决策 (side: "long" 或 "short")
    ↓
参数验证 (检查方向有效性)
    ↓
检查现有持仓 (禁止双向持仓)
    ↓
计算订单大小 (size = side === "long" ? +qty : -qty)
    ↓
下单 (placeOrder with size)
    ↓
记录到数据库 (side: "long" 或 "short")
```

### 9.2 平仓流程

```
平仓请求 (symbol, percentage)
    ↓
获取持仓信息 (从数据库或交易所)
    ↓
获取持仓方向 (side: "long" 或 "short")
    ↓
计算平仓数量 (closeSize = quantity × percentage)
    ↓
反向计算订单大小 (size = side === "long" ? -closeSize : +closeSize)
    ↓
下单 (placeOrder with reversed size)
    ↓
记录平仓交易
```

### 9.3 止盈/止损流程

```
监控当前价格
    ↓
获取持仓方向 (side: "long" 或 "short")
    ↓
计算目标价格 (根据方向和百分比)
    ↓
检查触发条件 (根据方向判断)
    ↓
触发时执行平仓 (自动反向)
```

---

## 10. 方向逻辑完整性矩阵

### 10.1 多头(Long)完整性检查

| 阶段 | 操作 | 订单方向 | 触发条件 | 状态 |
|------|------|---------|---------|------|
| 开仓 | 买入 | +size | - | ✅ |
| 监控 | 计算盈亏 | - | 价格变动 | ✅ |
| 止盈 | 卖出 | -size | 价格 ≥ 目标 | ✅ |
| 止损 | 卖出 | -size | 价格 ≤ 止损 | ✅ |
| 加仓 | 买入 | +size | 价格有利 | ✅ |
| 峰值回落 | 卖出 | -size | 回落触发 | ✅ |
| 平仓 | 卖出 | -size | 手动/自动 | ✅ |

### 10.2 空头(Short)完整性检查

| 阶段 | 操作 | 订单方向 | 触发条件 | 状态 |
|------|------|---------|---------|------|
| 开仓 | 卖出 | -size | - | ✅ |
| 监控 | 计算盈亏 | - | 价格变动 | ⚠️ |
| 止盈 | 买入 | +size | 价格 ≤ 目标 | ✅ |
| 止损 | 买入 | +size | 价格 ≥ 止损 | ✅ |
| 加仓 | 卖出 | -size | 价格有利 | ✅ |
| 峰值回落 | 买入 | +size | 回落触发 | ✅ |
| 平仓 | 买入 | +size | 手动/自动 | ✅ |

**注**: ⚠️ 表示需要补充空头价格变动计算

---

## 11. 建议修复清单

### 优先级1 (立即修复)

- [ ] 补充空头价格变动计算 (`src/caisen/systems/monitor/index.ts:461-465`)

### 优先级2 (增强)

- [ ] 添加方向一致性检查日志
- [ ] 添加方向验证单元测试
- [ ] 完善错误处理中的方向信息

### 优先级3 (优化)

- [ ] 提取方向逻辑为独立工具函数
- [ ] 创建方向常量枚举
- [ ] 添加方向逻辑文档

---

**文档版本**: 1.0  
**最后更新**: 2025年  
**审查范围**: 蔡森策略所有交易方向相关代码
