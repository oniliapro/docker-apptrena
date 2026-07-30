/**
 * Paridade da engine da EAP: roda o JavaScript original e o TypeScript
 * portado sobre os mesmos casos e compara todos os números.
 *
 * A EAP é o módulo onde um erro custa mais caro — o BDI entra em três
 * escopos diferentes, com overrides por item e rateio proporcional. Um
 * centavo de diferença aqui vira medição errada lá na frente.
 */
const original = require('./original-eap.js');
const portado = require('./portado-eap.js');
const casos = require('./casos-eap.json');

/** Arredonda para 6 casas: absorve ruído de ponto flutuante, não erro real. */
const r = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const rv = (obj) => {
  const saida = {};
  for (const k of Object.keys(obj || {})) saida[k] = r(obj[k]);
  return saida;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let falhas = 0;

for (const caso of casos) {
  // Cada lado recebe sua própria cópia — normalizar altera os itens.
  const a = original.calcular(JSON.parse(JSON.stringify(caso.itens)), caso.header);
  const b = portado.calcular(JSON.parse(JSON.stringify(caso.itens)), caso.header);

  const problemas = [];

  // Numeração automática da EAP
  const eapA = a.itens.map((i) => i.eap);
  const eapB = b.itens.map((i) => i.eap);
  if (!igual(eapA, eapB)) problemas.push(`numeracao: [${eapA}] vs [${eapB}]`);

  // Totais gerais
  const totaisA = [r(a.cache.totalsDirect), r(a.cache.totalsBdi), r(a.cache.totalsWithBdi)];
  const totaisB = [r(b.cache.totalsDirect), r(b.cache.totalsBdi), r(b.cache.totalsWithBdi)];
  if (!igual(totaisA, totaisB)) problemas.push(`totais: [${totaisA}] vs [${totaisB}]`);

  if (!igual(rv(a.cache.totalsDirectByType), rv(b.cache.totalsDirectByType))) {
    problemas.push('totalsDirectByType diverge');
  }
  if (!igual(rv(a.cache.totalsBdiByType), rv(b.cache.totalsBdiByType))) {
    problemas.push(
      `totalsBdiByType: ${JSON.stringify(rv(a.cache.totalsBdiByType))} vs ${JSON.stringify(rv(b.cache.totalsBdiByType))}`,
    );
  }

  // Linha a linha
  for (let i = 0; i < a.itens.length; i++) {
    const campos = ['directTotal', 'bdiApplied', 'totalWithBdi', 'bdiPctApplied'];
    for (const campo of campos) {
      const va = r(a.cache[campo][i]);
      const vb = r(b.cache[campo][i]);
      if (va !== vb) problemas.push(`item ${i} ${campo}: ${va} vs ${vb}`);
    }

    const overA = a.cache.bdiOverrideValue[i];
    const overB = b.cache.bdiOverrideValue[i];
    const normOver = (v) => (v === null || v === undefined ? null : r(v));
    if (normOver(overA) !== normOver(overB)) {
      problemas.push(`item ${i} override: ${overA} vs ${overB}`);
    }

    if (!igual(rv(a.cache.bdiByType[i]), rv(b.cache.bdiByType[i]))) {
      problemas.push(`item ${i} bdiByType diverge`);
    }
  }

  // Totais de cada grupo
  for (let i = 0; i < a.itens.length; i++) {
    if (!a.itens[i].isGroup) continue;
    const ga = original.somarGrupo(i, a.cache);
    const gb = portado.somarGrupo(i, b.itens, b.cache);
    const chaves = ['directTotal', 'bdiApplied', 'totalWithBdi', 'bdiPctApplied'];
    for (const k of chaves) {
      if (r(ga[k]) !== r(gb[k])) problemas.push(`grupo ${i} ${k}: ${r(ga[k])} vs ${r(gb[k])}`);
    }
    if (!igual(rv(ga.directByType), rv(gb.directByType))) {
      problemas.push(`grupo ${i} directByType diverge`);
    }
  }

  if (problemas.length) {
    falhas++;
    console.log(`FALHA | ${caso.nome}`);
    problemas.forEach((p) => console.log(`        ${p}`));
  } else {
    console.log(
      `OK    | ${caso.nome}` +
        `\n        direto=${r(a.cache.totalsDirect)} bdi=${r(a.cache.totalsBdi)} total=${r(a.cache.totalsWithBdi)}`,
    );
  }
}

console.log(
  `\n${falhas === 0 ? '✔ A engine da EAP produz exatamente os mesmos números do app original.' : '✖ ' + falhas + ' caso(s) divergente(s).'}`,
);
process.exit(falhas ? 1 : 0);
