#!/bin/bash

# Verity 快速测试脚本

echo "========================================="
echo "Verity 转型 - 快速测试"
echo "========================================="
echo ""

# 检查服务状态
echo "1. 检查后端服务..."
if curl -s http://localhost:3000/ > /dev/null; then
    echo "✅ 后端服务运行中 (http://localhost:3000)"
else
    echo "❌ 后端服务未启动"
    echo "   请运行: cd reading-cards-backend && npm start"
    exit 1
fi

echo ""
echo "2. 检查前端服务..."
if curl -s http://localhost:5173/ > /dev/null; then
    echo "✅ 前端服务运行中 (http://localhost:5173)"
else
    echo "❌ 前端服务未启动"
    echo "   请运行: cd web-app && npm run dev"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ 所有服务正常运行"
echo "========================================="
echo ""
echo "测试步骤："
echo "1. 访问 http://localhost:5173"
echo "2. 登录系统"
echo "3. 验证品牌：Logo 显示 'Verity' + 天平图标"
echo "4. 验证导航：四组导航（Reader | Workbench | Copilot | Settings）"
echo "5. 创建 Topic：在左侧点击 '+' 创建新议题"
echo "6. 导入来源：在来源库添加 URL"
echo "7. 提取证据：在 Reader 中高亮文本并建卡"
echo "8. 查看 Workbench：选中 Topic，查看三个 Tab"
echo ""
echo "详细测试清单请查看: VERITY-TESTING.md"
echo ""
