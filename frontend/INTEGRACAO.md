# O que falta para ligar o Angular à API

Situação de 28/07/2026, com as seções de status atualizadas em
13/08/2026 (ver `docs/CONTEXTO.md`, que é a fonte de verdade sobre o
estado atual — este arquivo mantém o histórico de decisões e
implementações, mas pode ficar defasado no resumo do topo entre uma
atualização e outra).

> **Atualização 13/08/2026:** a migração da ponte chave-valor para os
> endpoints relacionais, descrita como pendente nas seções abaixo, foi
> concluída — Mapa, Empreita, Pagamentos e Relatórios também migraram
> (não só a EAP). A ponte genérica chave-valor não é mais usada por
> nenhuma dessas telas. As seções "O que já usa a API de verdade", "O
> que ainda passa pela ponte chave-valor" e "Ordem sugerida" abaixo
> descrevem o estado de 28/07 e ficaram desatualizadas nesse ponto — o
> restante do histórico (decisões, arquivos alterados) continua válido.

---

## O ponto central

O backend tem **duas formas** de guardar dados, e hoje o Angular usa
quase só a mais simples.

**A ponte chave-valor** (`GET/POST /api/storage`) guarda um JSON inteiro
sob uma chave, como `controleObra.eap.v2`. É o que o app vanilla sempre
usou. Funciona, mas o banco não entende o conteúdo: é um texto opaco.

**Os endpoints relacionais** (`/api/obras`, `/api/mapas`,
`/api/empreitas`, `/api/pagamentos`) guardam os dados em tabelas de
verdade, com colunas e relações. É o que permite consultar, cruzar e
relatar.

Migrar de um para o outro é a integração que falta.

---

## O que já usa a API de verdade

| Tela | Endpoint |
|---|---|
| Login, cadastro, sessão | `/login`, `/registrar`, `/me`, `/logout` |
| Lista de obras | `GET /obras` |
| Página da obra | `GET /obras/{id}` |
| **EAP** | `GET/PUT /obras/{id}/eap` (migrado 28/07/2026) |
| **Mapa de Fornecedores** | `/mapas` (migrado — ver `docs/CONTEXTO.md`) |
| **Empreita** | `/empreitas` (migrado — ver `docs/CONTEXTO.md`) |
| **Pagamentos** | `/pagamentos` (migrado — ver `docs/CONTEXTO.md`) |
| **Relatórios** | consome os endpoints relacionais (migrado — ver `docs/CONTEXTO.md`) |
| Diário de Obra | `GET/POST/DELETE /diario` |
| Histórico de medições | `GET /empreitas/{id}` |
| Leitura de nota fiscal | `POST /pagamentos/ler-nota` |

---

## O que ainda passa pela ponte chave-valor

**Atualizado 13/08/2026: nenhuma tela de EAP/Mapa/Empreita/Pagamentos/
Relatórios usa mais a ponte chave-valor** — todas migraram para os
endpoints relacionais (ver tabela acima e `docs/CONTEXTO.md`). A seção
abaixo descreve o estado de 28/07/2026, mantida como histórico de como
era antes da migração.

Desde a task "obra como contexto" (28/07/2026), as chaves abaixo eram
por obra (`...obra-{id}`) em vez de globais — mas ainda pela ponte
chave-valor, não pelos endpoints relacionais.

| Tela | Chave usada em 28/07 | Endpoint usado hoje |
|---|---|---|
| Mapa de Fornecedores | `controleObra.mapa.v1.obra-{id}` | `/mapas` (CRUD) |
| Empreita | `controleObra.empreita.v1.obra-{id}` | `/empreitas` (CRUD) + `/empreitas/{id}/registros` |
| Pagamentos | `controleObra.pagamentos.v1.obra-{id}` | `/pagamentos` (CRUD) |
| Relatórios (Pagamentos) | `controleObra.pagamentos.v1.obra-{id}` | consome os endpoints relacionais |

A EAP saiu dessa lista em 28/07/2026 — ver "Feito: EAP migrada pra API
relacional" mais abaixo. Os cadastros de Clientes, Responsáveis e
Empreiteiros continuam pela ponte (ver "Cadastros: falta backend").

---

## Feito: obra como contexto (28/07/2026)

Até 27/07/2026, a EAP, o Mapa, a Empreita e os Pagamentos eram
**globais**: existia uma EAP só no sistema inteiro, não importava qual
obra estivesse aberta. No banco, cada um desses já tem `obra_id` — eles
pertencem a uma obra — mas o frontend não usava isso.

A causa raiz tinha duas partes: (1) o Angular Router, por padrão, não
repassa os params da rota pai para os componentes filhos — as abas
viviam em `/obras/:id/eap` mas o `:id` nunca chegava ao componente; e
(2) cada store (EAP, Mapa, Empreita, Pagamentos) lia/gravava numa chave
fixa da ponte chave-valor (`controleObra.eap.v2`, sem obra), então toda
obra acabava lendo e escrevendo o mesmo registro.

**Corrigido:**
- `app.config.ts`: `provideRouter` ganhou
  `withRouterConfig({ paramsInheritanceStrategy: 'always' })`, para as
  abas herdarem o `:id` do pai.
- Cada componente de aba (`Eap`, `Mapa`, `Empreita`, `Pagamentos`) ganhou
  `readonly obraId = input.required<string>({ alias: 'id' })` e passa a
  chamar `store.carregar(this.obraId())` no `ngOnInit`.
- Cada store ganhou uma função `chave*(obraId)` que monta a chave por
  obra (`controleObra.eap.v2.obra-{id}`, etc.) em vez da chave fixa
  antiga, e um campo privado `obraId` usado em toda gravação.
- A Empreita e os Pagamentos também leem a EAP como referência (orçado,
  rótulos de etapa) — essa leitura também passou a ser pela chave da
  obra correta, em vez da chave global órfã.
- Não há migração automática do registro global antigo para dentro de
  cada obra: cada obra começa vazia nesses módulos, e quem tinha dados
  lançados antes da obra existir como contexto lança de novo. Copiar
  automaticamente seria o sistema decidindo por dados que são do
  usuário — mesmo princípio da task #45.
- As rotas de editor único sem obra (`/mapa`, `/empreita`, `/pagamentos`
  no nível raiz) foram removidas — só existem mais dentro da obra
  (`/obras/:id/mapas`, `/obras/:id/medicao-empreitas`,
  `/obras/:id/pagamentos`). As listas gerais `Mapas` e `Empreitas`
  (`/mapas`, `/empreitas`), que já usam os endpoints relacionais de
  verdade, não mudaram.

`relatorios.ts` também lia a chave global antiga da EAP (órfã desde essa
mudança) — foi corrigido no mesmo dia, ver a seção "Relatórios movido
pra dentro da obra" mais abaixo.

Nada na engine de cálculo mudou (`eap-engine.ts`, `mapa-engine.ts`,
`empreita-engine.ts`, `pagamentos-calc.ts`) — só persistência e
roteamento. A suíte `verificacao/` (`comparar-eap.js`,
`comparar-mapa.js`, `comparar-empreita.js`, `comparar-pagamentos.js`)
continua passando sem alteração, e `tsc --noEmit -p tsconfig.app.json`
compila limpo.

---

## Ordem sugerida

**Atualizado 13/08/2026: todos os itens abaixo estão feitos.** Mantido
como registro da ordem em que a migração foi planejada e executada.

**1. Obra como contexto — feito (28/07/2026).** As abas recebem o id da
obra e carregam os dados daquela obra, pela ponte chave-valor namespaced
por obra. Falta ainda migrar da ponte chave-valor para os endpoints
relacionais — isso é o que os itens 2 a 4 abaixo cobrem.

**2. EAP — feito (28/07/2026).** Migrada de `/storage` para
`GET/PUT /obras/{id}/eap`. O formato era idêntico; mudou só de onde vem.

**3. Pagamentos — feito.** Migrado para `/pagamentos`. Com os pagamentos
em tabela, foi possível reativar a coluna de **orçado x realizado** na
EAP (ver "Feito: Orçado x Realizado na EAP" mais abaixo).

**4. Mapa e Empreita — feito.** Migrados para `/mapas` e `/empreitas`,
incluindo as relações aninhadas (fornecedores, itens, preços, medições).

**5. Relatórios — feito.** Passou a consumir os endpoints relacionais.

---

## Cadastros: falta backend

Clientes, Responsáveis e Empreiteiros são telas novas — **não existem
endpoints nem tabelas** para elas. Hoje gravam pela ponte chave-valor,
o que funciona mas não permite relacionar um cliente a uma obra.

Para ficarem completos seria preciso, no backend: criar as migrations,
os models e os controllers. É trabalho no Laravel, não no Angular.

Enquanto isso não acontece, funcionam — só não se conectam ao resto.

---

## Implementado: contrato da Empreita por categoria (task #45)

O `EmpreitaController` já aceitava contrato **discriminado por categoria
de custo** (`contratoEmpPorTipo`, `contratoReservaPorTipo`); o frontend
até 27/07/2026 trabalhava com um valor único de empreita e um de
reserva, distribuídos automaticamente pela proporção do orçado.

**Decisão (28/07/2026):** o lançamento por categoria é definido pelo
usuário — ele digita o valor de cada categoria na tela — e não é mais
calculado/distribuído pelo sistema.

**Feito (28/07/2026):** a tela da Empreita agora tem um campo de
Contrato e um de Reserva por categoria de custo (mesma lista da EAP),
em vez do campo único de antes. As colunas "Total empreita"/"Total
reserva" continuam existindo, mas viraram somente leitura — mostram a
soma do que foi digitado nas categorias. O orçado da EAP continua
calculado e exibido (painel "Contrato x orçado"), só que agora é
referência, não entra mais na conta de quanto pagar.

Arquivos alterados: `empreita.models.ts` (troca `valorEmp`/`valorReserva`
por `contratoEmpPorTipo`/`contratoReservaPorTipo` no item),
`empreita-engine.ts` (remove a distribuição por participação, usa o
contrato lançado direto), `empreita.store.ts` e `empreita.ts` (novo
método/handler `atualizarContrato`/`editarContrato`), `empreita.html`
(colunas novas por categoria). A suíte `verificacao/casos-empreita.json`
e `comparar-empreita.js` foram atualizadas: o que não mudou (orçado,
medição/avanço) continua comparado com o app original; o contrato por
categoria passou a ser validado por cálculo direto (não faz mais sentido
comparar com o app original, que nunca teve esse comportamento) — inclui
um caso novo provando que o contrato digitado não precisa seguir a
proporção do orçado. `VERIFICAR.bat` roda tudo isso normalmente.

---

## Feito: Orçado x Realizado na EAP (28/07/2026)

Inspirado no protótipo mais amplo que o Lucas fez (`obracontrol.html`,
enviado por ele) — lá, quando a EAP está confirmada, cada item ganha uma
coluna "Realizado" clicável, que abre a lista de pagamentos vinculados
àquele item.

**Implementado:** a EAP agora tem colunas Orçado/Realizado, visíveis só
quando `isConfirmed` é verdadeiro. O vínculo já existia pronto — todo
item de pagamento (`ItemPagamento`) já tem um `eapId` desde antes, usado
pra rotular a etapa no formulário de Pagamentos. Bastou somar
`valorCalculado` de todo item de pagamento cujo `eapId` aponta pra cada
linha da EAP. Clicar no valor "Realizado" abre um modal com a lista de
pagamentos que compõem aquele total (número, fornecedor, data, valor).

A EAP (aba) agora também carrega os Pagamentos daquela obra só pra
calcular isso — cada aba mantém sua própria instância de
`PagamentosStore`, então isso não interfere na aba Pagamentos.

**Decisão tomada, com ressalva:** "Orçado" aqui é o total calculado ao
vivo (custo direto + BDI) — o mesmo valor de "Total + BDI" — e não um
valor congelado no momento da confirmação. No protótipo do Lucas o
`orcado` do item parece ser um número separado do cálculo (os valores de
exemplo não batem exatamente com o total calculado), o que sugere que
ele talvez queira congelar o orçado no momento da confirmação, pra não
virar um alvo móvel depois que a execução começa. Não implementei esse
congelamento — é uma mudança de modelo de dados maior, e o Lucas ainda
não confirmou se é isso mesmo que ele quer. Fica registrado aqui como
pendência de decisão.

**Outras pendências levantadas ao ler `obracontrol.html` com o Lucas:**

- **Nível da EAP:** no protótipo dele, o usuário escolhe o nível (1 a 4)
  de cada linha num select, e o índice ("1.2.3") é calculado a partir
  disso. No Angular hoje é ao contrário: o usuário marca se a linha é
  "grupo" (`isGroup`) ou não, e o nível de indentação é inferido de
  volta a partir do índice já calculado. São dois jeitos de pensar a
  mesma hierarquia — vale confirmar com ele qual bate melhor com o uso
  real.
- **Apagar valores unitários:** o protótipo tem duas ações de limpeza
  separadas — apagar todos os itens, e apagar só os valores unitários
  (mantendo descrição/quantidade/estrutura). Hoje o Angular só tem a
  limpeza total (`EapStore.limpar()`).
- **Multi-usuário/assinatura:** o protótipo tem uma casca inteira de
  SaaS (login com marca própria, plano ativo, usuário "principal"
  convidando outros) que não existe no AppTrena hoje — não dá pra saber
  se é a direção real do produto ou só uma peça de design/pitch.

Nenhuma engine de cálculo mudou nessa implementação — só a EAP passou a
ler os Pagamentos da obra como referência. `tsc --noEmit` compila limpo
e as suítes `comparar-eap.js`/`comparar-pagamentos.js` continuam
passando sem alteração.

---

## Feito: Relatórios movido pra dentro da obra + links quebrados corrigidos (28/07/2026)

Consequência direta da task "obra como contexto": o `Relatorios` nunca
fez sentido como página "geral" — ele cruza a EAP com os Pagamentos de
**uma** obra, e antes lia uma chave global única. Quando EAP e
Pagamentos passaram a ser por obra, aquela chave global ficou órfã e o
relatório sempre mostrava vazio.

**Feito:** `Relatorios` ganhou `obraId` (input `:id`, mesmo mecanismo da
EAP) e passou a ler pela chave da obra certa. A rota entrou em
`/obras/:id/relatorios` (era só "área reservada" antes), e a rota geral
`/relatorios` (sem `:id`, que já não fazia sentido) foi removida.

Isso expôs uma lacuna que passou despercebida quando as rotas gerais de
Mapa/Empreita/Pagamentos foram removidas: vários links pela aplicação
ainda apontavam pras rotas antigas. Corrigidos, todos apontando para
`/obras` (escolher a obra primeiro, já que mapa/empreita/pagamento/
relatório agora exigem uma):

- `app-shell.html` — "Novo pagamento" no menu "Lançar".
- `dashboard.html` — "Ver todos" de Pagamentos e de Relatórios.
- `mapas.html` — "+ Novo mapa".
- `empreitas.html` — "+ Nova empreita".
- `relatorios.html` — os links de EAP/Pagamentos no aviso de "sem dados", que agora apontam para as abas da própria obra (`../eap`, `../pagamentos`).

`tsc --noEmit` compila limpo; as 4 suítes de verificação continuam
passando (nenhuma engine de cálculo foi tocada).

---

## Feito: EAP migrada pra API relacional (28/07/2026)

Primeiro dos quatro módulos a sair da ponte chave-valor — exatamente o
item 2 da ordem sugerida acima. Só a EAP: o endpoint dela
(`ObraController::showEap`/`syncEap`, em `routes/api.php` linhas 38-39)
já existia pronto no backend, **sem nenhuma alteração feita por nós** —
conferi o código e o payload bate campo a campo com o que a tela já
produzia (`{header, ui, eapItems}`), então não mexemos em nada que
dependesse do Lucas confirmar. Os outros três (Mapa, Empreita,
Pagamentos) continuam na ponte — os endpoints deles (`/mapas`,
`/empreitas`, `/pagamentos`) ainda não foram conferidos como prontos
pro formato aninhado que essas telas usam, e são maiores/mais
arriscados de migrar sem isso confirmado.

**O que mudou:**
- `EapStore` (`carregar`/`salvar`) agora chama `ApiService.obterEap`/
  `salvarEap` (`GET/PUT /obras/{id}/eap`) em vez de
  `ArmazenamentoService.ler`/`gravar` na chave `controleObra.eap.v2.obra-{id}`.
- Corrigido `EapItem` e `ChaveTipoCusto` em `core/models/api.models.ts`
  — estavam com nomes de campo/chaves de categoria que não batiam com o
  que o backend realmente devolve nem com o seeder `TiposCustoSeeder`
  (tinham `mao`/`equip`/`admin`; o seeder real usa `maoDeObra`/
  `equipamento`/`administracao`, iguais ao `ChaveTipo` do frontend).
  Esses tipos não eram usados em nenhum outro lugar, então corrigir não
  quebrou nada — só estavam errados e nunca tinham sido testados.
- **Consequência importante:** três lugares que liam a EAP só como
  referência (não gravam, só leem) também precisaram migrar pro mesmo
  endpoint, porque a chave antiga da ponte ficou órfã assim que a EAP
  passou a gravar só no banco relacional:
  - `EmpreitaStore.carregarEap()` — orçado de referência.
  - `PagamentosStore.carregarSnapshotEap()` — rótulo de etapa.
  - `Relatorios.carregar()` — comparação orçado x realizado.

**Importante — ainda falta testar no ambiente real:** este sandbox não
tem Docker, então não dá pra validar contra o MySQL/Laravel de verdade
aqui — só verifiquei lendo o código do `ObraController` e comparando
com o payload que o Angular monta, e rodei `tsc --noEmit` (limpo) e a
suíte de cálculo (`comparar-eap.js` etc., que não testam persistência,
só a matemática). **Antes de considerar isso pronto, rode
`INICIAR-COM-BACKEND.bat` e teste na prática:** abrir uma obra, editar a
EAP, recarregar a página e confirmar que os dados vieram do banco (não
do navegador) — e conferir que Empreita/Pagamentos/Relatórios daquela
obra continuam mostrando a EAP certa como referência.

---

## O que não é bloqueio

O app **funciona hoje**, com a ponte chave-valor e o fallback para o
navegador. Dá para usar, revisar e demonstrar. A migração para os
endpoints relacionais melhora consulta, relatórios e integridade dos
dados — não é pré-requisito para o sistema rodar.
