/* ===== ESTADO ===== */
const TIPOS_CUSTO_MAPA = [
  { key: "material", label: "Material" },
  { key: "maoDeObra", label: "Mão de obra" },
  { key: "equipamento", label: "Equipamento" },
  { key: "outros", label: "Outros" },
  { key: "administracao", label: "Administração" },
];

let fornecedores = [];
let itens = [];
let clienteSelecionado = "";
let freteParticular = 0;
let modoManual = false;

let snapshotEap = [];
let snapshotCabecalhoEap = { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
let versaoEap = 0;
const storageMapaState = window.controleObraStorage || window.localStorage;

let mapaId = (window.crypto?.randomUUID) ? window.crypto.randomUUID() : `mapa_${Date.now()}`;

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

function enfileirarRenderizacao() { renderizar(); }

/* ===== UTIL ===== */
const parsearBR = (v) =>
  Number(String(v).replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

const formatarMoeda = (v) =>
  "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const formatarPercentual = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " %";

function criarVazioPorTipo() {
  const b = {};
  TIPOS_CUSTO_MAPA.forEach((t) => { b[t.key] = 0; });
  return b;
}

function normalizarPorTipo(raw) {
  const b = criarVazioPorTipo();
  TIPOS_CUSTO_MAPA.forEach((t) => { b[t.key] = Number(raw?.[t.key]) || 0; });
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

function rotuloEapMapa(item) {
  if (!item) return "—";
  const e = String(item.eap || "").trim();
  const d = String(item.desc || "").trim();
  if (e && d) return `${e} - ${d}`;
  if (e) return e;
  if (d) return d;
  return "—";
}

function obterRotuloEapPorId(id) {
  const key = String(id || "");
  if (!key) return "—";
  const it = snapshotEap.find((x) => x.id === key);
  if (!it) return key;
  return rotuloEapMapa(it);
}

/* ===== EAP (snapshot completo p/ saldos) ===== */
const CHAVE_STORAGE_EAP = "controleObra.eap.v2";
const CHAVE_STORAGE_EAP_LEGADA = "controleObra.v1";

function carregarEapSnapshotCompleto() {
  try {
    const raw = storageMapaState.getItem(CHAVE_STORAGE_EAP) || storageMapaState.getItem(CHAVE_STORAGE_EAP_LEGADA);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.eapItems) ? parsed.eapItems : [];

    return list
      .map((x) => ({
        id: String(x?.id || ""),
        isGroup: Boolean(x?.isGroup),
        eap: String(x?.eap || ""),
        desc: String(x?.desc || ""),
        qtde: Number(x?.qtde) || 0,
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

function carregarSnapshotCabecalhoEap() {
  try {
    const raw = storageMapaState.getItem(CHAVE_STORAGE_EAP) || storageMapaState.getItem(CHAVE_STORAGE_EAP_LEGADA);
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

function recarregarEapDoStorageMapa() {
  snapshotEap = carregarEapSnapshotCompleto();
  snapshotCabecalhoEap = carregarSnapshotCabecalhoEap();
  versaoEap++;
  if (inputNumeroMapa && !inputNumeroMapa.value && snapshotCabecalhoEap.mapNumber) {
    inputNumeroMapa.value = snapshotCabecalhoEap.mapNumber;
  }
  enfileirarRenderizacao();
}

/* ===== INIT HEAD DROPDOWNS ===== */
function preencherSelect(id, lista) {
  const s = document.getElementById(id);
  if (!s) return;
  s.innerHTML = `<option value=""></option>` + lista.map((v) => `<option>${v}</option>`).join("");
}

preencherSelect("responsavelObra", dados.responsavelObra);
preencherSelect("responsavelMapa", dados.responsavelMapa);
preencherSelect("cliente", dados.clientes);

document.getElementById("cliente").onchange = (e) => {
  clienteSelecionado = e.target.value;
  enfileirarRenderizacao();
};

/* ===== MODO MANUAL ===== */
const alternadorManual = document.getElementById("modoManual");
alternadorManual.addEventListener("change", (e) => {
  modoManual = e.target.checked;
  enfileirarRenderizacao();
});

/* ===== COLUNAS ESTÁVEIS ===== */
function colunaUnitario(si) { return (si + 1) * 10; } // 10,20,30...
function indiceFornecedorPorColuna(c) {
  if (c < 10) return -1;
  const si = Math.floor(c / 10) - 1;
  return (si >= 0 && si < fornecedores.length) ? si : -1;
}

// inicializa EAP snapshot
recarregarEapDoStorageMapa();
