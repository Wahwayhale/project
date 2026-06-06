@echo off
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   WeChat App - Start Script
echo ========================================
echo.

if not exist "%PROJECT_DIR%server\node_modules" (
    echo [1/4] Installing server dependencies...
    cd /d "%PROJECT_DIR%server"
    call npm install
    cd /d "%PROJECT_DIR%"
)

if not exist "%PROJECT_DIR%client\node_modules" (
    echo [2/4] Installing client dependencies...
    cd /d "%PROJECT_DIR%client"
    call npm install
    cd /d "%PROJECT_DIR%"
)

echo [3/4] Building client...
cd /d "%PROJECT_DIR%client"
call npm run build
cd /d "%PROJECT_DIR%"

echo [4/4] Starting server...
echo.

cd /d "%PROJECT_DIR%server"
start "Server-3001" cmd /k "node --env-file=.env server.js"
cd /d "%PROJECT_DIR%"

timeout /t 3 /nobreak >nul

echo Starting ngrok...
start "Ngrok-Tunnel" cmd /k "npx ngrok http 3001"

echo.
echo ========================================
echo   Done! Check Ngrok window for URL
echo ========================================
echo.
pause