@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   Verificacao de paridade — AppTrena
echo ==========================================
echo.
echo Compara os calculos do codigo Angular com os
echo do app vanilla original, lado a lado.
echo.

echo [1/6] Pagamentos
call npx --yes esbuild ../src/app/features/pagamentos/pagamentos-calc.ts --bundle --format=cjs --outfile=portado-pagamentos.js --log-level=error
if errorlevel 1 goto erro
node comparar-pagamentos.js
if errorlevel 1 set FALHOU=1
echo.

echo [2/6] EAP
call npx --yes esbuild entrada-eap.ts --bundle --format=cjs --outfile=portado-eap.js --log-level=error
if errorlevel 1 goto erro
node comparar-eap.js
if errorlevel 1 set FALHOU=1
echo.

echo [3/6] Mapa de Fornecedores
call npx --yes esbuild entrada-mapa.ts --bundle --format=cjs --outfile=portado-mapa.js --log-level=error
if errorlevel 1 goto erro
node comparar-mapa.js
if errorlevel 1 set FALHOU=1
echo.

echo [4/6] Empreita
call npx --yes esbuild entrada-empreita.ts --bundle --format=cjs --outfile=portado-empreita.js --log-level=error
if errorlevel 1 goto erro
node comparar-empreita.js
if errorlevel 1 set FALHOU=1
echo.

echo [5/6] Rateio dos resumos do Mapa
call npx --yes esbuild entrada-resumos.ts --bundle --format=cjs --outfile=portado-resumos.js --log-level=error
if errorlevel 1 goto erro
node comparar-resumos.js
if errorlevel 1 set FALHOU=1
echo.

echo [6/6] Validacao de CPF e CNPJ
call npx --yes esbuild entrada-documento.ts --bundle --format=cjs --outfile=portado-documento.js --log-level=error
if errorlevel 1 goto erro
node testar-documento.js
if errorlevel 1 set FALHOU=1
echo.

if defined FALHOU (
  echo ==========================================
  echo   ATENCAO: houve divergencias acima.
  echo ==========================================
) else (
  echo ==========================================
  echo   Tudo certo: os numeros batem.
  echo ==========================================
)
echo.
pause
exit /b 0

:erro
echo.
echo Falha ao compilar. O Node esta instalado?
pause
