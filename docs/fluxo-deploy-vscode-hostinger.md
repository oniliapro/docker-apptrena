# Fluxo de deploy: VS Code → GitHub → Hostinger (VPS)

Guia rápido pra você e o Lucas manterem o AppTrena atualizado sem pisar no
trabalho um do outro.

> **Atualização (18/08/2026):** este guia foi escrito quando o projeto
> ainda era **dois repositórios separados** (`apptrena-angular` e
> `apptrena-backend`). Desde então a pasta foi unificada num **repositório
> único**, `docker-apptrena` (`github.com/ciceroalmeida/docker-apptrena`),
> com `frontend/` e `controleobra-api/` direto na raiz. As seções abaixo
> foram reescritas pra esse formato único. **Não confirmado:** se o VPS
> já foi atualizado pra clonar esse repositório único, ou se ainda tem
> as duas pastas antigas (`apptrena-angular-src` e
> `~/docker-crtlobras/controleobra`) — se for o segundo caso, o `cd`
> deste guia não vai encontrar a pasta certa; confirme com o Lucas antes
> de rodar os comandos do lado do VPS. **Confirmado (18/08/2026,
> acessando o site ao vivo):** o Angular continua em
> `https://trenadigital.com.br/app/` (com `--base-href /app/`, como
> abaixo) — a raiz do domínio segue sendo o app antigo vanilla.

## Regras de ouro

1. **Sempre `git pull` antes de começar a mexer** — tanto no PC quanto no VPS.
2. **Sempre trabalhar dentro da pasta do repositório** (`docker-apptrena`) —
   editando `frontend/` ou `controleobra-api/` conforme o caso, num único
   `git add`/`commit`/`push` (é um repositório só agora, não dois).
3. **No terminal do VPS, rode um comando de cada vez** — colar vários comandos
   em bloco às vezes falha (mistura o texto ou aciona a confirmação de
   produção do Laravel).
4. **Só um de vocês publica pro VPS por vez** — combinem no WhatsApp antes.

---

## Frontend (Angular) — pasta `frontend/` do repositório único

**No PC (VS Code → terminal integrado):**

```bash
cd docker-apptrena
git pull
# ... editar o código dentro de frontend/ ...
git add -A
git commit -m "descrição da mudança"
git push
```

**No VPS (Hostinger Web Terminal):**

```bash
cd ~/docker-apptrena   # confirme o caminho real — pode ainda estar em ~/apptrena-angular-src, ver aviso no topo
git pull
cd frontend
npm run build -- --base-href /app/
rsync -a --delete dist/trenaapp-angular/browser/ /var/www/apptrena-angular/
```

Site atualizado em `https://trenadigital.com.br/app/`.

> ⚠️ O `--base-href /app/` é **obrigatório**. Sem ele o build quebra o
> site inteiro (tela em branco, arquivos JS/CSS pedidos do lugar errado).

---

## Backend (Laravel) — pasta `controleobra-api/` do repositório único

**No PC:**

```bash
cd docker-apptrena
git pull
# ... editar o código dentro de controleobra-api/ ...
git add -A
git commit -m "descrição da mudança"
git push
```

**No VPS:**

```bash
cd ~/docker-apptrena   # confirme o caminho real — pode ainda estar em ~/docker-crtlobras/controleobra, ver aviso no topo
git fetch && git reset --hard origin/master
docker restart controleobra-phpfpm
```

Se a mudança incluiu uma **migration nova**:

```bash
docker exec controleobra-phpfpm php artisan migrate --force
```

> **(18/08/2026)** Há migrations novas de 15 a 21/08 (nível da EAP,
> orçado congelado, frete no mapa, freteiro particular, pastas/arquivos,
> código do mapa) já commitadas e ainda não confirmadas como rodadas em
> produção — rode o `migrate --force` acima depois do próximo `git pull`
> no VPS, mesmo que o `pull` pareça não ter mudado nada de código visível.

> O `--force` é necessário porque em produção o Laravel pede confirmação
> antes de rodar comandos como `migrate` ou `db:seed`; sem terminal
> interativo de verdade, ele cancela sozinho sem o `--force`.

---

## Se o servidor reiniciar (containers caem)

Isso já aconteceu uma vez — o VPS reiniciou e o stack do AppTrena não subiu
sozinho (só o n8n tinha restart automático). **(18/08/2026)** O
`docker-compose.yml` já ganhou `restart: unless-stopped` em todos os
serviços — a partir do próximo `docker compose up -d` rodado no VPS com
essa versão do arquivo, isso não deve mais acontecer sozinho. Mesmo
assim, se o site sumir do nada, o primeiro passo continua sendo
verificar:

```bash
docker ps
```

Se `controleobra-mysql`, `-nginx`, `-phpfpm` ou `-myadmin` não aparecerem
rodando, suba tudo de novo:

```bash
cd ~/docker-apptrena   # confirme o caminho real — pode ainda estar em ~/docker-crtlobras/controleobra
docker compose up -d
```
