# Instalar e subir o backend

O que eu já pude validar sozinha, e o que depende de você instalar.

---

## O que já foi verificado

Rodei os scripts SQL contra um PostgreSQL em memória:

- **`01-criar-tabelas.sql`** — 39 comandos, 21 tabelas, **zero erros**. O
  schema é válido.
- **`02-seed-tipos-custo.sql`** — roda limpo, popula as 5 categorias.
- **`03-migracao-localstorage.sql`** — não pôde ser testado assim: usa
  funções PL/pgSQL, que o Postgres em memória não suporta. Precisa de um
  Postgres de verdade.

Também conferi que as migrations do Laravel cobrem todas as 21 tabelas
do SQL, mais quatro que só existem lá: `empresas` (multiempresa),
`diario_registros` e `diario_fotos` (diário de obra) e `app_storage` (a
ponte chave-valor que o frontend Angular usa).

E confirmei que o `StorageController` isola tudo pela empresa do usuário
autenticado — nunca pelo que vem no corpo da requisição. Isso está
correto e é o que o frontend Angular assume.

**O que continua sem verificação:** se `php artisan migrate` roda sem
erro contra um Postgres real. É a única forma de validar as migrations
traduzidas, e exige PHP instalado.

---

## O que você precisa instalar

Eu não consigo instalar programas na sua máquina — os instaladores pedem
permissão de administrador do Windows, e eu não tenho como responder a
esse tipo de janela.

São três coisas:

### 1. PHP 8.2 ou superior

Baixe em **https://windows.php.net/download** — versão **Thread Safe
x64**. É um zip, não instalador: descompacte em `C:\php` e adicione essa
pasta ao PATH do Windows.

Depois, abra `C:\php\php.ini` (copie de `php.ini-development`) e ative
estas linhas, tirando o `;` do início:

```
extension=pdo_pgsql
extension=pgsql
extension=mbstring
extension=openssl
extension=fileinfo
extension=curl
```

### 2. Composer

Baixe em **https://getcomposer.org/download** — o instalador
`Composer-Setup.exe` encontra o PHP sozinho.

### 3. PostgreSQL

Baixe em **https://www.postgresql.org/download/windows** — durante a
instalação ele pede uma senha para o usuário `postgres`. **Anote essa
senha**, ela vai no arquivo `.env`.

---

## Depois de instalar

Rode o **`DIAGNOSTICO-BACKEND.bat`** que está nesta pasta e me avise —
ele grava um arquivo com as versões encontradas, que eu leio para
confirmar que está tudo certo antes de seguir.

Se estiver, os passos seguintes são:

```bash
# 1. Criar o esqueleto do Laravel (baixa o framework)
cd "C:\Users\Onilia\Desktop\Claude\Projetos\Aplicativo Lucas"
composer create-project laravel/laravel controle-obra-api

# 2. Copiar os arquivos deste pacote por cima
#    (app/, database/, routes/, config/, .env.example)

# 3. Criar o banco
createdb -U postgres controle_obra

# 4. Configurar o .env e gerar a chave
cd controle-obra-api
copy .env.example .env
php artisan key:generate

# 5. O teste que importa
php artisan migrate

# 6. Popular os dados iniciais
php artisan db:seed --class=Database\\Seeders\\TiposCustoSeeder

# 7. Subir
php artisan serve
```

Posso te acompanhar em cada um desses passos — é só me chamar depois do
diagnóstico.

---

## Um detalhe que vai precisar de ajuste

Com o Angular na porta 4200 e a API na 8000, o navegador bloqueia as
chamadas por segurança (CORS). O arquivo `config/cors.php` precisa
liberar `http://localhost:4200`. Eu faço esse ajuste quando o backend
estiver de pé.
