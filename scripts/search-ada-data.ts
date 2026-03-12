/**
 * 搜索所有可能包含ADA数据的地方
 */

import { createClient } from "@libsql/client";

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

async function searchAdaData() {
  console.log("=== 搜索ADA相关数据 ===\n");

  try {
    // 1. 检查所有表
    const tablesResult = await dbClient.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      args: [],
    });

    console.log(`数据库中的表 (${tablesResult.rows.length}):`);
    for (const row of tablesResult.rows) {
      console.log(`  - ${row.name}`);
    }

    // 2. 在每个表中搜索ADA
    console.log("\n=== 在各表中搜索ADA ===\n");

    for (const row of tablesResult.rows) {
      const tableName = row.name as string;
      
      try {
        // 获取表结构
        const columnsResult = await dbClient.execute({
          sql: `PRAGMA table_info(${tableName})`,
          args: [],
        });

        // 查找可能包含symbol的列
        const symbolColumns = columnsResult.rows.filter(
          (col: any) => 
            col.name.toLowerCase().includes('symbol') || 
            col.name.toLowerCase().includes('coin') ||
            col.name.toLowerCase().includes('asset')
        );

        if (symbolColumns.length > 0) {
          for (const col of symbolColumns) {
            const columnName = col.name as string;
            
            // 搜索ADA
            const searchResult = await dbClient.execute({
              sql: `SELECT COUNT(*) as count FROM ${tableName} WHERE ${columnName} LIKE '%ADA%'`,
              args: [],
            });

            const count = searchResult.rows[0].count as number;
            if (count > 0) {
              console.log(`✓ 在表 ${tableName}.${columnName} 中找到 ${count} 条ADA记录`);
              
              // 显示详细记录
              const detailResult = await dbClient.execute({
                sql: `SELECT * FROM ${tableName} WHERE ${columnName} LIKE '%ADA%' LIMIT 5`,
                args: [],
              });
              
              for (const record of detailResult.rows) {
                console.log(`  记录:`, record);
              }
            }
          }
        }
      } catch (error) {
        // 跳过无法查询的表
      }
    }

    console.log("\n=== 搜索完成 ===");
    console.log("如果没有找到ADA数据，说明数据库中确实没有ADA记录。");
    console.log("可能的情况：");
    console.log("  1. ADA数据已经被删除");
    console.log("  2. ADA数据在Web界面的缓存中（刷新页面即可清除）");
    console.log("  3. ADA数据在其他数据库文件中");

    await dbClient.close();
  } catch (error) {
    console.error("搜索过程中出错:", error);
    await dbClient.close();
    throw error;
  }
}

searchAdaData().catch(console.error);
