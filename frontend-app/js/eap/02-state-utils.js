/* ===== ESTADO (EAP - Orçado) ===== */
const TIPOS_CUSTO = dados.categorias;

const CHAVE_STORAGE_EAP_BASE = "controleObra.eap.v2";
const CHAVE_STORAGE_LEGADA = "controleObra.v1";
const storageEap = window.controleObraStorage || window.localStorage;

// A EAP passa a ser separada por Obra: se houver uma Obra ativa selecionada
// (ver js/shared/obras-api.js), cada Obra grava sua própria EAP numa chave
// exclusiva. Sem Obra ativa, mantém a chave antiga (comportamento de antes,
// sem quebrar quem ainda não usa a Lista de Obras).
function chaveEapAtual() {
  const obraId = (window.obrasApi && typeof window.obrasApi.obterAtivaId === "function")
    ? window.obrasApi.obterAtivaId()
    : "";
  return obraId ? `${CHAVE_STORAGE_EAP_BASE}::${obraId}` : CHAVE_STORAGE_EAP_BASE;
}

// ===== Etapa 2: com Obra ativa, a EAP passa a gravar na API relacional
// (GET/PUT /api/obras/{obra}/eap, que já fala exatamente o dialeto
// {header, ui, eapItems} usado aqui — ver ObraController::showEap/syncEap).
// Chamada síncrona (mesmo padrão de js/shared/backend-storage.js) pra não
// mudar o fluxo de carregamento/gravação da tela, que hoje é síncrono.
// Sem Obra ativa, ou se a API falhar, cai pro comportamento antigo
// (storageEap / localStorage), sem quebrar quem ainda não usa Lista de Obras.
function chamarApiEapSync(method, path, body) {
  try {
    const base = window.controleObraApiBase || "http://localhost:8088/api";
    const token = window.controleObraAuth ? window.controleObraAuth.getToken() : "";

    const xhr = new XMLHttpRequest();
    xhr.open(method, `${base}${path}`, false);
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (body != null) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(body != null ? JSON.stringify(body) : null);

    if (xhr.status < 200 || xhr.status >= 300) return { ok: false, payload: null };
    const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, payload: null };
  }
}

let cabecalhoObra = {
  mapNumber: "",
  obraNome: "",
  cliente: "",
  dataBase: "",
  responsavel: "",
  local: "",
  periodo: "",
  obs: "",
  bdiScope: "global", // "global" | "category" | "item"
  bdiMode: "pct", // "pct" | "value"
  bdiPercent: 0,
  bdiValue: 0,
  bdiByType: TIPOS_CUSTO.reduce((acc, t) => {
    acc[t.key] = { mode: "pct", percent: 0, value: 0 };
    return acc;
  }, {}),
  isConfirmed: false,
  confirmedAt: "",
};

let estadoUi = {
  showUnit: true,
  showTotal: true,
  showBDI: true,
  showTypes: true,
  orcRealMode: "value", // "value" | "pct"
  visibleTypes: TIPOS_CUSTO.reduce((acc, t) => {
    acc[t.key] = true;
    return acc;
  }, {}),
};

let itensEap = [];

/* ===== FOCO PÓS-RENDER ===== */
let proximoFoco = null;
function definirProximoFoco(r, c, grupo = "body") { proximoFoco = { r, c, grupo }; }

function obterRaizGrupo(grupo) {
  if (grupo === "header") return document.querySelector("table.cabecalho-tabela");
  if (grupo === "body") return corpoTabela;
  if (grupo === "footer") return rodapeTabela;
  return null;
}

function aplicarProximoFoco() {
  if (!proximoFoco) return;
  const raiz = obterRaizGrupo(proximoFoco.grupo);
  if (!raiz) { proximoFoco = null; return; }
  const el = raiz.querySelector(
    `[data-group="${proximoFoco.grupo}"][data-r="${proximoFoco.r}"][data-c="${proximoFoco.c}"]`
  );
  if (el && !el.disabled) el.focus();
  proximoFoco = null;
}

function enfileirarRenderizacao() {
  aplicarNumeracaoAutomaticaEap();
  aplicarUiConfirmacao();
  salvarEstadoObra();
  renderizar();
}

/* ===== UTIL ===== */
const parsearBR = (v) =>
  Number(String(v).replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

const formatarMoeda = (v) =>
  "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatarPercentual = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " %";

function limitarPercentual(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function moedaOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarMoeda(n);
}
function percentualOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarPercentual(n);
}
function numeroOuVazio(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n).replace(".", ",");
}

function escaparHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ===== MODELOS ===== */
function gerarId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function criarVazioPorTipo() {
  const b = {};
  TIPOS_CUSTO.forEach((t) => { b[t.key] = 0; });
  return b;
}

function normalizarPorTipo(raw) {
  const b = criarVazioPorTipo();
  TIPOS_CUSTO.forEach((t) => { b[t.key] = Number(raw?.[t.key]) || 0; });
  return b;
}

function normalizarModoBdi(modeRaw, value, pct) {
  const m = String(modeRaw || "").toLowerCase();
  const v = Number(value) || 0;
  const p = Number(pct) || 0;

  if (m === "pct" || m === "value") return m;
  if (v > 0 && p <= 0) return "value";
  if (p > 0 && v <= 0) return "pct";
  if (v > 0) return "value";
  return "pct";
}

function normalizarCabecalho(raw) {
  const h = { ...cabecalhoObra };
  h.mapNumber = String(raw?.mapNumber || "");
  h.obraNome = String(raw?.obraNome || "");
  h.cliente = String(raw?.cliente || "");
  h.dataBase = String(raw?.dataBase || "");
  h.responsavel = String(raw?.responsavel || "");
  h.local = String(raw?.local || "");
  h.periodo = String(raw?.periodo || "");
  h.obs = String(raw?.obs || "");

  const scopeRaw = String(raw?.bdiScope || "").toLowerCase();
  if (scopeRaw === "global" || scopeRaw === "category" || scopeRaw === "item") h.bdiScope = scopeRaw;
  else h.bdiScope = "global";

  h.bdiMode = normalizarModoBdi(raw?.bdiMode, raw?.bdiValue, raw?.bdiPercent);

  h.bdiPercent = Number(raw?.bdiPercent) || 0;
  h.bdiValue = Number(raw?.bdiValue) || 0;

  const byType = {};
  TIPOS_CUSTO.forEach((t) => {
    const r = raw?.bdiByType?.[t.key] || raw?.bdiByCategory?.[t.key] || {};
    byType[t.key] = {
      mode: normalizarModoBdi(r?.mode || r?.bdiMode, r?.value ?? r?.bdiValue, r?.percent ?? r?.bdiPercent),
      percent: Number(r?.percent ?? r?.bdiPercent) || 0,
      value: Number(r?.value ?? r?.bdiValue) || 0,
    };
  });
  h.bdiByType = byType;

  h.isConfirmed = Boolean(raw?.isConfirmed);
  h.confirmedAt = String(raw?.confirmedAt || "");
  return h;
}

function normalizarUi(raw) {
  const modoOrcRealRaw = String(raw?.orcRealMode || "").toLowerCase();
  const orcRealMode = (modoOrcRealRaw === "pct") ? "pct" : "value";

  const visibleTypes = {};
  TIPOS_CUSTO.forEach((t) => {
    visibleTypes[t.key] = raw?.visibleTypes?.[t.key] !== false;
  });

  return {
    showUnit: raw?.showUnit !== false,
    showTotal: raw?.showTotal !== false,
    showBDI: raw?.showBDI !== false,
    showTypes: raw?.showTypes !== false,
    orcRealMode,
    visibleTypes,
  };
}

function normalizarItemEap(raw) {
  const hasLegacyCosts = Boolean(raw?.costs?.orcado);
  const legacyUnit = hasLegacyCosts ? normalizarPorTipo(raw.costs.orcado) : null;

  const qtdeRaw = Number(raw?.qtde);
  const qtde = Number.isFinite(qtdeRaw) ? qtdeRaw : (hasLegacyCosts ? 1 : 0);

  return {
    id: raw?.id ? String(raw.id) : gerarId(),
    isGroup: Boolean(raw?.isGroup),
    eap: String(raw?.eap || ""),
    desc: String(raw?.desc || ""),
    qtde,
    unid: String(raw?.unid || ""),
    unit: legacyUnit || normalizarPorTipo(raw?.unit),
    bdiMode: normalizarModoBdi(raw?.bdiMode, raw?.bdiValue, raw?.bdiPercent),
    bdiPercent: Number(raw?.bdiPercent) || 0,
    bdiValue: Number(raw?.bdiValue) || 0,
  };
}

function carregarExemploEap() {
  itensEap = (dados.exemploEap || []).map((x) => normalizarItemEap(x));
}

function aplicarNumeracaoAutomaticaEap() {
  let groupNum = 0;
  let itemNumInGroup = 0;
  let topItemNum = 0;

  for (const it of itensEap) {
    if (!it) continue;

    if (it.isGroup) {
      groupNum += 1;
      itemNumInGroup = 0;
      it.eap = String(groupNum);
      continue;
    }

    if (groupNum > 0) {
      itemNumInGroup += 1;
      it.eap = `${groupNum}.${itemNumInGroup}`;
    } else {
      topItemNum += 1;
      it.eap = String(topItemNum);
    }
  }
}

/* ===== PERSISTÊNCIA ===== */
function obraAtivaIdEap() {
  return (window.obrasApi && typeof window.obrasApi.obterAtivaId === "function")
    ? window.obrasApi.obterAtivaId()
    : "";
}

function salvarEstadoObra() {
  const payload = { header: cabecalhoObra, ui: estadoUi, eapItems: itensEap };
  const obraId = obraAtivaIdEap();

  if (obraId) {
    const res = chamarApiEapSync("PUT", `/obras/${encodeURIComponent(obraId)}/eap`, payload);
    if (res.ok) {
      // cache local de leitura rápida (também usado por Mapa/Empreita/Pagamentos,
      // que ainda leem a EAP via essa chave — ver js/mapa/02-state-utils.js etc.)
      try { storageEap.setItem(chaveEapAtual(), JSON.stringify(payload)); } catch (_) {}
      return;
    }
    // API indisponível: não perde o que foi digitado, cai pro cache local abaixo.
  }

  try {
    storageEap.setItem(chaveEapAtual(), JSON.stringify(payload));
  } catch (_) {
    // sem persistência (ex.: bloqueio de storage)
  }
}

function carregarEstadoObra() {
  const obraId = obraAtivaIdEap();

  if (obraId) {
    const res = chamarApiEapSync("GET", `/obras/${encodeURIComponent(obraId)}/eap`, null);
    if (res.ok && res.payload) {
      cabecalhoObra = normalizarCabecalho(res.payload.header);
      estadoUi = normalizarUi(res.payload.ui);
      itensEap = Array.isArray(res.payload.eapItems) ? res.payload.eapItems.map(normalizarItemEap) : [];
      try {
        storageEap.setItem(chaveEapAtual(), JSON.stringify({ header: cabecalhoObra, ui: estadoUi, eapItems: itensEap }));
      } catch (_) {}
      return true;
    }
    // API indisponível: tenta o cache local dessa Obra antes de desistir.
  }

  try {
    const chave = chaveEapAtual();
    // A chave legada só é usada como fallback quando não há Obra ativa —
    // dados de uma Obra específica nunca "herdam" o legado de outra conta.
    const raw = storageEap.getItem(chave) || (chave === CHAVE_STORAGE_EAP_BASE ? storageEap.getItem(CHAVE_STORAGE_LEGADA) : null);
    if (!raw) return false;
    const parsed = JSON.parse(raw);

    cabecalhoObra = normalizarCabecalho(parsed?.header);
    estadoUi = normalizarUi(parsed?.ui);
    itensEap = Array.isArray(parsed?.eapItems) ? parsed.eapItems.map(normalizarItemEap) : [];

    return true;
  } catch (_) {
    return false;
  }
}

function aplicarCabecalhoNoDom() {
  if (inputNumeroMapa) inputNumeroMapa.value = cabecalhoObra.mapNumber || "";
  if (inputsCabecalho.nomeObra) inputsCabecalho.nomeObra.value = cabecalhoObra.obraNome || "";
  if (inputsCabecalho.cliente) inputsCabecalho.cliente.value = cabecalhoObra.cliente || "";
  if (inputsCabecalho.dataBase) inputsCabecalho.dataBase.value = cabecalhoObra.dataBase || "";
  if (inputsCabecalho.responsavel) inputsCabecalho.responsavel.value = cabecalhoObra.responsavel || "";
  if (inputsCabecalho.local) inputsCabecalho.local.value = cabecalhoObra.local || "";
  if (inputsCabecalho.periodo) inputsCabecalho.periodo.value = cabecalhoObra.periodo || "";
  if (inputsCabecalho.observacoes) inputsCabecalho.observacoes.value = cabecalhoObra.obs || "";
}

function vincularInputsCabecalho() {
  const bindings = [
    { key: "mapNumber", el: inputNumeroMapa, kind: "text" },
    { key: "obraNome", el: inputsCabecalho.nomeObra, kind: "text" },
    { key: "cliente", el: inputsCabecalho.cliente, kind: "text" },
    { key: "dataBase", el: inputsCabecalho.dataBase, kind: "text" },
    { key: "responsavel", el: inputsCabecalho.responsavel, kind: "text" },
    { key: "local", el: inputsCabecalho.local, kind: "text" },
    { key: "periodo", el: inputsCabecalho.periodo, kind: "text" },
    { key: "obs", el: inputsCabecalho.observacoes, kind: "text" },
  ];

  bindings.forEach(({ key, el, kind }) => {
    if (!el) return;
    el.addEventListener("change", () => {
      cabecalhoObra[key] = (kind === "number") ? parsearBR(el.value) : el.value;
      aplicarCabecalhoNoDom();
      enfileirarRenderizacao();
    });
  });
}

function renderizarAlternanciasTipos() {
  const root = inputsBarraFerramentas.alternanciasTipos;
  if (!root) return;

  const disabled = !(estadoUi.showTypes);

  root.innerHTML = TIPOS_CUSTO.map((t) => `
    <label class="checagem-inline">
      <input type="checkbox" data-type="${t.key}" ${estadoUi.visibleTypes[t.key] ? "checked" : ""} ${disabled ? "disabled" : ""}>
      ${escaparHtml(t.label)}
    </label>
  `).join("");

  root.querySelectorAll(`input[data-type]`).forEach((el) => {
    el.addEventListener("change", () => {
      const k = el.dataset.type;
      estadoUi.visibleTypes[k] = el.checked;
      enfileirarRenderizacao();
    });
  });
}

function aplicarUiNoDom() {
  if (inputsBarraFerramentas.alternarUnitario) inputsBarraFerramentas.alternarUnitario.checked = Boolean(estadoUi.showUnit);
  if (inputsBarraFerramentas.alternarTotal) inputsBarraFerramentas.alternarTotal.checked = Boolean(estadoUi.showTotal);
  if (inputsBarraFerramentas.alternarBdi) inputsBarraFerramentas.alternarBdi.checked = Boolean(estadoUi.showBDI);
  if (inputsBarraFerramentas.alternarTipos) inputsBarraFerramentas.alternarTipos.checked = Boolean(estadoUi.showTypes);
  renderizarAlternanciasTipos();
}

function vincularInputsBarraFerramentas() {
  const bind = (el, key) => {
    if (!el) return;
    el.addEventListener("change", () => {
      estadoUi[key] = el.checked;
      aplicarUiNoDom();
      enfileirarRenderizacao();
    });
  };

  bind(inputsBarraFerramentas.alternarUnitario, "showUnit");
  bind(inputsBarraFerramentas.alternarTotal, "showTotal");
  bind(inputsBarraFerramentas.alternarBdi, "showBDI");
  bind(inputsBarraFerramentas.alternarTipos, "showTypes");
}

/* ===== AÇÕES ===== */
function adicionarItemEap(insertIndex = itensEap.length) {
  if (!garantirEapDesbloqueada()) return;
  const idx = Math.max(0, Math.min(itensEap.length, Number(insertIndex)));
  itensEap.splice(idx, 0, normalizarItemEap({ qtde: 1 }));
  definirProximoFoco(idx, 2, "body"); // descrição
  enfileirarRenderizacao();
}

function inserirItemEapAbaixo(index) {
  if (!garantirEapDesbloqueada()) return;
  const i = Number(index);
  if (!Number.isFinite(i)) return;
  adicionarItemEap(i + 1);
}

function moverItemEap(index, dir) {
  if (!garantirEapDesbloqueada()) return;
  const i = Number(index);
  const d = Number(dir);
  if (!Number.isFinite(i) || !Number.isFinite(d)) return;

  const to = i + d;
  if (to < 0 || to >= itensEap.length) return;

  const [row] = itensEap.splice(i, 1);
  itensEap.splice(to, 0, row);

  definirProximoFoco(to, 2, "body"); // descrição
  enfileirarRenderizacao();
}

function moverItemEapParaCima(index) { moverItemEap(index, -1); }
function moverItemEapParaBaixo(index) { moverItemEap(index, +1); }

function alternarModoBdiItem(index) {
  if (!garantirEapDesbloqueada()) return;
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= itensEap.length) return;
  const it = itensEap[i];
  if (!it || it.isGroup) return;

  it.bdiMode = (it.bdiMode === "value") ? "pct" : "value";
  enfileirarRenderizacao();
}

function alternarModoBdiGlobal() {
  if (!garantirEapDesbloqueada()) return;
  cabecalhoObra.bdiMode = (cabecalhoObra.bdiMode === "value") ? "pct" : "value";
  enfileirarRenderizacao();
}

function alternarModoOrcReal() {
  estadoUi.orcRealMode = (estadoUi.orcRealMode === "pct") ? "value" : "pct";
  enfileirarRenderizacao();
}

// Verifica se existe algum valor de BDI preenchido fora do escopo indicado
// (usado pra avisar antes de zerar dados ao trocar o tipo de BDI aplicado).
function existeBdiPreenchidoForaDoEscopo(scope) {
  const globalPreenchido = (Number(cabecalhoObra?.bdiPercent) || 0) > 0
    || (Number(cabecalhoObra?.bdiValue) || 0) > 0;

  const categoriaPreenchida = TIPOS_CUSTO.some((t) => {
    const slot = cabecalhoObra?.bdiByType?.[t.key];
    return slot && ((Number(slot.percent) || 0) > 0 || (Number(slot.value) || 0) > 0);
  });

  const itemPreenchido = itensEap.some((it) => {
    if (!it || it.isGroup) return false;
    return (Number(it.bdiPercent) || 0) > 0 || (Number(it.bdiValue) || 0) > 0;
  });

  if (scope === "global") return categoriaPreenchida || itemPreenchido;
  if (scope === "category") return globalPreenchido || itemPreenchido;
  if (scope === "item") return globalPreenchido || categoriaPreenchida;
  return false;
}

// Zera os valores de BDI que NÃO pertencem ao escopo indicado, pra evitar que
// um BDI preenchido em outro modo continue sendo aplicado "de fantasma".
function zerarBdiForaDoEscopo(scope) {
  if (scope !== "global") {
    cabecalhoObra.bdiPercent = 0;
    cabecalhoObra.bdiValue = 0;
  }
  if (scope !== "category") {
    TIPOS_CUSTO.forEach((t) => {
      cabecalhoObra.bdiByType[t.key] = { mode: "pct", percent: 0, value: 0 };
    });
  }
  if (scope !== "item") {
    itensEap.forEach((it) => {
      if (!it || it.isGroup) return;
      it.bdiPercent = 0;
      it.bdiValue = 0;
    });
  }
}

function definirEscopoBdi(scope) {
  if (!garantirEapDesbloqueada()) return;
  const s = String(scope || "").toLowerCase();
  if (s !== "global" && s !== "category" && s !== "item") return;
  if (s === cabecalhoObra.bdiScope) return;

  if (existeBdiPreenchidoForaDoEscopo(s)) {
    const ok = window.confirm(
      "Trocar o tipo de BDI aplicado vai zerar os valores de BDI preenchidos nos outros modos (global/categoria/item). Continuar?"
    );
    if (!ok) { enfileirarRenderizacao(); return; } // reexibe o select no valor anterior
  }

  zerarBdiForaDoEscopo(s);
  cabecalhoObra.bdiScope = s;
  enfileirarRenderizacao();
}

// Pedido do Lucas: botão pra limpar de uma vez todos os valores unitários
// (preço por tipo de custo, em cada item) e todos os BDIs (global, por
// categoria e por item), sem mexer na estrutura/descrição/quantidades da EAP.
function limparValoresUnitariosEBdi() {
  if (!garantirEapDesbloqueada()) return;
  const ok = window.confirm("Limpar todos os valores unitários e BDIs preenchidos? A estrutura da EAP (itens e quantidades) não é afetada.");
  if (!ok) return;

  itensEap.forEach((it) => {
    if (!it || it.isGroup) return;
    it.unit = criarVazioPorTipo();
    it.bdiPercent = 0;
    it.bdiValue = 0;
  });

  cabecalhoObra.bdiPercent = 0;
  cabecalhoObra.bdiValue = 0;
  TIPOS_CUSTO.forEach((t) => {
    cabecalhoObra.bdiByType[t.key] = { mode: "pct", percent: 0, value: 0 };
  });

  enfileirarRenderizacao();
}

function alternarModoBdiCategoria(typeKey) {
  if (!garantirEapDesbloqueada()) return;
  const k = String(typeKey || "");
  if (!k) return;
  const slot = cabecalhoObra.bdiByType?.[k];
  if (!slot) return;
  slot.mode = (slot.mode === "value") ? "pct" : "value";
  enfileirarRenderizacao();
}

function removerItemEap(index) {
  if (!garantirEapDesbloqueada()) return;
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= itensEap.length) return;
  itensEap.splice(i, 1);
  const focusRow = Math.max(0, Math.min(itensEap.length - 1, i));
  definirProximoFoco(focusRow, 2, "body");
  enfileirarRenderizacao();
}

function limparObra() {
  if (!garantirEapDesbloqueada()) return;
  const ok = window.confirm("Limpar os dados e voltar para o exemplo?");
  if (!ok) return;

  try { storageEap.removeItem(chaveEapAtual()); } catch (_) {}
  try { storageEap.removeItem(CHAVE_STORAGE_LEGADA); } catch (_) {}

  cabecalhoObra = normalizarCabecalho({});
  estadoUi = normalizarUi({});
  carregarExemploEap();
  aplicarCabecalhoNoDom();
  aplicarUiNoDom();
  definirProximoFoco(0, 2, "body");
  enfileirarRenderizacao();
}

function eapEstaBloqueada() {
  return Boolean(cabecalhoObra?.isConfirmed);
}

function garantirEapDesbloqueada() {
  if (!eapEstaBloqueada()) return true;
  window.alert("EAP confirmada. Clique em “Reabrir EAP” para editar.");
  return false;
}

function alternarConfirmacaoEap() {
  const locked = eapEstaBloqueada();

  if (!locked) {
    aplicarNumeracaoAutomaticaEap();
    const ok = window.confirm("Confirmar a EAP? Isso bloqueia edição de orçamento/BDI até reabrir.");
    if (!ok) return;
    cabecalhoObra.isConfirmed = true;
    cabecalhoObra.confirmedAt = new Date().toISOString().slice(0, 10);
  } else {
    const ok = window.confirm("Reabrir a EAP para edição? Isso altera a linha de base do orçamento.");
    if (!ok) return;
    cabecalhoObra.isConfirmed = false;
  }

  aplicarUiConfirmacao();
  enfileirarRenderizacao();
}

function aplicarUiConfirmacao() {
  const locked = eapEstaBloqueada();

  if (botoesAcao?.adicionarItem) botoesAcao.adicionarItem.disabled = locked;
  if (botoesAcao?.limpar) botoesAcao.limpar.disabled = locked;

  if (botoesAcao?.confirmar) {
    botoesAcao.confirmar.textContent = locked ? "📂 Reabrir EAP" : "✅ Confirmar";
    botoesAcao.confirmar.classList.toggle("primario", !locked);
  }
}
