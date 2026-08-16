# TrenaApp — Documentação Técnica e Plano de Migração para Angular/TypeScript

*Compilado em 25/07/2026 a partir dos arquivos em `Desktop\Claude\Projetos\Aplicativo Lucas`.*

---

## Parte 1 — Documentação Técnica (estado atual)

### O que é

TrenaApp (também chamado de "Controle de Obra" / codinome interno "Aplicativo Lucas") é um sistema de gestão de obras desenvolvido pelo Lucas Augusto. Está publicado em produção em `https://trenadigital.com.br/html/index.html`. Módulos principais: EAP (orçamento), Mapa de Fornecedores, Empreitas, Pagamentos e Diário de Obra.

### Stack atual

- **Frontend:** HTML + CSS + JavaScript puro (vanilla), sem framework, sem build step.
- **Backend em produção:** PHP (`backend/storage.php`) — um endpoint único que lê/grava pares chave-valor (`controleObra.*`) em JSON, funcionando como um localStorage remoto. Se o PHP não responder, o front cai automaticamente para `localStorage` do navegador.
- **Backend novo (paralelo, não integrado ainda):** Laravel 11 + PostgreSQL, em `laravel-backend/`. Escrito à mão, nunca executado (ambiente sem PHP/Composer disponível no momento da escrita). Ver seção 3.
- **Banco de dados:** scripts SQL em `banco-de-dados/` para PostgreSQL, com script de migração dos dados hoje presos no localStorage/JSON.

### Estrutura de pastas

```
Aplicativo Lucas/
├── html/
│   ├── index.html              — dashboard (KPIs + diário recente)
│   ├── login.html / cadastro.html
│   ├── eap.html                — Cadastro de EAP (orçamento)
│   ├── mapa.html / mapas.html  — Mapa de fornecedores (novo / lista)
│   ├── empreita.html / empreitas.html / empreita-medicoes.html
│   ├── pagamentos.html
│   ├── diario-obra.html
│   └── demo-redimensionar-colunas.html
├── js/
│   ├── home/01-dashboard.js
│   ├── eap/        00-dom, 01-data, 02-state-utils, 03-engine, 04-tests, 04b-summaries, 05-render, 06-nav, 07-app
│   ├── mapa/        00-dom, 01-data, 02-state-utils, 03-engine, 04-tests, 04b-summaries, 05-render, 06-nav, 07-app
│   ├── mapas/01-lista.js
│   ├── empreita/    10-empreita-dom, 11-empreita-state, 12-empreita-engine, 13-empreita-render, 14-empreita-app
│   ├── empreitas/   01-lista, 02-medicoes
│   ├── pagamentos/  00-dom, 01-state, 02-render, 03-app, 04-ia
│   ├── diario-obra/01-app.js
│   ├── shared/      shell.js (menu lateral/topo), backend-storage.js (camada de persistência), pagamentos-utils.js
│   └── demo/redimensionar-colunas-demo.js
├── css/styles.css               — folha de estilo única, compartilhada por todas as páginas
├── backend/storage.php          — API atual em produção
├── banco-de-dados/*.sql         — schema relacional (ainda não em uso)
└── laravel-backend/             — API relacional nova, em paralelo, não integrada
```

Cada página HTML segue o mesmo padrão: `<aside class="barra-lateral">` (menu) + `<header class="barra-topo">` + `<main class="conteudo">`, com `css/styles.css` compartilhado e `js/shared/shell.js` cuidando do comportamento do menu (colapsar, item ativo, menu do usuário). Isso facilita a reestilização (feita via CSS, sem tocar em HTML/JS) e vai facilitar a futura migração para componentes Angular (o *shell* já está isolado).

### 1. Backend atual em produção (`backend/storage.php`)

Endpoint único, orientado a chave-valor:

| Operação | Requisição |
|---|---|
| Ler | `GET ?key=controleObra...` → `{ ok, value }` |
| Gravar | `POST { "key": "...", "value": "..." }` |
| Remover | `DELETE ?key=controleObra...` |
| Limpar por prefixo | `POST { "action": "clear-prefix", "prefix": "controleObra." }` |

Para rodar localmente: `php -S localhost:8000` na pasta do projeto, acessando `http://localhost:8000/html/index.html`.

### 2. Banco de dados relacional (`banco-de-dados/`)

- `01-criar-tabelas.sql` — cria as tabelas principais (21 tabelas).
- `02-seed-tipos-custo.sql` — popula os 5 tipos de custo fixos (material, mão de obra, equipamento, outros, administração).
- `03-migracao-localstorage.sql` — migra o JSON hoje salvo no localStorage/`storage.php` para as tabelas relacionais, via tabela temporária `import_localstorage` + upsert idempotente.

Pensado para PostgreSQL; IDs em `VARCHAR(36)` para compatibilidade com UUID gerado no frontend.

### 3. Backend Laravel novo (`laravel-backend/`, não integrado)

Construído em paralelo ao `storage.php` — **nada no frontend foi alterado**. Estrutura:

```
laravel-backend/
├── database/migrations/   → schema relacional completo + tabela de storage genérico
├── database/seeders/      → tipos de custo, usuário Lucas
├── app/Models/            → 1 model Eloquent por tabela (Obra, EapItem, Mapa, Empreita, Pagamento, DiarioRegistro, Empresa, User, etc.)
├── app/Http/Controllers/Api/  → ObraController, MapaController, EmpreitaController, PagamentoController, NotaFiscalController, StorageController
├── routes/api.php
└── .env.example
```

Endpoints centrais: `GET/PUT /api/obras/{id}/eap` reconstrói/grava o mesmo formato JSON que `js/eap/02-state-utils.js` já produz (`controleObra.eap.v2`) — ou seja, a integração no frontend seria só trocar a leitura/escrita de `localStorage`/`storage.php` por um `fetch` para esse endpoint.

**Importante:** este código nunca foi executado (ambiente sem PHP/Composer/Postgres disponível). Tratar como primeira versão a validar. Falta: autenticação (Sanctum), testes reais de migration contra Postgres, e a integração de fato com o frontend.

### 4. Camada de estilo (`css/styles.css`)

Um único arquivo CSS, usando variáveis (`--cor-primaria`, `--raio-md`, `--sombra-sm` etc.), compartilhado por todas as páginas. Isso permite reestilizar visualmente o app inteiro trocando só os valores das variáveis — foi assim que o ajuste de layout (modelo `obracontrol.html`, cores navy/âmbar/concreto e tipografia Space Grotesk/Inter/IBM Plex Mono) pôde ser aplicado sem tocar em nenhum HTML ou JS.

---

## Parte 2 — Plano de Migração: Vanilla JS → Angular + TypeScript

**Status: plano/proposta. Nenhum código Angular foi escrito ainda — aguardando validação deste plano antes de iniciar a implementação.**

### Por que isso é um projeto grande

O app tem 9 páginas funcionais, ~37 arquivos JS e uma engine de cálculo bem elaborada (EAP com BDI por item/categoria/global, Mapa de Fornecedores com comparação de propostas, Empreitas com medições). Migrar para Angular não é só "trocar a sintaxe" — é redesenhar a aplicação em componentes, serviços e roteamento, mantendo o comportamento existente 1:1. Isso justifica tratar como projeto próprio, com fases.

### Proposta de arquitetura Angular

| Conceito Angular | Equivalente hoje |
|---|---|
| `AppShellComponent` (sidebar + topbar + router-outlet) | `js/shared/shell.js` + markup repetido em cada `.html` |
| `AuthService` | `login.html`, `cadastro.html`, lógica de sessão hoje implícita |
| `StorageService` (HTTP ou localStorage, com fallback) | `js/shared/backend-storage.js` |
| Módulo/rota `dashboard` | `html/index.html` + `js/home/01-dashboard.js` |
| Módulo/rota `eap` (com componente de tabela dinâmica) | `html/eap.html` + `js/eap/*.js` (9 arquivos — o mais complexo) |
| Módulo/rota `mapa` / `mapas` | `html/mapa.html`, `mapas.html` + `js/mapa/*.js`, `js/mapas/*.js` |
| Módulo/rota `empreita` / `empreitas` | `html/empreita*.html` + `js/empreita/*.js`, `js/empreitas/*.js` |
| Módulo/rota `pagamentos` | `html/pagamentos.html` + `js/pagamentos/*.js` |
| Módulo/rota `diario-obra` | `html/diario-obra.html` + `js/diario-obra/01-app.js` |
| `EapCalcService`, `MapaCalcService`, etc. | Lógica de cálculo hoje misturada em `*-engine.js` / `*-state-utils.js` |
| Angular Material ou componentes próprios + SCSS a partir das variáveis atuais | `css/styles.css` |

### Fases sugeridas

1. **Fundação:** criar o projeto Angular (standalone components, Angular 17+ recomendado), configurar roteamento, portar `css/styles.css` (variáveis) para um tema SCSS global, construir o `AppShellComponent` (sidebar/topbar) — equivalente visual ao que já existe.
2. **Camada de dados:** criar `StorageService`/`ApiService` cobrindo os mesmos contratos do `storage.php` hoje e, em paralelo, dos endpoints do `laravel-backend` (para já nascer compatível com a migração relacional que o Lucas está fazendo).
3. **Módulos simples primeiro** (menor risco): Dashboard, Diário de Obra, Lista de Mapas/Empreitas — poucas regras de negócio, bom para validar o padrão de componente antes de ir para o difícil.
4. **EAP** (maior complexidade: tabela dinâmica, BDI em 3 modos, indicadores) — migrar por último entre os "principais", com testes de regressão comparando valores calculados antes/depois.
5. **Mapa de Fornecedores e Empreitas** — lógica de comparação de propostas e medições.
6. **Corte (cutover):** apontar o domínio para a versão Angular, manter o vanilla em paralelo por um tempo como plano B.

### Riscos e decisões em aberto

- **Paridade de cálculo:** a engine de EAP/Mapa tem regras finas (BDI por categoria vs. item vs. global, rateio). Cada uma precisa de teste automatizado comparando saída antiga vs. nova antes do corte.
- **Qual backend a versão Angular vai consumir:** o `storage.php` atual (mais simples, já validado em produção) ou o `laravel-backend` novo (mais robusto, mas não testado)? Recomendo validar o Laravel isoladamente primeiro (ver seção 3 da Parte 1) antes de acoplar o Angular a ele.
- **Convivência durante a transição:** manter as duas versões (vanilla e Angular) publicadas em paralelo até o Lucas validar cada módulo migrado.
- **Escopo do MVP da migração:** migrar tudo de uma vez ou só os módulos "prontos" (EAP, Mapa, Empreitas, Pagamentos), deixando os "reservados" no protótipo (Cronograma, Desembolso, Compras, Relatórios) para depois?

### Próximo passo recomendado

Validar este plano com você (e possivelmente com o Lucas, já que é o autor do código atual) antes de gerar a estrutura inicial do projeto Angular — em especial as decisões da seção "Riscos e decisões em aberto" acima.
