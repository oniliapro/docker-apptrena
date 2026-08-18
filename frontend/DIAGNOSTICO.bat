@echo off
cd /d "%~dp0"
set LOG=%~dp0diagnostico.txt

echo === DIAGNOSTICO AppTrena Angular === > "%LOG%"
echo Data: %DATE% %TIME% >> "%LOG%"
echo. >> "%LOG%"

echo --- node --version --- >> "%LOG%"
node --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- npm --version --- >> "%LOG%"
call npm --version >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- where node --- >> "%LOG%"
where node >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- pasta atual --- >> "%LOG%"
cd >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo --- node_modules existe? --- >> "%LOG%"
if exist "node_modules\" (echo SIM >> "%LOG%") else (echo NAO >> "%LOG%")
echo. >> "%LOG%"

echo --- npm install --- >> "%LOG%"
call npm install >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo Codigo de saida do npm install: %ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo === FIM === >> "%LOG%"

echo.
echo Diagnostico gravado em diagnostico.txt
echo Pode fechar esta janela e avisar o Claude.
echo.
pause
