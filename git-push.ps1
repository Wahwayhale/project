param(
    [string]$Message = ""
)

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  自动更新到 GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 Git" -ForegroundColor Red
    pause
    exit 1
}

# 检查远程仓库
$remote = git remote -v
if (-not $remote) {
    Write-Host "[错误] 未配置远程仓库" -ForegroundColor Red
    Write-Host "请先执行: git remote add origin https://github.com/你的用户名/仓库名.git"
    pause
    exit 1
}

# 检查变更
$status = git status --porcelain
if (-not $status) {
    Write-Host "没有检测到任何变更，无需提交" -ForegroundColor Yellow
    pause
    exit 0
}

# 显示变更
Write-Host "[1/4] 检测到以下变更:" -ForegroundColor Green
git status --short
Write-Host ""

# 提交信息
if ([string]::IsNullOrWhiteSpace($Message)) {
    $timeStr = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $Message = "update: $timeStr"
}

Write-Host "[2/4] 暂存所有变更..." -ForegroundColor Green
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 暂存失败" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[3/4] 提交变更..." -ForegroundColor Green
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 提交失败" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[4/4] 推送到 GitHub..." -ForegroundColor Green
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 推送失败，请检查网络或权限" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ✅ 成功更新到 GitHub!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "提交信息: $Message" -ForegroundColor Gray
Write-Host ""
pause