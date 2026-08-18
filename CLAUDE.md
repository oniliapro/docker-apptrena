# CLAUDE.md — instruções de bootstrap para este projeto

> Gerado por Claude (Cowork) em 15/08/2026, lendo os documentos que já
> existiam na pasta. Não substitui `docs/CONTEXTO.md` — só organiza o
> ponto de entrada, porque o projeto ainda não tinha um `CLAUDE.md` na
> raiz. Se este arquivo e `docs/CONTEXTO.md` discordarem em algum
> detalhe, `docs/CONTEXTO.md` vale mais (é atualizado com mais
> frequência).

## Leia nesta ordem

1. Este arquivo — visão rápida de bootstrap.
2. `docs/CONTEXTO.md` — memória viva do projeto: estado atual,
   decisões pendentes, histórico. **Leia antes de qualquer alteração.**
3. `README.md` — como subir o ambiente Docker localmente.
4. `docs/MANUAL.md` — operações do dia a dia (trocar modelo de IA,
   variáveis de ambiente).
5. `docs/DEPLOY-PRODUCAO.md` — como publicar em produção (VPS
   Hostinger, `trenadigital.com.br`).
6. `frontend/INTEGRACAO.md`, `frontend/BACKEND.md`, `frontend/ESTADO.md`
   — histórico de decisões da integração Angular↔API. Podem estar
   defasados no resumo do topo — cada um tem notas de atualização mais
   recentes logo no início, leia essas primeiro.

## O que é o sistema

**AppTrena** (nomes anteriores: TrenaApp, "Controle de Obra", Sistema
de Controle Comercial Zero1) — sistema de gestão de obras do Lucas
Augusto (engenheiro). Onilia acompanha/organiza o desenvolvimento.
**Em produção real em https://trenadigital.com.br.**

Stack: Laravel 12 (`controleobra-api/`) + Angular 19/22
(`frontend/`) + MySQL 8.0 + nginx + phpMyAdmin, tudo orquestrado via
`docker-compose.yml` nesta pasta.

Multiempresa: cada usuário pertence a uma `empresa_id`; logins
diferentes podem ver obras diferentes (ou nenhuma).

## Estrutura desta pasta (`docker-apptrena`)

```
docker-apptrena/
├── CLAUDE.md              ← este arquivo
├── README.md              ← como subir o ambiente
├── docker-compose.yml     ← 5 serviços: nginx, phpfpm, mysql, myadmin, angular
├── Dockerfile_angular / Dockerfile_nginx / Dockerfile_php
├── configuracao.sh        ← script de setup (composer install, popular banco a partir de dump)
├── .env                   ← só as 4 variáveis do MySQL (não versionado)
├── controleobra-api/      ← API Laravel
│   ├── app/Http/Controllers/Api/  ← Auth, Obra, Empreita, Mapa, Pagamento, DiarioObra, NotaFiscal, Storage
│   ├── routes/api.php
│   ├── database/migrations/
│   └── .env               ← config completa do Laravel (não versionado)
├── frontend/               ← Angular
│   ├── src/app/{core,features,layout,shared}/
│   ├── verificacao/        ← suítes que comparam cálculo JS antigo vs TS novo
│   └── INTEGRACAO.md / BACKEND.md / ESTADO.md / PUBLICAR.md
├── nginx/                  ← config do nginx do container da API
└── docs/                   ← CONTEXTO.md, MANUAL.md, DEPLOY-PRODUCAO.md, apptrena-landing.html
```

## Como rodar localmente

```bash
cp .env.example .env                                   # senhas do MySQL
cp controleobra-api/.env.example controleobra-api/.env  # config do Laravel

docker-compose --project-name controleobra build
docker-compose --project-name controleobra up -d

docker exec controleobra-phpfpm composer install
docker exec controleobra-phpfpm php artisan key:generate
docker exec controleobra-phpfpm php artisan migrate
```

| Serviço | Endereço |
|---|---|
| API (nginx+phpfpm) | http://127.0.0.1:8088 |
| MySQL 8.0 | 127.0.0.1:3306 (banco `dbcontroleobra`) |
| phpMyAdmin | http://127.0.0.1:8084 |
| Angular (dev server) | http://localhost:4200 |

Todas as portas do Docker ficam presas a `127.0.0.1` de propósito — só
alcançáveis da própria máquina, nunca da internet. Não mudar isso sem
necessidade.

## Credenciais de teste (produção)

- `teste@apptrena.com.br` / `trena2026`
- `claude.teste@apptrena.local` / `trena2026`

(cada uma pode enxergar obras diferentes — sistema é multiempresa)

## Convenções de trabalho neste projeto

- Documentação e comunicação em **português**.
- **Existem dois `.env` diferentes, não confundir/copiar um em cima do
  outro:** o da raiz só tem as 4 variáveis do MySQL; o de
  `controleobra-api/` tem a config completa do Laravel. Trocar um pelo
  outro quebra a API com 500 em qualquer rota que toque o banco — e
  como a resposta de erro não tem headers de CORS, o sintoma no
  navegador aparece disfarçado como "CORS Missing Allow Origin".
- Nenhum `.env` é versionado — sempre copiar de `.env.example`.
- **Rodar `frontend/verificacao/VERIFICAR.bat` sempre que mexer em
  cálculo** (EAP, Mapa, Empreita, Pagamentos, resumos, validação de
  CPF/CNPJ) — já pegou pelo menos um bug real (BDI global ignorado na
  Empreita) que passava despercebido sem o comparador.
- Mudanças de modelo de dados/decisão de produto (ex.: congelar orçado,
  nível da EAP escolhido pelo usuário) só devem ser assumidas como
  definitivas se `docs/CONTEXTO.md` confirmar — várias ficaram
  registradas como "pendente de confirmar com o Lucas".
- Modelo de IA da leitura de nota fiscal é configurável via
  `ANTHROPIC_MODEL` em `controleobra-api/.env` (padrão
  `claude-sonnet-4-5`) — não está fixo no código.

## Riscos / pendências conhecidas (detalhes em `docs/CONTEXTO.md`)

- **`docker-compose.yml` não tem `restart:` definido** em nenhum
  serviço — se o VPS de produção reiniciar, a stack não volta sozinha
  (já aconteceu: 2 dias fora do ar em agosto/2026 até alguém notar).
  Vale adicionar `restart: unless-stopped` em cada serviço.
- Cadastros de **Clientes, Responsáveis e Empreiteiros** ainda não têm
  backend relacional — gravam pela ponte chave-valor genérica
  (`/api/storage`), então não se conectam ao resto do sistema.
- `.gitignore` (linha 5) tem uma linha solta `root@187.77.59.52` que
  parece ter sido colada por engano — não é um padrão válido de
  gitignore, e deixa o IP do VPS de produção num arquivo versionado.
  Vale confirmar com o Lucas se pode remover.

## Desenvolvimento recente que `docs/CONTEXTO.md` (13/08/2026) ainda não reflete

Os arquivos abaixo têm data mais nova que a última atualização do
`CONTEXTO.md`, e parecem resolver duas das pendências que ele lista
como "em aberto":

- **Nível da EAP escolhido pelo usuário** — migration de 15/08 adiciona
  a coluna `nivel` (0–4) em `eap_itens`, em vez de só inferir do
  checkbox "Grupo" + posição. Resolve a pendência citada no CONTEXTO.md
  sobre esse ponto.
- **Congelar o Orçado da EAP na confirmação** — migration de 15/08 cria
  `eap_item_orcados_congelados` (snapshot por categoria de custo,
  gravado quando a EAP é confirmada; reabrir a EAP apaga o snapshot e
  volta a recalcular ao vivo). Resolve a outra pendência citada no
  CONTEXTO.md.
- **Frete como item no Mapa** (16/08) — `mapas` ganhou
  `lancar_frete_como_item` (padrão `true`, mantém o comportamento
  antigo) e `frete_etapa_id` opcional; desligado, o frete é embutido
  proporcionalmente nos itens em vez de virar linha própria.
- **Freteiro particular** (17/08) — `mapas` ganhou
  `freteiro_particular` (nome do transportador), preenchido só quando o
  frete particular é considerado.
- `MapaController.php` e `ObraController.php` têm data de modificação
  muito recente (mesmo dia desta leitura), então o código do controller
  correspondente a essas migrations provavelmente já existe.
- `.claude/settings.local.json` tem permissões concedidas hoje
  envolvendo `grep` no `storage/logs/laravel.log` por volta de
  `2026-08-15 03:3x` e um `pkill -f 'php -S'` — indício de uma sessão
  de debug recente (possivelmente ligada a essas mudanças do Mapa).
  Vale perguntar ao Lucas/Onilia se ficou algo pendente dela.

**Recomendação:** atualizar `docs/CONTEXTO.md` com essas novidades na
próxima sessão que mexer em EAP ou Mapa — é o arquivo que qualquer
sessão sem histórico lê primeiro.

## Nota — qual pasta é a "de verdade"?

`docs/CONTEXTO.md` descreve a estrutura do projeto como uma pasta
`AppTrena/` com subpastas `AppTrena-Angular/` e `backend-docker/`, e
diz que o projeto "mora" em `Desktop\Claude\Projetos\AppTrena`, sendo
`D:\PROJETOS\docker-ctrlobra` (pasta irmã desta) só um clone de teste.

Esta pasta (`docker-apptrena`) tem uma estrutura diferente
(`controleobra-api/` e `frontend/` direto na raiz, sem o nível
`backend-docker/`) e evidências de trabalho bem recente e ativo aqui
mesmo (arquivos de hoje, permissões do Claude Code de hoje). Não deu
para confirmar com certeza, só lendo os arquivos, se `docker-apptrena`
é agora a pasta principal do projeto ou mais um clone de trabalho —
vale confirmar com o Lucas antes de assumir qual pasta é a definitiva
para versionar/sincronizar.
