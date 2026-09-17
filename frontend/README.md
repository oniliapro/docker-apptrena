# AppTrena — Frontend Angular

Migração do frontend vanilla (arquivado em `../_arquivo/Aplicativo-Lucas-versao-antiga`) para Angular 22 + TypeScript, consumindo o `laravel-backend`.

> Este README ficou desatualizado (ainda descreve a Fase 1). Para o
> estado atual do projeto, ver `ESTADO.md` e `INTEGRACAO.md`; para subir
> o backend de verdade (Docker, não `php artisan serve`), ver `BACKEND.md`.

**Status: Fase 1 (fundação) concluída.** Projeto, tema, casca, autenticação e rotas prontos. As telas de negócio (EAP, Mapa, Empreita, Pagamentos, Diário) existem como rotas com placeholder — a lógica ainda não foi portada.

---

## Como rodar

```bash
npm install
npm start          # http://localhost:4200
```

O backend precisa estar no ar em paralelo — hoje é o Docker em
`../backend-docker` (ver `BACKEND.md`), não o `php artisan serve` abaixo,
que era do protótipo inicial:

```bash
cd ../_arquivo/Aplicativo-Lucas-versao-antiga/laravel-backend   # setup antigo, ver BACKEND.md para o atual
php artisan serve                          # http://localhost:8000
```

A URL da API fica em `src/environments/environment.ts` (dev) e `environment.prod.ts` (produção).

Build de produção: `npm run build` → gera em `dist/trenaapp-angular`.

---

## O que já existe

### Tema (`src/styles/`)

- `_tokens.scss` — paleta ObraCerta (navy/âmbar/concreto), tipografia (Space Grotesk / Inter / IBM Plex Mono), raios e sombras. Mantidos como CSS custom properties, iguais aos do `css/styles.css` do app vanilla, para que o visual seja idêntico e possa ser trocado em runtime.
- `_base.scss` — elementos globais (tabelas, campos, botões, painéis) e utilitários herdados (`.valor`, `.centro`, `.atenuado`, `.painel`…).

As fontes são carregadas por `<link>` em `src/index.html`. O *inlining* de fontes do Angular foi desligado no `angular.json` de propósito: assim o build não depende de acesso à rede.

### Casca (`src/app/layout/app-shell/`)

Substitui `js/shared/shell.js` e o `<aside>`/`<header>` repetido em cada HTML. Preserva os comportamentos originais:

- recolher/expandir a barra lateral, com persistência em `localStorage`;
- item de menu ativo (agora via `routerLinkActive`, em vez de comparar `location.pathname`);
- menu do usuário que fecha ao clicar fora ou apertar Esc;
- sair da conta.

### Autenticação (`src/app/core/`)

O `laravel-backend` usa Sanctum (`POST /api/login` devolve um token). Implementado:

- `auth.service.ts` — login, registro, logout, sessão persistida, estado exposto via signals;
- `auth.interceptor.ts` — anexa `Authorization: Bearer <token>` e, em caso de 401, redireciona ao login;
- `auth.guard.ts` — protege as rotas internas, guardando o destino em `?redirect=`;
- `features/auth/login/` — tela de login (substitui `html/login.html`).

### API (`src/app/core/services/api.service.ts`)

Métodos tipados para todas as rotas de `laravel-backend/routes/api.php`: obras, EAP (`GET/PUT /obras/{id}/eap`), mapas, empreitas + medições, pagamentos + leitura de nota, diário, e o storage genérico chave-valor (ponte com o formato antigo, útil enquanto telas não migradas convivem com as novas).

Os tipos ficam em `core/models/api.models.ts`, espelhando as validações do `ObraController` e o seeder de tipos de custo.

### Rotas (`src/app/app.routes.ts`)

| Rota | Origem no app vanilla |
|---|---|
| `/login` | `html/login.html` |
| `/inicio` | `html/index.html` + `js/home/01-dashboard.js` |
| `/eap` | `html/eap.html` + `js/eap/*.js` |
| `/mapa` · `/mapas` | `html/mapa.html`, `mapas.html` |
| `/empreita` · `/empreitas` | `html/empreita*.html` |
| `/pagamentos` | `html/pagamentos.html` |
| `/diario-obra` | `html/diario-obra.html` |

Todas com carregamento preguiçoso (lazy) — cada tela vira um bundle próprio.

---

## Próximos passos (Fase 2)

Portar a lógica de cada módulo, na ordem sugerida no plano (`../docs/TrenaApp-Documentacao-e-Plano-Angular.md`): primeiro os simples (Dashboard, Diário, listas), depois Mapa e Empreitas, e por último a EAP — que é a mais complexa (tabela dinâmica, BDI em três modos, indicadores) e merece testes comparando os valores calculados com os do app atual antes do corte.

Dois pontos que o Lucas precisa validar antes:

1. **O `laravel-backend` nunca foi executado.** Rodar `php artisan migrate` contra um Postgres real é o teste mais importante — se o schema não subir, os contratos que este frontend assume mudam.
2. **CORS.** Com o Angular na 4200 e a API na 8000, `config/cors.php` precisa liberar a origem do frontend.
