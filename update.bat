@echo off
chcp 65001 >nul
title 聊天室 - 云端更新
cd /d "%~dp0"

echo ========================================
echo   聊天室 云端更新（Git 拉取最新代码）
echo ========================================
echo.

:: ---- 首次接入检查：云机上还没有 .git 时给出引导 ----
if not exist "%~dp0.git" (
    echo [提示] 本目录还没有接入 Git，请先复制粘贴执行一次以下命令：
    echo.
    echo   cd /d "%~dp0"
    echo   git init
    echo   git remote add origin https://github.com/Wahwayhale/project.git
    echo   git fetch origin
    echo   git checkout -b dev origin/dev
    echo   git pull
    echo.
    echo 完成后重新双击本脚本。
    echo （server\data、server\uploads、.env.web 不受影响，不会被覆盖）
    pause
    exit /b 1
)

echo [1/4] 拉取最新代码 (origin/dev)...
git pull origin dev
if errorlevel 1 (
    echo [错误] git pull 失败
    echo   1. 先确认本地已推送：本地双击 git-push.bat
    echo   2. 确认云机能访问 github.com
    echo   3. 若本地有未提交的冲突文件，先手动处理
    pause
    exit /b 1
)

echo [2/4] 安装前端依赖并构建...
cd /d "%~dp0client"
call npm install --no-audit --no-fund
call npm run build
if errorlevel 1 ( echo [错误] 前端构建失败 & pause & exit /b 1 )

echo [3/4] 安装后端依赖...
cd /d "%~dp0server"
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 ( echo [错误] 后端依赖安装失败 & pause & exit /b 1 )

echo [4/4] 重启服务...
cd /d "%~dp0"
pm2 restart chatroom-server
pm2 save

echo.
echo ========================================
echo   更新完成！
echo   健康检查: http://localhost:3001/health
echo   公网地址: https://parakeet-nimble-cage.ngrok-free.dev
echo ========================================
pause
