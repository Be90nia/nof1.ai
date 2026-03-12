# 蔡森策略交易方向快速参考指南

## 核心规则

### 方向映射

```
多头(long)  ↔ size > 0  (正数)  ↔ 买入
空头(short) ↔ size < 0  (负数)  ↔ 卖出
```

### 平仓规则

```
多头平仓: 卖出 (size < 0)
空头平仓: 买入 (size > 0)
```

---

## 关键代码位置

### 1. 开仓方向映射

**文件**: `src/tools/trading/tradeExecution.ts:456`

```typescript
const size = side === "long" ? quantity : -quantity;
```

### 2. 平仓方向反转

**文件**: `src/services/gateClient.ts:730-735`

```typescript
const isLong = positionSizeBig.gt(0);
const orderSizeBig = isLong ? closeSizeBig.neg() : closeSizeBig;
```

### 3. 止盈触发条件

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

### 4. 止损触发条件

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

### 5. 加仓方向

**文件**: `src/caisen/systems/monitor/index.ts:627`

```typescript
const orderSize = side === "long" ? addSize : -addSize;
```

### 6. 峰值回落趋势判断

**文件**: `src/caisen/systems/monitor/index.ts:1159-1170`

```typescript
if (side === "long" && !trendUp) {
  trendAgainstUs = true;  // 多头时，趋势向下为不利
} else if (side === "short" && trendUp) {
  trendAgainstUs = true;  // 空头时，趋势向上为不利
}
```

---

## 方向逻辑速查表

### 多头(Long)

| 操作 | 订单 | 触发条件 | 价格计算 |
|------|------|---------|---------|
| 开仓 | 买入(+) | - | - |
| 平仓 | 卖出(-) | 手动/自动 | - |
| 止盈 | 卖出(-) | P ≥ E×(1+%) | E×(1+%) |
| 止损 | 卖出(-) | P ≤ E×(1-%) | E×(1-%) |
| 加仓 | 买入(+) | 价格有利 | - |
| 峰值回落 | 卖出(-) | 回落触发 | - |

### 空头(Short)

| 操作 | 订单 | 触发条件 | 价格计算 |
|------|------|---------|---------|
| 开仓 | 卖出(-) | - | - |
| 平仓 | 买入(+) | 手动/自动 | - |
| 止盈 | 买入(+) | P ≤ E×(1-%) | E×(1-%) |
| 止损 | 买入(+) | P ≥ E×(1+%) | E×(1+%) |
| 加仓 | 卖出(-) | 价格有利 | - |
| 峰值回落 | 买入(+) | 回落触发 | - |

**说明**: P=当前价格, E=入场价格, %=百分比

---

## 常见问题排查

### Q1: 多头持仓，为什么平仓时是卖出？

**A**: 因为平仓需要反向操作。多头是买入建立的，所以平仓时需要卖出来关闭持仓。

```
多头: 买入 → 持仓 → 卖出 → 平仓 ✅
```

### Q2: 空头持仓，止盈价格应该是多少？

**A**: 空头止盈价格 = 入场价 × (1 - 止盈比例)

```
例: 入场100, 止盈5%
止盈价 = 100 × (1 - 0.05) = 95
当价格 ≤ 95 时触发止盈 ✅
```

### Q3: 多头持仓，价格下跌时应该怎么办？

**A**: 根据下跌幅度：
- 小幅下跌 → 继续持有或加仓
- 达到止损价 → 自动止损
- 从峰值大幅回落 → 峰值回落保护

### Q4: 加仓时方向应该怎么确定？

**A**: 加仓方向与原持仓方向相同：
- 多头加仓 → 继续买入(+)
- 空头加仓 → 继续卖出(-)

### Q5: 如何判断趋势是否对我们不利？

**A**: 根据持仓方向：
- 多头 + 趋势向下 = 不利 ⚠️
- 空头 + 趋势向上 = 不利 ⚠️
- 多头 + 趋势向上 = 有利 ✅
- 空头 + 趋势向下 = 有利 ✅

---

## 已知问题

### 问题1: 空头价格变动计算缺失

**位置**: `src/caisen/systems/monitor/index.ts:461-465`

**现象**: 空头持仓的盈亏计算可能不准确

**修复**:
```typescript
if (side === "long") {
  priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
} else {
  // 添加空头计算
  priceChangePercent = ((entryPrice - currentPrice) / entryPrice) * 100;
}
```

---

## 验证清单

使用此清单验证方向逻辑是否正确：

### 开仓验证

- [ ] 多头开仓时，订单大小为正数
- [ ] 空头开仓时，订单大小为负数
- [ ] 禁止同时持有双向持仓
- [ ] 持仓方向正确存储到数据库

### 平仓验证

- [ ] 多头平仓时，订单大小为负数
- [ ] 空头平仓时，订单大小为正数
- [ ] 平仓数量正确计算
- [ ] 平仓价格正确记录

### 止盈验证

- [ ] 多头止盈价格 = 入场价 × (1 + %)
- [ ] 空头止盈价格 = 入场价 × (1 - %)
- [ ] 多头触发条件: 价格 ≥ 止盈价
- [ ] 空头触发条件: 价格 ≤ 止盈价

### 止损验证

- [ ] 多头止损价格 = 入场价 × (1 - %)
- [ ] 空头止损价格 = 入场价 × (1 + %)
- [ ] 多头触发条件: 价格 ≤ 止损价
- [ ] 空头触发条件: 价格 ≥ 止损价

### 加仓验证

- [ ] 多头加仓时，订单大小为正数
- [ ] 空头加仓时，订单大小为负数
- [ ] 加仓数量基于初始持仓计算
- [ ] 加仓历史正确记录

### 峰值回落验证

- [ ] 多头趋势向下时触发保护
- [ ] 空头趋势向上时触发保护
- [ ] 回落幅度计算正确
- [ ] 级别选择正确

---

## 调试技巧

### 1. 查看持仓方向

```sql
SELECT symbol, side, quantity, entry_price, average_entry_price 
FROM positions 
WHERE symbol = 'BTC';
```

### 2. 查看平仓决策

```sql
SELECT timestamp, market_analysis, decision 
FROM agent_decisions 
WHERE market_analysis LIKE '%close%' 
ORDER BY timestamp DESC 
LIMIT 10;
```

### 3. 查看加仓历史

```sql
SELECT symbol, add_position_count, last_add_position_time 
FROM positions 
WHERE add_position_count > 0;
```

### 4. 查看峰值回落执行

```sql
SELECT symbol, peak_pnl_percent, executed_levels 
FROM positions 
WHERE executed_levels LIKE '%peak_drawdown%';
```

---

## 日志关键字

在日志中搜索这些关键字来追踪方向相关的操作：

```
开仓: "开仓 BTC 做多" 或 "开仓 BTC 做空"
平仓: "平仓 BTC 做多" 或 "平仓 BTC 做空"
止盈: "分批止盈" 或 "partial_take_profit"
止损: "动态止损" 或 "dynamic_stop_loss"
加仓: "【执行金字塔加仓】"
峰值回落: "峰值回落保护" 或 "peak_drawdown"
趋势: "短期趋势" 或 "trendUp"
```

---

## 相关文件导航

| 功能 | 文件 | 行号 |
|------|------|------|
| 开仓 | `src/tools/trading/tradeExecution.ts` | 40-456 |
| 平仓 | `src/tools/trading/tradeExecution.ts` | 789-1100 |
| 平仓(交易所) | `src/services/gateClient.ts` | 696-760 |
| 止盈/止损 | `src/caisen/systems/dynamic-threshold/index.ts` | 740-1480 |
| 加仓 | `src/caisen/systems/monitor/index.ts` | 625-630 |
| 峰值回落 | `src/caisen/systems/monitor/index.ts` | 1159-1350 |
| 决策记录 | `src/caisen/systems/monitor/recordClosingDecision.ts` | 1-200 |

---

## 总结

✅ **蔡森策略的交易方向逻辑总体正确**

- 开仓方向正确
- 平仓方向正确反向
- 止盈/止损触发条件正确
- 加仓方向正确
- 峰值回落趋势判断正确

⚠️ **需要关注的问题**

- 空头价格变动计算需要补充
- 建议添加更多方向验证日志

---

**快速参考版本**: 1.0  
**适用范围**: 蔡森策略所有交易方向相关操作  
**最后更新**: 2025年
