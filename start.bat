@echo off
title ChatRoom - Full Stack
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   ChatRoom v3.0 - Full Stack Launch
echo ========================================
echo.

:: ==== 1. Check dependencies ====
if not exist "%PROJECT_DIR%server\node_modules" (
    echo [1/5] Installing server dependencies...
    cd /d "%PROJECT_DIR%server" && call npm install
    cd /d "%PROJECT_DIR%"
) else ( echo [1/5] Server deps: OK )

if not exist "%PROJECT_DIR%client\node_modules" (
    echo [2/5] Installing client dependencies...
    cd /d "%PROJECT_DIR%client" && call npm install
    cd /d "%PROJECT_DIR%"
) else ( echo [2/5] Client deps: OK )

:: ==== 2. Build ====
echo [3/5] Building client...
cd /d "%PROJECT_DIR%client" && call npm run build
cd /d "%PROJECT_DIR%"

:: ==== 3. Start server ====
echo [4/5] Starting server (port 3001)...
cd /d "%PROJECT_DIR%server"
start "ChatRoom-Server" cmd /k "set ENV_FILE=.env.web && node server.js"

timeout /t 3 /nobreak >nul

:: ==== 4. Start ngrok ====
echo [5/5] Starting ngrok tunnel...
start "Ngrok" cmd /k "ngrok http 3001 --domain=parakeet-nimble-cage.ngrok-free.dev"

echo.
echo ========================================
echo   All services started!
echo.
echo   Local   : http://localhost:3001
echo   Health  : http://localhost:3001/health
echo   Public  : check Ngrok window
echo ========================================
echo.
pause
