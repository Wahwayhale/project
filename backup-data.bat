@echo off
chcp 65001 >nul
title 聊天室 - 数据备份
cd /d "%~dp0"

echo ========================================
echo   备份服务器数据（server\data + server\uploads）
echo ========================================
echo.

set "BACKUP_DIR=%~dp0backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmm'"`) do set STAMP=%%i
set "ZIP=%BACKUP_DIR%\chatroom-data-%STAMP%.zip"

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%~dp0server\data\*','%~dp0server\uploads\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
    echo [错误] 备份失败，请检查 server\data 和 server\uploads 是否存在
    pause
    exit /b 1
)

echo.
echo ========================================
echo   备份完成: %ZIP%
echo.
echo   建议：定期把 backups 目录下载回本地存档
echo   （这是云机 -> 本地的方向，不要反了）
echo ========================================
pause
