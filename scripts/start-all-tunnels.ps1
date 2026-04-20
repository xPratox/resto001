param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$runtimeDir = Join-Path $workspaceRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Write-Step {
  param([string]$Message)
  Write-Host "[start-all] $Message" -ForegroundColor Cyan
}

function Resolve-CloudflaredPath {
  $fromPath = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $candidates = @(
    'C:\Users\ASUS\Downloads\Nueva carpeta\ruta\cloudflared-windows-amd64.exe',
    'C:\Users\ASUS\Downloads\cloudflared-windows-amd64.exe'
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw 'No se encontro cloudflared. Instala cloudflared o ajusta la ruta en scripts/start-all-tunnels.ps1.'
}

function Stop-PortListener {
  param([int]$Port)

  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Write-Step "Liberando puerto $Port (PID $($conn.OwningProcess))"
    if (-not $DryRun) {
      Stop-Process -Id $conn.OwningProcess -Force
    }
  }
}

function Start-PowerShellCommand {
  param(
    [string]$Name,
    [string]$Command
  )

  Write-Step "Iniciando $Name"
  if ($DryRun) {
    return $null
  }

  return Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile', '-Command', $Command) -PassThru
}

function Start-Tunnel {
  param(
    [string]$CloudflaredPath,
    [string]$Name,
    [string]$LocalUrl,
    [string]$LogPrefix,
    [int]$TimeoutSec = 60
  )

  $outLog = Join-Path $runtimeDir "$LogPrefix-out.log"
  $errLog = Join-Path $runtimeDir "$LogPrefix-err.log"

  Remove-Item $outLog, $errLog -Force -ErrorAction SilentlyContinue

  Write-Step "Iniciando tunnel $Name -> $LocalUrl"

  if ($DryRun) {
    return @{ Process = $null; Url = 'https://example.trycloudflare.com'; OutLog = $outLog; ErrLog = $errLog }
  }

  $process = Start-Process -FilePath $CloudflaredPath `
    -ArgumentList @('tunnel', '--url', $LocalUrl, '--no-autoupdate') `
    -WorkingDirectory (Split-Path $CloudflaredPath) `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $url = $null

  while ((Get-Date) -lt $deadline -and -not $url) {
    Start-Sleep -Milliseconds 700

    $content = @()
    if (Test-Path $outLog) { $content += Get-Content $outLog -Raw -ErrorAction SilentlyContinue }
    if (Test-Path $errLog) { $content += Get-Content $errLog -Raw -ErrorAction SilentlyContinue }

    foreach ($block in $content) {
      if ($block -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        $url = $matches[0]
        break
      }
    }
  }

  if (-not $url) {
    throw "No se pudo obtener URL de tunnel para $Name. Revisa logs: $outLog y $errLog"
  }

  return @{ Process = $process; Url = $url; OutLog = $outLog; ErrLog = $errLog }
}

Set-Location $workspaceRoot

Write-Step 'Preparando entorno'
if (-not $DryRun) {
  Get-Process | Where-Object { $_.ProcessName -like 'cloudflared*' } | Stop-Process -Force -ErrorAction SilentlyContinue
}

Stop-PortListener -Port 5000
Stop-PortListener -Port 4001

$cloudflaredPath = Resolve-CloudflaredPath
Write-Step "Cloudflared: $cloudflaredPath"

$backendCmd = "Set-Location '$workspaceRoot'; npm --prefix backend run dev"
$cajaCmdTemplate = "Set-Location '$workspaceRoot'; `$env:CAJA_PUBLIC_API_URL='{0}'; `$env:CAJA_PUBLIC_SOCKET_URL='{0}'; npm --prefix crud-caja run start"
$expoCmdTemplate = "Set-Location '$workspaceRoot'; `$env:EXPO_PUBLIC_API_URL='{0}'; `$env:EXPO_PUBLIC_SOCKET_URL='{0}'; `$env:EXPO_PUBLIC_USE_TUNNEL='true'; npm --prefix mobile/resto-mobile run start -- --tunnel"

Start-PowerShellCommand -Name 'backend (5000)' -Command $backendCmd | Out-Null

$backendTunnel = Start-Tunnel -CloudflaredPath $cloudflaredPath -Name 'backend' -LocalUrl 'http://localhost:5000' -LogPrefix 'backend-tunnel'

$cajaCmd = [string]::Format($cajaCmdTemplate, $backendTunnel.Url)
Start-PowerShellCommand -Name 'caja (4001)' -Command $cajaCmd | Out-Null

$cajaTunnel = Start-Tunnel -CloudflaredPath $cloudflaredPath -Name 'caja' -LocalUrl 'http://localhost:4001' -LogPrefix 'caja-tunnel'

$expoCmd = [string]::Format($expoCmdTemplate, $backendTunnel.Url)
Start-PowerShellCommand -Name 'expo go (--tunnel)' -Command $expoCmd | Out-Null

$result = @{
  backendTunnel = $backendTunnel.Url
  cajaTunnel = $cajaTunnel.Url
  generatedAt = (Get-Date).ToString('s')
}

$result | ConvertTo-Json | Set-Content -Path (Join-Path $runtimeDir 'tunnels.json') -Encoding UTF8

Write-Host ''
Write-Host '================ TUNNELS ACTIVOS ================' -ForegroundColor Green
Write-Host "Backend publico: $($backendTunnel.Url)"
Write-Host "Caja publica   : $($cajaTunnel.Url)"
Write-Host 'Expo se inicio con --tunnel y apuntando al backend publico.'
Write-Host "Se guardo resumen en: $(Join-Path $runtimeDir 'tunnels.json')"
Write-Host '=================================================' -ForegroundColor Green
