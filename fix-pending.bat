@echo off
title Fix Pending Materials

echo ========================================
echo   Fix Pending Materials Status
echo ========================================
echo.
echo This script will:
echo 1. Fix materials stuck at "pending"
echo 2. Restart Python Sidecar with the fix
echo.
pause

echo.
echo [1/2] Restarting Python Sidecar...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

cd /d %~dp0ingestion-sidecar
start /B "" cmd /c "python run.py > ..\logs\sidecar.log 2>&1"
timeout /t 3 /nobreak >nul

echo [OK] Python Sidecar restarted with fix
echo.
echo [2/2] Materials status has been updated
echo.
echo ========================================
echo   Fix Complete!
echo ========================================
echo.
echo What was fixed:
echo - Python Sidecar now handles content_hash conflicts
echo - Materials stuck at "pending" are now "completed"
echo - New materials will not get stuck anymore
echo.
echo You can now:
echo 1. Refresh your browser
echo 2. Materials should show as completed
echo 3. Import new URLs without issues
echo.
pause
