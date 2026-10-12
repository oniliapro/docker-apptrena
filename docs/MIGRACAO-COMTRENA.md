# Migração do domínio: trenadigital.com.br → comtrena.com.br

Mesma VPS (Hostinger, `~/docker-apptrena`, usuário root). Mesmo banco e mesmos
arquivos: a migração só muda o endereço. Complementa o checklist de
`docs/CONTEXTO.md` ("Pontos vivos", 09/10/2026).

## Estado do DNS (conferido em 12/10/2026 no hPanel)

- `comtrena.com.br` está na conta Hostinger da Onilia, ativo até 02/10/2028.
- Registro `A @` apontava para o IP de domínio estacionado (`2.57.91.91`,
  TTL 50). **Feito em 12/10/2026:** agora aponta para o IP da VPS
  (`187.77.59.52`, TTL 300). Para voltar atrás, devolver `2.57.91.91`
  (a Hostinger só aceita TTL entre 60 e 86400).
- `www` já é um CNAME para `comtrena.com.br`: não precisa mexer.
- Registros de e-mail (MX, SPF, DKIM, DMARC) são da Hostinger: não mexer.
- `trenadigital.com.br` NÃO está nessa conta (registrado em outro lugar).
  Ele continua apontando para a VPS, então não há DNS dele para alterar.

## Ordem

0. Backup completo (banco + `storage` + `.env`) e snapshot da VPS no hPanel.
1. DNS: trocar o valor do `A @` de `comtrena.com.br` para o IP da VPS.
2. VPS: nginx + certificado (abaixo).
3. VPS: `.env` da API (abaixo).
4. Testar em `https://comtrena.com.br`: login, abrir obra, upload de foto,
   gerar PDF de relatório e de medição.
5. Só depois: rodapé da medição e `apiUrl` do app (commit separado nesta
   branch, NÃO publicar antes do passo 4).
6. Redirecionar o domínio antigo (abaixo).

## 2. nginx + certificado (na VPS)

```bash
sudo nginx -T 2>/dev/null | grep -B2 -A 15 "server_name trenadigital"   # ver o arquivo atual
sudo nano /etc/nginx/sites-available/trenadigital.com.br
```

Na linha `server_name` dos blocos de 80 e 443, incluir o domínio novo:

```
server_name trenadigital.com.br www.trenadigital.com.br comtrena.com.br www.comtrena.com.br;
```

Depois:

```bash
sudo nginx -t
sudo certbot --nginx -d trenadigital.com.br -d www.trenadigital.com.br -d comtrena.com.br -d www.comtrena.com.br
sudo systemctl reload nginx
```

O certbot só emite o certificado do domínio novo depois que o DNS (passo 1)
já estiver apontando para a VPS. Conferir: `dig +short comtrena.com.br`.

## 3. .env de produção (`controleobra-api/.env`)

```
APP_URL=https://comtrena.com.br
PDF_FRONTEND_URL=https://comtrena.com.br/app
PDF_API_URL=https://comtrena.com.br/api
CORS_ALLOWED_ORIGINS=https://comtrena.com.br,https://www.comtrena.com.br,https://trenadigital.com.br
```

(O valor real de produção de `PDF_FRONTEND_URL` termina em `/app`. O CORS já
tinha `https://localhost,capacitor://localhost`, para o app: manter.) Depois:

```bash
docker exec controleobra-phpfpm php artisan config:cache
```

`MAIL_*`: nada a fazer (o sistema só grava e-mail no log).

## 6. Redirecionar o domínio antigo

Não redirecionar o `/api`: redirecionamento 301 quebra POST, e versões do app
já instaladas continuam chamando o endereço antigo. Redirecionar só as páginas.
Num `server` separado do domínio antigo (443), antes do `location /` atual:

```
location /api/ {
    # mantém como está (proxy para a API)
}
location / {
    return 301 https://comtrena.com.br$request_uri;
}
```

Como em 09/10 o app ainda não foi publicado e o sistema é usado só pela
equipe interna, o `/api` do domínio antigo pode sair do ar junto com o
vencimento do domínio. Avisar a equipe que o login precisa ser feito de novo
uma vez no endereço novo (a sessão do navegador é por domínio).

## Voltar atrás

DNS: devolver o `A @` para o valor antigo. nginx: restaurar o arquivo de
`sites-available` (guardar uma cópia antes: `cp arquivo arquivo.bak`).
`.env`: restaurar o valor antigo e rodar `php artisan config:cache`.

## Feito em 12/10/2026 (conferido na VPS)

- Snapshot da VPS criado no hPanel (20:23) e backup próprio em
  `~/backup-pre-comtrena-20261012-2328` (banco, storage, os dois `.env`, nginx).
- nginx: em vez de editar o arquivo do domínio antigo, foi criado
  `/etc/nginx/sites-available/comtrena.conf` (link em `sites-enabled`), cópia
  dos `location` de `trenadigital.conf`. Certificado próprio emitido com
  `certbot --nginx -d comtrena.com.br -d www.comtrena.com.br` (vence 10/01/2027,
  renovação automática). O arquivo do domínio antigo não foi tocado.
- `controleobra-api/.env` atualizado e `config:cache` rodado.
- Testes por curl: `/` = 200 e `/api/obras` = 401 (sem token) nos dois
  domínios; preflight CORS = 204.
- Pendente: login/obra/foto/PDF no navegador, redirecionar páginas do
  domínio antigo, publicar o commit do rodapé/`apiUrl`.
