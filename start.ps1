# 微信风格聊天应用 - 启动脚本
# 使用方法: ./start.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  微信风格聊天应用 - 启动脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查后端依赖
if (-not (Test-Path "server\node_modules")) {
    Write-Host "[1/4] 安装后端依赖..." -ForegroundColor Yellow
    Set-Location server
    npm install
    Set-Location ..
}

# 检查前端依赖
if (-not (Test-Path "client\node_modules")) {
    Write-Host "[2/4] 安装前端依赖..." -ForegroundColor Yellow
    Set-Location client
    npm install
    Set-Location ..
}

# 构建前端
Write-Host "[3/4] 构建前端..." -ForegroundColor Yellow
Set-Location client
npm run build
Set-Location ..

# 启动后端服务
Write-Host "[4/4] 启动后端服务..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  服务启动中..." -ForegroundColor Green
Write-Host "  后端地址: http://localhost:3001" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# 启动后端
Set-Location server
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node --env-file=.env server.js"
Set-Location ..

# 等待后端启动
Start-Sleep -Seconds 3

# 启动ngrok
Write-Host "正在启动ngrok..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx ngrok http 3001"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  启动完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "请在浏览器中访问 ngrok 窗口中显示的公网地址" -ForegroundColor Cyan
Write-Host "例如: https://xxxx-xxx-xxx.ngrok-free.dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")