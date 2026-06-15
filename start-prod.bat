@echo off
title ChatRoom v3.0 - Production Mode
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   ChatRoom v3.0 - Production Launch
echo ========================================
echo.

:: Check PM2
where pm2 >nul 2>nul
if %ERRORLEVEL% NEQ 0 ( echo PM2 not installed. Run: npm install -g pm2 && pause && exit /b )

:: Build
echo [1/3] Building...
cd /d "%PROJECT_DIR%client" && call npm run build
cd /d "%PROJECT_DIR%"

:: Start via PM2
echo [2/3] Launching with PM2...
pm2 start ecosystem.config.js
pm2 save

:: Ngrok
echo [3/3] Starting ngrok...
start "Ngrok" cmd /k "ngrok http 3001 --domain=parakeet-nimble-cage.ngrok-free.dev"

echo.
echo ========================================
echo   Production server running via PM2
echo.
echo   Status : pm2 status
echo   Logs   : pm2 logs
echo   Restart: pm2 restart chatroom-server
echo   Health : http://localhost:3001/health
echo   Public : check Ngrok window
echo ========================================
echo.
pause
