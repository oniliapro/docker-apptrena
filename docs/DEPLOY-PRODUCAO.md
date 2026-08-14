# Deploy em produção — VPS Hostinger (trenadigital.com.br)

> **Atualização (13/08/2026): este deploy já foi feito.** O AppTrena está
> no ar de verdade em `https://trenadigital.com.br` — Angular publicado
> em `/var/www/apptrena-angular/`, containers Laravel/MySQL rodando via
> Docker no VPS. O guia abaixo (escrito em 28/07/2026, antes do primeiro
> deploy) continua útil como **referência de como a coisa funciona e
> como repetir o processo** numa próxima atualização — mas não rode do
> zero achando que nada existe ainda. Veja `CONTEXTO.md` primeiro pro
> estado atual (inclusive um incidente de 2 dias fora do ar, já
> resolvido, e o risco pendente de configurar `restart:` no
> `docker-compose.yml`). Para o dia a dia de "só publiquei uma alteração
> nova", o fluxo mais simples é `docs/fluxo-deploy-vscode-hostinger.md`.

Guia de referência pra colocar o AppTrena (Angular + Laravel + MySQL) no
ar de verdade, no VPS que já responde por `trenadigital.com.br`.
Escrito em 28/07/2026 pra você seguir pelo terminal do VSCode (Remote-SSH
no próprio VPS).

Não executei nada disso remotamente — não tenho acesso ao servidor.
Cada bloco de comando abaixo é pra rodar você mesma, direto no VPS.

---

## 0. Antes de mexer em nada

O domínio já aponta pro VPS e (pelo que você confirmou) já existe algo
rodando nele — possivelmente o app vanilla antigo, servido de algum
jeito. **Antes do primeiro passo, faça um retrato do que já existe**,
pra não sobrescrever ou derrubar nada sem querer:

```bash
# Veja o que já está rodando
docker ps -a
sudo systemctl status nginx
sudo nginx -T | less          # config atual do nginx do sistema
sudo ls -la /etc/nginx/sites-enabled/
sudo ls -la /var/www/          # ou onde quer que o site atual esteja
```

Se aparecer um site já configurado e funcionando, **anote o caminho dos
arquivos e o nome do arquivo de config do nginx** antes de continuar —
vamos editar isso, não substituir do zero.

Se o `backend-docker` (ou algo parecido) já estiver rodando aí, pule
direto pra seção 3 (migração/seed) e 5 (nginx), sem repetir o clone e o
`docker-compose up` da seção 1.

---

## 1. Levar o código pro servidor

Se ainda não tem o repositório clonado no VPS:

```bash
cd /opt   # ou onde preferir manter o projeto no servidor
git clone <url-do-seu-repositorio-git> apptrena
cd apptrena/backend-docker
```

Se o projeto **não está num repositório git** ainda (é só uma pasta
local no seu Windows), o jeito mais simples é abrir a pasta
`backend-docker` no VSCode conectado ao servidor (Remote-SSH) e usar o
próprio VSCode pra copiar a pasta inteira pro VPS — ou `rsync`/`scp` a
partir do seu Windows (via WSL ou Git Bash):

```bash
# rodando no seu Windows (WSL/Git Bash), não no servidor
rsync -avz --exclude 'vendor' --exclude 'node_modules' \
  "/caminho/para/AppTrena/backend-docker/" usuario@SEU_IP:/opt/apptrena/backend-docker/
```

**Não copie os arquivos `.env`** por esse `rsync`/`git` — eles já têm
segredos reais e o `.gitignore` já os exclui do controle de versão de
propósito. Copie-os à parte, manualmente (passo 2).

---

## 2. Os `.env` (já estão prontos — só levar com cuidado)

Duas coisas boas: os dois arquivos `.env` deste projeto **já estão
configurados como produção**, não como desenvolvimento:

- `backend-docker/.env` — lido pelo `docker-compose.yml` (senha do
  MySQL, nome do banco, usuário).
- `backend-docker/controleobra/.env` — lido pelo Laravel. Já tem
  `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://trenadigital.com.br`
  e `CORS_ALLOWED_ORIGINS=https://trenadigital.com.br,...` certos.

O que fazer:

1. Copie os dois arquivos do seu Windows pro servidor (via `scp`, ou
   arrastando pelo VSCode Remote-SSH) — **nunca por `git`/rsync
   público**, exatamente onde estavam: `backend-docker/.env` e
   `backend-docker/controleobra/.env`.
2. Confira que a senha do MySQL é a mesma nos dois arquivos (o usuário
   `app_controleobra` e a senha dele precisam bater em ambos — hoje
   batem, só não mude um sem mudar o outro).
3. Se quiser habilitar a leitura de nota fiscal por IA, cole sua chave
   da Anthropic em `ANTHROPIC_API_KEY` dentro de
   `controleobra/.env` (fica desligado, sem quebrar nada, se deixar em
   branco).
4. **Troque a senha do MySQL antes de ir pro ar de verdade**, se essa
   senha que está aí hoje foi usada só em desenvolvimento local — é
   rápido: gere uma nova, atualize nos dois `.env` (tem que bater nos
   dois) antes do primeiro `docker-compose up`. Depois de criado o
   volume do banco, trocar a senha exige um passo a mais (mudar dentro
   do MySQL também), então é mais simples acertar agora.

---

## 3. Subir os containers

Dentro de `backend-docker/`:

```bash
# Instala as dependências do Laravel (vendor/ não foi trazido de propósito)
docker run --rm -v "$(pwd)/controleobra:/app" -w /app composer:2 install --no-dev --optimize-autoloader

docker-compose --project-name controleobra build
docker-compose --project-name controleobra up -d

docker ps   # confirme os 5 containers: nginx, phpfpm, mysql, myadmin, frontend
```

Depois, rode as migrations e os seeders (o `TiposCustoSeeder` é
obrigatório — sem ele a EAP não tem categorias de custo pra usar):

```bash
docker exec -it controleobra-phpfpm php artisan migrate --force
docker exec -it controleobra-phpfpm php artisan db:seed --force
docker exec -it controleobra-phpfpm php artisan storage:link
docker exec -it controleobra-phpfpm php artisan config:cache
docker exec -it controleobra-phpfpm php artisan route:cache
```

Teste local (de dentro do próprio VPS, antes de expor pro mundo):

```bash
curl -s http://127.0.0.1:8088/api/obras   # deve responder 401 (sem token) ou JSON, não erro 500
```

---

## 4. Build do Angular

No seu Windows (ou aqui mesmo no VPS, se preferir clonar o frontend
também):

```bash
cd AppTrena-Angular
npm install
npm run build
```

Isso gera `dist/trenaapp-angular/browser/` — é essa pasta (o
**conteúdo** dela, não a pasta em si) que vai pro servidor:

```bash
# do seu Windows, via rsync/scp
rsync -avz --delete "dist/trenaapp-angular/browser/" usuario@SEU_IP:/var/www/apptrena-angular/
```

Crie a pasta `/var/www/apptrena-angular/` no VPS antes, se ainda não
existir (`sudo mkdir -p /var/www/apptrena-angular && sudo chown $USER /var/www/apptrena-angular`).

---

## 5. Nginx do sistema — a peça que amarra tudo

Esta é a parte que provavelmente **ainda não existe** pronta no VPS,
porque o Angular é novo. Os containers ficam todos só em `127.0.0.1`
(propositalmente — ver comentários do `docker-compose.yml`), então
quem fala com a internet é o nginx do **sistema** (fora do Docker),
repassando pra dentro.

Se já existe um site configurado (visto na seção 0), me diga o que tem
lá antes de sobrescrever — o bloco abaixo é o ponto de partida
recomendado, ajuste os `location` conforme o que já existir (por
exemplo, se o app antigo já está servido de outro jeito que não seja o
container `frontend` da porta 8080):

```nginx
# /etc/nginx/sites-available/trenadigital.com.br

server {
    listen 80;
    server_name trenadigital.com.br www.trenadigital.com.br;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name trenadigital.com.br www.trenadigital.com.br;

    # Ajuste esses dois caminhos depois de rodar o certbot (seção 6)
    ssl_certificate     /etc/letsencrypt/live/trenadigital.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trenadigital.com.br/privkey.pem;

    client_max_body_size 40M;

    # API Laravel — o container nginx já sabe rotear /api pro phpfpm
    location /api/ {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # App antigo (vanilla), mantido em /html/ — mesma convivência do PUBLICAR.md
    location /html/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
    }

    # AppTrena (Angular) — build estático, servido direto pelo nginx do sistema
    root /var/www/apptrena-angular;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/trenadigital.com.br /etc/nginx/sites-enabled/
sudo nginx -t     # valida a sintaxe antes de recarregar
sudo systemctl reload nginx
```

**Ponto de decisão pra você confirmar comigo ou com o Lucas antes de
ativar isso de vez:** esse bloco faz o Angular tomar conta da raiz do
domínio (`trenadigital.com.br/`), empurrando o app antigo pra
`/html/`. Se o Lucas (ou clientes dele) ainda usam o app antigo direto
na raiz hoje, isso muda a URL que eles usam — vale avisar antes.

---

## 6. SSL (se ainda não tiver certificado)

```bash
sudo apt update && sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d trenadigital.com.br -d www.trenadigital.com.br
```

Se já existe certificado (você viu isso na seção 0), pule este passo —
só aponte os caminhos certos no `ssl_certificate`/`ssl_certificate_key`
acima.

---

## 7. Checklist final

- [ ] `docker ps` mostra os 5 containers rodando e saudáveis.
- [ ] `curl https://trenadigital.com.br/api/obras` responde (401 sem
      token é esperado — significa que a API está no ar).
- [ ] `https://trenadigital.com.br/` abre a tela de login do Angular.
- [ ] `https://trenadigital.com.br/html/` ainda abre o app antigo.
- [ ] Login funciona e as telas (Clientes, Obras, EAP…) carregam dados
      de verdade, não ficam em branco.
- [ ] Testar em outro navegador/aba anônima: fechar e abrir de novo não
      perde o que foi salvo (prova de que está no banco, não no
      navegador).
- [ ] Portas 3306 (MySQL) e 8084 (phpMyAdmin) **não** respondem de fora
      do servidor — só de dentro dele. Teste com
      `curl http://trenadigital.com.br:8084` de outra máquina; tem que
      dar timeout/recusado, nunca abrir.
- [ ] Trocar a senha do MySQL de desenvolvimento por uma nova, se ainda
      não foi feito (seção 2, item 4).

---

## O que eu não sei e você (ou o Lucas) precisa confirmar

- Se já existe alguma config de nginx/certificado no VPS que este guia
  vai sobrescrever — verifique a seção 0 antes de aplicar a seção 5.
- Se o app antigo (vanilla) já está rodando de outro jeito no VPS (não
  necessariamente pelo container `frontend` deste `docker-compose.yml`)
  — nesse caso o `location /html/` da seção 5 precisa apontar pro lugar
  certo, não pra porta 8080.
  - Sistema operacional do VPS (assumi Ubuntu/Debian com `apt` — se for
  outro, os comandos de instalar `certbot`/`nginx` mudam).
