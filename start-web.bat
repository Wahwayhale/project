@echo off
echo ========================================
echo   启动 Web 服务器 (浏览器访问)
echo   端口: 3001
echo ========================================
cd /d "%~dp0server"
set ENV_FILE=.env.web
node server.js
pause
