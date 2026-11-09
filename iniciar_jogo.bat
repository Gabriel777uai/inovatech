@echo off
title INOVATECH TURBO DRIFT - Servidor Multiplayer
color 0b

echo =====================================================================
echo       INOVATECH TURBO DRIFT - FEIRA DE INOVACAO TECNOLOGICA
echo =====================================================================
echo.
echo Iniciando o servidor Socket.IO...
echo.

:: Abre o navegador automaticamente apos 2 segundos
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Executa o servidor Node.js
node server.js

pause
