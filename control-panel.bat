@echo off
title Reading Clipper - Control Panel

:menu
cls
echo.
echo ========================================
echo   Reading Clipper 2.0 Control Panel
echo ========================================
echo.
echo  Current Status:
echo  ----------------------------------------

REM Check service status
netstat -ano | findstr ":8200" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Content Fetch    Port 8200
) else (
    echo  [ ] Content Fetch    Stopped
)

netstat -ano | findstr ":8100" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Python Sidecar   Port 8100
) else (
    echo  [ ] Python Sidecar   Stopped
)

netstat -ano | findstr ":3001" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Backend          Port 3001
) else (
    echo  [ ] Backend          Stopped
)

netstat -ano | findstr ":5173" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Web App          Port 5173
) else (
    echo  [ ] Web App          Stopped
)

echo  ----------------------------------------
echo.
echo  Options:
echo.
echo  [1] Start All Services
echo  [2] Stop All Services
echo  [3] Restart All Services
echo  [4] Open App
echo  [5] View Logs
echo  [6] Refresh Status
echo  [0] Exit
echo.
echo ========================================
set /p choice=Select (0-6):

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto open
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto menu
if "%choice%"=="0" goto exit
goto menu

:start
cls
echo.
echo Starting all services...
echo.

if not exist logs mkdir logs

echo [1/4] Starting Content Fetch Service...
start /B "" cmd /c "cd /d %~dp0content-fetch-service && npm start > ..\logs\content-fetch.log 2>&1"
timeout /t 2 /nobreak >nul

echo [2/4] Starting Python Sidecar...
start /B "" cmd /c "cd /d %~dp0ingestion-sidecar && python run.py > ..\logs\sidecar.log 2>&1"
timeout /t 2 /nobreak >nul

echo [3/4] Starting Backend...
start /B "" cmd /c "cd /d %~dp0reading-cards-backend && npm run backend-only > ..\logs\backend.log 2>&1"
timeout /t 2 /nobreak >nul

echo [4/4] Starting Web App...
start /B "" cmd /c "cd /d %~dp0web-app && npm run dev > ..\logs\web-app.log 2>&1"
timeout /t 2 /nobreak >nul

echo.
echo All services started!
echo.
echo Opening browser in 5 seconds...
timeout /t 5 /nobreak >nul
start http://localhost:5173
pause
goto menu

:stop
cls
echo.
echo Stopping all services...
echo.

taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js services stopped
) else (
    echo [INFO] No Node.js services running
)

taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python services stopped
) else (
    echo [INFO] No Python services running
)

echo.
echo All services stopped!
echo.
pause
goto menu

:restart
cls
echo.
echo Restarting all services...
echo.

echo [1/2] Stopping old services...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] Stopped

echo [2/2] Starting new services...
if not exist logs mkdir logs

start /B "" cmd /c "cd /d %~dp0content-fetch-service && npm start > ..\logs\content-fetch.log 2>&1"
start /B "" cmd /c "cd /d %~dp0ingestion-sidecar && python run.py > ..\logs\sidecar.log 2>&1"
start /B "" cmd /c "cd /d %~dp0reading-cards-backend && npm run backend-only > ..\logs\backend.log 2>&1"
start /B "" cmd /c "cd /d %~dp0web-app && npm run dev > ..\logs\web-app.log 2>&1"

timeout /t 5 /nobreak >nul
echo [OK] Started

echo.
echo Restart complete!
echo.
pause
goto menu

:open
start http://localhost:5173
goto menu

:logs
cls
echo.
echo View Logs
echo ========================================
echo.
echo  [1] Content Fetch Log
echo  [2] Python Sidecar Log
echo  [3] Backend Log
echo  [4] Web App Log
echo  [5] Open Logs Folder
echo  [0] Back to Main Menu
echo.
set /p logchoice=Select (0-5):

if "%logchoice%"=="1" (
    if exist logs\content-fetch.log (
        cls
        echo Content Fetch Log (Last 30 lines):
        echo ========================================
        powershell -Command "Get-Content logs\content-fetch.log -Tail 30"
        echo.
        pause
    ) else (
        echo Log file not found
        pause
    )
    goto logs
)

if "%logchoice%"=="2" (
    if exist logs\sidecar.log (
        cls
        echo Python Sidecar Log (Last 30 lines):
        echo ========================================
        powershell -Command "Get-Content logs\sidecar.log -Tail 30"
        echo.
        pause
    ) else (
        echo Log file not found
        pause
    )
    goto logs
)

if "%logchoice%"=="3" (
    if exist logs\backend.log (
        cls
        echo Backend Log (Last 30 lines):
        echo ========================================
        powershell -Command "Get-Content logs\backend.log -Tail 30"
        echo.
        pause
    ) else (
        echo Log file not found
        pause
    )
    goto logs
)

if "%logchoice%"=="4" (
    if exist logs\web-app.log (
        cls
        echo Web App Log (Last 30 lines):
        echo ========================================
        powershell -Command "Get-Content logs\web-app.log -Tail 30"
        echo.
        pause
    ) else (
        echo Log file not found
        pause
    )
    goto logs
)

if "%logchoice%"=="5" (
    start explorer logs
    goto logs
)

if "%logchoice%"=="0" goto menu
goto logs

:exit
cls
echo.
echo Thank you for using Reading Clipper!
echo.
timeout /t 2 /nobreak >nul
exit
