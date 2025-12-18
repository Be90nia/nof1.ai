import { dbClient } from "../src/database/dbClient";

/**
 * 验证退出策略参数是否动态生成
 * 检查最近设置的参数是否不同于默认值 5/10/15
 */
async function verifyDynamicParams() {
  try {
    console.log("=== 验证退出策略参数动态生成 ===\n");

    // 查询最近更新的退出策略参数
    const result = await dbClient.execute(
      "SELECT key, value, strategy, updated_at FROM strategy_params WHERE key LIKE 'positionExitStrategy_%' ORDER BY updated_at DESC LIMIT 10"
    );

    if (result.rows.length === 0) {
      console.log("❌ 未找到任何退出策略参数");
      return;
    }

    console.log(`找到 ${result.rows.length} 条最近的退出策略参数:\n`);

    let hasDefaultValues = 0;
    let hasDynamicValues = 0;
    const defaultPattern = [5, 10, 15];

    for (const row of result.rows) {
      const params = JSON.parse(row.value as string);
      const symbol = (row.key as string).replace("positionExitStrategy_", "");

      // 检查分批止盈参数
      const triggers = [
        params.partialTakeProfit?.stage1?.trigger,
        params.partialTakeProfit?.stage2?.trigger,
        params.partialTakeProfit?.stage3?.trigger,
      ];

      const isDefault =
        triggers[0] === defaultPattern[0] &&
        triggers[1] === defaultPattern[1] &&
        triggers[2] === defaultPattern[2];

      if (isDefault) {
        hasDefaultValues++;
        console.log(
          `❌ ${symbol}: 使用默认值 [${triggers.join(", ")}] - ${row.updated_at}`
        );
      } else {
        hasDynamicValues++;
        console.log(
          `✅ ${symbol}: 动态值 [${triggers.join(", ")}] - ${row.updated_at}`
        );
      }

      // 显示峰值回落参数
      const drawdowns = [
        params.peakDrawdown?.level1?.drawdownThreshold,
        params.peakDrawdown?.level2?.drawdownThreshold,
        params.peakDrawdown?.level3?.drawdownThreshold,
      ];
      console.log(`   峰值回落: [${drawdowns.join(", ")}]`);
      console.log("");
    }

    console.log("=== 统计结果 ===");
    console.log(`使用默认值: ${hasDefaultValues} 条`);
    console.log(`使用动态值: ${hasDynamicValues} 条`);

    if (hasDefaultValues === 0 && hasDynamicValues > 0) {
      console.log("\n✅ 修复成功！所有参数都是动态生成的。");
    } else if (hasDefaultValues > 0) {
      console.log(
        "\n⚠️ 仍有参数使用默认值，可能需要等待下一次交易决策。"
      );
    } else {
      console.log("\n⚠️ 没有足够的数据进行验证。");
    }
  } catch (error) {
    console.error("❌ 验证失败:", error);
  } finally {
    process.exit(0);
  }
}

verifyDynamicParams();
