#!/usr/bin/env bash
# Coloca a landing page na raiz do comtrena.com.br (15/10/2026).
#
# Uso, no servidor:   sudo bash ~/docker-apptrena/landing/aplicar-nginx.sh
#
# O que faz:
#   1. guarda uma cópia de /etc/nginx/sites-available/comtrena.conf;
#   2. acrescenta, antes do bloco `location / { proxy_pass ...:8080 }`, duas regras que
#      entregam a landing em "/" e os arquivos dela (marca/, favicons, robots, sitemap);
#   3. testa a configuração (nginx -t) e só então recarrega;
#   4. se o teste falhar, devolve a cópia e NÃO recarrega nada.
#
# O app antigo (porta 8080) continua respondendo tudo que não é a landing. Pode rodar
# mais de uma vez: se a regra já existe, não faz nada.
set -euo pipefail

ARQUIVO=/etc/nginx/sites-available/comtrena.conf
PASTA_LANDING=/var/www/comtrena-landing
COPIA="/root/comtrena.conf.bak-$(date +%Y%m%d-%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo: sudo bash $0" >&2
  exit 1
fi

if [ ! -f "$PASTA_LANDING/index.html" ]; then
  echo "Não achei $PASTA_LANDING/index.html — copie a landing antes (rsync da pasta landing/)." >&2
  exit 1
fi

if grep -q "comtrena-landing" "$ARQUIVO"; then
  echo "A regra da landing já está no nginx. Nada a fazer."
  exit 0
fi

cp "$ARQUIVO" "$COPIA"
echo "Cópia de segurança: $COPIA"

python3 - "$ARQUIVO" "$PASTA_LANDING" <<'PYEOF'
import sys

arquivo, pasta = sys.argv[1], sys.argv[2]
s = open(arquivo, encoding="utf-8").read()

marca = "    location / {\n        proxy_pass http://127.0.0.1:8080;"
if s.count(marca) != 1:
    sys.exit("O bloco 'location /' esperado não foi encontrado exatamente uma vez — nada foi alterado.")

novo = (
    "    # Landing page (raiz do dominio) — arquivos em " + pasta + "\n"
    "    location = / {\n"
    "        root " + pasta + ";\n"
    "        try_files /index.html =404;\n"
    "    }\n"
    "    location ~ ^/(marca/|favicon\\.svg$|favicon\\.ico$|apple-touch-icon\\.png$|robots\\.txt$|sitemap\\.xml$) {\n"
    "        root " + pasta + ";\n"
    "        try_files $uri =404;\n"
    "    }\n\n"
)

open(arquivo, "w", encoding="utf-8").write(s.replace(marca, novo + marca, 1))
PYEOF

if nginx -t; then
  systemctl reload nginx
  echo
  echo "Pronto. Abra https://comtrena.com.br — deve aparecer a landing."
else
  echo "A configuração não passou no teste. Voltando a cópia de segurança..." >&2
  cp "$COPIA" "$ARQUIVO"
  nginx -t || true
  exit 1
fi
