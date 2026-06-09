@echo off
echo ========================================
echo   启动 App 服务器 (Capacitor OTA)
echo   端口: 3002
echo ========================================
cd /d "%~dp0server"
set ENV_FILE=.env.app
node server.js
pause
