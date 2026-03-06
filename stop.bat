@echo off
REM Reading Clipper - 停止所有服务

echo ========================================
echo  停止 Reading Clipper 所有服务...
echo ========================================
echo.

echo [1/3] 停止 Node.js 后端...
taskkill /F /FI "WINDOWTITLE eq Reading Clipper Backend*" >nul 2>&1
taskkill /F /FI "IMAGENAME eq node.exe" /FI "MEMUSAGE gt 50000" >nul 2>&1

echo [2/3] 停止 Python Sidecar...
taskkill /F /FI "IMAGENAME eq python.exe" /FI "MEMUSAGE gt 50000" >nul 2>&1

echo [3/3] 停止前端开发服务器...
taskkill /F /FI "WINDOWTITLE eq Reading Clipper Frontend*" >nul 2>&1

echo.
echo ========================================
echo  所有服务已停止
echo ========================================
echo.
pause
