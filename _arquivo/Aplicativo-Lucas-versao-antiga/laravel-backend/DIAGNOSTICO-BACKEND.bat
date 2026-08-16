@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LOG=%~dp0diagnostico-backend.txt

echo === DIAGNOSTICO DO BACKEND — TrenaApp === > "%LOG%"
echo Data: %DATE% %TIME% >> "%LOG%"
echo. >> "%LOG%"

echo --- PHP --- >> "%LOG%"
php --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- Extensoes PHP carregadas --- >> "%LOG%"
php -m >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- Composer --- >> "%LOG%"
call composer --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- PostgreSQL (psql) --- >> "%LOG%"
psql --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- Projeto Laravel ja criado? --- >> "%LOG%"
if exist "..\controle-obra-api\artisan" (
  echo SIM — ..\controle-obra-api >> "%LOG%"
) else (
  echo NAO — o esqueleto do Laravel ainda nao foi criado >> "%LOG%"
)
echo. >> "%LOG%"

echo === FIM === >> "%LOG%"

echo.
echo Diagnostico gravado em diagnostico-backend.txt
echo Avise o Claude para ele ler o resultado.
echo.
pause
