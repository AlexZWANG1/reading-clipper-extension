@echo off
chcp 65001 >nul
echo ========================================
echo Stopping old services...
echo ========================================

REM Kill all Node.js processes
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js stopped
) else (
    echo [INFO] No Node.js running
)

REM Kill all Python processes
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python stopped
) else (
    echo [INFO] No Python running
)

REM Wait for port release
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo Starting new services...
echo ========================================

REM Start backend (auto-starts sidecar)
start "Backend+Sidecar" cmd /k "cd /d %~dp0reading-cards-backend && npm start"

REM Wait for backend init
timeout /t 3 /nobreak >nul

REM Start frontend
start "Frontend" cmd /k "cd /d %~dp0web-app && npm run dev"

echo.
echo ========================================
echo Services started!
echo ========================================
echo Backend + Sidecar: http://localhost:3000
echo Frontend: http://localhost:5173
echo ========================================
