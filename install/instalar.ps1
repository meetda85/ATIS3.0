# Instalador de ATIS 3.0 - Laboratorio de Torre
$ErrorActionPreference = 'Stop'

$src  = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Programs\ATIS3.0'

Write-Host ''
Write-Host '  ATIS 3.0 - Laboratorio de Torre' -ForegroundColor Green
Write-Host '  ==============================='
Write-Host ''

# --- 1. Buscar navegador ---------------------------------------------------
$candidatos = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Host '  ERROR: no se encontro Microsoft Edge ni Google Chrome.' -ForegroundColor Red
  Write-Host '  Instale uno de los dos y vuelva a ejecutar el instalador.'
  Read-Host '  Enter para salir'; exit 1
}
Write-Host "  Navegador : $browser"
Write-Host "  Destino   : $dest"
Write-Host ''

# --- 2. Copiar los archivos ------------------------------------------------
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $src 'index.html') $dest -Force
foreach ($carpeta in @('css', 'js', 'assets')) {
  $ruta = Join-Path $dest $carpeta
  if (Test-Path $ruta) { Remove-Item $ruta -Recurse -Force }
  Copy-Item (Join-Path $src $carpeta) $dest -Recurse -Force
}
Write-Host '  Archivos copiados.' -ForegroundColor Green

# --- 3. Accesos directos ---------------------------------------------------
$url  = 'file:///' + ($dest -replace '\\', '/') + '/index.html'
$icono = Join-Path $dest 'assets\atis.ico'
$ws = New-Object -ComObject WScript.Shell
$destinos = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
)
foreach ($carpeta in $destinos) {
  $lnk = $ws.CreateShortcut((Join-Path $carpeta 'ATIS 3.0.lnk'))
  $lnk.TargetPath       = $browser
  $lnk.Arguments        = "--app=`"$url`" --window-size=1500,1000"
  $lnk.IconLocation     = $icono
  $lnk.WorkingDirectory = $dest
  $lnk.Description      = 'ATIS 3.0 - Laboratorio de Torre'
  $lnk.Save()
}
Write-Host '  Acceso directo creado en el Escritorio y en el Menu Inicio.' -ForegroundColor Green

# --- 4. Desinstalador ------------------------------------------------------
Copy-Item (Join-Path $PSScriptRoot 'desinstalar.ps1') $dest -Force
Copy-Item (Join-Path $src 'DESINSTALAR.bat') $dest -Force

Write-Host ''
Write-Host '  LISTO. Abra "ATIS 3.0" desde el Escritorio.' -ForegroundColor Green
Write-Host ''
Write-Host '  Si la voz no suena, instale las voces del sistema en:'
Write-Host '  Configuracion > Hora e idioma > Voz > Agregar voces'
Write-Host '  (se necesita una voz en espanol y una en ingles).'
Write-Host ''
Read-Host '  Enter para terminar'
