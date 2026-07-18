/* ===== ENGINE (Empreita: cálculos de medição/pagamento) ===== */

function obterEapPorId(id) {
  const key = String(id || "");
  if (!key) return null;
  return snapshotEap.find((x) => x.id === key) || null;
}

function obterTiposIncluidos() {
  const chaves = TIPOS_CUSTO_EMPREITA
    .filter((t) => cabecalhoEmpreita.typesIncluded?.[t.key])
    .map((t) => t.key);
  return chaves.length ? chaves : TIPOS_CUSTO_EMPREITA.map((t) => t.key);
}

function rotuloEapDoSnapshot(itemEap) {
  if (!itemEap) return "—";
  const e = String(itemEap.eap || "").trim();
  const d = String(itemEap.desc || "").trim();
  if (e && d) return `${e} - ${d}`;
  if (e) return e;
  if (d) return d;
  return "—";
}

function somarPorTipo(b) {
  let soma = 0;
  TIPOS_CUSTO_EMPREITA.forEach((t) => { soma += Number(b?.[t.key]) || 0; });
  return soma;
}

function multiplicarPorTipo(b, fator) {
  const out = criarVazioPorTipo();
  const f = Number(fator) || 0;
  TIPOS_CUSTO_EMPREITA.forEach((t) => { out[t.key] = (Number(b?.[t.key]) || 0) * f; });
  return out;
}

function somarEmPorTipo(destino, adicionar) {
  TIPOS_CUSTO_EMPREITA.forEach((t) => {
    destino[t.key] = (Number(destino?.[t.key]) || 0) + (Number(adicionar?.[t.key]) || 0);
  });
  return destino;
}

function ehDescendente(eapPai, eapFilho) {
  const p = String(eapPai || "").trim();
  const c = String(eapFilho || "").trim();
  if (!p || !c) return false;
  return c.startsWith(p + ".");
}

function calcularValorOverrideBdi(item, totalDireto) {
  const modo = (item?.bdiMode === "value") ? "value" : "pct";

  if (modo === "value") {
    const v = Number(item?.bdiValue) || 0;
    return v > 0 ? v : null;
  }

  const p = Number(item?.bdiPercent) || 0;
  if (p <= 0) return null;
  return (Number(totalDireto) || 0) * (p / 100);
}

let _versaoCacheOrcadoEap = -1;
let _orcadoEapPorId = new Map();

function calcularCacheOrcadoEap() {
  const n = snapshotEap.length;

  const diretoPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());
  const totalDireto = Array.from({ length: n }, () => 0);

  const valorOverrideBdi = Array.from({ length: n }, () => null);
  const bdiAplicado = Array.from({ length: n }, () => 0);
  const bdiPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());

  const totalPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());
  const totalComBdi = Array.from({ length: n }, () => 0);

  // 1) Totais diretos (itens-base)
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;

    const q = Number(it.qtde) || 0;
    const unit = normalizarPorTipo(it.unit);
    const tot = multiplicarPorTipo(unit, q);

    diretoPorTipo[i] = tot;
    totalDireto[i] = somarPorTipo(tot);
  }

  // 2) Overrides do BDI por item (somente itens-base)
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;
    valorOverrideBdi[i] = calcularValorOverrideBdi(it, totalDireto[i]);
  }

  const modoGlobal = (snapshotCabecalhoEap?.bdiMode === "value") ? "value" : "pct";
  const bdiValorGlobal = Number(snapshotCabecalhoEap?.bdiValue) || 0;
  const bdiPercentualGlobal = Number(snapshotCabecalhoEap?.bdiPercent) || 0;

  // 3) BDI aplicado (apenas itens-base)
  if (modoGlobal === "value" && bdiValorGlobal > 0) {
    let somaDiretoSemOverride = 0;
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;
      if (valorOverrideBdi[i] !== null) continue;
      somaDiretoSemOverride += totalDireto[i];
    }

    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;

      if (valorOverrideBdi[i] !== null) {
        bdiAplicado[i] = valorOverrideBdi[i];
      } else {
        bdiAplicado[i] = (somaDiretoSemOverride > 0)
          ? bdiValorGlobal * (totalDireto[i] / somaDiretoSemOverride)
          : 0;
      }
    }
  } else if (modoGlobal === "pct" && bdiPercentualGlobal > 0) {
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;

      if (valorOverrideBdi[i] !== null) bdiAplicado[i] = valorOverrideBdi[i];
      else bdiAplicado[i] = totalDireto[i] * (bdiPercentualGlobal / 100);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;
      bdiAplicado[i] = (valorOverrideBdi[i] !== null) ? valorOverrideBdi[i] : 0;
    }
  }

  // 4) Distribui BDI por tipo (itens-base) e calcula total com BDI
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;

    const totalBase = totalDireto[i];
    const bdi = bdiAplicado[i];

    if (totalBase > 0 && bdi > 0) {
      TIPOS_CUSTO_EMPREITA.forEach((t) => {
        const share = (Number(diretoPorTipo[i]?.[t.key]) || 0) / totalBase;
        bdiPorTipo[i][t.key] = bdi * share;
      });
    }

    TIPOS_CUSTO_EMPREITA.forEach((t) => {
      totalPorTipo[i][t.key] = (Number(diretoPorTipo[i]?.[t.key]) || 0) + (Number(bdiPorTipo[i]?.[t.key]) || 0);
    });

    totalComBdi[i] = totalBase + bdi;
  }

  // 5) Totais por grupo (somatório de descendentes)
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || !it.isGroup) continue;

    const eap = String(it.eap || "").trim();
    if (!eap) continue;

    const acumDiretoPorTipo = criarVazioPorTipo();
    const acumBdiPorTipo = criarVazioPorTipo();
    let acumDireto = 0;
    let acumBdi = 0;

    for (let j = 0; j < n; j++) {
      const filho = snapshotEap[j];
      if (!filho || filho.isGroup) continue;
      if (!ehDescendente(eap, filho.eap)) continue;

      somarEmPorTipo(acumDiretoPorTipo, diretoPorTipo[j]);
      somarEmPorTipo(acumBdiPorTipo, bdiPorTipo[j]);
      acumDireto += totalDireto[j];
      acumBdi += bdiAplicado[j];
    }

    diretoPorTipo[i] = acumDiretoPorTipo;
    bdiPorTipo[i] = acumBdiPorTipo;
    totalDireto[i] = acumDireto;
    bdiAplicado[i] = acumBdi;
    totalComBdi[i] = acumDireto + acumBdi;

    TIPOS_CUSTO_EMPREITA.forEach((t) => {
      totalPorTipo[i][t.key] = (Number(acumDiretoPorTipo?.[t.key]) || 0) + (Number(acumBdiPorTipo?.[t.key]) || 0);
    });
  }

  const mapa = new Map();
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    const id = String(it?.id || "");
    if (!id) continue;
    mapa.set(id, {
      diretoPorTipo: diretoPorTipo[i],
      totalDireto: totalDireto[i],
      bdiPorTipo: bdiPorTipo[i],
      bdiTotal: bdiAplicado[i],
      totalPorTipo: totalPorTipo[i],
      total: totalComBdi[i],
    });
  }

  return mapa;
}

function garantirCacheOrcadoEap() {
  if (_versaoCacheOrcadoEap === versaoEap) return;
  _orcadoEapPorId = calcularCacheOrcadoEap();
  _versaoCacheOrcadoEap = versaoEap;
}

function obterOrcadoEapPorId(id) {
  const key = String(id || "");
  if (!key) return null;
  garantirCacheOrcadoEap();
  return _orcadoEapPorId.get(key) || null;
}

function calcularLinhaEmpreita(item) {
  const tipos = obterTiposIncluidos();

  // Contrato agora é digitado direto por categoria (Material, Mão de obra,
  // Equipamento, Outros, Administração); o total é a soma dessas entradas.
  const contratoEmpPorTipoRaw = normalizarPorTipo(item?.contratoEmpPorTipo);
  const contratoReservaPorTipoRaw = normalizarPorTipo(item?.contratoReservaPorTipo);

  const contratoEmpPorTipo = {};
  const contratoReservaPorTipo = {};
  tipos.forEach((k) => {
    contratoEmpPorTipo[k] = Number(contratoEmpPorTipoRaw?.[k]) || 0;
    contratoReservaPorTipo[k] = Number(contratoReservaPorTipoRaw?.[k]) || 0;
  });

  const valorEmp = tipos.reduce((acc, k) => acc + (Number(contratoEmpPorTipo[k]) || 0), 0);
  const valorReserva = tipos.reduce((acc, k) => acc + (Number(contratoReservaPorTipo[k]) || 0), 0);
  const valorTotal = valorEmp + valorReserva;

  const orcado = obterOrcadoEapPorId(item?.eapId);
  const orcadoPorTipo = criarVazioPorTipo();
  tipos.forEach((k) => { orcadoPorTipo[k] = Number(orcado?.totalPorTipo?.[k]) || 0; });
  const orcadoTotal = tipos.reduce((acc, k) => acc + (Number(orcadoPorTipo?.[k]) || 0), 0);

  const contratoPorTipo = {};
  tipos.forEach((k) => {
    contratoPorTipo[k] = (Number(contratoEmpPorTipo?.[k]) || 0) + (Number(contratoReservaPorTipo?.[k]) || 0);
  });

  const acumuladoPorTipo = {};
  const atualPorTipo = {};
  const avancoPorTipo = {};
  const tiposInvalidos = [];
  const pagarPorTipo = {};
  const reservarPorTipo = {};

  let temAvanco = false;
  let pagarEmp = 0;
  let reservarPgto = 0;

  for (const k of tipos) {
    const acum = limitarPercentual(item?.medicaoAcumByType?.[k]);
    const atualRaw = item?.medicaoAtualByType?.[k];
    const atual = (atualRaw === null || atualRaw === undefined) ? acum : limitarPercentual(atualRaw);

    const diff = atual - acum;
    const avanco = Math.max(0, diff);

    if (atual < acum) tiposInvalidos.push(k);
    if (avanco > 0) temAvanco = true;

    acumuladoPorTipo[k] = acum;
    atualPorTipo[k] = atual;
    avancoPorTipo[k] = avanco;

    const pagarTipo = (Number(contratoEmpPorTipo?.[k]) || 0) * (avanco / 100);
    const reservarTipo = (Number(contratoReservaPorTipo?.[k]) || 0) * (avanco / 100);
    pagarPorTipo[k] = pagarTipo;
    reservarPorTipo[k] = reservarTipo;
    pagarEmp += pagarTipo;
    reservarPgto += reservarTipo;
  }

  const totalPeriodo = pagarEmp + reservarPgto;
  const reducaoInvalida = tiposInvalidos.length > 0;

  const pagamentoTotalPorTipo = {};
  tipos.forEach((k) => {
    pagamentoTotalPorTipo[k] = (Number(pagarPorTipo?.[k]) || 0) + (Number(reservarPorTipo?.[k]) || 0);
  });

  return {
    valorEmp,
    valorReserva,
    valorTotal,
    tipos,

    orcadoPorTipo,
    orcadoTotal,
    contratoPorTipo,
    contratoEmpPorTipo,
    contratoReservaPorTipo,

    acumuladoPorTipo,
    atualPorTipo,
    avancoPorTipo,
    pagarPorTipo,
    reservarPorTipo,
    pagamentoTotalPorTipo,

    temAvanco,
    pagarEmp,
    reservarPgto,
    totalPeriodo,
    reducaoInvalida,
    tiposInvalidos,
  };
}

// Soma, em todos os registros de medição já lançados, o total pago/reservado
// referente a um item específico da Empreita — usado para calcular o saldo
// (quanto do contrato daquele serviço ainda falta pagar).
function calcularTotalPagoItemEmpreita(itemId) {
  const id = String(itemId || "");
  if (!id) return 0;

  let total = 0;
  registros.forEach((reg) => {
    (reg.rows || []).forEach((row) => {
      if (String(row?.itemId || "") === id) total += Number(row?.totalPeriodo) || 0;
    });
  });
  return total;
}

function calcularSaldoLinhaEmpreita(item, resultadoLinha) {
  const totalPago = calcularTotalPagoItemEmpreita(item?.id);
  const saldo = (Number(resultadoLinha?.valorTotal) || 0) - totalPago;
  return { totalPago, saldo };
}

function calcularTotaisEmpreita() {
  const totais = {
    orcadoTotal: 0,
    valorEmp: 0,
    valorReserva: 0,
    valorTotal: 0,
    pagarEmp: 0,
    reservarPgto: 0,
    totalPeriodo: 0,
    totalPago: 0,
    saldo: 0,
  };

  for (const it of itensEmpreita) {
    const r = calcularLinhaEmpreita(it);
    const s = calcularSaldoLinhaEmpreita(it, r);
    totais.orcadoTotal += r.orcadoTotal;
    totais.valorEmp += r.valorEmp;
    totais.valorReserva += r.valorReserva;
    totais.valorTotal += r.valorTotal;
    totais.pagarEmp += r.pagarEmp;
    totais.reservarPgto += r.reservarPgto;
    totais.totalPeriodo += r.totalPeriodo;
    totais.totalPago += s.totalPago;
    totais.saldo += s.saldo;
  }

  return totais;
}
