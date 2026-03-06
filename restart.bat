@echo off
echo ========================================
echo 正在停止旧服务...
echo ========================================

REM 杀掉所有 Node.js 进程
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js 进程已停止
) else (
    echo [INFO] 没有运行中的 Node.js 进程
)

REM 杀掉所有 Python 进程
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python 进程已停止
) else (
    echo [INFO] 没有运行中的 Python 进程
)

REM 等待端口释放
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo 正在启动新服务...
echo ========================================

REM 启动后端（会自动启动 sidecar）
start "Reading Clipper Backend" cmd /k "cd /d %~dp0reading-cards-backend && npm start"

REM 等待后端启动
timeout /t 3 /nobreak >nul

REM 启动前端
start "Reading Clipper Frontend" cmd /k "cd /d %~dp0web-app && npm run dev"

echo.
echo ========================================
echo 服务启动完成！
echo ========================================
echo 后端 + Sidecar: http://localhost:3000
echo 前端: http://localhost:5173
echo ========================================
