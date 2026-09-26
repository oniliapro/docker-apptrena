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
