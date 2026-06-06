@echo off
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ========================================
echo   Auto Push to GitHub
echo ========================================
echo.

:: Check git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git not found. Please install Git first.
    pause
    exit /b 1
)

:: Check remote
git remote -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No remote repository configured.
    echo Run: git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
    pause
    exit /b 1
)

:: Check for changes
git status --porcelain >nul 2>nul
if %errorlevel% neq 0 (
    echo Git repository error
    pause
    exit /b 1
)

git status --porcelain | findstr /r /c:"." >nul
if %errorlevel% neq 0 (
    echo No changes detected. Nothing to commit.
    pause
    exit /b 0
)

:: Show changes
echo [1/4] Detected changes:
git status --short
echo.

:: Commit message
set COMMIT_MSG=auto-update
if not "%*"=="" set COMMIT_MSG=%*

echo [2/4] Staging changes...
call git add -A
if %errorlevel% neq 0 (
    echo [ERROR] Staging failed
    pause
    exit /b 1
)

echo [3/4] Committing...
call git commit -m "%COMMIT_MSG%"
if %errorlevel% neq 0 (
    echo [ERROR] Commit failed
    pause
    exit /b 1
)

echo [4/4] Pushing to GitHub...
call git push
if %errorlevel% neq 0 (
    echo [ERROR] Push failed. Check network or permissions.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Successfully pushed to GitHub!
echo ========================================
echo.
echo Commit message: %COMMIT_MSG%
echo.
pause