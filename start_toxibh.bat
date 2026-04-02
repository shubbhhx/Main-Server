@echo off
setlocal
cd /d "%~dp0"

REM ==============================
REM TOXIBH Flask + Cloudflared launcher
REM ==============================

REM Data root for db.py (SQLite persistence)
if "%TOXIBH_DATA_ROOT%"=="" set "TOXIBH_DATA_ROOT=%~dp0data"

REM qBittorrent integration (optional)
if "%QBITTORRENT_URL%"=="" set "QBITTORRENT_URL=http://127.0.0.1:8090"
if "%QBITTORRENT_USER%"=="" set "QBITTORRENT_USER=admin"
if "%QBITTORRENT_PASS%"=="" set "QBITTORRENT_PASS=hello6969"
if "%QBITTORRENT_DOWNLOAD_DIR%"=="" set "QBITTORRENT_DOWNLOAD_DIR=%TOXIBH_DATA_ROOT%\torrents"

REM Flask/Waitress bind settings
set "HOST=0.0.0.0"
set "PORT=8080"

REM Ensure required directories exist
if not exist "%TOXIBH_DATA_ROOT%\databases" mkdir "%TOXIBH_DATA_ROOT%\databases"
if not exist "%TOXIBH_DATA_ROOT%\logs" mkdir "%TOXIBH_DATA_ROOT%\logs"
if not exist "%TOXIBH_DATA_ROOT%\vault\pdfs" mkdir "%TOXIBH_DATA_ROOT%\vault\pdfs"
if not exist "%TOXIBH_DATA_ROOT%\vault\photos" mkdir "%TOXIBH_DATA_ROOT%\vault\photos"
if not exist "%QBITTORRENT_DOWNLOAD_DIR%" mkdir "%QBITTORRENT_DOWNLOAD_DIR%"

echo [TOXIBH] Starting Waitress Flask server on %HOST%:%PORT%
start "TOXIBH Flask" cmd /c "python app.py"

echo [TOXIBH] Waiting for server startup...
timeout /t 5 /nobreak >nul

echo [TOXIBH] Starting Cloudflare tunnel: toxibh-flix-tunnel
start "TOXIBH Cloudflared" cmd /c "cloudflared tunnel run toxibh-flix-tunnel"

echo [TOXIBH] Started. Keep this window for status messages.
echo [TOXIBH] App logs: %TOXIBH_DATA_ROOT%\logs\server.log

REM Optional crash monitor mode (set ENABLE_RESTART=1 before running this .bat)
if /i "%ENABLE_RESTART%"=="1" goto monitor
goto end

:monitor
echo [TOXIBH] Crash monitor enabled. Checking processes every 30 seconds...
:loop
timeout /t 30 /nobreak >nul
tasklist /FI "IMAGENAME eq python.exe" | find /I "python.exe" >nul
if errorlevel 1 (
  echo [TOXIBH] Python process missing. Restarting app.py...
  start "TOXIBH Flask" cmd /c "python app.py"
)
tasklist /FI "IMAGENAME eq cloudflared.exe" | find /I "cloudflared.exe" >nul
if errorlevel 1 (
  echo [TOXIBH] cloudflared process missing. Restarting tunnel...
  start "TOXIBH Cloudflared" cmd /c "cloudflared tunnel run toxibh-flix-tunnel"
)
goto loop

:end
endlocal
