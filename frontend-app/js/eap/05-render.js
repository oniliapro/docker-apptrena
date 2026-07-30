/* ===== RENDER (EAP - Orçado) ===== */

const COL_GRUPO = 0;
const COL_EAP = 1;
const COL_DESCRICAO = 2;
const COL_QUANTIDADE = 3;
const COL_UNIDADE = 4;

const COL_UNITARIO_BASE = 10;
const COL_TOTAL_BASE = 20;
const COL_BDI_PCT = 30;
const COL_BDI_VAL = 31;

function colunaUnitarioTipo(typeIndex) { return COL_UNITARIO_BASE + typeIndex; }
function colunaUnitarioTotal() { return COL_UNITARIO_BASE + TIPOS_CUSTO.length; }
function colunaTotalTipo(typeIndex) { return COL_TOTAL_BASE + typeIndex; }
function colunaTotalTotal() { return COL_TOTAL_BASE + TIPOS_CUSTO.length; }

function obterNivelEap(eap) {
  const v = String(eap || "").trim();
  if (!v) return 0;
  return v.split(".").filter(Boolean).length - 1;
}

function obterTiposVisiveis() {
  return TIPOS_CUSTO
    .map((t, idx) => ({ ...t, idx }))
    .filter((t) => estadoUi.visibleTypes?.[t.key] !== false);
}

function deveMostrarColunasTipo() {
  const visiveis = obterTiposVisiveis();
  return Boolean(estadoUi.showTypes) && visiveis.length > 0;
}

function obterRotuloTipoCusto(typeKey) {
  return TIPOS_CUSTO.find((t) => t.key === typeKey)?.label || typeKey || "—";
}

function calcularRealizadoPorItemId(pagamentos) {
  const map = new Map();
  for (const p of pagamentos || []) {
    const id = String(p?.eapId || "");
    const k = String(p?.tipo || "");
    const v = Number(p?.valor) || 0;
    if (!id || !k || v === 0) continue;
    if (!map.has(id)) map.set(id, criarVazioPorTipo());
    map.get(id)[k] += v;
  }
  return map;
}

function somarPagamentosParaGrupoEap(groupEap, pagamentos, itemById, typeKey = "") {
  const eap = String(groupEap || "").trim();
  if (!eap) return criarVazioPorTipo();

  const tk = String(typeKey || "");
  const acc = criarVazioPorTipo();

  for (const p of pagamentos || []) {
    if (tk && p.tipo !== tk) continue;
    const payIt = itemById.get(String(p.eapId || ""));
    const pe = String(payIt?.eap || "").trim();
    if (!pe) continue;
    if (pe === eap || ehDescendente(eap, pe)) {
      acc[p.tipo] += Number(p.valor) || 0;
    }
  }

  return acc;
}

function renderizarPilhaOrcadoRealizado({ rowIndex, typeKey, realizado, orcado }) {
  const r = Number(realizado) || 0;
  const o = Number(orcado) || 0;
  const modoPercentual = (estadoUi?.orcRealMode === "pct");
  const valorReal = modoPercentual ? formatarPercentual(percentualSeguro(r, o)) : formatarMoeda(r);

  const realHtml = `
    <button class="indicador-link" type="button" onclick="abrirModalGastos(${rowIndex}, '${String(typeKey || "")}')">
      ${escaparHtml(valorReal)}
    </button>
  `;

  return `
    <div class="indicador-pilha">
      <div class="indicador-linha"><span class="indicador-rotulo">Real.</span>${realHtml}</div>
      <div class="indicador-linha"><span class="indicador-rotulo">Orç.</span><span class="indicador-valor">${escaparHtml(formatarMoeda(o))}</span></div>
    </div>
  `;
}

function renderizarGrupoColunas() {
  grupoColunas.innerHTML = `
    <col class="col-grupo">
    <col class="col-eap">
    <col class="col-descricao">
    <col class="col-quantidade">
    <col class="col-unidade">
  `;

  const mostrarTipos = deveMostrarColunasTipo();
  const tiposVisiveis = obterTiposVisiveis();

  if (estadoUi.showUnit) {
    if (mostrarTipos) tiposVisiveis.forEach(() => grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`));
    grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`);
  }

  if (estadoUi.showTotal) {
    if (mostrarTipos) tiposVisiveis.forEach(() => grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`));
    grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`);
  }

  if (estadoUi.showBDI) {
    grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`);
    grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`);
    grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-valor">`);
  }

  grupoColunas.insertAdjacentHTML("beforeend", `<col class="col-acoes">`);
}

function renderizarCabecalhoTabela() {
  const mostrarTipos = deveMostrarColunasTipo();
  const tiposVisiveis = obterTiposVisiveis();
  const confirmado = Boolean(cabecalhoObra?.isConfirmed);

  const unitSpan = estadoUi.showUnit ? (mostrarTipos ? (tiposVisiveis.length + 1) : 1) : 0;
  const totalSpan = estadoUi.showTotal ? (mostrarTipos ? (tiposVisiveis.length + 1) : 1) : 0;
  const bdiSpan = estadoUi.showBDI ? 3 : 0;
  const totalTitle = confirmado ? "Totais (Orçado x Realizado)" : "Total (R$)";

  const modoOrcReal = (estadoUi?.orcRealMode === "pct") ? "pct" : "value";
  const totalTitleHtml = confirmado
    ? `${escaparHtml(totalTitle)} <button type="button" class="bdi-alternar" title="Alternar Real. (R$ / %)" onclick="alternarModoOrcReal()">${modoOrcReal === "pct" ? "%" : "R$"}</button>`
    : escaparHtml(totalTitle);

  const row1 = `
    <tr class="cabecalho-grupo">
      <th rowspan="2">Grupo</th>
      <th rowspan="2">EAP</th>
      <th rowspan="2">Descrição</th>
      <th rowspan="2">Qtde</th>
      <th rowspan="2">Unid</th>
      ${estadoUi.showUnit ? `<th colspan="${unitSpan}" class="separador-esquerda">Unitário (R$)</th>` : ""}
      ${estadoUi.showTotal ? `<th colspan="${totalSpan}" class="separador-esquerda">${totalTitleHtml}</th>` : ""}
      ${estadoUi.showBDI ? `<th colspan="${bdiSpan}" class="separador-esquerda">BDI</th>` : ""}
      <th rowspan="2">Ações</th>
    </tr>
  `;

  const unitRow = estadoUi.showUnit
    ? (mostrarTipos
      ? `${tiposVisiveis.map((t, i) => `<th class="${i === 0 ? "separador-esquerda" : ""}">${escaparHtml(t.label)}</th>`).join("")}<th>Total</th>`
      : `<th class="separador-esquerda">Total</th>`)
    : "";

  const totalRow = estadoUi.showTotal
    ? (mostrarTipos
      ? `${tiposVisiveis.map((t, i) => `<th class="${i === 0 ? "separador-esquerda" : ""}">${escaparHtml(t.label)}</th>`).join("")}<th>Total</th>`
      : `<th class="separador-esquerda">Total</th>`)
    : "";

  const bdiRow = estadoUi.showBDI ? `<th class="separador-esquerda">BDI (item)</th><th>BDI aplicado</th><th>Total + BDI</th>` : "";

  const row2 = `
    <tr>
      ${unitRow}
      ${totalRow}
      ${bdiRow}
    </tr>
  `;

  cabecalhoTabela.innerHTML = row1 + row2;
}

function renderizarCorpoTabela() {
  const cache = calcularCacheBaseOrcado();
  const mostrarTipos = deveMostrarColunasTipo();
  const tiposVisiveis = obterTiposVisiveis();
  const bloqueado = Boolean(cabecalhoObra?.isConfirmed);
  const confirmado = bloqueado;

  const pagamentos = confirmado ? carregarPagamentosDoStorage() : [];
  const realizadoPorId = confirmado ? calcularRealizadoPorItemId(pagamentos) : new Map();
  const itemPorId = confirmado
    ? new Map(itensEap.filter(Boolean).map((x) => [String(x.id || ""), x]).filter(([id]) => id))
    : new Map();

  let stripe = 0;

  const rows = itensEap.map((it, i) => {
    if (!it) return "";

    const isGroup = Boolean(it.isGroup);
    const level = obterNivelEap(it.eap);
    const pad = 6 + (level * 14);

    let rowDirectByType = null;
    let rowDirectTotal = 0;
    let rowBdiApplied = 0;
    let rowBdiPctApplied = 0;
    let rowTotalWithBdi = 0;

    if (isGroup) {
      const sum = somarDescendentesDoGrupo(i, cache);
      rowDirectByType = sum.directByType;
      rowDirectTotal = sum.directTotal;
      rowBdiApplied = sum.bdiApplied;
      rowBdiPctApplied = sum.bdiPctApplied;
      rowTotalWithBdi = sum.totalWithBdi;
    } else {
      rowDirectByType = cache.directByType[i];
      rowDirectTotal = cache.directTotal[i];
      rowBdiApplied = cache.bdiApplied[i];
      rowBdiPctApplied = cache.bdiPctApplied[i];
      rowTotalWithBdi = cache.totalWithBdi[i];
    }

    const zebraClass = (!isGroup)
      ? ((stripe++ % 2 === 0) ? "zebra-par" : "zebra-impar")
      : "";

    const rowClass = [
      isGroup ? "linha-grupo" : "linha-item",
      zebraClass,
    ].filter(Boolean).join(" ");

    const groupCell = `
      <td class="centro">
        <input type="checkbox"
          data-group="body" data-r="${i}" data-c="${COL_GRUPO}"
          ${isGroup ? "checked" : ""}
          ${bloqueado ? "disabled" : ""}
          onchange="itensEap[${i}].isGroup=this.checked;enfileirarRenderizacao()">
      </td>
    `;

    const eapCell = `
      <td>
        <input
          data-group="body" data-r="${i}" data-c="${COL_EAP}"
          value="${escaparHtml(it.eap || "")}"
          readonly>
      </td>
    `;

    const descCell = `
      <td>
        <input
          data-group="body" data-r="${i}" data-c="${COL_DESCRICAO}" data-commit="blur"
          value="${escaparHtml(it.desc || "")}"
          placeholder="Descrição do item"
          style="padding-left:${pad}px"
          onblur="itensEap[${i}].desc=this.value;enfileirarRenderizacao()">
      </td>
    `;

    const qtdeCell = `
      <td>
        <input ${(isGroup || bloqueado) ? "disabled" : ""}
          data-group="body" data-r="${i}" data-c="${COL_QUANTIDADE}" data-commit="blur"
          value="${numeroOuVazio(it.qtde)}"
          placeholder="0"
          onblur="itensEap[${i}].qtde=parsearBR(this.value);enfileirarRenderizacao()">
      </td>
    `;

    const unidCell = `
      <td>
        <input ${(isGroup || bloqueado) ? "disabled" : ""}
          data-group="body" data-r="${i}" data-c="${COL_UNIDADE}" data-commit="blur"
          value="${escaparHtml(it.unid || "")}"
          placeholder="Ex.: m², un, h"
          onblur="itensEap[${i}].unid=this.value;enfileirarRenderizacao()">
      </td>
    `;

    const unitCells = estadoUi.showUnit ? (() => {
      if (!mostrarTipos) {
        const v = (!isGroup) ? cache.unitTotal[i] : 0;
        return `<td class="valor separador-esquerda"><b>${isGroup ? "—" : formatarMoeda(v)}</b></td>`;
      }

      const cells = tiposVisiveis.map((t, vi) => {
        const disabled = (isGroup || bloqueado) ? "disabled" : "";
        const val = (!isGroup) ? (Number(it.unit?.[t.key]) || 0) : 0;
        return `
          <td class="${vi === 0 ? "separador-esquerda" : ""}">
            <input ${disabled}
              data-group="body" data-r="${i}" data-c="${colunaUnitarioTipo(t.idx)}" data-commit="blur"
              value="${moedaOuVazio(val)}"
              placeholder="R$ 0,00"
              onblur="itensEap[${i}].unit['${t.key}']=parsearBR(this.value);enfileirarRenderizacao()">
          </td>
        `;
      }).join("");

      const totalUnit = (!isGroup) ? cache.unitTotal[i] : 0;
      const totalCell = `<td class="valor"><b>${isGroup ? "—" : formatarMoeda(totalUnit)}</b></td>`;

      return cells + totalCell;
    })() : "";

    const totalCells = estadoUi.showTotal ? (() => {
      if (!confirmado) {
        if (!mostrarTipos) {
          return `<td class="valor separador-esquerda"><b>${formatarMoeda(rowDirectTotal)}</b></td>`;
        }

        const cells = tiposVisiveis.map((t, vi) => `
          <td class="valor ${vi === 0 ? "separador-esquerda" : ""}">${formatarMoeda(Number(rowDirectByType?.[t.key]) || 0)}</td>
        `).join("");

        const totalCell = `<td class="valor"><b>${formatarMoeda(rowDirectTotal)}</b></td>`;
        return cells + totalCell;
      }

      const realizadoByType = isGroup
        ? somarPagamentosParaGrupoEap(it.eap, pagamentos, itemPorId)
        : (realizadoPorId.get(String(it.id || "")) || criarVazioPorTipo());


      const realizadoTotal = somarPorTipo(realizadoByType);

      if (!mostrarTipos) {
        return `
          <td class="separador-esquerda">
            ${renderizarPilhaOrcadoRealizado({
              rowIndex: i,
              typeKey: "",
              realizado: realizadoTotal,
              orcado: rowDirectTotal,
            })}
          </td>
        `;
      }

      const cells = tiposVisiveis.map((t, vi) => {
        const orc = Number(rowDirectByType?.[t.key]) || 0;
        const real = Number(realizadoByType?.[t.key]) || 0;

        return `
          <td class="${vi === 0 ? "separador-esquerda" : ""}">
            ${renderizarPilhaOrcadoRealizado({
              rowIndex: i,
              typeKey: t.key,
              realizado: real,
              orcado: orc,
            })}
          </td>
        `;
      }).join("");

      const totalCell = `
        <td>
          ${renderizarPilhaOrcadoRealizado({
            rowIndex: i,
            typeKey: "",
            realizado: realizadoTotal,
            orcado: rowDirectTotal,
          })}
        </td>
      `;

      return cells + totalCell;
    })() : "";

    const bdiCells = estadoUi.showBDI ? (() => {
      const bdiInput = isGroup
        ? `<td class="valor separador-esquerda"><b>${formatarPercentual(rowBdiPctApplied)}</b></td>`
        : (() => {
          const mode = (it.bdiMode === "value") ? "value" : "pct";
          const toggleLabel = (mode === "value") ? "R$" : "%";

          const value = (mode === "value")
            ? moedaOuVazio(it.bdiValue)
            : percentualOuVazio(it.bdiPercent);

          const placeholder = (mode === "value") ? "R$ 0,00" : "0,00 %";

          const onblur = (mode === "value")
            ? `itensEap[${i}].bdiValue=parsearBR(this.value);enfileirarRenderizacao()`
            : `itensEap[${i}].bdiPercent=parsearBR(this.value);enfileirarRenderizacao()`;

          return `
            <td class="separador-esquerda">
              <div class="bdi-celula">
                <button class="bdi-alternar" title="Alternar BDI (% / R$)" ${bloqueado ? "disabled" : ""} onclick="alternarModoBdiItem(${i})">${toggleLabel}</button>
                <input
                  ${bloqueado ? "disabled" : ""}
                  data-group="body" data-r="${i}" data-c="${COL_BDI_PCT}" data-commit="blur"
                  value="${escaparHtml(value)}"
                  placeholder="${escaparHtml(placeholder)}"
                  onblur="${onblur}">
              </div>
            </td>
          `;
        })();

      const applied = `<td class="valor">${formatarMoeda(rowBdiApplied)}</td>`;
      const total = `<td class="valor"><b>${formatarMoeda(rowTotalWithBdi)}</b></td>`;

      return bdiInput + applied + total;
    })() : "";

    const actions = `
      <td class="acoes-linha centro">
        <button title="Mover para cima" ${bloqueado ? "disabled" : ""} onclick="moverItemEapParaCima(${i})">▲</button>
        <button title="Mover para baixo" ${bloqueado ? "disabled" : ""} onclick="moverItemEapParaBaixo(${i})">▼</button>
        <button title="Inserir linha abaixo" class="sucesso" ${bloqueado ? "disabled" : ""} onclick="inserirItemEapAbaixo(${i})">＋</button>
        <button title="Excluir" class="perigo" ${bloqueado ? "disabled" : ""} onclick="removerItemEap(${i})">✖</button>
      </td>
    `;

    return `<tr class="${rowClass}">
      ${groupCell}
      ${eapCell}
      ${descCell}
      ${qtdeCell}
      ${unidCell}
      ${unitCells}
      ${totalCells}
      ${bdiCells}
      ${actions}
    </tr>`;
  }).join("");

  corpoTabela.innerHTML = rows;
}

function renderizarRodapeTabela() {
  const cache = calcularCacheBaseOrcado();
  const mostrarTipos = deveMostrarColunasTipo();
  const tiposVisiveis = obterTiposVisiveis();
  const confirmado = Boolean(cabecalhoObra?.isConfirmed);

  const unitFoot = estadoUi.showUnit ? (() => {
    if (!mostrarTipos) return `<th class="valor separador-esquerda">—</th>`;
    const blanks = tiposVisiveis.map((_, i) => `<th class="valor ${i === 0 ? "separador-esquerda" : ""}">—</th>`).join("");
    return blanks + `<th class="valor">—</th>`;
  })() : "";

  const totalFoot = estadoUi.showTotal ? (() => {
    if (!confirmado) {
      if (!mostrarTipos) return `<th class="valor separador-esquerda"><b>${formatarMoeda(cache.totalsDirect)}</b></th>`;
      const byType = tiposVisiveis.map((t, i) => `<th class="valor ${i === 0 ? "separador-esquerda" : ""}">${formatarMoeda(cache.totalsDirectByType[t.key] || 0)}</th>`).join("");
      return byType + `<th class="valor"><b>${formatarMoeda(cache.totalsDirect)}</b></th>`;
    }

    const pagamentos = carregarPagamentosDoStorage();
    const realizadoByType = criarVazioPorTipo();
    pagamentos.forEach((p) => {
      if (!p?.tipo) return;
      realizadoByType[p.tipo] += Number(p.valor) || 0;
    });

    const realizadoTotal = somarPorTipo(realizadoByType);

    if (!mostrarTipos) {
      return `
        <th class="separador-esquerda">
          ${renderizarPilhaOrcadoRealizado({
            rowIndex: -1,
            typeKey: "",
            realizado: realizadoTotal,
            orcado: cache.totalsDirect,
          })}
        </th>
      `;
    }

    const byType = tiposVisiveis.map((t, i) => {
      const orc = Number(cache.totalsDirectByType?.[t.key]) || 0;
      const real = Number(realizadoByType?.[t.key]) || 0;
      return `
        <th class="${i === 0 ? "separador-esquerda" : ""}">
          ${renderizarPilhaOrcadoRealizado({
            rowIndex: -1,
            typeKey: t.key,
            realizado: real,
            orcado: orc,
          })}
        </th>
      `;
    }).join("");

    const total = `
      <th>
        ${renderizarPilhaOrcadoRealizado({
          rowIndex: -1,
          typeKey: "",
          realizado: realizadoTotal,
          orcado: cache.totalsDirect,
        })}
      </th>
    `;

    return byType + total;
  })() : "";

  const bdiFoot = estadoUi.showBDI ? (() => `
    <th class="valor separador-esquerda">—</th>
    <th class="valor">${formatarMoeda(cache.totalsBdi)}</th>
    <th class="valor"><b>${formatarMoeda(cache.totalsWithBdi)}</b></th>
  `)() : "";

  rodapeTabela.innerHTML = `
    <tr class="bloco-topo bloco-base">
      <th colspan="5" class="rotulo-rodape">TOTAL (itens-base)</th>
      ${unitFoot}
      ${totalFoot}
      ${bdiFoot}
      <th></th>
    </tr>
  `;
}

function renderizar() {
  if (!cabecalhoTabela || !corpoTabela || !rodapeTabela || !grupoColunas) return;
  renderizarGrupoColunas();
  renderizarCabecalhoTabela();
  renderizarCorpoTabela();
  renderizarRodapeTabela();
  renderizarResumos();
  renderizarPainelTestes();
  aplicarProximoFoco();
}

function fecharModalGastos() {
  if (!modalGastos) return;
  modalGastos.classList.add("oculto");
  modalGastos.setAttribute("aria-hidden", "true");
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

function abrirModalGastos(rowIndex, typeKey) {
  if (!modalGastos || !tituloGastos || !corpoGastos) return;

  const idx = Number(rowIndex);
  const isTotal = !(Number.isFinite(idx) && idx >= 0 && idx < itensEap.length);
  const it = isTotal ? null : itensEap[idx];

  const tk = String(typeKey || "");
  const tipoLabel = tk ? obterRotuloTipoCusto(tk) : "Todos os tipos";

  const pagamentos = carregarPagamentosDoStorage();
  const itemPorId = new Map(itensEap.filter(Boolean).map((x) => [String(x.id || ""), x]).filter(([id]) => id));

  const matched = [];
  let sum = 0;

  for (const p of pagamentos) {
    if (tk && p.tipo !== tk) continue;

    if (isTotal) {
      matched.push(p);
      sum += Number(p.valor) || 0;
      continue;
    }

    if (!it) continue;

    if (!it.isGroup) {
      if (String(p.eapId || "") !== String(it.id || "")) continue;
      matched.push(p);
      sum += Number(p.valor) || 0;
      continue;
    }

    const payIt = itemPorId.get(String(p.eapId || ""));
    const pe = String(payIt?.eap || "").trim();
    const ge = String(it.eap || "").trim();
    if (!pe || !ge) continue;
    if (pe === ge || ehDescendente(ge, pe)) {
      matched.push(p);
      sum += Number(p.valor) || 0;
    }
  }

  const title = isTotal
    ? `Gastos (${tipoLabel})`
    : `Gastos: ${String(it.eap || "").trim()} - ${String(it.desc || "").trim()} (${tipoLabel})`;

  tituloGastos.textContent = title;

  const rows = matched
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((p) => {
      const eapIt = itemPorId.get(String(p.eapId || ""));
      return `
        <tr>
          <td class="centro">${escaparHtml(formatarDataPtBr(p.date))}</td>
          <td>${escaparHtml(obterRotuloTipoCusto(p.tipo))}</td>
          <td>${escaparHtml(eapIt ? `${eapIt.eap} - ${eapIt.desc}` : "—")}</td>
          <td>${escaparHtml(p.fornecedor || "")}</td>
          <td>${escaparHtml(p.desc || "")}</td>
          <td class="valor"><b>${formatarMoeda(p.valor || 0)}</b></td>
        </tr>
      `;
    }).join("");

  corpoGastos.innerHTML = `
    <div class="acoes" style="margin-bottom: 8px;">
      <a class="botao-link" href="./pagamentos.html">Abrir Pagamentos</a>
      <button type="button" onclick="fecharModalGastos()">Fechar</button>
    </div>

    <div class="envoltoria">
      <table class="tabela-resumo">
        <thead>
          <tr>
            <th style="width:110px;">Data</th>
            <th style="width:140px;">Tipo</th>
            <th>Etapa</th>
            <th style="width:200px;">Fornecedor</th>
            <th>Descrição</th>
            <th style="width:130px;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" class="centro atenuado">Sem gastos</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="5" class="rotulo-rodape">TOTAL</th>
            <th class="valor"><b>${formatarMoeda(sum)}</b></th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  modalGastos.classList.remove("oculto");
  modalGastos.setAttribute("aria-hidden", "false");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModalGastos();
});
