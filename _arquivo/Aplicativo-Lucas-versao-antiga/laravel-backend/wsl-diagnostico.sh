#!/usr/bin/env bash
# =====================================================================
# Diagnóstico do ambiente de backend (WSL + Docker).
#
# COMO RODAR:
#   1. Abra o WSL (menu Iniciar → "WSL" ou "Ubuntu")
#   2. Cole a linha abaixo inteira e aperte Enter:
#
# bash "/mnt/c/Users/Onilia/Desktop/Claude/Projetos/Aplicativo Lucas/laravel-backend/wsl-diagnostico.sh"
#
# Ele grava o resultado num arquivo que eu consigo ler.
# =====================================================================

BASE="/mnt/c/Users/Onilia/Desktop/Claude/Projetos/Aplicativo Lucas/laravel-backend"
LOG="$BASE/diagnostico-wsl.txt"

{
  echo "=== DIAGNÓSTICO — backend TrenaApp ==="
  echo "Data: $(date)"
  echo "Distribuição: $(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2)"
  echo "Usuário: $(whoami)   Home: $HOME"
  echo

  echo "############ DOCKER ############"
  if command -v docker > /dev/null 2>&1; then
    docker --version
    echo
    echo "--- Containers rodando agora ---"
    docker ps --format "  {{.Names}}  |  {{.Image}}  |  {{.Status}}  |  {{.Ports}}" 2>&1
    echo
    echo "--- Todos os containers (incluindo parados) ---"
    docker ps -a --format "  {{.Names}}  |  {{.Image}}  |  {{.Status}}" 2>&1
    echo
    echo "--- Imagens ---"
    docker images --format "  {{.Repository}}:{{.Tag}}  ({{.Size}})" 2>&1 | head -20
    echo
    echo "--- Volumes ---"
    docker volume ls --format "  {{.Name}}" 2>&1 | head -20
  else
    echo "Docker NÃO encontrado neste ambiente."
  fi
  echo

  echo "############ ONDE ESTÁ O PROJETO ############"
  echo "--- Procurando docker-compose e artisan ---"
  for dir in "$HOME" /srv /opt /var/www /mnt/c/Users/Onilia; do
    [ -d "$dir" ] || continue
    find "$dir" -maxdepth 5 \
      \( -name "docker-compose.yml" -o -name "docker-compose.yaml" -o -name "compose.yml" -o -name "artisan" \) \
      -not -path "*/node_modules/*" -not -path "*/vendor/*" 2>/dev/null | head -12
  done
  echo

  echo "############ PHP ############"
  if command -v php > /dev/null 2>&1; then
    php --version | head -2
    echo "Caminho: $(command -v php)"
    echo
    echo "--- Extensões necessárias ---"
    for ext in pdo pdo_sqlite sqlite3 pdo_pgsql pdo_mysql mbstring openssl fileinfo curl tokenizer xml ctype; do
      if php -m 2>/dev/null | grep -qix "$ext"; then
        echo "  [ok]    $ext"
      else
        echo "  [falta] $ext"
      fi
    done
  else
    echo "PHP não encontrado fora do Docker (pode estar só dentro do container)."
  fi
  echo

  echo "############ COMPOSER ############"
  if command -v composer > /dev/null 2>&1; then
    composer --version 2>&1 | head -1
  else
    echo "não encontrado fora do Docker"
  fi
  echo

  echo "############ PORTAS EM USO ############"
  if command -v ss > /dev/null 2>&1; then
    ss -tlnp 2>/dev/null | grep -E ":(80|8000|8080|8088|5432|3306|4200)\b" || echo "  nenhuma das portas típicas está escutando"
  else
    echo "  (ss não disponível)"
  fi
  echo

  echo "############ A API RESPONDE? ############"
  for porta in 8088 8000 8080; do
    printf "  localhost:%s → " "$porta"
    if command -v curl > /dev/null 2>&1; then
      codigo=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$porta/api/login" 2>/dev/null)
      if [ "$codigo" = "000" ]; then echo "sem resposta"; else echo "respondeu (HTTP $codigo)"; fi
    else
      echo "(curl não disponível)"
    fi
  done

  echo
  echo "=== FIM ==="
} > "$LOG" 2>&1

echo
echo "Diagnóstico gravado em:"
echo "  $LOG"
echo
echo "Avise o Claude — ele lê o resultado e continua daí."
echo
