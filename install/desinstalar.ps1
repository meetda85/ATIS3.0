# Desinstalador de ATIS 3.0
$ErrorActionPreference = 'SilentlyContinue'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\ATIS3.0'

Write-Host ''
Write-Host '  Desinstalando ATIS 3.0 ...'
foreach ($carpeta in @([Environment]::GetFolderPath('Desktop'),
                       (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  Remove-Item (Join-Path $carpeta 'ATIS 3.0.lnk') -Force
  Remove-Item (Join-Path $carpeta 'ATIS 3.0 (con servidor).lnk') -Force
}
if (Test-Path (Join-Path $dest 'voz')) {
  Write-Host '  Se borrara tambien la voz neuronal (unos 170 MB).'
  Write-Host '  Para volver a usarla habria que ejecutar VOZ.bat otra vez.'
}
Set-Location $env:LOCALAPPDATA
Remove-Item $dest -Recurse -Force
Write-Host '  Listo. Se quitaron los accesos directos y los archivos.'
Write-Host '  (Lo que haya guardado el navegador queda en su perfil, sin efecto.)'
Write-Host ''
Read-Host '  Enter para terminar'
