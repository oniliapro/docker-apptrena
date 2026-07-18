/* ===== ENGINE (EAP: cálculos do Orçado + BDI) ===== */

const storageEapEngine = window.controleObraStorage || window.localStorage;

function somarPorTipo(b) {
  let sum = 0;
  TIPOS_CUSTO.forEach((t) => { sum += Number(b?.[t.key]) || 0; });
  return sum;
}

function multiplicarPorTipo(b, fator) {
  const out = criarVazioPorTipo();
  const f = Number(fator) || 0;
  TIPOS_CUSTO.forEach((t) => { out[t.key] = (Number(b?.[t.key]) || 0) * f; });
  return out;
}

function somarEmPorTipo(alvo, add) {
  TIPOS_CUSTO.forEach((t) => {
    alvo[t.key] = (Number(alvo[t.key]) || 0) + (Number(add?.[t.key]) || 0);
  });
  return alvo;
}

function ehDescendente(parentEap, childEap) {
  const p = String(parentEap || "").trim();
  const c = String(childEap || "").trim();
  if (!p || !c) return false;
  return c.startsWith(p + ".");
}

function percentualSeguro(n, d) {
  const nn = Number(n) || 0;
  const dd = Number(d) || 0;
  if (dd <= 0) return 0;
  return (nn / dd) * 100;
}

function calcularValorOverrideBdi(item, directTotal) {
  const mode = (item?.bdiMode === "value") ? "value" : "pct";

  if (mode === "value") {
    const v = Number(item?.bdiValue) || 0;
    return v > 0 ? v : null;
  }

  const p = Number(item?.bdiPercent) || 0;
  if (p <= 0) return null;
  return (Number(directTotal) || 0) * (p / 100);
}

function calcularCacheBaseOrcado() {
  const n = itensEap.length;

  const unitByType = Array.from({ length: n }, () => criarVazioPorTipo());
  const unitTotal = Array.from({ length: n }, () => 0);

  const directByType = Array.from({ length: n }, () => criarVazioPorTipo());
  const directTotal = Array.from({ length: n }, () => 0);

  const bdiOverrideValue = Array.from({ length: n }, () => null);
  const bdiApplied = Array.from({ length: n }, () => 0);
  const bdiByType = Array.from({ length: n }, () => criarVazioPorTipo());
  const totalWithBdi = Array.from({ length: n }, () => 0);
  const bdiPctApplied = Array.from({ length: n }, () => 0);

  // 1) Totais diretos (apenas itens-base)
  for (let i = 0; i < n; i++) {
    const it = itensEap[i];
    if (!it || it.isGroup) continue;

    const q = Number(it.qtde) || 0;
    const unit = normalizarPorTipo(it.unit);

    unitByType[i] = unit;
    unitTotal[i] = somarPorTipo(unit);

    const tot = multiplicarPorTipo(unit, q);
    directByType[i] = tot;
    directTotal[i] = somarPorTipo(tot);
  }

  // 2) Overrides do BDI por item (somente itens-base)
  for (let i = 0; i < n; i++) {
    const it = itensEap[i];
    if (!it || it.isGroup) continue;
    bdiOverrideValue[i] = calcularValorOverrideBdi(it, directTotal[i]);
  }

  const scope = (cabecalhoObra?.bdiScope === "category" || cabecalhoObra?.bdiScope === "item")
    ? cabecalhoObra.bdiScope
    : "global";

  const globalMode = (cabecalhoObra?.bdiMode === "value") ? "value" : "pct";
  const globalBdiValue = Number(cabecalhoObra?.bdiValue) || 0;
  const globalBdiPercent = Number(cabecalhoObra?.bdiPercent) || 0;

  const distribuirBdiPorTipo = (idx, bdiValue) => {
    const dt = directTotal[idx] || 0;
    const bdi = Number(bdiValue) || 0;
    if (dt <= 0 || bdi <= 0) return;
    TIPOS_CUSTO.forEach((t) => {
      const share = (Number(directByType[idx]?.[t.key]) || 0) / dt;
      bdiByType[idx][t.key] = bdi * share;
    });
  };

  // 3) BDI aplicado
  if (scope === "item") {
    // Apenas BDI por item (override). Sem global/categoria.
    for (let i = 0; i < n; i++) {
      const it = itensEap[i];
      if (!it || it.isGroup) continue;
      bdiApplied[i] = (bdiOverrideValue[i] !== null) ? bdiOverrideValue[i] : 0;
      distribuirBdiPorTipo(i, bdiApplied[i]);
    }
  } else if (scope === "category") {
    // BDI por categoria (tipo de custo). Itens com override substituem.
    const cfg = cabecalhoObra?.bdiByType || {};

    const sumDirectNoOverrideByType = criarVazioPorTipo();
    TIPOS_CUSTO.forEach((t) => {
      const mode = (cfg?.[t.key]?.mode === "value") ? "value" : "pct";
      const val = Number(cfg?.[t.key]?.value) || 0;
      if (mode !== "value" || val <= 0) return;

      for (let i = 0; i < n; i++) {
        const it = itensEap[i];
        if (!it || it.isGroup) continue;
        if (bdiOverrideValue[i] !== null) continue;
        sumDirectNoOverrideByType[t.key] += Number(directByType[i]?.[t.key]) || 0;
      }
    });

    for (let i = 0; i < n; i++) {
      const it = itensEap[i];
      if (!it || it.isGroup) continue;

      if (bdiOverrideValue[i] !== null) {
        bdiApplied[i] = bdiOverrideValue[i];
        distribuirBdiPorTipo(i, bdiApplied[i]);
        continue;
      }

      TIPOS_CUSTO.forEach((t) => {
        const slot = cfg?.[t.key] || {};
        const mode = (slot?.mode === "value") ? "value" : "pct";
        const pct = Number(slot?.percent) || 0;
        const val = Number(slot?.value) || 0;
        const direct = Number(directByType[i]?.[t.key]) || 0;

        if (mode === "pct") {
          bdiByType[i][t.key] = (pct > 0) ? direct * (pct / 100) : 0;
        } else {
          const denom = Number(sumDirectNoOverrideByType?.[t.key]) || 0;
          bdiByType[i][t.key] = (val > 0 && denom > 0) ? val * (direct / denom) : 0;
        }
      });

      bdiApplied[i] = somarPorTipo(bdiByType[i]);
    }
  } else {
    // Global (padrão): aplica sobre o custo direto (itens sem override)
    if (globalMode === "value" && globalBdiValue > 0) {
      let sumDirectNoOverride = 0;
      for (let i = 0; i < n; i++) {
        const it = itensEap[i];
        if (!it || it.isGroup) continue;
        if (bdiOverrideValue[i] !== null) continue;
        sumDirectNoOverride += directTotal[i];
      }

      for (let i = 0; i < n; i++) {
        const it = itensEap[i];
        if (!it || it.isGroup) continue;

        if (bdiOverrideValue[i] !== null) {
          bdiApplied[i] = bdiOverrideValue[i];
        } else {
          bdiApplied[i] = (sumDirectNoOverride > 0)
            ? globalBdiValue * (directTotal[i] / sumDirectNoOverride)
            : 0;
        }

        distribuirBdiPorTipo(i, bdiApplied[i]);
      }
    } else if (globalMode === "pct" && globalBdiPercent > 0) {
      for (let i = 0; i < n; i++) {
        const it = itensEap[i];
        if (!it || it.isGroup) continue;

        if (bdiOverrideValue[i] !== null) bdiApplied[i] = bdiOverrideValue[i];
        else bdiApplied[i] = directTotal[i] * (globalBdiPercent / 100);

        distribuirBdiPorTipo(i, bdiApplied[i]);
      }
    } else {
      for (let i = 0; i < n; i++) {
        const it = itensEap[i];
        if (!it || it.isGroup) continue;
        bdiApplied[i] = (bdiOverrideValue[i] !== null) ? bdiOverrideValue[i] : 0;
        distribuirBdiPorTipo(i, bdiApplied[i]);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const it = itensEap[i];
    if (!it || it.isGroup) continue;
    totalWithBdi[i] = directTotal[i] + bdiApplied[i];
    bdiPctApplied[i] = percentualSeguro(bdiApplied[i], directTotal[i]);
  }

  // Totais gerais (itens-base)
  const totalsDirectByType = criarVazioPorTipo();
  const totalsBdiByType = criarVazioPorTipo();

  for (let i = 0; i < n; i++) {
    const it = itensEap[i];
    if (!it || it.isGroup) continue;

    somarEmPorTipo(totalsDirectByType, directByType[i]);
    somarEmPorTipo(totalsBdiByType, bdiByType[i]);
  }

  const totalsDirect = somarPorTipo(totalsDirectByType);
  const totalsBdi = somarPorTipo(totalsBdiByType);
  const totalsWithBdi = totalsDirect + totalsBdi;

  return {
    unitByType,
    unitTotal,
    directByType,
    directTotal,
    bdiOverrideValue,
    bdiApplied,
    bdiByType,
    bdiPctApplied,
    totalWithBdi,
    totalsDirectByType,
    totalsBdiByType,
    totalsDirect,
    totalsBdi,
    totalsWithBdi,
  };
}

function somarDescendentesDoGrupo(groupIndex, cache) {
  const it = itensEap[groupIndex];
  const eap = String(it?.eap || "").trim();
  const accDirectByType = criarVazioPorTipo();
  let accDirectTotal = 0;
  let accBdi = 0;

  if (!eap) {
    return { directByType: accDirectByType, directTotal: 0, bdiApplied: 0, totalWithBdi: 0, bdiPctApplied: 0 };
  }

  for (let i = 0; i < itensEap.length; i++) {
    const child = itensEap[i];
    if (!child || child.isGroup) continue;
    if (!ehDescendente(eap, child.eap)) continue;

    somarEmPorTipo(accDirectByType, cache.directByType[i]);
    accDirectTotal += cache.directTotal[i];
    accBdi += cache.bdiApplied[i];
  }

  const totalWithBdi = accDirectTotal + accBdi;
  const bdiPctApplied = percentualSeguro(accBdi, accDirectTotal);

  return { directByType: accDirectByType, directTotal: accDirectTotal, bdiApplied: accBdi, totalWithBdi, bdiPctApplied };
}

/* ===== REALIZADO (Pagamentos) ===== */
function carregarPagamentosDoStorage() {
  try {
    const known = new Set(TIPOS_CUSTO.map((t) => t.key));

    if (window.pagamentosUtil) {
      const payload = window.pagamentosUtil.carregarPayloadPagamentos();
      const list = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
      const out = [];

      list.forEach((p) => {
        const itens = window.pagamentosUtil.expandirItensPagamento(p);
        itens.forEach((it) => {
          const tipo = String(it?.tipo || "");
          const eapId = String(it?.eapId || "");
          const valor = Number(it?.valorCalculado) || 0;
          if (!eapId || !known.has(tipo) || valor === 0) return;
          out.push({
            id: String(p?.id || ""),
            date: String(p?.dataPagamento || p?.dataSolicitacao || p?.date || ""),
            tipo,
            eapId,
            fornecedor: String(p?.fornecedor || ""),
            desc: String(it?.descricao || p?.descricao || ""),
            valor,
          });
        });
      });

      return out;
    }

    // fallback legado (estrutura antiga)
    const raw = storageEapEngine.getItem("controleObra.pagamentos.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.pagamentos) ? parsed.pagamentos : [];

    return list
      .map((p) => ({
        id: String(p?.id || ""),
        date: String(p?.date || ""),
        tipo: String(p?.tipo || ""),
        eapId: String(p?.eapId || ""),
        fornecedor: String(p?.fornecedor || ""),
        desc: String(p?.desc || ""),
        valor: Number(p?.valor) || 0,
      }))
      .filter((p) => p.eapId && known.has(p.tipo) && (Number(p.valor) || 0) !== 0);
  } catch (_) {
    return [];
  }
}
