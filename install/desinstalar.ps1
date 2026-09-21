# Desinstalador de ATIS 3.0
$ErrorActionPreference = 'SilentlyContinue'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\ATIS3.0'

Write-Host ''
Write-Host '  Desinstalando ATIS 3.0 ...'
foreach ($carpeta in @([Environment]::GetFolderPath('Desktop'),
                       (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  Remove-Item (Join-Path $carpeta 'ATIS 3.0.lnk') -Force
}
Set-Location $env:LOCALAPPDATA
Remove-Item $dest -Recurse -Force
Write-Host '  Listo. Se quitaron los accesos directos y los archivos.'
Write-Host '  (Lo que haya guardado el navegador queda en su perfil, sin efecto.)'
Write-Host ''
Read-Host '  Enter para terminar'
