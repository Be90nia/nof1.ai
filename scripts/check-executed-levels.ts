import { createClient } from "@libsql/client";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

async function checkExecutedLevels() {
  const result = await dbClient.execute(
    "SELECT symbol, partial_close_percentage, executed_levels, exit_strategy FROM positions WHERE symbol IN ('BNB', 'DOGE')"
  );

  console.log("=== 持仓退出策略状态 ===\n");
  
  for (const row of result.rows) {
    console.log(`币种: ${row.symbol}`);
    console.log(`已平仓百分比: ${row.partial_close_percentage}%`);
    console.log(`已执行级别: ${row.executed_levels}`);
    
    if (row.exit_strategy) {
      try {
        const exitStrategy = JSON.parse(row.exit_strategy as string);
        console.log(`退出策略类型: ${exitStrategy.strategyType}`);
        
        if (exitStrategy.partialTakeProfit) {
          console.log("分批止盈配置:");
          console.log(`  stage1: trigger=${exitStrategy.partialTakeProfit.stage1?.trigger}%, closePercent=${exitStrategy.partialTakeProfit.stage1?.closePercent}%`);
          console.log(`  stage2: trigger=${exitStrategy.partialTakeProfit.stage2?.trigger}%, closePercent=${exitStrategy.partialTakeProfit.stage2?.closePercent}%`);
          console.log(`  stage3: trigger=${exitStrategy.partialTakeProfit.stage3?.trigger}%, closePercent=${exitStrategy.partialTakeProfit.stage3?.closePercent}%`);
        }
      } catch (error) {
        console.log(`解析退出策略失败: ${error}`);
      }
    }
    console.log("\n---\n");
  }
}

checkExecutedLevels().catch(console.error);
