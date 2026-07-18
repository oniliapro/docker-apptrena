/* ===== LISTA DE EMPREITAS ===== */
const corpoEmpreitas = document.getElementById("corpoEmpreitas");
const tabelaEmpreitas = document.getElementById("tabelaEmpreitas");
const alternarServicos = document.getElementById("alternarServicos");
const alternarPagamentosEmpreita = document.getElementById("alternarPagamentosEmpreita");
const storageEmpreitasLista = window.controleObraStorage || window.localStorage;

const TIPOS_CUSTO = [
  { key: "material", label: "Material" },
  { key: "maoDeObra", label: "Mão de obra" },
  { key: "equipamento", label: "Equipamento" },
  { key: "outros", label: "Outros" },
  { key: "administracao", label: "Administração" },
];

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

function carregarListaEmpreitas() {
  try {
    const raw = storageEmpreitasLista.getItem("controleObra.empreitas.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function carregarPagamentosEmpreita(empreitaId) {
  if (!window.pagamentosUtil) return [];
  const payload = window.pagamentosUtil.carregarPayloadPagamentos();
  const list = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
  return list.filter((p) => p?.origem?.tipo === "empreita" && String(p?.origem?.refId || "") === String(empreitaId || ""));
}

function carregarEapSnapshot() {
  try {
    const obraId = (window.obrasApi && typeof window.obrasApi.obterAtivaId === "function")
      ? window.obrasApi.obterAtivaId()
      : "";
    const chave = obraId ? `controleObra.eap.v2::${obraId}` : "controleObra.eap.v2";
    const raw = storageEmpreitasLista.getItem(chave) || (chave === "controleObra.eap.v2" ? storageEmpreitasLista.getItem("controleObra.v1") : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.eapItems) ? parsed.eapItems : [];
    return list.map((x) => ({
      id: String(x?.id || ""),
      eap: String(x?.eap || ""),
      desc: String(x?.desc || ""),
    })).filter((x) => x.id);
  } catch (_) {
    return [];
  }
}

function rotuloEap(snapshot, id) {
  const it = snapshot.find((x) => x.id === id);
  if (!it) return "—";
  const e = String(it.eap || "").trim();
  const d = String(it.desc || "").trim();
  if (e && d) return `${e} - ${d}`;
  if (e) return e;
  if (d) return d;
  return "—";
}

function montarListaServicos(servicos, snapshotEap) {
  if (!Array.isArray(servicos) || !servicos.length) return `<span class="atenuado">—</span>`;
  const linhas = servicos.map((s) => {
    const etapa = rotuloEap(snapshotEap, s.eapId);
    const valor = formatarMoeda(s.valorTotal || 0);
    const tiposTxt = TIPOS_CUSTO.map((t) => {
      const v = Number(s.valoresPorTipo?.[t.key]) || 0;
      if (!v) return "";
      return `${t.label}: ${formatarMoeda(v)}`;
    }).filter(Boolean).join(" | ");

    const linhaDesc = tiposTxt
      ? `${etapa} - ${s.desc || "Serviço"} (${tiposTxt})`
      : `${etapa} - ${s.desc || "Serviço"}`;

    return `<div class="lista-linha"><span>${escaparHtml(linhaDesc)}</span><span>${valor}</span></div>`;
  }).join("");
  return `<div class="lista-linhas">${linhas}</div>`;
}

function montarListaPagamentos(pagamentos) {
  if (!pagamentos.length) return `<span class="atenuado">—</span>`;
  const linhas = pagamentos.map((p) => {
    const numero = p.numeroPagamento || "—";
    const valor = formatarMoeda(p.valorTotal || 0);
    return `<div class="lista-linha"><span>${escaparHtml(numero)}</span><span>${valor}</span></div>`;
  }).join("");
  return `<div class="lista-linhas">${linhas}</div>`;
}

function renderizarListaEmpreitas() {
  if (!corpoEmpreitas) return;
  const lista = carregarListaEmpreitas();
  const snapshotEap = carregarEapSnapshot();

  if (alternarServicos && tabelaEmpreitas) {
    tabelaEmpreitas.classList.toggle("ocultar-col-servicos", !alternarServicos.checked);
  }
  if (alternarPagamentosEmpreita && tabelaEmpreitas) {
    tabelaEmpreitas.classList.toggle("ocultar-col-pagamentos", !alternarPagamentosEmpreita.checked);
  }

  const rows = lista.map((e) => {
    const pagamentos = carregarPagamentosEmpreita(e.id);
    const totalPago = pagamentos.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0);

    return `
      <tr>
        <td class="centro">${escaparHtml(e.obraNumber || "—")}</td>
        <td class="centro">${escaparHtml(e.numeroEmpreita || "—")}</td>
        <td>${escaparHtml(e.descricaoEmpreita || "—")}</td>
        <td class="col-servicos">${montarListaServicos(e.servicos, snapshotEap)}</td>
        <td class="col-pagamentos">${montarListaPagamentos(pagamentos)}</td>
        <td class="valor"><b>${formatarMoeda(e.totalEmpreita || 0)}</b></td>
        <td class="valor"><b>${formatarMoeda(totalPago || 0)}</b></td>
        <td class="centro">
          <a class="botao-link" href="./empreita-medicoes.html?id=${encodeURIComponent(e.id)}">Medições</a>
        </td>
      </tr>
    `;
  }).join("");

  corpoEmpreitas.innerHTML = rows || `<tr><td colspan="8" class="centro atenuado">—</td></tr>`;

}

if (alternarServicos) alternarServicos.addEventListener("change", renderizarListaEmpreitas);
if (alternarPagamentosEmpreita) alternarPagamentosEmpreita.addEventListener("change", renderizarListaEmpreitas);

renderizarListaEmpreitas();
