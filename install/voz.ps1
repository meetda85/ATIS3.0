# ATIS 3.0 - Instalacion de la voz neuronal (Piper)
# Se ejecuta una sola vez, con internet. Despues el ATIS habla sin red.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '  ATIS 3.0 - Voz neuronal, sin internet' -ForegroundColor Green
Write-Host '  ====================================='
Write-Host ''
Write-Host '  Esto baja el motor de voz y dos voces naturales (unos 170 MB) y las deja'
Write-Host '  dentro de la carpeta del programa. Hace falta internet SOLO ahora.'
Write-Host ''

# --- Node (es lo que baja los archivos y lo que genera el audio) ---
$node = $null
foreach ($c in @('node',
                 "$env:ProgramFiles\nodejs\node.exe",
                 "${env:ProgramFiles(x86)}\nodejs\node.exe",
                 (Join-Path $raiz 'node\node.exe'))) {
  try { if ($c -eq 'node') { & node --version | Out-Null; $node = 'node'; break }
        elseif (Test-Path $c) { $node = $c; break } } catch { }
}
if (-not $node) {
  Write-Host '  Falta Node.js, que es lo que genera el audio de la voz neuronal.' -ForegroundColor Red
  Write-Host ''
  Write-Host '  Opcion A: instalarlo de https://nodejs.org (version LTS, siguiente-siguiente).'
  Write-Host '  Opcion B: sin instalar nada, bajar el ZIP "Windows Binary (x64)" de esa misma'
  Write-Host '            pagina y copiar node.exe a esta carpeta:'
  Write-Host "            $raiz\node\node.exe"
  Write-Host ''
  Write-Host '  El ATIS funciona sin esto: seguira hablando con la voz del navegador.'
  Read-Host '  Enter para salir'; exit 1
}

& $node (Join-Path $raiz 'servidor\instalar-voz.js') @args
$codigo = $LASTEXITCODE

Write-Host ''
if ($codigo -eq 0) {
  Write-Host '  Ya quedo. Abra el ATIS con SERVIDOR.bat y revise' -ForegroundColor Green
  Write-Host '  Ajustes - Voz neuronal: debe decir "lista".' -ForegroundColor Green
} else {
  Write-Host '  No se pudo terminar. Se puede volver a ejecutar este mismo archivo:' -ForegroundColor Red
  Write-Host '  lo que ya se bajo no se baja otra vez.' -ForegroundColor Red
}
Write-Host ''
Read-Host '  Enter para cerrar'
