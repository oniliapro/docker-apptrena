/* ===== START (Mapa) ===== */
const storageMapaApp = window.controleObraStorage || window.localStorage;

let estadoModalEtapas = null;

function hojeIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function montarOpcoesEapMapa(selectedId) {
  const sid = String(selectedId || "");
  if (!snapshotEap.length) {
    return `<option value="">(Cadastre a EAP primeiro)</option>`;
  }

  const options = [
    `<option value=""></option>`,
    ...snapshotEap.map((x) => {
      const level = String(x.eap || "").split(".").filter(Boolean).length - 1;
      const indent = "\u00A0".repeat(Math.max(0, level) * 3);
      const label = rotuloEapMapa(x);
      const txt = `${indent}${label}`;
      const sel = (x.id === sid) ? "selected" : "";
      return `<option value="${x.id}" ${sel}>${txt}</option>`;
    }),
  ];
  return options.join("");
}

function abrirModalEtapas(indiceItem) {
  const it = itens[indiceItem];
  if (!it) return;

  const etapasBase = (Array.isArray(it.etapas) && it.etapas.length)
    ? it.etapas.map((e) => ({ eapId: String(e.eapId || ""), valor: Number(e.valor) || 0 }))
    : (String(it.etapa || "").trim()
      ? [{ eapId: String(it.etapa || ""), valor: 100 }]
      : []);

  estadoModalEtapas = {
    itemIndex: indiceItem,
    modo: (it.modoEtapa === "quantidade") ? "quantidade" : "percentual",
    etapas: etapasBase,
  };

  if (tituloModalEtapas) {
    tituloModalEtapas.textContent = `Etapas do item ${indiceItem + 1}`;
  }

  if (modoEtapasPercentual) modoEtapasPercentual.checked = estadoModalEtapas.modo === "percentual";
  if (modoEtapasQuantidade) modoEtapasQuantidade.checked = estadoModalEtapas.modo === "quantidade";

  renderizarModalEtapas();

  if (modalEtapas) {
    modalEtapas.classList.remove("oculto");
    modalEtapas.setAttribute("aria-hidden", "false");
  }
}

function fecharModalEtapas() {
  if (!modalEtapas) return;
  modalEtapas.classList.add("oculto");
  modalEtapas.setAttribute("aria-hidden", "true");
  estadoModalEtapas = null;
}

function adicionarLinhaEtapa() {
  if (!estadoModalEtapas) return;
  estadoModalEtapas.etapas.push({ eapId: "", valor: 0 });
  renderizarModalEtapas();
}

function removerLinhaEtapa(index) {
  if (!estadoModalEtapas) return;
  const i = Number(index);
  if (!Number.isFinite(i)) return;
  estadoModalEtapas.etapas.splice(i, 1);
  renderizarModalEtapas();
}

function atualizarLinhaEtapa(index, campo, valor) {
  if (!estadoModalEtapas) return;
  const i = Number(index);
  const row = estadoModalEtapas.etapas[i];
  if (!row) return;

  if (campo === "eapId") row.eapId = String(valor || "");
  if (campo === "valor") row.valor = parsearBR(valor);
  renderizarResumoModalEtapas();
}

function renderizarResumoModalEtapas() {
  if (!estadoModalEtapas) return;
  const it = itens[estadoModalEtapas.itemIndex];
  if (!it) return;

  const soma = estadoModalEtapas.etapas.reduce((acc, e) => acc + (Number(e.valor) || 0), 0);
  const referencia = (estadoModalEtapas.modo === "percentual") ? 100 : (Number(it.qtde) || 0);
  const diff = referencia - soma;

  if (somaEtapasModal) somaEtapasModal.textContent = (estadoModalEtapas.modo === "percentual")
    ? formatarPercentual(soma)
    : Number(soma).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  if (referenciaEtapasModal) referenciaEtapasModal.textContent = (estadoModalEtapas.modo === "percentual")
    ? "100 %"
    : Number(referencia).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  if (diferencaEtapasModal) diferencaEtapasModal.textContent = (estadoModalEtapas.modo === "percentual")
    ? formatarPercentual(diff)
    : Number(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function renderizarModalEtapas() {
  if (!estadoModalEtapas || !corpoModalEtapas) return;

  estadoModalEtapas.modo = modoEtapasQuantidade?.checked ? "quantidade" : "percentual";

  const rows = estadoModalEtapas.etapas.map((e, idx) => {
    const placeholder = estadoModalEtapas.modo === "percentual" ? "0,00 %" : "0,00";
    const valorTxt = (estadoModalEtapas.modo === "percentual")
      ? (Number(e.valor) ? formatarPercentual(e.valor) : "")
      : (Number(e.valor) ? Number(e.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");

    return `
      <tr>
        <td>
          <select onchange="atualizarLinhaEtapa(${idx}, 'eapId', this.value)">
            ${montarOpcoesEapMapa(e.eapId)}
          </select>
        </td>
        <td>
          <input class="valor"
            value="${valorTxt}"
            placeholder="${placeholder}"
            onblur="atualizarLinhaEtapa(${idx}, 'valor', this.value)">
        </td>
        <td class="centro">
          <button type="button" onclick="removerLinhaEtapa(${idx})">✖</button>
        </td>
      </tr>
    `;
  }).join("");

  corpoModalEtapas.innerHTML = rows || `<tr><td colspan="3" class="centro atenuado">Sem etapas</td></tr>`;
  renderizarResumoModalEtapas();
}

function salvarModalEtapas() {
  if (!estadoModalEtapas) return;
  const it = itens[estadoModalEtapas.itemIndex];
  if (!it) return;

  it.modoEtapa = estadoModalEtapas.modo;
  it.etapas = estadoModalEtapas.etapas
    .filter((e) => String(e.eapId || "").trim() && (Number(e.valor) || 0) !== 0)
    .map((e) => ({ eapId: String(e.eapId || ""), valor: Number(e.valor) || 0 }));

  if (it.etapas.length === 1 && it.modoEtapa === "percentual") it.etapa = it.etapas[0].eapId;
  else it.etapa = "";

  fecharModalEtapas();
  enfileirarRenderizacao();
}

function obterRateiosItemParaPagamento(item) {
  const etapas = (Array.isArray(item?.etapas) && item.etapas.length)
    ? item.etapas
    : (String(item?.etapa || "").trim() ? [{ eapId: item.etapa, valor: 100 }] : []);

  if (!etapas.length) return [{ eapId: "", fator: 1 }];

  const modo = (item?.modoEtapa === "quantidade") ? "quantidade" : "percentual";

  if (modo === "quantidade") {
    const soma = etapas.reduce((acc, e) => acc + (Number(e.valor) || 0), 0);
    const denom = soma > 0 ? soma : 0;
    return etapas.map((e) => ({
      eapId: String(e.eapId || ""),
      fator: denom > 0 ? (Number(e.valor) || 0) / denom : 0,
    }));
  }

  const somaPct = etapas.reduce((acc, e) => acc + (Number(e.valor) || 0), 0);
  const denom = somaPct > 0 ? somaPct : 0;
  return etapas.map((e) => ({
    eapId: String(e.eapId || ""),
    fator: denom > 0 ? (Number(e.valor) || 0) / denom : 0,
  }));
}

function gerarPagamentosDoMapa() {
  if (!window.pagamentosUtil) return;

  if (modoManual && !compraPersonalizadaCompleta()) {
    window.alert("Compra personalizada incompleta. Selecione 1 fornecedor por item.");
    return;
  }

  const alocacoes = modoManual ? obterAlocacoesPersonalizadas() : obterAlocacoesEfetivasEstadoAtual();
  if (!alocacoes.length) {
    window.alert("Não há itens válidos para gerar pagamentos.");
    return;
  }

  const payload = window.pagamentosUtil.carregarPayloadPagamentos();
  const lista = Array.isArray(payload?.pagamentos) ? payload.pagamentos.slice() : [];

  const pagamentosNovos = [];
  const pagamentosPorFornecedor = new Map();

  alocacoes.forEach((a) => {
    const it = itens[a.itemIndex];
    const si = a.supplierIndex;
    if (!it || si == null) return;

    const fornecedorNome = fornecedores?.[si]?.fornecedor || `Fornecedor ${si + 1}`;
    if (!pagamentosPorFornecedor.has(si)) {
      pagamentosPorFornecedor.set(si, {
        fornecedor: fornecedorNome,
        itens: [],
        total: 0,
      });
    }

    const grupo = pagamentosPorFornecedor.get(si);
    const rateios = obterRateiosItemParaPagamento(it);
    const imposto = obterTaxaImposto(si);
    const unit = Number(it.unit?.[si]) || 0;
    const qtde = Number(it.qtde) || 0;

    rateios.forEach((r) => {
      const fator = Number(r.fator) || 0;
      if (fator <= 0) return;
      const quantidadeShare = qtde * fator;
      const base = unit * quantidadeShare;
      const totalItem = base * (1 + imposto);

      grupo.itens.push({
        id: window.pagamentosUtil.gerarId(),
        descricao: it.desc || "Item",
        tipo: String(it.tipo || ""),
        eapId: String(r.eapId || ""),
        valor: totalItem,
        modoValor: "valor",
      });
      grupo.total += totalItem;
    });
  });

  pagamentosPorFornecedor.forEach((grupo, si) => {
    const imposto = obterTaxaImposto(si);
    const fornecedor = fornecedores[si];
    const usarDesconto = modoManual ? (Number(fornecedor?.descontoParcial) || 0) : (Number(fornecedor?.desconto) || 0);

    if (Number(fornecedor?.frete) > 0) {
      const freteTrib = Number(fornecedor.frete) * (1 + imposto);
      grupo.itens.push({
        id: window.pagamentosUtil.gerarId(),
        descricao: "Frete loja",
        tipo: "outros",
        eapId: "",
        valor: freteTrib,
        modoValor: "valor",
      });
      grupo.total += freteTrib;
    }

    if (usarDesconto > 0) {
      const descTrib = Number(usarDesconto) * (1 + imposto);
      grupo.itens.push({
        id: window.pagamentosUtil.gerarId(),
        descricao: "Desconto",
        tipo: "outros",
        eapId: "",
        valor: -descTrib,
        modoValor: "valor",
      });
      grupo.total -= descTrib;
    }

    const numeroPagamento = window.pagamentosUtil.gerarNumeroPagamento(lista);
    const pagamento = {
      id: window.pagamentosUtil.gerarId(),
      numeroPagamento,
      obraNumber: snapshotCabecalhoEap?.mapNumber || "",
      dataSolicitacao: inputDataFinalizacaoMapa?.value || hojeIso(),
      dataPagamento: "",
      fornecedor: grupo.fornecedor,
      descricao: `Mapa ${inputNumeroMapa?.value || ""}`.trim(),
      valorTotal: grupo.total,
      itens: grupo.itens,
      origem: { tipo: "mapa", refId: mapaId },
    };

    lista.push(pagamento);
    pagamentosNovos.push(pagamento);
  });

  if ((Number(freteParticular) || 0) > 0) {
    const numeroPagamento = window.pagamentosUtil.gerarNumeroPagamento(lista);
    const pagamentoFrete = {
      id: window.pagamentosUtil.gerarId(),
      numeroPagamento,
      obraNumber: snapshotCabecalhoEap?.mapNumber || "",
      dataSolicitacao: inputDataFinalizacaoMapa?.value || hojeIso(),
      dataPagamento: "",
      fornecedor: "Frete particular",
      descricao: `Mapa ${inputNumeroMapa?.value || ""}`.trim(),
      valorTotal: Number(freteParticular) || 0,
      itens: [{
        id: window.pagamentosUtil.gerarId(),
        descricao: "Frete particular",
        tipo: "outros",
        eapId: "",
        valor: Number(freteParticular) || 0,
        modoValor: "valor",
      }],
      origem: { tipo: "mapa", refId: mapaId },
    };
    lista.push(pagamentoFrete);
    pagamentosNovos.push(pagamentoFrete);
  }

  payload.pagamentos = lista;
  window.pagamentosUtil.salvarPayloadPagamentos(payload);

  return pagamentosNovos;
}

function salvarMapaNaLista(pagamentosGerados) {
  const chave = "controleObra.mapas.v1";
  let lista = [];
  try {
    const raw = storageMapaApp.getItem(chave);
    if (raw) lista = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch (_) {
    lista = [];
  }

  const registro = {
    id: mapaId,
    numeroMapa: String(inputNumeroMapa?.value || ""),
    descricao: String(inputDescricaoMapa?.value || ""),
    cliente: String(clienteSelecionado || ""),
    responsavelMapa: String(document.getElementById("responsavelMapa")?.value || ""),
    responsavelObra: String(document.getElementById("responsavelObra")?.value || ""),
    dataFinalizacao: String(inputDataFinalizacaoMapa?.value || ""),
    dataNecessidade: String(inputDataNecessidadeMapa?.value || ""),
    totalMapa: pagamentosGerados.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0),
    pagamentosIds: pagamentosGerados.map((p) => p.id),
  };

  const idx = lista.findIndex((m) => m.id === mapaId);
  if (idx >= 0) lista[idx] = registro;
  else lista.push(registro);

  try {
    storageMapaApp.setItem(chave, JSON.stringify(lista));
  } catch (_) {
    // sem persistência
  }
}

function finalizarMapa() {
  if (!itens.length) {
    window.alert("Adicione itens antes de finalizar.");
    return;
  }

  const faltandoTipo = itens.some((it) => !String(it.tipo || "").trim());
  if (faltandoTipo) {
    window.alert("Preencha o tipo de todos os itens.");
    return;
  }

  const pagamentosGerados = gerarPagamentosDoMapa();
  if (!pagamentosGerados || !pagamentosGerados.length) return;

  salvarMapaNaLista(pagamentosGerados);
  window.alert("Mapa finalizado e pagamentos gerados.");
}

// init
adicionarFornecedor();
adicionarFornecedor();
adicionarItem();
renderizar();
iniciarNavegacaoGlobal();

if (modoEtapasPercentual) modoEtapasPercentual.addEventListener("change", renderizarModalEtapas);
if (modoEtapasQuantidade) modoEtapasQuantidade.addEventListener("change", renderizarModalEtapas);
