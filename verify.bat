@echo off
title ChatRoom - Pre-release Health Check
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   ChatRoom v3.0 - Health Check
echo ========================================
echo.

:: ==== 1. Backend syntax check ====
echo [1/3] Backend syntax check...
cd /d "%PROJECT_DIR%server"
node --check server.js
if %ERRORLEVEL% NEQ 0 ( echo [FAIL] server.js has syntax error && pause && exit /b 1 )
node --check db.js
if %ERRORLEVEL% NEQ 0 ( echo [FAIL] db.js has syntax error && pause && exit /b 1 )
echo       OK
echo.

:: ==== 2. Backend tests ====
echo [2/3] Backend tests...
call npm test
if %ERRORLEVEL% NEQ 0 ( echo [FAIL] Tests failed && pause && exit /b 1 )
echo       OK
echo.

:: ==== 3. Frontend build ====
echo [3/3] Frontend build...
cd /d "%PROJECT_DIR%client"
call npm run build
if %ERRORLEVEL% NEQ 0 ( echo [FAIL] Frontend build failed && pause && exit /b 1 )
echo       OK
echo.

cd /d "%PROJECT_DIR%"
echo ========================================
echo   All checks passed - safe to deploy
echo ========================================
echo.
pause
