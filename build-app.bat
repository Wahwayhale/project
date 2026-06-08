@echo off
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   Build App - WeChat App
echo ========================================
echo.

:: Read current version
set OTA_FILE=%PROJECT_DIR%client\public\ota-version.json

if not exist "%OTA_FILE%" (
    echo [ERROR] ota-version.json not found
    pause
    exit /b 1
)

:: Read current build number
for /f "tokens=2 delims=:, " %%a in ('findstr "buildNumber" "%OTA_FILE%"') do set BUILD_NUM=%%a
set BUILD_NUM=%BUILD_NUM:"=%

:: Increment build number
set /a NEW_BUILD=%BUILD_NUM%+1

:: Update build number in ota-version.json
powershell -Command "(Get-Content '%OTA_FILE%') -replace '\"buildNumber\": %BUILD_NUM%', '\"buildNumber\": %NEW_BUILD%' | Set-Content '%OTA_FILE%'"

echo [1/5] Version: build %BUILD_NUM% ^-> %NEW_BUILD%
echo [2/5] Building React app...
cd /d "%PROJECT_DIR%client"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)
echo Build successful.

echo [3/5] Copying to Capacitor...
call npx cap copy
if %errorlevel% neq 0 (
    echo [WARN] Cap copy failed (Android not initialized yet)
)

echo [4/5] Syncing Android...
call npx cap sync android
if %errorlevel% neq 0 (
    echo [WARN] Cap sync failed (Android not initialized yet)
)

echo [5/5] Done!
echo.
echo Build number: %NEW_BUILD%
echo Output: client\build\
echo.
echo To generate APK, run:
echo   cd client && npx cap open android
echo Then in Android Studio: Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo.
pause