# Fluxo de deploy: VS Code → GitHub → Hostinger (VPS)

Guia rápido pra você e o Lucas manterem o AppTrena atualizado sem pisar no
trabalho um do outro. Dois repositórios, dois caminhos parecidos.

## Regras de ouro

1. **Sempre `git pull` antes de começar a mexer** — tanto no PC quanto no VPS.
2. **Sempre trabalhar dentro da pasta certa do repositório** — nunca na pasta
   `AppTrena` (pai), que não é um repositório git. É `AppTrena-Angular` ou
   `backend-docker/controleobra`.
3. **No terminal do VPS, rode um comando de cada vez** — colar vários comandos
   em bloco às vezes falha (mistura o texto ou aciona a confirmação de
   produção do Laravel).
4. **Só um de vocês publica pro VPS por vez** — combinem no WhatsApp antes.

---

## Frontend (Angular) — repositório `apptrena-angular`

**No PC (VS Code → terminal integrado):**

```bash
cd AppTrena-Angular
git pull
# ... editar o código ...
git add -A
git commit -m "descrição da mudança"
git push
```

**No VPS (Hostinger Web Terminal):**

```bash
cd ~/apptrena-angular-src
git pull
npm run build -- --base-href /app/
rsync -a --delete dist/trenaapp-angular/browser/ /var/www/apptrena-angular/
```

Site atualizado em `https://trenadigital.com.br/app/`.

> ⚠️ O `--base-href /app/` é **obrigatório**. Sem ele o build quebra o site
> inteiro (tela em branco, arquivos JS/CSS pedidos do lugar errado).

---

## Backend (Laravel) — repositório `apptrena-backend`

**No PC:**

```bash
cd backend-docker/controleobra
git pull
# ... editar o código ...
git add -A
git commit -m "descrição da mudança"
git push
```

**No VPS:**

```bash
cd ~/docker-crtlobras/controleobra
git fetch && git reset --hard origin/master
docker restart controleobra-phpfpm
```

Se a mudança incluiu uma **migration nova**:

```bash
docker exec controleobra-phpfpm php artisan migrate --force
```

> O `--force` é necessário porque em produção o Laravel pede confirmação
> antes de rodar comandos como `migrate` ou `db:seed`; sem terminal
> interativo de verdade, ele cancela sozinho sem o `--force`.

---

## Se o servidor reiniciar (containers caem)

Isso já aconteceu uma vez — o VPS reiniciou e o stack do AppTrena não subiu
sozinho (só o n8n tem restart automático). Se o site sumir do nada, primeiro
verifique:

```bash
docker ps
```

Se `controleobra-mysql`, `-nginx`, `-phpfpm`, `-frontend` ou `-myadmin` não
aparecerem rodando, suba tudo de novo:

```bash
cd ~/docker-crtlobras/controleobra
docker compose up -d
```
