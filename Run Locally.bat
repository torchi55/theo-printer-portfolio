@echo off
title Theo Printer Portfolio - Local Server
cd /d "%~dp0"

echo ============================================================
echo   THEO PRINTER PORTFOLIO  -  local preview
echo ============================================================
echo.
echo   On THIS computer:    http://localhost:5500
echo.
echo   On your PHONE (same Wi-Fi), open one of these:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo        http://%%b:5500
)
echo.
echo   Keep this window open while you preview.
echo   Press Ctrl+C  (or just close this window) to stop.
echo ============================================================
echo.

python -m http.server 5500 --bind 0.0.0.0
pause
