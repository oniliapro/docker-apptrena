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

## 1. O que já está pronto no servidor (conferido em 15/10/2026)

- DNS: `comtrena.com.br` e `www` já apontam para `187.77.59.52`.
- Certificado Let's Encrypt de `comtrena.com.br` já emitido (certbot).
- `/etc/nginx/sites-available/comtrena.conf` já existe e serve `/api/`,
  `/storage/` e `/app/` (esta com `alias /var/www/apptrena-angular/`).
- A raiz `/` ainda vai para o app antigo (`proxy_pass http://127.0.0.1:8080`).

Só falta a raiz mostrar a landing.

## 2. Ajuste do nginx — landing na raiz (só o que muda)

Faça DEPOIS de copiar a landing para `/var/www/comtrena-landing` (passo 4 da
publicação abaixo). O app antigo continua respondendo tudo que não é a landing
(`/html/login.html` etc.): nada que já funciona deixa de funcionar.

```bash
sudo bash ~/docker-apptrena/landing/aplicar-nginx.sh
```

O script guarda uma cópia, acrescenta as regras, testa (`nginx -t`) e só então recarrega; se o teste falhar, devolve a cópia sozinho.

Para desfazer manualmente: copie de volta o arquivo `/root/comtrena.conf.bak-...` que o script informa e rode `sudo systemctl reload nginx`.

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

## 4. Publicação (bloco único — termina com a landing; depois faça o passo 2 acima)

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
docker exec -it controleobra-phpfpm php artisan plataforma:criar-admin eng.lucasaugusto.sa@gmail.com "Lucas Augusto"
```

Pede uma senha (mínimo 12 caracteres). Depois abra
`https://comtrena.com.br/app/plataforma`, entre com e-mail e senha e cadastre a
chave mostrada no aplicativo autenticador (Google Authenticator, Authy…): é a
verificação em duas etapas. Celular perdido:

```bash
docker exec -it controleobra-phpfpm php artisan plataforma:criar-admin eng.lucasaugusto.sa@gmail.com --redefinir-2fa
```

## 6. Conferir

- `https://comtrena.com.br/` mostra a landing; **Entrar** abre `/app/`.
- `https://comtrena.com.br/app/` mostra o login, sem "Criar conta".
- "Esqueci minha senha" → e-mail chega → link abre `/app/redefinir-senha?...`.
- Link de acompanhamento do RDO (aba RDO da obra → "Gerar link") abre o
  calendário do cliente: o endereço agora vem com `/app/`.
