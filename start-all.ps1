$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" -and $_.InterfaceAlias -notlike "*Loopback*" }).IPAddress | Select-Object -First 1
Write-Host "🚀 Iniciando resto001 con la IP activa: $ip" -ForegroundColor Green
Write-Host "📦 Encendiendo Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd services/backend; [Environment]::SetEnvironmentVariable('HOST', '$ip', 'Process'); npm run start"
Write-Host "🖥️ Encendiendo Frontend (Módulos Web)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd web/frontend; [Environment]::SetEnvironmentVariable('VITE_API_URL', 'http://$ip`:5000', 'Process'); npm run dev -- --host"
Write-Host "📱 Encendiendo Expo Móvil..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd app/mobile/resto-mobile; [Environment]::SetEnvironmentVariable('REACT_NATIVE_PACKAGER_HOSTNAME', '$ip', 'Process'); npm run start:windows"
