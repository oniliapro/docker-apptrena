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
  if (inputsEmpreita.nomeEmpreiteiro) cabecalhoEmpreita.nomeEmpreiteiro = inputsEmpreita.nomeEmpreiteiro.value;
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

// Etapa 2: registra a medição também na estrutura relacional
// (/api/empreitas + /api/empreitas/{id}/registros), além do fluxo local que
// já existia (registros[], Pagamentos, controleObra.empreitas.v1). Como o
// registro relacional da Empreita usa um id próprio (gerado pelo backend, já
// que o POST /empreitas não aceita id do cliente), guardamos localmente o
// mapeamento client-empreitaId -> id-relacional pra reaproveitar em vez de
// criar uma empreita relacional nova a cada medição.
function chaveApiIdEmpreita() {
  return `controleObra.empreitaApiId.v1::${cabecalhoEmpreita.empreitaId}`;
}

async function obterOuCriarEmpreitaRelacional() {
  if (!window.obrasApi || typeof window.obrasApi.chamarApi !== "function") return null;

  let relId = null;
  try { relId = storageEmpreitaApp.getItem(chaveApiIdEmpreita()) || null; } catch (_) {}

  try {
    const obraId = (typeof window.obrasApi.obterAtivaId === "function") ? window.obrasApi.obterAtivaId() : "";

    const payload = {
      obra_id: obraId || null,
      obra_number: cabecalhoEmpreita.obraNumber || "",
      numero_empreita: cabecalhoEmpreita.numeroEmpreita || "",
      descricao_empreita: cabecalhoEmpreita.descricaoEmpreita || "",
      medicao_date: cabecalhoEmpreita.medicaoDate || null,
      competencia: cabecalhoEmpreita.competencia || "",
      obs: cabecalhoEmpreita.obs || "",
      itens: itensEmpreita.map((it) => ({
        id: it.id || undefined,
        eapId: it.eapId || null,
        desc: it.desc || "",
        contratoEmpPorTipo: it.contratoEmpPorTipo || {},
        contratoReservaPorTipo: it.contratoReservaPorTipo || {},
        medicaoAcumByType: it.medicaoAcumByType || {},
        medicaoAtualByType: it.medicaoAtualByType || {},
      })),
      tipos_incluidos: cabecalhoEmpreita.typesIncluded || {},
    };

    const metodo = relId ? "PUT" : "POST";
    const caminho = relId ? `/empreitas/${encodeURIComponent(relId)}` : "/empreitas";
    const resp = await window.obrasApi.chamarApi(caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const novoId = resp?.id || relId;
    if (novoId) {
      relId = novoId;
      try { storageEmpreitaApp.setItem(chaveApiIdEmpreita(), relId); } catch (_) {}
    }
    return relId;
  } catch (_) {
    return relId;
  }
}

async function sincronizarRegistroNaApiRelacional(registro) {
  if (!window.obrasApi || typeof window.obrasApi.chamarApi !== "function") return;

  try {
    const empreitaRelId = await obterOuCriarEmpreitaRelacional();
    if (!empreitaRelId) return;

    const linhas = (registro.rows || []).map((row) => {
      const porTipo = {};
      (row.types || []).forEach((k) => {
        porTipo[k] = {
          from: Number(row.fromByType?.[k]) || 0,
          to: Number(row.toByType?.[k]) || 0,
          avanco: Number(row.avanceByType?.[k]) || 0,
          pagar: Number(row.pagarPorTipo?.[k]) || 0,
          reservar: Number(row.reservarPorTipo?.[k]) || 0,
        };
      });
      return {
        empreitaItemId: row.itemId || null,
        eapItemId: row.eapId || null,
        descricao: row.desc || "",
        totalPagarEmp: Number(row.pagarEmp) || 0,
        totalReservarPgto: Number(row.reservarPgto) || 0,
        totalPeriodo: Number(row.totalPeriodo) || 0,
        porTipo,
      };
    });

    await window.obrasApi.chamarApi(`/empreitas/${encodeURIComponent(empreitaRelId)}/registros`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data_medicao: registro.date || null,
        competencia: registro.competencia || "",
        obs: registro.obs || "",
        linhas,
        total_pagar_emp: Number(registro.totals?.pagarEmp) || 0,
        total_reservar_pgto: Number(registro.totals?.reservarPgto) || 0,
        total_periodo: Number(registro.totals?.totalPeriodo) || 0,
      }),
    });
  } catch (_) {
    // melhor-esforço: a medição já foi aplicada e o pagamento já foi gerado
    // localmente antes desta chamada — uma falha aqui não deve travar a tela.
  }
}

async function registrarMedicaoPagamento() {
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
  await sincronizarRegistroNaApiRelacional(registro);
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
    nomeEmpreiteiro: cabecalhoEmpreita.nomeEmpreiteiro || "",
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
