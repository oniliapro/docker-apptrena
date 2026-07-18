/* ===== MEDIÇÕES DA EMPREITA ===== */
const corpoMedicoes = document.getElementById("corpoMedicoes");
const infoEmpreita = document.getElementById("infoEmpreita");
const storageEmpreitasMedicoes = window.controleObraStorage || window.localStorage;

function formatarMoeda(v) {
  return "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarDataPtBr(iso) {
  const s = String(iso || "");
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString("pt-BR");
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR");
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
    const raw = storageEmpreitasMedicoes.getItem("controleObra.empreitas.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function renderizarMedicoes() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const lista = carregarListaEmpreitas();
  const empreita = lista.find((e) => String(e.id) === String(id));

  if (!empreita) {
    if (infoEmpreita) infoEmpreita.innerHTML = `<div class="atenuado">Empreita não encontrada.</div>`;
    if (corpoMedicoes) corpoMedicoes.innerHTML = `<tr><td colspan="7" class="centro atenuado">—</td></tr>`;
    return;
  }

  if (infoEmpreita) {
    infoEmpreita.innerHTML = `
      <table class="tabela-resumo">
        <tbody>
          <tr><th>Obra</th><td>${escaparHtml(empreita.obraNumber || "—")}</td></tr>
          <tr><th>Nº Empreita</th><td>${escaparHtml(empreita.numeroEmpreita || "—")}</td></tr>
          <tr><th>Descrição</th><td>${escaparHtml(empreita.descricaoEmpreita || "—")}</td></tr>
          <tr><th>Empreiteiro</th><td>${escaparHtml(empreita.nomeEmpreiteiro || "—")}</td></tr>
        </tbody>
      </table>
    `;
  }

  const registros = Array.isArray(empreita.registros) ? empreita.registros : [];
  const totalEmpreita = Number(empreita.totalEmpreita) || 0;

  let somaAcumulada = 0;
  const rows = registros.map((r) => {
    somaAcumulada += Number(r.totals?.totalPeriodo) || 0;
    const saldo = totalEmpreita - somaAcumulada;

    return `
      <tr>
        <td class="centro">${escaparHtml(formatarDataPtBr(r.date))}</td>
        <td class="centro">${escaparHtml(r.competencia || "—")}</td>
        <td>${escaparHtml(r.obs || "")}</td>
        <td class="valor"><b>${formatarMoeda(r.totals?.pagarEmp || 0)}</b></td>
        <td class="valor">${formatarMoeda(r.totals?.reservarPgto || 0)}</td>
        <td class="valor"><b>${formatarMoeda(r.totals?.totalPeriodo || 0)}</b></td>
        <td class="valor">${formatarMoeda(saldo)}</td>
      </tr>
    `;
  }).join("");

  if (corpoMedicoes) {
    corpoMedicoes.innerHTML = rows || `<tr><td colspan="7" class="centro atenuado">—</td></tr>`;
  }

}

renderizarMedicoes();
