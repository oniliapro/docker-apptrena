# Landing page em comtrena.com.br + sistema em comtrena.com.br/app/

Atualizado em 15/10/2026. Complementa `docs/DEPLOY-PRODUCAO.md` (que continua
valendo para o resto) e a migração de domínio descrita em `docs/CONTEXTO.md`
("Migração do domínio — quem vai fazer é a Onilia").

## O que existe

| Endereço | O que serve | De onde vem |
|---|---|---|
| `comtrena.com.br/` | Landing page (HTML estático) | pasta `landing/` do repositório |
| `comtrena.com.br/app/` | O sistema (Angular) — login | build com `--base-href /app/` |
| `comtrena.com.br/app/plataforma` | Painel de planos (só o dono, login + código de 6 dígitos) | mesmo build |
| `comtrena.com.br/api/` | API Laravel | container nginx em `127.0.0.1:8088` |

O botão **Entrar** da landing aponta para `/app/`.

## 1. Antes de tudo

1. **Backup** (primeiro comando de qualquer publicação — ver passo 4).
2. DNS na Hostinger: `comtrena.com.br` e `www` → `187.77.59.52`.
3. Certificado: `sudo certbot --nginx -d comtrena.com.br -d www.comtrena.com.br`
   (depois do bloco `server` do passo 2 existir, com a porta 80).

## 2. nginx do sistema (`/etc/nginx/sites-available/comtrena.com.br`)

```nginx
server {
    listen 80;
    server_name comtrena.com.br www.comtrena.com.br;
    return 301 https://comtrena.com.br$request_uri;
}

server {
    listen 443 ssl http2;
    server_name comtrena.com.br www.comtrena.com.br;

    ssl_certificate     /etc/letsencrypt/live/comtrena.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/comtrena.com.br/privkey.pem;

    client_max_body_size 40M;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Fotos, logos e arquivos
    location /storage/ {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Sistema (Angular) — a mesma pasta que o trenadigital.com.br já usa
    location /app/ {
        alias /var/www/apptrena-angular/;
        try_files $uri $uri/ /app/index.html;
    }

    # Landing page
    root /var/www/comtrena-landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/comtrena.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 3. `.env` de produção (`controleobra-api/.env`)

```ini
APP_URL=https://comtrena.com.br
# Base dos links que saem por e-mail (RDO e recuperação de senha). Se não
# definir, vale APP_URL + "/app" — que é o certo em produção.
# APP_FRONTEND_URL=https://comtrena.com.br/app
PDF_FRONTEND_URL=<o mesmo valor que já está hoje, trocando só o domínio>
PDF_API_URL=<idem, trocando só o domínio>

# E-MAIL — sem isto a "recuperação de senha" NÃO envia nada (o padrão é
# MAIL_MAILER=log, que só grava no log). Exemplo com o e-mail da Hostinger:
MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_SCHEME=smtps
MAIL_USERNAME=nao-responder@comtrena.com.br
MAIL_PASSWORD=********
MAIL_FROM_ADDRESS=nao-responder@comtrena.com.br
MAIL_FROM_NAME="ComTrena"
```

Teste: `docker exec controleobra-phpfpm php artisan tinker --execute="Mail::raw('teste', fn(\$m) => \$m->to('seu@email.com')->subject('Teste'));"`

## 4. Publicação (bloco único)

```bash
# 0) backup do banco — SEMPRE o primeiro comando
mkdir -p ~/backups-apptrena
docker exec controleobra-mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" dbcontroleobra' > ~/backups-apptrena/antes-$(date +%Y%m%d-%H%M).sql

# 1) código
cd ~/docker-apptrena
git fetch origin && git reset --hard origin/master

# 2) banco (2 migrations novas: administradores da plataforma/fuso e tipo "fvs" de modelo de documento)
docker exec controleobra-phpfpm php artisan migrate --force
docker exec controleobra-phpfpm php artisan optimize:clear
docker restart controleobra-phpfpm

# 3) frontend (sistema em /app/)
cd frontend
npm install
npm run build -- --base-href /app/
rsync -a --delete dist/trenaapp-angular/browser/ /var/www/apptrena-angular/

# 4) landing page
sudo mkdir -p /var/www/comtrena-landing
sudo rsync -a --delete ~/docker-apptrena/landing/ /var/www/comtrena-landing/
```

## 5. Criar o administrador do painel de planos (uma vez)

```bash
docker exec -it controleobra-phpfpm php artisan plataforma:criar-admin SEU@EMAIL "Seu Nome"
```

Pede uma senha (mínimo 12 caracteres). Depois abra
`https://comtrena.com.br/app/plataforma`, entre com e-mail e senha e cadastre a
chave mostrada no aplicativo autenticador (Google Authenticator, Authy…): é a
verificação em duas etapas. Celular perdido:

```bash
docker exec -it controleobra-phpfpm php artisan plataforma:criar-admin SEU@EMAIL --redefinir-2fa
```

## 6. Conferir

- `https://comtrena.com.br/` mostra a landing; **Entrar** abre `/app/`.
- `https://comtrena.com.br/app/` mostra o login, sem "Criar conta".
- "Esqueci minha senha" → e-mail chega → link abre `/app/redefinir-senha?...`.
- Link de acompanhamento do RDO (aba RDO da obra → "Gerar link") abre o
  calendário do cliente: o endereço agora vem com `/app/`.
