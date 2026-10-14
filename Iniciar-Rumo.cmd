@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Para executar a Rumo, instala o Node.js a partir de https://nodejs.org/
  pause
  exit /b 1
)
echo Rumo: abre http://127.0.0.1:4173 no navegador.
echo Mantem esta janela aberta. Para parar: Ctrl+C.
node server.mjs
pause
