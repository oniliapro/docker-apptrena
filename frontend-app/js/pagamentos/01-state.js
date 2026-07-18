/* ===== ESTADO (Pagamentos) ===== */

const TIPOS_CUSTO_PAGAMENTO = [
  { key: "material", label: "Material" },
  { key: "maoDeObra", label: "Mão de obra" },
  { key: "equipamento", label: "Equipamento" },
  { key: "outros", label: "Outros" },
  { key: "administracao", label: "Administração" },
];

let cabecalhoPagamentos = {
  obraNumber: "",
};

let listaPagamentos = [];
let snapshotEap = [];
let pagamentoEditandoId = null;
const storagePagamentosState = window.controleObraStorage || window.localStorage;

/* ===== UTIL ===== */
function parsearBR(v) {
  return Number(String(v).replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function formatarMoeda(v) {
  return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  return window.pagamentosUtil?.gerarId ? window.pagamentosUtil.gerarId() : `id_${Date.now()}`;
}

function hojeIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ===== EAP (snapshot) ===== */
const CHAVE_STORAGE_EAP = "controleObra.eap.v2";
const CHAVE_STORAGE_EAP_LEGADA = "controleObra.v1";

// Mesma regra de chave por Obra usada em js/eap/02-state-utils.js.
function chaveEapAtualPagamentos() {
  const obraId = (window.obrasApi && typeof window.obrasApi.obterAtivaId === "function")
    ? window.obrasApi.obterAtivaId()
    : "";
  return obraId ? `${CHAVE_STORAGE_EAP}::${obraId}` : CHAVE_STORAGE_EAP;
}

function carregarEapSnapshotDoStorage() {
  try {
    const chave = chaveEapAtualPagamentos();
    const raw = storagePagamentosState.getItem(chave) || (chave === CHAVE_STORAGE_EAP ? storagePagamentosState.getItem(CHAVE_STORAGE_EAP_LEGADA) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.eapItems) ? parsed.eapItems : [];

    return list
      .map((x) => ({
        id: String(x?.id || ""),
        isGroup: Boolean(x?.isGroup),
        eap: String(x?.eap || ""),
        desc: String(x?.desc || ""),
      }))
      .filter((x) => x.id);
  } catch (_) {
    return [];
  }
}

function carregarNumeroObraDoStorage() {
  try {
    const chave = chaveEapAtualPagamentos();
    const raw = storagePagamentosState.getItem(chave) || (chave === CHAVE_STORAGE_EAP ? storagePagamentosState.getItem(CHAVE_STORAGE_EAP_LEGADA) : null);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.header?.mapNumber || "");
  } catch (_) {
    return "";
  }
}

function recarregarEapDoStorage() {
  snapshotEap = carregarEapSnapshotDoStorage();
  if (!cabecalhoPagamentos.obraNumber) {
    const n = carregarNumeroObraDoStorage();
    if (n) cabecalhoPagamentos.obraNumber = n;
  }
  enfileirarRenderizacao();
}

/* ===== PERSISTÊNCIA ===== */
function normalizarCabecalho(raw) {
  return { obraNumber: String(raw?.obraNumber || "") };
}

function carregarEstadoPagamentos() {
  if (!window.pagamentosUtil) return false;
  const payload = window.pagamentosUtil.carregarPayloadPagamentos();
  cabecalhoPagamentos = normalizarCabecalho(payload?.header);
  listaPagamentos = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
  return true;
}

function salvarEstadoPagamentos() {
  if (!window.pagamentosUtil) return;
  window.pagamentosUtil.salvarPayloadPagamentos({
    header: cabecalhoPagamentos,
    pagamentos: listaPagamentos,
  });
}

function enfileirarRenderizacao() {
  salvarEstadoPagamentos();
  renderizarPagamentos();
}
