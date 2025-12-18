import { dbClient } from "../src/database/dbClient";

async function checkExitStrategy() {
  try {
    console.log("=== 检查退出策略参数 ===\n");

    // 查询所有退出策略参数
    const result = await dbClient.execute(
      "SELECT key, value, strategy, updated_at, description FROM strategy_params WHERE key LIKE 'positionExitStrategy_%' ORDER BY updated_at DESC"
    );

    if (result.rows.length === 0) {
      console.log("❌ 未找到任何退出策略参数");
      return;
    }

    console.log(`✅ 找到 ${result.rows.length} 条退出策略参数:\n`);

    for (const row of result.rows) {
      console.log(`\n📌 ${row.key}`);
      console.log(`策略: ${row.strategy}`);
      console.log(`更新时间: ${row.updated_at}`);
      console.log(`描述: ${row.description}`);
      console.log(`\n参数详情:`);

      try {
        const params = JSON.parse(row.value as string);
        console.log(JSON.stringify(params, null, 2));
      } catch (e) {
        console.log("❌ 参数解析失败:", row.value);
      }

      console.log("\n" + "=".repeat(80));
    }
  } catch (error) {
    console.error("❌ 检查失败:", error);
  } finally {
    process.exit(0);
  }
}

checkExitStrategy();
