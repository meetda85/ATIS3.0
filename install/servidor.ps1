# ATIS 3.0 - Servidor de control remoto
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '  ATIS 3.0 - Servidor de control remoto' -ForegroundColor Green
Write-Host '  ====================================='
Write-Host ''

# --- Node ---
$node = $null
foreach ($c in @('node',
                 "$env:ProgramFiles\nodejs\node.exe",
                 "${env:ProgramFiles(x86)}\nodejs\node.exe",
                 (Join-Path $raiz 'node\node.exe'))) {
  try { if ($c -eq 'node') { & node --version | Out-Null; $node = 'node'; break }
        elseif (Test-Path $c) { $node = $c; break } } catch { }
}
if (-not $node) {
  Write-Host '  Falta Node.js, que es lo que levanta el servidor.' -ForegroundColor Red
  Write-Host ''
  Write-Host '  Opcion A: instalarlo de https://nodejs.org (version LTS, siguiente-siguiente).'
  Write-Host '  Opcion B: sin instalar nada, bajar el ZIP "Windows Binary (x64)" de esa misma'
  Write-Host '            pagina, y copiar node.exe a esta carpeta:'
  Write-Host "            $raiz\node\node.exe"
  Write-Host ''
  Write-Host '  El ATIS funciona sin esto; lo unico que no habra es control remoto.'
  Read-Host '  Enter para salir'; exit 1
}

# --- Navegador ---
$browser = @("$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
             "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
             "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
             "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") |
            Where-Object { Test-Path $_ } | Select-Object -First 1

$puerto = 8080
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
       Select-Object -ExpandProperty IPAddress

Write-Host '  Desde otra computadora de la misma red, escriba en el navegador:' -ForegroundColor Yellow
foreach ($ip in $ips) { Write-Host "     http://${ip}:$puerto/" -ForegroundColor Yellow }
Write-Host ''
Write-Host '  La primera vez, Windows pregunta si permite el acceso: hay que decir que si,'
Write-Host '  marcando "Redes privadas".'
Write-Host ''
Write-Host '  Esta ventana debe quedarse abierta mientras se use el control remoto.'
Write-Host ''

if ($browser) {
  Start-Job -ScriptBlock {
    param($b, $p)
    Start-Sleep -Seconds 2
    & $b "--app=http://localhost:$p/" '--window-size=1500,1000'
  } -ArgumentList $browser, $puerto | Out-Null
}

& $node (Join-Path $raiz 'servidor\servidor.js') --puerto $puerto
