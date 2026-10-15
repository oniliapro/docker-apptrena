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

  // Os casos guardam o formato ANTIGO (um item com contrato/medição de várias categorias). O motor
  // novo trabalha com UMA linha por categoria — converte: uma linha nova para cada categoria que
  // aparece no item (contrato OU medição).
  const linhasNovas = [];
  itens.forEach((item, idx) => {
    const emp = item.contratoEmpPorTipo || {};
    const reserva = item.contratoReservaPorTipo || {};
    const acum = item.medicaoAcumByType || {};
    const atual = item.medicaoAtualByType || {};
    const tipos = [...new Set([...Object.keys(emp), ...Object.keys(reserva), ...Object.keys(acum), ...Object.keys(atual)])];
    for (const tipo of tipos) {
      linhasNovas.push({
        origem: idx,
        tipo,
        item: {
          id: `${item.id}-${tipo}`,
          descricao: item.desc,
          eapId: item.eapId,
          tipo,
          contratoEmp: Number(emp[tipo]) || 0,
          contratoReserva: Number(reserva[tipo]) || 0,
          medicaoAcum: acum[tipo] === undefined ? 0 : acum[tipo],
          // `null`/ausente = "em branco" (herda o acumulado), igual ao original.
          medicaoAtual: atual[tipo] === undefined ? null : atual[tipo],
        },
      });
    }
  });

  const b = portado.preparar(eapB, linhasNovas.map((l) => l.item), cabecalhoEap);

  const problemas = [];

  // Orçado por id — a base de toda a distribuição (ainda comparado com o original).
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

  // Medição/avanço: o original calcula por item (várias categorias); aqui cada categoria vira uma linha.
  // Orçado e avanço ainda são comparados com o original; contrato × avanço é asserção direta (o original
  // nunca leu o contrato lançado por categoria).
  let somaEmp = 0;
  let somaReserva = 0;
  let somaPagar = 0;
  let somaReservar = 0;
  let somaOrcado = 0;

  linhasNovas.forEach((nova, i) => {
    const lb = b.linhas[i];
    const la = original.calcularLinhaEmpreita(itens[nova.origem]);
    const t = nova.tipo;
    const rotulo = `linha ${nova.origem}/${t}`;

    if (r(la.orcadoPorTipo[t]) !== r(lb.orcado)) {
      problemas.push(`${rotulo} orcado: ${r(la.orcadoPorTipo[t])} vs ${r(lb.orcado)}`);
    }
    if (r(la.acumuladoPorTipo[t]) !== r(lb.acumulado)) {
      problemas.push(`${rotulo} acumulado: ${r(la.acumuladoPorTipo[t])} vs ${r(lb.acumulado)}`);
    }
    if (r(la.atualPorTipo[t]) !== r(lb.atual)) {
      problemas.push(`${rotulo} atual: ${r(la.atualPorTipo[t])} vs ${r(lb.atual)}`);
    }
    if (r(la.avancoPorTipo[t]) !== r(lb.avanco)) {
      problemas.push(`${rotulo} avanco: ${r(la.avancoPorTipo[t])} vs ${r(lb.avanco)}`);
    }

    const emp = nova.item.contratoEmp;
    const reserva = nova.item.contratoReserva;
    const pagarEsperado = emp * (lb.avanco / 100);
    const reservarEsperado = reserva * (lb.avanco / 100);
    if (r(lb.contrato) !== r(emp + reserva)) problemas.push(`${rotulo} contrato: esperado ${r(emp + reserva)}, veio ${r(lb.contrato)}`);
    if (r(lb.pagar) !== r(pagarEsperado)) problemas.push(`${rotulo} pagar: esperado ${r(pagarEsperado)} (contrato ${emp} × avanço ${r(lb.avanco)}%), veio ${r(lb.pagar)}`);
    if (r(lb.reservar) !== r(reservarEsperado)) problemas.push(`${rotulo} reservar: esperado ${r(reservarEsperado)}, veio ${r(lb.reservar)}`);
    if (r(lb.totalPeriodo) !== r(pagarEsperado + reservarEsperado)) problemas.push(`${rotulo} totalPeriodo: esperado ${r(pagarEsperado + reservarEsperado)}, veio ${r(lb.totalPeriodo)}`);

    somaEmp += emp;
    somaReserva += reserva;
    somaPagar += pagarEsperado;
    somaReservar += reservarEsperado;
    somaOrcado += lb.orcado;
  });

  // Retrocesso (medição atual menor que a acumulada) continua marcado como inválido, por item do original.
  itens.forEach((item, idx) => {
    const la = original.calcularLinhaEmpreita(item);
    const novas = linhasNovas.map((l, i) => ({ l, lb: b.linhas[i] })).filter(({ l }) => l.origem === idx);
    const reducaoNova = novas.some(({ lb }) => lb.reducaoInvalida);
    if (Boolean(la.reducaoInvalida) !== reducaoNova) {
      problemas.push(`linha ${idx} reducaoInvalida: ${la.reducaoInvalida} vs ${reducaoNova}`);
    }
  });

  // Totais consolidados: soma das linhas.
  const esperado = {
    orcadoTotal: r(somaOrcado),
    valorEmp: r(somaEmp),
    valorReserva: r(somaReserva),
    valorTotal: r(somaEmp + somaReserva),
    pagarEmp: r(somaPagar),
    reservarPgto: r(somaReservar),
    totalPeriodo: r(somaPagar + somaReservar),
  };
  if (!igual(esperado, rv(b.totais))) {
    problemas.push(`totais: esperado soma das linhas ${JSON.stringify(esperado)}, veio ${JSON.stringify(rv(b.totais))}`);
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
