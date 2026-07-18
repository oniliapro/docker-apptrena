/* ===== PAGAMENTOS (UTIL) ===== */
(function () {
  const CHAVE_STORAGE = "controleObra.pagamentos.v1";
  const storagePagamentosUtil = window.controleObraStorage || window.localStorage;

  function gerarId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function numeroSeguro(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizarModoValor(raw) {
    const m = String(raw || "").toLowerCase();
    if (m === "percentual" || m === "pct" || m === "%" || m === "percent") return "percentual";
    return "valor";
  }

  function normalizarItemPagamento(raw) {
    const item = raw || {};
    return {
      id: item.id ? String(item.id) : gerarId(),
      descricao: String(item.descricao || item.desc || ""),
      tipo: String(item.tipo || ""),
      eapId: String(item.eapId || ""),
      valor: numeroSeguro(item.valor),
      modoValor: normalizarModoValor(item.modoValor),
    };
  }

  function normalizarPagamento(raw) {
    const p = raw || {};
    const itensRaw = Array.isArray(p.itens || p.items) ? (p.itens || p.items) : [];
    const itens = itensRaw.map(normalizarItemPagamento);

    const legado = (!itens.length && (p.tipo || p.eapId || p.valor));
    if (legado) {
      itens.push(normalizarItemPagamento({
        descricao: p.desc || p.descricao || "",
        tipo: p.tipo,
        eapId: p.eapId,
        valor: p.valor,
        modoValor: "valor",
      }));
    }

    let valorTotal = numeroSeguro(p.valorTotal);
    if (!(valorTotal > 0)) {
      const onlyValues = itens.every((it) => it.modoValor === "valor");
      if (onlyValues) {
        valorTotal = itens.reduce((acc, it) => acc + numeroSeguro(it.valor), 0);
      } else {
        valorTotal = numeroSeguro(p.valor);
      }
    }

    const dataSolicitacao = String(p.dataSolicitacao || p.date || "");
    const dataPagamento = String(p.dataPagamento || p.date || "");

    return {
      id: p.id ? String(p.id) : gerarId(),
      numeroPagamento: String(p.numeroPagamento || p.numero || ""),
      obraNumber: String(p.obraNumber || p.obra || ""),
      dataSolicitacao,
      dataPagamento,
      fornecedor: String(p.fornecedor || ""),
      descricao: String(p.descricao || p.desc || ""),
      valorTotal,
      itens,
      origem: p.origem ? { ...p.origem } : null,
    };
  }

  function carregarPayloadPagamentos() {
    try {
      const raw = storagePagamentosUtil.getItem(CHAVE_STORAGE);
      if (!raw) return { header: {}, pagamentos: [] };
      const parsed = JSON.parse(raw);
      const header = parsed?.header || {};
      const list = Array.isArray(parsed?.pagamentos) ? parsed.pagamentos : [];
      return {
        header,
        pagamentos: list.map(normalizarPagamento),
      };
    } catch (_) {
      return { header: {}, pagamentos: [] };
    }
  }

  function salvarPayloadPagamentos(payload) {
    try {
      const header = payload?.header || {};
      const pagamentos = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
      storagePagamentosUtil.setItem(CHAVE_STORAGE, JSON.stringify({ header, pagamentos }));
    } catch (_) {
      // sem persistência
    }
  }

  function calcularValorItem(item, valorTotal) {
    const total = numeroSeguro(valorTotal);
    const v = numeroSeguro(item?.valor);
    if (normalizarModoValor(item?.modoValor) === "percentual") {
      return total * (v / 100);
    }
    return v;
  }

  function expandirItensPagamento(pagamento) {
    const p = normalizarPagamento(pagamento);
    return p.itens.map((it) => ({
      ...it,
      valorCalculado: calcularValorItem(it, p.valorTotal),
    }));
  }

  function calcularSomaItens(pagamento) {
    const p = normalizarPagamento(pagamento);
    return expandirItensPagamento(p).reduce((acc, it) => acc + numeroSeguro(it.valorCalculado), 0);
  }

  function gerarNumeroPagamento(lista) {
    const usados = (Array.isArray(lista) ? lista : []).map((p) => String(p.numeroPagamento || ""));
    let max = 0;
    usados.forEach((n) => {
      const m = n.match(/(\d+)$/);
      if (!m) return;
      const v = Number(m[1]);
      if (Number.isFinite(v)) max = Math.max(max, v);
    });
    const next = String(max + 1).padStart(4, "0");
    return `PG-${next}`;
  }

  window.pagamentosUtil = {
    gerarId,
    normalizarPagamento,
    normalizarItemPagamento,
    carregarPayloadPagamentos,
    salvarPayloadPagamentos,
    calcularValorItem,
    expandirItensPagamento,
    calcularSomaItens,
    gerarNumeroPagamento,
  };
})();
