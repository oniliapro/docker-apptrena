/* ===== ESTADO (Empreita) ===== */
const CHAVE_STORAGE_EMPREITA = "controleObra.empreita.v1";
const CHAVE_STORAGE_EAP = "controleObra.eap.v2";
const CHAVE_STORAGE_EAP_LEGADA = "controleObra.v1";
const storageEmpreitaState = window.controleObraStorage || window.localStorage;

const TIPOS_CUSTO_EMPREITA = [
  { key: "material", label: "Material", short: "Mat." },
  { key: "maoDeObra", label: "Mão de obra", short: "M.O." },
  { key: "equipamento", label: "Equipamento", short: "Equip." },
  { key: "outros", label: "Outros/Doc.", short: "Out." },
  { key: "administracao", label: "Administração", short: "Adm." },
];

let cabecalhoEmpreita = {
  empreitaId: gerarId(),
  obraNumber: "",
  numeroEmpreita: "",
  descricaoEmpreita: "",
  medicaoDate: "",
  competencia: "",
  obs: "",
  typesIncluded: TIPOS_CUSTO_EMPREITA.reduce((acc, t) => {
    acc[t.key] = true;
    return acc;
  }, {}),
};

let itensEmpreita = [];
let registros = [];

let snapshotEap = [];
let snapshotCabecalhoEap = { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
let versaoEap = 0;

/* ===== UTIL ===== */
function parsearBR(v) {
  return Number(String(v).replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function formatarMoeda(v) {
  return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function formatarPercentual(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " %";
}

function moedaOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarMoeda(n);
}

function percentualOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarPercentual(n);
}

function escaparHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gerarId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function limitarPercentual(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function criarVazioPorTipo() {
  const b = {};
  TIPOS_CUSTO_EMPREITA.forEach((t) => { b[t.key] = 0; });
  return b;
}

function normalizarPorTipo(raw) {
  const b = criarVazioPorTipo();
  TIPOS_CUSTO_EMPREITA.forEach((t) => { b[t.key] = Number(raw?.[t.key]) || 0; });
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

/* ===== EAP (snapshot para vincular serviços) ===== */
function carregarEapSnapshotDoStorage() {
  try {
    const raw = storageEmpreitaState.getItem(CHAVE_STORAGE_EAP) || storageEmpreitaState.getItem(CHAVE_STORAGE_EAP_LEGADA);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.eapItems) ? parsed.eapItems : [];

    return list
      .map((x) => ({
        id: String(x?.id || ""),
        isGroup: Boolean(x?.isGroup),
        eap: String(x?.eap || ""),
        desc: String(x?.desc || ""),
        qtde: (() => {
          const q = Number(x?.qtde);
          if (Number.isFinite(q)) return q;
          return x?.costs?.orcado ? 1 : 0;
        })(),
        unit: normalizarPorTipo(x?.unit || x?.costs?.orcado),
        bdiMode: normalizarModoBdi(x?.bdiMode, x?.bdiValue, x?.bdiPercent),
        bdiPercent: Number(x?.bdiPercent) || 0,
        bdiValue: Number(x?.bdiValue) || 0,
      }))
      .filter((x) => x.id);
  } catch (_) {
    return [];
  }
}

function carregarSnapshotCabecalhoEapDoStorage() {
  try {
    const raw = storageEmpreitaState.getItem(CHAVE_STORAGE_EAP) || storageEmpreitaState.getItem(CHAVE_STORAGE_EAP_LEGADA);
    if (!raw) return { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
    const parsed = JSON.parse(raw);
    const h = parsed?.header || {};

    return {
      mapNumber: String(h?.mapNumber || ""),
      bdiMode: normalizarModoBdi(h?.bdiMode, h?.bdiValue, h?.bdiPercent),
      bdiPercent: Number(h?.bdiPercent) || 0,
      bdiValue: Number(h?.bdiValue) || 0,
    };
  } catch (_) {
    return { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
  }
}

function carregarNumeroObraDoStorage() {
  return carregarSnapshotCabecalhoEapDoStorage().mapNumber;
}

function recarregarEapDoStorage() {
  snapshotCabecalhoEap = carregarSnapshotCabecalhoEapDoStorage();
  snapshotEap = carregarEapSnapshotDoStorage();
  versaoEap++;
  enfileirarRenderizacao();
}

/* ===== PERSISTÊNCIA ===== */
function salvarEstadoEmpreita() {
  try {
    const payload = { header: cabecalhoEmpreita, items: itensEmpreita, registros };
    storageEmpreitaState.setItem(CHAVE_STORAGE_EMPREITA, JSON.stringify(payload));
  } catch (_) {
    // sem persistência
  }
}

function normalizarItemEmpreita(raw) {
  const legacyAcum = limitarPercentual(raw?.medicaoAcum);

  const legacyAtualRaw = raw?.medicaoAtual;
  const legacyAtual = (legacyAtualRaw === null || legacyAtualRaw === undefined || legacyAtualRaw === "")
    ? null
    : limitarPercentual(legacyAtualRaw);

  const hasAcumByType = raw?.medicaoAcumByType && typeof raw.medicaoAcumByType === "object";
  const hasAtualByType = raw?.medicaoAtualByType && typeof raw.medicaoAtualByType === "object";

  const medicaoAcumByType = (() => {
    const out = {};
    TIPOS_CUSTO_EMPREITA.forEach((t) => {
      out[t.key] = limitarPercentual(hasAcumByType ? raw.medicaoAcumByType?.[t.key] : legacyAcum);
    });
    return out;
  })();

  const medicaoAtualByType = (() => {
    const out = {};
    TIPOS_CUSTO_EMPREITA.forEach((t) => {
      const v = hasAtualByType ? raw.medicaoAtualByType?.[t.key] : legacyAtual;
      out[t.key] = (v === null || v === undefined || v === "") ? null : limitarPercentual(v);
    });
    return out;
  })();

  return {
    id: raw?.id ? String(raw.id) : gerarId(),
    eapId: raw?.eapId ? String(raw.eapId) : "",
    desc: String(raw?.desc || ""),
    valorEmp: Number(raw?.valorEmp) || 0,
    valorReserva: Number(raw?.valorReserva) || 0,
    medicaoAcumByType,
    medicaoAtualByType,

    // legado (compatibilidade)
    medicaoAcum: legacyAcum,
    medicaoAtual: legacyAtual,
  };
}

function normalizarCabecalho(raw) {
  return {
    empreitaId: raw?.empreitaId ? String(raw.empreitaId) : gerarId(),
    obraNumber: String(raw?.obraNumber || ""),
    numeroEmpreita: String(raw?.numeroEmpreita || ""),
    descricaoEmpreita: String(raw?.descricaoEmpreita || ""),
    medicaoDate: String(raw?.medicaoDate || ""),
    competencia: String(raw?.competencia || ""),
    obs: String(raw?.obs || ""),
    typesIncluded: (() => {
      const out = {};
      TIPOS_CUSTO_EMPREITA.forEach((t) => {
        out[t.key] = raw?.typesIncluded?.[t.key] !== false;
      });
      return out;
    })(),
  };
}

function carregarEstadoEmpreita() {
  try {
    const raw = storageEmpreitaState.getItem(CHAVE_STORAGE_EMPREITA);
    if (!raw) return false;
    const parsed = JSON.parse(raw);

    cabecalhoEmpreita = normalizarCabecalho(parsed?.header);
    itensEmpreita = Array.isArray(parsed?.items) ? parsed.items.map(normalizarItemEmpreita) : [];
    registros = Array.isArray(parsed?.registros) ? parsed.registros : [];

    return true;
  } catch (_) {
    return false;
  }
}

function aplicarCabecalhoNoDom() {
  if (inputsEmpreita.numeroObra) inputsEmpreita.numeroObra.value = cabecalhoEmpreita.obraNumber || "";
  if (inputsEmpreita.numeroEmpreita) inputsEmpreita.numeroEmpreita.value = cabecalhoEmpreita.numeroEmpreita || "";
  if (inputsEmpreita.descricaoEmpreita) inputsEmpreita.descricaoEmpreita.value = cabecalhoEmpreita.descricaoEmpreita || "";
  if (inputsEmpreita.dataMedicao) inputsEmpreita.dataMedicao.value = cabecalhoEmpreita.medicaoDate || "";
  if (inputsEmpreita.competencia) inputsEmpreita.competencia.value = cabecalhoEmpreita.competencia || "";
  if (inputsEmpreita.observacoesMedicao) inputsEmpreita.observacoesMedicao.value = cabecalhoEmpreita.obs || "";
}

function vincularInputsCabecalho() {
  const bindings = [
    { key: "obraNumber", el: inputsEmpreita.numeroObra, kind: "text" },
    { key: "numeroEmpreita", el: inputsEmpreita.numeroEmpreita, kind: "text" },
    { key: "descricaoEmpreita", el: inputsEmpreita.descricaoEmpreita, kind: "text" },
    { key: "medicaoDate", el: inputsEmpreita.dataMedicao, kind: "text" },
    { key: "competencia", el: inputsEmpreita.competencia, kind: "text" },
    { key: "obs", el: inputsEmpreita.observacoesMedicao, kind: "text" },
  ];

  bindings.forEach(({ key, el, kind }) => {
    if (!el) return;
    el.addEventListener("change", () => {
      cabecalhoEmpreita[key] = (kind === "number") ? parsearBR(el.value) : el.value;
      enfileirarRenderizacao();
    });
  });
}

function enfileirarRenderizacao() {
  salvarEstadoEmpreita();
  renderizarAlternanciasTipoEmpreita();
  renderizarEmpreita();
  if (typeof sincronizarEmpreitaNaLista === "function") sincronizarEmpreitaNaLista();
}

function renderizarAlternanciasTipoEmpreita() {
  const root = alternanciasTipoEmpreita;
  if (!root) return;

  root.innerHTML = TIPOS_CUSTO_EMPREITA.map((t) => `
    <label class="checagem-inline">
      <input type="checkbox" data-type="${t.key}" ${cabecalhoEmpreita.typesIncluded?.[t.key] ? "checked" : ""}>
      ${escaparHtml(t.label)}
    </label>
  `).join("");

  root.querySelectorAll(`input[data-type]`).forEach((el) => {
    el.addEventListener("change", () => {
      const k = String(el.dataset.type || "");
      cabecalhoEmpreita.typesIncluded[k] = Boolean(el.checked);

      const any = TIPOS_CUSTO_EMPREITA.some((t) => cabecalhoEmpreita.typesIncluded?.[t.key]);
      if (!any) {
        cabecalhoEmpreita.typesIncluded[k] = true;
        el.checked = true;
        window.alert("Selecione pelo menos um tipo.");
        return;
      }

      enfileirarRenderizacao();
    });
  });
}

/* ===== AÇÕES (linhas) ===== */
function adicionarItemEmpreita(insertIndex = itensEmpreita.length) {
  const idx = Math.max(0, Math.min(itensEmpreita.length, Number(insertIndex)));
  itensEmpreita.splice(idx, 0, normalizarItemEmpreita({}));
  enfileirarRenderizacao();
}

function inserirItemEmpreitaAbaixo(index) {
  const i = Number(index);
  if (!Number.isFinite(i)) return;
  adicionarItemEmpreita(i + 1);
}

function moverItemEmpreita(index, dir) {
  const i = Number(index);
  const d = Number(dir);
  if (!Number.isFinite(i) || !Number.isFinite(d)) return;
  const to = i + d;
  if (to < 0 || to >= itensEmpreita.length) return;

  const [row] = itensEmpreita.splice(i, 1);
  itensEmpreita.splice(to, 0, row);
  enfileirarRenderizacao();
}

function moverItemEmpreitaParaCima(index) { moverItemEmpreita(index, -1); }
function moverItemEmpreitaParaBaixo(index) { moverItemEmpreita(index, +1); }

function removerItemEmpreita(index) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= itensEmpreita.length) return;
  itensEmpreita.splice(i, 1);
  enfileirarRenderizacao();
}

function definirMedicaoAtual(index, rawValue) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= itensEmpreita.length) return;
  const v = String(rawValue ?? "").trim();
  itensEmpreita[i].medicaoAtual = v ? limitarPercentual(parsearBR(v)) : null;
  enfileirarRenderizacao();
}

function definirMedicaoAtualPorTipo(index, typeKey, rawValue) {
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= itensEmpreita.length) return;

  const k = String(typeKey || "");
  if (!TIPOS_CUSTO_EMPREITA.some((t) => t.key === k)) return;

  const v = String(rawValue ?? "").trim();
  if (!itensEmpreita[i].medicaoAtualByType) itensEmpreita[i].medicaoAtualByType = {};
  itensEmpreita[i].medicaoAtualByType[k] = v ? limitarPercentual(parsearBR(v)) : null;
  enfileirarRenderizacao();
}
