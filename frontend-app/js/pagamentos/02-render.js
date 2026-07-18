/* ===== RENDER (Pagamentos) ===== */

function rotuloEapDoSnapshot(eapItem) {
  if (!eapItem) return "—";
  const e = String(eapItem.eap || "").trim();
  const d = String(eapItem.desc || "").trim();
  if (e && d) return `${e} - ${d}`;
  if (e) return e;
  if (d) return d;
  return "—";
}

function montarOpcoesTipo(selectedKey) {
  const sk = String(selectedKey || "");
  const options = [
    `<option value=""></option>`,
    ...TIPOS_CUSTO_PAGAMENTO.map((t) => {
      const sel = (t.key === sk) ? "selected" : "";
      return `<option value="${escaparHtml(t.key)}" ${sel}>${escaparHtml(t.label)}</option>`;
    }),
  ];
  return options.join("");
}

function montarOpcoesEap(selectedId) {
  const sid = String(selectedId || "");
  if (!snapshotEap.length) {
    return `<option value="">(Cadastre a EAP primeiro)</option>`;
  }

  const options = [
    `<option value=""></option>`,
    ...snapshotEap.map((x) => {
      const level = String(x.eap || "").split(".").filter(Boolean).length - 1;
      const indent = "\u00A0".repeat(Math.max(0, level) * 3);
      const label = rotuloEapDoSnapshot(x);
      const txt = `${indent}${label}`;
      const sel = (x.id === sid) ? "selected" : "";
      return `<option value="${escaparHtml(x.id)}" ${sel}>${escaparHtml(txt)}</option>`;
    }),
  ];
  return options.join("");
}

function obterRotuloTipo(key) {
  return TIPOS_CUSTO_PAGAMENTO.find((t) => t.key === key)?.label || key || "—";
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
  if (Number.isNaN(d.getTime())) return escaparHtml(s);
  return d.toLocaleString("pt-BR");
}

function montarListaItensPagamento(p) {
  const itens = window.pagamentosUtil ? window.pagamentosUtil.expandirItensPagamento(p) : [];
  if (!itens.length) return `<span class="atenuado">—</span>`;

  const linhas = itens.map((it) => {
    const modo = String(it.modoValor || "valor");
    const valorBr = formatarMoeda(it.valorCalculado || 0);
    const valorOrigem = (modo === "percentual")
      ? `${Number(it.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`
      : valorBr;
    const tipoLabel = obterRotuloTipo(it.tipo);
    const desc = it.descricao ? `${it.descricao} (${tipoLabel})` : tipoLabel;
    const texto = (modo === "percentual") ? `${valorOrigem} • ${valorBr}` : valorBr;
    return `<div class="lista-linha"><span>${escaparHtml(desc)}</span><span>${escaparHtml(texto)}</span></div>`;
  }).join("");

  return `<div class="lista-linhas">${linhas}</div>`;
}

function montarListaEtapasPagamento(p) {
  const itens = window.pagamentosUtil ? window.pagamentosUtil.expandirItensPagamento(p) : [];
  const comEtapa = itens.filter((it) => String(it.eapId || "").trim());
  if (!comEtapa.length) return `<span class="atenuado">—</span>`;

  const linhas = comEtapa.map((it) => {
    const eap = snapshotEap.find((x) => x.id === it.eapId);
    const etapa = rotuloEapDoSnapshot(eap);
    const tipoLabel = obterRotuloTipo(it.tipo);
    const valorBr = formatarMoeda(it.valorCalculado || 0);
    return `<div class="lista-linha"><span>${escaparHtml(`${etapa} (${tipoLabel})`)}</span><span>${escaparHtml(valorBr)}</span></div>`;
  }).join("");

  return `<div class="lista-linhas">${linhas}</div>`;
}

function renderizarPagamentos() {
  if (!corpoPagamentos || !rodapePagamentos || !tabelaPagamentos) return;

  // header -> DOM
  if (inputsPagamento?.numeroObra) inputsPagamento.numeroObra.value = cabecalhoPagamentos.obraNumber || "";

  // toggle coluna etapas
  if (alternarColunaEtapas) {
    tabelaPagamentos.classList.toggle("ocultar-col-etapas", !alternarColunaEtapas.checked);
  }

  const rows = listaPagamentos.slice().reverse().map((p) => {
    const obra = p.obraNumber || cabecalhoPagamentos.obraNumber || "—";
    const numero = p.numeroPagamento || "—";
    const solicitacao = formatarDataPtBr(p.dataSolicitacao);
    const pagamento = formatarDataPtBr(p.dataPagamento);
    const descricao = p.descricao || "—";
    const fornecedor = p.fornecedor || "—";
    const valorTotal = formatarMoeda(p.valorTotal || 0);

    return `
      <tr>
        <td class="centro">${escaparHtml(obra)}</td>
        <td class="centro">${escaparHtml(numero)}</td>
        <td class="centro">${escaparHtml(solicitacao)}</td>
        <td>${escaparHtml(descricao)}</td>
        <td>${montarListaItensPagamento(p)}</td>
        <td class="col-etapas">${montarListaEtapasPagamento(p)}</td>
        <td class="valor"><b>${escaparHtml(valorTotal)}</b></td>
        <td>${escaparHtml(fornecedor)}</td>
        <td class="centro">${escaparHtml(pagamento)}</td>
        <td class="centro">
          <button title="Editar" onclick="abrirModalPagamento('${p.id}')">✎</button>
          <button title="Excluir" onclick="removerPagamento('${p.id}')">✖</button>
        </td>
      </tr>
    `;
  }).join("");

  corpoPagamentos.innerHTML = rows || `<tr><td colspan="10" class="centro atenuado">—</td></tr>`;

  const total = listaPagamentos.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0);
  rodapePagamentos.innerHTML = `
    <tr class="bloco-topo bloco-base">
      <th colspan="6" class="rotulo-rodape">TOTAL</th>
      <th class="valor"><b>${formatarMoeda(total)}</b></th>
      <th colspan="3"></th>
    </tr>
  `;
}
