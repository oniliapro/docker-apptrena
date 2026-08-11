# docker-ctrlobra

Ambiente Docker do Controle de Obra: API Laravel (`controleobra-api/`) + frontend Angular (`frontend/`), nginx, MySQL e phpMyAdmin.

## Pré-requisitos

- Docker e Docker Compose.
- No Windows, recomendado rodar tudo dentro do **WSL** (o Docker Desktop nativo também funciona, mas os comandos abaixo assumem `docker`/`docker-compose` disponíveis no shell). Se estiver no PowerShell/Git Bash sem Docker instalado, prefixe os comandos com `wsl` (ex.: `wsl docker-compose ...`).

## 1. Configurar variáveis de ambiente

Nenhum `.env` é versionado — os dois precisam ser criados manualmente.

> ⚠️ **Existem dois arquivos `.env` diferentes, com o mesmo nome mas propósitos distintos — não confunda/copie um em cima do outro:**
> - **`.env` da raiz** — só as 4 variáveis do MySQL (`MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`), lidas pelo `docker-compose.yml` pra configurar o container `mysql`. Se estiver errado/ausente, o `docker-compose build`/`up` avisa "variable is not set, Defaulting to a blank string".
> - **`controleobra-api/.env`** — a configuração completa do Laravel (`APP_KEY`, `DB_CONNECTION`, sessão, cache, etc.), lida pela aplicação dentro do container `phpfpm`. Se estiver errado/ausente (ex.: com o conteúdo do `.env` da raiz por engano), a API quebra com erro 500 em qualquer rota que toque o banco — e como a resposta de erro não carrega os headers de CORS, o sintoma no navegador aparece como **"CORS Missing Allow Origin"**, escondendo o problema real.

**Raiz do projeto** (credenciais do MySQL, lidas pelo `docker-compose.yml`):

```bash
cp .env.example .env
```

Edite `.env` e defina senhas reais para `MYSQL_ROOT_PASSWORD` e `MYSQL_PASSWORD`.

**API Laravel** (`controleobra-api/.env`):

```bash
cp controleobra-api/.env.example controleobra-api/.env
```

Edite `controleobra-api/.env` e configure a conexão com o banco para apontar para o serviço `mysql` do compose, usando os **mesmos** valores definidos no `.env` da raiz:

```
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=<mesmo valor de MYSQL_DATABASE>
DB_USERNAME=<mesmo valor de MYSQL_USER>
DB_PASSWORD=<mesmo valor de MYSQL_PASSWORD>
```

## 2. Build e subida dos containers

```bash
docker-compose --project-name controleobra build
docker-compose --project-name controleobra up -d
```

Isso sobe 5 serviços:

| Serviço | Container | Porta no host |
|---|---|---|
| nginx (API) | `controleobra-nginx` | http://127.0.0.1:8088 |
| phpfpm | `controleobra-phpfpm` | — (interno) |
| mysql | `controleobra-mysql` | 127.0.0.1:3306 |
| phpMyAdmin | `controleobra-myadmin` | http://127.0.0.1:8084 |
| Angular (dev server) | `controleobra-frontend` | http://localhost:4200 |

## 3. Instalar dependências e preparar o banco

O código é montado como volume, então `vendor/` e o `APP_KEY` não vêm prontos — precisam ser gerados dentro do container `phpfpm`:

```bash
docker exec controleobra-phpfpm composer install
docker exec controleobra-phpfpm php artisan key:generate
docker exec controleobra-phpfpm php artisan migrate
```

> Se `composer install` estourar timeout (comum quando o projeto está num drive montado via WSL, ex. `/mnt/d/...` — I/O mais lento), rode com um timeout maior:
> ```bash
> docker exec -e COMPOSER_PROCESS_TIMEOUT=1200 controleobra-phpfpm composer install
> ```

O container `angular` já instala as dependências do `npm` sozinho ao subir (`node_modules` fica em volume anônimo).

## 4. Testar

- API: `curl http://127.0.0.1:8088/api/me` deve responder `401 Unauthenticated` (rota protegida).
- phpMyAdmin: abra http://127.0.0.1:8084 (host `mysql`, usuário/senha do `.env` da raiz).
- Frontend: abra http://localhost:4200.

Para criar um usuário de teste e obter um token de autenticação:

```bash
curl -X POST http://127.0.0.1:8088/api/registrar \
  -H "Content-Type: application/json" \
  -d '{"empresa":"Empresa Teste","name":"Usuario Teste","email":"teste@example.com","password":"senha12345"}'
```

A resposta traz um `token` — use-o em `Authorization: Bearer <token>` para chamar as rotas protegidas (`/api/me`, `/api/obras`, etc.).

## Parar o ambiente

```bash
docker-compose --project-name controleobra down
```

(o volume `banco_mysql_data` persiste os dados do MySQL entre reinícios; use `down -v` para descartá-lo também.)
