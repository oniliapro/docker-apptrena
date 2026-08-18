# Onde a migração está — 26/07/2026

## Para ver funcionando

Duplo clique em **`INICIAR.bat`**. O navegador abre em `localhost:4200`.

Na tela de login use **"Entrar sem servidor"** — botão de revisão que só
aparece em desenvolvimento. Sem o backend Laravel no ar os dados não
carregam, mas as telas e todos os cálculos funcionam, porque rodam no
navegador.

Para conferir que os cálculos continuam corretos: duplo clique em
**`verificacao/VERIFICAR.bat`** (cinco suítes).

---

## Conversão do frontend: concluída

Nada do app vanilla ficou de fora, exceto o que foi descartado de
propósito (ver o fim desta seção).

**Casca e navegação** — menu lateral na estrutura do protótipo do Lucas,
barra superior com trilha, busca, botão "Lançar" e chip de usuário, box
de assinatura no rodapé.

**Autenticação** — login, token Sanctum, guarda de rotas, tratamento
central de sessão expirada, tempo limite de 15s nas requisições.

**Dashboard** — cinco indicadores e cards de lista.

**Obras** — lista com filtro e busca; página da obra com as doze abas do
protótipo, cada uma com URL própria.

**EAP** — tabela hierárquica editável, colunas por categoria alternáveis,
grupos que somam descendentes, BDI nos três escopos, totais e resumo por
categoria.

**Mapa de Fornecedores** — comparação de propostas com destaque do
vencedor, imposto e frete por fornecedor, os dois cenários de compra
(fracionada e integral) com cálculo da economia, e o **rateio por etapa
da obra** com travas de percentual e divisão do frete particular.

**Empreita** — serviços vinculados à EAP, medição percentual por
categoria, **reserva discricionária** (o diferencial do produto), e o
histórico de medições já fechadas.

**Pagamentos** — modal de rateio de itens em reais ou percentual com
validação da soma, e **leitura de nota fiscal por foto**, que preenche o
formulário automaticamente.

**Diário de Obra** — seletor de obra que lembra a escolha, formulário com
upload de fotos, lista com miniaturas.

**Navegação por teclado** em todas as tabelas — Tab e setas andam entre
células, Enter desce, Shift+`+` insere linha, Shift+`−` remove. Numa tela
de digitação intensa isso é diferença real de produtividade; virou uma
diretiva reutilizável (`shared/navegacao-tabela`), usada pelas quatro
tabelas.

### Descartado de propósito

Os painéis de autoteste (`eap/04-tests.js`, `mapa/04-tests.js`) e o demo
de redimensionar colunas. Os autotestes foram substituídos, com
vantagem, pelas suítes de `verificacao/` — que comparam contra o app
original em vez de checar invariantes na tela.

---

## O que falta

**Telas que nunca existiram**, vindas do protótipo: Clientes,
Responsáveis, Empreiteiros, Relatórios, e as abas Cronograma, Cronograma
de desembolso, Medições, Compras e Arquivos. Hoje são rotas navegáveis
com uma tela "área reservada".

**Integrações entre módulos** que dependem de decisões de modelagem:

- na EAP, a coluna de orçado x realizado (que cruza com os pagamentos) e
  o modal de gastos por item;
- no Mapa, o botão "finalizar mapa e gerar pagamentos", que criava
  pagamentos automaticamente a partir do mapa;
- no Mapa, a alocação de um item em múltiplas etapas pela interface — o
  cálculo já aceita várias etapas por item e está testado, mas a tela
  hoje oferece um campo único.

---

## O bloqueio principal

O `laravel-backend` **nunca foi executado**. Já validei que o SQL cria as
21 tabelas sem erro e que as migrations do Laravel cobrem todas elas —
mas provar que `php artisan migrate` roda exige PHP instalado.

Ver `_arquivo\Aplicativo-Lucas-versao-antiga\laravel-backend\INSTALAR.md`
e o plano em `Projetos\AMANHA.md` (se ainda existir fora do AppTrena).

---

## Sobre os cálculos

`verificacao/` roda o JavaScript original e o TypeScript novo lado a lado
e compara os números. Cinco suítes, 55 casos: Pagamentos, EAP, Mapa,
Empreita e o rateio dos resumos.

Isso não é cerimônia. Ao portar a Empreita os testes pegaram um erro
real: minha versão ignorava o BDI global da obra e considerava só o BDI
por item. O código rodava sem erro e produzia números plausíveis — só
menores que os corretos. Sem o comparador, apareceria meses depois, numa
medição paga a menos.

Rode `VERIFICAR.bat` sempre que mexer em cálculo.
