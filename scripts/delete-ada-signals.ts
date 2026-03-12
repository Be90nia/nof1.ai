/**
 * 删除ADA的交易信号数据
 */

import { createClient } from "@libsql/client";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

async function deleteAdaSignals() {
  console.log("=== 删除ADA交易信号数据 ===\n");

  try {
    // 1. 查询ADA信号数量
    const countResult = await dbClient.execute({
      sql: "SELECT COUNT(*) as count FROM trading_signals WHERE symbol = 'ADA'",
      args: [],
    });

    const count = countResult.rows[0].count as number;
    console.log(`找到 ${count} 条ADA交易信号记录\n`);

    if (count === 0) {
      console.log("没有需要删除的记录");
      await dbClient.close();
      return;
    }

    // 2. 显示最近的几条记录
    const sampleResult = await dbClient.execute({
      sql: "SELECT id, symbol, timestamp, price FROM trading_signals WHERE symbol = 'ADA' ORDER BY id DESC LIMIT 5",
      args: [],
    });

    console.log("最近的5条ADA信号记录：");
    for (const row of sampleResult.rows) {
      console.log(`  ID ${row.id}: ${row.symbol} @ ${row.price} (${row.timestamp})`);
    }

    // 3. 删除ADA信号
    console.log(`\n正在删除 ${count} 条ADA交易信号...`);
    
    const deleteResult = await dbClient.execute({
      sql: "DELETE FROM trading_signals WHERE symbol = 'ADA'",
      args: [],
    });

    console.log(`✅ 已删除 ${count} 条ADA交易信号记录`);

    // 4. 验证删除结果
    const verifyResult = await dbClient.execute({
      sql: "SELECT COUNT(*) as count FROM trading_signals WHERE symbol = 'ADA'",
      args: [],
    });

    const remainingCount = verifyResult.rows[0].count as number;
    console.log(`\n验证：trading_signals表中剩余ADA记录数: ${remainingCount}`);

    if (remainingCount === 0) {
      console.log("✅ ADA交易信号数据删除完成！");
    } else {
      console.log("⚠️ 还有部分ADA记录未删除");
    }

    await dbClient.close();
  } catch (error) {
    console.error("删除过程中出错:", error);
    await dbClient.close();
    throw error;
  }
}

deleteAdaSignals().catch(console.error);
