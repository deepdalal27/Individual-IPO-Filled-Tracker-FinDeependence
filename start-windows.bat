@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Installing, please wait... & call npm install --omit=dev)
start "" http://localhost:3000
node server.js
pause
