param(
    [string]$Message = ""
)

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Auto Push to GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Git not found. Please install Git first." -ForegroundColor Red
    pause
    exit 1
}

# Check remote
$remote = git remote -v
if (-not $remote) {
    Write-Host "[ERROR] No remote repository configured." -ForegroundColor Red
    Write-Host "Run: git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git"
    pause
    exit 1
}

# Check for changes
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes detected. Nothing to commit." -ForegroundColor Yellow
    pause
    exit 0
}

# Show changes
Write-Host "[1/4] Detected changes:" -ForegroundColor Green
git status --short
Write-Host ""

# Commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "auto-update"
}

Write-Host "[2/4] Staging changes..." -ForegroundColor Green
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Staging failed" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[3/4] Committing..." -ForegroundColor Green
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Commit failed" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[4/4] Pushing to GitHub..." -ForegroundColor Green
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Push failed. Check network or permissions." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Successfully pushed to GitHub!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Commit message: $Message" -ForegroundColor Gray
Write-Host ""
pause