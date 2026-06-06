@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   自动更新到 GitHub
echo ========================================
echo.

:: 检查是否有 Git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 Git，请先安装 Git
    pause
    exit /b 1
)

:: 检查是否有远程仓库
git remote -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未配置远程仓库
    echo 请先执行: git remote add origin https://github.com/你的用户名/仓库名.git
    pause
    exit /b 1
)

:: 检查是否有变更
git status --porcelain >nul 2>nul
if %errorlevel% neq 0 (
    echo Git 仓库异常
    pause
    exit /b 1
)

git status --porcelain | findstr /r /c:"." >nul
if %errorlevel% neq 0 (
    echo 没有检测到任何变更，无需提交
    pause
    exit /b 0
)

:: 显示变更文件
echo [1/4] 检测到以下变更:
git status --short
echo.

:: 获取当前时间作为提交信息
for /f "tokens=2 delims==" %%I in ('"wmic os get localdatetime /value"') do set datetime=%%I
set DATETIME=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%:%datetime:~12,2%

:: 如果有输入参数，用作提交信息
set COMMIT_MSG=update: %DATE% %TIME%
if not "%1"=="" set COMMIT_MSG=%*

echo [2/4] 暂存所有变更...
call git add -A
if %errorlevel% neq 0 (
    echo [错误] 暂存失败
    pause
    exit /b 1
)

echo [3/4] 提交变更...
call git commit -m "%COMMIT_MSG%"
if %errorlevel% neq 0 (
    echo [错误] 提交失败
    pause
    exit /b 1
)

echo [4/4] 推送到 GitHub...
call git push
if %errorlevel% neq 0 (
    echo [错误] 推送失败，请检查网络或权限
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✅ 成功更新到 GitHub!
echo ========================================
echo.
echo 提交信息: %COMMIT_MSG%
echo.
pause