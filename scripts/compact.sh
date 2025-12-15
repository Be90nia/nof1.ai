#!/bin/bash

# open-nof1.ai - AI 加密货币自动交易系统
# Copyright (C) 2025 195440
# 
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
# 
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

# AI 加密货币自动交易系统 - 系统清理与优化脚本
# 使用方法: bash scripts/compact.sh

set -e  # 遇到错误立即退出

echo "================================================================================"
echo "🧹 AI 加密货币自动交易系统 - 系统清理与优化"
echo "================================================================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认保留天数
DEFAULT_RETENTION_DAYS=30
RETENTION_DAYS=${1:-$DEFAULT_RETENTION_DAYS}

echo -e "${BLUE}配置参数:${NC}"
echo -e "  保留天数: ${GREEN}${RETENTION_DAYS}${NC} 天"
echo ""

# 步骤 1：环境检查
echo "📋 步骤 1/6：检查环境..."
echo ""

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
    echo ""
    echo "请先创建 .env 文件并配置必要的环境变量"
    exit 1
fi

echo -e "${GREEN}✅ 找到 .env 文件${NC}"
echo ""

# 步骤 2：停止交易系统（如果正在运行）
echo "🛑 步骤 2/6：停止交易系统..."
echo ""

# 检查是否有交易系统进程在运行
if pgrep -f "npm run trading:start" > /dev/null; then
    echo "正在停止交易系统..."
    pkill -f "npm run trading:start" || true
    sleep 3
    
    # 确认进程已停止
    if pgrep -f "npm run trading:start" > /dev/null; then
        echo -e "${YELLOW}⚠️  交易系统仍在运行，强制停止...${NC}"
        pkill -9 -f "npm run trading:start" || true
    fi
    
    echo -e "${GREEN}✓${NC} 交易系统已停止"
else
    echo -e "${GREEN}✓${NC} 交易系统未运行"
fi

# 杀死占用 3100 端口的进程（监控界面）
if lsof -ti:3100 >/dev/null 2>&1; then
    echo "正在释放端口 3100..."
    lsof -ti:3100 | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 已释放端口 3100"
else
    echo -e "${GREEN}✓${NC} 端口 3100 未被占用"
fi

# 等待进程完全停止
sleep 2
echo ""

# 步骤 3：清理旧日志文件
echo "📝 步骤 3/6：清理旧日志文件..."
echo ""

# 清理 PM2 日志
if [ -d ".pm2/logs" ]; then
    echo "清理 PM2 日志..."
    find .pm2/logs -name "*.log" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    echo -e "${GREEN}✓${NC} PM2 日志已清理"
fi

# 清理应用日志
if [ -d "logs" ]; then
    echo "清理应用日志..."
    find logs -name "*.log" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 应用日志已清理"
fi

# 清理系统日志
if [ -d ".voltagent" ]; then
    echo "清理系统日志..."
    find .voltagent -name "*.log" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    echo -e "${GREEN}✓${NC} 系统日志已清理"
fi
echo ""

# 步骤 4：数据库优化
echo "🗄️  步骤 4/6：数据库优化..."
echo ""

# 检查数据库文件是否存在
if [ -f ".voltagent/trading.db" ]; then
    echo "优化数据库..."
    
    # 创建临时脚本来优化数据库
    cat > temp_db_optimize.js << 'EOF'
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), '.voltagent', 'trading.db');
const db = new sqlite3.Database(dbPath);

console.log('开始数据库优化...');

// 执行 VACUUM 命令来优化数据库
db.serialize(() => {
    // 获取当前数据库大小
    db.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", (err, row) => {
        if (!err && row) {
            const sizeInMB = (row.size / (1024 * 1024)).toFixed(2);
            console.log(`优化前数据库大小: ${sizeInMB} MB`);
        }
    });
    
    // 执行 VACUUM
    db.run("VACUUM", (err) => {
        if (err) {
            console.error('数据库优化失败:', err.message);
            process.exit(1);
        }
        
        console.log('数据库优化完成');
        
        // 获取优化后数据库大小
        db.get("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()", (err, row) => {
            if (!err && row) {
                const sizeInMB = (row.size / (1024 * 1024)).toFixed(2);
                console.log(`优化后数据库大小: ${sizeInMB} MB`);
            }
            
            db.close();
        });
    });
});
EOF

    # 执行数据库优化
    node temp_db_optimize.js
    rm temp_db_optimize.js
    
    echo -e "${GREEN}✓${NC} 数据库优化完成"
else
    echo -e "${YELLOW}⚠${NC} 数据库文件不存在，跳过优化"
fi
echo ""

# 步骤 5：清理临时文件
echo "🗑️  步骤 5/6：清理临时文件..."
echo ""

# 清理 Node.js 缓存
if [ -d "node_modules/.cache" ]; then
    echo "清理 Node.js 缓存..."
    rm -rf node_modules/.cache 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Node.js 缓存已清理"
fi

# 清理 TypeScript 编译缓存
if [ -d "dist" ]; then
    echo "清理 TypeScript 编译缓存..."
    rm -rf dist 2>/dev/null || true
    echo -e "${GREEN}✓${NC} TypeScript 编译缓存已清理"
fi

# 清理临时文件
echo "清理系统临时文件..."
find . -name "*.tmp" -type f -delete 2>/dev/null || true
find . -name ".DS_Store" -type f -delete 2>/dev/null || true
echo -e "${GREEN}✓${NC} 临时文件已清理"
echo ""

# 步骤 6：重新构建项目
echo "🔨 步骤 6/6：重新构建项目..."
echo ""

echo "重新构建项目..."
npm run build
echo -e "${GREEN}✓${NC} 项目构建完成"
echo ""

# 完成提示
echo "================================================================================"
echo -e "${GREEN}✅ 系统清理与优化完成！${NC}"
echo "================================================================================"
echo ""
echo "已完成的操作："
echo -e "  ${BLUE}1.${NC} 停止了交易系统"
echo -e "  ${BLUE}2.${NC} 清理了 ${RETENTION_DAYS} 天前的日志文件"
echo -e "  ${BLUE}3.${NC} 优化了数据库"
echo -e "  ${BLUE}4.${NC} 清理了临时文件和缓存"
echo -e "  ${BLUE}5.${NC} 重新构建了项目"
echo ""
echo "接下来可以："
echo -e "  ${BLUE}npm run trading:start${NC}  - 重新启动交易系统"
echo -e "  ${BLUE}npm run dev${NC}            - 开发模式运行"
echo -e "  ${BLUE}npm run docker:start${NC}   - Docker 模式运行"
echo ""