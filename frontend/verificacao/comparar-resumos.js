/**
 * Paridade do rateio dos resumos do Mapa.
 *
 * Verifica as três contas que decidem de qual etapa da obra sai cada
 * real: como o valor de um item se divide entre etapas, como o frete e o
 * desconto de uma nota se dividem entre elas (com travas), e como o
 * frete particular se divide entre fornecedores.
 */
const original = require('./original-resumos.js');
const portado = require('./portado-resumos.js');
const casos = require('./casos-resumos.json');

const r = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const rv = (obj) => {
  const saida = {};
  for (const k of Object.keys(obj || {})) saida[k] = r(obj[k]);
  return saida;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let falhas = 0;

// ---- 1) Rateio de um item entre etapas ----
console.log('--- rateio do item entre etapas ---');
for (const caso of casos.rateios) {
  const a = original.obterRateiosEtapaItem(caso.item).map((x) => ({
    etapaKey: x.etapaKey,
    fator: r(x.fator),
  }));
  const b = portado.obterRateiosDoItem(caso.item).map((x) => ({
    etapaKey: x.etapaKey,
    fator: r(x.fator),
  }));

  const ok = igual(a, b);
  if (!ok) falhas++;
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} | ${caso.nome}\n        ${JSON.stringify(a)}${ok ? '' : '\n        ' + JSON.stringify(b)}`,
  );
}

// ---- 2) Redistribuição de percentuais entre etapas ----
console.log('\n--- redistribuicao entre etapas (com travas) ---');
for (const caso of casos.redistribuicoes) {
  const base = new Map(Object.entries(caso.base).map(([k, v]) => [k, Number(v)]));

  // O original altera um objeto de estado; montamos o formato que ele espera.
  const estado = {
    fretePctByEtapa: { 0: { ...caso.atuais } },
    descPctByEtapa: {},
    lockByEtapa: { 0: { ...caso.travadas } },
  };

  original.redistribuirPercentuaisEtapaPorFornecedor({
    si: 0,
    etapas: caso.etapas,
    baseByEtapa: base,
    estado,
    kind: 'frete',
  });

  const a = rv(estado.fretePctByEtapa[0]);
  const b = rv(portado.redistribuirPercentuaisPorEtapa(caso.etapas, base, caso.atuais, caso.travadas));

  const ok = igual(a, b);
  if (!ok) falhas++;

  const soma = r(Object.values(b).reduce((acc, v) => acc + v, 0));
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} | ${caso.nome}\n        ${JSON.stringify(a)} (soma ${soma})` +
      (ok ? '' : `\n        portado: ${JSON.stringify(b)}`),
  );
}

// ---- 3) Frete particular entre ETAPAS ----
// O app antigo repartia o frete particular entre FORNECEDORES, com percentual editável. Desde 17/08/2026
// (pedido do Lucas) o freteiro entra no rateio "como se fosse um fornecedor" e é sempre proporcional ao
// que cada etapa representa no mapa — por isso não há mais o que comparar com o original: a asserção
// é direta (cada etapa recebe frete × total da etapa / total geral, e a soma fecha com o frete).
console.log('\n--- frete particular entre etapas (asserção direta) ---');
const casosFrete = [
  {
    nome: 'duas etapas, sem imposto',
    frete: 1000,
    fornecedores: [{ nome: 'F1', ativo: true, imposto: 0, frete: 0, desconto: 0 }],
    itens: [
      { desc: 'A', qtde: 10, unit: [100], etapas: [{ eapId: 'E1', valor: 100 }] },
      { desc: 'B', qtde: 5, unit: [200], etapas: [{ eapId: 'E2', valor: 100 }] },
    ],
    esperado: { E1: 500, E2: 500 },
  },
  {
    nome: 'item dividido 60/40 entre etapas, com imposto de 10%',
    frete: 330,
    fornecedores: [{ nome: 'F1', ativo: true, imposto: 10, frete: 0, desconto: 0 }],
    itens: [{ desc: 'A', qtde: 10, unit: [100], etapas: [{ eapId: 'E1', valor: 60 }, { eapId: 'E2', valor: 40 }] }],
    esperado: { E1: 198, E2: 132 },
  },
  {
    nome: 'item sem etapa cai em "Sem etapa"',
    frete: 80,
    fornecedores: [{ nome: 'F1', ativo: true, imposto: 0, frete: 0, desconto: 0 }],
    itens: [{ desc: 'A', qtde: 1, unit: [50] }],
    esperado: { 'Sem etapa': 80 },
  },
  {
    nome: 'total zero: nada a ratear',
    frete: 500,
    fornecedores: [{ nome: 'F1', ativo: true, imposto: 0, frete: 0, desconto: 0 }],
    itens: [{ desc: 'A', qtde: 0, unit: [100], etapas: [{ eapId: 'E1', valor: 100 }] }],
    esperado: {},
  },
];

for (const caso of casosFrete) {
  const alocacoes = caso.itens.map((_, itemIndex) => ({ itemIndex, supplierIndex: 0 }));
  const mapa = portado.ratearFreteiro(caso.itens, caso.fornecedores, alocacoes, caso.frete);
  const b = rv(Object.fromEntries(mapa));
  const a = rv(caso.esperado);
  const soma = Object.values(b).reduce((x, y) => x + y, 0);
  const somaOk = Object.keys(caso.esperado).length === 0 || r(soma) === r(caso.frete);
  const ok = igual(a, b) && somaOk;
  if (!ok) falhas++;
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} | ${caso.nome}\n        ${JSON.stringify(b)} (soma ${r(soma)})` +
      (ok ? '' : `\n        esperado: ${JSON.stringify(a)}`),
  );
}

console.log(
  `\n${falhas === 0 ? '✔ O rateio dos resumos produz exatamente os mesmos números do app original.' : '✖ ' + falhas + ' caso(s) divergente(s).'}`,
);
process.exit(falhas ? 1 : 0);
