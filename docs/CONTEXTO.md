# Contexto do AppTrena

Resumo para qualquer sessão do Claude (ou pessoa — Lucas incluído) que
chegue aqui sem histórico da conversa. Atualizado em 13/08/2026.

**Se você é o Lucas (ou está no Cowork dele):** este arquivo é a memória
do projeto. O Claude de cada pessoa não compartilha memória entre si —
só o que está escrito aqui, dentro da pasta do projeto, viaja quando a
pasta é sincronizada (GitHub ou cópia). Antes de pedir qualquer alteração,
vale mandar o Claude ler este arquivo primeiro.

**Também chamado de:** TrenaApp, trena digital, sistema do Lucas, Sistema
de Controle Comercial Zero1 (protótipo/planilha anterior ao app, feito
pelo próprio Lucas — não é o mesmo código, mas é a origem das regras de
negócio).

**De quem é:** sistema de gestão de obras do Lucas Augusto (engenheiro).
Onilia acompanha/organiza o desenvolvimento. Time cresceu para 3 pessoas
trabalhando no projeto (agosto/2026).

**Status:** ativo e em produção real, em `https://trenadigital.com.br`.
Frontend Angular concluído e publicado no VPS (build estático servido
pelo nginx do sistema a partir de `/var/www/apptrena-angular/`). Backend
Laravel migrado por completo para a API relacional de verdade — EAP,
Mapa, Empreita, Pagamentos e Relatórios já não usam mais a ponte
genérica chave-valor, todos confirmados funcionando contra o banco real
em produção. Pagamentos e Empreita também já persistem no banco
relacional (antes só a EAP). GitHub configurado para o
`AppTrena-Angular` (a linha antiga deste arquivo dizendo que não tinha
repositório próprio estava desatualizada).

Desde 28/07/2026 foram entregues dezenas de telas e correções: cadastro
completo de Fornecedores (com leitura de nota fiscal por foto via IA),
telas novas de Mapa e Empreita, obra com botão de confirmação e trava de
edição, Orçado x Realizado redesenhado por categoria, cronograma de
desembolso (matriz EAP x período), páginas gerais de Empreitas/Pagamentos
com drill-down, dashboard classificado por status da obra, e vários bugs
corrigidos (total do mapa zerado, selects em branco ao reabrir, pagamento
não puxando tipo/etapa do mapa, cabeçalho duplicado na EAP, entre
outros). Lista completa de tarefas fica no histórico de conversa do
Claude, não repetida aqui — este arquivo resume o estado, não o log.

---

## Onde fica tudo

Antes de 27/07/2026 estava espalhado entre `D:\projetos\docker-crtlobras`,
`Desktop\Claude\Projetos\Aplicativo Lucas` e `Downloads\16_TrenaApp`.
Consolidado nesta pasta:

```
AppTrena/
├── README.md            ← visão geral e estrutura (comece por aqui)
├── MANUAL.md             ← manual de operação (trocar modelo de IA, env vars)
├── CONTEXTO.md           ← este arquivo
├── AppTrena-Angular/     ← frontend Angular 22 (repositório git próprio no GitHub)
│   ├── INTEGRACAO.md      ← o que falta ligar entre Angular e API (pode estar defasado, ver CONTEXTO.md antes)
│   ├── BACKEND.md          ← como o Angular fala com o backend
│   ├── INICIAR.bat          ← sobe só o Angular
│   ├── INICIAR-COM-BACKEND.bat ← sobe Docker Desktop + Angular (caminho relativo, portátil entre PCs)
│   └── verificacao/         ← testes de paridade de cálculo (JS antigo vs TS novo)
├── backend-docker/       ← Laravel ("controleobra") + MySQL 5.7 + nginx, via Docker
├── docs/                 ← pesquisa de concorrentes, plano de migração, fluxo de deploy
└── _arquivo/             ← versões antigas e documentação obsoleta — só histórico, zipado
```

## Como roda

- **Domínio de produção:** `trenadigital.com.br` — não mudar até o Lucas
  registrar o domínio "apptrena". Site já está no ar de verdade lá.
- **Dev local:** duplo clique em `AppTrena-Angular/INICIAR-COM-BACKEND.bat`
  — sobe o Docker Desktop direto (não precisa mais de WSL) e o Angular
  (`localhost:4200`).
- **Portas:** backend `127.0.0.1:8088`, MySQL `3306`, phpMyAdmin `8084`,
  app antigo (vanilla, ainda em paralelo) `8080`.
- **Conferir cálculos:** `AppTrena-Angular/verificacao/VERIFICAR.bat`
  compara o JS original com o TypeScript novo (Pagamentos, EAP, Mapa,
  Empreita, Resumos, validação de CPF/CNPJ).

## Pontos vivos / decisões pendentes

- **Feito e em produção:** a EAP fala direto com
  `GET/PUT /obras/{id}/eap`, e Mapa, Empreita, Pagamentos e Relatórios
  também migraram para os endpoints relacionais próprios — a ponte
  genérica chave-valor não é mais usada por nenhuma dessas telas.
  Detalhes em `AppTrena-Angular/INTEGRACAO.md` (pode estar defasado no
  detalhe fino — o resumo aqui é o que vale).
- **Incidente de produção (resolvido):** em agosto/2026 a stack
  `docker-crtlobras` inteira (mysql, nginx, phpfpm, frontend, myadmin)
  ficou 2 dias fora do ar depois de um restart do VPS, sem ninguém notar
  — só o container `n8n` tinha política de restart automático. Resolvido
  com `docker compose up -d` na pasta `backend-docker/`. **Risco que
  continua existindo:** o `docker-compose.yml` ainda não tem `restart:`
  definido pros serviços do AppTrena — se o VPS reiniciar de novo, a
  stack não volta sozinha. Vale adicionar `restart: unless-stopped` em
  cada serviço num próximo ajuste.
- **Credenciais de teste (produção):** usuário real
  `teste@apptrena.com.br`, senha `trena2026`; usuário de teste adicional
  `claude.teste@apptrena.local`, senha `trena2026`. O sistema é
  multiempresa — cada usuário pertence a uma `empresa_id` diferente, por
  isso logins diferentes podem mostrar obras diferentes (ou nenhuma).
- **`.env` normalizados (09/08/2026):** os dois arquivos `.env`
  (`backend-docker/.env` e `backend-docker/controleobra/.env`) foram
  limpos de variáveis mortas/confusas e o app foi renomeado de
  "Controle de Obra"/"Laravel" para **AppTrena** em `APP_NAME`. O
  `.env` do Laravel local agora reflete `APP_ENV=local` de verdade (era
  uma cópia disfarçada da config de produção) — não confundir com o
  `.env` de produção no VPS, que é mantido separado e não é sobrescrito
  por deploy.
- **Limpeza do `backend-docker` (08-09/08/2026):** o antigo frontend
  vanilla (`frontend-app/`), os diretórios de referência (`_lixo_*`) e o
  `banco-mysql/` (109MB de datadir MySQL cru, não usado — o Docker usa o
  volume nomeado `banco_mysql_data`) foram arquivados em
  `_arquivo/controleobra-antigo-backend-docker-2026-08-08.zip` e
  removidos da pasta ativa. O `docker-compose.yml` não tem mais o
  serviço `frontend` (o Angular é servido pelo nginx do sistema, fora do
  Docker). Documentação obsoleta do `AppTrena-Angular/` (`ESTADO.md`,
  `PUBLICAR.md`, `PUBLICAR-REVISAO.bat`) também foi arquivada, em
  `_arquivo/angular-docs-antigos-2026-08-08.zip`.
- **`INICIAR-COM-BACKEND.bat` corrigido (09/08/2026):** não depende mais
  de WSL nem de usuário/caminho fixo — usa caminho relativo ao próprio
  `.bat` e chama o Docker Desktop direto. Testado com sucesso num clone
  novo do AppTrena em `D:\PROJETOS\docker-ctrlobra` — o nome da pasta é
  só resquício de um clone de teste, o projeto ali é o AppTrena mesmo
  (não confundir com o antigo `docker-crtlobras` pré-reorganização). É
  um clone de teste local, não é onde o projeto mora — o projeto
  continua em `Desktop\Claude\Projetos\AppTrena`.
- **Novos documentos:** `docs/fluxo-deploy-vscode-hostinger.md` (fluxo
  de deploy do VS Code até o Hostinger, com PDF equivalente entregue à
  parte) e uma página de venda (`apptrena-landing.html`, estilo Zero1
  Tecnologia) — **essa página ainda não está guardada dentro desta
  pasta do projeto**, só foi entregue na pasta Downloads. Se for pra
  ficar disponível pro Lucas também, precisa ser movida pra cá (por
  exemplo `docs/apptrena-landing.html`) e/ou versionada no GitHub.
- **Feito:** Orçado x Realizado na EAP — quando a EAP está
  confirmada, cada item ganha colunas de Orçado (total calculado, ao
  vivo) e Realizado (soma dos pagamentos vinculados via `eapId`, já
  existente), com um clique abrindo a lista de pagamentos daquele item.
  Inspirado num protótipo mais amplo que o Lucas mandou
  (`obracontrol.html`). Ficaram pendentes pra conversar com ele (sem
  prazo definido — combinamos de ver com calma): se o "orçado" deveria
  congelar no momento da confirmação em vez de recalcular sempre; se o
  nível da EAP deveria ser escolhido direto pelo usuário (1-4) em vez de
  inferido do agrupamento; uma ação de "apagar só os valores unitários"
  separada de "apagar tudo"; e se a estrutura de login/assinatura/multi-
  usuário que aparece nesse protótipo é a direção real do produto.
  Detalhes em `AppTrena-Angular/INTEGRACAO.md`.
- **Feito (28/07/2026):** "obra como contexto" — EAP, Mapa, Empreita,
  Pagamentos e Relatórios eram globais (uma EAP só no sistema inteiro);
  agora cada aba da obra carrega e grava os dados só daquela obra (chave
  por obra na ponte chave-valor, mais `withRouterConfig` para as abas
  herdarem o `:id`). As rotas de editor único sem obra (`/mapa`,
  `/empreita`, `/pagamentos`, `/relatorios` na raiz) foram removidas —
  só existem dentro da obra agora. Como consequência, vários links pela
  aplicação que apontavam pra essas rotas antigas foram corrigidos
  (menu "Lançar", cartões do dashboard, botões "+ Novo" das listas de
  Mapas/Empreitas) — todos redirecionando para `/obras`, já que agora
  sempre precisa escolher a obra primeiro. Detalhes em
  `AppTrena-Angular/INTEGRACAO.md`.
- **Feito (28/07/2026):** o contrato da Empreita (task #45) agora é
  lançado por categoria de custo, digitado pelo usuário — o sistema não
  calcula/distribui mais esse valor a partir do orçado. A tela da
  Empreita ganhou um campo de Contrato e um de Reserva por categoria
  (mesma lista da EAP). Suíte de verificação atualizada (11 casos,
  incluindo um provando que o contrato não precisa seguir a proporção do
  orçado) — `VERIFICAR.bat` passa. Detalhes em
  `AppTrena-Angular/INTEGRACAO.md`.
- Modelo de IA da leitura de nota fiscal por foto é configurável via
  `ANTHROPIC_MODEL` no `.env` do backend (padrão `claude-sonnet-4-5`;
  pode trocar para `claude-opus-5` — ver `MANUAL.md`).
- `backend-docker/controleobra/vendor` (dependências PHP) não foi trazido
  na reorganização — rodar `composer install` na primeira vez que for
  usar o backend fora do Docker.
- Telas que nunca existiram no protótipo original (Clientes, Responsáveis,
  Empreiteiros, Relatórios, e algumas abas como Cronograma e Compras)
  aparecem como "área reservada" no Angular — não é bug, é trabalho futuro.

## Histórico rápido

- App original: vanilla JS/HTML/CSS, servido por PHP simples, com
  `localStorage` como fallback.
- Migração para Angular 22 + TypeScript, mantendo os mesmos cálculos
  (verificados item a item contra o código original).
- Backend Laravel já existia pronto (rotas idênticas às que o Angular
  consumia) — a integração foi mais simples do que o esperado.
- 27/07/2026: tudo reorganizado numa pasta única (`AppTrena`) para
  facilitar acompanhamento e backup; nome do projeto trocado de "TrenaApp"
  para "AppTrena" nos textos e telas (domínio de produção não mudou).
