# Start backend and Expo in separate PowerShell windows (fix paths relative to repo root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root = Split-Path -Parent $scriptDir

$backendPath = Join-Path $root 'services\backend'
$mobilePath = Join-Path $root 'app\mobile\resto-mobile'

# Backend
$backendCmd = "Set-Location -LiteralPath '$backendPath'; npm run start"
Start-Process -WindowStyle Normal -FilePath powershell -ArgumentList "-NoExit","-Command",$backendCmd

# Expo mobile (Windows helper script will detect IP)
$mobileCmd = "Set-Location -LiteralPath '$mobilePath'; npm run start:windows"
Start-Process -WindowStyle Normal -FilePath powershell -ArgumentList "-NoExit","-Command",$mobileCmd
