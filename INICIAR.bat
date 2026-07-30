@echo off
chcp 65001 >nul
title AppTrena Angular
cd /d "%~dp0"

REM Evita a pergunta do Angular CLI sobre envio de dados de uso ao Google.
set NG_CLI_ANALYTICS=false

echo ==========================================
echo   AppTrena - Frontend Angular
echo ==========================================
echo.

echo Verificando Node.js...
node --version 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Node.js nao encontrado.
  echo Baixe a versao LTS em: https://nodejs.org
  echo.
  pause
  exit /b 1
)
echo.

if not exist "node_modules\" (
  echo Instalando dependencias pela primeira vez...
  echo Isso leva alguns minutos. Pode ir tomar um cafe.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
  echo.
  echo Dependencias instaladas.
  echo.
)

echo Iniciando o servidor...
echo O navegador abre sozinho em http://localhost:4200
echo Para parar: feche esta janela ou aperte Ctrl+C
echo.

start "" http://localhost:4200
call npm start

pause
