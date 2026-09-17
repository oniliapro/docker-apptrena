# Verificação de paridade

Compara os cálculos do código Angular com os do app vanilla original,
rodando os dois lado a lado sobre as mesmas entradas.

Isso existe porque a migração não pode mudar nenhum número. Um erro de
layout aparece na hora; um erro de cálculo aparece meses depois, numa
medição errada.

## Como rodar

Duplo clique em **`VERIFICAR.bat`** — compila os módulos e roda as duas
suítes.

Saída esperada: `Tudo certo: os números batem.`
Se algo divergir, o script mostra os dois valores lado a lado.

## O que é verificado

### Pagamentos (`comparar-pagamentos.js`)

Total, soma dos itens e valor resolvido de cada item, além do
`parsearBR` (leitura de "R$ 1.234,56"). Os casos cobrem os cantos que
quebram implementações ingênuas: formato legado de item único,
percentuais com dízima, pagamento sem `valorTotal` — que precisa ser
inferido — e mistura de itens em reais com itens em percentual.

### EAP (`comparar-eap.js`)

O módulo mais delicado do sistema. Verifica, item a item e no total:
custo direto, BDI aplicado, BDI por categoria, percentual efetivo,
total com BDI, a numeração automática da EAP e os somatórios de cada
grupo.

Os dez casos cobrem os três escopos de BDI e o que costuma dar errado
entre eles:

- **global percentual** — incide sobre o custo direto de cada item;
- **global valor fechado** — rateado proporcionalmente ao custo;
- **global valor com overrides** — itens que têm BDI próprio ficam
  *fora* do rateio, e essa exclusão muda o denominador de todos os
  outros;
- **por categoria com modos misturados** — percentual numa categoria,
  valor noutra, zero numa terceira;
- **escopo item** — a regra global é ignorada por completo;
- **sem BDI configurado**, **grupos com item de custo zero**, **formato
  legado** (`costs.orcado`, sem quantidade), **itens antes de qualquer
  grupo** (numeração de topo) e **modo deduzido** (quando `bdiMode` não
  vem gravado e precisa ser inferido de qual campo está preenchido).

## Como funciona

1. Carrega os arquivos originais do app vanilla sem alterá-los. No caso
   da EAP, eles declaram `const` no escopo global e dependem de
   variáveis compartilhadas entre três arquivos — então são lidos como
   texto e avaliados juntos, no mesmo escopo, com um shim mínimo de
   `window`.
2. Compila os módulos TypeScript equivalentes com esbuild.
3. Roda os dois sobre os casos dos arquivos `casos-*.json` e compara
   tudo, com arredondamento em 6 casas para absorver ruído de ponto
   flutuante sem esconder erro real.

## Ao portar um módulo novo

Escreva os casos **antes** de portar. É mais fácil descobrir a regra
real observando o que o código antigo faz com entradas esquisitas do
que lendo o código — e um caso escrito depois tende a confirmar o que
você já implementou, em vez de testar o que deveria acontecer.

Faltam portar: Mapa de Fornecedores (`js/mapa/*.js`, ~2.200 linhas, com
comparação de propostas) e Empreita (`js/empreita/*.js`, ~1.300 linhas,
com medições).
