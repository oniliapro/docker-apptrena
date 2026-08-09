@echo off
chcp 65001 >nul
title AppTrena - backend + frontend
cd /d "%~dp0"

set NG_CLI_ANALYTICS=false

echo ==========================================
echo   AppTrena — subindo tudo
echo ==========================================
echo.

echo [1/3] Subindo o backend (Docker, via WSL)...
echo.
wsl -e bash -lc "cd /mnt/c/Users/Onilia/Desktop/Claude/Projetos/AppTrena/backend-docker && docker compose --project-name controleobra up -d 2>&1 || docker-compose --project-name controleobra up -d 2>&1"
if errorlevel 1 (
  echo.
  echo [AVISO] Nao consegui subir o Docker automaticamente.
  echo O app vai funcionar mesmo assim, salvando no navegador.
  echo.
  echo Para subir a mao, abra o WSL e rode:
  echo   cd /mnt/c/Users/Onilia/Desktop/Claude/Projetos/AppTrena/backend-docker
  echo   docker compose --project-name controleobra up -d
  echo.
  pause
)

echo.
echo [2/3] Conferindo se a API respondeu...
timeout /t 5 /nobreak >nul
wsl -e bash -lc "curl -s -o /dev/null -w 'API em localhost:8088 -> HTTP %%{http_code}\n' --max-time 5 http://localhost:8088/api/login || echo 'API ainda nao respondeu'"

echo.
echo [3/3] Subindo o frontend Angular...
echo.

if not exist "node_modules\" (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 goto erro
  echo.
)

echo O navegador abre sozinho em http://localhost:4200
echo Para parar: feche esta janela ou aperte Ctrl+C
echo.

start "" http://localhost:4200
call npm start

pause
exit /b 0

:erro
echo.
echo [ERRO] Falha ao preparar o frontend.
pause
exit /b 1
