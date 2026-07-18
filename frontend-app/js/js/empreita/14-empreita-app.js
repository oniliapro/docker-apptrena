/* ===== START (Empreita) ===== */
const storageEmpreitaApp = window.controleObraStorage || window.localStorage;

function hojeIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sincronizarCabecalhoDoDom() {
  if (inputsEmpreita.numeroObra) cabecalhoEmpreita.obraNumber = inputsEmpreita.numeroObra.value;
  if (inputsEmpreita.numeroEmpreita) cabecalhoEmpreita.numeroEmpreita = inputsEmpreita.numeroEmpreita.value;
  if (inputsEmpreita.descricaoEmpreita) cabecalhoEmpreita.descricaoEmpreita = inputsEmpreita.descricaoEmpreita.value;
  if (inputsEmpreita.dataMedicao) cabecalhoEmpreita.medicaoDate = inputsEmpreita.dataMedicao.value;
  if (inputsEmpreita.competencia) cabecalhoEmpreita.competencia = inputsEmpreita.competencia.value;
  if (inputsEmpreita.observacoesMedicao) cabecalhoEmpreita.obs = inputsEmpreita.observacoesMedicao.value;
}

function gerarPagamentoEmpreita(registro) {
  if (!window.pagamentosUtil) return null;

  const payload = window.pagamentosUtil.carregarPayloadPagamentos();
  const lista = Array.isArray(payload?.pagamentos) ? payload.pagamentos.slice() : [];

  const itensPagamento = [];

  registro.rows.forEach((row) => {
    const it = itensEmpreita.find((x) => x.id === row.itemId);
    if (!it) return;
    const r = calcularLinhaEmpreita(it);

    r.tipos.forEach((tipo) => {
      const valor = (Number(r.pagarPorTipo?.[tipo]) || 0) + (Number(r.reservarPorTipo?.[tipo]) || 0);
      if (valor === 0) return;

      itensPagamento.push({
        id: window.pagamentosUtil.gerarId(),
        descricao: it.desc || "Empreita",
        tipo,
        eapId: it.eapId,
        valor,
        modoValor: "valor",
      });
    });
  });

  const total = itensPagamento.reduce((acc, it) => acc + (Number(it.valor) || 0), 0);
  if (!(total > 0)) return null;

  const numeroPagamento = window.pagamentosUtil.gerarNumeroPagamento(lista);
  const descricaoBase = cabecalhoEmpreita.descricaoEmpreita || "Empreita";

  const pagamento = {
    id: window.pagamentosUtil.gerarId(),
    numeroPagamento,
    obraNumber: cabecalhoEmpreita.obraNumber || "",
    dataSolicitacao: cabecalhoEmpreita.medicaoDate || hojeIso(),
    dataPagamento: "",
    fornecedor: "",
    descricao: `${descricaoBase} ${cabecalhoEmpreita.numeroEmpreita || ""}`.trim(),
    valorTotal: total,
    itens: itensPagamento,
    origem: { tipo: "empreita", refId: cabecalhoEmpreita.empreitaId },
  };

  lista.push(pagamento);
  payload.pagamentos = lista;
  window.pagamentosUtil.salvarPayloadPagamentos(payload);

  return pagamento;
}

function registrarMedicaoPagamento() {
  sincronizarCabecalhoDoDom();

  const errors = [];
  const rows = [];
  const totals = { pagarEmp: 0, reservarPgto: 0, totalPeriodo: 0 };

  for (let i = 0; i < itensEmpreita.length; i++) {
    const it = itensEmpreita[i];
    const r = calcularLinhaEmpreita(it);

    if (r.reducaoInvalida) {
      const names = (r.tiposInvalidos || [])
        .map((k) => TIPOS_CUSTO_EMPREITA.find((t) => t.key === k)?.label || k)
        .join(", ");
      errors.push(`Linha ${i + 1}: medição atual menor que acumulada em: ${names}.`);
      continue;
    }

    if (!r.temAvanco) continue;

    rows.push({
      itemId: it.id,
      eapId: it.eapId,
      desc: it.desc,
      types: Array.isArray(r.tipos) ? r.tipos.slice() : [],
      fromByType: { ...(r.acumuladoPorTipo || {}) },
      toByType: { ...(r.atualPorTipo || {}) },
      avanceByType: { ...(r.avancoPorTipo || {}) },
      pagarPorTipo: { ...(r.pagarPorTipo || {}) },
      reservarPorTipo: { ...(r.reservarPorTipo || {}) },
      pagarEmp: r.pagarEmp,
      reservarPgto: r.reservarPgto,
      totalPeriodo: r.totalPeriodo,
    });

    totals.pagarEmp += r.pagarEmp;
    totals.reservarPgto += r.reservarPgto;
    totals.totalPeriodo += r.totalPeriodo;
  }

  if (errors.length) {
    window.alert(errors.join("\n"));
    return;
  }

  if (!rows.length) {
    window.alert("Sem avanço para registrar (medição atual = medição acumulada).");
    return;
  }

  const dateTxt = cabecalhoEmpreita.medicaoDate || hojeIso();
  const ok = window.confirm(
    `Registrar medição/pagamento em ${dateTxt}?\n` +
    `Pagar: ${formatarMoeda(totals.pagarEmp)}\n` +
    `Reservar: ${formatarMoeda(totals.reservarPgto)}\n` +
    `Total: ${formatarMoeda(totals.totalPeriodo)}`
  );
  if (!ok) return;

  const registro = {
    id: gerarId(),
    date: dateTxt,
    competencia: cabecalhoEmpreita.competencia || "",
    obs: cabecalhoEmpreita.obs || "",
    rows,
    totals,
  };

  registros.push(registro);

  // aplica a medição: atual vira acumulada; limpa campo "atual"
  for (const row of rows) {
    const it = itensEmpreita.find((x) => x.id === row.itemId);
    if (!it) continue;

    if (!it.medicaoAcumByType) it.medicaoAcumByType = {};
    if (!it.medicaoAtualByType) it.medicaoAtualByType = {};

    (row.types || []).forEach((k) => {
      it.medicaoAcumByType[k] = limitarPercentual(row.toByType?.[k]);
      it.medicaoAtualByType[k] = null;
    });
  }

  gerarPagamentoEmpreita(registro);
  enfileirarRenderizacao();
}

function sincronizarEmpreitaNaLista() {
  const chave = "controleObra.empreitas.v1";
  let lista = [];
  try {
    const raw = storageEmpreitaApp.getItem(chave);
    if (raw) lista = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch (_) {
    lista = [];
  }

  const total = calcularTotaisEmpreita();
  const servicos = itensEmpreita.map((it) => {
    const r = calcularLinhaEmpreita(it);
    return {
      id: it.id,
      eapId: it.eapId,
      desc: it.desc,
      valoresPorTipo: { ...(r.contratoPorTipo || {}) },
      valorTotal: r.valorTotal,
    };
  });

  let totalPago = 0;
  if (window.pagamentosUtil) {
    const payload = window.pagamentosUtil.carregarPayloadPagamentos();
    const listPag = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
    listPag.forEach((p) => {
      if (p?.origem?.tipo !== "empreita") return;
      if (String(p.origem?.refId || "") !== String(cabecalhoEmpreita.empreitaId || "")) return;
      totalPago += Number(p.valorTotal) || 0;
    });
  }

  const registro = {
    id: cabecalhoEmpreita.empreitaId,
    obraNumber: cabecalhoEmpreita.obraNumber || "",
    numeroEmpreita: cabecalhoEmpreita.numeroEmpreita || "",
    descricaoEmpreita: cabecalhoEmpreita.descricaoEmpreita || "",
    servicos,
    registros,
    totalEmpreita: total.valorTotal,
    totalPago,
    atualizadoEm: new Date().toISOString(),
  };

  const idx = lista.findIndex((e) => e.id === registro.id);
  if (idx >= 0) lista[idx] = registro;
  else lista.push(registro);

  try {
    storageEmpreitaApp.setItem(chave, JSON.stringify(lista));
  } catch (_) {
    // sem persistência
  }
}

// init
const loaded = carregarEstadoEmpreita();
snapshotCabecalhoEap = carregarSnapshotCabecalhoEapDoStorage();
snapshotEap = carregarEapSnapshotDoStorage();
versaoEap++;

if (!loaded) {
  cabecalhoEmpreita = normalizarCabecalho({});
  itensEmpreita = [];
  registros = [];
}

if (!cabecalhoEmpreita.obraNumber) {
  const n = carregarNumeroObraDoStorage();
  if (n) cabecalhoEmpreita.obraNumber = n;
}

if (!cabecalhoEmpreita.medicaoDate) cabecalhoEmpreita.medicaoDate = hojeIso();

if (itensEmpreita.length === 0) {
  itensEmpreita.push(normalizarItemEmpreita({}));
}

aplicarCabecalhoNoDom();
vincularInputsCabecalho();
enfileirarRenderizacao();
