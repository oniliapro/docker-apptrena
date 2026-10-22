# Contexto do AppTrena

Resumo para qualquer sessão do Claude (ou pessoa — Lucas incluído) que
chegue aqui sem histórico da conversa. Atualizado em 13/08/2026 (nota
pontual de 22/08/2026 abaixo, em "Pontos vivos" — o restante deste
arquivo pode estar mais defasado do que a data no topo sugere: cadastros
de Clientes/Responsáveis/Empreiteiros/Fornecedores, o módulo de Arquivos
anexados, o cronograma de desembolso e o `restart: unless-stopped` no
`docker-compose.yml` já existem no código, mas não estão descritos
abaixo. Vale um refresh completo deste arquivo numa próxima sessão).

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
  **(09/10/2026)** O domínio definitivo passou a ser `comtrena.com.br`
  (já registrado pelo Lucas, ainda não apontado para o VPS) — ver a REGRA
  no topo de "Pontos vivos" antes de publicar o app.
- **Dev local:** duplo clique em `AppTrena-Angular/INICIAR-COM-BACKEND.bat`
  — sobe o Docker Desktop direto (não precisa mais de WSL) e o Angular
  (`localhost:4200`).
- **Portas:** backend `127.0.0.1:8088`, MySQL `3306`, phpMyAdmin `8084`,
  app antigo (vanilla, ainda em paralelo) `8080`.
- **Conferir cálculos:** `AppTrena-Angular/verificacao/VERIFICAR.bat`
  compara o JS original com o TypeScript novo (Pagamentos, EAP, Mapa,
  Empreita, Resumos, validação de CPF/CNPJ).

## Pontos vivos / decisões pendentes

- **Feito (21-22/10/2026): filtro de status nas Obras, papel timbrado só nos modelos,
  centavos nos pagamentos de empreita e busca de etapa no pagamento.**
  1. **Lista de Obras**: caixas de seleção por status (padrão: só "Em andamento" e
     "A iniciar"; "Todos"/"Padrão" ao lado). Nenhuma marcada = lista vazia.
  2. **Papel timbrado** saiu de todos os PDFs fixos do sistema (`CabecalhoImpressao`:
     EAP, Mapa, Empreita, Medição, RDO, Cronograma, Relatórios). Só os documentos de
     Modelos de documentos (contrato, proposta, ficha) o usam (`ContratoImprimir`).
  3. **Centavos**: o banco guarda cada item e o total com 2 casas, arredondando cada um
     SOZINHO; pagamento de empreita (contrato × %) chegava com valores quebrados e a soma
     dos itens fechava diferente do total por mais de 1 centavo, bloqueando a confirmação.
     Corrigido na origem (`EmpreitaStore.montarPagamentoDoAvanco`: itens arredondados, sobra
     de centavos no maior item, total = valor real) e na gravação
     (`PagamentoController::arredondarCentavos`, vale para qualquer origem). Migration
     `corrige_centavos_de_pagamentos_pendentes` ajusta os PENDENTES antigos (confirmados
     não são tocados). Mapa e outras origens ganham a proteção do backend, mas o arredondamento
     na origem só foi feito na empreita.
  4. **Pagamento → etapa da EAP**: o `<select>` virou `app-autocomplete` (filtra por qualquer
     parte do código ou da descrição). O de **Recebimentos** ainda é o `<select>` antigo.
- **Feito (15/10/2026): lote de 11 pedidos — fuso horário, Relatórios, popups do
  dashboard, senha/recuperação, plano da plataforma, FVS como documento e
  landing.** Sem Docker/PHP nesta sessão: o backend foi escrito mas **não foi
  executado** (nenhum `php artisan`, nenhuma migration rodada); o frontend foi
  verificado com `ng build` e Playwright contra API simulada.
  1. **Fuso horário** (`core/utils/fuso.ts`): escolha da EMPRESA em
     Configurações → Dados da empresa (padrão São Paulo, GMT-3). `hojeIso()`,
     `formatarData*` e o calendário leem o fuso a cada chamada. Regra nova:
     nunca `new Date()` para "agora"/"hoje" nem `toISOString().slice(0,10)`;
     usar `hojeIso()`/`agoraDeParede()`. Backend: `empresas.fuso_horario` e
     `App\Support\Fuso` (data impressa em contrato, "vence hoje" de contrato de
     equipamento, lembretes da empreita). O banco continua em UTC de propósito.
  2. **Página Relatórios** (`/relatorios`, `RelatoriosGeral`): a lista do card
     virou o componente `ListaRelatorios` (`features/relatorios/lista-relatorios`),
     usado pelo card (primeiras obras em aberto) e pela página (TODAS as obras).
     "Ver todos" do card e o item do menu levam a ela.
  3. **Popups no dashboard**: Diárias (`EditarDiariaModal`, extraído da aba),
     Contratos de equipamentos (modal já existente) e Agenda
     (`EditarEventoModal`, extraído) abrem no próprio dashboard. Diária JÁ
     FECHADA em pagamento não edita (regra da aba): leva à lista da obra.
  4. **Login**: botão mostrar senha (`app-campo-senha`), "Esqueci minha senha"
     e `/redefinir-senha` (token de uso único, 60 min, e-mail). **O e-mail só
     sai com SMTP configurado** (`MAIL_MAILER=log` em produção hoje) — ver
     `docs/DEPLOY-LANDING-COMTRENA.md`. Cadastro público (`/cadastro`,
     `POST /registrar`) REMOVIDO.
  5. **Link do RDO não abria**: causa raiz = o link era montado com
     `window.location.origin + /publico/rdo/...`, sem o `/app/` onde o Angular
     vive em produção (`urlDoApp()`); o e-mail usa `config('app.frontend_url')`
     (padrão `APP_URL/app`). Na lista do RDO o link agora é clicável.
  6. **Painel de planos** (`/app/plataforma`, só o dono): tabela própria
     `admins_plataforma`, login + TOTP (6 dígitos), token só vale em
     `admin-plataforma/*`. Cria a conta principal, define plano/status/validade;
     `suspensa`/`cancelada` bloqueiam o login da empresa. Criação do admin:
     `php artisan plataforma:criar-admin`. A validade NÃO bloqueia sozinha.
  7. **FVS como documento**: novo tipo `fvs` em Modelos de documentos
     (variáveis `fvs_*` + `{{tabela_verificacao}}`); o checklist escolhe o
     documento (`fvs_modelos.contrato_modelo_id`); botão "Imprimir ficha (PDF)"
     no RDO (`GET fvs/{id}/pdf`). Na edição do modelo a tabela aparece como o
     marcador `{{tabela_verificacao}}`, não como tabela (diferente da proposta).
  8. **Landing** em `landing/` (HTML estático) + nginx/`/app/` em
     `docs/DEPLOY-LANDING-COMTRENA.md`. O e-mail de contato da landing
     é provisoriamente o do Lucas (eng.lucasaugusto.sa@gmail.com) — trocar depois.
- **REGRA (09/10/2026, decisão do Lucas): o app ComTrena NÃO PODE ser
  publicado na Play Store (nem na App Store) antes da migração do domínio
  para comtrena.com.br** — ou seja, enquanto o `apiUrl` de
  `frontend/src/environments/environment.mobile.ts` apontar para
  `trenadigital.com.br`. Motivo: cada versão instalada do app guarda o
  endereço da API com que foi gerada. O `appId` (`br.com.comtrena.app`)
  já está no formato definitivo — é o nome do app nas lojas e não pode
  mudar depois da primeira publicação. Mudar de domínio NÃO mexe no banco:
  é o mesmo servidor e os mesmos dados.

  **Migração do domínio — quem vai fazer é a Onilia.** Checklist levantado
  em 09/10/2026 lendo o código. No VPS o projeto fica em `~/docker-apptrena`
  (usuário root).
  0. ANTES DE TUDO, backup completo de produção (banco + `storage` com
     fotos/arquivos + `.env`), como no Passo 1 de
     `docs/migrar-vps-repositorio-unico.md`, e copiar o backup para fora
     do VPS. O sistema já controla uma obra real: a migração não move nem
     apaga dados (mesmo servidor, mesmo banco), mas mexe na produção.
  1. DNS no painel da Hostinger: `comtrena.com.br` e `www` → `187.77.59.52`
     (em 09/10 o domínio já é do Lucas, mas está "estacionado").
  2. nginx do VPS: incluir `comtrena.com.br www.comtrena.com.br` no
     `server_name` e gerar o certificado com o certbot (mesmo procedimento
     de `docs/DEPLOY-PRODUCAO.md`).
  3. `controleobra-api/.env` de produção (no fim, rodar
     `docker exec controleobra-phpfpm php artisan config:cache`):
     - `APP_URL` → `https://comtrena.com.br`. Ele também monta o link do
       e-mail "RDO disponível" para o contratante (`App\Mail\RdoDisponivel`).
     - `PDF_FRONTEND_URL` e `PDF_API_URL` → trocar o domínio
       (`config/pdf.php`). Se esquecer e o domínio antigo sair do ar, a
       geração de PDF para de funcionar.
     - `MAIL_*`: NADA a fazer. Conferido em produção em 09/10/2026:
       `MAIL_MAILER=log` e `MAIL_FROM_ADDRESS="hello@example.com"` — o
       sistema não envia e-mail nenhum (só grava no log). Consequência à
       parte: o aviso ao contratante quando um RDO é finalizado
       (`App\Mail\RdoDisponivel`) nunca saiu de verdade; só passa a sair
       quando alguém configurar um SMTP.
  4. Frontend: o rodapé de `features/medicoes/medicao-imprimir.html`
     ("Medição gerada automaticamente pelo ComTrena — trenadigital.com.br")
     → trocar para comtrena.com.br e publicar o build. NÃO trocar antes da
     migração (o PDF mandaria as pessoas para a página estacionada).
  5. App: trocar o `apiUrl` do `environment.mobile.ts` para
     `https://comtrena.com.br/api`, gerar e testar no celular.
  6. `trenadigital.com.br`: redirecionar para `comtrena.com.br` (mantendo o
     caminho) e avisar a equipe que o login precisa ser feito de novo uma
     vez no endereço novo (o navegador guarda a sessão por domínio). Como
     em 09/10 o sistema é usado só pela equipe interna (numa obra real), nenhum link real de
     RDO foi enviado (só testes) e o app ainda não foi publicado, NÃO é
     preciso manter o domínio antigo a longo prazo: deixar o
     redirecionamento até o vencimento atual e não renovar.

- **Feito (07/09/2026): cabeçalho da obra simplificado + cadastro/edição
  de obra unificados num popup só + "Local da obra" no cadastro + "Quem
  acessa esta obra" também na criação.** Lote de pedidos do Lucas nesta
  ordem:
  1. **"Local da obra" faltava no cadastro** — na real o campo já existia
     no formulário de "+ Nova obra" da Lista de Obras; o que faltava era
     em `ObraDetalhe` (cabeçalho da obra já aberta), que só tinha
     Nº/Cliente/Responsável/Data base/Período/Status/Observações. Virou
     moot com o item 2 abaixo (o campo já está no formulário unificado).
  2. **Cabeçalho da obra virou só nome + status + "Editar obra"**
     (`ObraDetalhe`/`obra-detalhe.html`) — antes era um formulário inteiro
     sempre visível/editável ali (Nº/Cliente/Local/Responsável/Data base/
     Período/Status/Observações), com "Quem acessa esta obra" e
     "Confirmar obra" soltos do lado. Clicar "Editar obra" abre o MESMO
     popup usado pra criar uma obra.
  3. **Novo componente compartilhado `CadastroObraModal`**
     (`features/obras/cadastro-obra-modal/`) — unifica o que antes eram
     dois formulários parecidos mas diferentes (o de "+ Nova obra" em
     `Obras`, só criação; e o cabeçalho sempre-editável de `ObraDetalhe`,
     só edição). `obra() === null` = criando, preenchido = editando
     (mesmo padrão `modoNovo` do `EditarPagamentoModal`). "Quem acessa
     esta obra" e "Confirmar obra"/"Reabrir obra" moraram pra dentro dele
     — o botão de acessos agora aparece TAMBÉM na criação (pedido do
     Lucas), coisa que não existia antes.
  4. **"Quem acessa esta obra" na criação — sem obra_id ainda**: a lista
     não vem mais de `listarAcessosObra(obraId)` (que exige a obra já
     existir) — nasce de `listarUsuarios()` (todo usuário `papel:
     secundario` da empresa, "vê"/"lança" `true` por padrão, mesmo
     default do backend) e fica pendente (`acessosPendentes`) até
     `Obras.salvarNovaObra()` criar a obra de verdade e só ENTÃO chamar
     `salvarAcessosObra(idNovo, lista)` — mesmo padrão "salva depois que
     existe um id de verdade" já usado pra arquivar nota fiscal lida na
     criação de um Pagamento (rodada anterior).
  5. **Novo componente compartilhado `GerenciarAcessosObra`**
     (`shared/gerenciar-acessos-obra/`) — só a tabela de checkboxes
     "vê"/"lança" por usuário, extraída de `ObraDetalhe` pra ser
     reaproveitada dentro do `CadastroObraModal` nos dois modos.
  6. **Cuidado replicado de propósito**: `CadastroObraModal`/`Obras`/
     `Pagamentos`/`RecebimentosStore` (aninham outro popup `position:
     fixed` por dentro) usam centralização por `display:flex`, NÃO
     `transform` — mesmo motivo do achado de 06/09 sobre o preview de
     anexo. `GerenciarAcessosObra` sozinho não aninha nada, então
     continua com `transform` normalmente.
  **Verificado via API** (empresa descartável): criar obra com
  `local_obra` preenchido, editar nome/local/status de uma obra
  existente, confirmar/reabrir — tudo persistindo certo. `tsc`/`ng build`
  limpos. **Sem verificação visual própria** — vale conferir na tela: o
  cabeçalho simplificado, o botão "Editar obra" abrindo o popup
  preenchido, e "Quem acessa esta obra" funcionando tanto ao criar uma
  obra nova quanto editando uma já existente.
- **Feito (06/09/2026): preview de anexo ficava pequeno dentro do popup
  de Pagamentos/Recebimentos — causa raiz era `transform`, não tamanho.**
  Alargar o CSS do `PreviewModal` (rodada anterior) não resolveu quando
  ele abre de DENTRO de outro popup (popup de anexos da Lista de
  Pagamentos, modal de editar Pagamento, modal de Recebimentos — os 3
  aninham `AnexosLancamento`, que pode abrir `PreviewModal` por dentro):
  **um `transform` em qualquer elemento vira o "containing block" dos
  filhos `position: fixed`** — como os 3 `.modal-cartao` desses popups
  usavam `transform: translate(-50%,-50%)` pra centralizar, o `.modal`
  `position: fixed` do preview (aninhado lá dentro) ficava preso ao
  tamanho do CARTÃO pequeno do popup pai, não ao viewport, não importa o
  `width`/`height` declarados na folha de estilo do próprio preview.
  Corrigido nos 3 arquivos (`pagamentos.scss`, `editar-pagamento-
  modal.scss`, `recebimentos.scss`): centralização trocada de
  `position:absolute + transform` pra `display:flex` no `.modal`
  (mesmo efeito visual, sem criar containing block pros filhos fixed).
  **Vale lembrar se aparecer de novo**: qualquer modal futuro que precise
  abrir OUTRO modal `position: fixed` por dentro dele precisa da mesma
  centralização por flexbox — o padrão `transform` (usado em ~20 outros
  modais do sistema que NÃO aninham nada por dentro) continua seguro
  nesses outros casos, só quebra quando há aninhamento de verdade.
  `ng build` limpo.
- **Feito (06/09/2026): sequencial dos anexos com 3 algarismos; achado
  (não é bug) sobre renomeio parar de funcionar depois de excluir a
  tag.** O Lucas testou o item anterior e reportou "excluí o NF 1, o NF
  2 não foi renomeado". Investigado com os logs reais do nginx
  (`nginx/logs/access.log`) cruzados com o banco: ele tinha excluído a
  própria tag "NF" ENQUANTO os 2 anexos ainda existiam (decisão dele,
  confirmada antes: "excluir tag não apaga nada, só desvincula") — isso
  zera o `tag_id` dos arquivos que usavam ela. Sem `tag_id`, o
  `AnexoNomeador::aposExcluir` não tem mais um nome de tag pra usar na
  sequência, então corretamente não mexe em nada — comportamento
  consistente com a regra já combinada, não uma falha na lógica de
  renomeio (reconfirmado com um teste novo: tag viva, excluir o
  primeiro de 2 anexos → o segundo é renomeado certinho). Registrado
  aqui caso o Lucas ache estranho de novo — a melhoria possível seria
  renumerar mesmo um anexo "solto" usando o nome de tag já gravado no
  próprio nome do arquivo (sem precisar de uma `Tag` viva), mas isso não
  foi pedido, só ficou anotado como ideia.
  **Feito de verdade**: `AnexoNomeador::nome()` agora preenche o
  sequencial com zero à esquerda até 3 dígitos (`NF 001`, `NF 002`... em
  vez de `NF 1`, `NF 2`) — só vale pra nomes gerados DAQUI PRA FRENTE
  (criar/renomear/renumerar), não recalcula retroativamente nomes já
  existentes, mesmo padrão já usado pra renome de tag. Verificado via
  API.
- **Feito (06/09/2026): coluna "Anexos" na Lista de Pagamentos + popup
  agrupado por tag + preview + renomeio automático.** Extensão do
  recurso de Tags/anexos da mesma data (item logo abaixo) — implementado
  direto (sem `EnterPlanMode`, pedido já vinha sem ambiguidade real):
  - **Nova coluna "Anexos"** na Lista de Pagamentos (`pagamentos.html`),
    mostrando `anexosCount` (contagem vinda pronta do backend via
    `Pagamento::anexos()` + `withCount`/`loadCount`, sem 1 query por
    linha) — clicar no número abre um popup novo reaproveitando o MESMO
    `AnexosLancamento` já usado dentro do modal de edição.
  - **`AnexosLancamento` ganhou**: lista agrupada por tag
    (`anexosAgrupados`, com um bucket "Sem tag" defensivo pra anexo cuja
    tag foi excluída); clicar num anexo abre `PreviewModal` (mesmo
    componente já usado na aba Arquivos comum — imagem/vídeo/áudio/PDF
    inline, resto só "baixe pra abrir"); excluir agora **recarrega a
    lista inteira** em vez de só remover localmente (o backend renomeia
    os que sobraram) e, ao terminar, mostra o aviso combinado com o
    Lucas: *"O anexo foi excluído com sucesso, os anexos restantes foram
    renomeados."*
  - **Backend — `AnexoNomeador`** (novo serviço,
    `App\Services\AnexoNomeador`): centraliza a fórmula do nome (mesma
    usada por `AnexoController::criar`, sem duplicar) e dois gatilhos de
    renomeio automático — `aposExcluir()` (fecha o buraco na sequência
    da mesma tag+lançamento, chamado por `ArquivoController::destroy`
    sempre que o arquivo apagado era um anexo, não importa se a exclusão
    veio da tela de Pagamentos ou da aba Arquivos comum) e
    `aposMudarNumero()` (renomeia TODOS os anexos de um lançamento,
    qualquer tag, quando `numero_pagamento`/`numero_recebimento` muda —
    ligado tanto em `PagamentoController` quanto `RecebimentoController`,
    pedido do Lucas: "trocar a numeração dele renomeia todos os anexos").
  - **"Ler nota" ganhou tag opcional**: no bloco "Preencher pela foto da
    nota" (`EditarPagamentoModal`), um `<select>` de tag ao lado do
    arquivo — se escolhida, a MESMA foto lida também é arquivada como
    anexo. Editando um pagamento já salvo, arquiva na hora; CRIANDO um
    pagamento novo, fica pendente (`anexoNotaPendente`) até
    `Pagamentos.salvarModal` conseguir um id de verdade (a
    `PagamentosStore.inserirOuAtualizar` ganhou um `onSucesso?` opcional,
    mesmo padrão já usado em `EmpreitaStore.fecharPeriodo`, só pra isso).
  **Verificado via API** (empresa descartável): contagem aparecendo
  certa na criação e depois de anexar; excluir o anexo do MEIO de 3
  fechou a sequência (1,2,3 → exclui o 2 → sobra 1,2); trocar o número
  do pagamento renomeou os 2 anexos restantes; `preview-url` funcionando
  igual pra anexo; listagem já vem com o objeto `tag` aninhado
  (`with('tag')`), sem precisar cruzar com `listarTags()` só pro nome.
  `tsc`/`ng build` limpos. **Sem verificação visual própria** — pedir
  pro Lucas conferir na tela: a coluna/popup agrupado, o preview ao
  clicar num anexo, a mensagem de exclusão, e ler uma nota com tag
  escolhida tanto editando quanto criando um pagamento novo.
- **Feito (06/09/2026): popup de pagamento no Mapa + Tags/anexos de nota
  fiscal em Pagamentos/Recebimentos.** Dois pedidos do Lucas, planejados
  juntos (`EnterPlanMode`, 3 agentes Explore em paralelo) por causa da
  extração de componente que os dois precisavam — plano salvo em
  `C:\Users\Lucas\.claude\plans\crispy-nibbling-allen.md`. 6 fases, cada
  uma testada via API numa empresa descartável antes da próxima:
  1. **Bug do Mapa corrigido**: clicar em "Ver" num pagamento do popup de
     pagamentos vinculados (`mapas-obra.html`) só fechava o popup e
     navegava pra lista geral de Pagamentos, ignorando qual linha foi
     clicada. Corrigido extraindo o modal de edição de `pagamentos.ts`/
     `.html` pro componente novo `EditarPagamentoModal`
     (`features/pagamentos/editar-pagamento-modal/`) — "burro" de
     propósito (sem `PagamentosStore`, que é obra-scoped e só existe
     dentro da tela de Pagamentos): recebe o `Pagamento` pronto,
     `linkedSignal` copia pra um rascunho local editável (`signal` direto
     não funciona pra copiar um `input.required()` — Angular só garante
     o valor do input DEPOIS da construção da instância, erro `NG8118`),
     emite `salvar`/`fechar` pro pai decidir como persistir. `Pagamentos`
     usa o componente sem mudar comportamento nenhum; `MapasObra` agora
     abre o MESMO modal com o pagamento certo, salvando via
     `ApiService.atualizarPagamento` direto (mesma função pura
     `paraPayloadApi` que o store usa) — sem precisar duplicar o store.
  2. **Modelo de dados**: 3 migrations — `tags` (nova, `empresa_id`+
     `nome` único, `ativo`), `pastas.tag_id` (FK `nullOnDelete()`, unique
     `(obra_id, tag_id)` — localiza a pasta da tag por FK, não por nome,
     pra nunca duplicar nem perder o vínculo ao renomear) e
     `arquivos.tag_id`/`origem_tipo`/`origem_id` (um "anexo" é só um
     `Arquivo` normal com esses 3 campos preenchidos).
  3. **Backend — `TagController`** (novo): criar uma tag cria a pasta
     correspondente em "Arquivos compartilhados" de TODA obra da empresa
     (`App\Services\PastaRaizes`, extraído de `PastaController::raizes()`
     pra reaproveitar); renomear a tag renomeia a pasta em todas as obras
     de uma vez (via `tag_id`, não por nome); excluir a tag NÃO apaga
     nada (decisão do Lucas) — as FKs `nullOnDelete()` só desvinculam.
     `ObraController::store` ganhou o hook inverso: obra nova também
     ganha pasta de toda tag já ativa. `PastaController::update`/
     `destroy` ganharam trava (403) contra renomear/excluir uma pasta de
     tag pela aba Arquivos comum — só pode mexer nela via Configurações.
  4. **Backend — `AnexoController`** (novo): `POST/GET
     pagamentos/{pagamento}/anexos` e `recebimentos/{recebimento}/anexos`
     — nome do arquivo gerado automaticamente
     `{Tag} {sequencial} - {Obra} - {Nº do lançamento}.{extensão}`
     (sequencial por par tag+lançamento, reinicia a cada lançamento
     diferente). Download/preview/exclusão de um anexo NÃO precisam de
     rota nova — são as mesmas `arquivos/{arquivo}/...` de sempre, porque
     um anexo é só um `Arquivo` normal. `EXTENSOES_PERMITIDAS`/
     `CATEGORIA_POR_EXTENSAO` extraídas de `ArquivoController` pro trait
     `Concerns/ClassificaArquivo`, reaproveitado pelos dois controllers.
  5. **Frontend — aba "Tags" em Configurações** (`configuracoes/tags/`):
     lista simples (nome + toggle ativo + excluir), criar/renomear via
     `window.prompt` (mesmo padrão já usado pra renomear arquivo/pasta em
     `arquivos.ts` — só 1 campo, não precisa de modal-dentro-do-modal).
  6. **Frontend — `AnexosLancamento`** (`shared/anexos-lancamento/`):
     componente compartilhado (lista de anexos + seletor de tag + input
     de arquivo), embutido tanto em `EditarPagamentoModal` (Pagamentos E
     o popup do Mapa ganham "Anexar arquivo" de graça, por reaproveitar o
     mesmo componente) quanto no modal já existente de Recebimentos. Só
     aparece depois que o lançamento já foi salvo (`!modoNovo()`/
     `editando()` — precisa do número do lançamento pra montar o nome do
     arquivo, que só existe depois de salvar).
  **Verificado ponta a ponta via API** (empresa descartável, limpa
  depois): tag criada em 2 obras + pasta renomeada em ambas ao renomear
  a tag + obra criada DEPOIS da tag já existir também ganha a pasta +
  trava 403 confirmada ao tentar renomear/excluir a pasta de tag pela
  aba Arquivos + tag excluída mantém pasta/arquivos intactos + 2 anexos
  no mesmo pagamento geraram `Nota Fiscal 1 - Obra - PG-0056.pdf`/
  `Nota Fiscal 2 - Obra - PG-0056.jpeg` exatamente como pedido +
  sequencial reiniciou em 1 num segundo pagamento + download/exclusão
  via as rotas de `Arquivo` já existentes funcionaram sem mudança
  nenhuma. `tsc`/`ng build` limpos em cada fase. **Sem verificação visual
  própria** (não tenho navegador aqui) — pedir pro Lucas confirmar na
  tela: editar um pagamento (deve continuar igual), abrir um pagamento
  pelo popup do Mapa (deve abrir o lançamento, não navegar), e o fluxo
  completo de criar tag → anexar 2 notas fiscais → conferir na aba
  Arquivos da obra.
- **Feito (06/09/2026): coluna "Saldo" na Lista de Empreitas.** Pedido
  simples do Lucas ("adicione o saldo da empreita tbm") — nova coluna
  `valor` entre "Pago" e "% Medição", com a MESMA definição de "Saldo
  empreita" já usada em "Pagamentos registrados" (confirmada com o
  Lucas em 24/08/2026): Contrato Total da empreita menos a soma paga
  (Empreiteiro+Reserva), contando pendente e confirmado igual — um
  pagamento pendente já é dinheiro comprometido, mesmo antes de
  confirmado (`saldo()` em `empreitas-obra.ts` = `total - totalPago -
  pendentePorEmpreita`). Ordenável (nova entrada `saldo` em
  `ColunaEmpreitaObra`), participa do modo "Detalhar" (Empreiteiro/
  Reserva separados — novo computed `pendenteDetalhadoPorEmpreita`,
  mesmo padrão de `pagoDetalhadoPorEmpreita`) e fica colorido (verde/
  vermelho) conforme o sinal, mesmo par de classes `.saldo-positivo`/
  `.saldo-negativo` já usado em outras telas. `tsc`/`ng build` limpos,
  dev server reiniciado.
- **Feito (03/09/2026): "Realizar medição"/"Realizar pagamento" agora
  persiste, e "Pagamentos registrados" ganhou largura fixa.** 2 pedidos
  do Lucas depois da rodada de correções acima:
  1. **Persistência do par de botões** — o que antes era um sinal só de
     tela (`signal` local, se perdia ao recarregar) virou um campo
     de verdade: `medicao_habilitada` (migration nova em `empreitas`,
     default `true`) — `CabecalhoEmpreita.medicaoHabilitada`,
     `EmpreitaStore.medicaoHabilitada`/`definirMedicaoHabilitada()`.
     Clicar "Realizar medição" grava `false`; "Realizar pagamento"
     terminar com sucesso grava `true` de volta (`EmpreitaStore.
     fecharPeriodo()` ganhou um parâmetro `onSucesso?: () => void`,
     chamado só quando o período REALMENTE avança, nunca em erro).
     Reabrir a empreita também reseta pra `true` (mesmo padrão de
     `pagamentoIniciado`). Testado via API numa empresa descartável —
     grava, sobrevive a um GET novo, e reseta ao reabrir.
  2. **"Pagamentos registrados" com largura fixa** — essa tabela nunca
     teve `trenaRedimensionarColunas` (conferido no histórico do git);
     o problema era só `width: 100%` dentro da coluna `1fr` de
     `.grade-inferior` (que ficou bem larga depois que "Contrato x
     orçado" foi removido de do lado dela), esticando a tabela por
     nada. Trocado por um `<colgroup>` com largura fixa por tipo de
     dado (Nº 100px, datas 90px cada, Medição% 130px, Valor pago
     240px — o mais largo, por causa dos pares "Rótulo: R$ 000.000,00"
     empilhados) + `table-layout: fixed` + `margin-left: auto` (sem
     `width: 100%` a tabela agora tem largura própria e encosta na
     borda direita, em vez de esticar).
  **Feito (03/09/2026): corrigida a causa raiz do redimensionamento
  inconsistente** (`RedimensionarColunas`, `shared/
  redimensionar-colunas/`) — pedido maior que tinha ficado em aberto
  nesta mesma rodada por falta de como testar visualmente. O Lucas
  ativou o "Claude Chrome" (extensão separada, outra sessão de Claude
  com navegador de verdade) e rodou um teste sistemático (arrastar
  ~50 colunas em 5 telas — EAP, Mapa, Empreita, Pagamentos, Cronograma
  de desembolso — expandindo e depois tentando encolher de volta),
  confirmando com números concretos a hipótese registrada abaixo: TODA
  coluna testada travava exatamente na largura que tinha ao carregar a
  tabela, mesmo depois de expandida (ex.: a ETAPA do Mapa nascia
  travada em 140px, cortando "1.1 - ART'S (ANOTAÇÃO)" pra "1.1 - ART'S
  (ANOTA" mesmo no PRÓPRIO carregamento). Com essa confirmação, corrigi
  a diretiva: `criarColgroup()` media a largura mínima direto no DOM
  (`celula.getBoundingClientRect()`), que reflete só o espaço que
  sobrava naquele carregamento (podia ser menor que o texto precisava);
  trocado por um método novo `medirLarguraNatural()` que clona a célula
  pra fora da tabela (`position: absolute; visibility: hidden`, nunca
  chega a ser pintado) com `white-space: nowrap` e largura livre — o
  navegador dá a largura real que o conteúdo pede, não a que sobrava.
  Campos de formulário dentro da célula (`<input>`/`<select>`, como os
  de Tipo/Etapa na Empreita) têm `width: 100%` por padrão global
  (`_base.scss`), que não faz sentido dentro de um clone sem tabela ao
  redor — o método solta esses campos pra `width: auto` só dentro do
  clone, senão a medição desses casos ficaria pior, não melhor.
  `tsc`/`ng build` limpos, dev server reiniciado e respondendo — mas
  **sem verificação visual própria** (não tenho navegador aqui): pedi
  ao Lucas pra repetir o mesmo teste do Claude Chrome (arrastar as
  mesmas colunas nas mesmas 5 telas) pra confirmar que agora abre no
  tamanho certo e que encolher não trava mais cedo do que devia.
  Limitação conhecida, não corrigida agora: a diretiva mede só a
  PRIMEIRA linha do `<tbody>`; se uma linha mais abaixo tiver texto bem
  mais longo que a primeira, ainda pode truncar — não apareceu nos
  testes do Claude Chrome, mas fica registrado.
- **Feito (04/09/2026): corrigido um SEGUNDO bug, mais grave, no
  redimensionamento de colunas — largura vazando pra coluna errada
  quando o CONJUNTO de colunas muda.** O Lucas pediu um novo teste ao
  Claude Chrome depois da correção acima, e ele achou algo bem pior que
  o "mínimo travado": a diretiva guardava a largura de cada coluna num
  array POSICIONAL (`largura[0]`, `largura[1]`...), não por identidade.
  Enquanto o conjunto de colunas não muda isso não dá problema, mas
  toda vez que uma coluna aparece/some/muda de ordem (ex.: EAP
  confirmada→"Reabrir EAP", que troca de 13 pra 15 colunas; Mapa ao
  adicionar um fornecedor; Pagamentos ao marcar/desmarcar "Mostrar
  etapas"), o array não é remapeado — a largura que era de uma coluna
  passa a ser aplicada, por acidente, na coluna que ficou na MESMA
  posição numérica. Caso mais grave confirmado: na EAP, "Reabrir EAP"
  jogava a largura de DESCRIÇÃO (209px) no código curto da coluna EAP
  (que sobrava enorme e vazia), e a largura de QTDE (28px) ia pra
  DESCRIÇÃO — cada LETRA do texto quebrando numa linha própria,
  totalmente ilegível. Confirmado com números exatos em 3 telas (EAP,
  Mapa, Pagamentos).
  Corrigido trocando o array posicional por uma **chave estável por
  coluna**: `RedimensionarColunas` agora resolve o cabeçalho-folha de
  cada coluna (método novo `resolverCelulasLideres`, extraído do que já
  existia em `pendurarAlcas`) e usa o TEXTO desse cabeçalho como chave
  (`gerarChavesColunas` — cabeçalhos vazios como o de checkbox caem num
  fallback posicional `#0`/`#1`; cabeçalhos repetidos na mesma tabela
  ganham sufixo `::2`/`::3` pra nunca colidir). `criarColgroup` guarda e
  recupera a largura de cada coluna por essa chave, não mais por
  índice — então quando o conjunto de colunas muda, cada coluna que
  continua existindo (mesmo texto de cabeçalho) mantém a largura que já
  tinha, e só colunas de fato NOVAS ganham uma medição do zero (via
  `medirLarguraNatural`, da correção anterior). `tsc`/`ng build`
  limpos, dev server reiniciado. De novo sem verificação visual própria
  — pedi pro Lucas rodar os mesmos 3 casos que o Claude Chrome
  encontrou (EAP reabrir, Mapa adicionar fornecedor, Pagamentos
  marcar/desmarcar "Mostrar etapas") pra confirmar que a largura de
  cada coluna agora segue ela mesma, não a posição.
  Limitação conhecida, não coberta por este fix: a chave por texto de
  cabeçalho só é RECALCULADA quando o NÚMERO de colunas muda (é o que
  dispara o `MutationObserver`) — uma reordenação de colunas que
  mantém a mesma quantidade (sem inserir/remover nenhuma) não dispara
  o remapeamento; não apareceu em nenhum caso relatado até agora, mas
  fica registrado caso surja.
- **Feito (03/09/2026): correções no lote de 17 pedidos, depois que o
  Lucas testou de verdade.** 5 ajustes no que tinha acabado de ser
  entregue:
  1. **Bug real**: o input de "Qtde. contrat." dentro do bloco
     "Quantidades" (visível antes de "Realizar medição") não tinha
     `[disabled]` nenhum — travava no STORE (a gravação era rejeitada
     silenciosamente), mas a tela deixava digitar. Corrigido.
  2. A tabela "Contrato x orçado" tinha sido removida, mas
     "Pagamentos registrados" continuava fixado explicitamente na
     célula onde sempre ficou (`grid-column: 2; grid-row: 2`), deixando
     um buraco em branco no lugar da tabela removida. Removida a
     posição fixa — com só 2 painéis agora, o auto-placement da grade já
     bota "Pagamentos registrados" do lado de "Medição deste período".
  3. **Bug real**: o botão que fecha o período (então "Fechar período")
     só habilitava com `totais().totalPeriodo > 0` — uma fórmula que só
     considera o AVANÇO medido, ignorando um valor lançado manualmente
     no rascunho de Pagamento sem nenhuma medição. Trocado pra
     `totaisEstendidos().pagamentoDraftTotal`, que já é exatamente o
     "Valor a ser pago" mostrado na tela (leva em conta sobrescritas
     manuais) — confirmado com um script que o bug era real (fórmula
     antiga dava 0, a nova dava o valor certo).
  4. Renomeado: o botão que revela Medição/Já pago/Pagamento/Saldo
     (antes "Realizar pagamento") virou **"Realizar medição"**; o que
     fecha o período e gera o pagamento (antes "Fechar período") virou
     **"Realizar pagamento"**.
  5. Os dois botões agora se alternam a cada clique — clicar em um
     desabilita ele e habilita o outro, começando com "Realizar medição"
     habilitado. **Importante**: esse par de habilitado/desabilitado é
     um sinal NOVO, só de tela (`podeRealizarMedicao` em `empreita.ts`),
     separado de `pagamentoIniciado` (que continua controlando pra
     sempre se a tabela mostra Quantidades ou Medição/Pagamento — isso
     não muda, uma vez revelada continua revelada). Decisão minha: esse
     par não é salvo no banco — recarregar a página sempre volta pro
     estado padrão ("Realizar medição" habilitado), mesmo se a empreita
     já estiver no meio de um ciclo. Avisar se precisar que isso
     persista entre sessões (exigiria mais um campo no banco).
- **Feito (03/09/2026): lote de 17 pedidos — Lista de Empreitas, EAP
  "Adicionais" e redesign da Empreita.** Planejado com `EnterPlanMode`
  (3 agentes Explore em paralelo pesquisando Lista de Empreitas/EAP/
  Empreita antes de implementar) — plano salvo em
  `C:\Users\Lucas\.claude\plans\crispy-nibbling-allen.md`. 5 fases,
  cada uma verificada (tsc/build, e as de backend também testadas
  ponta a ponta numa empresa descartável) antes da próxima:
  - **Fase A — Lista de Empreitas** (`empreitas-obra.ts`/`.html`):
    trocou Descrição↔Empreiteiro de posição; "% Medida" (só texto) virou
    2 barras duplas empilhadas — "Físico" (medição física, mesma lógica
    visual acumulado/avanço da Medição de obra) e "Financeiro" (% do
    Contrato já pago vs. solicitado-mas-não-pago, verde/laranja);
    "Última solicitação" virou 2 colunas ("Valor da última solicitação"/
    "Data da última solicitação", do MESMO pagamento); checkbox
    "Detalhar" no cabeçalho da lista empilha Empreiteiro/Reserva nas
    colunas Total/Pago/Valor-última-solicitação e também no popup de
    pagamentos da empreita.
  - **Fase B — EAP "Adicionais"**: nova coluna checkbox entre "Nível" e
    "EAP" — marcar um item propaga em cascata pra TODOS os descendentes
    em qualquer profundidade (`EapStore.alternarAdicional`, usando
    `ehDescendente` já existente), sem afetar irmãos/outros ramos.
    Migration nova em `eap_itens` (`adicional` boolean). Verificado com
    script à parte simulando vários níveis.
  - **Fase C — Empreita: criação/cabeçalho/travas**: numeração
    `OBR-{map_number}-EMP-{sequencial por obra}` gerada no BACKEND
    (`EmpreitaController::syncCompleto`) na criação, campo travado pra
    sempre na tela (não edita nem no update, mesmo tentando via API
    direto — testado); "Nº da obra" idem, sempre = `Obra.map_number`;
    Empreiteiro virou `<select>` só com ativos do cadastro (era texto
    livre); "Data" nasce com hoje, mas continua editável depois; a
    confirmação agora TRAVA o cabeçalho inteiro (Descrição/Empreiteiro/
    Data) e a edição de serviços (desc/tipo/etapa, além de
    Contrato/Quantidade que já travavam) — antes desc/tipo/etapa
    ficavam editáveis mesmo confirmada, mesmo devendo travar; valores de
    Já pago/Pagamento/Saldo após pagamento agora sempre formatam (mesmo
    R$0,00) em vez de sumir quando não há medição; removida a tabela
    "Contrato x orçado" da tela.
  - **Fase D — "Realizar pagamento"** (a maior peça): separa "confirmar"
    (trava cabeçalho/contrato) de "liberar Medição/Já pago/Pagamento/
    Saldo após pagamento", que agora é um passo À PARTE — um botão
    "Realizar pagamento" dentro de "Pagamentos registrados", que só
    aparece confirmada e ainda não iniciada. Novo campo persistido
    `pagamentoIniciado`/`pagamentoIniciadoAt` (migration em `empreitas`,
    mesmo padrão de `isConfirmed`/`confirmedAt`) — reabrir a empreita
    também reseta esse campo (volta ao estado inicial completo).
    "Pagamentos registrados" passa a guardar um RETRATO da medição da
    empreita inteira no momento da geração (`medicao_snapshot`, JSON
    novo em `pagamentos`, só populado pra origem Empreita) — inclui o
    Contrato total DAQUELE momento (pode ter mudado desde então) e
    `medicaoAcum`/`medicaoAtual`/`contratoEmp`/`contratoReserva` por
    serviço. A tabela ganhou coluna "Medição %" (mesma barra dupla) e
    corrigiu a coluna "Contrato" (antes sempre mostrava o total ATUAL
    pra qualquer linha histórica — agora mostra o valor de então); clicar
    numa linha com snapshot abre popup com o retrato completo dos
    serviços. Verificado via API numa empresa descartável (round-trip do
    JSON do snapshot, toggle de `pagamento_iniciado`). "Medição deste
    período" ganhou uma 4ª linha "% avanço" (ponderado por `contratoEmp`,
    mesma fórmula do "Físico").
  - **Fase E — mensagem da Empreita**: a lista de serviços da mensagem
    de "Copiar solicitação" (feita numa rodada anterior) agora separa
    "SERVIÇOS PREVISTOS NA EAP" (`adicional === false`) de "SERVIÇOS NÃO
    PREVISTOS NA EAP" (`adicional === true`, e qualquer serviço sem
    etapa vinculada) — previstos sempre primeiro, cada seção só aparece
    se tiver ao menos 1 bullet.
- **Feito (02/09/2026): ajustes finos de Mapa + seleção múltipla pra
  WhatsApp.** Pedido de 4 partes, na sequência do lote de 11 itens acima:
  (1) exportação Excel do Mapa — Frete, Desconto e Markup agora aparecem
  como se fossem itens na aba "Itens" (Frete/Desconto pelo valor REAL, já
  com o markup do fornecedor embutido, pra fechar com o total da nota;
  Markup só como percentual, já que o valor dos itens já reflete ele); aba
  nova "Rateio por etapa" (mantendo "Resumo por fornecedor" como já
  estava). (2) O total da lista de Mapas — a fórmula já tinha sido
  corrigida na rodada anterior (confirmado de novo, bate com a soma real);
  o valor errado que o Lucas ainda via em produção é porque `total_mapa`
  só é recalculado quando o mapa é salvo — mapas antigos ficaram com o
  valor velho gravado. Corrigido com um "autocorreção ao abrir": toda vez
  que um mapa é carregado, o sistema recalcula e resalva sozinho se o
  valor gravado divergir do calculado (`MapaStore.carregarSeDivergente`)
  — **cada mapa afetado só corrige na lista depois de ser aberto uma vez**
  (não há acesso ao banco de produção pra corrigir em lote). (3) Precisão
  de 6 casas decimais no Mapa — a causa raiz era a coluna
  `mapa_item_precos.valor_unitario`, que era `decimal(14,2)` e truncava
  qualquer conta mais precisa antes mesmo de chegar no frontend (o cálculo
  em si já estava certo); migration nova ampliou pra `decimal(14,6)`, e o
  input de preço unitário no Mapa agora mostra 2 casas normalmente mas
  revela a precisão completa enquanto o usuário está editando aquela
  célula (foco/blur). (4) Seleção múltipla por checkbox nas listas de
  Mapas, Empreitas, Pagamentos (obra e geral) e Recebimentos (obra e
  geral), com botão "Copiar mensagem" que monta um texto e copia pra área
  de transferência (`SelecaoMultipla<T>` + `copiarParaAreaDeTransferencia`
  novos em `shared/selecao-lista/`) — **o texto da mensagem hoje é um
  placeholder meu** (uma linha por item + total), porque o Lucas disse que
  tem um padrão próprio de mensagem e vai mandar depois; quando mandar,
  é só trocar o corpo de `copiarMensagem()` em cada uma das 6 telas, a
  infraestrutura de seleção não muda.
- **Feito (02-03/09/2026): "Copiar mensagem" de solicitação de pagamento
  de Empreitas, no formato real que o Lucas usa.** Passou por 3 versões
  até ficar como ele queria: a 1ª (mandou a fórmula do Google Planilhas
  que usa pra isso) gerava um bloco por SERVIÇO selecionado dentro de uma
  empreita — o Lucas mandou exemplos reais de mensagens dele e avisou que
  "não ficou legal"; a 2ª corrigiu o formato do bloco (ficou fiel aos
  exemplos) mas ainda vivia dentro da tela de CADA empreita; a 3ª (a que
  ficou) moveu tudo pra **lista de Empreitas** (`empreitas-obra.ts`/
  `.html`), por pedido explícito dele — "quero que aconteça de fato
  apenas na lista de empreita" — porque os exemplos mostravam 3
  solicitações simultâneas pra 3 EMPREITEIROS DIFERENTES (3 empreitas
  diferentes), coisa que a versão "dentro de uma empreita" não conseguia
  fazer de jeito nenhum. A versão anterior (dentro da empreita) foi
  removida por completo — `empreita.ts`/`.html` voltaram exatamente ao
  que eram antes desse recurso.
  Como funciona agora: seleciona várias empreitas na lista (checkbox por
  linha, já existia da rodada anterior) e clica em "Copiar solicitação"
  — pra cada empreita selecionada, busca o detalhe cheio
  (`GET /empreitas/{id}`, tem o id de cada serviço que o resumo leve da
  lista não tem) e roda a MESMA engine de cálculo da tela da empreita
  (`calcularOrcadoDaEap`/`calcularJaPagoPorLinha`/
  `calcularLinhaEmpreitaEstendida`, reaproveitadas puras — nada
  duplicado); cada empreita vira um bloco de solicitação, todos juntos
  numa mensagem separados por travessão — bate com o exemplo de 3
  solicitações simultâneas. Segundo botão "Copiar resumo" gera a segunda
  mensagem (beneficiado + valor + PIX por empreita, formatado com crase).
  Confirmado com o Lucas: "VALOR JÁ PAGO"/"VALOR A SER PAGO" somam
  Empreiteiro + Reserva; a Chave PIX é escolhida na hora (por empreita,
  já que cada uma pode ter um empreiteiro diferente) quando ele tem mais
  de uma cadastrada — lido do cadastro de Empreiteiros, ainda na ponte
  chave-valor (`CHAVE_EMPREITEIROS`/`normalizarEmpreiteiro`, exportados
  de `empreiteiros.ts`).
  **Dois ajustes feitos depois do Lucas testar de verdade (03/09/2026):**
  (1) "quero que apareça tudo" — os bullets de "SERVIÇOS PREVISTOS NA
  EAP" agora mostram TODOS os serviços contratados da empreita, não só
  os com algo pendente pra pagar neste período (só o Orçado/Empreita/Já
  pago somam todos; o A pagar continua vindo só do que está pendente).
  (2) **Bug real do fluxo dele**: "VALOR A SER PAGO" vinha do rascunho
  AO VIVO da empreita (`pagamentoDraftTotal`), mas `EmpreitaStore.
  fecharPeriodo()` ZERA esse rascunho assim que cria o pagamento
  pendente (o rascunho passa a representar o PRÓXIMO período, ainda sem
  medição) — na prática, ler dali sempre dava "Nenhuma das empreitas
  selecionadas tem valor a pagar" bem no momento em que o fluxo real do
  Lucas mais precisa gerar a mensagem (medir → Fechar período → gerar
  mensagem → mandar pro cliente → aguardar → confirmar o pagamento à
  mão). Corrigido: "VALOR A SER PAGO"/"SALDO APÓS PAGAMENTO" agora vêm
  da SOMA DOS PAGAMENTOS PENDENTES já gerados por "Fechar período"
  (`status: 'pendente'`, ainda não confirmados) — uma empreita sem
  nenhum pagamento pendente fica de fora da mensagem (nada a cobrar
  agora); "VALOR JÁ PAGO"/"PAGAMENTOS PARCIAIS" continuam vindo só dos
  CONFIRMADOS, então os dois números nunca se sobrepõem. Verificado com
  2 scripts à parte (deletados depois): um reproduzindo o exemplo do
  Wandeson (Orçado 15.000, Empreita 13.000, Já pago 8.500, A pagar 2.500,
  Saldo 2.000 — todos batem) e outro reproduzindo o bug relatado
  (confirmando `pagamentoDraftTotal = 0` logo após fechar período, e a
  soma do pendente = 2.500 pela lógica corrigida).
  **Ignorado por pedido do Lucas (03/09/2026):** a fórmula diferente de
  empreita "Administração" (Valor gasto na obra × percentual, em vez de
  Orçado/Contrato normais) — ele mesmo ajusta essa parte manualmente na
  mensagem antes de mandar no WhatsApp, já que só acontece numa empreita
  por obra. Toda empreita usa a mesma fórmula (Orçado/Contrato) por
  enquanto.
  **Mais 3 ajustes (03/09/2026, depois de testar de novo):** (1) o
  cabeçalho `*RESUMO DE PAGAMENTOS*` tinha ficado de fora da "segunda
  mensagem" quando o recurso migrou pra lista — devolvido, com uma linha
  em branco antes do 1º pagamento. (2) Cada ETAPA da EAP agora aparece
  **uma única vez** nos bullets de "SERVIÇOS PREVISTOS NA EAP", mesmo
  quando a empreita tem mais de um serviço na mesma etapa em categorias
  diferentes (ex.: um serviço de Material e outro de Mão de obra, ambos
  na etapa 19) — antes cada SERVIÇO virava um bullet, duplicando a etapa.
  (3) Cada bullet ganhou as categorias de custo presentes naquela etapa,
  abreviadas (MAT/MO/EQUIP/OUTR/ADM), com o valor sendo a soma do orçado
  só dessas categorias — contada uma vez por categoria mesmo que dois
  serviços apontem pra etapa+categoria iguais (é o orçado de referência
  da própria EAP, não some por serviço). Formato final do bullet:
  `{código EAP} - {ETAPA} (ABREV, ABREV) - R$ {soma}`, ENTRE CRASES
  (esqueceu delas no exemplo anterior, corrigido logo em seguida no mesmo
  dia). Verificado com um script à parte (deletado depois) reproduzindo o
  exemplo exato que o Lucas mandou (etapas "1.2 - CUSTO FIXO ENGENHARIA
  (MO)" e "19 - LIMPEZA E CONSERVAÇÃO DE OBRA (MAT, MO)") — bateu
  certinho, incluindo o total de R$ 28.828,16.
- **Feito (01-02/09/2026): lote de 11 pedidos — bugs de Mapa/datas +
  módulo Recebimentos.** Numa sessão só: (1) corrigido o total errado na
  lista de Mapas (fórmula própria desatualizada dobrava o frete
  particular); (2) blindado o arredondamento ao distribuir frete/imposto/
  desconto num pagamento gerado por Mapa, pra soma dos itens nunca
  divergir do total; (3) corrigida a causa raiz de "datas não fazem
  sentido" (`formatarData`/`formatarDataHora` agora sempre resolvem no
  fuso de Brasília, em vez de misturar corte de string cru com hora local
  do navegador) — **uma aba de Configurações pra ESCOLHER outro fuso
  continua pendente** (é trabalho de vários dias: serviço central de data
  injetável, migrar ~14 call sites, validar ~20 telas — não faz parte
  desta rodada); (4) Mapa ganhou um segundo toggle independente do de
  frete, "Lançar imposto/desconto como item"; (5-6) lista de Pagamentos da
  obra não mostra mais a coluna "Itens" e a coluna "Etapas" agora soma por
  etapa em vez de uma linha por item; (7) exportação Excel da EAP ganhou
  colunas de Realizado; (8) exportação do Mapa ganhou aba "Comparação de
  cenários"; (9) Empreita ganhou o toggle "Simplificar" (esconde
  Empreiteiro/Reserva, só o Total — vale na tela e no PDF); (10) lista de
  Empreitas ganhou coluna "% Medida" (ponderada pelo contrato do
  empreiteiro); (11) **módulo novo "Recebimentos"**, espelhando Pagamentos
  ponto a ponto (migration, models, controller, rotas com RBAC, store,
  telas de obra e geral, menu lateral, exportação Excel) — sem "ler nota
  fiscal" (não se aplica a dinheiro entrando) e sem split Empreiteiro/
  Reserva; a Medição ganhou o botão "Gerar recebimento" (só quando
  aprovada), criando um recebimento pendente com um item por etapa ×
  categoria com avanço não-zero. RBAC testado ponta a ponta numa empresa
  descartável (zero permissão bloqueia, `podeUsar` sem `podeCriar`
  bloqueia só a escrita). Um bug real foi pego e corrigido durante a
  verificação do item 4 (rateio proporcional de imposto/desconto virava
  `NaN` quando o frete já tinha virado linha própria antes dele).
- **Feito (22/08/2026): geração de PDF de relatório.** O relatório
  Orçado x Realizado (`/obras/{id}/relatorios`) ganhou um botão "Baixar
  PDF" que gera um PDF de verdade (não `window.print()`) — o backend
  (`RelatorioPdfController`) abre uma rota de impressão dedicada do
  Angular (`/imprimir/obras/:id/relatorios`, sem menu/cabeçalho) dentro
  de um Chromium headless (Browsershot) e converte pra PDF. Reaproveita
  as mesmas funções de cálculo da tela normal, então os números nunca
  divergem. Detalhes, arquitetura e passo a passo de preparação local em
  `docs/GERAR-PDF.md`. **Ainda não testado no ambiente Docker real** (só
  implementado) — próximo passo é rodar os comandos de preparação
  (`composer require spatie/browsershot`, `npm install puppeteer-core`,
  rebuild do `phpfpm`) e confirmar o download funcionando de ponta a
  ponta. O botão "Gerar PDF" do Mapa continua usando `window.print()`
  por enquanto — candidato natural a migrar pro mesmo mecanismo depois
  que este primeiro caso for validado.
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
  com `docker compose up -d` na pasta `backend-docker/`. O
  `docker-compose.yml` deste projeto já tem `restart: unless-stopped` em
  cada serviço (checado em 22/08/2026 — este risco específico já foi
  corrigido, mesmo que a entrada abaixo, mais antiga, ainda descreva
  como pendente).
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
  **Nota de 22/08/2026:** Clientes, Responsáveis, Empreiteiros e
  Fornecedores já ganharam telas de verdade desde então (ver pasta
  `frontend/src/app/features/cadastros/`) — esta linha ficou desatualizada
  nesse ponto específico, mantida até o refresh completo do arquivo.

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
- 08-09/09/2026: `master` (local) recebeu merge de
  `feature/diario-de-obra-completo` — branch construída por OUTRA sessão
  do Claude Code, em paralelo, sem acesso a Docker/MySQL (a própria
  mensagem do commit `cadb23e` avisa disso), cobrindo: Diário de Obra
  ampliado (responsáveis presentes, catálogo de equipamentos,
  ocorrências, pendências, comentário interno oculto do contratante;
  "Finalizar" já assina eletronicamente, sem ação separada de assinar),
  acesso somente-leitura do contratante via link público com token
  (`/publico/diario/:token`, fora do authGuard) e um `WhatsAppNotifier`
  ainda só com stub de log (provedor real por decidir). Merge sem
  conflitos (só 2 arquivos em comum com o trabalho da sessão anterior:
  `routes/api.php` e `api.service.ts`, ambos auto-mesclados certo).
  Nesta sessão (que tem Docker/MySQL), validado de verdade pela
  primeira vez: as 4 migrations novas rodaram limpas
  (`php artisan migrate`), lint PHP de toda a árvore sem erro, `tsc
  --noEmit` e `ng build` limpos com as duas features juntas, e um
  fluxo ponta a ponta via curl (criar obra → lançar diário já
  finalizado, assinatura automática → gerar link do contratante →
  acessar `/publico/diario/{token}` sem login e ver só o lançamento
  finalizado → revogar o link → confirmar que o acesso passa a
  devolver 410). Revisão de segurança da rota pública: token
  `Str::random(64)` (alta entropia, não é o UUID do registro), throttle
  60/min por IP no grupo, geração/revogação exigem permissão sobre a
  obra (`PermissaoService::podeObra`), e o controller público não herda
  nenhum contexto de usuário autenticado — nada encontrado de errado.
  A validação de `equipamento_id` contra o catálico de outra empresa
  (gap que a própria branch já tinha corrigido) foi conferida e está
  correta. Com autorização do Lucas, o merge foi enviado a
  `origin/master` (`fd48d07..25b382d`) — falta ainda a parte de
  produção (dump, migrate remoto e deploy em `trenadigital.com.br`),
  que precisa ser feita à mão no terminal do VPS (esta sessão não tem
  acesso SSH).
- 14/09/2026: Dashboard ("Principal") reorganizado a partir de mockups
  em Excel do Lucas. O card "Obras em aberto" saiu (não aparecia em
  nenhum mockup); o card "Relatórios" (antes um placeholder vazio)
  ganhou dados de verdade e ficou sozinho numa linha cheia, com um
  toggle "Detalhar" que troca entre um resumo (Orçado/Realizado/Medido/
  Saldo totais por obra) e uma tabela por categoria de custo (Material/
  Mão de obra/Equipamento/Outros/S de categoria/Total) — reaproveita
  exatamente o cálculo de Orçado/Realizado da tela de Relatórios de uma
  obra (`relatorios.ts`, `calcularCacheOrcado`), rodado uma vez por
  obra do recorte. "Medido" é conceito NOVO (não existia em lugar
  nenhum do sistema antes): valor da última medição APROVADA de cada
  obra, convertido de "% acumulado" pra R$ usando o orçado de cada item
  (mesma fórmula de `medicao-engine.ts::pctParaValor`) — decisão
  confirmada com o Lucas, já que a alternativa era deixar como
  placeholder igual ao Diário (abaixo). Os outros 6 cards (Mapas,
  Empreitas, Pagamentos, Recebimentos, Medição — novo — e Diários de
  obra) foram pro layout de 3 linhas x 2 colunas abaixo do Relatórios.
  Textos em azul nos mockups do Lucas viraram: "Ver todos/Ver mais" →
  link pra página geral; contagens/somas que representam uma lista de
  itens (n° de pagamentos de um Mapa, "Já pago" de uma Empreita, n° de
  anexos de um Pagamento/Recebimento) → popup com a lista real (`Ver`
  abre `EditarPagamentoModal` de dentro do popup — mesmo padrão já
  usado no popup de pagamentos vinculados do Mapa, agora extraído pra
  `shared/pagamentos-vinculados-popup/`, reaproveitado por Mapas E
  Empreitas). "Já pago"/Saldo de Empreita usa a MESMA fórmula já
  confirmada com o Lucas em `EmpreitasObra` (Total = contrato
  Empreiteiro+Reserva via `/empreitas/resumo`; Pago = pagamentos
  confirmados; Saldo = Total − Pago − Pendente), só que calculada aqui
  pra várias obras de uma vez. Diários de obra: por pedido do Lucas,
  ficou só o LAYOUT posicionado (Data/Nº do diário, Nome da
  obra/Responsável, Nº de Tarefas, Status/Nº de Ocorrências), sem
  nenhum dado real — o modelo de dados do Diário está sendo refeito
  (ver entrada de 08-09/09/2026 acima), não compensava ligar campos que
  vão mudar de novo. Backend: `Pagamento`/`Recebimento`/`Mapa`/
  `Empreita` (`index()`) ganharam `obraNome`/`obra_nome` (join
  `obra:id,obra_nome`); `Recebimento` ganhou `anexos()` (mesmo padrão
  de `Pagamento::anexos()`, fazia falta) e `anexosCount`; `Mapa` ganhou
  `pagamentos_count` via `withCount('pagamentos')` (a relação já
  existia, só não era usada na listagem). Validado com screenshots
  reais (Puppeteer, login de teste) mostrando os números batendo entre
  o card e o popup.
- 14/09/2026 (mesmo dia, revisão de fidelidade + redesenho do
  Relatórios): duas rodadas de ajuste depois do Lucas mandar os
  mockups originais de novo e depois um segundo lote de 4 mockups
  definitivos.
  1ª rodada — cada card (Mapas/Empreitas/Pagamentos/Recebimentos/
  Medição/Diários) foi refeito pra seguir o empilhamento/posicionamento
  EXATO dos mockups por coluna (ex.: Mapas = Data/Nº empilhados,
  Descrição/Nome da obra empilhados, um valor total em destaque,
  Status/contagem empilhados) — só as linhas divisórias entre entradas
  continuaram no padrão do sistema, por pedido explícito do Lucas.
  2ª rodada — o card Relatórios ganhou um SEGUNDO toggle, "Segmentar
  adicionais", que separa Orçado/Realizado/Medido (e o Saldo derivado)
  em dois baldes usando o `adicional: boolean` que a EAP já tem
  (serviço "fora do escopo original") — pagamento e medição não têm
  esse flag direto, então o balde de cada lançamento é decidido
  olhando de qual item da EAP ele veio (`item.eapId`/`eapItemId`); sem
  correspondência cai em "sem adicionais" por padrão. Percentual de
  cada métrica = valor ÷ Orçado do mesmo balde/categoria (decisão
  minha, não confirmada explicitamente com o Lucas — Orçado sempre dá
  100%). Percebido nessa rodada que "Detalhar" não muda a ESTRUTURA da
  linha, só troca quais colunas aparecem (só "Total" sem Detalhar,
  Material/Mão de obra/.../Total com); Status da obra/EAP saiu de uma
  coluna à parte e entrou empilhado dentro do bloco de identidade da
  obra (junto com Nº/Nome/Cliente/Data de início). O cabeçalho de
  colunas passou a ser renderizado com a MESMA árvore de elementos que
  as linhas de dado (`.banda` vazia, mesmas classes/larguras) — antes
  cabeçalho e dado usavam estruturas parecidas mas não idênticas, e
  ficavam desalinhados horizontalmente; agora alinham de verdade porque
  são literalmente a mesma estrutura só com conteúdo diferente.
- 19/09/2026 (lote F0 do plano de melhorias pedido pela equipe, item a
  item): (1) **Tags** — nome duplicado agora dá 422 com mensagem clara
  ("Já existe uma tag com esse nome", validação por empresa) em vez de
  500 genérico; o índice único do MySQL não diferencia maiúsculas/acentos,
  então "Nota fiscal" e "Nota Fiscal" colidem; o front mostra o motivo
  real do servidor (422/401/403/5xx). (2) **Mapa** — "lançar frete como
  item" e "lançar imposto como item" passam a nascer DESLIGADOS só em
  mapas novos (migration `2026_09_19_000000` muda só o default;
  `MapaController::syncCompleto` mantém o valor do mapa existente quando o
  campo não vem). (3) **Fonte** — `--fonte-titulo` e `--fonte-mono` agora
  apontam para `--fonte` (Inter em tudo: inputs, textos, cabeçalhos,
  números), `textarea` herda, `tabular-nums` no body pra manter números
  alinhados, Space Grotesk/IBM Plex Mono saíram do index.html. (4)
  **Profissionais** — o cadastro "Empreiteiros" virou "Profissionais" em
  menu, título, telas, filtros e colunas; ficam como estavam a página e a
  aba "Empreitas" e as parcelas do contrato "Empreiteiro / Reserva"; a
  rota `/empreiteiros` e a chave de storage `controleObra.empreiteiros.v1`
  não mudaram. (5) **Mapa: valor final do fornecedor** — nova linha "Valor final" no
  rodapé, acima da "Compra integral": itens que o fornecedor cotou + frete
  − desconto, com o markup por cima (mesma regra da nota), mesmo com
  cotação parcial; quando ele cotou tudo coincide com a compra integral —
  `calcularValorFinalPorFornecedor` em `mapa-engine.ts`. (6) **Mapa: frete
  particular sem pagamento** — causa real (reproduzida ponta a ponta):
  `ratearFreteiro` devolve o RÓTULO da etapa ("1.1 - Estaca", `item.etapa`)
  como chave, e o pagamento do freteiro gravava esse texto onde vai o ID do
  item da EAP; sem etapa nos itens dava certo (`""`), com etapa o servidor
  recusava a linha e só o pagamento do freteiro não era criado. Agora o
  rótulo é convertido no id real (`item.eapId`), o frete é dividido entre
  as etapas na MESMA proporção dos itens comprados nas lojas e, se "Etapa do
  frete" estiver escolhida, vai inteiro para ela (o seletor de etapa/categoria
  do frete também aparece quando "Considerar" frete particular está
  marcado). Além disso: os motivos de não gerar (não é o cenário vencedor 🏆,
  freteiro já confirmado, sem itens com preço) agora aparecem na mensagem de
  "Gerar pagamento", a falta do nome do freteiro não bloqueia (sai como
  "Frete particular", com aviso) e a categoria do frete vai para os itens.

- 19/09/2026 (lote F1 do plano de melhorias — peças compartilhadas, sem
  mudança de banco). (1) **Popups**: clicar fora NÃO fecha mais nenhum
  popup; `Esc` fecha o popup do topo (sem perguntar), inclusive com popup
  dentro de popup — serviço `ModalEscService` (`shared/modal/`) dispara o
  evento `fecharModal` no `.modal-fundo`/`.popup-fundo` de maior z-index; os
  ~27 templates trocaram `(click)` por `(fecharModal)`. (2) **Autocomplete**
  reutilizável (`shared/autocomplete/`) com modo restrito (só aceita opção da
  lista) e livre (aceita texto), já com a fonte de fornecedores
  (`fornecedores.fonte.ts`); ainda não ligado às telas (F2). (3) **Colunas
  ajustáveis reescritas** (`shared/redimensionar-colunas`): mede cabeçalho +
  amostra de linhas (as 2 primeiras e as 4 mais longas) em tabela-clone
  invisível, com largura natural (teto 360px) e mínimo (min-content, teto
  160px, piso 36px); célula de texto longo quebra em vez de vazar e cabeçalho
  que não cabe vira reticências com o texto no tooltip; larguras arrastadas
  ficam salvas no navegador (`trena:colunas:v1:*`); duplo clique na alça
  restaura; remede (só cresce) quando chega conteúdo novo ou a fonte termina
  de carregar. Conferido em 13 telas nos zooms 67/100/125/150% sem célula
  estourando. Também: caixa de seleção não estica em coluna estreita e a
  barra de filtros das listas passou a quebrar linha (a página de Mapas
  rolava na horizontal). (4) **Parser de fórmulas** puro
  (`shared/numero/formula.ts` + `parse-numero.ts`): `=` + conta em pt-BR,
  `+ - * / ^ %`, funções `soma/media/min/max/arredondar` (argumentos
  separados por `;`), referências entre aspas via resolvedor injetado; sem
  `eval`; ainda não ligado a campos (F3/F5).

- 19/09/2026 (lote F2 — Empreitas/Pagamentos, partes 2a–2c; a 2d, PDF para o
  profissional, ainda não foi feita; sem mudança de banco). (1) **Faixa e
  cabeçalho fixos** (`shared/barra-fixa`): botões + barra de totais ficam
  grudados sob a barra de topo; a tabela vira um invólucro com rolagem própria
  (`.envoltoria-fixa`, altura = o que sobra da janela) com cabeçalho fixo no
  topo e, no editor da empreita, a linha TOTAIS fixa embaixo. Vale para a lista
  de empreitas da obra e para o editor da empreita. (2) **Lista de empreitas
  da obra**: barra fixa de totais (Total/Pago/Saldo) das empreitas selecionadas
  — sem seleção, das que a lista mostra; "+ Nova empreita" e os botões de copiar
  passaram para a barra de ferramentas; "% Medição" (pela medição física;
  sem medição vai para o fim) e "Valor da última solicitação" agora ordenam.
  (3) **Editor da empreita**: "Realizar medição" saiu do bloco "Pagamentos
  registrados" e foi para o cabeçalho, ao lado de "Realizar pagamento"; novo
  botão **"Lançar reservas"** (`calcularReservasSugeridas`): serviço com reserva
  VAZIA recebe max(0, saldo disponível da etapa/categoria − contrato do
  profissional); reserva digitada (inclusive 0) nunca é sobrescrita; vários
  serviços da mesma etapa/categoria consomem o mesmo saldo em ordem (senão
  reservariam o mesmo dinheiro); serviço sem etapa ou sem contrato do
  profissional é ignorado. **Cores por serviço** na fase de medição
  (`classificarSituacaoMedicao`): verde = 100% medido, amarelo = em andamento,
  azul = pagamento no período (reserva ou profissional) — azul prevalece — com
  legenda. (4) **Etapa do serviço** passou a ser o campo com busca em modo
  restrito (`shared/autocomplete`; só aceita etapa da EAP da obra). **Fornecedor
  do pagamento** (popup de edição e "Novo pagamento") usa o mesmo campo em modo
  livre, sugerindo o cadastro (`FornecedoresCadastro`). Correções do
  autocomplete achadas nos testes: a lista não filtrava ao digitar e, dentro de
  popup (que tem `transform`), aparecia deslocada do campo. A navegação por
  teclado da tabela (`navegacao-tabela`) ignora tecla já tratada pelo campo.

- 19/09/2026 (ajuste do F2): o campo com busca da **Etapa** do serviço
  (`app-autocomplete`, nova opção `[quebraLinha]="true"`) passou a ser um
  `<textarea>` que cresce em altura — etapa longa quebra em várias linhas em
  vez de ficar cortada numa linha só (Enter continua escolhendo a opção, nunca
  vira quebra de linha no texto). O Fornecedor do pagamento continua de uma
  linha.

- 19/09/2026 (F2 parte 2d — **PDF de resumo para o profissional**; sem mudança
  de banco). Na lista de empreitas da obra, com empreitas marcadas, o botão
  "📄 PDF do profissional" abre um popup de opções e gera UM PDF (A4 retrato)
  com um bloco por empreita. Sempre entram: total contratado, já pago, saldo,
  % de medição física (ponderada pelo contrato do profissional) e a lista de
  serviços. Opcionais: Pagamentos, Medições realizadas (histórico, do retrato
  guardado em cada pagamento), Medição atual (período em aberto), Reservas e
  Valores do profissional. Regra dos valores (`empreita-resumo-engine.ts`):
  nenhuma das duas últimas marcada = valores somados, sem separar; marcada(s) =
  coluna própria e todo total/pago/saldo passa a ser só dos lados visíveis.
  Nunca sai orçado da EAP nem saldo disponível da etapa. As empreitas marcadas
  precisam ser de um profissional só (senão o popup avisa e bloqueia). A
  escolha das opções fica salva no navegador. Backend:
  `GET /api/obras/{obra}/empreitas/resumo-profissional/pdf?ids=…&opcoes=…`
  (`EmpreitaPdfController::resumoProfissional`, mesmas permissões da empreita;
  só empreitas da obra/empresa); tela de impressão
  `imprimir/obras/:id/resumo-profissional` (um `EmpreitaStore` por bloco).
  Também: no PDF/impressão o fundo da página fica branco (`_base.scss`).

- 20/09/2026 (ajustes da 2d, PDF do profissional): (1) empreitas de
  profissionais diferentes agora PODEM ir no mesmo PDF — o popup mostra um
  aviso e, ao clicar em "Gerar PDF", pede confirmação ("PDF com mais de um
  profissional"); o arquivo sai como `resumo-empreitas.pdf`. (2) Bug corrigido:
  o histórico "Medições realizadas" saía vazio porque o retrato da medição
  guardado no pagamento pode ter `desc` nulo (serviço sem descrição) e o código
  chamava `.trim()` nele. (3) "Medição atual" agora lista só os serviços que já
  têm medição (> 0), com acumulado / medido / avanço do período; "Medições
  realizadas" lista, em cada medição, só os serviços que avançaram (medição sem
  nenhum avanço some); pagamentos antigos sem retrato caem num quadro
  "Acumulado das medições fechadas".

- 20/09/2026 (F3 — fórmulas nos campos de valor; sem mudança de banco). Em
  qualquer `<input type="text" class="valor">` (Mapa, Empreita, Pagamento,
  Recebimento, Medição, Cronograma de desembolso e também os da EAP), digitar
  `=` + conta (`=1200*3+50`, `=soma(10;20)*2`, `=200*10%`; vírgula decimal,
  `;` entre argumentos; funções `soma`, `media`, `min`, `max`, `arredondar`)
  vira o resultado ao sair do campo; só o resultado é guardado. Implementação:
  `FormulaCamposService` (`shared/numero/`), um listener global de `change` em
  captura instanciado no `App` — troca o texto do campo pelo número calculado
  antes de a tela ler, então nenhuma tela precisou mudar. Fórmula inválida: o
  `change` não chega à tela (valor guardado não muda), o navegador mostra o
  motivo no balão nativo do campo e o foco volta para corrigir; se a pessoa sair
  sem corrigir, o texto anterior é restaurado. Campos que precisam tratar
  fórmula por conta própria (EAP na F5) usam `data-formula-propria` para o
  serviço ignorá-los. Os campos "Valor total" de "Novo pagamento" e "Novo
  recebimento" eram `type="number"` (não aceita `=`) e viraram texto com valor
  formatado. Referências a outros campos (`"1.4-qtd"`) só valem na EAP (F5).

- 20/09/2026 (F4 parte 4a — seleção múltipla nos Cadastros e nas Tags; sem
  mudança de banco). Nas listas de Clientes, Profissionais, Fornecedores,
  Responsáveis e Tags a coluna "Ações" (✎/✖ em cada linha) saiu: agora há uma
  coluna de caixas de seleção (com "marcar todos" no cabeçalho), **clicar na
  linha abre a edição** (nas Tags, o renomear) e, com linhas marcadas, a barra de
  ferramentas mostra a `app-barra-selecao` (`shared/barra-selecao/`): "N
  selecionados", **Editar** (só com exatamente 1), menu **Ações ▾** (por
  enquanto só Excluir) e **Limpar seleção**. Excluir é em lote com UMA
  confirmação ("Excluir N clientes definitivamente?", helper
  `confirmarExclusaoEmLote` em `shared/selecao-lista`); nos cadastros a exclusão
  faz uma gravação só (`CadastroStore.removerVarios`), nas Tags uma chamada por
  tag e as que falharem são avisadas no fim. A ação age só sobre as marcadas que
  a lista mostra com os filtros de agora. O interruptor "Ativo" continua na
  linha. Próximas partes do F4: Obras/Mapas/Empreitas/Medições, Pagamentos e
  Recebimentos, Arquivos (mover) e, por último, as tabelas de edição (EAP, itens
  do Mapa, serviços da Empreita).

- 20/09/2026 (F4 parte 4b — seleção múltipla em Obras, Mapas, Empreitas da obra
  e Medições; sem mudança de banco). Mesmo modelo da 4a: coluna "Ações" saiu,
  caixas de seleção + barra de seleção (`app-barra-selecao`), clicar na linha
  abre o item. Nas listas em que a linha abre a PÁGINA do item (Obras, Mapas,
  Mapas da obra, Empreitas da obra, Medições) o botão da barra de 1 marcada se
  chama **Abrir** (`rotuloEditar`). A lista global de Mapas ganhou a linha
  clicável (antes era o link "Ver"). Excluir em lote: uma confirmação listando
  os nomes (até 8) e uma chamada por item em paralelo (`excluirEmLote`, em
  `shared/selecao-lista`); uma falha não cancela as outras e é avisada no fim
  (`avisarFalhasDeExclusao`). **Medições**: a regra do backend (só a mais
  recente pode ser excluída) vale no lote — só é aceita a sequência das mais
  recentes sem pular nenhuma (ex.: 3, 2), excluídas da mais nova para a mais
  antiga, uma por vez, parando na primeira falha; qualquer outra marcação
  mostra um aviso e não apaga nada. As telas de cadastros e Tags também passaram
  a listar os nomes na confirmação. Falta no F4: Pagamentos/Recebimentos (obra e
  gerais), Arquivos (mover) e as tabelas de edição (EAP, itens do Mapa,
  serviços da Empreita).

- 20/09/2026 (F4 parte 4c — seleção múltipla em Pagamentos e Recebimentos; sem
  mudança de banco). **Pagamentos e Recebimentos da obra**: coluna "Ações"
  (✔ ✎ ✖) saiu; clicar na linha abre a edição; a barra de seleção mostra
  **Editar** (1 marcada) e o menu **Ações ▾** com **Confirmar pendentes** (só
  aparece se houver pendente entre as marcadas; confirma somente os pendentes,
  com uma pergunta para o lote, usando a data/hora do clique como antes) e
  **Excluir** (uma confirmação listando os itens). As chamadas são uma por
  item, em paralelo (`processarEmLote` / `excluirEmLote` em
  `shared/selecao-lista`); falhas são avisadas no fim sem cancelar o resto
  (`PagamentosStore`/`RecebimentosStore`: `removerVarios`, `confirmarVarios`).
  **Listas gerais (Pagamentos e Recebimentos de todas as obras)**: só tinham o
  link "Ver" — agora a linha inteira é clicável e abre a origem (mapa, empreita
  ou a lista da obra), com a barra de seleção mostrando só **Abrir** (não há
  excluir/confirmar nelas). O botão "Copiar mensagem" continua como estava.
  Falta no F4: Arquivos (mover/excluir) e as tabelas de edição (EAP, itens do
  Mapa, serviços da Empreita).

- 21/09/2026 (F4 parte 4d — seleção múltipla em Arquivos; sem mudança de
  banco). Diferente das outras listas, aqui os botões de cada item (⭳ ⇄ ✎ ✖)
  CONTINUAM — a seleção é uma opção a mais. Cada pasta/arquivo ganhou uma caixa
  de seleção nos três modos de exibição (tabela Detalhes, Lista e Ícones — no
  tile a caixa aparece ao passar o mouse ou quando marcada) e, com itens
  marcados, a barra de seleção mostra **Renomear** (com 1), **Ações ▾ → Mover
  para… / Excluir** e Limpar. O mesmo modal "Mover para…" serve a um item ou a
  vários; o título vira "Mover N itens para…". Excluir em lote: uma confirmação
  listando os nomes (e avisando que pasta leva o conteúdo junto); mover/excluir
  são uma chamada por item em paralelo, a pasta é recarregada uma vez no fim e
  as falhas são avisadas (`ArquivosStore.excluirVarios/moverVarios`). Trocar de
  pasta zera a seleção. **Decisão registrada em 21/09/2026 (F4f):** os botões
  individuais que a 4a–4c tiraram das listas (✖ excluir e ✔ confirmar; o ✎ editar
  não volta, editar é clicar na linha) serão devolvidos, convivendo com a seleção
  em lote, e os popups de pagamento/recebimento ganham ações por linha.

- 21/09/2026 (F4 parte 4e — seleção em lote nas tabelas de edição: EAP, itens do
  Mapa e serviços da Empreita; sem mudança de banco). Os botões de cada linha
  ficam EXATAMENTE como estavam (↑ ↓ + ✖ na EAP e no Mapa; só ✖ na Empreita); a
  seleção é uma opção a mais. **EAP**: nova coluna de caixas à esquerda (com
  "marcar todas" no cabeçalho); marcar um GRUPO leva junto todos os itens dentro
  dele (`ehDescendente`; desmarcar também), e dá para desmarcar um filho
  sozinho. **Mapa e Empreita**: a caixa mora dentro da célula do "#", à
  esquerda do número (sem coluna nova). Barra de seleção na barra de
  ferramentas com **Ações ▾**: na EAP e no Mapa *Mover para cima / para baixo*
  (cada linha marcada troca de lugar com a vizinha não marcada, então um bloco
  anda junto e a ordem entre as marcadas é preservada; no topo/fim não muda) e
  *Excluir*; na Empreita só *Excluir*. Excluir pede uma confirmação listando as
  linhas. Com a tabela travada (EAP confirmada, mapa finalizado, empreita
  confirmada) as caixas ficam desabilitadas e a barra não aparece.
  `removerVarios`/`moverVarios` nos stores fazem uma gravação só. Os campos de
  texto/numéricos continuam navegáveis por Tab/Enter (as caixas ficam de fora da
  navegação). Observação para o Lucas: hoje a tabela de serviços da Empreita só
  tem o ✖ por linha (não tem ↑ ↓ +, ao contrário de EAP e Mapa).

- 21/09/2026 (ajustes da 4e). (1) **Empreita**: a tabela de serviços ganhou os
  mesmos botões de linha da EAP e do Mapa na coluna "Ações" — ↑ ↓ empilhados e
  "+" (azul, insere um serviço logo abaixo) / "✖" (vermelho) empilhados ao lado;
  Shift + `+` no teclado também insere logo abaixo (antes ia para o fim). A ordem
  dos serviços é gravada. A barra de seleção da Empreita passou a ter também
  "Mover para cima / para baixo" (`EmpreitaStore.moverItem/moverVarios`).
  (2) **Mapa e Empreita**: o número "#" da linha saiu — a primeira coluna tem só
  a caixa de seleção (e o "marcar todas" no cabeçalho).

- 21/09/2026 (F4 parte 4f — botões individuais de volta + ações nos popups; sem
  mudança de banco). **Listas**: voltou a última coluna **Ações** com o ✖ em
  Obras, Mapas (geral e da obra), Empreitas da obra, Medições (só na mais
  recente, "—" nas outras), Pagamentos, Recebimentos, Clientes, Profissionais,
  Fornecedores, Responsáveis e Tags; e o ✔ nos pagamentos/recebimentos
  pendentes. O ✎ NÃO volta (editar = clicar na linha). Cada botão usa a
  confirmação individual de antes e convive com a seleção em lote. As listas
  gerais de Pagamentos e Recebimentos (todas as obras) continuam sem ✖/✔ — nunca
  tiveram (só o "Ver", hoje a linha clicável). **Popups de pagamentos
  vinculados** (popup compartilhado do painel, popup do Mapa na lista da obra e
  na lista geral, popup da Empreita e popup da EAP): coluna **Ações** com ✔
  (confirma o pendente) e ✖ (exclui, com confirmação que avisa o que muda — mais
  forte se o pagamento já estava confirmado: deixa de contar no Realizado da
  EAP e no "Já pago" da empreita), e clicar na linha abre o pagamento no
  `EditarPagamentoModal` (o "Ver" saiu). A lógica fica em
  `shared/pagamentos-vinculados-popup/acoes-pagamento.ts` (`AcoesPagamento`,
  `aplicarAlteracaoEmMapa`, `mensagemExclusaoPagamento`); a EAP usa o
  `PagamentosStore` da própria tela, então confirmar/excluir ali atualiza o
  Realizado da EAP na hora. O popup compartilhado emite `(alterou)` para a tela
  de fora recarregar totais. O popup do Mapa na lista geral ganhou o editor
  (antes só tinha o link "Ver"). Recebimentos não têm popup de vínculos hoje.

- 21/09/2026 (extensão da 4f: listas gerais e cards do painel). (1) **Pagamentos e
  Recebimentos GERAIS** (todas as obras) passaram a ter a MESMA lógica das listas
  da obra: coluna **Ações** (✔ confirma pendente, ✖ exclui), **clicar na linha
  abre o editor** (com as etapas da EAP da obra do lançamento, buscadas em
  segundo plano — a EAP de uma obra grande leva ~4 s; o editor abre na hora e o
  seletor de etapa se preenche quando ela chega) e barra de seleção com Editar
  (1), **Confirmar pendentes** e **Excluir** em lote. A ida à origem (mapa,
  empreita ou lista da obra), que era o "Ver" e depois o clique na linha, virou a
  ação **"Abrir origem…"** do menu Ações (aparece com exatamente 1 marcado).
  (2) **Novo componente `EditarRecebimentoModal`** (`features/recebimentos/
  editar-recebimento-modal/`), extraído da tela de Recebimentos da obra no mesmo
  desenho do `EditarPagamentoModal` (recebe o recebimento, edita uma cópia,
  devolve em `(salvar)`); `AcoesRecebimento` (`features/recebimentos/`) espelha
  `AcoesPagamento`. `shared/eap-snapshot.ts` tem a leitura dos itens da EAP.
  (3) **Cards do painel inicial**: clicar num item abre o editor — Pagamentos e
  Recebimentos abrem o popup de edição; Mapas e Empreitas abrem a página do
  item dentro da obra (mapa sem obra vinculada não abre); Medição já era link. Os
  botões de dentro do item (contagem de pagamentos, "Já pago", anexos) continuam
  funcionando sem abrir o editor. (4) Bug antigo corrigido: em Pagamentos e
  Recebimentos da obra, o título/estado "Editar" x "Novo" do popup ficava preso
  no primeiro valor (`computed` sobre campo comum); agora `idEditando` é signal.
- 21/09/2026 (F5 — fórmulas na EAP; 1 migration: `2026_09_21_000000_add_formulas_to_eap_itens`,
  coluna JSON `formulas` em `eap_itens`). Em quantidade, custo unitário (Mat/MO/Equip/
  Outros/Adm) e BDI do item, digitar `=conta` guarda a fórmula; a célula mostra o número
  e, ao receber foco, mostra a fórmula (com os códigos ATUAIS dos itens). Número comum
  desfaz a fórmula. O número calculado continua gravado nas colunas de sempre (relatórios
  e PDFs do PHP leem esses valores). Referências a outros itens: `"1.4-qtd"`,
  `"1.1-Unit.Mat"` (Unit.MO/Equip/Outros/Adm, BDI); a referência guarda o id do item e
  acompanha renumeração/movimentação. Referência a grupo, item excluído ou ciclo = erro
  (célula vermelha + aviso "N fórmulas com erro" na barra; fórmula nova inválida nem é
  gravada e mostra um alerta). Totais da obra podem entrar na conta: `Orç.*`, `Real.*` e
  `Saldo.*` com Mat, MO, Equip, Outros, Adm, Total, BDI. Nomes sem aspas (`qtd`, `Unit.Mat`,
  `BDI`, `Orç.Mat`, `Real.MO`, `Saldo.Total`…) valem para o PRÓPRIO item da célula (decisão do
  Lucas); a obra inteira é `Obra.Real.Mat` etc.; outro item/grupo é `"2-Real.Mat"`. Ex.:
  `=0,15*(Obra.Real.Mat+Obra.Real.MO+Obra.Real.Equip+Obra.Real.Outros)` calcula a
  administração sobre custos não previstos sem mexer na EAP. Fórmulas são dinâmicas mesmo com a EAP confirmada
  (travada): ao mudar o realizado, os itens com fórmula recalculam, regravam e refazem o
  snapshot `orcadoCongelado` só deles. Copiar EAP de outra obra leva as fórmulas
  (ids reescritos); importar Excel continua só valores. Motor puro em
  `features/eap/eap-formulas.ts` (grafo de dependências, ciclos, ordem de cálculo);
  parser em `shared/numero/formula.ts` (agora com nomes simples como `Real.Mat`).
  Limitações conhecidas: `Real.BDI` é sempre 0 (BDI só existe sobre o orçado); fórmula no BDI global/por
  categoria do cabeçalho não existe (só BDI do item); para manter dashboard/cronograma/PDF em dia sem abrir a EAP, um interceptor
  (`eap-formulas-sync.ts`) observa criar/editar/confirmar/excluir pagamento em qualquer
  tela e, se a obra tem fórmulas, relê EAP+pagamentos, recalcula e regrava (só roda no
  navegador de quem fez a alteração; se a gravação for feita fora do sistema, a EAP
  recalcula quando for aberta). Verificado: casos do motor em script,
  navegador (foco, dependentes, erro/ciclo, renumeração, exclusão, recarga, EAP travada
  com pagamento, cópia entre obras). Obs.: `VERIFICAR.bat` já apontava 10 divergências na
  EAP (numeração de nível 1 começando em 0), 1 no Mapa e falha ao compilar a Empreita
  ANTES do F5 — idênticas no commit anterior.
- 22/09/2026 (F6 — cadastros; 1 migration: `2026_09_22_000000_create_materiais_equipamentos_table`,
  mais o comando `php artisan cadastros:migrar-equipamentos [--dry-run]`).
  (1) **Profissionais** ganharam **Valor da diária** (aceita `=conta`), **Vínculo**
  (interno/externo; cadastros antigos ficam "externo") e a especialidade passou a ser
  mostrada como **Função**; a lista tem colunas Vínculo e Diária e filtro por vínculo.
  Continuam na ponte de storage (`controleObra.empreiteiros.v1`), sem tabela.
  (2) **Materiais e equipamentos** (novo, Cadastros → menu): um cadastro com Tipo
  (material/equipamento), nome, foto, unidade, valor unitário, lista de marcas e
  ativo; nome único por empresa+tipo (422 com mensagem). Este SIM tem tabela
  (`materiais_equipamentos`, por empresa) e API própria (`/api/materiais-equipamentos`,
  foto em `/{id}/foto`, disco `public/materiais`) — sem módulo de permissão próprio,
  como os outros cadastros. (3) O comando copia os nomes dos catálogos antigos
  (`equipamentos_catalogo` do Diário antigo e `rdo_equipamentos_catalogo` do RDO) como
  equipamentos, sem duplicar e sem tocar nas tabelas antigas — rodar UMA vez no VPS
  depois do migrate (`--dry-run` mostra antes). O RDO e o Diário antigo ainda usam os
  catálogos deles; a troca para este cadastro fica para as fases do RDO (F8–F10).
- 22/09/2026 (F7 — aba Diárias; 4 migrations: `create_diarias_table`,
  `create_diaria_etapas_table`, `add_diaria_id_to_pagamento_itens`,
  `create_diaria_categorias_custo_table`; novo módulo de permissão `diarias`).
  Nova aba "Diárias" em cada obra: lançamento manual de diária por profissional
  (vem do cadastro de Profissionais/F6 — nome, função e valor da diária entram
  como SNAPSHOT no momento do lançamento, não mudam se o cadastro mudar depois),
  com meia diária, uma ou mais etapas da EAP com percentual de divisão (soma tem
  que fechar 100%) e os 4 adicionais (vale transporte, vale alimentação,
  combustível, valor extra) — todos os campos de valor aceitam `=conta` (F3).
  **Fechamento**: seleciona uma ou mais diárias em aberto e gera UM Pagamento
  pendente; o rateio é calculado no motor puro `features/diarias/diarias-engine.ts`
  (com 32 casos de teste) — cada diária é resolvida isoladamente, então os
  adicionais de uma diária nunca vazam para a etapa de outra do mesmo lote,
  mesmo quando duas diárias do lote têm a mesma etapa. Depois de fechada, a
  diária vira só histórico (não edita nem exclui; desfazer é excluir o Pagamento
  gerado). `DiariaController::fechar` reconfere no banco (não só no front) que
  nenhuma diária do lote já foi fechada por outra ação, e que a soma dos itens
  bate com o total, antes de gravar. **Categorias de custo padrão**: nova aba
  "Diárias" em Configurações — em qual categoria de custo (Mat/MO/Equip/Outros/
  Adm) cada um dos 5 tipos de lançamento entra; vale pra empresa toda, sem
  precisar escolher lançamento a lançamento. Achado durante o teste (corrigido):
  `<select>` com `[value]` ligado a um signal e `<option>` vindas de `@for` NÃO
  seleciona a opção certa sem também pôr `[selected]` em cada `<option>` — mesmo
  ajuste que o `<select>` de tipo de custo da Empreita já usava; qualquer select
  novo com opções de `@for` precisa dos dois. Também corrigido: `PagamentoItem`
  não tinha `diaria_id` no `$fillable`, então o rastreio de qual diária gerou
  cada item do pagamento era descartado em silêncio. RDO ainda não lança diária
  automaticamente ao finalizar o dia — isso é F9, evita mexer no RDO antes de
  combinar com a Onilia.
- 22/09/2026 (F8 — RDO base: vídeo, calendário e aposentadoria do Diário antigo;
  2 migrations: `add_tipo_to_rdo_fotos`, `add_origem_diario_id_to_rdo_registros`;
  1 comando: `php artisan diario:migrar-para-rdo [--dry-run]`).
  **(D1) Vídeo junto das fotos**: `rdo_fotos` ganhou `tipo` ('foto'/'video') e
  passou a guardar os dois na MESMA galeria/ordem — mp4/mov/webm até 100 MB
  (cabe no limite do servidor, 110 MB); sem croqui (marcação de ponto é só de
  foto). Aparece em toda tela que já mostrava foto do RDO (edição, galeria
  salva, popup ampliado, acompanhamento público); no PDF (que é estático) o
  vídeo vira um aviso "Vídeo anexado" em vez de tentar embutir.
  **(D2) Calendário mensal como a própria lista**: pedido do Lucas depois de
  ver a primeira versão (calendário dentro do editor) — reformulado para
  separar lista e edição em telas diferentes, no mesmo padrão de
  Mapas/MapasObra/Mapa. A grade do calendário foi extraída de `publico-rdo.ts`
  (que já tinha, desde 15/09) para `rdo-calendario.ts` (função pura, com
  testes) e passou a alimentar um componente novo, `rdo-lista.ts`, usado em
  dois lugares: `/rdo` no menu lateral (todas as obras, com seletor de obra
  pra criar) e `/obras/:id/rdo` na aba da obra (só os RDOs dela, com a seção
  de link do contratante). O calendário FICA na lista, não no editor: cada
  dia é um botão só, clicar marca/filtra a tabela de RDOs abaixo dele pela
  data (clicar de novo limpa o filtro), clicar numa linha da tabela abre a
  edição. O editor (`rdo.ts`, agora só isso) virou rota própria da obra —
  `/obras/:id/rdo/novo` cria, `/obras/:id/rdo/:rdoId` edita — com botão
  "Voltar à lista", sem select de obra e sem calendário. "Novo RDO" só cria
  o relatório de fato quando alguém confirma explicitamente pelo botão (não
  existe mais "clicar num dia vazio cria"). Corrigidos DE PASSAGEM dois bugs
  pré-existentes que o calendário expôs (nenhum dos dois é do calendário em
  si): (1) o campo "Observações gerais do dia" estava aninhado dentro do
  `formArrayName="comentarios"` por engano, jogando erro no console toda vez
  que a seção renderizava; (2) todos os `@for` dos FormArrays do RDO (tarefas,
  etapas, mão de obra, equipamentos, ocorrências, pendências, responsáveis,
  comentários) usavam `track $index` — ao chamar `novoRegistro()`/reabrir um
  RDO mais de uma vez seguida (exatamente o que acontece ao navegar entre
  RDOs pela lista), o Angular reaproveitava o elemento do DOM sem reconectar
  o FormGroup novo, deixando a seção "inválida" para sempre mesmo com os
  campos certos. Corrigido trocando `track $index` por `track <a própria
  linha>` em todos — vale pra qualquer FormArray novo que este módulo ganhar.
  Detalhe de rota: `/obras/:id/rdo/novo` é um segmento literal (sem
  `:rdoId`), então o `withComponentInputBinding()` não amarra sozinho —
  precisou de `data: { rdoId: 'novo' }` na rota pra o componente saber que é
  criação (o binding por input também lê de `data`, não só de `params`).
  **Diário antigo aposentado**: rota interna (`/diario-obra`) e a pública
  (`/publico/diario/:token`) removidas do Angular — quem tinha o link antigo
  agora cai fora do sistema; o menu lateral e o atalho "Lançar" perderam a
  entrada do Diário antigo (o atalho agora tem "Novo RDO" no lugar). O card
  "Diários de obra" do painel inicial, que nunca teve dado real (era só
  layout), foi removido. NADA foi apagado do banco — tabelas `diario_*`,
  arquivos e o backend (`DiarioObraController`, `PublicoDiarioController`)
  continuam intactos, só sem tela que os use.
  **Comando de migração**: copia cada `diario_registros` para um `rdo_registros`
  novo (título vira observação quando diferente da descrição; descrição vira a
  tarefa nº 1; clima livre é reconhecido contra as 5 opções do RDO — sem
  bater, viram observação; quantidade de operários vira 1 linha de mão de
  obra "direta"; equipamento do catálogo antigo entra como texto livre, sem
  linkar no catálogo novo; responsável com `presente=false` não é migrado;
  fotos reaproveitam o MESMO arquivo em disco, sem copiar). Idempotente
  (marca `origem_diario_id`, pula o que já migrou) e por registro (uma falha
  não derruba as demais). Ainda não rodado em produção — roda depois do
  `migrate --force`, com `--dry-run` primeiro.
- 23/09/2026 — **Bug: nenhuma foto/vídeo aparecia em PDF nenhum** (achado pelo
  Lucas). Causa: `RdoFoto`/`MaterialEquipamento`/`DiarioFoto` montavam a URL
  da mídia com `Storage::disk('public')->url()`, que usa `APP_URL` — um host
  que só existe do ponto de vista do navegador do usuário. O Chromium
  headless que gera qualquer PDF (`RdoPdfController` e os demais, ver
  docs/GERAR-PDF.md) roda *dentro* do container `phpfpm`, onde esse host não
  é alcançável, então toda `<img>`/`<video>` de mídia real vinha como ícone
  quebrado — mesmo bug (e mesma correção) já resolvidos só para a logo da
  empresa em 28/08/2026 (`Empresa::getLogoUrlAttribute()`), sem ter sido
  generalizado pro resto do sistema na época. Corrigido replicando o mesmo
  padrão: os três modelos passaram a devolver caminho RELATIVO
  (`/storage/...`), e cada tela que exibe essas mídias (`rdo.ts`/`.html`,
  `rdo-imprimir.ts`/`.html`, `publico-rdo.ts`/`.html`,
  `materiais-equipamentos.ts`/`.html`) monta a URL final somando
  `ApiService.baseStorage()` (ou o equivalente manual nas duas telas
  públicas/sem sessão, que usam `environment.apiUrl` direto). De passagem,
  achado e corrigido um segundo descuido no mesmo arquivo: a logo da empresa
  em `rdo-imprimir.html` usava `empresa()?.logoUrl` direto, sem o
  `baseStorage()` que `mapa-imprimir.ts`/`cabecalho-impressao.ts` já
  aplicavam — mesma causa, ponto isolado que ficou pra trás. Reproduzido e
  confirmado visualmente (screenshot do PDF renderizado) antes e depois da
  correção. `DiarioFoto` também corrigido por consistência, mas sem efeito
  prático hoje — as rotas que a exibiam foram retiradas no F8. Nenhuma
  migration: são só accessors de modelo: nada pra rodar no VPS além do
  deploy normal do código.
- 24/09/2026 (F9 — RDO: mão de obra por profissional, etapas ligadas à EAP,
  diária automática ao finalizar; 2 migrations:
  `add_profissional_a_mao_de_obra_rdo`, `add_eap_item_a_etapas_rdo`).
  **Mão de obra por profissional**: o critério de coluna muda de
  indireta/direta (tipo de trabalho) pra interno/externo (vínculo com a
  empresa, do cadastro de Profissionais/F6) — decisão do Lucas, 23/09/2026;
  dados já lançados foram migrados (indireta→interno, direta→externo, não é
  correspondência perfeita, mas evita RDO antigo com rótulo desconhecido se
  reimpresso). Cada coluna ganhou um autocomplete restrito de profissional
  (por vínculo) — escolher um adiciona uma linha com nome/função vindos do
  cadastro (`quantidade` sempre 1); **continua dando pra lançar manual**
  (função + quantidade digitadas, sem cadastro, ex.: "Ajudante avulso x3") —
  só a linha COM profissional gera diária automática. **Etapas do RDO**
  ganharam um vínculo opcional a um item de verdade da EAP da obra (mesmo
  padrão de `DiariaEtapa`) — autocomplete ao lado do nome livre, que
  continua podendo ser digitado sem vínculo nenhum (etapas fora da EAP, ex.:
  "Limpeza do canteiro"). **Diária automática ao finalizar**: cada linha de
  mão de obra COM profissional vinculado vira uma diária em rascunho (aba
  Diárias, F7) — decisão do Lucas, 23/09/2026: SEM etapa/meia-diária/vales
  preenchidos no próprio RDO (deixaria o formulário pesado com equipes
  grandes); quem for fechar o pagamento completa isso depois, direto na aba
  Diárias (o formulário de lá já cai bem num rascunho sem etapa — mostra
  campos vazios pra preencher, sem precisar de nenhuma mudança). O valor da
  diária vem do cadastro de Profissionais NO MOMENTO da finalização (lido
  direto de `app_storage`, a mesma ponte chave-valor — não há tabela
  relacional). Idempotente por profissional+data+origem (reabrir e
  refinalizar o mesmo RDO não duplica). A lista de Diárias mostra uma
  etiqueta "RDO" ao lado do nome de quem veio assim, e "Falta definir
  (gerada pelo RDO)" no lugar da etapa até alguém completar. Testado de
  ponta a ponta: profissional interno e externo lançados via autocomplete,
  lançamento manual lado a lado, salvar/reabrir preservando o vínculo,
  finalizar gerando as duas diárias com o valor certo do cadastro, PDF com
  as colunas Interna/Externa corretas. Zero migrations de dado perdido —
  **durante o teste, uma limpeza de dado de teste quase sobrescreveu por
  engano o único profissional real cadastrado localmente
  (`controleObra.empreiteiros.v1`, ao zerar a chave inteira em vez de só
  remover as entradas de teste); percebido e restaurado a partir do dump
  local antes de seguir** — lição pra qualquer limpeza futura numa chave da
  ponte de storage: ler o valor atual, tirar só as entradas de teste, nunca
  sobrescrever a chave inteira com uma lista nova.
- 25/09/2026 (F10 — Ficha de Verificação de Serviço (FVS), a última fase do
  lote de melhorias de setembro/2026; 2 migrations:
  `create_fvs_modelos_e_vinculos`, `create_fvs_preenchimentos` — 5 tabelas
  novas: `fvs_modelos`, `fvs_vinculos`, `fvs_preenchimentos`,
  `fvs_preenchimento_itens`, `fvs_fotos`). Três peças, como no plano (D4):
  **(1) Modelos** — cadastro reaproveitável em Configurações → "Fichas de
  verificação" (nome + lista de itens Conforme/Não conforme/Não se aplica),
  mesmo espírito de Materiais/Profissionais. **(2) Vínculo com a EAP** —
  botão "FVS" na coluna de ações de cada linha da EAP abre um popup com os
  modelos da empresa em checkbox; marcar/desmarcar vincula/desvincula na
  hora — qualquer item pode ter vários modelos, e o mesmo modelo vale pra
  vários itens. **(3) Preenchimento** — decisão do Lucas (23/09): a ficha
  nasce PENDENTE sozinha assim que uma etapa do RDO ligada a um item com FVS
  vinculada é SALVA (não precisa de nenhuma ação extra do usuário), com os
  itens já copiados do modelo; aparece numa seção própria "Fichas de
  verificação de serviço" no editor do RDO, FORA do `<form>` principal — cada
  ficha se salva com um PUT próprio (`FvsService.salvar`), sem depender de
  salvar o RDO inteiro de novo. O status é sempre CALCULADO no backend
  (nunca vem do cliente): qualquer item "não conforme" = reprovada; todos
  respondidos (conforme/não se aplica) = aprovada; senão, pendente.
  Reprovar pela primeira vez abre uma pendência no próprio RDO
  (`rdo_pendencias`) automaticamente. **Ao criar o PRÓXIMO RDO da obra**
  (não só o imediatamente seguinte — qualquer RDO novo, mesmo pulando
  alguns), toda ficha reprovada sem revisão seguinte ainda ganha uma cópia
  em branco (mesmos itens, `numero` igual, `revisao+1`,
  `origem_preenchimento_id` apontando pra reprovada) — sem apagar a
  anterior. Numeração `FVS-0001-REV000`, reprovada vira `REV001` na cópia,
  sequência por obra. Fica opcional (não bloqueia finalizar o RDO) e entra
  anexada no fim do PDF do RDO, uma página por ficha, com a tabela de itens
  e as fotos de evidência. Testado de ponta a ponta via Puppeteer: criar
  modelo, vincular a um item da EAP, etapa ligada gerando a ficha sozinha ao
  salvar, marcar item não conforme + foto + observação, salvar reprovando a
  ficha e abrindo a pendência, finalizar, criar o RDO seguinte e confirmar a
  cópia em branco (REV001) chegando pronta, PDF com a página de anexo
  correta. **Achado e corrigido durante o teste**: `FvsController.php`
  esqueceu o `use App\Http\Controllers\Controller;` — `php -l` (checagem de
  sintaxe) não pega isso, só um teste de verdade rodando a rota (erro
  "Class Controller not found" só aparece em runtime); todo controller novo
  precisa desse import, mesmo sendo fácil de esquecer copiando um trecho de
  outro arquivo. Sem migration extra pra isso, só o código. Com a F10
  publicada, **todo o lote de melhorias de setembro/2026 (F0 a F10) está
  concluído** — falta só publicar F9+F10 em produção.
- 25/09/2026 — **Empreitas: popup "O que mostrar" antes de gerar o PDF, "Simplificar"
  ligado por padrão e serviço novo como Mão de obra** (pedido do Lucas, sem
  migration). (1) "⭳ Baixar PDF" da tela da empreita agora só ABRE um popup com 4
  opções — Valor do empreiteiro, Reserva, Total e Saldos —; "Gerar PDF" manda as
  chaves ligadas em `?opcoes=` até `EmpreitaPdfController` (lista branca
  `OPCOES_EMPREITA`, o que sobrar é descartado) e daí até `EmpreitaImprimir`
  (`lerOpcoesPdfEmpreita`; parâmetro ausente = mostra tudo). Vale pros SERVIÇOS
  (tabela, rodapé de totais, painel "Medição deste período") e pros PAGAMENTOS
  REGISTRADOS (`EmpreitaRelatorioPagamentos` ganhou 4 `input()` `mostrar*`, todos
  `true` por padrão — a tela normal não muda). "Total" também cobre a linha
  "Contrato" dos pagamentos; "Saldos" cobre "Saldo disp.", o bloco inteiro "Saldo
  após pagamento" (coluna some, colgroup e colspan acompanham) e o "Saldo
  empreita" dos pagamentos. As escolhas do popup valem só pro PDF, não mexem na
  tela; ele abre já partindo do "Simplificar" da tela (ligado = Empreiteiro e
  Reserva desmarcados). O parâmetro antigo `?simplificado=1` foi substituído por
  `?opcoes=` (só o Angular chamava). Regra em `empreita-pdf-opcoes.ts`. (2)
  "Simplificar" da tela da empreita nasce LIGADO (`simplificado = signal(true)`):
  as colunas Empreiteiro/Reserva ficam escondidas até desmarcar. (3) Serviço novo
  na empreita nasce com tipo Mão de obra (`EmpreitaStore.adicionarItem`); o
  `?? 'material'` de `normalizar` (dado vindo do banco sem tipo) NÃO mudou, pra
  não reinterpretar serviço antigo. Testado via Puppeteer: popup abre com os
  padrões certos, `?opcoes=total,saldos`/`empreiteiro,reserva`/`total` gerando
  PDFs coerentes (inclusive o de pagamentos, numa empreita com 7 pagamentos), e
  serviço novo persistindo como Mão de obra ao recarregar.
  **Correção no mesmo dia (o popup "não abria")**: o teste só conferia que o popup
  existia no DOM — e `.modal`/`.modal-cartao` são estilos POR COMPONENTE (não há
  global), então sem eles em `empreita.scss` o popup renderizava solto no fim da
  página, invisível na prática. Copiado o bloco de modal pro `empreita.scss`. O
  mesmo defeito existia no popup "Novo modelo" da FVS (Configurações) — agora o
  formulário é INLINE no painel (popup dentro do popup de Configurações nasce
  preso ao cartão de fora, por causa do `transform`) — e o popup de vínculo de FVS
  na EAP ficou com checkbox esticado/largura de 920px (ajustado em `eap.scss`).
  **Lição pra todo popup novo**: conferir com screenshot/posição (`position: fixed`
  e cartão dentro da janela), não só a presença no DOM, e definir os estilos de
  `.modal*` no scss do próprio componente.
- 25/09/2026 — **Empreitas: opções do PDF redefinidas** (pedido do Lucas, mesmo dia,
  sem migration; substitui a semântica descrita na entrada anterior). Agora TODAS as
  colunas aparecem sempre (Contrato, Medição, Já pago, Pagamento, Saldo após
  pagamento + Pagamentos registrados) e a opção "Saldos" foi REMOVIDA. Sobram três
  opções, combináveis: **Valor do empreiteiro**, **Reserva** e **Total**. Marcar
  empreiteiro (ou reserva) mostra SÓ as informações dele em todos os blocos e nos
  pagamentos registrados, e esconde os serviços (e os pagamentos) sem valor dele
  (contrato, já pago ou pagamento; `EmpreitaImprimir.linhasVisiveis` e
  `EmpreitaRelatorioPagamentos.linhasExibidas`); com mais de uma marcada o serviço
  fica se tiver valor em qualquer uma. "Total" mostra os totais de cada bloco, o
  "Saldo disp.", a linha "Etapa" do saldo após pagamento, o "Saldo empreita" dos
  pagamentos e o painel "Contrato x orçado" (que só sai com Total) — e com Total
  nenhum serviço é escondido. "Medido" e "Divergência" (que são do empreiteiro) saem
  com empreiteiro OU total. A tabela mantém a numeração original (#) mesmo com
  serviços escondidos. O popup exige ao menos uma opção marcada (senão "Gerar PDF"
  fica desabilitado) e explica cada opção; ainda abre partindo do "Simplificar" da
  tela (ligado = só Total). `?opcoes=` agora aceita só `empreiteiro,reserva,total`.
  Ainda não publicado.
- 25/09/2026 — **Empreitas: colunas visíveis no PDF** (pedido do Lucas, mesmo dia,
  sem migration). O popup "O que mostrar" ganhou a seção "Colunas visíveis": Tipo,
  Etapa (EAP), Contrato, Medição de contrato (Quantidades, se a empreita ainda não
  está confirmada), Já pago, Pagamento e Saldo após pagamento; "#" e "Serviço"
  sempre aparecem. Já pago/Pagamento/Saldo após pagamento só são oferecidos com a
  empreita confirmada (`store.travada()`), porque só existem nela na tela de
  impressão. Trafega como `?colunas=` (só as ligadas; ausente = todas), com lista
  branca `COLUNAS_EMPREITA` no `EmpreitaPdfController`. As colunas escondidas somem
  do `colgroup`, do cabeçalho, do corpo e do rodapé, e os `colspan` (TOTAIS e linha
  vazia) acompanham (`colunasFixas`/`totalColunas` em `EmpreitaImprimir`). Vale só
  pro PDF e volta a começar com todas ligadas a cada abertura do popup. Regra em
  `empreita-pdf-opcoes.ts`. Ainda não publicado.
- 25/09/2026 — **Lote de ajustes finos** (pedidos do Lucas, mesmo dia; 1 migration
  de dados nova, `2026_09_26_000000_ajusta_hora_data_pagamento_para_meio_dia`).
  (1) **Lista de empreitas**: "Medição física" e "Medição financeira" viraram duas
  colunas próprias; com "Detalhar" marcado cada uma mostra as barras Empreiteiro e
  Reserva separadas (`fisicoParcela`/`financeiroParcela`), sem Detalhar mostra uma
  barra geral. A barra de totais das marcadas (Total/Pago/Saldo) também se divide em
  Empreita/Reserva com Detalhar. (2) **Controle de permissões**: coluna "Todos" em
  cada linha liga/desliga as 5 permissões do módulo. (3) **Data do pagamento**: bug
  — a data escolhida no calendário gravava 00:00 UTC e aparecia como o dia anterior
  às 21h. Agora `Pagamento::setDataPagamentoAttribute` grava `YYYY-MM-DD` como
  12:00 de Brasília (15:00 UTC); a migration soma 15h nos registros antigos que
  estavam em 00:00:00. (4) Texto dos campos com busca (autocomplete) alinhado à
  esquerda. (5) "Mostrar etapas" começa desligado em Pagamentos e Recebimentos.
  (6) **Mensagem "Copiar mensagem" dos pagamentos** no formato RESUMO DE CUSTOS
  (`pagamentos-mensagem.ts`): total por categoria (material, mão de obra,
  equipamento, outros, administração), total pago e lista `PG-xxxx - (data) -
  fornecedor: valor`; item sem categoria e a diferença até o total caem em Outros.
  (7) Na tabela da Empreita (tela e PDF) o bloco Contrato veio DEPOIS de
  Quantidades/Medição. **Pendência registrada pelo Lucas**: "guardar fórmula" só
  funciona na EAP por enquanto — estender às outras tabelas (Mapa, Empreita,
  Pagamento, Recebimento, Medição...) só depois do teste e validação. Ainda não
  publicado.
- 26/09/2026 — **Guardar fórmula estendido às outras tabelas** (Lucas testou e
  validou na EAP e pediu a extensão; sem migration, sem mudança no servidor).
  Em Mapa (frete particular, quantidade, preço unitário, frete/desconto/imposto
  por fornecedor e rateio por etapa), Empreita (quantidade contratada, medição
  atual, contrato do empreiteiro/reserva, pagamento a lançar), Medição,
  Cronograma de desembolso (planejado por categoria), popups de edição de
  Pagamento e Recebimento (valor total e valor de cada item) e Diárias (só ao
  EDITAR uma diária existente), digitar `=conta` continua gravando só o
  resultado no dado, mas agora o texto da conta também fica guardado: a célula em
  repouso mostra o número com a faixa azul (classe `campo-formula`, em
  `_base.scss`), ao receber foco mostra a fórmula, e número comum desfaz. Só vale
  a conta em si — referências a outros campos (`"1.4-qtd"`) seguem exclusivas da
  EAP. Peças: `shared/numero/formulas-guardadas.ts` (`FormulasContexto`, um por
  tela via `providers`, e a diretiva `appFormulaCampo="<chave>"` em cada
  `<input class="valor">`); as fórmulas de um registro ficam num JSON
  `{chave: fórmula}` na ponte `/api/storage` com a chave
  `controleObra.formulas.<tela>.<id>` (isolada por empresa). Salva 500 ms depois
  da última mudança relendo o servidor antes (aplica só o que a tela mudou).
  Proteção contra fórmula velha: ao focar, a conta só aparece se ainda der o
  número do campo; se o número mudou por outro caminho (outra tela, recálculo,
  troca de unidade %/R$), a fórmula é descartada. `FormulaCamposService` passou a
  deixar a conta digitada em `data-formula-digitada` e a respeitar
  `data-texto-repouso` ao restaurar. Limitações: em registros ainda sem id
  (nova diária) a fórmula não é guardada — o cálculo funciona, só o texto não
  fica; os formulários "Novo pagamento/recebimento" das listas gerais e os
  cadastros (diária do profissional, valor do material) também não guardam.
  Fórmulas de registros excluídos ficam órfãs na ponte (só texto, sem efeito).
  Ainda não publicado.
- 26/09/2026 — **Segundo lote de ajustes finos** (pedidos do Lucas; 1 migration nova:
  `2026_09_26_010000_create_agenda_eventos`). (1) **Empreita, coluna "Já pago"**: ordem
  Medido / Empreiteiro / Reserva / Total; a Divergência saiu da tela, do PDF e do Excel
  (o dado continua no cálculo). "Medido" = ACUMULADO% do serviço × valor do empreiteiro
  (tela não simplificada) ou × total do contrato (simplificada); no PDF, só "Total"
  marcado (sem Empreiteiro) segue a regra da simplificada. Saiu da coluna "Pagamento"
  (que agora começa em Empreiteiro). Pagamento e Saldo após pagamento já somavam
  empreiteiro + reserva no "Total" — não mudaram. (2) **Frete particular**: a "Etapa do
  frete" só vale com "Lançar frete como item" LIGADO; desligado, o frete particular é
  dividido entre as etapas dos itens mesmo que uma etapa tenha ficado escolhida antes
  (o seletor de etapa também só aparece com a opção ligada). (3) **Beneficiado do
  pagamento** (`features/cadastros/beneficiados.ts`): confirmar um pagamento (salvar
  como confirmado no popup/formulário, ✔ da linha ou "Confirmar pendentes") confere o
  nome nos cadastros de Fornecedores e Profissionais (ignora acento/maiúscula); se não
  estiver, pergunta se quer cadastrar, depois "F ou P" (fornecedor/profissional) e
  cadastra só com o nome; recusando, NÃO confirma, avisa e volta à edição (no ✔ da linha
  abre o editor; em lote, confirma só os aptos e avisa dos barrados). Pagamentos
  PENDENTES gerados por Mapa/Empreita/Diárias não são barrados até serem confirmados.
  (4) **Bug do "Tipo" nos itens do Mapa**: o dado nunca se perdia, mas o select abria em
  branco ao reabrir o mapa (faltava `[selected]` nas opções, mesmo defeito do seletor de
  período do Cronograma de desembolso, também corrigido). (5) **Varredura de layout dos
  PDFs**: EAP (descrição 16%→21%, código/unidade sem quebra, "REAL./ORÇ." e valor na mesma
  linha — o PDF ficou ~20% mais curto), Mapa (etapa deixou de ser cortada com reticências),
  Medição (o resumo do topo ainda usava o desenho antigo em cards, sem estilo — trocado
  pela tabela compacta da tela; descrição alargada), Cronograma de desembolso (Orçado e
  Totais sem quebrar dígitos, valores dos meses numa linha só), Empreita (etapa alargada,
  valores e rodapé sem quebrar "R$"). RDO, Relatório e Resumo do profissional conferidos.
  (6) **Agenda** (estilo Google Agenda): página geral `/agenda` (todas as obras + sem
  obra, com filtro por obra) e aba "Agenda" da obra (`/obras/:id/agenda`); visões Mês,
  Semana (grade de horas, sobreposição lado a lado, faixa "dia todo") e Dia; clicar no dia
  ou horário cria; popup com título, dia inteiro, início/fim com hora, obra, local,
  descrição e participantes (usuários ativos da empresa); "Só os meus". Todos os usuários
  da empresa veem tudo (exceto compromissos de obras vetadas a eles); só o criador e o
  admin alteram/excluem. Novo módulo de permissão `agenda` (usar/criar/editar/excluir):
  administradores têm sempre; usuários secundários precisam receber a permissão em
  Configurações > Controle de permissões. Tabelas `agenda_eventos` e
  `agenda_evento_participantes`; horário de parede sem fuso; `AgendaController`. Ainda
  sem aviso/e-mail para os participantes marcados e sem repetição de compromissos.
  `VERIFICAR.bat`: Empreita não compila (`entrada-empreita.ts` importa
  `obterTiposIncluidos`, que não existe no engine — já era assim antes deste lote) e o
  Mapa aponta 1 caso divergente (idem). Ainda não publicado.
- 26/09/2026 — **Empreita: colunas renomeadas e empilhamento novo** (pedido do Lucas; sem
  migration, tela + PDF + Excel). "Já pago" → **Anterior**, "Pagamento" → **Pagamento**,
  "Saldo após pagamento" → **Saldo remanescente**. Anterior e Saldo remanescente empilham
  Medição / Empreiteiro / Reserva / Total; só o Pagamento empilha Disponível (emp.) /
  Empreiteiro / Reserva / Total. Disponível (emp.) = (medição acumulada + avanço) × valor do
  empreiteiro − já pago ao empreiteiro (azul se ≥ 0, vermelho se negativo; com "Simplificar"
  vira "Disponível", sobre o total do contrato e o total já pago). Medição do Saldo
  remanescente = Disponível − pagamento do período (a linha "Etapa" do saldo saiu da tela; o
  dado continua no cálculo). "Simplificar" continua escondendo Empreiteiro/Reserva. Rodapé
  TOTAIS acompanha. Ainda não publicado.
- 26/09/2026 — **Empreita: pré-preenchimento do Pagamento e Saldo remanescente** (pedido do Lucas). O
  rascunho do Pagamento agora nasce como: empreiteiro = Disponível (emp.) = (acumulado + avanço) ×
  contrato do empreiteiro − já pago ao empreiteiro; reserva = (acumulado + avanço) × contrato da reserva −
  reserva já paga (nunca negativo; o usuário ainda digita por cima). Alterar a medição atual de um
  serviço DESCARTA o que foi digitado à mão no pagamento dele e refaz o pré-preenchimento. Saldo
  remanescente: Medição = (100% − medição atual) × total do contrato; Empreiteiro/Reserva/Total =
  contrato − (anterior + pagamento). O painel "Medição deste período" (a pagar / reserva) ainda usa a
  conta antiga (contrato × avanço). Ainda não publicado.
- 26/09/2026 — **Empreita: rótulos dos itens empilhados, vermelho no "a pagar" e barra de totais da lista**
  (pedido do Lucas). Anterior: Medição (acum.) / Pago (emp.) / Pago (reserva) / Pago (total). Pagamento:
  Disponível (emp.) / A pagar (emp.) / A pagar (reserva) / A pagar (total). Saldo remanescente: Saldo
  (medição) / Saldo (emp.) / Saldo (reserva) / Saldo (total) — na tela, no rodapé TOTAIS e no PDF. Quando o
  saldo de emp., reserva ou total fica negativo, o "A pagar" correspondente também fica vermelho (o campo
  editável ganha a classe pagar-negativo). Lista de empreitas: a barra Total/Pago/Saldo agora é SEMPRE
  empilhada em 3 linhas (título, Empreiteiro, Reserva), independente do "Detalhar". Ainda não publicado.
- 26/09/2026 — **Empreitas: Pagamentos registrados na lista, histórico de medições editável, Mapa numerado**
  (pedidos do Lucas; sem migration). (1) Some o painel "Medição deste período" (tela e PDF) e os
  "Pagamentos registrados" saem da página da empreita completa (continuam no PDF). (2) Clicar na
  empreita da LISTA abre o popup "Pagamentos registrados" (`empreita-pagamentos-popup`); o editor da
  empreita abre pelo botão "Abrir empreita completa" do popup ou por "Abrir" na barra de seleção.
  (3) Tabela: Nº · Beneficiado (fornecedor do pagamento — pode não ser o profissional da empreita) ·
  Datas empilhadas · Medição física · Medição financeira (Empreiteiro/Reserva/Total; a física é a medição
  atual ponderada pelo contrato da parcela, a financeira é o pago acumulado / contrato da parcela) ·
  Valor pago · Ações (Editar = abre o popup do pagamento vinculado; Confirmar; Tornar pendente). "Simplificar"
  (ligado por padrão) atua na tabela toda: só Total. (4) Clicar numa linha abre a "empreita completa" daquela
  medição (`empreita-medicao-detalhe`), reconstruída do retrato (`medicaoSnapshot`) + itens do pagamento;
  "Editar medição" (medição atual e a pagar emp./reserva, com o mesmo pré-preenchimento) e "Apagar medição"
  exigem confirmação, atualizam/excluem o pagamento vinculado e recalculam as medições seguintes MANTENDO
  avanço, folga entre períodos e valores pagos de cada uma (, testado); o acumulado
  atual dos serviços se desloca junto e o pré-preenchimento em andamento é refeito. Pagamentos gerados antes
  do retrato existir (sem snapshot) aparecem na tabela mas não abrem a empreita completa. Ordem das medições =
  número do pagamento. "Anterior" no retrato conta todos os pagamentos anteriores, pendentes inclusive.
  (5) Mapa: coluna "Nº" ao lado da caixa de seleção = posição da linha (mover o item muda o número).
  Ainda não publicado.
- 26/09/2026 — **Empreitas: ajustes do popup de Pagamentos registrados e do Realizar medição** (pedidos do
  Lucas). (1) Lista: a barra de totais (Total/Pago/Saldo das selecionadas) só é empilhada em
  Empreiteiro/Reserva com "Detalhar" marcado; sem ele mostra o valor geral (empreiteiro + reserva); o valor da
  última solicitação já seguia o "Detalhar" (rótulo agora "Empreiteiro"). (2) Pagamentos registrados: medição
  física e financeira viraram BARRAS como na lista — azul = acumulado até o pagamento anterior, amarelo =
  avanço até a situação daquele pagamento, número = o atual do pagamento (por parcela e total; financeira usa
  o pago acumulado sobre o contrato da parcela). (3) Botão "Realizar medição" no popup: abre a empreita
  completa com a medição já aberta (query realizarMedicao=1: Realizar medição trava, Realizar pagamento libera).
  (4) Todo "Realizar medição" agora preenche a medição atual = acumulada (só onde estava vazia) e, ao confirmar o
  input, um alerta avisa quando a atual fica MENOR que a acumulada (o valor é mantido para o usuário corrigir).
  Ainda não publicado.
- 26/09/2026 — **Lote: lista amarela, botão Excluir nos popups, alinhamento e cores** (pedidos do Lucas). (1) Lista de
  empreitas da obra: linha AMARELA (mesmo amarelo de "Medição em andamento") para empreita com medição em aberto =
  pagamento_iniciado e medicao_habilitada = false (Realizar medição clicado, pagamento ainda não realizado). (2) Botão
  "Excluir" (à esquerda do rodapé, só editando; sempre com caixa de confirmação antes) nos popups de edição de Pagamento
  e Recebimento (em todas as telas que os usam: pagamentos/recebimentos da obra e geral, dashboard, EAP, mapas,
  empreitas, popup de pagamentos vinculados, Pagamentos registrados) e no popup de Diárias. Quem hospeda apaga e
  atualiza a lista (AcoesPagamento/AcoesRecebimento.excluirDoEditor). Mapa e Empreita são páginas (não popups de
  edição) — sem botão novo. (3) Pagamentos registrados: barra financeira acumulada agora VERDE (a amarela segue sendo o
  avanço); linhas das medições alinhadas com as do Valor pago (Empreiteiro com Empreiteiro, Reserva com Reserva, Total
  com Total — espaçadores nas linhas Contrato e Saldo empreita); Nº, Beneficiado, Datas e Ações centralizados na
  vertical. (4) Popup da empreita completa de uma medição: ganhou "Qtde. contrat." (coluna Medição de contrato) e
  "Saldo disp." (coluna Contrato) nas mesmas posições da aba, e as cores das linhas (verde 100%, amarelo em andamento,
  azul com pagamento, vermelho nos saldos/a pagar negativos) com as mesmas regras (classificarSituacaoMedicao). A
  quantidade contratada e o saldo disp. vêm do estado ATUAL da empreita (o retrato não os guarda). Ainda não publicado.
- 26/09/2026 — **RDO: clima em tabela, Etapas/Pendências dentro de Tarefas, mão de obra em dois
  passos** (pedidos do Lucas; 1 migration). (1) "Condições climáticas" virou uma tabela: linhas =
  Claro/Nublado/Chuva/Temporal/Impraticável, colunas = Manhã/Tarde/Noite, um rádio por célula — só uma
  condição marcada por turno (mesmos 3 campos de sempre, `clima_manha/tarde/noite`, só mudou a
  exibição). (2) Removido "Impacto no cronograma" da tela (o campo do banco continua existindo,
  nullable, só não é mais preenchido — as Ocorrências já cobrem isso). (3) **Maior mudança**: as seções
  separadas "Etapas" e "Pendências" deixaram de existir — cada linha de "Tarefas realizadas" agora tem
  também "Concluída" e "Vincular à EAP" (era da Etapa) e, opcional, "Gerou pendência" com descrição
  própria (some, responsável, prazo, status — era da seção Pendências); "Nome da etapa" virou
  "Descrição do serviço" e é a MESMA descrição da tarefa (o campo "O que foi executado nesta frente"
  sumiu, a descrição faz as duas coisas). No servidor as três continuam sendo tabelas separadas
  (`rdo_tarefas`/`rdo_etapas`/`rdo_pendencias`, sem vínculo entre si) — o front desmembra 1 linha da
  tela em até 3 registros ao salvar (`Rdo.desmembrarTarefas`); a Ficha de Verificação de Serviço
  continua funcionando do mesmo jeito (o vínculo com a EAP + o texto viram `rdo_etapas`, que é o que ela
  observa). Migration `2026_09_26_020000_amplia_nome_da_etapa_do_rdo` alarga `rdo_etapas.nome` de
  VARCHAR(150) pra TEXT — a descrição da tarefa é prosa livre e passou a entrar ali também. **RDOs
  salvos ANTES desta mudança** são reconstruídos por POSIÇÃO ao editar (a etapa/pendência da mesma
  posição da tarefa vira uma linha só) — funciona bem quando as três seções tinham a mesma contagem
  (o normal), mas não é garantia para um RDO antigo com contagens bem diferentes; nenhum dado se perde
  (etapa/pendência "sobrando" vira uma linha própria), só pode ficar reagrupado errado num caso raro.
  (4) Removida a seção "Responsáveis presentes" (tabela `rdo_responsaveis_presentes` no banco não foi
  apagada, só para de receber dados novos). (5) Mão de obra: escolher um profissional no campo de busca
  NÃO adiciona mais direto — só preenche o campo; um botão novo "+ Adicionar profissional" ao lado de
  "+ Lançamento manual (sem cadastro)" faz a adição de fato e limpa o campo depois. (6) Varredura visual:
  padding maior em input/select/textarea (estava cortando texto em cima/embaixo), padding-direito no
  select pra sobrar espaço da seta, checkbox/rádio sem herdar o padding do campo de texto (área de
  clique ficava maior que o quadrado visível). Testado em desktop e no acordeão do celular (390px), sem
  estouro horizontal em nenhuma seção. Ainda não publicado.
- 26/09/2026 — **RDO: cabeçalho automático da obra, tarefa gera várias
  pendências/ocorrências, equipamentos próprios x alugados; novo módulo "Contratos de
  equipamentos"** (pedidos do Lucas; 5 migrations). (1) O cabeçalho técnico do RDO
  (contrato, responsável técnico, CREA, ART, início, prazo, contratante) deixou de ser
  digitado dentro do RDO — `obras` ganhou 4 campos novos (`numero_contrato`,
  `responsavel_tecnico`, `crea`, `art`; início/prazo/contratante reaproveitam
  `data_base`/`periodo`/`cliente`, que a obra já tinha), editáveis no popup "Editar
  obra". O painel "Cabeçalho da obra" do RDO virou só leitura; a tabela `rdo_obra_dados`
  e o `RdoObraDadosController` ficaram sem uso pra GRAVAR (GET continua existindo, agora
  devolvendo os dados calculados da obra — é o que `rdo-imprimir.ts` ainda consome).
  (2) Cada "Tarefa realizada" agora aceita QUANTAS pendências e ocorrências forem
  necessárias (antes: no máx. 1 pendência por tarefa, e Ocorrências era uma seção solta,
  sem vínculo nenhum com tarefa) — `rdo_pendencias`/`rdo_ocorrencias` ganharam
  `tarefa_id` (nullable, mesmo padrão de `rdo_fotos.tarefa_id`). RDOs salvos ANTES
  desta mudança (sem `tarefa_id`) continuam sendo reconciliados por POSIÇÃO ao editar,
  mesma lógica/limitação já aceita pra Etapas. (3) "Equipamentos" virou duas colunas,
  mesmo layout de mão de obra interna/externa: **Equipamentos próprios** (nome +
  quantidade, como sempre foi) e **Equipamentos alugados** (nome, fornecedor, contrato,
  quantidade) — `rdo_equipamentos` ganhou `categoria`, `contrato_equipamento_item_id`
  e um SNAPSHOT em texto (`fornecedor`/`contrato_referencia`, mesmo padrão de
  `profissional_nome` na mão de obra): escolher um item de um contrato ATIVO preenche os
  dois sozinho (não digitado, não muda se o contrato for renovado depois); sem contrato
  cadastrado ainda, dá pra lançar à mão. (4) **Novo módulo "Contratos de equipamentos"**
  (aba nova na obra + página do contrato, permissão `contratos_equipamentos`): lista com
  Nº/Nome/Fornecedor/Equipamentos atuais/Início/Vencimento/Renovações/Valor atual/Status.
  Um contrato tem data de entrega (início do 1º período) e período (dias corridos OU
  úteis, só desconta sáb/dom — sem calendário de feriados, o sistema não tem um em
  lugar nenhum); o vencimento é calculado sozinho. Criar um contrato gera um Pagamento
  (`origem_tipo = 'contrato_equipamento'`) com os itens do contrato e um lembrete na
  Agenda no dia útil ANTERIOR ao vencimento. **Renovar** pode ser parcial (alguns itens
  voltam pro fornecedor — `devolvido_em` —, outros continuam, podendo mudar
  quantidade/valor) e por um período diferente do inicial, sempre contado a partir do
  vencimento ANTERIOR (nunca da data de entrega); gera um Pagamento novo só com os itens
  que continuam e troca o lembrete da Agenda pelo do vencimento novo. Devolver TODOS os
  itens numa renovação encerra o contrato (`encerrado_em`, sem lembrete). Status
  ativo/vencido/encerrado é sempre CALCULADO na leitura (nunca gravado): vencido = ainda
  tem item com o cliente e o prazo passou; encerrado = todos os itens já voltaram.
  Decisão minha, não confirmada com o Lucas: a frase dele sobre o status ficou cortada
  no meio ("contratos que ainda tem equipamentos que n...") — assumi esse modelo de 3
  estados por ser o mais completo e coerente com o resto do pedido; se não for isso,
  avisar antes de mexer de novo aqui. Tudo testado de ponta a ponta (Puppeteer + chamadas
  diretas à API): criação, renovação parcial com pagamento/vencimento/lembrete corretos,
  renovação total encerrando o contrato, tentativa de renovar contrato já encerrado (422),
  e o ciclo completo dos equipamentos alugados no RDO (vinculado e manual, salvando e
  reabrindo). Zero erros de console. Ainda não publicado — falta avisar a Onilia sobre as
  mudanças no RDO (autonomia combinada com ela) e perguntar ao Lucas sobre dump/commit/push.
- 26/09/2026 (2º lote do dia) — **RDO: clima invertido com símbolos, mão de obra
  sem campo de busca externo, equipamentos alugados nascendo do contrato, observação
  por tarefa, pendências/ocorrências gerais do dia** (pedidos do Lucas; 1 migration).
  (1) Tabela de clima invertida: linhas = turnos (Manhã/Tarde/Noite), colunas = climas
  com símbolo (☀️ Claro, ⛅ Nublado, 🌧️ Chuva, ⛈️ Temporal). "Impraticável" saiu do
  clima e virou uma coluna própria, "Condições de trabalho" (menu suspenso
  praticável/impraticável, por turno) — `rdo_registros` ganhou
  `condicao_manha/tarde/noite`. (2) Mão de obra interna/externa: o campo de busca
  solto acima da lista (que ficava sendo limpo a cada "Adicionar") saiu — "+ Adicionar
  profissional" agora cria a linha JÁ com um `<select>` do cadastro dentro dela
  (`origem: 'cadastro'`, campo só de front, não vai pro banco); escolher no select
  preenche nome/função. "+ Lançamento manual" continua igual. (3) Equipamentos
  alugados: um RDO novo já nasce com uma linha por item ativo de cada contrato não
  encerrado — o usuário só marca "Na obra" (`presente`, novo boolean em
  `rdo_equipamentos`) sim/não; só dá pra ADICIONAR manualmente equipamento SEM
  contrato. "Fornecedor" saiu da tabela (`rdo_equipamentos.fornecedor` removida);
  ficaram três colunas na ordem pedida — Contrato (sempre só leitura; vazio quando não
  há contrato), Equipamento (só leitura se vinculado, editável se manual) e
  Quantidade. (4) Cada tarefa ganhou um campo "Observações" próprio
  (`rdo_tarefas.observacoes`), diferente da "Descrição do serviço". (5) A seção
  "Observações internas" (comentários, com "visível para o contratante") foi removida
  da tela — tabela `rdo_comentarios_internos` não apagada, só parou de receber dados
  novos. "Observações gerais do dia" (campo que já existia) mudou de lugar: saiu de
  dentro da seção removida e foi para "Fotos e vídeos do dia", que também ganhou
  Pendências e Ocorrências GERAIS (sem tarefa — `tarefa_id` nulo, o mesmo campo já
  usado desde o lote anterior do dia para vincular a uma tarefa quando houver uma).
  Testado de ponta a ponta via Puppeteer: clima+condição salvando e reabrindo,
  mão de obra pelo select (com e sem profissional cadastrado), equipamento do
  contrato nascendo sozinho + manual sem contrato, observação da tarefa, pendência/
  ocorrência/observação gerais indo pro lugar certo (não presas a nenhuma tarefa) e
  sobrevivendo à reabertura. Zero erros de console. Ainda não publicado.
- 26/09/2026 (3º lote do dia) — **Contratos de equipamentos: visual igual ao
  resto do sistema, edição em popup, coluna "Total pago" com popup de
  pagamentos (igual ao Mapa), etapa da EAP por item, colunas empilhadas**
  (pedidos do Lucas, depois de ele testar a primeira versão — "fica parecendo
  que a tabela não faz parte do sistema"; 1 migration). (1) A lista da obra
  parou de usar CSS próprio e passou a usar exatamente as mesmas classes
  globais de Mapas/Pagamentos (`.painel`, tabela padrão, `trenaRedimensionarColunas`,
  `.linha-clicavel`, `.etiqueta-status`) — visualmente igual às outras listas
  agora. (2) Criar/editar/renovar o contrato saiu de uma página própria
  (`/contratos-equipamentos/:id`, removida) e virou um popup
  (`EditarContratoEquipamentoModal`, mesmo padrão do `CadastroObraModal`:
  `contrato() === null` é criação). (3) A tabela de itens (na criação e dentro
  do popup) ganhou cabeçalho de colunas de verdade (Equipamento/Etapa da
  EAP/Qtde./Valor unitário) e cada item pode ser ligado a uma etapa da EAP
  (`contrato_equipamento_itens.eap_item_id`, novo — o vínculo passa pro item
  do Pagamento gerado, igual já acontece em Pagamentos/Mapa/Empreita) — o
  campo pode ser alterado numa renovação (mandar `null` limpa o vínculo,
  omitir o campo mantém o que já tinha). (4) A coluna "Valor atual" virou
  **"Total pago"**: clicar nela abre o MESMO popup de pagamentos vinculados
  que o Mapa já tem, com Confirmar/Editar/Excluir por linha (reaproveitado
  `AcoesPagamento`/`EditarPagamentoModal` de `shared/pagamentos-vinculados-popup`,
  nada novo escrito). Achado nesse reaproveitamento: `PagamentoController`
  validava `origem_tipo` com uma lista fixa que não incluía
  `contrato_equipamento` — editar ou confirmar um pagamento de contrato de
  equipamento pelo popup dava 422; corrigido incluindo o valor na lista.
  (5) "Equipamentos atuais" e as datas (Início/Vencimento, agora uma coluna só
  chamada "Datas") ficam empilhados (uma linha por item/data), não mais
  juntos separados por vírgula. Testado de ponta a ponta via Puppeteer e
  chamadas diretas à API: criar com item ligado à EAP, vínculo sobrevivendo a
  duas renovações (mantendo e depois limpando), "Total pago" abrindo o
  contrato certo, e o PUT de edição de pagamento (mesmo payload que o popup
  monta) devolvendo 200 em vez do 422 antigo. **Achado durante o teste, sem
  relação com o código**: a obra de teste já tinha um contrato de verdade
  ("0015058", fornecedor "AF LOCAÇÕES", criado às 20:51) — parece ser do
  próprio Lucas testando a tela antes de mandar o feedback; não foi tocado.
  Ainda não publicado.
- 27/09/2026 — **Cabeçalho fixo em toda lista, frete no contrato de
  equipamento, fornecedor com busca** (3 dos 17 itens de um lote grande que o
  Lucas pediu nesse dia; 1 migration). (1) Cabeçalho de tabela fixo ao rolar
  (`.cabecalho-fixo`, que só a Empreita usava) virou automático pra QUALQUER
  tabela com `trenaRedimensionarColunas` — ou seja, praticamente toda
  lista/tabela de verdade do sistema ganhou de graça, sem precisar pedir por
  tela; desligado na impressão (cada página do PDF já repete o cabeçalho
  sozinha). (2) Contrato de equipamento ganhou frete (só na entrega inicial,
  não em renovação), com a MESMA decisão que o Mapa já tem: "lançar como
  item" (linha própria no pagamento, com etapa da EAP escolhida pra ela) ou
  embutido (distribuído proporcionalmente no valor de cada equipamento, sem
  etapa própria). (3) O campo Fornecedor do contrato de equipamento virou
  busca com sugestão do cadastro de Fornecedores (aceita texto livre, mesmo
  padrão já usado no Fornecedor do Pagamento). Testado via API: frete
  embutido distribuindo certo (`100+300` + frete `100` → `125`/`375`),
  frete como item virando linha própria com a etapa certa, e o `th` da
  tabela saindo `position: sticky` de verdade. Ainda não publicado.

  **Pendente do mesmo lote (14 itens, ainda não implementados — Lucas já
  decidiu 3 pontos-chave, registrados aqui pra não perder):** varredura
  visual do RDO (campos com texto cortado); mensagem pronta (copiar pra
  WhatsApp) de solicitação de pagamento de renovação de contrato de
  equipamento e de pagamento de mapa; padronizar nome de arquivo dos PDFs
  exportados; **modelos de contrato de empreita e de contrato de
  obra/proposta** — decidido: múltiplos modelos cadastráveis (não um só fixo),
  cada um editável, e o usuário escolhe qual usar ao gerar o contrato de uma
  empreita/obra específica (mesma ideia dos modelos de FVS); coluna de status
  do contrato na lista de Empreitas; anexo de contrato assinado + marcar
  "assinado" na Empreita; **notificações automáticas** — decidido: sempre
  como compromisso na Agenda (mesmo mecanismo do vencimento do contrato de
  equipamento) — pra quando a medição física do empreiteiro chegar em 80%
  (lembrete de gerar contrato) e enquanto um contrato gerado não for marcado
  como assinado; página geral de Contratos de equipamentos (todas as obras,
  com coluna Obra — mesma relação que "Mapas" geral tem com "MapasObra" por
  obra); ajustar layout da página geral de Empreitas pra bater com o da aba
  Empreitas da obra; e **navegação da obra** — decidido: ao clicar numa obra,
  em vez de abrir a EAP direto, mostra uma tela com uma GRADE de botões (uma
  por aba) pra escolher; cada aba ganha um botão "← Voltar" pra essa tela
  (as abas viraram muitas e estavam difíceis de navegar, segundo o Lucas).
- 27/09/2026 (correção no mesmo dia) — **Cabeçalho fixo não funcionava de
  verdade; achado e corrigido um bug real de lembrete duplicado na Agenda**.
  O Lucas testou o cabeçalho fixo do item anterior e não viu efeito nenhum —
  correto: a primeira versão só conferia se o CSS `position: sticky` tinha
  sido aplicado, sem checar se ele realmente colava na tela ao rolar. Dois
  problemas de verdade: (1) `.envoltoria` (usada por quase toda lista) tem
  `overflow-x: auto` — por regra do CSS, isso faz o navegador tratar o
  `overflow-y` como `auto` também, mesmo sem pedir, e como essa div nunca
  tem altura limitada, ela vira um "contêiner de rolagem" que nunca rola de
  verdade — quebra o sticky (ele gruda relativo a essa div, que nunca sai do
  lugar). (2) A correção usa `.envoltoria-fixa`, que a Empreita já tinha
  (rolagem própria, com altura limitada) — mas o cálculo de altura dela
  dependia de uma variável (`--barra-fixa-fim`) que só a Empreita
  preenchia; nas outras ~20 telas ela caía num valor fixo (só a barra do
  topo, 48px) que não considerava o título/filtros de cada tela, sobrando
  espaço demais e cortando errado. Troquei `class="envoltoria"` por
  `class="envoltoria-fixa"` em ~20 telas de lista, e criei
  `ObservadorEnvoltoriaFixa` (`shared/envoltoria-fixa/`) — inicia UMA vez no
  `AppShell` (raiz de toda tela), observa o documento inteiro por qualquer
  `.envoltoria-fixa` que apareça e ajusta a altura dela sozinho, pela
  posição real na tela — nenhuma tela precisou de código novo além da troca
  de classe. Testado com rolagem de mouse de verdade (não só computed
  style): o cabeçalho fica parado enquanto as linhas passam por baixo dele.

  **De quebra**, ao investigar isso, apareceram ~15 registros de teste
  (pagamentos "ZZ..." órfãos de contratos de equipamento que eu já tinha
  apagado, e 3 lembretes "ZZ..." na Agenda) que minhas limpezas anteriores
  não tinham pego — apagados agora. E um **bug de verdade, sem relação com
  hoje**: renovar um contrato de equipamento criava um lembrete novo na
  Agenda sem apagar o antigo — o contrato de teste do próprio Lucas
  ("00045476") já tinha 2 lembretes de vencimento por causa disso.
  Corrigido (`criarLembrete` agora apaga o lembrete anterior do mesmo
  contrato antes de criar o novo) e o duplicado dele foi removido — o
  contrato dele e o pagamento continuam intactos, só o lembrete extra saiu.
  Ainda não publicado.
- 27/09/2026 (continuação do lote grande) — **RDO com texto cortado
  corrigido, mensagem de solicitação de pagamento, nome de PDF padronizado
  em todo o sistema**. (1) RDO: a causa do texto cortado nos campos era o
  `height: 20px` global de `input, select` (`_base.scss`, pensado pras
  tabelas densas do resto do sistema) continuando valendo por cima do
  padding maior do RDO, porque `rdo.scss`/`rdo-lista.scss` nunca declaravam
  `height` próprio — `height: auto` nos dois resolve. A "cara diferente" do
  RDO (cartão + acordeão, rem em vez de mono ALL CAPS) parece intencional
  (documentada no topo dos dois arquivos) — não mexida, fica pra confirmar
  com o Lucas se ele quiser unificar isso também. (2) Mensagem "Copiar
  solicitação de pagamento" (📋) — a primeira versão (genérica, em cima da
  `descricao` do pagamento, no popup de pagamentos vinculados) foi rejeitada
  pelo Lucas depois de ver o resultado: ele queria dois formatos exatos, um
  pro Mapa e outro pro Contrato de equipamento, com o PIX escolhido OU
  digitado só na hora de gerar a mensagem — nunca gravado no cadastro nem no
  mapa/contrato. Refeito do zero: `shared/dados-pagamento/` (o serviço lê o
  `dadosRecebimento` que já existe nos cadastros de Fornecedores e
  Profissionais; o popup `DadosPagamentoModal` mostra um campo de PIX por
  fornecedor envolvido, sugerindo o que já está cadastrado e aceitando texto
  livre quando não tem) + um montador de mensagem por tela:
  `features/mapa/mapa-mensagem-pagamento.ts` (botão "📋 Solicitar pagamento"
  no editor do Mapa — resumo por fornecedor vencedor com o cenário indicado,
  o mesmo dado de "Detalhe por fornecedor") e
  `features/contratos-equipamentos/contratos-equipamentos-mensagem.ts`
  (botão 📋 na lista de contratos da obra, ao lado do ✖ excluir — aluguel
  atual, equipamentos ainda com o cliente e todo o histórico de pagamentos
  já gerados por aquele contrato, com o mais recente marcado "(HOJE)").
  Testado via Puppeteer nos dois formatos com dados reais da obra de teste
  (o mesmo mapa e o mesmo contrato "00045476"/JAPÃO DA CONSTRUÇÃO que o
  Lucas usou de exemplo) — mensagem batendo com o formato pedido, PIX digitado
  chegando certo em cada bloco, zero erro de console. (3) Nome de
  arquivo de PDF virou `Tipo-identificador1-identificador2....pdf` em vez do
  UUID interno cru (ex.: `mapa-c8f8e5c9-...-...pdf` virou
  `Mapa-12-BetoneiraETc.pdf`) — `shared/pdf-nome-arquivo.ts`, aplicado em
  Mapa, EAP, Empreita, Medição, Cronograma de desembolso e Relatório; RDO já
  tinha um nome legível (`RDO-003.pdf`) e não foi mexido. Testado via
  Puppeteer (compilação limpa, popup com o botão novo). Ainda não publicado.
- 28/09/2026 (continuação do lote grande) — **Página geral de Contratos de
  equipamentos e status de contrato na Empreita** (2 itens da lista de 17 do
  Lucas). (1) `GET /api/contratos-equipamentos` (`ContratoEquipamentoController::indexGeral`,
  mesmo padrão de `MapaController::index`) cruza todas as obras, com
  `obra_nome` achatado; tela nova `contratos-equipamentos-geral.ts/html`
  (rota `/contratos-equipamentos`, menu próprio) reaproveita a mesma tabela/
  ações da aba da obra (📋 solicitar pagamento, ✖ excluir, popup de
  pagamentos vinculados), com uma coluna "Obra" a mais; criar contrato novo
  continua só na aba da obra (o formulário precisa do contexto dela), editar
  busca a EAP certa na hora (por `obra_id` do próprio contrato, com cache
  simples em memória pra não repetir a chamada). (2) Empreita ganhou
  "Contrato assinado": `contrato_assinado`/`contrato_assinado_em` (marcado
  manualmente, endpoint próprio `PUT /empreitas/{id}/contrato-assinado`, fora
  do PUT genérico do cabeçalho porque tem efeito colateral — ver abaixo);
  anexar o arquivo do contrato usa o MESMO mecanismo já existente de
  Pagamento/Recebimento (`Arquivo` com `origem_tipo='empreita'`,
  `AnexoController::indexEmpreita/storeEmpreita`, componente
  `AnexosLancamento` com um terceiro `origemTipo`), sem tabela nova; coluna
  "Status" (Assinado/Pendente) na lista da obra.

  **Bug achado pelo Lucas na primeira versão**: a 1ª tentativa colocava o
  status+anexos num painel FIXO acima da tabela de serviços — como
  `AnexosLancamento` carrega as tags de forma assíncrona, a altura desse
  painel só se estabiliza depois, e a tabela de serviços (`.envoltoria-fixa`,
  altura calculada por `calc(100vh - ...)`) acabava sobrando quase sem
  espaço nenhum, tornando os serviços ilegíveis. Corrigido: o status virou
  só mais uma etiqueta+botão na MESMA linha de botões que já existia
  (`Confirmada`/`Reabrir empreita` etc.), e assinatura+anexos foram pro
  mesmo padrão de popup (`.modal`) já usado em outros lugares da tela
  (ex.: "O que mostrar" do PDF) — não ocupa espaço nenhum na tela até o
  usuário clicar em "📎 Contrato". Confirmado com print antes/depois (a
  tabela voltou a mostrar várias linhas normalmente). Duas notificações
  automáticas na Agenda, pedidas junto: enquanto tiver um contrato anexado e
  `contrato_assinado` continuar `false`, existe um lembrete de "assinatura
  pendente" (criado ao anexar, apagado ao marcar assinado, recriado se
  desmarcar de novo com o anexo ainda lá — `EmpreitaController::garantirLembreteContratoPendente`);

  **Segundo bug achado pelo Lucas, ainda na mesma tabela**: mesmo depois do
  popup, a tabela de serviços continuava aparecendo pequena. 1ª tentativa de
  correção (errada, revertida): tirei `.envoltoria-fixa`/`rodape-fixo` dessa
  tabela achando que ele queria rolagem de página inteira — o Lucas corrigiu
  ("não pedi pra tirar a rolagem, pedi pra aumentar a envoltória"): ele
  queria a caixinha de volta, só maior. Causa real, essa sim confirmada por
  medição (`getBoundingClientRect`): a nova etiqueta+botão de contrato,
  posta na mesma linha de botões já lotada (`Adicionar serviço` .. `Baixar
  PDF`/`Exportar Excel`), estourava a largura e forçava aquela linha a
  quebrar pra uma 2ª linha — isso engorda a `trenaBarraFixa` (mede a própria
  altura da barra) e some `--barra-fixa-fim`, que é exatamente o que
  `.envoltoria-fixa` usa pra saber quanto sobra de tela; menos sobra, menos
  altura pra tabela. Corrigido de vez: o botão de contrato saiu da linha
  principal de botões e foi pra linha dos atalhos de teclado (que tinha
  espaço de sobra), sem tirar `.envoltoria-fixa`/`rodape-fixo` de lugar
  nenhum. Lição: ao adicionar QUALQUER botão numa barra de ferramentas que
  já é `trenaBarraFixa`, checar se ela ainda cabe numa linha só — cada linha
  a mais rouba altura de toda tabela abaixo, em qualquer tela que use esse
  mecanismo.

  E um aviso ÚNICO quando a medição física (ponderada por `contrato_emp` de
  cada serviço, mesma conta de `pctFisicoPorEmpreita` no front) cruza 80%,
  guardado por `medicao80_alertada` pra não repetir a cada medição nova
  depois da primeira vez. 2 migrations. Testado via API + Puppeteer com uma
  empreita descartável: anexo criando o lembrete, marcar/desmarcar assinado
  criando e apagando o lembrete certo, medição de 85% dessa disparando o
  aviso uma vez só — limpeza completa depois (achado de novo, mesma lição de
  sempre: excluir a Empreita NÃO apaga sozinho o anexo nem o evento da
  Agenda vinculados a ela, tive que apagar os dois à parte). Ainda não
  publicado.

  **Terceiro pedido, ainda na mesma tabela (28/09/2026)**: depois da correção
  acima o Lucas pediu mais — não só devolver a caixinha, mas ela "pegando uma
  tela inteira": ao rolar a PÁGINA pra baixo, cabeçalho da empreita e barra
  de botões deveriam sumir de vez (saindo de tela), sobrando só a tabela
  ocupando quase a janela toda, com rolagem PRÓPRIA dela (cabeçalho e rodapé
  da tabela grudados no topo/base da caixa, não da página). Trocado
  `.envoltoria-fixa` (altura = o que sobra da tela abaixo de uma barra fixa)
  por uma classe nova só da Empreita, `.envoltoria-tela-toda`: tirei
  `trenaBarraFixa` da barra de botões (ela deixou de ser sticky, agora rola
  normal com a página) e a caixa da tabela virou ela mesma `position: sticky`
  (gruda embaixo da barra de topo assim que a rolagem chega lá), com altura
  fixa em "quase a tela inteira" (só descontando a barra de topo).

  Pegadinha de CSS chata nessa: um elemento `sticky` nunca consegue passar do
  fim da PRÓPRIA caixa-pai — e como esta tabela é a última coisa grande da
  página, o "fim de rolagem" do navegador é definido pelo padding de baixo
  do `.conteudo` (24px, fora da caixa-pai). Descontar só 12px no cálculo da
  altura (o valor usado no `.envoltoria-fixa`) faz a caixa travar uns pixels
  ACIMA do lugar certo na rolagem máxima — escondida atrás da barra de topo
  fixa, que tem z-index maior (bug só visível rolando até o fim de verdade,
  não em screenshot do topo da tela). Corrigido descontando os 24px de
  verdade no `max-height` e zerando a margem de baixo da caixa (a margem
  padrão de `.painel` também "conta" contra essa mesma conta de sobra de
  rolagem). Confirmado por medição pixel a pixel (`getBoundingClientRect` em
  vários pontos da rolagem, não só no início e no fim) e por captura de tela
  em 3 momentos (topo, rolado até o fim, rolado por dentro da caixa até o
  rodapé) — cabeçalho da tabela sempre colado exatamente na barra de topo,
  sem sobreposição, sem espaço sobrando. Ainda não publicado.

- **28/09/2026 — Varredura de identidade visual (ComTrena).** O Lucas anexou
  `ComTrena_Identidade_Visual/` (manual de identidade v1.0 + logos/símbolos
  oficiais em SVG/PNG) e pediu pra varrer o sistema inteiro procurando o que
  estava fora do padrão e corrigir. Ainda não publicado (fica pendente, a
  pedido dele, até confirmar visualmente).

  **Achados e correções**:
  1. **Cores** (`frontend/src/styles/_tokens.scss`) — as 5 cores oficiais
     (`--cor-primaria` #1B3A4B, `--cor-primaria-escura` #12262F,
     `--cor-primaria-clara` #DDE7EA, `--cor-aco` #4A7A94, `--cor-destaque`
     #E8A33D) já estavam certas. O que estava errado eram os tons NEUTROS
     (fundo da página, texto padrão, bordas, zebra de tabela): vinham de uma
     paleta anterior, "ObraCerta" (cinzas meio esverdeados, o próprio
     comentário do arquivo já dizia isso), sem nenhuma relação com o
     ComTrena. Recalculados a partir da própria `--cor-primaria-clara`
     (mesmo matiz, só variando luminosidade) — `--cor-fundo`/`--cor-texto`
     agora reaproveitam direto `--cor-primaria-clara`/`--cor-primaria`,
     `--cor-texto-suave` reaproveita `--cor-aco` (o manual usa essa cor
     tanto pra "detalhes" quanto pra legendas — não tem um cinza neutro à
     parte na paleta oficial). `--cor-sucesso`/`--cor-perigo`/`--cor-alerta`
     ficaram de propósito FORA da troca — o manual não cobre cores de
     status, e verde/vermelho de sucesso/erro são convenção universal de
     UI, brand-agnóstica. Como esses tokens já cascateiam pra ~166+
     referências em toda a tela, um arquivo só resolveu o app inteiro —
     confirmado por captura de tela (login, menu, dashboard, lista de
     obras) e nenhum erro de console.
  2. **Nome errado em todo canto**: "AppTrena" (às vezes "APPTRENA") em ~25
     arquivos — barra lateral, telas de login/cadastro, cabeçalho de PDF
     (fallback sem logo cadastrada), rodapé de todos os PDFs (Mapa, EAP,
     Empreita, Medição, Cronograma, Relatórios, RDO), a página pública do
     RDO que o contratante recebe por link, o e-mail de aviso de RDO novo
     (`RdoDisponivel`/`rdo-disponivel.blade.php` — inclusive no ASSUNTO do
     e-mail) e até o `APP_NAME` do Laravel (`.env.example` estava
     `APP_NAME=Laravel`, o padrão nunca trocado — vira o nome do
     remetente dos e-mails). Tudo trocado pra "ComTrena". **Pendência que
     não dá pra resolver por aqui**: o `.env` local já tem
     `APP_NAME=ControleObra` (outro nome antigo, diferente até de
     "AppTrena") e o `.env` de produção no VPS provavelmente tem
     `APP_NAME=Laravel` ainda — nenhum dos dois é versionado, o Lucas
     precisa trocar à mão se quiser (`APP_NAME=ComTrena` em cada um).
  3. **Nenhuma logo de verdade em lugar nenhum**: login, cadastro, barra
     lateral e a "assinatura" de rodapé do Mapa usavam um quadrado
     desenhado em CSS (borda âmbar, miolo âmbar) no lugar de logo — sem
     nenhuma imagem de marca de verdade no repositório até este pedido.
     Copiados os SVG oficiais do manual pra `frontend/public/marca/`
     (logomarca horizontal em 3 versões de fundo + símbolo isolado em 2) e
     trocado em: barra lateral (símbolo, fundo escuro — E também passou a
     aparecer com a barra recolhida, que antes escondia TUDO, sem logo
     nenhuma), tela de login (logomarca completa dos dois lados), tela de
     cadastro, assinatura do rodapé do Mapa (símbolo pequeno) e a página
     pública do RDO do contratante. Favicon trocado também — o
     `favicon.ico` antigo (13/08, sem relação com a marca) saiu. Primeira
     versão foi um PNG avulso (não tinha ferramenta de conversão pra .ico
     nem essa pasta ainda existia); **28/09/2026, o Lucas gerou e anexou o
     pacote oficial de favicons** (`ComTrena_Identidade_Visual/06_Favicons/`,
     com `COMO-USAR.txt` próprio) — trocado pro pacote de verdade:
     `favicon.ico` (multi-resolução, 16/32px com o traço do T reforçado pra
     continuar legível pequeno) + `favicon.svg` (nítido em qualquer
     tamanho) + `apple-touch-icon.png`, instalados em `frontend/public/`
     exatamente como o `COMO-USAR.txt` pede.
     **28/09/2026, pedido seguinte do Lucas**: no menu lateral, a logomarca
     ISOLADA (só o símbolo) virou a logomarca COMPLETA (símbolo + "COMTRENA"
     + "CONTROLE DE OBRAS") quando o menu está aberto — tem espaço de sobra
     na largura de 224px. Com o menu recolhido (60px) continua só o
     símbolo, porque a versão horizontal não cabe; antes das duas versões
     coexistirem, era só um `<img>` com o símbolo + `<span>` de texto ao
     lado, viraram dois `<img>` (`.logomarca-marca` / `.simbolo-marca`),
     um escondendo o outro conforme o estado do menu.
  4. **Tipografia**: `--fonte-titulo`/`--fonte-mono` continuam só Inter na
     TELA do app — essa é uma decisão de 19/09/2026 já deliberada ("uma
     fonte só"), e o manual, lido com calma, não contradiz isso: a seção de
     tipografia dele reserva Michroma pra "títulos de documentos, rótulos"
     (ou seja, os PDFs — o corpo de relatório/diário/proposta que ele lista
     continua Inter). Criado o token `--fonte-documento-titulo: "Michroma",
     ...`, carregado via Google Fonts em `index.html`. **28/09/2026,
     aplicado a pedido do Lucas**: em vez de mexer nos 7 modelos de PDF
     igual, cada um tem seu próprio elemento de "título do documento", sem
     uma classe em comum — achei os 4 pontos de verdade e apliquei em cada
     um (`font-family` + `text-transform: uppercase` + `letter-spacing`,
     igual o manual pede): `.subtitulo` do `cabecalho-impressao`
     (compartilhado por EAP/Empreita/Cronograma/Relatórios/Medição — é o
     texto tipo "EAP — Estrutura Analítica do Projeto" embaixo do nome da
     empresa), `.logo-texto` do `mapa-imprimir` ("Mapa de Cotação", que
     NÃO usa o `cabecalho-impressao` compartilhado — tem cabeçalho
     próprio), `.titulo-medicao` do `medicao-imprimir` ("Medição nº X" —
     a etiqueta de status dentro do título ficou de fora, de propósito,
     continua na fonte normal, não é texto de título) e
     `.documento-titulo` do `rdo-imprimir` ("Relatório Diário de Obra" —
     esse já estava em caixa alta com espaçamento certo, só faltava a
     fonte). O nome da EMPRESA cliente (`.logo-texto` do
     `cabecalho-impressao`, diferente do `.logo-texto` do mapa) e o nome
     da obra (`<h1>` do `relatorios-imprimir`) ficaram de fora de
     propósito — são dado do cliente, não rótulo do ComTrena. Confirmado
     por captura de tela do PDF da EAP: título em caixa alta, fonte
     display, cor `--cor-aco`, bem diferente do nome da empresa ao lado
     (que continua Inter). Rótulos pequenos de campo (tipo "OBRA"/"DATA"
     dentro dos formulários dos PDFs) não foram tocados — o manual também
     pede Michroma neles, mas são muitos elementos espalhados sem padrão
     em comum; fica como possível próximo passo, não pedido ainda.
  5. **Cores fora do padrão "escondidas" em fallback**: alguns arquivos
     (`publico-rdo.scss`, `rdo-imprimir.scss`, `status.html`, o e-mail de
     RDO) tinham a cor antiga HARDCODED como valor de fallback dentro de
     `var(--cor-x, #hex)`, ou (no caso do e-mail, que não pode usar CSS var
     nenhuma) direto no HTML — corrigidos pro valor novo também, senão
     ficariam divergentes do resto do sistema mesmo com os tokens certos.
  6. `frontend/public/status.html` (painel interno de andamento do
     desenvolvimento, não é tela do sistema) recebeu o mesmo ajuste de cor
     + nome, por consistência, mas não mexi na fonte dele (usa Space
     Grotesk/IBM Plex Mono, fora do escopo — não é uma tela do produto).

  Verificado com `tsc --noEmit` (limpo), `php -l` nos arquivos PHP tocados
  (limpo) e Playwright (login, dashboard, barra recolhida, lista de obras,
  PDF da EAP — zero erro de console, cores/logo/tipografia batendo com o
  manual em cada uma). **Publicado em 28/09/2026** (commit `5389e03`,
  junto com o favicon oficial de verdade que o Lucas gerou depois —
  `ComTrena_Identidade_Visual/06_Favicons/`, com `.ico` multi-resolução +
  `.svg` + `apple-touch-icon.png`, instalados em `frontend/public/`
  exatamente como o `COMO-USAR.txt` da pasta pede; a pasta
  `ComTrena_Identidade_Visual/` inteira entrou no commit, como referência
  de onde vieram os arquivos usados em `frontend/public/marca/`).

- **28/09/2026 — Itens 15 e 16 do lote de melhorias.** Ainda não publicado.

  **Item 15 — layout da lista geral de Empreitas igual ao da aba da obra.**
  A lista geral (`/empreitas`, menu lateral — `features/empreitas/`) era
  uma versão antiga e simples, com Total/Pago sempre R$ 0,00 (lia campos
  `total_empreita`/`total_pago` que o comentário do próprio código já
  descrevia como "campos mortos, nunca gravados no banco"). A aba da obra
  (`EmpreitasObra`, `features/empreita/empreitas-obra.ts`) já tinha a
  conta certa há tempos, calculada a partir de `GET /empreitas/resumo` (por
  obra) + pagamentos da obra. Reescrita a lista geral: mesma tabela,
  colunas, barras de medição física/financeira, "Detalhar"
  (Empreiteiro/Reserva), seleção múltipla e popup de "pagamentos
  registrados" da aba — com uma coluna Obra a mais (mesma relação que a
  página geral de Contratos de equipamentos tem com a aba, item 14). Como
  o cálculo da aba depende só de duas listas (`resumoContrato`,
  `pagamentosPorEmpreita`), não de qual obra é qual, bastou buscar as duas
  POR OBRA (uma chamada por obra distinta entre as empreitas carregadas,
  via `forkJoin`) e juntar tudo — os `computed()` que derivam Total/
  Saldo/% medição são cópia fiel da aba, sem precisar mudar a fórmula.
  Reaproveitado também `EmpreitaPagamentosPopup` (já recebe
  `empreitaId`/`obraId` como input explícito — funciona igual cruzando
  obras, sem mudança nenhuma nele). **Fora do escopo de propósito** (mesmo
  raciocínio do item 14: "criar novo" só na aba de Contratos de
  equipamentos): copiar solicitação/resumo pro WhatsApp, PDF do
  profissional, lançar reservas, realizar medição, fechar período — pedem
  a EAP de UMA obra só, e aqui a seleção pode cruzar várias; ficam só na
  aba. "Nova empreita" continua na lista geral (não depende de EAP), agora
  com um seletor de obra. De passagem, achado e corrigido um bug real: o
  tipo `Pagamento` importado era o genérico de `core/models/api.models`
  (`{ id: string; [campo]: unknown }`) em vez do forte de
  `features/pagamentos/pagamentos.models.ts` — compilava limpo no `tsc`
  isolado do projeto mas quebrava no build de verdade do Angular (mesma
  lição de sempre: `tsc --noEmit` sozinho não é garantia, o build do
  container é que vale).

  **Item 16 — navegação da obra em grade.** Antes, clicar numa obra (lista
  de Obras ou qualquer link) ia direto pra aba EAP, com uma faixa
  horizontal de abas sempre visível — 14 abas, "difícil de navegar"
  segundo o Lucas. Trocado: a lista `ABAS` (antes privada dentro de
  `ObraDetalhe`) virou um arquivo à parte (`obra-abas.ts`, exporta
  `ABAS_OBRA`), reaproveitado por um componente novo, `ObraInicio`
  (`features/obras/obra-inicio/`) — uma grade de botões, um por aba, já
  filtrada por permissão (mesmo filtro de sempre). Esse componente virou o
  caminho vazio dentro de `obras/:id` (`app.routes.ts`, `abasDaObra`), no
  lugar do antigo `redirectTo: 'eap'`; `Obras.acessar()` (clique na linha
  da lista) parou de forçar `/eap` no fim do link, agora só
  `/obras/:id`, caindo na grade. A faixa horizontal de abas saiu de
  `ObraDetalhe` — no lugar, um link "← Voltar para as abas" aparece só
  quando a rota filha atual não é a grade (`dentroDeAba`, um signal que
  escuta `Router.events`/`NavigationEnd` e conta os segmentos da URL:
  `obras/:id/algo` = dentro de aba, `obras/:id` sozinho = grade). Testado
  via Playwright: grade mostra as 14 abas, clicar numa leva pra ela com o
  link de voltar aparecendo, voltar leva de volta pra grade, e clicar numa
  obra pela lista já cai direto na grade (não mais na EAP) — zero erro de
  console em cada passo.

- **28/09/2026 — Itens 8 e 9: modelos de contrato de Empreita e de Obra/
  proposta.** Últimos 2 itens do lote de 17 de 27/09/2026 — lote completo
  agora. Ainda não publicado. Decisões já confirmadas com o Lucas antes de
  começar: múltiplos modelos cadastráveis (não um só fixo), cada um
  editável, preenchimento automático de variáveis, saída em PDF — "mesma
  ideia dos modelos de FVS" (Configurações → cadastro reaproveitável,
  escolhido na hora de gerar).

  **Backend**: tabela nova `contrato_modelos` (`id`, `empresa_id`, `tipo`
  enum `empreita`/`obra`, `nome`, `conteudo` texto livre, `ativo`) —
  `ContratoModelo` (model) + `ContratoModeloController` (CRUD, mesmo
  padrão de `FvsModeloController`, sem `permissaoModulo` própria — cadastro
  geral tipo Materiais/Profissionais). `ContratoPdfController` gera o PDF
  do jeito de sempre (Browsershot abrindo a própria tela de impressão do
  Angular com um token de vida curta, ver docs/GERAR-PDF.md) — a diferença
  aqui é que é A TELA (`ContratoImprimir`, rota `/imprimir/obras/:id/
  contratos/empreita/:empreitaId` ou `/obra`) que busca o modelo escolhido
  (`?modeloId=`) e os dados e faz a substituição das variáveis, não o
  controller: ele só orquestra o Chromium, igual todo o resto.

  **Variáveis** (`ContratoModeloController::VARIAVEIS`, espelhado no
  frontend em `VARIAVEIS_CONTRATO_MODELO`): empreita tem
  `empresa_nome`/`empresa_cnpj`/`obra_nome`/`cliente`/`empreiteiro`/
  `descricao_empreita`/`numero_empreita`/`valor`/`data`; obra tem
  `empresa_nome`/`empresa_cnpj`/`obra_nome`/`cliente`/`responsavel`/
  `local_obra`/`data`. `{{valor}}` da empreita é a soma Empreiteiro+Reserva
  de todos os itens — mesma conta de `EmpreitasObra.total()`, buscada de
  `GET /empreitas/resumo`; obra não tem um campo de valor único no
  cadastro, então ficou de fora do tipo obra (o texto do modelo pode
  simplesmente não usar essa variável nesse caso). Uma variável sem valor
  fica em branco (não quebra o preenchimento); uma chave que não existe na
  lista fica visível como `{{chave}}` no PDF — mais fácil notar um nome
  errado no modelo do que a informação sumir sozinha.

  **Frontend**: aba nova "Modelos de contrato" em Configurações (CRUD com
  nome + texto do contrato + legenda das variáveis disponíveis, separado
  por tipo); popup "Contrato" da Empreita (já existia, de 27/09) ganhou uma
  seção "Gerar contrato" (escolher modelo + botão); `ObraDetalhe` ganhou um
  botão "📄 Gerar contrato" no cabeçalho, com popup próprio (a obra não
  tinha nenhum popup de contrato ainda). `preencherModeloContrato`
  (`shared/contrato-modelo-render.ts`) é a função pura de substituição
  (`{{chave}}` → valor), reaproveitada só por `ContratoImprimir`.

  **Bug real achado e corrigido no meio do teste**: a primeira versão tinha
  um `ContratoModelosService` próprio (mesmo padrão de `FvsService`/
  `RdoService` — um serviço à parte por módulo). O PDF gerava (200 OK,
  binário válido) mas o CONTEÚDO vinha com "Não foi possível carregar os
  dados do contrato" — só apareceu lendo o PDF de verdade, não só
  conferindo o status HTTP do download. Causa: aquele serviço à parte tinha
  seu próprio `base = environment.apiUrl` fixo, sem saber da URL
  alternativa de API que `ContratoImprimir` recebe por query string
  (`apiUrl=`) e aplica via `ApiService.definirBaseParaImpressao` — sem essa
  troca, dentro do container do Chromium headless que gera o PDF,
  `localhost:8088` não é alcançável (é o próprio container do Node/
  Chromium, não a API). Corrigido movendo os 4 métodos de CRUD pra dentro
  do `ApiService` compartilhado (que já resolve isso certo) e apagando o
  serviço à parte — mesma armadilha que `FvsService`/`RdoService` também
  têm hoje (não confirmado se algum dia mordeu alguém, mas é o mesmo
  padrão arriscado; não mexido agora, fora do escopo deste pedido).
  Lição: pra qualquer tela nova que apareça DENTRO de um PDF gerado, testar
  lendo o PDF de verdade — 200 OK com bytes de PDF válidos não garante que
  o conteúdo carregou.

  Testado via Playwright ponta a ponta: criação dos 2 modelos (empreita e
  obra) via API, geração e download dos 2 PDFs pela tela de verdade
  (popup da Empreita e popup da Obra), leitura do PDF resultante
  confirmando cada variável substituída certo (nome da empresa, obra,
  profissional, valor formatado em R$, data, cliente) — campos vazios no
  cadastro de teste (CNPJ, nº da empreita, responsável, local da obra)
  aparecem em branco no contrato, como esperado. Zero erro de console.
  Dados de teste (`ZZ Teste Empreita`/`ZZ Teste Obra`) apagados depois.

- **29/09/2026 — Editor de modelos de contrato virou visual/rico (pedido
  do Lucas, depois de ver a primeira versão dos itens 8/9 com textarea
  simples: "acho que possa ser interessante algo mais parecido com o
  word, o sistema abrir uma nova janela pra editar").** Trocado o
  formulário simples (embutido no popup de Configurações) por um editor
  de página inteira, `ContratoModeloEditor`, aberto numa ABA NOVA do
  navegador (`window.open`), com visual de "folha" branca centralizada
  sobre fundo cinza e barra de formatação fixa no topo ao rolar: negrito,
  itálico, sublinhado, título/subtítulo/texto normal, lista com/sem
  marcadores, alinhamento (esquerda/centro/justificado) e chips pra
  inserir cada `{{variável}}` disponível daquele tipo (empreita/obra) no
  cursor. Implementado com `contenteditable` + `document.execCommand`
  (sem instalar biblioteca nova de rich text — nada disso já existia no
  `package.json`, e o padrão deste projeto é preferir solução própria a
  dependência nova). `conteudo` do modelo passou de texto puro a HTML de
  verdade; a tela de Configurações ficou só a lista (com "+ Novo modelo"
  e clique na linha abrindo a aba de edição).

  **Detalhe de implementação que quebra fácil**: clicar num `<button>`
  da barra de formatação tira o foco (e a seleção de texto) da área
  `contenteditable` ANTES do `click` disparar, porque isso é o
  comportamento padrão do `mousedown` do navegador — sem tratar isso,
  `execCommand` roda sem seleção nenhuma e não faz nada. Corrigido com
  `(mousedown)="$event.preventDefault()"` no contêiner da barra (por
  delegação, cobre todos os botões de uma vez) + um `.focus()` explícito
  na área antes de cada `execCommand`, como reforço.

  **Rota do `window.open` tem que ser relativa, sem `/` na frente**
  (`'contrato-modelos/novo?tipo=empreita'`, não `/contrato-modelos/...`):
  o Angular roda sob `/app/` em produção mas `/` local — só path relativo
  resolve certo nos dois, contra o `<base href>` (`document.baseURI`), não
  contra a raiz do domínio.

  **Dois bugs reais achados testando o PDF de verdade** (mesma lição de
  28/09: 200 OK com PDF válido não garante que o CONTEÚDO saiu certo —
  só se vê lendo o PDF):
  1. Um teste automatizado inicial pareceu "perder" um trecho digitado
     depois de clicar em Negrito — investigado a fundo e concluído que
     era o PRÓPRIO SCRIPT de teste usando um seletor ambíguo
     (`button:has-text("N")`, que casa com qualquer botão/chip contendo
     "n" ou "N" — inclusive "Normal" e nomes de variável como
     `empresa_nome`), não um bug do editor: reproduções isoladas com
     seletor preciso (`button[title="Negrito"]`) e a sequência completa
     original (Título → Enter → Normal → Negrito → digitar → Negrito off
     → inserir variável) deram o HTML esperado de ponta a ponta.
  2. **Esse sim um bug real, sem relação com o teste acima**: os botões
     de alinhamento (centralizar/direita/justificado) do editor não
     tinham NENHUM efeito no PDF gerado — o `<p style="text-align:...">`
     que o `execCommand('justifyCenter'/...)` produz chegava ao
     `[innerHTML]` de `ContratoImprimir` sem o atributo `style`, porque o
     sanitizador padrão do Angular remove `style` de conteúdo passado por
     `[innerHTML]`. Corrigido em `contrato-imprimir.ts` envolvendo o HTML
     final em `DomSanitizer.bypassSecurityTrustHtml(...)` antes de
     atribuir ao signal renderizado — seguro aqui porque quem escreve
     esse HTML é sempre um usuário logado da própria empresa editando o
     modelo, e cada VALOR de variável substituído já passa por
     `escaparHtml` em `preencherModeloContrato` antes de entrar no
     texto. Confirmado depois lendo o PDF de verdade: parágrafo
     centralizado aparece centralizado, negrito/itálico/lista também
     saem certos.

  Modelos de teste (`ZZ Teste Editor Rico`, `ZZ Teste PDF Rico`,
  `ZZ Teste Alinhamento`) apagados do banco depois de cada teste.

- **29/09/2026 (mesmo dia, segunda rodada) — Editor de contrato ganhou
  estilos nomeados, lista de cláusulas numerada, colunas e layout de
  página por modelo (pedido do Lucas: "algo mais parecido com o Word...
  estilos que eu crio e nomeio... listas em níveis igual a EAP... layout
  de colunas... margens, tamanho da folha, cabeçalho, rodapé... papel
  timbrado com imagem... todos os dados do cliente/empreiteiro/obra/
  empresa como variável").** Decisões confirmadas com o Lucas antes de
  implementar: estilos são personalizados (não um conjunto fixo), a lista
  em níveis é numeração hierárquica (1, 1.1, 1.1.1 — igual à EAP), o papel
  timbrado é único por empresa, e margens/tamanho/cabeçalho/rodapé são por
  MODELO de contrato (não uma config única pro sistema todo).

  **Papel timbrado já existia** (`Empresa::papel_timbrado_path`, upload em
  Configurações → Dados da empresa, aplicado por `CabecalhoImpressao` —
  usado por TODO PDF do sistema, contrato incluído) — não precisou
  implementar de novo, só confirmar que já cobria o pedido.

  **Backend**: `contrato_modelos` ganhou `margem_{superior,direita,
  inferior,esquerda}_mm`, `tamanho_papel` (a4/carta/ofício), `orientacao`
  (retrato/paisagem), `cabecalho_html`/`rodape_html` (repetem em toda
  página do PDF). Nova tabela `contrato_estilos` (nome, tag HTML aplicada,
  fonte, tamanho em pt, cor, negrito/itálico/sublinhado, alinhamento) —
  única por empresa, reaproveitável em qualquer modelo, CRUD em
  `ContratoEstiloController`. `ContratoPdfController::gerar()` agora lê
  essas colunas do modelo e configura o Browsershot
  (`->margins()`/`->paperSize()`/`->format()`/`->landscape()`); cabeçalho/
  rodapé vão por `->headerHtml()`/`->footerHtml()` (recurso do próprio
  Puppeteer — roda FORA do DOM da página normal, isolado), o que obrigou
  duplicar em PHP um subconjunto da substituição de variáveis que
  `ContratoImprimir` já faz em TS (só os campos que o controller já tem à
  mão: Obra + Empresa, sem o `valor` calculado da empreita, que só existe
  no relatório do frontend). `{{pagina}}`/`{{total_paginas}}` viram
  `<span class="pageNumber">`/`<span class="totalPages">` — sintaxe
  especial do Puppeteer pra numeração de verdade.

  **Frontend**: barra do editor ganhou um `<select>` de estilos (padrão +
  os que o usuário criou), botão "🎨 Estilos" que abre um painel lateral
  com CRUD do estilo (nome, tag, fonte, tamanho, cor, negrito/itálico/
  sublinhado, alinhamento — aplicado como estilo INLINE no bloco atual,
  não como classe CSS, pra sair igual no PDF sem depender de folha de
  estilo nenhuma); botão "1. Cláusulas" + "aumentar/diminuir nível"
  (`execCommand('insertOrderedList'/'indent'/'outdent')`, numeração 100%
  via contador CSS em `.lista-clausulas`, não texto digitado — reordenar/
  aninhar recalcula sozinho); seletor de colunas (1/2/3 — sem
  `execCommand` equivalente, então é manipulação de DOM direta: envolve os
  elementos de nível 1 que a seleção cruza num `<div class="colunas
  colunas-N">`, ou desfaz devolvendo os filhos pro lugar); painel lateral
  "⚙ Página" com tamanho do papel/orientação/margens e dois mini-editores
  (cabeçalho/rodapé, com barra reduzida + `<select>` de variável,
  incluindo `pagina`/`total_paginas`). Os dois painéis laterais ficam
  SEMPRE no DOM (só escondidos por `transform: translateX` via classe
  `.aberto`), de propósito — se fossem `@if`, fechar o painel destruiria o
  `contenteditable` do cabeçalho/rodapé e perderia o que já foi digitado.

  **Bug real achado testando o PDF de verdade (o mais importante desta
  rodada)**: a lista de cláusulas simplesmente não numerava direito no
  PDF (saía "1./2." em vez de "1.1./1.2." nos itens aninhados) — não era
  bug da numeração em si, e sim do CSS inteiro do `.corpo-contrato` (não
  só a lista: títulos, citação, colunas — tudo) **nunca estar sendo
  aplicado de verdade**. Causa: `ContratoImprimir` injeta o HTML do
  contrato via `[innerHTML]`, e o Angular só marca com o atributo
  `_ngcontent-*` (que o CSS com escopo do componente depende pra casar os
  seletores) elementos que ELE MESMO compila do template — conteúdo
  jogado via `[innerHTML]` fica de fora do escopo, então as regras do
  `.scss` do componente nunca alcançavam esse HTML. Passou despercebido
  até agora porque `h2`/negrito/itálico/lista com marcador têm estilo
  padrão do PRÓPRIO NAVEGADOR parecido o bastante pra disfarçar — só ficou
  óbvio na lista de cláusulas, que depende 100% de CSS customizado (sem
  fallback nenhum do navegador). Corrigido com
  `encapsulation: ViewEncapsulation.None` no `ContratoImprimir` (seguro
  aqui porque essa tela só existe pra virar PDF via Browsershot, nunca é
  composta com o resto do app). **Provavelmente esse bug já afetava a
  primeira versão dos itens 8/9 (28/09) também** — só não fica óbvio
  porque títulos/negrito/lista continuavam parecendo certos por
  coincidência com o padrão do navegador. Lição nova, complementar à de
  28/09: verificar CSS de telas que usam `[innerHTML]` testando algo que
  NÃO tenha equivalente de estilo padrão do navegador (ex.: um contador
  CSS customizado), não só título/negrito/lista simples — esses escondem
  o problema.

  Testado via Playwright ponta a ponta (UI de verdade): criação de estilo
  personalizado e aplicação num parágrafo, lista de cláusulas com
  aninhamento, colunas (aplicar 2 colunas numa seleção e desfazer),
  cabeçalho/rodapé com variável + numeração de página — cada peça isolada
  pra não repetir a armadilha de seletor ambíguo já registrada em cima.
  PDF final lido de verdade: papel Carta em paisagem, margens customizadas
  aplicadas, cabeçalho/rodapé repetindo corretamente ("pág. 1/1"), estilo
  personalizado (cor vinho, negrito, tamanho maior), numeração hierárquica
  "1./1.1./1.2./2." certa, e as duas colunas lado a lado. Dados de teste
  (`ZZ Teste Avançado`, `ZZ Teste PDF Completo`, `Cláusula Grande` e
  outros) apagados do banco depois.

  **Ficou de fora, decidido com o Lucas (fase separada, ainda não
  iniciada)**: dados completos de Cliente/Empreiteiro (telefone,
  documento, endereço, e-mail) como variável do contrato. Hoje
  `Obra.cliente` e `Empreita.empreiteiro` são só um NOME em texto livre,
  sem ligação real com o cadastro (que também ainda não é tabela
  relacional — vive na ponte genérica de storage, mesma pendência já
  registrada acima). O Lucas escolheu a opção "ligar de verdade" (não só
  buscar por nome) — precisa promover Clientes e Empreiteiros/
  Profissionais pra tabela relacional de verdade e adicionar
  `cliente_id`/`empreiteiro_id` na Obra/Empreita antes de expandir essas
  duas variáveis. Trabalho grande, fora do escopo de "melhorar o editor",
  fica pra uma sessão dedicada a isso.

- **29/09/2026 (mesmo dia, terceira rodada) — Dois bugs reais de verdade no
  editor de contrato, achados só depois de OLHAR a tela renderizada** (o
  Lucas testou e relatou "ficou diferente da identidade visual do site,
  aquela questão dos textos cortados... quase nada do editor tá
  funcionando" — as duas rodadas anteriores só tinham sido verificadas por
  automação checando o HTML gerado, nunca por um screenshot de verdade).

  1. **Texto cortado nos campos novos** — mesma causa já corrigida uma vez
     no RDO (27/09/2026): o `_base.scss` fixa `input, select { width:100%;
     height:20px; }` globalmente (pensado pras tabelas densas do resto do
     sistema); os campos novos do editor (`select` de estilo, campos do
     painel de página, formulário de "Meus estilos") não desligavam essa
     altura, e o padding maior deles não cabia dentro dos 20px — texto
     visualmente cortado, e o `select` de estilo (sem `width` próprio
     também) esticava pra 100% da barra inteira, quebrando o layout do
     resto da barra de formatação. Corrigido repetindo `height: auto`
     (e `width` adequado) em cada campo novo — mesmo remédio já usado no
     RDO.
  2. **Painel lateral bloqueando a própria barra de formatação** — os
     painéis "Configurações da página"/"Meus estilos" são `position:
     fixed` por cima do conteúdo (de propósito, pra não perder o
     cabeçalho/rodapé digitado quando fecham); sem empurrar o resto da
     página, eles cobriam a ponta direita da barra de formatação —
     inclusive o próprio botão que abriu o painel, então depois de abrir
     não dava pra fechar clicando de novo nele (só pelo ✖ do painel).
     Corrigido dando um `padding-right: 340px` em `.pagina-editor`
     enquanto algum painel está aberto, empurrando a barra/folha pra não
     ficar por baixo.

  Confirmado com screenshots reais (não só HTML): barra de formatação
  cabe numa linha só, campos do painel de página com texto legível, painel
  de estilos com visual consistente com o resto do site (mesma fonte/cores
  dos inputs em Configurações), texto digitado aparecendo formatado
  (negrito, título, lista de cláusulas numerada) com a cor/fonte certas do
  tema. Salvamento conferido batendo no banco de verdade (não só o "✔
  Salvo" na tela). `ZZ Teste Pós-Correção` apagado depois.

  **Lição**: telas verificadas só por automação (checar `innerHTML`/status
  HTTP) podem passar por "certas" mesmo com problema visual grave — layout
  quebrado, campo cortado, elemento sobrepondo outro. A partir de agora,
  qualquer tela nova (não só PDF) merece pelo menos um screenshot de
  verdade antes de reportar como pronta.

- **29-30/09/2026 (mesmo lote, quarta rodada) — Depois dos screenshots, o
  Lucas testou de novo e relatou que "quase nada do editor tá funcionando"
  ainda (colunas, estilos, o seletor de estilo nem abria, configuração de
  página, variável no cabeçalho/rodapé, sem botão de confirmação na
  página) — e pediu pra trocar a forma de inserir variável por um seletor
  de OBJETO (empresa/obra/cliente/empreiteiro/empreita) que mostra as
  variáveis daquele objeto como botões com nome amigável, em vez da lista
  solta de `chave` crua.

  **Bug real, raiz de quase tudo que "não funcionava"**: o
  `(mousedown)="evitarPerderSelecao($event)"` no contêiner da barra de
  ferramentas (pensado pra não perder a seleção de texto ao clicar num
  botão de formatação) também bloqueava o `<select>` de estilo — o
  `mousedown` de um clique nele sobe (bubbling) até o contêiner, que
  chama `preventDefault()` ANTES do navegador abrir o dropdown, então ele
  simplesmente não abria. Mesmo problema no `<select>` de variável do
  cabeçalho/rodapé. **Não apareceu nos testes anteriores** porque eu
  tinha usado `page.selectOption()` do Playwright, que troca o valor do
  `<select>` direto via protocolo do navegador, sem passar pelo
  `mousedown`/clique real — não exercita (nem detecta) esse tipo de
  bloqueio. Corrigido: `evitarPerderSelecao` agora ignora o evento quando
  o alvo é `SELECT`/`INPUT`/`OPTION`, só bloqueia em botões de verdade.

  **Variáveis reorganizadas por objeto** (`contrato-modelo.models.ts`):
  `VARIAVEIS_POR_OBJETO` (empresa/obra/cliente/empreiteiro/empreita/geral,
  cada chave com um `rotulo` amigável — ex.: `cliente` → "Nome",
  `empresa_cnpj` → "CNPJ") e `OBJETOS_POR_TIPO` (obra não tem
  empreiteiro/empreita). Um `<select>` de objeto + botões com o rótulo
  aparecem em 3 pontos independentes (corpo, cabeçalho, rodapé), cada um
  com seu próprio objeto selecionado; cabeçalho/rodapé ainda ganham
  `pagina`/`total_paginas` dentro do grupo "Geral" (só faz sentido ali).

  **Painel de página ganhou um botão "Aplicar"** (pedido explícito do
  Lucas) — margens/papel/orientação/cabeçalho/rodapé já ficavam nos
  signals conforme editado (só vão pro banco quando o modelo inteiro é
  salvo), mas sem um botão de confirmação visível não ficava claro que a
  mudança "pegou"; o botão fecha o painel como confirmação.

  **Verificado com interação REAL, não atalho de teste** (lição da rodada
  anterior aplicada a fundo agora): `mousedown` sintético confirmando
  `defaultPrevented === false` no select de estilo; `locator.click()` de
  verdade + navegação por teclado (seta/Enter) escolhendo um estilo;
  colunas aplicadas numa seleção feita arrastando o mouse de verdade
  (`page.mouse.down/move/up`), não um `Range` criado via `evaluate`;
  troca de tamanho de papel por clique real; variável inserida no
  cabeçalho clicando no botão de verdade depois de escolher "Obra" no
  seletor de objeto; botão "Aplicar" fechando o painel. Tudo passou.
  Screenshot final conferido batendo com a identidade visual do resto do
  site.

  **Lição nova, mais específica que a anterior**: `page.selectOption()`
  (e qualquer atalho que manipule o DOM/estado direto via `evaluate`, sem
  passar pelo eventos de mouse/teclado de verdade) esconde bugs de
  interação — só serve pra preparar dado de teste rápido, nunca pra
  validar se um elemento interativo funciona pro usuário de verdade.

- **30/09/2026 (mesmo lote, quinta rodada) — Lote grande de correções e
  pedidos novos**, depois do Lucas usar o editor de verdade: WYSIWYG de
  verdade (a folha reflete o papel/margens/orientação configurados),
  numeração de lista aninhada não funcionava DENTRO do editor (só no PDF),
  rodapé com fonte minúscula no PDF, colunas só funcionavam com texto já
  separado, não dava pra continuar editando um modelo depois de salvar, e
  pedido de estilos "padrão" editáveis + prefixo/sufixo customizável de
  lista (ex.: "Cláusula 1ª").

  **Bug real, mesma raiz do de 29/09 (encapsulamento do Angular), agora
  dentro do PRÓPRIO EDITOR**: `.lista-clausulas` nunca numerava certo
  *enquanto editando* (nível 2 saía "1./2." em vez de "1.1./1.2.") —
  confirmado que o conteúdo dentro de `.area-edicao` (criado por
  `execCommand`, não compilado pelo Angular) também não carrega
  `_ngcontent-*`, então o CSS com escopo do componente nunca alcançava
  esse conteúdo — só parecia "quase certo" porque o marcador nativo do
  navegador (`list-style-type: decimal`) também mostra "1." pra um item
  não aninhado, disfarçando o problema até aninhar de verdade. Diferente
  do `ContratoImprimir` (que virou `ViewEncapsulation.None` inteiro,
  seguro por ser tela só-de-PDF), aqui o resto do componente (barra,
  painéis) É compilado pelo Angular e tem estilo de verdade — corrigido
  com `::ng-deep` só no bloco `.area-edicao`, não no componente inteiro.

  **WYSIWYG de verdade** (pedido: "quero ver o contrato ao vivo... o
  editor deve refletir exatamente como vai sair... a margem tá cortando
  em vez de empurrar") — `.area-edicao` tinha `max-width`/`padding`
  FIXOS, sem nenhuma relação com o papel/margens escolhidos. Agora
  largura/altura vêm de `tamanhoPapel`+`orientacao` (A4/Carta/Ofício, mm
  convertidos pra px a 96dpi) e o padding vem das margens, tudo por
  `[style.*]` ligado aos mesmos signals do painel de página — muda a
  folha AO VIVO. Como `box-sizing: border-box` já é padrão do projeto,
  aumentar a margem agora ENCOLHE a área de texto (quebra linha) em vez
  de cortar.

  **Rodapé/cabeçalho com fonte minúscula no PDF** — o `headerTemplate`/
  `footerTemplate` do Puppeteer roda num contexto ISOLADO, sem acesso a
  nenhum CSS da página (nem `font-family`/`font-size` herdados), só o
  padrão minúsculo do próprio Chromium quando o HTML não traz tamanho
  explícito. `ContratoPdfController::prepararHtmlPagina` agora envolve o
  HTML final num `<div style="font-size:9.5pt; ...">` explícito.

  **Colunas só funcionavam com texto já separado** — a versão anterior só
  envolvia parágrafos que JÁ EXISTIAM; num editor vazio (ou só com o
  cursor, sem nada selecionado) não tinha bloco nenhum pra envolver e
  nada acontecia. Agora, sem seleção/bloco, cria uma coluna vazia e
  posiciona o cursor dentro — como `column-count` reflui sozinho, digitar
  direto ali já fica dividido automaticamente.

  **Bug real achado testando o PDF de novo**: com um prefixo/sufixo
  customizado mais longo ("Cláusula 1ª" em vez de "1."), o marcador
  (`::before`) ficava SOBREPOSTO ao texto — a versão anterior usava
  `position: absolute` com um espaço fixo reservado pequeno (calibrado só
  pra "1."/"1.1."). Corrigido tirando o posicionamento absoluto: o
  marcador agora flui normal antes do texto (`margin-right`), então
  qualquer tamanho de prefixo cabe.

  **Não dava pra continuar editando depois de salvar** — a aba fechava
  sozinha (`window.close()`) logo depois de qualquer "Salvar", inclusive
  ao CRIAR um modelo novo; pra continuar mexendo era preciso voltar na
  lista e reabrir. Agora só fecha com "Cancelar" (ação explícita); ao
  criar, a URL troca pro id de verdade sem navegar/recarregar
  (`Location.replaceState`, mesmo espírito do editor do RDO) e o "✔
  Salvo" fica visível por alguns segundos em vez de anunciar que vai
  fechar.

  **Estilos "padrão" viraram editáveis de verdade** (pedido: "quero poder
  editar os estilos padrão do modelo") — Normal/Título 1-3/Citação eram
  só `execCommand('formatBlock', tag)` direto, sem nada salvo, então não
  tinha o que editar. Agora são `ContratoEstilo` de verdade (`padrao:
  true`), semeados automaticamente pra cada empresa na primeira vez que
  a lista é pedida (`ContratoEstiloController::semearPadroes`) —
  editáveis/excluíveis como qualquer estilo criado pelo usuário.

  **Prefixo/sufixo customizável de lista, vinculado ao estilo** (pedido:
  "cláusula 1ª, cláusula 2ª..."): `contrato_estilos` ganhou `eh_lista`,
  `lista_prefixo`, `lista_sufixo` — um estilo marcado como lista aplica
  esses valores como CSS custom properties (`--lista-prefixo`/
  `--lista-sufixo`, já com aspas, setados via JS no `<ol>`) que o
  `::before` do contador lê (`content: var(--lista-prefixo, '')
  counters(...) var(--lista-sufixo, '.')`) — a numeração em si continua
  100% automática e em níveis; só o texto ao redor muda. Um 6º estilo
  padrão ("Lista de cláusulas", prefixo vazio/sufixo ".") cobre o atalho
  rápido da barra ("1. Cláusulas").

  Tudo testado com interação real (não atalhos) e conferido visualmente:
  numeração aninhada aparecendo certa NO EDITOR (screenshot), folha
  mudando de tamanho ao vivo ao trocar papel/orientação/margem, colunas
  funcionando digitando do zero, PDF final lido de verdade com "Cláusula
  1ª"/"Cláusula 1.1ª"/"Cláusula 2ª" sem sobreposição, cabeçalho/rodapé
  legíveis, margens grandes (30/25mm) sem cortar nada, e salvar→continuar
  editando confirmado com o conteúdo batendo no banco depois de 2 saves
  seguidos sem fechar a aba.

  **Achado ao limpar dados de teste — não é bug, é dado real do Lucas**:
  existe um modelo chamado "teste" no banco (não criado por mim) com um
  contrato de verdade colado de outro editor (Word/Google Docs), usando
  variáveis que ainda NÃO EXISTEM no sistema:
  `{{tipo_cliente}}`, `{{CPF/CNPJ_cliente}}`, `{{endereco_cliente}}`,
  `{{tipo_empreiteiro}}`, `{{CPF/CNPJ_empreiteiro}}`,
  `{{endereco_empreiteiro}}`. Confirma na prática a pendência já registrada
  em 29/09 ("várias variáveis do empreiteiro e do cliente não estão
  aparecendo") — são exatamente os campos que dependem de Cliente/
  Empreiteiro virarem cadastro relacional de verdade (fase separada,
  decidida com o Lucas: "ligar de verdade", ainda não iniciada). Esse
  modelo NÃO foi tocado/apagado.

- **30/09/2026 (mesmo lote, sexta rodada) — WYSIWYG de verdade (cabeçalho/
  rodapé/timbrado visíveis na edição, guia de quebra de página) + lote de
  correções no sistema de imagens/vídeos do sistema todo**, depois do
  Lucas testar de novo e reagir com força: "o pdf gerado depois tem que
  tá 100% fiel ao que eu vejo na tela... quero VEEEERR a configuração
  aplicada, sabe como funciona o Word?".

  **Cabeçalho e rodapé passaram a aparecer DIRETO na folha simulada do
  editor** (antes ficavam escondidos num painel lateral, só visíveis
  abrindo "⚙ Página") — duas faixas (acima/abaixo do corpo, com fundo
  levemente diferente pra distinguir, igual ao Word) com miniatura da
  barra de formatação e o seletor de variável embutidos; o painel lateral
  ficou só com tamanho do papel/orientação/margens/papel timbrado.

  **Guia de quebra de página** (pedido: "não vejo a quebra de página") —
  não é paginação de verdade (o navegador não separa `contenteditable` em
  páginas; só o Chromium do PDF faz isso ao gerar) — é uma RÉGUA
  aproximada: uma linha a cada altura de folha, via `repeating-linear-
  gradient` com `background-size` ligado a `alturaFolhaPx`. Deixa claro
  que é aproximação, não promete exatidão de pixel.

  **Papel timbrado ganhou modo "fundo de página inteira"** (pedido: "a
  imagem pode pegar a folha toda se eu quiser, dimensionada de acordo com
  minha preferência") — a imagem em si continua única por empresa
  (`Empresa::papel_timbrado_path`); `contrato_modelos` ganhou
  `timbrado_modo` (topo/fundo) e `timbrado_ajuste` (cobrir/conter/
  esticar) POR MODELO. Visível também na prévia do editor (`.pagina-
  simulada` ganha o mesmo `background-image`/`background-size`).

  **Bug real, achado testando o PDF de novo**: o modo "fundo" funcionava
  perfeito na TELA normal mas o fundo simplesmente não aparecia no PDF.
  Isolado com um teste mínimo direto no Browsershot (HTML estático, sem
  Angular) — confirmou que `position:fixed` FUNCIONA nesse Chromium,
  então não era limitação da engine. Causa real: um `@media print {
  html, body { background:#fff } }` GLOBAL (`_base.scss`, pensado pras
  telas antigas que usam `window.print()`) também vale aqui, porque
  Browsershot gera o PDF emulando a mídia "print" — e com `z-index:-1`
  no fundo do timbrado, esse branco global pintava por cima dele. Tirando
  o `z-index:-1` (o `position:fixed` já cria seu próprio contexto de
  empilhamento, e por ser o PRIMEIRO elemento no HTML já fica atrás do
  resto só pela ordem do DOM) resolveu. Confirmado no PDF de verdade: o
  timbrado cobre a página inteira, texto legível por cima.

  **Lote de correções em imagem/vídeo do sistema** (pedido: "essa questão
  das imagens tá sendo um problema em vários pontos... elabore uma
  resolução definitiva"). Investigação (agente dedicado) do relato "o RDO
  não aceita as imagens, na hora de salvar a imagem não aparece" achou
  DOIS bugs reais, sem relação um com o outro:
  1. `max_file_uploads = 20` no `php-uploads.ini` — limite do PRÓPRIO PHP
     pra quantos arquivos cabem numa requisição (soma TODOS os campos).
     O RDO aceita até 20 fotos + 5 vídeos (25 no total) na mesma
     requisição — passando de 20, o PHP corta os excedentes de `$_FILES`
     ANTES do Laravel sequer processar a requisição, **sem gerar erro
     nenhum**: a validação nunca vê os arquivos cortados, a transação
     comita normal, a API responde sucesso, e a(s) foto(s) cortada(s)
     simplesmente nunca vira(m) registro no banco. Subido pra 50.
  2. `'fotos.*' => 'image|max:8192'` (8MB, regra `image` baseada em
     `getimagesize()`) — fotos de celular moderno (12MP+) passam de 8MB
     fácil, e a regra `image` não reconhece HEIC/HEIF (formato padrão da
     câmera do iPhone). Sem pré-checagem no frontend (diferente do vídeo,
     que já tinha), o usuário só descobria ao clicar Salvar, quando a
     requisição INTEIRA voltava rejeitada (nada do dia salvava) — e a
     mensagem vinha em INGLÊS mesmo com `APP_LOCALE=pt_BR`, porque não
     existia `lang/pt_BR/` publicado (`APP_FALLBACK_LOCALE=en` cobria o
     buraco). Corrigido:
     - `app/Support/ValidacaoMidia.php` — regra ÚNICA e centralizada
       (`IMAGEM`: `mimetypes` incluindo HEIC/HEIF, 25MB; `VIDEO`: igual
       já era) — usada agora em `RdoController`, `FvsController`,
       `MaterialEquipamentoController` e `DiarioObraController` (o antigo,
       aposentado mas não apagado) em vez de cada um escrever a regra na
       mão. **Qualquer upload de imagem/vídeo NOVO deve usar essa
       classe.**
     - `lang/pt_BR/validation.php` publicado — mensagens de validação em
       português EM TODO O SISTEMA de uma vez (não só fotos), já que
       `APP_LOCALE=pt_BR` só passou a fazer efeito com esse arquivo
       existindo.
     - `escolherFotos()` do RDO ganhou a mesma pré-checagem de tamanho
       que `escolherVideos()` já tinha (avisa ANTES de tentar salvar).
     - `mensagemDeErro()` do RDO passou a ler `errors` (mensagem por
       campo) antes do `message` genérico — o `message` de topo de um
       422 do Laravel é sempre a frase fixa em inglês "The given data was
       invalid.", mesmo com `lang/pt_BR` publicado (só traduz o que está
       DENTRO de `errors`).

  Confirmado via API: uma "foto" de 10MB (maior que o limite antigo de
  8MB) agora sobe e persiste como registro de verdade.

  **Suspeita forte, não confirmada (sem acesso ao VPS), pro "nenhuma
  imagem aparece na versão publicada"**: o guia `docs/DEPLOY-PRODUCAO.md`
  (seção 5, config de nginx do SISTEMA no VPS) só tem `location /api/`
  proxiando pro container Laravel — **não existe nenhum `location
  /storage/`**. Toda imagem do sistema é servida em `/storage/...} (não
  `/api/storage/...`), então se o nginx do VPS foi configurado igual a
  esse exemplo, qualquer pedido de imagem cai no bloco `location /
  { try_files $uri $uri/ /index.html; }` (a regra do Angular) — sem
  achar um arquivo com esse nome dentro do build do Angular, serve o
  `index.html` como fallback: a imagem "quebra" (o navegador recebe uma
  página HTML em vez de um `image/*`), em TODAS as imagens do sistema de
  uma vez, exatamente o sintoma relatado. **Não dá pra confirmar sem
  acessar o nginx de verdade do VPS** (este ambiente não tem esse
  acesso) — verificação simples pro Lucas rodar:
  `curl -I https://trenadigital.com.br/storage/<algum-caminho-de-imagem-
  real>` — se o `Content-Type` vier `text/html` em vez de `image/...`,
  confirma a causa. Correção: adicionar ao nginx do sistema um bloco
  igual ao de `/api/`, só trocando o caminho:
  ```nginx
  location /storage/ {
      proxy_pass http://127.0.0.1:8088;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```
  `docs/DEPLOY-PRODUCAO.md` também precisa desse bloco adicionado ao
  exemplo, pra não repetir o mesmo buraco numa próxima migração de VPS.

  **Método de verificação pra não repetir esse tipo de bug** (pedido:
  "elabore um método de verificação"): (1) depois de qualquer deploy,
  `curl -I` numa URL de imagem real do sistema em produção, conferindo
  `Content-Type: image/...`; (2) qualquer upload de imagem/vídeo NOVO usa
  `ValidacaoMidia::IMAGEM`/`VIDEO`, nunca uma regra escrita na mão; (3)
  testar upload com um arquivo de verdade GRANDE (>8MB) e, se possível,
  em HEIC, não só um arquivo pequeno de teste; (4) pra qualquer imagem
  que apareça DENTRO de um PDF gerado, ler o PDF de verdade (lição já
  registrada em 28-29/09) — o mesmo vale agora pra `position:fixed`
  (confirmado nesta rodada: funciona diferente na tela normal e dentro do
  Browsershot/print).

- 30/09/2026: **Reformulação grande do editor de modelos de contrato**
  (`ContratoModeloEditor`) e do pipeline de impressão (`ContratoImprimir`/
  `ContratoPdfController`), a partir de uma lista longa de pedidos do
  Lucas depois de usar a primeira versão (28-29/09) num contrato de
  teste de verdade dele.

  **Barra de formatação única**: as barrinhas separadas que existiam
  dentro do cabeçalho/rodapé foram removidas — agora existe só UMA barra,
  que age sobre a área com foco no momento (corpo, cabeçalho ou rodapé;
  indicador visual 📄/⬆/⬇ mostra qual). O menu de inserir variável
  também é único, compartilhado pelas três áreas.

  **Margens de cabeçalho/rodapé**: além das margens da folha (que já
  existiam), o modelo ganhou `margem_cabecalho_mm`/`margem_rodape_mm`
  (padrão 8mm cada) — "Do topo"/"Do rodapé" do Word — plugadas no
  `padding-top`/`padding-bottom` que o `ContratoPdfController` monta pro
  `headerHtml()`/`footerHtml()` do Browsershot.

  **Prévia do que o sistema desenha sozinho**: o editor ganhou uma
  `.previa-sistema` (só leitura) mostrando logo, nome da empresa,
  subtítulo do documento, papel timbrado em faixa e "Gerado em ..." —
  elementos que sempre apareceram no PDF final mas não na tela de edição
  (pedido explícito do Lucas, que tinha achado isso confuso).

  **Nome do modelo não aparece mais no documento impresso** — era só um
  identificador interno do cadastro (removido o `<h1
  class="titulo-contrato">` de `contrato-imprimir.html`).

  **Estilos viraram um vínculo de verdade, não mais uma cópia** — bug
  relatado pelo Lucas: "se eu alterar o formato do título 1 o texto não
  atualiza". Antes, aplicar um estilo COPIAVA os valores formatados como
  `style=` inline no bloco (um retrato daquele momento, nunca mais
  atualizado). Agora aplicar um estilo só marca o bloco com a classe
  `.estilo-<id>`; a formatação de verdade vive numa folha de estilos
  gerada de novo (`shared/contrato-estilo-css.ts::gerarCssEstilos`)
  toda vez que a lista de estilos muda — editar um estilo depois
  atualiza instantaneamente todo texto que usa ele, em qualquer lugar
  (editor e PDF, mesma função nos dois).

  **Numeração automática 100% via contador CSS, sem nenhuma
  contabilidade em JS** — a parte mais complexa do pedido (o Lucas
  descreveu um comportamento de renumeração automática idêntico ao
  Word/estilos vinculados a título, com exemplos numéricos detalhados de
  inserir/excluir título no meio do documento). Resolvida inteira com
  `counter-reset`/`counter-increment` nativos do CSS: o navegador já
  recalcula contador sozinho toda vez que o DOM muda, então inserir,
  excluir ou mover um título já renumera tudo abaixo de graça — não guarda
  posição nem ordem em lugar nenhum. Dois modos, escolhidos por estilo:
  - **Título numerado hierárquico** (`nivel_titulo`, 1 a 7): a numeração
    de um nível se encadeia com a dos níveis acima (ex.: o 1º título de
    nível 2 dentro do 5º título de nível 1 sai "5.1").
  - **Lista ordenada avulsa** (`eh_lista`): numeração própria, independente
    da hierarquia de títulos, sempre recomeçando do 1; formato escolhível
    por estilo (número, romano minúsculo/maiúsculo, letra minúscula/
    maiúscula) via o 2º parâmetro nativo do `counter()` do CSS.
  Cada estilo numerado (dos dois modos) tem prefixo/sufixo próprios
  (`lista_prefixo`/`lista_sufixo`, ex.: "Cláusula " + "."), aplicados via
  `--lista-prefixo`/`--lista-sufixo` (custom properties CSS setadas
  INLINE por bloco, não na folha gerada — permite dois estilos do mesmo
  nível terem prefixos diferentes). O botão "Lista de cláusulas" saiu;
  virou "1. Lista ordenada" (o `insertOrderedList` puro do
  `execCommand`, sem estilo hierárquico nenhum).

  **Caixa do texto por estilo** (`caixa_texto`): nenhuma/MAIÚSCULA/Primeira
  maiúscula/Cada Palavra Maiúscula, via `text-transform`/`::first-letter`
  na mesma folha gerada.

  **7 níveis de título por padrão** (antes só 3-4) — `semearPadroes()`
  agora cria Título 1 a Título 7 (tamanho decrescendo 22pt→11pt), mas
  NENHUM vem pré-marcado como numerado (`nivel_titulo` fica em branco) —
  numerar é opt-in, o usuário escolhe quais níveis participam da
  hierarquia.

  **Três bugs sérios achados e corrigidos durante esta rodada** (os três
  só apareceram testando de verdade, nenhum um `tsc`/`php -l` pegaria):

  1. **`<style>` literal dentro de um template Angular nunca é um nó de
     DOM atualizável em runtime.** O Angular extrai/mescla o conteúdo de
     qualquer `<style>` escrito literalmente no HTML de um componente pro
     CSS compilado do próprio componente, EM TEMPO DE COMPILAÇÃO — não
     importa se a tag tem `[textContent]="algumSignal()"` ou não, o
     binding nunca tem efeito (o elemento que existe em runtime não é o
     mesmo que o Angular tratou como "estilo do componente"). Sintoma: a
     folha de estilos gerada por `gerarCssEstilos()` simplesmente nunca
     aparecia em `document.querySelectorAll('style')`, então nenhum
     `.estilo-<id>` era aplicado nem no editor nem no PDF. **Correção**:
     nunca declarar `<style>` no template quando o conteúdo precisa ser
     atualizado depois — criar via `document.createElement('style')` como
     campo da classe, anexar em `document.head` no `ngOnInit()`, atualizar
     `.textContent` direto, remover no `ngOnDestroy()`. Aplicado em
     `ContratoModeloEditor` e `ContratoImprimir`.
  2. **`Rule::prohibitedIf()`/`prohibited` do Laravel não trata `false`
     como "vazio"** — só `null`/`''` contam. Enviar `eh_lista: false`
     junto de um `nivel_titulo` preenchido (regra `prohibitedIf`) dava
     422 mesmo sendo a combinação correta. Corrigido trocando por uma
     checagem manual (`if ($ehLista && $temNivelTitulo) throw
     ValidationException::withMessages(...)`) antes do `$request->validate()`,
     com os dois campos voltando a `nullable|boolean`/`nullable|integer`
     simples. Mesma causa também exigiu, no front, mandar campos
     "proibidos quando não aplicável" (ex. `lista_formato` quando o modo
     não é lista) como `undefined` — `JSON.stringify` derruba a chave —
     em vez de qualquer valor "neutro" tipo `'numero'`.
  3. **Contador CSS "trava" a renumeração entre grupos quando o MESMO
     contador é resetado tanto no elemento ANCESTRAL quanto em cada
     título-pai** — achado só depois de testar de verdade com Playwright
     e CONFERIR O SCREENSHOT (a numeração parecia certa olhando só o CSS
     via DOM, `getComputedStyle(el, '::before').content` mostra a FÓRMULA
     do `counter()`, não o número já calculado — só dá pra ver o número
     de verdade olhando a tela renderizada). Sintoma: com Título 1 e
     Título 2 marcados como numerados, o 1º Título 2 dentro do 2º Título 1
     saía "2.3" em vez de "2.1" (carregava o valor que faltava do 1º
     grupo, em vez de recomeçar do 1). Isolado num teste HTML mínimo, sem
     Angular nenhum: o container (`.area-edicao`/`.corpo-contrato`) tinha
     `counter-reset: titulo1 titulo2 ... titulo7` (resetando TODOS os
     níveis de uma vez, "por garantia"), enquanto cada estilo de Título 1
     TAMBÉM reseta titulo2..titulo7 nele mesmo — esse reset duplo (no
     ancestral E em cada título-pai) faz o Chromium não reencadear o
     escopo do contador corretamente a partir do 2º título-pai em diante.
     **Correção**: o container reseta SÓ o contador do nível 1 (o único
     sem "pai" pra resetá-lo); os níveis 2-7 ficam só a cargo do reset que
     cada título de nível acima já faz nele mesmo — que por sua vez já
     reseta TODOS os níveis abaixo dele (não só o nível seguinte), cobrindo
     também o caso de pular um nível (ex. Título 1 seguido direto de
     Título 3, sem Título 2 no meio). Corrigido em
     `contrato-modelo-editor.scss`, `contrato-imprimir.scss` e no helper
     `cssBaseContadores()` (não usado hoje, mas mantido consistente).
     Reverificado depois com o mesmo teste (Título 1 "Item Um"/"Item
     Dois" + Título 2 "A"/"B"/"C") — saiu "1.1 A; 1.2 B; Cláusula 2. Item
     Dois; 2.1 C", certo.

  **Bug do "texto cortado" no PDF** (relatado pelo Lucas testando o
  contrato de teste real dele): causa raiz é conteúdo colado do
  Word/Google Docs carregando margens NEGATIVAS inline
  (`margin-left:-1cm` etc., artefato de exportação), que empurram o
  parágrafo pra fora da área imprimível — o Chromium do Browsershot corta
  o que sai da página. **Corrigido só para colagens FUTURAS**: um
  handler de `(paste)` (`aoColar`/`limparHtmlColado` em
  `contrato-modelo-editor.ts`) remove margens inline que comecem com
  `-` antes de inserir o HTML colado. **O modelo "teste" real do Lucas,
  já salvo antes dessa correção, CONTINUA com o corte** — confirmado de
  novo nesta rodada gerando a tela de impressão de verdade pra esse
  modelo (texto cortado à esquerda em quase toda linha). Ainda não foi
  limpo (decisão deliberada de não alterar o conteúdo real dele sem
  perguntar antes) — **pendente confirmar com o Lucas se pode limpar
  esse registro específico agora que a causa e a correção estão
  confirmadas.**

  **Incidente sério, com correção já aplicada**: durante esta rodada, ao
  adicionar colunas nas migrations de `contrato_modelos`/`contrato_estilos`
  (ainda não publicadas, então editadas em vez de criar uma nova), o
  fluxo padrão de "`migrate:rollback` + editar + `migrate`" foi rodado
  sem antes confirmar que a tabela só tinha dado de teste — isso apagou
  o modelo "teste" REAL do Lucas do banco local. Recuperado na mesma
  sessão reconstruindo o registro (mesmo nome, mesmo `conteudo`/
  `cabecalho_html`/`rodape_html`/margens, capturados antes do rollback)
  via `POST /api/contrato-modelos` — confirmado restaurado (novo id
  `6bf019d0-22fd-490a-8eb1-f9b08e9187a6`, mesmo texto). Não houve perda
  de dado em produção (isso tudo rodou só no banco local Docker) — mas
  fica registrado aqui como lição: **daqui pra frente, antes de rodar
  `migrate:rollback` numa migration só porque ela ainda não foi
  publicada, confirmar antes que a tabela afetada não tem dado real
  digitado por alguém** (mesmo em ambiente local).

  **Adiado pra uma fase futura, separada** (fora do escopo desta rodada,
  três pedidos do Lucas que são feature grande cada um):
  - Régua estilo Word nas laterais da folha, com margens arrastáveis e
    linhas tracejadas guia (hoje as margens só têm campos numéricos).
  - Separação visual REAL de página a página, com vazio entre as folhas
    (hoje só tem uma linha guia aproximada via gradiente CSS repetido —
    não é paginação de verdade, só o Chromium do PDF separa em página de
    fato).
  - Geração de contrato em massa a partir da lista de Empreitas
    (selecionar várias, gerar todas de uma vez) com anexo automático
    dentro da Empreita, usando uma tag pré-definida no modelo.

  Testado via Playwright com interação real (clique/teclado, sem atalho
  de `selectOption` em áreas de texto rico) e screenshot de verdade em
  cada etapa: seleção de estilo, formulário de estilos (modo
  normal/lista/título + nível + formato + prefixo/sufixo + caixa de
  texto), numeração hierárquica (recriado do zero depois da correção do
  bug 3 acima), folha de estilos dinâmica presente tanto no editor quanto
  na tela de impressão.

  **Mais dois bugs achados pelo próprio Lucas testando** (relatou "não
  funcionou" em dois pontos específicos que meu teste anterior não tinha
  coberto — os dois já corrigidos e reverificados):

  4. **O vínculo do estilo não "vencia" texto colado com formatação
     inline antiga.** `aplicarEstiloAoBloco()` (em
     `contrato-modelo-editor.ts`) adicionava a classe `.estilo-<id>` no
     bloco, mas nunca limpava o `style=` inline que já estava lá (de
     colar do Word/Docs, ou de qualquer edição anterior) — e um `style=`
     inline tem prioridade sobre QUALQUER regra de classe no CSS, então o
     texto ficava preso na formatação antiga mesmo com a classe certa
     aplicada; editar o estilo depois não mudava nada visualmente. Batia
     exatamente com o "teste" real do Lucas (colado do Word, sem nenhuma
     classe `.estilo-`) — reproduzido isolado simulando uma colagem com
     `style="color:...; font-size:...;"` e aplicando um estilo em cima:
     a cor/tamanho antigos continuavam depois. **Corrigido** limpando o
     `style=` do próprio bloco e de tudo dentro dele
     (`removeAttribute('style')` recursivo) no momento de aplicar um
     estilo — a partir daí a classe manda sozinha, sem concorrência.
     Reverificado com o mesmo teste: depois da correção, a cor/tamanho
     passam a vir do estilo escolhido, não mais do texto colado.
  5. **"Só a 1ª maiúscula" não tem efeito nenhum em título numerado (ou
     qualquer estilo com prefixo).** Causa: o Chromium considera o
     conteúdo do `::before` (o prefixo/número gerado) como parte da
     "primeira linha" pra fins de `::first-letter` — então o
     `text-transform: uppercase` do `::first-letter` acaba mirando a
     primeira letra do PREFIXO ("C" de "Cláusula", já maiúsculo por
     natureza), não a primeira letra do texto digitado pelo usuário.
     Reproduzido visualmente: um título com prefixo "Cláusula " e texto
     digitado em minúsculo saía "Cláusula 0.0.0.1. texto em minusculo..."
     — a opção simplesmente não tinha efeito nenhum, sem erro ou aviso.
     Não existe seletor CSS pra mirar só o texto real quando ele vem
     depois de um `::before` no mesmo elemento (tentar mover o prefixo
     pra fora do fluxo normal, ex. `position: absolute`, resolveria mas
     arrisca quebrar o alinhamento da numeração que já está funcionando —
     não tentado por ora). **Corrigido de forma conservadora**: a opção
     só é aplicada de verdade em estilo SEM numeração (`gerarCssEstilos`
     em `shared/contrato-estilo-css.ts`); em estilo com numeração, o
     formulário agora mostra um aviso explicando que a opção não tem
     efeito nesse caso, em vez de parecer que fez algo e não fez.

  **Atualização do mesmo dia — bug 5 resolvido de verdade** (pedido do
  Lucas: "queria resolver isso da letra idependente da numeração"). A
  solução: tirar o `::before` (prefixo/número gerado) do fluxo inline
  normal com `float: left` faz o `::first-letter` passar a mirar
  corretamente a primeira letra do TEXTO, não mais do prefixo — técnica
  clássica de CSS (testada isolada antes de aplicar: texto quebrando
  linha normal, só a letra certa mudando). Só é seguro fazer isso com
  `alinhamento: esquerda` — `float` ignora `text-align` completamente,
  então num título centralizado/à direita o prefixo "escaparia" sempre
  pra esquerda da caixa, independente do resto do texto (testado,
  confirma quebrar visualmente). Por isso `gerarCssEstilos` só aplica o
  `float`/`::first-letter` quando as três condições batem (numerado +
  "só 1ª maiúscula" + esquerda); nos outros alinhamentos continua a
  limitação conhecida (aviso no formulário), documentada como opção
  consciente, não bug.

  ---

  **Mesmo dia, rodada seguinte — os 3 itens que tinham ficado adiados**
  (pedido do Lucas: "depois de resolver isso já resolve esses 3 ponto"):

  6. **Régua estilo Word, com margem arrastável.** Grid 2×2 acima/à
     esquerda da folha (`.area-reguas` em `contrato-modelo-editor.html`/
     `.scss`) — régua horizontal e vertical em cm de verdade (conversão
     mm→px já usada no resto do editor), zona cinza hachurada mostrando a
     margem (igual ao Word), alça azul na fronteira arrastável com o
     mouse (`iniciarArrasteMargem()` no `.ts`, ouvindo `mousemove`/
     `mouseup` no `window` enquanto arrasta). Os campos numéricos do
     painel "Página" continuam funcionando junto — dois jeitos de chegar
     no mesmo signal de margem, não um substituindo o outro. Testado com
     arraste de mouse de verdade (não `selectOption`/atalho): arrastar a
     alça esquerda mudou o campo "Esquerda (mm)" de 15 pra 36 e o
     `padding-left` real do corpo do texto junto. Também adicionada uma
     linha tracejada (`.guia-margens`) sobre a própria folha, marcando o
     retângulo imprimível de verdade (só da 1ª página, mesma aproximação
     de antes).
  7. **Separação de páginas DE VERDADE, com vazio entre as folhas**
     (pedido do Lucas: "criando as folhas mesmo separadas por um vazio
     entre elas" — antes só tinha uma linha-guia aproximada via gradiente
     CSS repetido, removida nesta rodada). Implementado com um `<div
     contenteditable="false">` (`.quebra-pagina`) inserido dinamicamente
     ANTES do bloco que ultrapassaria a altura útil de uma página
     (`recalcularQuebrasPagina()` em `contrato-modelo-editor.ts`),
     empurrando o resto do texto pra a "próxima folha" — como o
     espaçador nunca é focável, o cursor nunca entra nele, então
     inserir/tirar não mexe na posição de edição em nenhum texto real
     (testado: digitar bastante conteúdo até estourar a 1ª página,
     esperar o recálculo, e CONTINUAR digitando depois — o texto novo
     apareceu no lugar certo, cursor não pulou). Recalcula sozinho: ao
     digitar (debounce de 900ms — não a cada tecla, pra não atrapalhar o
     meio da digitação), ao arrastar/mudar margem, papel ou orientação
     (via `effect()` do Angular observando os signals). O espaçador
     nunca entra no `conteudo` salvo — `salvar()` lê de um CLONE do DOM
     com `.quebra-pagina` removido antes de virar HTML, então a altura de
     página pode mudar depois (trocar papel/margem) sem deixar vão
     errado gravado. **Achado de bug só testando visualmente** (regra já
     conhecida desta sessão: `getComputedStyle` não mostra cor/fundo
     real de elemento criado via `document.createElement`, só o valor
     "puro"): a regra CSS de `.quebra-pagina` não aplicava — mesma causa
     raiz do bug do `<style>`/numeração desta sessão inteira, o Angular
     só escopa CSS pra elementos que vêm do TEMPLATE, um `<div>` criado
     via JS nunca carrega o atributo `_ngcontent-*`. Corrigido movendo a
     regra pra dentro do bloco `:host ::ng-deep .area-edicao { ... }` que
     já existe no arquivo por esse mesmo motivo. Ainda é uma
     APROXIMAÇÃO do PDF de verdade (só o Chromium do Browsershot decide
     a quebra definitiva; um bloco sozinho maior que uma página inteira
     não é dividido) — mas resolve o pedido visual de verdade.
  8. **Gerar contratos em massa a partir da lista de Empreitas, com anexo
     automático** (pedido do Lucas: "selecionando vários e clicando para
     gerar os contratos... anexados... com uma tag predefinida no modelo
     do contrato"). Modelo de contrato ganhou `tag_anexo_id` (migration
     nova `2026_09_30_020000`, `nullable`, FK pra `tags`) — configurável
     no painel "Página" do editor, só aparece pra modelos tipo Empreita;
     sem essa tag definida, o modelo não pode ser usado na geração em
     lote (aviso explícito, tanto no editor quanto no popup de gerar).
     `empreitas-obra` (lista de empreitas da obra) ganhou o botão
     "📑 Gerar contratos" ao lado de "PDF do profissional", reaproveitando
     a MESMA seleção múltipla que já existia na lista — popup escolhe o
     modelo, um clique gera+anexa o contrato de cada empreita marcada.
     Backend novo (`ContratoPdfController::gerarEAnexarEmLote`, rota
     `POST /empreitas/contratos/gerar-em-lote`) roda sequencial (Browsershot
     não paraleliza sem mais Chromium concorrente), salva cada PDF
     direto como `Arquivo`/anexo via a MESMA lógica de nomeação/pasta que
     `AnexoController::criar()` usa pra upload manual (`AnexoNomeador`,
     `GeradorMiniatura`, `PastaRaizes`) — só que os bytes nascem no
     servidor (Browsershot), não vêm de um upload de verdade, por isso um
     método próprio (`salvarComoAnexo()`) em vez de reusar `criar()`
     como está (que exige um `UploadedFile` de requisição HTTP). Como a
     rota recebe uma LISTA de empreitas (não uma só na URL), a checagem
     de permissão por obra é manual dentro do loop
     (`PermissaoService::podeObra()`), pulando (sem derrubar o lote
     inteiro) qualquer empreita que o usuário não possa ver — reporta
     como falha em vez de erro genérico. Testado de ponta a ponta via
     API real: selecionar 2 empreitas de uma obra de teste, escolher um
     modelo com tag configurada, gerar — voltou `2 sucessos, 0 falhas`;
     conferido depois que o `Arquivo` de cada uma tem o `tag_id` certo,
     está marcado `origem_tipo:empreita`/`origem_id` da empreita certa, e
     até a miniatura do PDF foi gerada.

  **Não publicado ainda** — falta decidir com o Lucas se limpa o "teste"
  real antes ou depois de publicar, e revisar junto com ele os itens
  8/9 originais (marcar contrato como modelo ativo/padrão por tipo,
  publicar o lote inteiro desta sessão de reformulação).

  ---

  **Mesmo dia, rodada seguinte — reformulação de cabeçalho/rodapé/margem/
  paginação e do papel timbrado** (pedido do Lucas, resumido: "a
  separação de página [deve usar] o tamanho real da folha sempre...
  cabeçalho e rodapé aparecendo em todas as folhas... a edição de
  qualquer cabeçalho ou rodapé edita em todas as folhas... inclua os
  itens predefinidos dentro do cabeçalho... as bordas superiores e
  inferiores da página devem ser calculadas com base na base e topo do
  cabeçalho e rodapé... tire a opção de papel timbrado em faixa no
  topo, coloque centralizar/transparência/redimensionar"). A maior
  mudança de arquitetura do editor desde que ele existe — resumo por
  peça:

  **1. Cabeçalho/rodapé repetem em TODA folha do editor, com os itens
  predefinidos DENTRO deles.** Antes: `.previa-sistema` (logo/nome/
  subtítulo/data) era um bloco só de leitura acima da folha, visível só
  uma vez; `#areaCabecalho`/`#areaRodape` também apareciam só uma vez.
  Agora: `.caixa-cabecalho` (`contrato-modelo-editor.html`) reúne os dois
  — a prévia predefinida (ainda só leitura) mais a área editável do
  usuário (`.area-editavel-sincronizada`, mesma classe do antigo
  `.area-mini`) — e essa caixa inteira é CLONADA em cada quebra de
  página (`criarCloneCabecalhoOuRodape()` no `.ts`), com a parte
  predefinida sempre só-leitura e só a ilha `.area-editavel-sincronizada`
  de verdade editável dentro do clone. Editar em QUALQUER cópia (a
  canônica da 1ª página ou qualquer clone de uma página seguinte)
  propaga pra todas — digitar no clone copia pro elemento canônico na
  hora (`sincronizarDeClone()`), e as OUTRAS cópias pegam a mudança no
  próximo recálculo de paginação (debounced, dispara ao clicar fora do
  clone — não instantâneo tecla-a-tecla, decisão consciente pra não
  arriscar perder o cursor de quem está digitando, mesmo motivo do item
  2 abaixo). Testado com interação real: digitei no cabeçalho da página
  1, texto apareceu certo no clone da página 2; digitei no RODAPÉ de um
  CLONE, cliquei fora, e tanto o canônico quanto o outro clone
  atualizaram.
  - **Achado testando (mesma classe de bug já encontrada 2x nesta
    sessão)**: o `.clone-pagina` (raiz do clone) É um elemento
    compilado pelo Angular (`caixaCabecalho.nativeElement.cloneNode(true)`),
    então ele e seus filhos JÁ carregam o atributo `_ngcontent-*` (copiado
    pelo `cloneNode`) — diferente do `.quebra-pagina`/`<style>` das
    rodadas anteriores (criados do zero via `document.createElement`,
    sem esse atributo) — por isso o CSS normal com escopo do componente
    (`.caixa-cabecalho { ... }`, sem `::ng-deep`) já funciona certinho
    nos clones, sem precisar da mesma gambiarra.

  **2. Separação de páginas usa o tamanho REAL da folha sempre — inclui
  documento curto.** Na rodada anterior, só aparecia um vão quando o
  conteúdo REALMENTE estourava a página; agora `recalcularQuebrasPagina()`
  sempre completa a página atual até a altura real (`alturaUtilPaginaPx`)
  com um espaçador em branco + clone do rodapé, mesmo sem ter estourado
  nada (documento de uma linha só já mostra a folha inteira, com o
  rodapé lá embaixo e o resto em branco).
  - **Bug sério achado testando de verdade** (não só olhando o código):
    num documento VAZIO, o espaçador (não-editável) sozinho ocupava TODA
    a área clicável da folha — sem nenhum texto real pra ancorar o
    cursor, as primeiras teclas digitadas simplesmente SOMIAM (confirmado
    lendo o HTML real: o texto digitado não aparecia em lugar nenhum).
    Corrigido pulando o espaçador quando não existe NENHUM conteúdo real
    ainda — a folha "cheia" só aparece a partir do primeiro caractere
    digitado, que sempre garante um bloco real pra clicar.

  **3. Margem superior/inferior do corpo deixou de ser um número
  escolhido — agora é CALCULADA a partir da altura real do cabeçalho/
  rodapé** (pedido do Lucas: "as bordas superiores e inferiores da
  página devem ser calculadas com base na base e topo do cabeçalho e
  rodapé respectivamente"). `margem_superior_mm`/`margem_inferior_mm`
  saíram do modelo TS e da tela (as colunas ainda existem no banco, só
  não são mais lidas/escritas por nada) — só sobraram
  `margem_esquerda_mm`/`margem_direita_mm` (concretas, arrastáveis) e
  `margem_cabecalho_mm`/`margem_rodape_mm` (distância da BORDA até o
  cabeçalho/rodapé, também arrastável). O corpo começa onde o cabeçalho
  termina e acaba onde o rodapé começa, sempre — no editor,
  `alturaUtilPaginaPx` subtrai a altura REAL medida (`caixaCabecalho`/
  `caixaRodape` via `offsetHeight`) da altura da folha; no PDF de
  verdade, `ContratoPdfController::gerar()` faz a mesma conta, só que
  precisa MEDIR o cabeçalho/rodapé ANTES de gerar o PDF de verdade
  (Puppeteer não ajusta margem sozinho pro conteúdo — outra chamada ao
  Chromium, só pra medir via `document.body.scrollHeight`, antes da
  chamada que gera o PDF real com a margem já certa).
  - **Dois bugs sérios de medição achados só testando o PDF de verdade
    (a medição isolada parecia certa)**:
    1. **`scrollHeight` tinha um PISO.** `Browsershot::html($html)`
       recebe só um FRAGMENTO (sem `<!DOCTYPE html>`) — o Chromium
       renderiza em MODO QUIRKS, onde `<body>` historicamente estica pra
       preencher a altura da JANELA de medição inteira, não só o
       conteúdo. Um rodapé de uma linha só media exatamente a altura da
       janela de medição (100px), não a altura real (bem menor).
       Confirmado aumentando a janela de 100 pra 2000px: a medição
       "pulou" de ~100 pra ~2000 junto, prova de que não estava medindo
       conteúdo nenhum. Corrigido envolvendo o HTML num documento de
       verdade (`<!DOCTYPE html><html><body>...`) antes de medir — modo
       STANDARDS, altura automática de novo baseada só no conteúdo.
    2. **A causa raiz de verdade, achada DEPOIS de corrigir a medição e
       o corpo continuar sobrepondo o cabeçalho mesmo assim**: existia
       uma regra `@page { size: A4 portrait; margin: 15mm; }` esquecida
       em `contrato-imprimir.scss`, de ANTES do modelo de contrato ter
       tamanho de papel/margem configurável (29/09) — nunca removida.
       Isolado aumentando a margem calculada pra um valor
       PROPOSITALMENTE exagerado (30mm de folga extra): o PDF gerado não
       mudou UM PIXEL, provando que a margem calculada no PHP não tinha
       efeito nenhum — o Chromium aplicava o `margin: 15mm` fixo da CSS
       por cima de qualquer coisa vinda do `Browsershot::margins()`.
       Corrigido removendo a regra `@page` (tamanho/margem já são 100%
       controlados via PHP desde 29/09, essa regra CSS já não deveria
       existir). **Verificado renderizando o PDF de verdade em pixels**
       (não só extração de texto, que mascarava a sobreposição parecendo
       "linhas próximas" em vez de LITERALMENTE em cima uma da outra —
       usado PDF.js via um servidor HTTP local só pra essa checagem,
       servido de dentro do scratchpad) — antes mostrava "Cláusula de
       teste" em cima de "CONTRATO DE EMPREITADA"; depois de corrigido,
       layout limpo, cabeçalho/rodapé repetindo certo nas 2 páginas do
       PDF de teste.
    - Mantida uma folga de segurança pequena (`FOLGA_MEDICAO_MM`, 4mm)
      por cima da medição — o `headerTemplate`/`footerTemplate` de
      verdade do Puppeteer roda num mecanismo interno diferente
      (`Page.printToPDF`) de uma página normal, então a altura pode não
      bater 100% com a mesma HTML medida como página comum.
    - Efeito colateral aceito: gerar o PDF agora faz 3 chamadas ao
      Chromium em vez de 1 (medir cabeçalho, medir rodapé, gerar o PDF
      de verdade) — no teste, ~38s em vez dos ~15-20s de antes. Avisar
      o Lucas dessa demora maior.

  **4. Papel timbrado redesenhado** (pedido do Lucas: "tire a opção de
  papel timbrado em faixa no topo, coloque a opção de centralizar a
  imagem na folha e coloque uma opção de aplicar transparência... e
  redimensionar... mantendo ou não a proporção"). `timbrado_modo`
  ("faixa no topo" vs "fundo") e `timbrado_ajuste` (cobrir/conter/
  esticar) saíram da tela — só existe mais o modo "fundo", sempre
  centralizado. Campos novos (migration `2026_09_30_030000`):
  `timbrado_largura_pct` (% da folha, default 100), `timbrado_altura_pct`
  (só usado sem manter proporção), `timbrado_manter_proporcao` (bool,
  default true — usa `background-size: X% auto`, o próprio CSS calcula
  a altura mantendo a proporção natural da imagem, sem precisar saber as
  dimensões dela no backend/frontend), `timbrado_opacidade` (0-100,
  default 100). A imagem agora fica numa camada PRÓPRIA (`.timbrado-fundo-editor`
  no editor, já existia separado no `ContratoImprimir`) — `opacity` só
  pode valer pra imagem, nunca pro texto do contrato por cima dela.
  Testado com interação real: mudar largura pra 50% e opacidade pra 40%
  no painel "Página" — a imagem na folha ficou visivelmente menor,
  centralizada e translúcida.

  **5. Bug do arraste travando em 149mm, corrigido.** O limite do
  arraste na régua vertical usava `Math.round(tamanhoMm / 2)` — pra A4
  retrato (297mm de altura), isso dá exatamente 149, batendo com o
  relatado pelo Lucas. Como agora a régua vertical arrasta
  `margemCabecalho`/`margemRodape` (distância até a borda, não mais uma
  margem do corpo inteiro), o limite virou um teto fixo de 60mm (mesmo
  já usado nos campos numéricos). Testado arrastando a alça do rodapé
  bem além de 149mm — parou em 60mm, não mais travado num valor
  arbitrário no meio do caminho.

  **Arquivos principais tocados**: `contrato-modelo-editor.ts`/`.html`/
  `.scss` (reescrita grande), `contrato-imprimir.ts`/`.html`/`.scss`
  (removido `<app-cabecalho-impressao>` do corpo — os itens predefinidos
  só existem mais via o cabeçalho de verdade do Puppeteer; removida a
  `@page` órfã), `ContratoPdfController.php` (cabeçalho combinado +
  medição + margem calculada), `contrato-modelo.models.ts`
  (`ContratoModelo` sem margem_superior/inferior, com os 4 campos novos
  de timbrado), 2 migrations novas (`timbrado_largura_pct` e famÍlia;
  nenhuma mudança nas colunas de margem_superior/inferior, só paradas de
  usar).

  **Não publicado ainda** — agora cobre TRÊS rodadas de reformulação do
  editor de contrato no mesmo dia (30/09). Falta decidir com o Lucas
  publicação + limpeza do "teste" real + os itens 8/9 originais.

- **09/10/2026 — Início do app ComTrena para Android (Capacitor), sem
  mexer no site.** Decisões do Lucas: aproveitar este frontend Angular;
  Play Store agora e App Store depois; primeira versão só com o RDO
  (diário de obra), que precisa funcionar OFFLINE e enviar quando a
  internet voltar; depois entram Empreita, Cadastros e Pagamentos.

  O que foi feito (só adições — o build do site e o `environment.prod.ts`
  não mudaram):
  - `frontend/capacitor.config.ts` — `appId` **`br.com.comtrena.app`**
    (identidade do app nas lojas; NÃO pode mudar depois de publicado).
  - `frontend/src/environments/environment.mobile.ts` + configuração
    `mobile` no `angular.json` (sai em `dist/mobile/`, separada do build
    que vai pro VPS) — `apiUrl` absoluto `https://trenadigital.com.br/api`,
    porque dentro do app as telas abrem em `https://localhost`.
  - `frontend/android/` — projeto Android gerado (`npx cap add android`),
    targetSdk 36 / minSdk 24. Chaves de assinatura (`*.jks`,
    `*.keystore`) ignoradas pelo git.
  - Scripts: `npm run build:mobile` e `npm run android` (build + sync +
    abre o Android Studio).
  - `.dockerignore` na raiz, para o `Dockerfile_angular` não copiar pra
    imagem o `node_modules` que agora também existe no Windows.

  **Atualização (mesma madrugada, 09/10):** o app rodou de verdade no
  Xiaomi do Lucas e o login funcionou. Itens (1), (2) e (3) abaixo
  RESOLVIDOS: CORS de produção ajustado direto no container
  (`docker exec controleobra-phpfpm ...`, backup em
  `controleobra-api/.env.bak-20261009` no VPS); Node do Windows
  atualizado para 24.21; Android Studio instalado em
  `D:\Android\Android Studio`, SDK em `D:\Android\Sdk`, cache do Gradle
  em `D:\Android\.gradle` e celulares virtuais em `D:\Android\avd`
  (variáveis `GRADLE_USER_HOME`, `CAPACITOR_ANDROID_STUDIO_PATH` e
  `ANDROID_AVD_HOME`) — o disco C do PC é pequeno. Gradle do projeto
  usa o JDK 21 (o Android Studio novo vem com 25, incompatível).
  Rodar o app no celular: `npm.cmd run android` na pasta `frontend` e
  depois ▶ no Android Studio.

  Pendências: (1) CORS de produção — `CORS_ALLOWED_ORIGINS` no
  `controleobra-api/.env` do VPS precisa ganhar
  `https://localhost,capacitor://localhost` e depois `php artisan
  config:cache` (conferido em 09/10: hoje a API só libera
  `https://trenadigital.com.br`, então o login do app falharia);
  (2) o Node do Windows é 22.14 e o Angular 22 exige 22.22.3 ou mais —
  atualizar antes de rodar `npm run android` (o build desta vez foi feito
  fora do Windows); (3) instalar o Android Studio (2025.2.1 ou mais novo);
  (4) `urlPublica()` em `rdo-lista.ts` usa `window.location.origin` — no
  app geraria link `https://localhost/...` pro contratante; corrigir na
  adaptação do RDO; (5) offline do RDO ainda não começou (precisa de um
  identificador único por lançamento, gerado no celular, para a API não
  duplicar quando o envio for repetido).

- **09/10/2026 (tarde) — App: RDO sem internet, só o RDO no app e ícone da
  ComTrena.** Decisões do Lucas: sem internet dá para CRIAR RDO novo (e
  continuar editando os que ainda não subiram), com fotos E vídeos; o app
  mostra só o RDO; o envio é automático com o app aberto. RDO já enviado
  só se edita com internet; finalizar/assinar, FVS, PDF e link do
  contratante continuam precisando de internet (e PDF/link ficam só no
  site — no WebView o download não funciona e o link sairia com
  `https://localhost`).

  Como funciona (tudo no frontend, NENHUMA mudança na API nem deploy):
  - `environment.app` (true só em `environment.mobile.ts`) troca as rotas por
    `app.routes.app.ts` (só RDO, mesmas URLs do site) e a casca por
    `layout/app-movel` (barra azul com "Sem internet" e "N aguardando envio").
    O site não muda.
  - `core/offline/cache-offline.interceptor.ts`: no app, toda consulta GET à
    API que dá certo fica guardada no celular (IndexedDB, por usuário); sem
    internet a tela recebe a última resposta guardada. A lista de RDOs
    pré-carrega preparo, EAP e lista de cada obra para uso offline.
  - `features/rdo/rdo-fila.service.ts`: salvar RDO novo no app grava primeiro
    na fila do celular (com os arquivos) e depois envia. O id do RDO é gerado
    no celular e vira o id definitivo (a API já aceitava `id` no store; a
    chave primária impede duplicar). Se um envio cair sem resposta, antes de
    reenviar confere `GET /rdo/{id}`. Servidor recusou (422 etc.) = item fica
    "não enviado" com a mensagem, até corrigir e salvar de novo.
  - No site também: o RDO novo passou a mandar o `id` e o envio com fotos/vídeos
    não tem mais o tempo-limite de 15 s (o RDO chegava e a tela dizia erro).
  - Celular estreito: a tabela de clima do RDO virou botões por turno (antes
    a página inteira rolava de lado).
  - Ícone/abertura: `frontend/assets/` (fontes + script) gerados com
    `@capacitor/assets`; ver `frontend/assets/README.md`.
  Testado com Playwright em tela de celular e API simulada: abrir sem
  internet, criar RDO com foto sem internet, reabrir o app, editar o
  rascunho, voltar a internet → 1 envio só, com a última versão.
- 14/10/2026: Modelos de documentos (editor + PDF de contrato/proposta),
  segunda rodada de pedidos do Lucas. Sem migration nem mudança de banco.
  - **Cabeçalho do PDF** (`ContratoPdfController::construirCabecalhoPdf`):
    mesmo padrão dos outros PDFs ("Gerado em" + logomarca do ComTrena à
    direita). Logo da empresa e logomarca vão EMBUTIDAS em base64 — o
    `headerTemplate` do Puppeteer não baixa nada por URL (era a "imagem do
    cabeçalho com erro"); cópia da logomarca em
    `controleobra-api/resources/marca/`. Por causa do base64, o Browsershot
    usa `writeOptionsToFile()` (limite de 128KB por argumento no Linux).
  - **Cabeçalho mínimo**: sem texto próprio, a folga abaixo da linha é
    igual à de cima (`margem_cabecalho_mm`). Medido num PDF de teste: o
    Chromium põe ~20px de `padding` no `#header`/`#footer` do template (o
    cabeçalho começava 5,3mm abaixo da borda) — era isso que a antiga folga
    de 4mm tentava cobrir. Agora o template zera esse padding
    (`ESTILO_ZERA_TEMPLATE`) e a folga saiu: margem do PDF = altura medida,
    exata. Geometria (fonte, entrelinha fixa 1,4, mm/pt) ESPELHADA no
    editor (`contrato-modelo-editor.scss`: `.caixa-pagina`, `.previa-*`,
    `.area-editavel-sincronizada`) — mexeu num, mexe no outro.
  - **Editor**: cada folha é um bloco branco de tamanho fixo
    (`.folha-bloco`), com linhas tracejadas no limite do cabeçalho/rodapé
    e nas margens laterais; a faixa azul-clara acima do rodapé era o fundo
    do espaçador entre folhas (saiu). O rodapé canônico mora na ÚLTIMA
    folha; os outros são clones, e a barra de formatação age no clone
    clicado. O papel timbrado aparece só na área do corpo — é onde o PDF
    de verdade sempre pôs (`position: fixed` na impressão fica preso às
    margens; testado, nem deslocamento negativo passa delas).
  - **Editor = PDF** (conferido com o mesmo modelo nos dois, folha a
    folha): o PDF passou a não partir parágrafo/título/item de lista no
    meio (`break-inside: avoid`, o editor só quebra entre blocos) e o
    editor zera a margem de cima do bloco que abre uma folha nova em quebra
    automática (o Chromium faz isso). Parágrafo do editor passou a
    justificado, como o PDF sempre foi.
  - **Novidades na barra**: alinhar à direita, entrelinhas igual ao Word
    (1,0 = `line-height` 1,2 × fonte; cada opção multiplica), linha de
    assinatura (1, 2 lado a lado ou testemunhas), imagem (botão ou colar;
    vai embutida no HTML do modelo, reduzida a 1600px; redimensiona pelas
    alças, largura em % da coluna), fórmulas.
  - **Fórmulas** `{{=...}}` (só no corpo — o cabeçalho/rodapé é montado no
    servidor): mesmo parser das fórmulas dos campos numéricos
    (`shared/numero/formula.ts`); resultado no formato das variáveis quando
    todas têm o mesmo, senão número; `TEXTO()` = reais por extenso
    (`shared/valor-por-extenso.ts`), `MOEDA()/NUMERO()/PERCENTUAL()`
    forçam formato; erro sai em vermelho no PDF. Percentual entra na conta
    como fração (0,25).
  - **Proposta**: variáveis numéricas da EAP (custo direto, BDI R$, BDI %
    efetivo e total com BDI, por categoria e no total —
    `variaveisPropostaEap`). Tabela: uma coluna por categoria MARCADA na
    EAP (lê o `ui` gravado da EAP) + Total, com Unit./Total empilhados e
    linha TOTAL GERAL. As cores ficam só no modelo (painel "Tabela da EAP"
    do editor, com prévia de dados de exemplo no lugar de
    `{{tabela_eap}}`); o modal da EAP não mostra mais cores. Achado: a cor
    do cabeçalho da tabela não aparecia porque o `th` global (`_base.scss`)
    passava por cima — agora vai inline na célula.
  - Testado com Playwright e API simulada (o Docker local estava fora:
    disco C: cheio), cliques/teclado/arraste reais, e o PDF gerado pelo
    mesmo `printToPDF` do Browsershot. O PHP não pôde ser rodado nem
    passar pelo `php -l` nesta sessão — conferir no deploy.
- 15/10/2026: Modelos de documentos — estilos por modelo e serviços da
  empreita. **Tem migration** (`2026_10_15_000000_add_estilos_a_contrato_modelos`,
  coluna JSON `estilos` em `contrato_modelos`).
  - **Estilos são do MODELO, não da empresa**: antes `contrato_estilos`
    valia pra todos os modelos (mudar o "Título 1" num contrato mudava em
    todos). Agora cada modelo guarda a cópia dele em `estilos` (JSON), com
    os mesmos ids (a classe `.estilo-<id>` do texto continua batendo).
    Editar/criar/excluir estilo no editor é local ao modelo e grava no
    "Salvar" do modelo; o PDF usa `modelo.estilos`. Modelo antigo
    (`estilos = null`) ainda usa os da empresa até ser salvo uma vez; modelo
    novo parte da lista da empresa como ponto de partida. As rotas de
    `contrato-estilos` continuam existindo (semeiam/servem a lista inicial),
    mas o editor não as altera mais.
  - **Empreita — serviços filtrados** (só no corpo): `servicos_previstos`,
    `servicos_adicionais`, `servicos_todos` (uma linha por serviço:
    "Serviço N | descrição | R$ valor"; adicionais saem como "Aditivo N") e
    `total_servicos_previstos`, `total_servicos_adicionais`,
    `total_servicos` (numéricos, entram em `{{=...}}`/`TEXTO()`).
    "Adicional" = marca da etapa da EAP; serviço sem etapa vinculada conta
    como adicional (mesma convenção da mensagem de pagamento). Valor do
    serviço = Empreiteiro + Reserva, igual à variável `valor` — os totais
    fecham com ela. Serve também pra montar um modelo de aditivo.
- 15/10/2026 (2): contrato de empreita — dados do cliente/empreiteiro,
  previsão de conclusão e NOVA NUMERAÇÃO. **Tem 2 migrations, uma delas de
  DADOS (fazer backup do banco antes):**
  - `..._000100_add_previsao_conclusao_a_empreitas`: coluna `previsao_conclusao`
    (date) na empreita; campo "Previsão de conclusão" na página da empreita;
    variável `{{previsao_conclusao}}`.
  - `..._000200_renumerar_obras_e_empreitas` (dados, sem volta — restaurar o
    backup): obra `OBR-011` → `OBR-0011` (4 dígitos); empreita
    `OBR-OBR-011-EMP-001` → `EMP-0001`, sequência POR OBRA (mantém a sequência
    que a empreita já tinha na obra; repetida/ilegível recebe o próximo livre).
    Acompanham: `obra_number` das tabelas que têm (empreitas, pagamentos,
    recebimentos…) e `mapas.codigo` ("MAPA-OBR-011-02" → "MAPA-OBR-0011-02").
    Idempotente. Testada num MySQL descartável com dados de exemplo.
  - Gerador novo: obra `OBR-NNNN` (frontend, `obras.ts`) e empreita
    `EMP-NNNN` (backend, `EmpreitaController`: maior número da obra + 1 — antes
    `count()+1`, que repetia número depois de excluir uma do meio).
  - **Códigos dos cadastros** (migration de dados `..._000300_renumerar_
    codigos_dos_cadastros`): `CLI-014` → `CLI-0014`, `RESP-014` →
    `RESP-0014`, `FORN-014` → `FORN-0014` e o cadastro de empreiteiros
    (profissionais) troca `EMP-014` por `PRO-0014` (`EMP-` passou a ser das
    empreitas). Eles moram em JSON na tabela `app_storage` (um por empresa);
    a troca é feita no TEXTO do JSON, só no valor do campo do código
    (`identificacao`/`codigo`) — o resto do registro não é reescrito.
    Idempotente. Os geradores do frontend (clientes, responsáveis,
    fornecedores, empreiteiros e `beneficiados.ts`) geram 4 dígitos. PG-/RC-
    já tinham 4.
  - Variáveis novas: `tipo_cliente`/`cpf_cnpj_cliente`/`endereco_cliente`
    (contrato de empreita, de obra e proposta) e `tipo_empreiteiro`/
    `cpf_cnpj_empreiteiro`/`endereco_empreiteiro` (empreita). Vêm dos
    CADASTROS (ponte `/api/storage`) casados pelo NOME (sem diferenciar
    maiúscula/acento) — sem cadastro com o nome, saem vazias. Só no corpo.
    O cadastro de Empreiteiros ganhou o campo **Endereço**.
  - Assinatura: o CONTRATANTE é o cliente da obra (era a empresa, no contrato
    de empreita); CPF/CNPJ abaixo de cada nome.
- 15/10/2026 (3): Dashboard, listas e códigos dos mapas. **Tem migration de
  dados** (`..._000400_codigo_do_mapa_por_obra`, fazer backup antes).
  - **Mapas**: código `MAPA-OBR-0011-02` → `MAPA-0002` e `numero_mapa` com 4
    dígitos (`02` → `0002`); cada obra tem a sua numeração, então `MAPA-0001`
    existe em mais de uma obra — a unicidade de `mapas.codigo` virou
    `(obra_id, codigo)`. Mantém o número que o mapa já tinha na obra; repetido
    ou ilegível recebe o próximo livre. Testada num MySQL descartável.
  - **Colunas "Obra" de Pagamentos/Recebimentos** (aba e geral) mostram o
    NOME da obra (antes o número); busca e filtro por obra usam o nome.
  - **Ordenação padrão** (a coluna fica marcada com ▼): Mapas (página e aba)
    por data de início (`created_at`) decrescente; Pagamentos e Recebimentos
    (página e aba) por data de solicitação decrescente.
  - **Dashboard**: grade 3x3 com 9 blocos — Mapas, Empreitas, Pagamentos,
    Recebimentos, Medição, Diário de obra (RDO), Diárias, Equipamentos
    (contratos) e Agenda; Relatórios por último, abaixo da grade, largura toda.
    Cada bloco: no máximo 2 filtros (status e obra), "Ver mais" que acrescenta
    5 lançamentos com o corpo rolando por dentro (o bloco não cresce — corpo
    de altura fixa, 5 linhas de ~53px). Estado em `dashboard-bloco.ts`
    (`BlocoLista`). Agenda abre em "Próximos" (compromissos de -30 a +90 dias;
    próximos primeiro, passados depois). Diárias ganhou `GET /api/diarias`
    (lista geral, 200 mais recentes, respeita obra vetada). Medição junta até
    20 obras em aberto (não existe lista geral de medições); Relatórios segue
    nas 5 primeiras. Os contadores "Mapas"/"Empreitas" do topo passaram a
    contar tudo (antes só os 5 do bloco).
