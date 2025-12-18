/**
 * 添加 executed_levels 字段到现有数据库
 */
import "dotenv/config";
import { createClient } from "@libsql/client";

async function addExecutedLevelsColumn() {
  try {
    const dbUrl = process.env.DATABASE_URL || "file:./.voltagent/trading.db";
    console.log(`连接数据库: ${dbUrl}`);

    const client = createClient({ url: dbUrl });

    // 检查字段是否已存在
    const tableInfo = await client.execute("PRAGMA table_info(positions)");
    const columnExists = tableInfo.rows.some(
      (row: any) => row.name === "executed_levels"
    );

    if (columnExists) {
      console.log("✅ executed_levels 字段已存在，无需添加");
      client.close();
      return;
    }

    // 添加字段
    console.log("添加 executed_levels 字段...");
    await client.execute(`
      ALTER TABLE positions 
      ADD COLUMN executed_levels TEXT DEFAULT '[]'
    `);

    console.log("✅ 成功添加 executed_levels 字段");
    client.close();
  } catch (error) {
    console.error("❌ 添加字段失败:", error);
    process.exit(1);
  }
}

addExecutedLevelsColumn();
