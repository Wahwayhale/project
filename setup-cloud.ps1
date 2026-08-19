#requires -Version 5.1
<#
.SYNOPSIS
    聊天室 v3.0.0 云机一键部署（Windows Server 2022 Standard 纯净版）

.DESCRIPTION
    自动完成：Node.js 安装/检测 -> 依赖安装 -> 前端构建 -> .env.web 检查
    -> PM2 启动 + 开机自启 -> ngrok 隧道（复用固定域名）-> 健康检查。
    可重复运行（幂等），出问题可按提示分步排查。

.PARAMETER ProjectRoot
    项目根目录（默认：脚本所在目录）。

.PARAMETER NgrokToken
    ngrok authtoken。必须与本地使用同一 ngrok 账号，固定域名才能复用。
    也可通过环境变量 NGROK_AUTHTOKEN 提供。

.PARAMETER NgrokDomain
    ngrok 固定域名（默认 parakeet-nimble-cage.ngrok-free.dev）。

.PARAMETER NodeMajor
    要安装的 Node 大版本（默认 22；项目要求 >= 20.6，因为用了 --env-file）。

.PARAMETER SkipNode
    跳过 Node.js 安装/检测。

.PARAMETER SkipBuild
    跳过前端构建。

.PARAMETER SkipNgrok
    跳过 ngrok 下载/配置/隧道。

.PARAMETER SkipPm2Start
    只安装配置，不启动 pm2 应用（配合手动 start-prod.bat）。

.PARAMETER SkipDataCheck
    跳过数据目录检查。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File setup-cloud.ps1 -NgrokToken <你的token>

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File setup-cloud.ps1 -SkipNgrok -SkipBuild
#>
[CmdletBinding()]
param(
    [string]$ProjectRoot = $PSScriptRoot,
    [string]$NgrokToken = $env:NGROK_AUTHTOKEN,
    [string]$NgrokDomain = 'parakeet-nimble-cage.ngrok-free.dev',
    [int]$NodeMajor = 22,
    [switch]$SkipNode,
    [switch]$SkipBuild,
    [switch]$SkipNgrok,
    [switch]$SkipPm2Start,
    [switch]$SkipDataCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- 工具函数 ----------
function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[!!] $msg" -ForegroundColor Red }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

# ---------- 0. 日志 + 管理员提权 ----------
$logDir = Join-Path $ProjectRoot 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
Start-Transcript -Path (Join-Path $logDir 'setup-cloud.log') -Append | Out-Null

if (-not (Test-Admin)) {
    Write-Warn '需要管理员权限，正在自动请求提权（请在弹出的 UAC 窗口点"是"）...'
    $argParts = @()
    foreach ($k in $PSBoundParameters.Keys) {
        $v = $PSBoundParameters[$k]
        if ($v -is [switch]) { if ($v) { $argParts += "-$k" } }
        else                  { $argParts += "-$k", "`"$v`"" }
    }
    $argLine = $argParts -join ' '
    $p = Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", $argLine
    ) -Wait -PassThru
    Stop-Transcript | Out-Null
    exit $p.ExitCode
}

Write-Step '聊天室 v3.0.0 云机一键部署'
Write-Host "项目目录: $ProjectRoot"
Write-Host "ngrok 域名: $NgrokDomain"

# ---------- 1. 项目结构检查 ----------
$clientDir = Join-Path $ProjectRoot 'client'
$serverDir = Join-Path $ProjectRoot 'server'
foreach ($f in @((Join-Path $clientDir 'package.json'), (Join-Path $serverDir 'server.js'))) {
    if (-not (Test-Path $f)) { throw "项目结构不完整，缺少: $f" }
}

# ---------- 2. Node.js ----------
if (-not $SkipNode) {
    Write-Step '步骤 1/6：Node.js 检查/安装'
    $nodeOk = $false
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $nv = & node -v 2>$null
        if ($nv -match '^v(\d+)\.(\d+)\.(\d+)') {
            $maj = [int]$Matches[1]; $min = [int]$Matches[2]
            if (($maj -gt 20) -or ($maj -eq 20 -and $min -ge 6)) { $nodeOk = $true }
        }
    }
    if ($nodeOk) {
        Write-Ok "Node 已就绪: $(& node -v) (npm $(& npm -v))"
    } else {
        Write-Host "未检测到可用 Node（需 >= 20.6），开始下载 Node $NodeMajor LTS..."
        $idx = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -TimeoutSec 30
        $target = $idx | Where-Object { $_.lts -and $_.version.StartsWith("v$NodeMajor.") } | Select-Object -First 1
        if (-not $target) { $target = $idx | Where-Object { $_.lts } | Select-Object -First 1 }
        $ver = $target.version
        $msi = Join-Path $env:TEMP "node-$ver-x64.msi"
        Write-Host "下载 $ver ..."
        Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/node-$ver-x64.msi" -OutFile $msi -UseBasicParsing -TimeoutSec 300
        Write-Host '静默安装中（约 1-2 分钟）...'
        $p = Start-Process msiexec.exe -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart') -Wait -PassThru
        if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "Node 安装失败，退出码 $($p.ExitCode)" }
        Refresh-Path
        Write-Ok "Node $ver 安装完成"
    }
    Refresh-Path
}

# ---------- 3. 环境变量 ----------
Write-Step '步骤 2/6：server/.env.web 检查'
$envWeb = Join-Path $serverDir '.env.web'
if (-not (Test-Path $envWeb)) {
    $envAlt = Join-Path $serverDir '.env'
    if (Test-Path $envAlt) {
        Copy-Item $envAlt $envWeb
        Write-Warn '未找到 .env.web，已从 .env 复制生成'
    } else {
        $secret = [guid]::NewGuid().ToString('N')
        @(
            '# Web 服务器配置（浏览器访问使用）'
            'PORT=3001'
            "JWT_SECRET=$secret"
            ''
            '# AI 密钥（留空则对应功能不可用，不影响服务启动）'
            'ZHIPU_API_KEY='
            'KIMI_API_KEY='
            'DEEPSEEK_API_KEY='
            'DEEPSEEK_R1_API_KEY='
            'QIANFAN_API_KEY='
            'AMAP_KEY='
        ) | Set-Content -Path $envWeb -Encoding UTF8
        Write-Warn '已生成 .env.web 模板，请填写 AI 密钥（智谱/Kimi/DeepSeek/千帆/高德）后重启服务生效'
    }
}
$content = Get-Content -Path $envWeb -Raw
if ($content -notmatch 'PORT\s*=\s*3001') { Add-Content -Path $envWeb "`nPORT=3001" }
if ($content -notmatch 'JWT_SECRET\s*=\s*\S') { throw '.env.web 缺少有效的 JWT_SECRET，请检查后重跑' }
$aiMissing = @('ZHIPU_API_KEY','KIMI_API_KEY','DEEPSEEK_API_KEY','DEEPSEEK_R1_API_KEY','QIANFAN_API_KEY') |
    Where-Object { $content -notmatch "$($_)\s*=\s*\S" }
if ($aiMissing) { Write-Warn "以下 AI 密钥未配置（对应功能不可用）：$($aiMissing -join ', ')" }
Write-Ok '.env.web 就绪（PORT=3001, JWT_SECRET 已配置）'

# ---------- 4. 依赖安装 + 前端构建 ----------
Write-Step '步骤 3/6：依赖安装 + 前端构建（首次较慢，约几分钟）'
Push-Location $clientDir
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'client 依赖安装失败' }
    if (-not $SkipBuild) {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
        Write-Ok '前端构建完成（client/build，含 ota-version.json）'
    } else {
        Write-Warn '已跳过前端构建（-SkipBuild）'
    }
} finally { Pop-Location }

Push-Location $serverDir
try {
    npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'server 依赖安装失败' }
} finally { Pop-Location }
Write-Ok 'server 依赖安装完成'

# ---------- 5. PM2 启动 + 开机自启 ----------
Write-Step '步骤 4/6：PM2 启动 + 开机自启'
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    npm install -g pm2 --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'pm2 全局安装失败' }
    Refresh-Path
}
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { throw 'pm2 不可用，请检查 npm 全局路径' }

if (-not $SkipPm2Start) {
    & pm2 delete chatroom-server 2>&1 | Out-Null
    & pm2 start (Join-Path $ProjectRoot 'ecosystem.config.js')
    & pm2 save
    Write-Ok 'PM2 已启动 chatroom-server（ecosystem.config.js，ENV_FILE=.env.web）'
} else {
    Write-Warn '已跳过 PM2 启动（-SkipPm2Start），可稍后手动运行 start-prod.bat'
}

# 开机自启：登录后自动 pm2 resurrect
try {
    $pm2Cmd = (Get-Command pm2).Source
    $action  = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$pm2Cmd`" resurrect"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Register-ScheduledTask -TaskName 'PM2-Resurrect' -Action $action -Trigger $trigger -RunLevel Limited -Force | Out-Null
    Write-Ok '已注册开机自启任务 PM2-Resurrect（登录后自动恢复 pm2 进程）'
} catch {
    Write-Warn "开机自启注册失败（不影响本次启动）: $($_.Exception.Message)"
}

# ---------- 6. ngrok ----------
if (-not $SkipNgrok) {
    Write-Step '步骤 5/6：ngrok 隧道（复用固定域名）'
    if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
        Write-Host '未检测到 ngrok，开始下载...'
        $ngrokDir = Join-Path $env:ProgramFiles 'ngrok'
        if (-not (Test-Path $ngrokDir)) { New-Item -ItemType Directory -Path $ngrokDir -Force | Out-Null }
        $zip = Join-Path $env:TEMP 'ngrok.zip'
        $urls = @(
            'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip',
            'https://download.ngrok.com/windows/ngrok-v3-stable-windows-amd64.zip'
        )
        $done = $false
        foreach ($u in $urls) {
            try { Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 300; $done = $true; break }
            catch { Write-Warn "下载失败: $u" }
        }
        if (-not $done) { throw 'ngrok 下载失败，请手动下载 ngrok-v3-stable-windows-amd64.zip 解压并加入 PATH' }
        Expand-Archive -Path $zip -DestinationPath $ngrokDir -Force
        [Environment]::SetEnvironmentVariable('Path',
            [Environment]::GetEnvironmentVariable('Path', 'Machine') + ";$ngrokDir", 'Machine')
        Refresh-Path
        Write-Ok "ngrok 已安装到 $ngrokDir"
    }

    if (-not $NgrokToken) {
        throw '缺少 ngrok authtoken：请用 -NgrokToken <token> 或先执行 setx NGROK_AUTHTOKEN <token>（必须是你本地同一账号的 token）'
    }
    & ngrok config add-authtoken $NgrokToken
    if ($LASTEXITCODE -ne 0) { throw 'ngrok authtoken 配置失败' }
    Write-Ok 'ngrok authtoken 已配置'

    if (-not $SkipPm2Start) {
        & pm2 delete ngrok-tunnel 2>&1 | Out-Null
        $ngrokExe = (Get-Command ngrok).Source
        & pm2 start $ngrokExe --name ngrok-tunnel -- http 3001 --domain=$NgrokDomain
        & pm2 save
        Write-Ok "ngrok 隧道已由 pm2 托管: https://$NgrokDomain -> localhost:3001"
    }
} else {
    Write-Warn '已跳过 ngrok 配置（-SkipNgrok）'
}

# ---------- 7. 数据目录检查 ----------
if (-not $SkipDataCheck) {
    Write-Step '步骤 6/6：数据目录检查'
    $dataDir = Join-Path $serverDir 'data'
    $upDir   = Join-Path $serverDir 'uploads'
    $jsonCount = @(Get-ChildItem -Path $dataDir -Filter *.json -ErrorAction SilentlyContinue).Count
    if ($jsonCount -eq 0) {
        Write-Warn "server\data 为空。如需保留老数据：先停本地服务，把旧机器的 server\data 和 server\uploads 整个拷过来（git 不包含这两个目录）"
    } else {
        Write-Ok "server\data 已就绪（$jsonCount 个数据文件）"
        if (-not (Test-Path $upDir)) { New-Item -ItemType Directory -Path $upDir -Force | Out-Null }
    }
}

# ---------- 8. 健康检查 + 汇总 ----------
Start-Sleep -Seconds 3
Write-Step '健康检查'
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 10
    Write-Ok "本地健康检查: HTTP $($r.StatusCode) $($r.Content)"
} catch {
    Write-Err "本地健康检查失败: $($_.Exception.Message)"
}
if (-not $SkipNgrok -and -not $SkipPm2Start) {
    Start-Sleep -Seconds 6
    try {
        $r2 = Invoke-WebRequest -Uri "https://$NgrokDomain/health" -UseBasicParsing -TimeoutSec 15
        Write-Ok "公网健康检查: HTTP $($r2.StatusCode) $($r2.Content)"
    } catch {
        Write-Warn "公网暂时不可达（ngrok 隧道可能仍在建立，稍后用浏览器打开 https://$NgrokDomain 验证）: $($_.Exception.Message)"
    }
}

$apk = Get-ChildItem -Path (Join-Path $clientDir 'releases') -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) {
    Write-Warn 'client\releases 下没有 APK：请把本地打好的 ChatRoom-v3.0.0.apk 拷到该目录，否则 App 内"下载新版本"会 404'
} else {
    Write-Ok "APK 就绪: $($apk.Name)（$([math]::Round($apk.Length/1MB,1)) MB）"
}

Write-Step '部署完成'
Write-Host @"
  状态查看 : pm2 status
  实时日志 : pm2 logs chatroom-server
  重启服务 : pm2 restart chatroom-server
  开机自启 : 任务计划程序 -> PM2-Resurrect（登录后自动恢复）
  本地访问 : http://localhost:3001
  公网访问 : https://$NgrokDomain
  安全组   : 使用 ngrok 只需放行 RDP(3389)；如日后要公网 IP 直连再加 3001
  重要提醒 : APK 内写死的就是 $NgrokDomain，域名不变则手机 App 无需重装
"@

Stop-Transcript | Out-Null
exit 0
