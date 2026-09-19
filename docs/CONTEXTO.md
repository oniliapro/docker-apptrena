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
- **Dev local:** duplo clique em `AppTrena-Angular/INICIAR-COM-BACKEND.bat`
  — sobe o Docker Desktop direto (não precisa mais de WSL) e o Angular
  (`localhost:4200`).
- **Portas:** backend `127.0.0.1:8088`, MySQL `3306`, phpMyAdmin `8084`,
  app antigo (vanilla, ainda em paralelo) `8080`.
- **Conferir cálculos:** `AppTrena-Angular/verificacao/VERIFICAR.bat`
  compara o JS original com o TypeScript novo (Pagamentos, EAP, Mapa,
  Empreita, Resumos, validação de CPF/CNPJ).

## Pontos vivos / decisões pendentes

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
