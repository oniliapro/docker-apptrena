@echo off
chcp 65001 >nul
title AppTrena - Build de revisao
cd /d "%~dp0"

set NG_CLI_ANALYTICS=false

echo ==========================================
echo   AppTrena - Build para o Lucas revisar
echo ==========================================
echo.

node --version >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Baixe a versao LTS em: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Instalando dependencias pela primeira vez...
  echo.
  call npm install
  if errorlevel 1 goto erro
  echo.
)

echo Gerando o build...
echo.
call npm run build:revisao
if errorlevel 1 goto erro

echo.
echo Empacotando...
if exist "revisao-para-enviar" rmdir /s /q "revisao-para-enviar"
mkdir "revisao-para-enviar"
xcopy "dist\trenaapp-angular\browser\*" "revisao-para-enviar\" /E /I /Q /H >nul

echo.
echo ==========================================
echo   Pronto!
echo ==========================================
echo.
echo Os arquivos estao na pasta:
echo   revisao-para-enviar
echo.
echo Envie o CONTEUDO dessa pasta para dentro de
echo uma pasta chamada "novo" no servidor, ficando:
echo   trenadigital.com.br/novo/
echo.
echo Leia PUBLICAR.md para o passo a passo.
echo.

explorer "revisao-para-enviar"
pause
exit /b 0

:erro
echo.
echo [ERRO] Nao foi possivel gerar o build.
echo.
pause
exit /b 1
