@echo off
title Desinstalar ATIS 3.0
if exist "%~dp0install\desinstalar.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\desinstalar.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstalar.ps1"
)
