@echo off
cd /d "%~dp0"
start "Liquidation Dashboard Server" cmd /k node server.js
timeout /t 1 >nul
start "" http://localhost:8917
