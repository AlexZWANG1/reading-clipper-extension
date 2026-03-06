@echo off
REM Reading Clipper - 一键启动脚本
REM 自动启动后端（含 sidecar）和前端

cd /d %~dp0

echo ========================================
echo  Reading Clipper 启动中...
echo ========================================
echo.
echo [1/2] 启动后端 + Sidecar (端口 3000 + 8100)
start "Reading Clipper Backend" cmd /k "cd reading-cards-backend && npm start"

timeout /t 2 /nobreak >nul

echo [2/2] 启动前端 (端口 5173)
start "Reading Clipper Frontend" cmd /k "cd web-app && npm run dev"

echo.
echo ========================================
echo  启动完成！
echo ========================================
echo.
echo  后端: http://localhost:3000
echo  前端: http://localhost:5173
echo  Sidecar: http://localhost:8100
echo.
echo  按任意键关闭此窗口...
pause >nul
