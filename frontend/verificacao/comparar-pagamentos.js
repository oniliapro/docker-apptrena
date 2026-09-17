const orig = require('./original-pagamentos.js');
const novo = require('./portado-pagamentos.js');
const casos = require('./casos-pagamentos.json');

let falhas = 0;
const r = (n) => Math.round(n * 1e6) / 1e6;

for (const caso of casos) {
  if (caso.lista) {
    const a = orig.gerarNumeroPagamento(caso.lista);
    const b = novo.gerarNumeroPagamento(caso.lista);
    const ok = a === b;
    if (!ok) falhas++;
    console.log(`${ok ? 'OK  ' : 'FALHA'} | ${caso.nome} | original=${a} portado=${b}`);
    continue;
  }

  const pa = orig.normalizarPagamento(caso.p);
  const pb = novo.normalizarPagamento(caso.p);

  const somaA = r(orig.calcularSomaItens(pa));
  const somaB = r(novo.calcularSomaItens(pb));
  const totalA = r(pa.valorTotal);
  const totalB = r(pb.valorTotal);
  const itensA = orig.expandirItensPagamento(pa).map(i => r(i.valorCalculado));
  const itensB = novo.expandirItensPagamento(pb).map(i => r(i.valorCalculado));

  const ok = somaA === somaB
    && totalA === totalB
    && JSON.stringify(itensA) === JSON.stringify(itensB);

  if (!ok) falhas++;
  console.log(
    `${ok ? 'OK  ' : 'FALHA'} | ${caso.nome}\n` +
    `        total: ${totalA} / ${totalB}   soma: ${somaA} / ${somaB}\n` +
    `        itens: [${itensA}] / [${itensB}]`
  );
}

// parsearBR também precisa bater — o original vive em 01-state.js
const parseOriginal = (v) => Number(String(v).replace(/[R$\s%]/g,'').replace(/\./g,'').replace(',','.')) || 0;
const entradas = ['R$ 1.234,56', '10,5 %', '', 'abc', '0,01', 'R$ 1.000.000,00', '-45,90'];
console.log('\n--- parsearBR ---');
for (const e of entradas) {
  const a = parseOriginal(e), b = novo.parsearBR(e);
  const ok = a === b;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHA'} | "${e}" -> ${a} / ${b}`);
}

console.log(`\n${falhas === 0 ? '✔ Todos os casos batem com o app original.' : '✖ ' + falhas + ' divergência(s).'}`);
process.exit(falhas ? 1 : 0);
