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

// ---- 3) Frete particular entre fornecedores ----
console.log('\n--- frete particular entre fornecedores ---');
for (const caso of casos.freteParticular) {
  const base = {};
  for (const [k, v] of Object.entries(caso.base)) base[Number(k)] = Number(v);

  const estado = { privateFretePctBySupplier: {} };
  original.redistribuirPercentuaisFreteParticular({
    usados: caso.usados,
    basePorFornecedor: base,
    estado,
  });

  const a = rv(estado.privateFretePctBySupplier);
  const b = rv(portado.redistribuirFreteParticular(caso.usados, base));

  const ok = igual(a, b);
  if (!ok) falhas++;
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} | ${caso.nome}\n        ${JSON.stringify(a)}` +
      (ok ? '' : `\n        portado: ${JSON.stringify(b)}`),
  );
}

console.log(
  `\n${falhas === 0 ? '✔ O rateio dos resumos produz exatamente os mesmos números do app original.' : '✖ ' + falhas + ' caso(s) divergente(s).'}`,
);
process.exit(falhas ? 1 : 0);
