# Migrar o VPS para o repositório único (docker-apptrena)

> Escrito em 18/08/2026. Eu (Claude) não tenho acesso SSH ao VPS da
> Hostinger — só à pasta compartilhada do computador do Lucas, via
> Tailscale. Todo comando abaixo precisa ser rodado por você (ou pelo
> Lucas), direto no VPS. Fui conferindo cada suposição que consegui
> checar de fora (ex.: o site ao vivo) e marcando com ⚠️ o que só dá
> pra confirmar rodando os comandos de verificação lá dentro.

## Antes de tudo: o achado mais importante

O `docker-compose.yml` deste repositório **mudou as portas** num commit
recente (`4f364b4`, "Últimas modificações antes da mudança para nova
wsl"): nginx 8088→**8188**, phpfpm 9000→**9001**, MySQL 3306→**3307**,
phpMyAdmin 8084→**8184**, Angular dev 4200→**4201**. O comentário no
arquivo explica por quê: **na máquina de desenvolvimento do Lucas**,
outro projeto (ImigraParaguai) já ocupa as portas padrão.

O problema: toda a documentação de deploy (`DEPLOY-PRODUCAO.md`) e,
presumivelmente, a config atual do nginx do sistema no VPS, apontam pro
container da API na porta **8088** (padrão antigo). Se você simplesmente
clonar e subir este `docker-compose.yml` como está no VPS, a API vai
passar a escutar em 8188 — e o nginx do sistema, apontando pra 8088,
vai começar a dar erro (502/504) em `/api/`, derrubando o site inteiro,
mesmo com todo o resto certo.

**Isso só é um problema se o VPS não tiver o mesmo conflito de portas**
(ou seja, se o ImigraParaguai não estiver também rodando lá). O passo 3
abaixo mostra como checar e resolver — sem precisar mexer no
`docker-compose.yml` versionado (que precisa continuar com as portas
deslocadas, por causa da máquina do Lucas).

---
## Passo 0 — Descobrir o estado atual do VPS (só leitura, não muda nada)

Conecte via SSH (`ssh usuario@SEU_IP` ou o terminal web da Hostinger) e
rode, um de cada vez:

```bash
# O que está rodando agora
docker ps -a

# Onde estão as pastas do projeto hoje
ls -la ~
find / -maxdepth 5 -iname "docker-compose.yml" 2>/dev/null
find / -maxdepth 5 -iname ".git" -type d 2>/dev/null
```

Para cada pasta de repositório que aparecer, veja de onde ela vem:

```bash
cd <pasta-encontrada> && git remote -v && git log -1 --oneline
```

Isso te diz se é `apptrena-angular`/`apptrena-backend` (esquema antigo)
ou já é `docker-apptrena` (repositório novo).

**Config do nginx do sistema** (não o container — o nginx que fica nas
portas 80/443 públicas):

```bash
sudo nginx -T 2>/dev/null | grep -B2 -A 15 "server_name trenadigital"
```

Anote, especialmente, a linha `proxy_pass http://127.0.0.1:XXXX;` dentro
do `location /api/` — essa é a porta que o container de nginx da API
precisa continuar escutando depois da migração.

**Portas já em uso no VPS** (resolve a dúvida do aviso acima):

```bash
sudo ss -tlnp | grep -E ':(8088|8188|9000|9001|3306|3307|8084|8184|4200|4201)\b'
```

Se aparecer algo além dos containers do AppTrena usando 8088/9000/3306/8084
(ex.: outro projeto), o VPS tem o mesmo conflito da máquina do Lucas — aí
as portas deslocadas (8188 etc.) já fazem sentido lá também, e o que
precisa mudar é o `proxy_pass` do nginx do sistema. Se **não** aparecer
nada (portas padrão livres), siga com a restauração das portas padrão no
Passo 3.

---

## Passo 1 — Backup antes de mexer em qualquer coisa

Mesma lógica do backup que fiz aqui localmente, só que agora do lado do
servidor — e aqui envolve dados reais de produção, então é ainda mais
importante.

```bash
mkdir -p ~/backups-apptrena && cd ~/backups-apptrena

# 1. Dump do banco de dados (ajuste usuário/senha/nome conforme o .env
#    real do VPS — não uso as credenciais daqui porque são diferentes
#    das de desenvolvimento)
docker exec controleobra-mysql sh -c \
  'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  > backup-banco-$(date +%F-%H%M).sql

# 2. Arquivos enviados pelo sistema (notas fiscais, fotos do diário de
#    obra, arquivos da nova feature de Pastas/Arquivos) — ajuste o
#    caminho pra pasta real do backend em produção
tar czf backup-storage-$(date +%F-%H%M).tar.gz \
  -C <caminho-do-backend-atual> storage

# 3. Os dois .env de produção (não estão no Git — se perder, não tem
#    como recuperar pelo repositório)
cp <caminho-do-backend-atual>/.env backup-env-raiz-$(date +%F-%H%M)
cp <caminho-do-backend-atual>/controleobra/.env backup-env-laravel-$(date +%F-%H%M)

# 4. O código das duas pastas antigas, sem vendor/node_modules (o
#    histórico git delas já é o backup principal, isso é só reforço)
tar czf backup-codigo-antigo-$(date +%F-%H%M).tar.gz \
  --exclude=vendor --exclude=node_modules \
  <caminho-apptrena-angular> <caminho-backend-docker>

ls -lh ~/backups-apptrena/
```

Se puder, copie essa pasta `~/backups-apptrena` pro seu computador
também (`scp -r usuario@SEU_IP:~/backups-apptrena ./` a partir do
Windows), pra não depender só do próprio VPS.

---

## Passo 2 — Clonar o repositório novo ao lado (sem tocar no que já está no ar)

Isso é seguro por si só — clonar numa pasta nova não afeta os
containers que já estão rodando.

```bash
cd /opt   # ou o mesmo lugar onde fica o resto do projeto hoje
git clone https://github.com/ciceroalmeida/docker-apptrena.git
cd docker-apptrena
git log -1   # confirme que veio o commit mais recente (b2a694b ou mais novo)
```

---

## Passo 3 — Portas: restaurar o padrão (caso mais provável) ou ajustar o nginx

Se o Passo 0 mostrou que as portas padrão (8088, 9000, 3306, 8084, 4200)
**estão livres** no VPS, crie um `docker-compose.override.yml` só aí no
servidor (não vai pro Git — é específico dessa máquina, o Compose já
combina esse arquivo com o principal automaticamente):

```bash
cat > docker-compose.override.yml << 'EOF'
services:
  nginx:
    ports:
      - "127.0.0.1:8088:80"
  phpfpm:
    ports:
      - "9000:9000"
  mysql:
    ports:
      - "127.0.0.1:3306:3306"
  myadmin:
    ports:
      - "127.0.0.1:8084:80"
EOF
```

(Omiti o serviço `angular`, que só serve pra desenvolvimento — em
produção o Angular é build estático servido pelo nginx do sistema, não
precisa desse container rodando.)

Se, em vez disso, o Passo 0 mostrou que as portas padrão **já estão
ocupadas** por outra coisa no VPS, não crie esse override — mantenha as
portas deslocadas do `docker-compose.yml` como estão, e ajuste a config
do nginx do sistema pra apontar `proxy_pass` pra `127.0.0.1:8188` em vez
de `8088` (`sudo nano /etc/nginx/sites-available/trenadigital.com.br`,
depois `sudo nginx -t && sudo systemctl reload nginx`).

---

## Passo 4 — Levar os `.env` de produção pra pasta nova

```bash
cp <caminho-do-backend-atual>/.env docker-apptrena/.env
cp <caminho-do-backend-atual>/controleobra/.env docker-apptrena/controleobra-api/.env
```

Confira que vieram certos:

```bash
grep -E "^(APP_ENV|APP_DEBUG|APP_URL|DB_)" docker-apptrena/controleobra-api/.env
```

Espera-se `APP_ENV=production`, `APP_DEBUG=false`,
`APP_URL=https://trenadigital.com.br`.

---

## Passo 5 — Trocar os containers da pasta antiga pra pasta nova

Como os `container_name` são fixos, não dá pra rodar as duas pastas ao
mesmo tempo — precisa parar a antiga antes de subir a nova. O volume do
banco (`banco_mysql_data`) é nomeado, então os dados sobrevivem à troca
**desde que o nome do volume seja o mesmo nos dois `docker-compose.yml`**
— confira isso antes:

```bash
grep -A2 "^volumes:" <caminho-antigo>/docker-compose.yml
grep -A2 "^volumes:" docker-apptrena/docker-compose.yml
```

Se baterem (`banco_mysql_data` nos dois), siga:

```bash
# Para a stack antiga (não apaga o volume do banco)
cd <caminho-do-backend-atual>
docker compose --project-name controleobra down

# Instala dependências do Laravel na pasta nova
docker run --rm -v "$(pwd)/../docker-apptrena/controleobra-api:/app" -w /app \
  composer:2 install --no-dev --optimize-autoloader

# Sobe a stack nova
cd ~/docker-apptrena
docker compose --project-name controleobra build
docker compose --project-name controleobra up -d
```

Se os nomes dos volumes **não baterem**, pare aqui e me chame de volta —
nesse caso o volume novo nasceria vazio, e é preciso renomear o volume
ou apontar o `docker-compose.yml` novo pro volume antigo antes de subir,
senão o banco "some" (os dados continuam existindo no volume antigo, só
não estariam conectados).

---

## Passo 6 — Verificação pós-migração (dentro do VPS)

```bash
# 1. Todos os containers de pé?
docker ps
# Espera: controleobra-nginx, controleobra-phpfpm, controleobra-mysql,
# controleobra-myadmin — todos "Up", sem reiniciar em loop.

# 2. A API responde por dentro do container?
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8088/api/obras
# (ou :8188, se você manteve as portas deslocadas no Passo 3)
# Espera: 401 (sem token) — não 000/502/500.

# 3. O nginx do sistema está repassando certo?
sudo nginx -t
curl -s -o /dev/null -w "%{http_code}\n" https://trenadigital.com.br/api/obras
# Espera: 401 também, agora vindo de fora.
```

```bash
# 4. O banco tem os dados de antes (prova de que o volume certo foi montado)?
docker exec controleobra-mysql sh -c \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM obras;"'
# Espera: um número > 0, batendo com o que você lembra de ter cadastrado.

# 5. Logs limpos, sem erro 500 disparando?
docker logs controleobra-phpfpm --tail 50
docker logs controleobra-nginx --tail 50
```

Só depois de tudo isso passar, teste pelo navegador de verdade:
`https://trenadigital.com.br/app/` (login, abrir uma obra, ver se os
dados são os mesmos de antes) e `https://trenadigital.com.br/html/`
(app antigo, deve continuar funcionando sem mudança).

---

## Passo 7 — Rodar as migrations pendentes

Há migrations de 15 a 21/08 ainda não confirmadas como rodadas em
produção (nível da EAP, orçado congelado, frete no mapa, freteiro
particular, pastas/arquivos, código do mapa):

```bash
docker exec controleobra-phpfpm php artisan migrate --status
# Veja quais aparecem como "Pending"

docker exec controleobra-phpfpm php artisan migrate --force
```

Depois, confirme na prática que as telas novas (Arquivos/Pastas por
obra) abrem sem erro 500.

---
## Passo 8 — Só depois de confirmar tudo funcionando, arquive (não apague) as pastas antigas

```bash
mv <caminho-apptrena-angular> ~/_arquivo-apptrena-angular-antigo-2026-08-18
mv <caminho-backend-docker> ~/_arquivo-backend-docker-antigo-2026-08-18
```

Deixe assim por pelo menos alguns dias de uso normal antes de apagar de
vez — é o mesmo princípio do skill de Tailscale: nunca excluir
definitivamente numa primeira passada.

---

## Se algo der errado: como voltar atrás

```bash
cd ~/docker-apptrena
docker compose --project-name controleobra down

cd <caminho-do-backend-atual>   # a pasta antiga, ainda não apagada
docker compose --project-name controleobra up -d
```

Como o volume do banco não foi tocado (só desconectado/reconectado), os
dados voltam exatamente como estavam. Se algo no banco também precisar
voltar (por causa das migrations do Passo 7), restaure o dump do Passo 1:

```bash
docker exec -i controleobra-mysql sh -c \
  'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < ~/backups-apptrena/backup-banco-*.sql
```
