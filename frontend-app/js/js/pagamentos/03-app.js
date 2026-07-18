/* ===== START (Pagamentos) ===== */

let estadoModalPagamento = null;

function formatarPercentual(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " %";
}

function valorOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarMoeda(n);
}

function percentualOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarPercentual(n);
}

function obterPagamentoPorId(id) {
  const key = String(id || "");
  return listaPagamentos.find((p) => p.id === key) || null;
}

function criarPagamentoVazio() {
  const numero = window.pagamentosUtil?.gerarNumeroPagamento
    ? window.pagamentosUtil.gerarNumeroPagamento(listaPagamentos)
    : "";

  return {
    id: gerarId(),
    numeroPagamento: numero,
    obraNumber: cabecalhoPagamentos.obraNumber || "",
    dataSolicitacao: hojeIso(),
    dataPagamento: "",
    fornecedor: "",
    descricao: "",
    valorTotal: 0,
    itens: [],
    origem: null,
  };
}

function abrirModalPagamento(id) {
  const existente = id ? obterPagamentoPorId(id) : null;
  const base = existente ? window.pagamentosUtil.normalizarPagamento(existente) : criarPagamentoVazio();

  pagamentoEditandoId = existente ? existente.id : null;
  estadoModalPagamento = JSON.parse(JSON.stringify(base));

  if (tituloModalPagamento) {
    tituloModalPagamento.textContent = existente ? "Editar pagamento" : "Novo pagamento";
  }

  if (inputsPagamento.numeroPagamento) inputsPagamento.numeroPagamento.value = estadoModalPagamento.numeroPagamento || "";
  if (inputsPagamento.dataSolicitacao) inputsPagamento.dataSolicitacao.value = estadoModalPagamento.dataSolicitacao || hojeIso();
  if (inputsPagamento.dataPagamento) inputsPagamento.dataPagamento.value = estadoModalPagamento.dataPagamento || "";
  if (inputsPagamento.fornecedor) inputsPagamento.fornecedor.value = estadoModalPagamento.fornecedor || "";
  if (inputsPagamento.descricao) inputsPagamento.descricao.value = estadoModalPagamento.descricao || "";
  if (inputsPagamento.valorTotal) inputsPagamento.valorTotal.value = valorOuVazio(estadoModalPagamento.valorTotal);

  renderizarItensModalPagamento();
  atualizarResumoModalPagamento();

  if (modalPagamento) {
    modalPagamento.classList.remove("oculto");
    modalPagamento.setAttribute("aria-hidden", "false");
  }
}

function fecharModalPagamento() {
  if (!modalPagamento) return;
  modalPagamento.classList.add("oculto");
  modalPagamento.setAttribute("aria-hidden", "true");
  estadoModalPagamento = null;
  pagamentoEditandoId = null;
}

function adicionarItemPagamento() {
  if (!estadoModalPagamento) return;
  estadoModalPagamento.itens.push({
    id: gerarId(),
    descricao: "",
    tipo: "",
    eapId: "",
    valor: 0,
    modoValor: "valor",
  });
  renderizarItensModalPagamento();
  atualizarResumoModalPagamento();
}

function removerItemPagamento(id) {
  if (!estadoModalPagamento) return;
  const key = String(id || "");
  estadoModalPagamento.itens = estadoModalPagamento.itens.filter((x) => x.id !== key);
  renderizarItensModalPagamento();
  atualizarResumoModalPagamento();
}

function atualizarItemPagamento(id, campo, valor) {
  if (!estadoModalPagamento) return;
  const key = String(id || "");
  const item = estadoModalPagamento.itens.find((x) => x.id === key);
  if (!item) return;

  if (campo === "valor") item.valor = parsearBR(valor);
  else if (campo === "descricao") item.descricao = String(valor || "");
  else if (campo === "tipo") item.tipo = String(valor || "");
  else if (campo === "eapId") item.eapId = String(valor || "");

  atualizarResumoModalPagamento();
}

function alternarModoValorItem(id) {
  if (!estadoModalPagamento) return;
  const key = String(id || "");
  const item = estadoModalPagamento.itens.find((x) => x.id === key);
  if (!item) return;
  item.modoValor = (item.modoValor === "percentual") ? "valor" : "percentual";
  renderizarItensModalPagamento();
  atualizarResumoModalPagamento();
}

function renderizarItensModalPagamento() {
  if (!corpoItensPagamento || !estadoModalPagamento) return;

  const rows = estadoModalPagamento.itens.map((it) => {
    const modoPercentual = it.modoValor === "percentual";
    const valorTxt = modoPercentual ? percentualOuVazio(it.valor) : valorOuVazio(it.valor);
    const placeholder = modoPercentual ? "0,00 %" : "R$ 0,00";
    const botaoModo = modoPercentual ? "%" : "R$";

    return `
      <tr>
        <td>
          <input
            value="${escaparHtml(it.descricao || "")}"
            placeholder="Ex.: Material / frete / desconto"
            onblur="atualizarItemPagamento('${it.id}', 'descricao', this.value)">
        </td>
        <td>
          <select onchange="atualizarItemPagamento('${it.id}', 'eapId', this.value)">
            ${montarOpcoesEap(it.eapId)}
          </select>
        </td>
        <td>
          <select onchange="atualizarItemPagamento('${it.id}', 'tipo', this.value)">
            ${montarOpcoesTipo(it.tipo)}
          </select>
        </td>
        <td>
          <input class="valor"
            value="${escaparHtml(valorTxt)}"
            placeholder="${escaparHtml(placeholder)}"
            onblur="atualizarItemPagamento('${it.id}', 'valor', this.value)">
        </td>
        <td class="centro">
          <button type="button" onclick="alternarModoValorItem('${it.id}')">${botaoModo}</button>
        </td>
        <td class="centro">
          <button type="button" onclick="removerItemPagamento('${it.id}')">✖</button>
        </td>
      </tr>
    `;
  }).join("");

  corpoItensPagamento.innerHTML = rows || `<tr><td colspan="6" class="centro atenuado">Sem itens</td></tr>`;
}

function atualizarResumoModalPagamento() {
  if (!estadoModalPagamento) return;

  const total = parsearBR(String(inputsPagamento?.valorTotal?.value || ""));
  estadoModalPagamento.valorTotal = total;

  const somaItens = window.pagamentosUtil
    ? window.pagamentosUtil.calcularSomaItens(estadoModalPagamento)
    : 0;

  const diferenca = total - somaItens;

  if (somaItensPagamento) somaItensPagamento.textContent = formatarMoeda(somaItens);
  if (totalPagamentoResumo) totalPagamentoResumo.textContent = formatarMoeda(total);
  if (diferencaPagamento) diferencaPagamento.textContent = formatarMoeda(diferenca);
}

function coletarPagamentoDoModal() {
  const total = parsearBR(String(inputsPagamento?.valorTotal?.value || ""));
  const numero = String(inputsPagamento?.numeroPagamento?.value || "").trim();
  const numeroPagamento = numero || (window.pagamentosUtil?.gerarNumeroPagamento ? window.pagamentosUtil.gerarNumeroPagamento(listaPagamentos) : "");

  return {
    id: estadoModalPagamento?.id || gerarId(),
    numeroPagamento,
    obraNumber: cabecalhoPagamentos.obraNumber || "",
    dataSolicitacao: String(inputsPagamento?.dataSolicitacao?.value || ""),
    dataPagamento: String(inputsPagamento?.dataPagamento?.value || ""),
    fornecedor: String(inputsPagamento?.fornecedor?.value || ""),
    descricao: String(inputsPagamento?.descricao?.value || ""),
    valorTotal: total,
    itens: Array.isArray(estadoModalPagamento?.itens) ? estadoModalPagamento.itens.map((x) => ({ ...x })) : [],
    origem: estadoModalPagamento?.origem || null,
  };
}

function validarPagamento(pagamento) {
  const erros = [];
  if (!(pagamento.valorTotal > 0)) erros.push("Informe o valor total do pagamento.");

  if (!pagamento.itens.length) erros.push("Adicione pelo menos 1 item.");

  pagamento.itens.forEach((it, idx) => {
    const v = Number(it.valor) || 0;
    if (!String(it.tipo || "").trim()) erros.push(`Item ${idx + 1}: selecione o tipo.`);
    if (v === 0) erros.push(`Item ${idx + 1}: informe o valor.`);
  });

  const soma = window.pagamentosUtil ? window.pagamentosUtil.calcularSomaItens(pagamento) : 0;
  const diff = Math.abs((pagamento.valorTotal || 0) - soma);
  if (diff > 0.01) erros.push("A soma dos itens deve ser igual ao valor total do pagamento.");

  return erros;
}

function salvarPagamento(e) {
  if (e?.preventDefault) e.preventDefault();
  if (!estadoModalPagamento) return;

  const pagamento = coletarPagamentoDoModal();
  const erros = validarPagamento(pagamento);
  if (erros.length) {
    window.alert(erros.join("\n"));
    return;
  }

  if (pagamentoEditandoId) {
    const idx = listaPagamentos.findIndex((p) => p.id === pagamentoEditandoId);
    if (idx >= 0) listaPagamentos[idx] = pagamento;
  } else {
    listaPagamentos.push(pagamento);
  }

  fecharModalPagamento();
  enfileirarRenderizacao();
}

function removerPagamento(id) {
  const key = String(id || "");
  if (!key) return;
  const idx = listaPagamentos.findIndex((p) => p.id === key);
  if (idx === -1) return;
  const ok = window.confirm("Excluir este pagamento?");
  if (!ok) return;
  listaPagamentos.splice(idx, 1);
  enfileirarRenderizacao();
}

function vincularCabecalho() {
  if (!inputsPagamento?.numeroObra) return;
  inputsPagamento.numeroObra.addEventListener("change", () => {
    cabecalhoPagamentos.obraNumber = inputsPagamento.numeroObra.value;
    enfileirarRenderizacao();
  });
}

function iniciarPagamentos() {
  const loaded = carregarEstadoPagamentos();
  snapshotEap = carregarEapSnapshotDoStorage();

  if (!loaded) {
    cabecalhoPagamentos = normalizarCabecalho({});
    listaPagamentos = [];
  }

  if (!cabecalhoPagamentos.obraNumber) {
    const n = carregarNumeroObraDoStorage();
    if (n) cabecalhoPagamentos.obraNumber = n;
  }

  vincularCabecalho();
  if (inputsPagamento?.valorTotal) {
    inputsPagamento.valorTotal.addEventListener("blur", atualizarResumoModalPagamento);
  }

  if (alternarColunaEtapas) {
    alternarColunaEtapas.addEventListener("change", () => {
      renderizarPagamentos();
    });
  }

  enfileirarRenderizacao();
}

iniciarPagamentos();
