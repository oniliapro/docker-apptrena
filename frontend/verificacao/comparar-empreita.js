/**
 * Paridade da engine da Empreita.
 *
 * Duas partes bem diferentes desde a task #45 (28/07/2026):
 *
 * 1. O que NÃO mudou continua comparado contra o app original: o orçado
 *    lido da EAP (base de referência na tela) e a lógica de medição/
 *    avanço (acumulado, atual, retrocesso inválido).
 *
 * 2. O que mudou por decisão de produto (contrato deixou de ser
 *    distribuído automaticamente pelo orçado e passou a ser lançado
 *    pelo usuário, por categoria) não é mais comparado contra o app
 *    original — ele nunca teve esse comportamento, então "divergir" dele
 *    aqui é o esperado, não um bug. Em vez disso, essa parte é validada
 *    por asserção direta: dado o contrato lançado por categoria e o
 *    avanço medido, o valor a pagar/reservar de cada categoria bate
 *    exatamente com `contrato × avanço%`, sem qualquer participação do
 *    orçado.
 */
const original = require('./original-empreita.js');
const portado = require('./portado-empreita.js');
const casos = require('./casos-empreita.json');

const r = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const rv = (obj) => {
  const saida = {};
  for (const k of Object.keys(obj || {})) saida[k] = r(obj[k]);
  return saida;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let falhas = 0;

for (const caso of casos) {
  const eapA = JSON.parse(JSON.stringify(caso.eap));
  const eapB = JSON.parse(JSON.stringify(caso.eap));
  const itens = JSON.parse(JSON.stringify(caso.itens));
  const cabecalho = caso.cabecalho;

  // O original espera o snapshot da EAP já normalizado no formato dele.
  const snapshot = eapA.map((x) => ({
    id: String(x.id || ''),
    isGroup: Boolean(x.isGroup),
    eap: String(x.eap || ''),
    desc: String(x.desc || ''),
    qtde: Number(x.qtde) || 0,
    unit: {
      material: Number(x.unit?.material) || 0,
      maoDeObra: Number(x.unit?.maoDeObra) || 0,
      equipamento: Number(x.unit?.equipamento) || 0,
      outros: Number(x.unit?.outros) || 0,
      administracao: Number(x.unit?.administracao) || 0,
    },
    bdiMode: x.bdiMode === 'value' ? 'value' : 'pct',
    bdiPercent: Number(x.bdiPercent) || 0,
    bdiValue: Number(x.bdiValue) || 0,
  }));

  const cabecalhoEap = caso.cabecalhoEap || null;

  original.definirEstado(snapshot, itens, cabecalho, cabecalhoEap);
  const b = portado.preparar(eapB, itens, cabecalho, cabecalhoEap);

  const problemas = [];

  // Categorias consideradas
  const tiposA = original.obterTiposIncluidos();
  if (!igual(tiposA, b.tipos)) problemas.push(`tipos: [${tiposA}] vs [${b.tipos}]`);

  // Orçado por id — a base de toda a distribuição
  for (const item of snapshot) {
    const oa = original.obterOrcadoEapPorId(item.id);
    const ob = b.orcado.get(item.id);
    if (!oa && !ob) continue;
    if (!oa || !ob) {
      problemas.push(`orcado ${item.id}: ${!!oa} vs ${!!ob}`);
      continue;
    }
    if (r(oa.total) !== r(ob.total)) {
      problemas.push(`orcado ${item.id} total: ${r(oa.total)} vs ${r(ob.total)}`);
    }
    if (!igual(rv(oa.totalPorTipo), rv(ob.totalPorTipo))) {
      problemas.push(`orcado ${item.id} porTipo diverge`);
    }
  }

  // Linha a linha — só o que a task #45 NÃO mudou é comparado com o original.
  itens.forEach((item, idx) => {
    const la = original.calcularLinhaEmpreita(item);
    const lb = b.linhas[idx];

    // Orçado e medição/avanço: lógica intocada, ainda tem que bater com o original.
    if (r(la.orcadoTotal) !== r(lb.orcadoTotal)) {
      problemas.push(`linha ${idx} orcadoTotal: ${r(la.orcadoTotal)} vs ${r(lb.orcadoTotal)}`);
    }
    if (!igual(rv(la.orcadoPorTipo), rv(lb.orcadoPorTipo))) {
      problemas.push(`linha ${idx} orcadoPorTipo diverge do original`);
    }
    if (la.temAvanco !== lb.temAvanco) {
      problemas.push(`linha ${idx} temAvanco: ${la.temAvanco} vs ${lb.temAvanco}`);
    }
    if (la.reducaoInvalida !== lb.reducaoInvalida) {
      problemas.push(`linha ${idx} reducaoInvalida: ${la.reducaoInvalida} vs ${lb.reducaoInvalida}`);
    }
    if (!igual(la.tiposInvalidos, lb.tiposInvalidos)) {
      problemas.push(`linha ${idx} tiposInvalidos: [${la.tiposInvalidos}] vs [${lb.tiposInvalidos}]`);
    }
    const mapasMedicao = ['acumuladoPorTipo', 'atualPorTipo', 'avancoPorTipo'];
    for (const k of mapasMedicao) {
      if (!igual(rv(la[k]), rv(lb[k]))) {
        problemas.push(`linha ${idx} ${k}: ${JSON.stringify(rv(la[k]))} vs ${JSON.stringify(rv(lb[k]))}`);
      }
    }

    // Contrato por categoria (task #45): não compara com o original — o
    // original nunca leu contratoEmpPorTipo/contratoReservaPorTipo, sempre
    // distribuiu pelo orçado. Aqui a asserção é direta: pagar/reservar de
    // cada categoria = contrato lançado naquela categoria × avanço%, sem
    // qualquer participação do orçado.
    const item45 = itens[idx];
    const empPorTipo = item45.contratoEmpPorTipo || {};
    const reservaPorTipo = item45.contratoReservaPorTipo || {};
    let somaEmp = 0;
    let somaReserva = 0;
    let somaPagar = 0;
    let somaReservar = 0;
    for (const k of lb.tipos) {
      const emp = Number(empPorTipo[k]) || 0;
      const reserva = Number(reservaPorTipo[k]) || 0;
      const avanco = Number(lb.avancoPorTipo[k]) || 0;
      somaEmp += emp;
      somaReserva += reserva;

      const pagarEsperado = emp * (avanco / 100);
      const reservarEsperado = reserva * (avanco / 100);
      somaPagar += pagarEsperado;
      somaReservar += reservarEsperado;

      if (r(lb.contratoPorTipo[k]) !== r(emp + reserva)) {
        problemas.push(`linha ${idx} contratoPorTipo[${k}]: esperado ${r(emp + reserva)}, veio ${r(lb.contratoPorTipo[k])}`);
      }
      if (r(lb.pagarPorTipo[k]) !== r(pagarEsperado)) {
        problemas.push(`linha ${idx} pagarPorTipo[${k}]: esperado ${r(pagarEsperado)} (contrato ${emp} × avanço ${avanco}%), veio ${r(lb.pagarPorTipo[k])}`);
      }
      if (r(lb.reservarPorTipo[k]) !== r(reservarEsperado)) {
        problemas.push(`linha ${idx} reservarPorTipo[${k}]: esperado ${r(reservarEsperado)}, veio ${r(lb.reservarPorTipo[k])}`);
      }
    }

    if (r(lb.valorEmp) !== r(somaEmp)) problemas.push(`linha ${idx} valorEmp: esperado soma ${r(somaEmp)}, veio ${r(lb.valorEmp)}`);
    if (r(lb.valorReserva) !== r(somaReserva)) problemas.push(`linha ${idx} valorReserva: esperado soma ${r(somaReserva)}, veio ${r(lb.valorReserva)}`);
    if (r(lb.valorTotal) !== r(somaEmp + somaReserva)) problemas.push(`linha ${idx} valorTotal: esperado ${r(somaEmp + somaReserva)}, veio ${r(lb.valorTotal)}`);
    if (r(lb.pagarEmp) !== r(somaPagar)) problemas.push(`linha ${idx} pagarEmp: esperado ${r(somaPagar)}, veio ${r(lb.pagarEmp)}`);
    if (r(lb.reservarPgto) !== r(somaReservar)) problemas.push(`linha ${idx} reservarPgto: esperado ${r(somaReservar)}, veio ${r(lb.reservarPgto)}`);
    if (r(lb.totalPeriodo) !== r(somaPagar + somaReservar)) problemas.push(`linha ${idx} totalPeriodo: esperado ${r(somaPagar + somaReservar)}, veio ${r(lb.totalPeriodo)}`);
  });

  // Totais consolidados: conferência de soma (não é mais comparação com o
  // original, pelo mesmo motivo da task #45 acima).
  const totaisEsperados = b.linhas.reduce(
    (acc, l) => ({
      orcadoTotal: acc.orcadoTotal + l.orcadoTotal,
      valorEmp: acc.valorEmp + l.valorEmp,
      valorReserva: acc.valorReserva + l.valorReserva,
      valorTotal: acc.valorTotal + l.valorTotal,
      pagarEmp: acc.pagarEmp + l.pagarEmp,
      reservarPgto: acc.reservarPgto + l.reservarPgto,
      totalPeriodo: acc.totalPeriodo + l.totalPeriodo,
    }),
    { orcadoTotal: 0, valorEmp: 0, valorReserva: 0, valorTotal: 0, pagarEmp: 0, reservarPgto: 0, totalPeriodo: 0 },
  );
  if (!igual(rv(totaisEsperados), rv(b.totais))) {
    problemas.push(`totais: esperado soma das linhas ${JSON.stringify(rv(totaisEsperados))}, veio ${JSON.stringify(rv(b.totais))}`);
  }

  if (problemas.length) {
    falhas++;
    console.log(`FALHA | ${caso.nome}`);
    problemas.forEach((p) => console.log(`        ${p}`));
  } else {
    console.log(
      `OK    | ${caso.nome}\n        pagar=${r(b.totais.pagarEmp)} reserva=${r(b.totais.reservarPgto)} periodo=${r(b.totais.totalPeriodo)}`,
    );
  }
}

console.log(
  `\n${falhas === 0 ? '✔ Orçado e medição batem com o app original; contrato por categoria (task #45) confere por cálculo direto.' : '✖ ' + falhas + ' caso(s) divergente(s).'}`,
);
process.exit(falhas ? 1 : 0);
