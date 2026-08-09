/**
 * Paridade da engine do Mapa de Fornecedores.
 *
 * O ponto delicado aqui é o imposto: na linha do item ele incide só
 * sobre o item, mas na nota do fornecedor incide sobre itens + frete da
 * loja − desconto. Confundir as duas contas produz números plausíveis e
 * errados — e é justamente o que estes casos verificam.
 */
const original = require('./original-mapa.js');
const portado = require('./portado-mapa.js');
const casos = require('./casos-mapa.json');

const r = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Normaliza os itens: o original espera `choice` e `unit` como array. */
const prepararItens = (itens) =>
  itens.map((i) => ({ ...i, choice: i.choice === undefined ? null : i.choice }));

let falhas = 0;

for (const caso of casos) {
  const fornecedores = caso.fornecedores;
  const itens = prepararItens(caso.itens);
  const manual = Boolean(caso.modoManual);

  original.definirEstado(fornecedores, itens, manual);

  const problemas = [];

  // ---- Linha a linha: base, total com imposto, imposto ----
  itens.forEach((item, idx) => {
    fornecedores.forEach((_, si) => {
      const pares = [
        ['base', original.calcularBaseItemPorFornecedor(item, si), portado.calcularBaseItem(item, si)],
        ['total', original.calcularTotalItemPorFornecedor(item, si), portado.calcularTotalItem(item, si, fornecedores)],
        ['imposto', original.calcularImpostoItemPorFornecedor(item, si), portado.calcularImpostoItem(item, si, fornecedores)],
      ];
      for (const [nome, a, b] of pares) {
        if (r(a) !== r(b)) problemas.push(`item ${idx} forn ${si} ${nome}: ${r(a)} vs ${r(b)}`);
      }
    });

    // ---- Vencedor ----
    const va = original.obterVencedorEfetivoPorItem(item);
    const vb = portado.obterVencedorEfetivo(item, fornecedores, manual);
    const ia = va ? va.i : null;
    const ib = vb ? vb.indice : null;
    if (ia !== ib) problemas.push(`item ${idx} vencedor: ${ia} vs ${ib}`);
    if (va && vb && r(va.total) !== r(vb.total)) {
      problemas.push(`item ${idx} total vencedor: ${r(va.total)} vs ${r(vb.total)}`);
    }
  });

  // ---- Alocações ----
  const aa = original.obterAlocacoesEfetivasEstadoAtual();
  const ab = portado.obterAlocacoes(itens, fornecedores, manual);
  if (!igual(aa, ab)) {
    problemas.push(`alocacoes: ${JSON.stringify(aa)} vs ${JSON.stringify(ab)}`);
  }

  // ---- Notas por fornecedor ----
  const na = original.calcularNotasPorFornecedorDeAlocacoes({
    allocations: aa,
    includeShopFreight: true,
    discountsBySupplier: fornecedores.map((f) => Number(f.desconto) || 0),
  });
  const nb = portado.calcularNotasPorFornecedor(
    ab,
    itens,
    fornecedores,
    true,
    fornecedores.map((f) => Number(f.desconto) || 0),
  );

  ['itensBase', 'itensComImposto', 'frete', 'desconto', 'baseNota', 'impostoNota', 'totalNota'].forEach((k) => {
    if (r(na.totals[k]) !== r(nb.totals[k])) {
      problemas.push(`notas total ${k}: ${r(na.totals[k])} vs ${r(nb.totals[k])}`);
    }
    na.bySupplier.forEach((x, si) => {
      if (r(x[k]) !== r(nb.bySupplier[si][k])) {
        problemas.push(`nota forn ${si} ${k}: ${r(x[k])} vs ${r(nb.bySupplier[si][k])}`);
      }
    });
  });

  // ---- Cenários fracionado e integral ----
  const fa = original.calcularFracionadoPorFornecedor();
  const fb = portado.calcularFracionado(itens, fornecedores, manual);
  fa.forEach((x, si) => {
    if (r(x.totalItens) !== r(fb[si].totalItens)) {
      problemas.push(`fracionado ${si} itens: ${r(x.totalItens)} vs ${r(fb[si].totalItens)}`);
    }
    if (r(x.totalItensComFrete) !== r(fb[si].totalItensComFrete)) {
      problemas.push(
        `fracionado ${si} c/frete: ${r(x.totalItensComFrete)} vs ${r(fb[si].totalItensComFrete)}`,
      );
    }
    if (x.used !== fb[si].used) problemas.push(`fracionado ${si} used: ${x.used} vs ${fb[si].used}`);
  });

  const ga = original.calcularIntegralPorFornecedor();
  const gb = portado.calcularIntegral(itens, fornecedores);
  ga.forEach((x, si) => {
    if (r(x) !== r(gb[si])) problemas.push(`integral ${si}: ${r(x)} vs ${r(gb[si])}`);
  });

  if (problemas.length) {
    falhas++;
    console.log(`FALHA | ${caso.nome}`);
    problemas.forEach((p) => console.log(`        ${p}`));
  } else {
    const integral = gb.map((v) => r(v)).join(' / ');
    console.log(`OK    | ${caso.nome}\n        nota total=${r(nb.totals.totalNota)}  integral=[${integral}]`);
  }
}

console.log(
  `\n${falhas === 0 ? '✔ A engine do Mapa produz exatamente os mesmos números do app original.' : '✖ ' + falhas + ' caso(s) divergente(s).'}`,
);
process.exit(falhas ? 1 : 0);
