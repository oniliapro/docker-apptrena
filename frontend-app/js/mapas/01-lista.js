/* ===== LISTA DE MAPAS ===== */
const corpoMapas = document.getElementById("corpoMapas");
const storageMapasLista = window.controleObraStorage || window.localStorage;

function formatarMoeda(v) {
  return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function escaparHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function carregarListaMapas() {
  try {
    const raw = storageMapasLista.getItem("controleObra.mapas.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function salvarListaMapas(lista) {
  try {
    storageMapasLista.setItem("controleObra.mapas.v1", JSON.stringify(lista));
  } catch (_) {
    // sem persistência
  }
}

function removerMapa(id) {
  const lista = carregarListaMapas();
  const idx = lista.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const ok = window.confirm("Excluir este mapa da lista?");
  if (!ok) return;
  lista.splice(idx, 1);
  salvarListaMapas(lista);
  renderizarListaMapas();
}

function renderizarListaMapas() {
  if (!corpoMapas) return;
  const lista = carregarListaMapas();

  const rows = lista.map((m) => `
    <tr>
      <td class="centro">${escaparHtml(m.numeroMapa || "—")}</td>
      <td>${escaparHtml(m.descricao || "—")}</td>
      <td>${escaparHtml(m.cliente || "—")}</td>
      <td class="centro">${escaparHtml(m.dataFinalizacao || "—")}</td>
      <td class="valor"><b>${formatarMoeda(m.totalMapa || 0)}</b></td>
      <td class="centro">${Array.isArray(m.pagamentosIds) ? m.pagamentosIds.length : 0}</td>
      <td class="centro">
        <button title="Excluir" class="perigo" onclick="removerMapa('${m.id}')">✖</button>
      </td>
    </tr>
  `).join("");

  corpoMapas.innerHTML = rows || `<tr><td colspan="7" class="centro atenuado">—</td></tr>`;

}

renderizarListaMapas();
