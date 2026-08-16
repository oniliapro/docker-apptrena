# Backend Laravel — Controle de Obra (App do Lucas)

Backend relacional (PostgreSQL + Eloquent) para o app do Lucas, construído em
**paralelo** ao `backend/storage.php` atual — nada no frontend foi alterado,
e o `storage.php` continua funcionando exatamente como hoje.

## ⚠️ Aviso importante

Estes arquivos foram escritos à mão, num ambiente sem PHP/Composer/internet
disponíveis para instalar o Laravel e testar de verdade. Ou seja: **o código
não foi executado nem uma vez**. A estrutura, os nomes de classe e a sintaxe
seguem as convenções do Laravel 11 corretamente, mas trate isso como uma
primeira versão a ser validada rodando localmente — principalmente:

- os testes de FK/constraint das migrations num Postgres real;
- os payloads esperados pelos endpoints de mapas/empreitas/pagamentos (foram
  desenhados a partir da leitura do código JS, mas não foram testados contra
  o frontend de verdade);
- a versão exata do Laravel/PHP disponível na sua máquina.

## O que tem aqui

```
laravel-backend/
├── database/
│   ├── migrations/2024_01_01_000000_create_controle_obra_schema.php
│   │     → todas as 21 tabelas de banco-de-dados/01-criar-tabelas.sql, traduzidas
│   └── seeders/TiposCustoSeeder.php
│         → os 5 tipos de custo fixos (material, mão de obra, equipamento, outros, administração)
├── app/
│   ├── Models/               → 1 model Eloquent por tabela, com relacionamentos
│   └── Http/Controllers/Api/
│         ObraController.php      → CRUD de obras + GET/PUT /obras/{id}/eap
│         MapaController.php      → CRUD completo de mapas (fornecedores/itens/preços/etapas)
│         EmpreitaController.php  → CRUD de empreitas + registrar medição
│         PagamentoController.php → CRUD de pagamentos
├── routes/api.php
└── .env.example
```

## Como instalar (passo a passo)

Isso pressupõe PHP 8.2+, Composer e PostgreSQL instalados na máquina onde o
Lucas roda o app.

1. Criar o esqueleto do Laravel numa pasta nova (ele baixa o framework via
   Composer — por isso precisa ser feito na sua máquina, não aqui):

   ```bash
   composer create-project laravel/laravel controle-obra-api
   ```

2. Copiar por cima os arquivos deste pacote (`laravel-backend/`) para dentro
   de `controle-obra-api/`, sobrescrevendo `routes/api.php` e adicionando as
   pastas `app/Models`, `app/Http/Controllers/Api`, `database/migrations`,
   `database/seeders`.

3. Criar o banco no Postgres:

   ```bash
   createdb controle_obra
   ```

4. Configurar o `.env` (copie de `.env.example`, ajuste usuário/senha do
   Postgres) e gerar a chave da aplicação:

   ```bash
   cp .env.example .env
   php artisan key:generate
   ```

5. Rodar as migrations e o seed:

   ```bash
   php artisan migrate
   php artisan db:seed --class=Database\\Seeders\\TiposCustoSeeder
   ```

6. Subir o servidor:

   ```bash
   php artisan serve
   ```

7. Testar rapidamente:

   ```bash
   curl -X POST http://localhost:8000/api/obras \
     -H "Content-Type: application/json" \
     -d '{"obra_nome":"Reforma Teste","cliente":"Nilza"}'
   ```

## Endpoints principais

| Método | Rota | O que faz |
|---|---|---|
| GET/POST | `/api/obras` | lista / cria obras |
| GET/PUT/DELETE | `/api/obras/{id}` | detalhe / atualiza / apaga uma obra |
| **GET** | `/api/obras/{id}/eap` | reconstrói o JSON `{header, ui, eapItems}` — mesma forma que `controleObra.eap.v2` |
| **PUT** | `/api/obras/{id}/eap` | recebe esse mesmo JSON e grava normalizado (obras, obra_bdi_tipo, obra_ui_config, eap_itens, eap_item_custos) |
| GET/POST/PUT/DELETE | `/api/mapas...` | CRUD completo de mapas (fornecedores, itens, preços, etapas aninhados) |
| GET/POST/PUT/DELETE | `/api/empreitas...` | CRUD de empreitas; `POST /empreitas/{id}/registros` registra medição |
| GET/POST/PUT/DELETE | `/api/pagamentos...` | CRUD de pagamentos (valida que soma dos itens = valor total, igual à regra do frontend) |

O par `GET/PUT /obras/{id}/eap` é o mais importante: ele fala **exatamente**
o dialeto JSON que `js/eap/02-state-utils.js` já produz em
`salvarEstadoObra()`. Isso significa que, no dia em que quiserem integrar de
verdade, a mudança no frontend pode ser só isso (dentro de `carregarEstadoObra`/`salvarEstadoObra`):

```js
// antes: storageEap.getItem(CHAVE_STORAGE_EAP)
// depois: fetch(`/api/obras/${obraId}/eap`).then(r => r.json())
```

## O que NÃO está pronto

- **Sem autenticação.** Como o `storage.php` atual, qualquer um que acesse a
  API lê/escreve tudo. Antes de sair de `localhost`, adicionar Laravel
  Sanctum (autenticação por token) é o próximo passo.
- **Sem integração real com o frontend.** O HTML/JS existente continua
  falando com `storage.php`. Migrar de fato exige trocar as chamadas em
  `js/eap/*`, `js/mapa/*`, `js/empreita/*`, `js/pagamentos/*` para usar estes
  endpoints — não foi feito aqui de propósito, para não arriscar quebrar o
  que já funciona sem o Lucas testar antes.
- **Mapas e empreitas** ganharam CRUD completo no nível relacional, mas hoje
  o frontend só salva um *resumo* deles (não o editor completo linha a
  linha). Os endpoints já suportam o modelo rico; o editor JS teria que
  evoluir para aproveitar isso de verdade.
- **CORS.** Se a API rodar em porta diferente do HTML (ex.: API na 8000,
  front noutra porta), configurar `config/cors.php`.

## Ordem sugerida para o Lucas validar

1. Rodar os passos de instalação acima e confirmar que `php artisan migrate`
   passa sem erro (é o teste mais importante — valida as migrations contra
   um Postgres real).
2. Testar os endpoints com `curl`/Postman antes de qualquer mudança no
   frontend.
3. Só depois disso, decidir se/quando trocar `js/shared/backend-storage.js`
   para falar com essa API em vez de `storage.php`.
