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
      // Etapa 2: melhor-esforço, em segundo plano — não bloqueia quem chamou
      // salvarPayloadPagamentos (Mapa, Empreita, o próprio modal de Pagamentos).
      sincronizarPagamentosNaApiRelacional(pagamentos).catch(() => {});
    } catch (_) {
      // sem persistência
    }
  }

  // ===== Etapa 2: sincroniza pagamentos com a API relacional (/api/pagamentos) =====
  // Só envia pagamentos que ainda não têm um id relacional conhecido (evita
  // reenviar a lista inteira a cada gravação — pagamentos já sincronizados
  // raramente mudam depois de criados). Se um envio falhar (API fora do ar,
  // validação, etc.), o pagamento simplesmente continua "pendente" e é
  // tentado de novo na próxima vez que salvarPayloadPagamentos for chamado.
  const CHAVE_API_IDS_PAGAMENTOS = "controleObra.pagamentosApiIds.v1";

  function carregarMapaApiIdsPagamentos() {
    try {
      const raw = storagePagamentosUtil.getItem(CHAVE_API_IDS_PAGAMENTOS);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function salvarMapaApiIdsPagamentos(mapa) {
    try { storagePagamentosUtil.setItem(CHAVE_API_IDS_PAGAMENTOS, JSON.stringify(mapa)); } catch (_) {}
  }

  async function sincronizarPagamentosNaApiRelacional(pagamentos) {
    if (!window.obrasApi || typeof window.obrasApi.chamarApi !== "function") return;
    if (!Array.isArray(pagamentos) || !pagamentos.length) return;

    const mapaIds = carregarMapaApiIdsPagamentos();
    const pendentes = pagamentos.filter((p) => p?.id && !mapaIds[p.id]);
    if (!pendentes.length) return;

    const obraId = (typeof window.obrasApi.obterAtivaId === "function") ? window.obrasApi.obterAtivaId() : "";

    for (const p of pendentes) {
      try {
        const itensApi = (p.itens || [])
          .map((it) => ({
            descricao: it.descricao || "",
            tipo: it.tipo || undefined,
            eapId: it.eapId || null,
            valor: numeroSeguro(it.valor),
            modoValor: it.modoValor || "valor",
          }))
          .filter((it) => it.valor !== 0);

        if (!itensApi.length) continue; // API exige pelo menos 1 item

        const payloadApi = {
          numero_pagamento: p.numeroPagamento || `PG-${String(p.id).slice(0, 8)}`,
          obra_id: obraId || null,
          obra_number: p.obraNumber || "",
          data_solicitacao: p.dataSolicitacao || null,
          data_pagamento: p.dataPagamento || null,
          fornecedor: p.fornecedor || "",
          descricao: p.descricao || "",
          valor_total: numeroSeguro(p.valorTotal),
          origem_tipo: p.origem?.tipo || "manual",
          origem_ref_id: p.origem?.refId || null,
          itens: itensApi,
        };

        const resp = await window.obrasApi.chamarApi("/pagamentos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadApi),
        });

        if (resp?.id) {
          mapaIds[p.id] = resp.id;
          salvarMapaApiIdsPagamentos(mapaIds);
        }
      } catch (_) {
        // melhor-esforço: não marca como sincronizado, tenta de novo depois.
      }
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
