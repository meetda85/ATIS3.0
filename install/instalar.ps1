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
# Si esto se ejecuta desde la copia ya instalada, no hay nada que copiar: se
# borraria a si mismo a medio camino.
$mismo = ($src.TrimEnd('\') -ieq $dest.TrimEnd('\'))
if ($mismo) { Write-Host '  Ya estaba instalado aqui: solo se rehacen los accesos directos.' }

New-Item -ItemType Directory -Force -Path $dest | Out-Null

# El estado compartido del control remoto no se pierde al reinstalar
$estado = Join-Path $dest 'servidor\estado.json'
$guardado = $null
if (Test-Path $estado) { $guardado = Get-Content $estado -Raw }

if (-not $mismo) {
  foreach ($archivo in @('index.html', 'SERVIDOR.bat', 'VOZ.bat', 'package.json', 'README.md')) {
    $origen = Join-Path $src $archivo
    if (Test-Path $origen) { Copy-Item $origen $dest -Force }
  }
  foreach ($carpeta in @('css', 'js', 'assets', 'servidor', 'install')) {
    $origen = Join-Path $src $carpeta
    if (-not (Test-Path $origen)) { continue }
    $ruta = Join-Path $dest $carpeta
    if (Test-Path $ruta) { Remove-Item $ruta -Recurse -Force }
    Copy-Item $origen $dest -Recurse -Force
  }
  if ($guardado) { Set-Content -Path $estado -Value $guardado -Encoding UTF8 }
}

# La carpeta 'voz' (el motor neuronal, 170 MB) NO se toca: si ya estaba, sigue ahi
Write-Host '  Archivos copiados.' -ForegroundColor Green
if (Test-Path (Join-Path $dest 'voz')) {
  Write-Host '  La voz neuronal que ya estaba instalada se conservo.' -ForegroundColor Green
}

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

  # Con servidor: hace falta para la voz neuronal y para el control remoto
  $lnk2 = $ws.CreateShortcut((Join-Path $carpeta 'ATIS 3.0 (con servidor).lnk'))
  $lnk2.TargetPath       = Join-Path $dest 'SERVIDOR.bat'
  $lnk2.IconLocation     = $icono
  $lnk2.WorkingDirectory = $dest
  $lnk2.Description      = 'ATIS 3.0 con servidor: voz neuronal y control remoto'
  $lnk2.Save()
}
Write-Host '  Accesos directos creados en el Escritorio y en el Menu Inicio.' -ForegroundColor Green

# --- 4. Desinstalador ------------------------------------------------------
if (-not $mismo) {
  Copy-Item (Join-Path $PSScriptRoot 'desinstalar.ps1') $dest -Force
  Copy-Item (Join-Path $src 'DESINSTALAR.bat') $dest -Force
}

Write-Host ''
Write-Host '  LISTO. Abra "ATIS 3.0" desde el Escritorio.' -ForegroundColor Green
Write-Host ''
Write-Host '  Para la mejor voz, que ademas no necesita internet:' -ForegroundColor Yellow
Write-Host "     ejecute una sola vez  $dest\VOZ.bat" -ForegroundColor Yellow
Write-Host '     y despues abra "ATIS 3.0 (con servidor)".' -ForegroundColor Yellow
Write-Host ''
Write-Host '  Mientras tanto, el ATIS habla con las voces del sistema. Si no suena,'
Write-Host '  se agregan en Configuracion > Hora e idioma > Voz > Agregar voces'
Write-Host '  (se necesita una voz en espanol y una en ingles).'
Write-Host ''
Read-Host '  Enter para terminar'
