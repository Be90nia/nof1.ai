/**
 * 检查交易所实际持仓与数据库记录的差异
 */

import { createClient } from "@libsql/client";
import { createExchangeClient } from "../src/services/exchangeClient";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

async function checkActualPosition() {
  try {
    console.log("=".repeat(60));
    console.log("检查交易所实际持仓与数据库记录的差异");
    console.log("=".repeat(60));

    const exchangeClient = createExchangeClient();

    // 1. 获取交易所实际持仓
    console.log("\n📊 交易所实际持仓:");
    const positions = await exchangeClient.getPositions();
    const xrpPosition = positions.find((p: any) => p.contract === "XRP_USDT");

    if (xrpPosition) {
      const size = Number.parseInt(xrpPosition.size || "0");
      const quantity = Math.abs(size);
      console.log(`  币种: XRP`);
      console.log(`  数量: ${quantity}张`);
      console.log(`  方向: ${size > 0 ? "做多" : "做空"}`);
      console.log(`  入场价: ${xrpPosition.entryPrice}`);
      console.log(`  当前价: ${xrpPosition.markPrice}`);
      console.log(`  未实现盈亏: ${xrpPosition.unrealisedPnl}`);
    } else {
      console.log("  ❌ 未找到XRP持仓");
    }

    // 2. 获取数据库记录
    console.log("\n📋 数据库记录:");
    const dbResult = await dbClient.execute({
      sql: `SELECT 
              symbol, 
              quantity, 
              entry_price,
              side,
              partial_close_percentage,
              executed_levels
            FROM positions 
            WHERE symbol = ?`,
      args: ["XRP"],
    });

    if (dbResult.rows.length > 0) {
      const dbPos = dbResult.rows[0];
      console.log(`  币种: ${dbPos.symbol}`);
      console.log(`  数量: ${dbPos.quantity}张`);
      console.log(`  方向: ${dbPos.side}`);
      console.log(`  入场价: ${dbPos.entry_price}`);
      console.log(`  已平仓百分比: ${dbPos.partial_close_percentage}%`);
      console.log(`  已执行级别: ${dbPos.executed_levels}`);
    } else {
      console.log("  ❌ 未找到XRP持仓记录");
    }

    // 3. 对比差异
    if (xrpPosition && dbResult.rows.length > 0) {
      const exchangeQuantity = Math.abs(Number.parseInt(xrpPosition.size || "0"));
      const dbQuantity = Number.parseFloat(dbResult.rows[0].quantity as string);
      const diff = Math.abs(exchangeQuantity - dbQuantity);

      console.log("\n⚖️ 差异分析:");
      console.log(`  交易所数量: ${exchangeQuantity}张`);
      console.log(`  数据库数量: ${dbQuantity}张`);
      console.log(`  差异: ${diff}张`);

      if (diff > 0.01) {
        console.log(`  ⚠️ 数据不一致！需要同步`);
      } else {
        console.log(`  ✅ 数据一致`);
      }
    }

    console.log("\n" + "=".repeat(60));
  } catch (error: any) {
    console.error(`❌ 检查失败: ${error.message}`);
    throw error;
  }
}

checkActualPosition()
  .then(() => {
    console.log("✅ 检查完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 检查失败:", error);
    process.exit(1);
  });
