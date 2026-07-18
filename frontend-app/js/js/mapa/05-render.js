/* =========================================================
   05-render.js
   Ajustes:
   - Destaque verde sempre mostra "mais barato automático" (mesmo em modoManual)
   - Rodapé: linhas automáticas NÃO mudam com compra personalizada
   - ModoManual: cria linhas independentes "Total (Compra personalizada)" e "+ frete"
   - Frete/Descontos: exibe (sem imposto) + (com imposto) na mesma célula
   - Inputs de frete/desconto/imposto: vazios quando 0 + placeholder
   ========================================================= */

let mostrarDetalhesEtapasNoMapa = false;

function alternarVisualizacaoEtapasNoMapa() {
  mostrarDetalhesEtapasNoMapa = !mostrarDetalhesEtapasNoMapa;
  enfileirarRenderizacao();
}

/* ===== COLGROUP ===== */
function renderizarGrupoColunas() {
  grupoColunas.innerHTML = `
    <col class="col-numero">
    <col class="col-descricao">
    <col class="col-tipo">
    <col class="col-quantidade">
    <col class="col-unidade">
    <col class="col-etapa">
  `;
  fornecedores.forEach(() => {
    grupoColunas.insertAdjacentHTML(
      "beforeend",
      `<col class="col-valor"><col class="col-valor"><col class="col-valor">`
    );
  });
  grupoColunas.insertAdjacentHTML("beforeend", `<col>`);
}

/* ===== FORNECEDORES ===== */
function adicionarFornecedor() {
  fornecedores.push({
    fornecedor: "",
    contato: "",
    imposto: 0,
    frete: 0,
    desconto: 0,         // desconto integral
    descontoParcial: 0,  // desconto manual (só aparece no modoManual)
    ativo: true
  });

  itens.forEach((it) => {
    it.unit.push(0);
    it.comprar.push(false);
  });

  enfileirarRenderizacao();
}

function removerFornecedor(i, linhaFoco = 0) {
  if (i < 0 || i >= fornecedores.length) return;

  fornecedores.splice(i, 1);
  itens.forEach((it) => {
    it.unit.splice(i, 1);
    it.comprar.splice(i, 1);

    if (it.choice === i) it.choice = null;
    else if (it.choice !== null && it.choice > i) it.choice -= 1;
  });

  if (fornecedores.length > 0) {
    const maisProximo = Math.min(i, fornecedores.length - 1);
    definirProximoFoco(linhaFoco, colunaUnitario(maisProximo), "body");
  } else {
    definirProximoFoco(linhaFoco, 0, "body");
  }

  enfileirarRenderizacao();
}

/* ===== ITENS ===== */
function adicionarItem() {
  itens.push({
    desc: "",
    tipo: "material",
    qtde: 0,
    unid: "",
    etapa: "",
    etapas: [],
    modoEtapa: "percentual",
    unit: fornecedores.map(() => 0),
    comprar: fornecedores.map(() => false),
    choice: null
  });
  enfileirarRenderizacao();
}

function removerItem(i) {
  if (i < 0 || i >= itens.length) return;
  itens.splice(i, 1);
  enfileirarRenderizacao();
}

/* ===== COMPRA MANUAL: 1 loja por item ===== */
function alternarEscolhaManual(indiceItem, indiceFornecedor, marcado) {
  const it = itens[indiceItem];
  if (!it) return;

  if (marcado) {
    const s = fornecedores[indiceFornecedor];
    if (!s?.ativo) { enfileirarRenderizacao(); return; }
    if (!(Number(it.unit[indiceFornecedor]) > 0)) { enfileirarRenderizacao(); return; }
    it.choice = indiceFornecedor;
  } else {
    if (it.choice === indiceFornecedor) it.choice = null;
  }

  enfileirarRenderizacao();
}

/* ===== HELPERS VISUAIS ===== */
function classePosicaoFornecedor(pos) {
  return pos === 0 ? "fornecedor-esquerda" : pos === 1 ? "fornecedor-meio" : "fornecedor-direita";
}

function obterEtapasNormalizadas(item) {
  if (Array.isArray(item?.etapas) && item.etapas.length) return item.etapas;
  const etapa = String(item?.etapa || "").trim();
  if (!etapa) return [];
  return [{ eapId: etapa, valor: 100 }];
}

function rotuloEtapaPorId(id) {
  const txt = obterRotuloEapPorId(id);
  return (txt && txt !== "—") ? txt : String(id || "—");
}

function formatarValorEtapaResumo(item, etapa) {
  const valor = Number(etapa?.valor) || 0;
  if (item?.modoEtapa === "quantidade") {
    const qtd = Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    const unid = String(item?.unid || "").trim();
    return unid ? `${qtd} ${unid}` : qtd;
  }
  return formatarPercentual(valor);
}

function obterResumoEtapasItem(item) {
  const etapas = obterEtapasNormalizadas(item);
  if (!etapas.length) return "Sem etapa";

  if (!mostrarDetalhesEtapasNoMapa) {
    if (etapas.length === 1) return rotuloEtapaPorId(etapas[0].eapId);
    return `${etapas.length} Etapas`;
  }

  return etapas.map((e) => {
    const nome = rotuloEtapaPorId(e.eapId);
    const valor = formatarValorEtapaResumo(item, e);
    return `${valor} ${nome}`;
  }).join("<br>");
}

/* =========================================================
   HELPERS FOOTER
   ========================================================= */

function compraPersonalizadaCompleta() {
  if (!modoManual) return false;
  for (const it of itens) {
    const q = Number(it.qtde) || 0;
    if (q <= 0) continue;
    const si = it.choice;
    if (!(Number.isFinite(si)) || si === null) return false;
    if (!fornecedores?.[si]?.ativo) return false;
    if (!(Number(it.unit?.[si]) > 0)) return false;
  }
  return true;
}

function obterAlocacoesPersonalizadas() {
  const alocacoes = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const it = itens[idx];
    const q = Number(it.qtde) || 0;
    if (q <= 0) continue;
    const si = it.choice;
    if (!(Number.isFinite(si)) || si === null) return [];
    alocacoes.push({ itemIndex: idx, supplierIndex: si });
  }
  return alocacoes;
}

function somarTotaisItensPorFornecedorDeAlocacoes(alocacoes) {
  const soma = fornecedores.map(() => 0);
  for (const a of alocacoes) {
    const it = itens[a.itemIndex];
    const si = a.supplierIndex;
    if (!it || si == null) continue;
    soma[si] += calcularTotalItemPorFornecedor(it, si);
  }
  return soma;
}

function montarDescontosZerados() {
  return fornecedores.map(() => 0);
}

function montarDescontosPersonalizados(alocacoes) {
  const usados = fornecedores.map(() => false);
  for (const a of alocacoes) usados[a.supplierIndex] = true;
  return fornecedores.map((s, si) => usados[si] ? (Number(s.descontoParcial) || 0) : 0);
}

/* Small helper: show empty input when 0 */
function moedaOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarMoeda(n);
}
function percentualOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarPercentual(n);
}

/* Helper: render 2-col cell (input sem imposto + texto com imposto) */
function renderizarCelulaMoedaComImposto({ value, taxRate, placeholder, onblur, dataAttrs = "" }) {
  const v = Number(value) || 0;
  const tributado = v * (1 + (Number(taxRate) || 0));
  return `
    <div class="duas-colunas">
      <input ${dataAttrs}
        value="${moedaOuVazio(v)}"
        placeholder="${placeholder}"
        onblur="${onblur}">
      <div class="duas-colunas-valor">${formatarMoeda(tributado)}</div>
    </div>
  `;
}

/* =========================================================
   RENDER
   ========================================================= */
function renderizar() {
  renderizarGrupoColunas();
  renderizarCabecalho();
  renderizarCorpo();
  renderizarRodape();
  renderizarPainelTestes();
  iniciarNavegacaoCabecalho();
  aplicarProximoFoco();

  if (typeof renderizarResumos === "function") renderizarResumos();
}

/* ===== HEAD ===== */
function renderizarCabecalho() {
  cabecalhoTabela.innerHTML = `
    <tr>
      <th rowspan="2">Nº</th>
      <th rowspan="2">Descrição</th>
      <th rowspan="2">Tipo</th>
      <th rowspan="2">Qtde</th>
      <th rowspan="2">Unid.</th>
      <th rowspan="2">
        <div class="cabecalho-etapas">
          <span>Etapas</span>
          <button type="button" class="botao-etapas-toggle"
            onclick="alternarVisualizacaoEtapasNoMapa()">
            ${mostrarDetalhesEtapasNoMapa ? "x Etapas" : "Detalhar"}
          </button>
        </div>
      </th>

      ${fornecedores.map((s, i) => `
        <th colspan="3">
          <div class="caixa-fornecedor">
            <span>Fornecedor</span>
            <select onchange="fornecedores[${i}].fornecedor=this.value;fornecedores[${i}].contato='';enfileirarRenderizacao()">
              <option></option>
              ${dados.fornecedores.map((f) => `
                <option ${s.fornecedor === f ? "selected" : ""}>${f}</option>
              `).join("")}
            </select>
          </div>
          <div class="caixa-fornecedor">
            <span>Contato</span>
            <select onchange="fornecedores[${i}].contato=this.value">
              <option></option>
              ${(dados.contatos[s.fornecedor] || []).map((c) => `
                <option ${s.contato === c ? "selected" : ""}>${c}</option>
              `).join("")}
            </select>
          </div>
          <button onclick="removerFornecedor(${i}, 0)">🗑️</button>
        </th>
      `).join("")}

      <th rowspan="2"></th>
    </tr>

    <tr>
      ${fornecedores.map(() => `
        <th class="fornecedor-esquerda">Unit. (S/ Imposto)</th>
        <th class="fornecedor-meio">Comprar</th>
        <th class="fornecedor-direita">Total (C/ Imposto)</th>
      `).join("")}
    </tr>
  `;
}

/* ===== BODY ===== */
function renderizarCorpo() {
  corpoTabela.innerHTML = "";

  itens.forEach((it, i) => {
    // destaque verde sempre pelo vencedor AUTOMÁTICO (mais barato)
    const vencedorAuto = obterVencedorAutomaticoPorItem(it);
    // vencedor efetivo só influencia o checkbox quando modoManual
    const vencedorEfetivo = obterVencedorEfetivoPorItem(it);
    const resumoEtapas = obterResumoEtapasItem(it);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>

      <td>
        <input data-group="body" data-r="${i}" data-c="0"
          value="${it.desc}"
          oninput="itens[${i}].desc=this.value">
      </td>

      <td>
        <select data-group="body" data-r="${i}" data-c="1" data-commit="render"
          onchange="itens[${i}].tipo=this.value;enfileirarRenderizacao()">
          <option value=""></option>
          ${TIPOS_CUSTO_MAPA.map((t) => `
            <option value="${t.key}" ${it.tipo === t.key ? "selected" : ""}>${t.label}</option>
          `).join("")}
        </select>
      </td>

      <td>
        <input data-group="body" data-r="${i}" data-c="2" data-commit="blur"
          value="${it.qtde ? Number(it.qtde).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"
          placeholder="0,00"
          onblur="itens[${i}].qtde=parsearBR(this.value);enfileirarRenderizacao()">
      </td>

      <td>
        <input data-group="body" data-r="${i}" data-c="3"
          value="${it.unid}"
          oninput="itens[${i}].unid=this.value">
      </td>

      <td>
        <div class="duas-colunas">
          <div class="pequeno etapas-resumo">${resumoEtapas}</div>
          <button type="button" data-group="body" data-r="${i}" data-c="4"
            onclick="abrirModalEtapas(${i})">Editar</button>
        </div>
      </td>

      ${fornecedores.map((s, si) => {
        const u = Number(it.unit[si]) || 0;
        const total = calcularTotalItemPorFornecedor(it, si);

        const isAutoWinner = !!(vencedorAuto && vencedorAuto.i === si);
        const clsL = `${classePosicaoFornecedor(0)} ${isAutoWinner ? "vencedor" : ""}`.trim();
        const clsM = `${classePosicaoFornecedor(1)} ${isAutoWinner ? "vencedor" : ""}`.trim();
        const clsR = `${classePosicaoFornecedor(2)} ${isAutoWinner ? "vencedor" : ""}`.trim();

        const cIndex = colunaUnitario(si);

        // checkbox:
        // - se modoManual: habilita, checked = choice
        // - se não manual: disabled, checked = vencedor efetivo (igual auto) e ativo
        const checked = modoManual ? (it.choice === si) : (!!(vencedorEfetivo && vencedorEfetivo.i === si) && s.ativo);
        const disabled = modoManual ? "" : "disabled";

        return `
          <td class="${clsL}">
            <input data-group="body" data-r="${i}" data-c="${cIndex}" data-commit="blur"
              value="${u > 0 ? formatarMoeda(u) : ''}"
              placeholder="R$ x.xxx,xx"
              onblur="itens[${i}].unit[${si}]=parsearBR(this.value);enfileirarRenderizacao()">
          </td>

          <td class="${clsM}">
            <input type="checkbox" ${checked ? "checked" : ""} ${disabled}
              onchange="alternarEscolhaManual(${i},${si},this.checked)">
          </td>

          <td class="valor ${clsR}">
            ${formatarMoeda(total)}
          </td>
        `;
      }).join("")}

      <td><button onclick="removerItem(${i})">🗑</button></td>
    `;
    corpoTabela.appendChild(row);
  });
}

/* ===== FOOT ===== */
function renderizarRodape() {
  const todosInativos = fornecedores.every((s) => !s.ativo);

  // troféu integral
  const testes = calcularTestesCompra();
  const trofeuIntegralSI =
    (testes.winnerKey === "integral") ? testes.integralWinnerSupplierIndex : -1;

  /* =========================
     BLOCO AUTOMÁTICO (FIXO)
     ========================= */
  const alocacoesAuto = obterAlocacoesAutomaticasEstadoAtual(); // sempre automático
  const totaisItensAuto = somarTotaisItensPorFornecedorDeAlocacoes(alocacoesAuto);

  // automático + frete loja (tributado) sem descontos (desconto integral não aplica no fracionado)
  const notasAutoLoja = calcularNotasPorFornecedorDeAlocacoes({
    allocations: alocacoesAuto,
    includeShopFreight: true,
    discountsBySupplier: montarDescontosZerados()
  });

  // integral
  const totaisIntegral = calcularIntegralPorFornecedor();

  /* =========================
     BLOCO PERSONALIZADO (INDEPENDENTE)
     ========================= */
  const personalizadoCompleto = compraPersonalizadaCompleta();
  const mostrarPersonalizado = modoManual; // mostra linhas mesmo se incompleta (valores 0/—)
  const alocacoesPersonalizadas = personalizadoCompleto ? obterAlocacoesPersonalizadas() : [];

  const totaisItensPersonalizados = personalizadoCompleto
    ? somarTotaisItensPorFornecedorDeAlocacoes(alocacoesPersonalizadas)
    : fornecedores.map(() => 0);

  const notasPersonalizadasLoja = personalizadoCompleto
    ? calcularNotasPorFornecedorDeAlocacoes({
        allocations: alocacoesPersonalizadas,
        includeShopFreight: true,
        discountsBySupplier: montarDescontosPersonalizados(alocacoesPersonalizadas)
      })
    : { bySupplier: fornecedores.map(() => ({ used: false, totalNota: 0 })) };

  /* ===== FOOT NAV IDS ===== */
  const R_FRETE = 0;
  const R_DESC_INTEGRAL = 1;
  const R_DESC_PARCIAL = 2;
  const R_IMP = 3;
  const R_ATIVO = 7;
  const R_FP = 8;

  /* =========================
     BLOCO 1: FRETE / DESCONTOS / IMPOSTO
     - Frete e descontos com 2 colunas: sem imposto (input) / com imposto (texto)
     ========================= */

  const rowFrete = `
    <tr class="bloco-topo">
      <th colspan="6" class="rotulo-rodape">(+) Frete Loja</th>
      ${fornecedores.map((s, i) => {
        const t = obterTaxaImposto(i);
        return `
          <th colspan="3" class="fornecedor-bloco-externo">
            ${renderizarCelulaMoedaComImposto({
              value: s.frete,
              taxRate: t,
              placeholder: "R$ x.xxx,xx",
              dataAttrs: `data-group="footer" data-r="${R_FRETE}" data-c="${colunaUnitario(i)}" data-commit="blur"`,
              onblur: `fornecedores[${i}].frete=parsearBR(this.value);enfileirarRenderizacao()`
            })}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  `;

  const rowDescIntegral = `
    <tr>
      <th colspan="6" class="rotulo-rodape">(-) Desconto Compra Integral</th>
      ${fornecedores.map((s, i) => {
        const t = obterTaxaImposto(i);
        return `
          <th colspan="3" class="fornecedor-bloco-externo">
            ${renderizarCelulaMoedaComImposto({
              value: s.desconto,
              taxRate: t,
              placeholder: "R$ x.xxx,xx",
              dataAttrs: `data-group="footer" data-r="${R_DESC_INTEGRAL}" data-c="${colunaUnitario(i)}" data-commit="blur"`,
              onblur: `fornecedores[${i}].desconto=parsearBR(this.value);enfileirarRenderizacao()`
            })}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  `;

  // desconto parcial só no modoManual
  const rowDescParcial = modoManual ? `
    <tr>
      <th colspan="6" class="rotulo-rodape">(-) Desconto Compra Parcial</th>
      ${fornecedores.map((s, i) => {
        const t = obterTaxaImposto(i);
        return `
          <th colspan="3" class="fornecedor-bloco-externo">
            ${renderizarCelulaMoedaComImposto({
              value: s.descontoParcial,
              taxRate: t,
              placeholder: "R$ x.xxx,xx",
              dataAttrs: `data-group="footer" data-r="${R_DESC_PARCIAL}" data-c="${colunaUnitario(i)}" data-commit="blur"`,
              onblur: `fornecedores[${i}].descontoParcial=parsearBR(this.value);enfileirarRenderizacao()`
            })}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  ` : "";

  const rowImposto = `
    <tr class="bloco-base">
      <th colspan="6" class="rotulo-rodape">(+) Imposto %</th>
      ${fornecedores.map((s, i) => `
        <th colspan="3" class="fornecedor-bloco-externo">
          <input data-group="footer" data-r="${R_IMP}" data-c="${colunaUnitario(i)}" data-commit="blur"
            value="${percentualOuVazio(s.imposto)}"
            placeholder="0,00 %"
            onblur="fornecedores[${i}].imposto=parsearBR(this.value);enfileirarRenderizacao()">
        </th>
      `).join("")}
      <th></th>
    </tr>
  `;

  /* =========================
     BLOCO 2: TOTAIS AUTOMÁTICOS (NÃO MUDAM com modoManual)
     ========================= */

  const rowTotItensAuto = `
    <tr class="bloco-topo">
      <th colspan="6" class="rotulo-rodape">Total (Apenas itens mais baratos)</th>
      ${fornecedores.map((s, i) => `
        <th colspan="3" class="valor fornecedor-bloco-externo">
          ${s.ativo ? formatarMoeda(totaisItensAuto[i] || 0) : "R$ 0,00"}
        </th>
      `).join("")}
      <th></th>
    </tr>
  `;

  const rowTotItensAutoFrete = `
    <tr>
      <th colspan="6" class="rotulo-rodape">Total (Apenas itens mais baratos) + frete</th>
      ${fornecedores.map((s, i) => {
        const x = notasAutoLoja.bySupplier[i];
        const show = (s.ativo && x?.used) ? x.totalNota : 0;
        return `
          <th colspan="3" class="valor fornecedor-bloco-externo">
            ${s.ativo ? formatarMoeda(show) : "R$ 0,00"}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  `;

  const rowTotIntegral = `
    <tr class="bloco-base">
      <th colspan="6" class="rotulo-rodape">Total + frete</th>
      ${fornecedores.map((s, i) => {
        const trofeu = (i === trofeuIntegralSI) ? " 🏆" : "";
        return `
          <th colspan="3" class="valor fornecedor-bloco-externo">
            ${s.ativo ? (formatarMoeda(totaisIntegral[i] || 0) + trofeu) : "R$ 0,00"}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  `;

  /* =========================
     BLOCO 2B: TOTAIS PERSONALIZADOS (NOVOS, independentes)
     ========================= */
  const rowTotCustom = mostrarPersonalizado ? `
    <tr class="bloco-topo">
      <th colspan="6" class="rotulo-rodape">Total (Compra personalizada)</th>
      ${fornecedores.map((s, i) => `
        <th colspan="3" class="valor fornecedor-bloco-externo">
          ${s.ativo ? formatarMoeda(totaisItensPersonalizados[i] || 0) : "R$ 0,00"}
        </th>
      `).join("")}
      <th></th>
    </tr>
  ` : "";

  const rowTotCustomFrete = mostrarPersonalizado ? `
    <tr class="bloco-base">
      <th colspan="6" class="rotulo-rodape">Total (Compra personalizada) + frete</th>
      ${fornecedores.map((s, i) => {
        const x = notasPersonalizadasLoja.bySupplier?.[i];
        const show = (personalizadoCompleto && s.ativo && x?.used) ? x.totalNota : 0;
        return `
          <th colspan="3" class="valor fornecedor-bloco-externo">
            ${s.ativo ? formatarMoeda(show) : "R$ 0,00"}
          </th>
        `;
      }).join("")}
      <th></th>
    </tr>
  ` : "";

  /* =========================
     BLOCO 3: ATIVO
     ========================= */
  const rowAtivo = `
    <tr class="bloco-topo bloco-base">
      <th colspan="6" class="rotulo-rodape">Lojas possuem preços que viabilizam a compra mais barata possível?</th>
      ${fornecedores.map((s, i) => `
        <th colspan="3" class="fornecedor-bloco-externo">
          <input type="checkbox"
            data-group="footer" data-r="${R_ATIVO}" data-c="${colunaUnitario(i)}"
            ${s.ativo ? "checked" : ""}
            onchange="fornecedores[${i}].ativo=this.checked;enfileirarRenderizacao()">
        </th>
      `).join("")}
      <th></th>
    </tr>
  `;

  const rowWarn = todosInativos ? `
    <tr>
      <th colspan="100%" class="aviso-simulacao">
        Selecione 1 ou mais fornecedores para simular mapa
      </th>
    </tr>
  ` : "";

  /* =========================
     BLOCO 4: FRETE PARTICULAR (sem imposto)
     ========================= */
  const rowFreteParticular = `
    <tr class="bloco-topo bloco-base">
      <th colspan="6" class="rotulo-rodape">(+) Frete Particular</th>
      <th colspan="${fornecedores.length * 3}" class="fornecedor-bloco-externo">
        <div class="duas-colunas">
          <input data-group="footer" data-r="${R_FP}" data-c="0" data-commit="blur"
            value="${moedaOuVazio(freteParticular)}"
            placeholder="R$ x.xxx,xx"
            onblur="freteParticular=parsearBR(this.value);enfileirarRenderizacao()">
          <div class="duas-colunas-valor">${formatarMoeda(Number(freteParticular) || 0)}</div>
        </div>
      </th>
      <th></th>
    </tr>
  `;

  rodapeTabela.innerHTML = `
    ${rowFrete}
    ${rowDescIntegral}
    ${rowDescParcial}
    ${rowImposto}

    <tr class="bloco-espaco"><td colspan="100%"></td></tr>

    ${rowTotItensAuto}
    ${rowTotItensAutoFrete}
    ${rowTotIntegral}

    ${mostrarPersonalizado ? `<tr class="bloco-espaco"><td colspan="100%"></td></tr>` : ""}

    ${rowTotCustom}
    ${rowTotCustomFrete}

    <tr class="bloco-espaco"><td colspan="100%"></td></tr>

    ${rowAtivo}
    ${rowWarn}
    ${rowFreteParticular}
  `;
}
