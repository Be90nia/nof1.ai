/**
 * 检查数据库中的 executed_levels 字段
 */
import "dotenv/config";
import { createClient } from "@libsql/client";

async function checkExecutedLevels() {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    console.log(`连接数据库: ${dbUrl}`);

    const client = createClient({
      url: dbUrl,
    });

    // 查询所有持仓的 executed_levels
    const result = await client.execute(
      "SELECT symbol, quantity, executed_levels FROM positions WHERE quantity > 0"
    );

    console.log("\n当前持仓的 executed_levels 字段：");
    console.log("=".repeat(60));

    for (const row of result.rows) {
      console.log(`\n币种: ${row.symbol}`);
      console.log(`数量: ${row.quantity}`);
      console.log(`executed_levels (原始): ${row.executed_levels}`);
      
      if (row.executed_levels) {
        try {
          const parsed = JSON.parse(row.executed_levels as string);
          console.log(`executed_levels (解析后): ${JSON.stringify(parsed)}`);
          console.log(`是否为空: ${parsed.length === 0}`);
        } catch (e) {
          console.log(`解析失败: ${e}`);
        }
      } else {
        console.log(`executed_levels 为 NULL 或空`);
      }
    }

    console.log("\n" + "=".repeat(60));
    client.close();
  } catch (error: any) {
    console.error("检查失败:", error.message);
    process.exit(1);
  }
}

checkExecutedLevels();
