/* =========================================================
   04b-summaries.js
   - Resumo consolidado: Etapa x Fornecedor (Base, %Frete, %Desc, Total)
   - "Resumos" (título único)
   - "Resumo Geral" (mesmo padrão visual)
   + NOVO:
     - Trava ÚNICA por etapa/fornecedor (trava %Frete e %Desc juntos)
     - Redistribuição automática do restante entre destravados (proporcional à Base)
     - Recalcula automaticamente quando a Base muda (ex.: desmarcar item na compra personalizada)
   ========================================================= */

function renderizarResumos() {
  const podeResumo = Boolean(resumoEtapas && resumoMapa);

  // não renderizar resumo separado por fornecedor
  if (typeof resumoFornecedor !== "undefined" && resumoFornecedor) resumoFornecedor.innerHTML = "";

  const testes = calcularTestesCompra();

  const personalizadoCompleto = compraPersonalizadaCompletaParaResumo();
  const alocacoes = modoManual
    ? obterAlocacoesPersonalizadasParaResumo()
    : obterAlocacoesAutomaticasEstadoAtual();

  if (podeResumo) {
    if (!alocacoes.length) {
      resumoEtapas.innerHTML = `<div class="atenuado">—</div>`;
      resumoMapa.innerHTML = `<div class="atenuado">—</div>`;
    } else {
      renderizarEtapaFornecedorConsolidado(alocacoes, personalizadoCompleto);
      renderizarResumoGeral(alocacoes, personalizadoCompleto, testes);
    }
  }

  if (typeof renderizarSaldoEtapas === "function" && painelSaldoEtapas) {
    renderizarSaldoEtapas();
  }
}

/* =========================================================
   STATE persistente dos inputs do resumo
   ========================================================= */
function obterEstadoResumo() {
  if (!window.__estadoResumo) {
    window.__estadoResumo = {
      fretePctByEtapa: {},              // { [si]: { [etapaKey]: pct } }
      descPctByEtapa: {},               // { [si]: { [etapaKey]: pct } }

      // trava única por etapa (vale p/ frete+desc)
      lockByEtapa: {},                  // { [si]: { [etapaKey]: true/false } }

      // frete particular: % por fornecedor
      privateFretePctBySupplier: {},    // { [si]: pct }

      // modo de exibicao da coluna de frete particular: percentual | valor
      privateFreteDisplayMode: "percentual"
    };
  }
  return window.__estadoResumo;
}

/* =========================================================
   HELPERS
   ========================================================= */
function usaFreteParticularAgora() {
  return (Number(freteParticular) || 0) > 0;
}
function nomeFornecedor(si) {
  return fornecedores?.[si]?.fornecedor || `Fornecedor ${si + 1}`;
}
function formatarPercentualBr(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + "%";
}
function percentualOuVazio(v) {
  const n = Number(v) || 0;
  return n === 0 ? "" : formatarPercentualBr(n);
}
function parsearPercentualBR(str) {
  const n = parsearBR(String(str).replace("%", "").trim());
  return Math.max(0, Math.min(100, n));
}
function obterTaxaImposto(si) {
  const pct = Number(fornecedores?.[si]?.imposto) || 0;
  return pct / 100;
}
function obterModoExibicaoFreteResumo() {
  const st = obterEstadoResumo();
  return st.privateFreteDisplayMode === "valor" ? "valor" : "percentual";
}
function alternarModoExibicaoFreteResumo() {
  const st = obterEstadoResumo();
  st.privateFreteDisplayMode = obterModoExibicaoFreteResumo() === "valor"
    ? "percentual"
    : "valor";
  renderizarResumos();
}

/* compra personalizada completa? */
function compraPersonalizadaCompletaParaResumo() {
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

function obterAlocacoesPersonalizadasParaResumo() {
  const alocacoes = [];
  for (let idx = 0; idx < itens.length; idx++) {
    const it = itens[idx];
    const q = Number(it.qtde) || 0;
    if (q <= 0) continue;

    const si = it.choice;
    if (!(Number.isFinite(si)) || si === null) continue;
    if (!fornecedores?.[si]?.ativo) continue;
    if (!(Number(it.unit?.[si]) > 0)) continue;

    alocacoes.push({ itemIndex: idx, supplierIndex: si });
  }
  return alocacoes;
}

function montarDescontosPersonalizadosParaMapa(alocacoes) {
  const usados = fornecedores.map(() => false);
  for (const a of alocacoes) usados[a.supplierIndex] = true;
  return fornecedores.map((s, si) => usados[si] ? (Number(s.descontoParcial) || 0) : 0);
}

function obterEtapasDoItemParaResumo(item) {
  if (Array.isArray(item?.etapas) && item.etapas.length) return item.etapas;
  const etapa = String(item?.etapa || "").trim();
  if (!etapa) return [];
  return [{ eapId: etapa, valor: 100 }];
}

function obterRateiosEtapaItem(item) {
  const etapas = obterEtapasDoItemParaResumo(item);
  if (!etapas.length) return [{ etapaKey: "Sem etapa", fator: 1 }];

  const modo = (item?.modoEtapa === "quantidade") ? "quantidade" : "percentual";
  if (modo === "quantidade") {
    const soma = etapas.reduce((acc, e) => acc + (Number(e?.valor) || 0), 0);
    const denom = soma > 0 ? soma : 0;
    return etapas.map((e) => ({
      etapaKey: String(e.eapId || "Sem etapa"),
      fator: denom > 0 ? (Number(e.valor) || 0) / denom : 0,
    }));
  }

  const somaPct = etapas.reduce((acc, e) => acc + (Number(e?.valor) || 0), 0);
  const denom = somaPct > 0 ? somaPct : 0;
  return etapas.map((e) => ({
    etapaKey: String(e.eapId || "Sem etapa"),
    fator: denom > 0 ? (Number(e.valor) || 0) / denom : 0,
  }));
}

function rotuloEtapaResumo(etapaKey) {
  if (etapaKey === "Sem etapa") return "Sem etapa";
  const txt = obterRotuloEapPorId(etapaKey);
  return (txt && txt !== "—") ? txt : String(etapaKey || "—");
}

/* =========================================================
   REDISTRIBUIÇÃO COM TRAVA (por fornecedor)
   - trava única por etapa: lockByEtapa[si][etapa] = true/false
   - aplica em fretePctByEtapa e descPctByEtapa
   ========================================================= */
function redistribuirPercentuaisEtapaPorFornecedor({
  si,
  etapas,
  baseByEtapa,      // Map(etapaKey -> base)
  estado,
  kind             // "frete" | "desc"
}) {
  const pctMap = (kind === "frete") ? estado.fretePctByEtapa : estado.descPctByEtapa;

  if (!pctMap[si]) pctMap[si] = {};
  if (!estado.lockByEtapa[si]) estado.lockByEtapa[si] = {};

  // só considera etapas com base > 0
  const etapasAtivas = etapas.filter(e => (baseByEtapa.get(e) || 0) > 0);
  if (etapasAtivas.length === 0) return;

  let somaTravados = 0;
  const travados = [];
  const destravados = [];

  for (const e of etapasAtivas) {
    const travado = !!estado.lockByEtapa[si][e];
    const atual = Number(pctMap[si][e]) || 0;

    if (travado) {
      somaTravados += atual;
      travados.push({ e, atual });
    } else {
      destravados.push(e);
    }
  }

  // se travados passou de 100, normaliza travados proporcionalmente e zera o resto
  if (somaTravados > 100) {
    const fator = 100 / somaTravados;
    for (const x of travados) {
      pctMap[si][x.e] = x.atual * fator;
    }
    for (const e of destravados) {
      pctMap[si][e] = 0;
    }
    return;
  }

  const restante = 100 - somaTravados;

  // pesos para destravados (proporcional à base)
  let somaPesos = 0;
  for (const e of destravados) somaPesos += (baseByEtapa.get(e) || 0);

  if (destravados.length === 0) return;

  if (somaPesos <= 0) {
    // se por algum motivo não tiver peso, divide igualmente
    const cada = restante / destravados.length;
    for (const e of destravados) pctMap[si][e] = cada;
    return;
  }

  for (const e of destravados) {
    const w = (baseByEtapa.get(e) || 0);
    pctMap[si][e] = restante * (w / somaPesos);
  }
}

/* =========================================================
   FRETE PARTICULAR: redistribuição automática por fornecedor
   ========================================================= */
function redistribuirPercentuaisFreteParticular({
  usados,
  basePorFornecedor,
  estado
}) {
  if (!estado.privateFretePctBySupplier) estado.privateFretePctBySupplier = {};
  const fornecedoresAtivos = usados.filter((si) => (basePorFornecedor[si] || 0) > 0);
  if (!fornecedoresAtivos.length) return;

  const somaBase = fornecedoresAtivos.reduce((acc, si) => acc + (basePorFornecedor[si] || 0), 0);
  if (somaBase <= 0) {
    const cada = 100 / fornecedoresAtivos.length;
    for (const si of fornecedoresAtivos) estado.privateFretePctBySupplier[si] = cada;
    return;
  }

  for (const si of fornecedoresAtivos) {
    const b = Number(basePorFornecedor[si]) || 0;
    estado.privateFretePctBySupplier[si] = (b / somaBase) * 100;
  }
}

/* =========================================================
   CONSOLIDADO ETAPA x FORNECEDOR
   ========================================================= */
function renderizarEtapaFornecedorConsolidado(alocacoes, personalizadoCompleto) {
  const estado = obterEstadoResumo();
  const modoParticular = usaFreteParticularAgora();
  const modoExibicaoFreteParticular = obterModoExibicaoFreteResumo();

  // fornecedores usados (ativos)
  const usados = new Set();
  for (const a of alocacoes) {
    if (fornecedores?.[a.supplierIndex]?.ativo) usados.add(a.supplierIndex);
  }
  const usadosLista = Array.from(usados).sort((a, b) => a - b);

  if (!usadosLista.length) {
    resumoEtapas.innerHTML = `
      <div class="resumo-titulo">Resumos</div>
      <div class="atenuado">Selecione 1 ou mais fornecedores para simular mapa</div>
    `;
    return;
  }

  // etapaKey -> Map(si -> baseR$)
  const etapaMap = new Map();

  for (const a of alocacoes) {
    const it = itens[a.itemIndex];
    const si = a.supplierIndex;
    if (!fornecedores[si]?.ativo) continue;

    const baseTotal = calcularBaseItemPorFornecedor(it, si); // base sem imposto
    const rateios = obterRateiosEtapaItem(it);

    rateios.forEach(({ etapaKey, fator }) => {
      const base = baseTotal * (Number(fator) || 0);
      const key = etapaKey || "Sem etapa";
      if (!etapaMap.has(key)) etapaMap.set(key, new Map());
      const row = etapaMap.get(key);
      row.set(si, (row.get(si) || 0) + base);
    });
  }

  // ordenar etapas
  const etapas = Array.from(etapaMap.keys()).sort((a, b) => {
    const ra = rotuloEtapaResumo(a);
    const rb = rotuloEtapaResumo(b);
    const na = parseInt(String(ra).split(" - ")[0], 10);
    const nb = parseInt(String(rb).split(" - ")[0], 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(ra).localeCompare(String(rb), "pt-BR");
  });

  // base por fornecedor e base por etapa (para redistribuição)
  const basePorFornecedor = fornecedores.map(() => 0);
  const basePorEtapaPorFornecedor = {}; // { [si]: Map(etapaKey -> base) }

  for (const si of usadosLista) basePorEtapaPorFornecedor[si] = new Map();

  for (const etapaKey of etapas) {
    const row = etapaMap.get(etapaKey);
    for (const si of usadosLista) {
      const b = (row.get(si) || 0);
      basePorFornecedor[si] += b;
      basePorEtapaPorFornecedor[si].set(etapaKey, b);
    }
  }
  // desconto parcial só quando compra personalizada completa
  const descValorPorFornecedor = fornecedores.map(() => 0);
  for (const si of usadosLista) {
    descValorPorFornecedor[si] = personalizadoCompleto ? (Number(fornecedores[si].descontoParcial) || 0) : 0;
  }

  // frete por fornecedor
  const freteValorPorFornecedor = fornecedores.map(() => 0);

  if (!modoParticular) {
    for (const si of usadosLista) freteValorPorFornecedor[si] = Number(fornecedores[si].frete) || 0;
  } else {
    const fp = Number(freteParticular) || 0;
    if (!estado.privateFretePctBySupplier) estado.privateFretePctBySupplier = {};

    redistribuirPercentuaisFreteParticular({ usados: usadosLista, basePorFornecedor, estado });

    // aplica valor
    for (const si of usadosLista) {
      const pct = Number(estado.privateFretePctBySupplier[si]) || 0;
      freteValorPorFornecedor[si] = fp * (pct / 100);
    }
  }

  // garantir maps + redistribuir automaticamente (por fornecedor) respeitando trava
  if (!estado.fretePctByEtapa) estado.fretePctByEtapa = {};
  if (!estado.descPctByEtapa) estado.descPctByEtapa = {};
  if (!estado.lockByEtapa) estado.lockByEtapa = {};

  for (const si of usadosLista) {
    if (!estado.fretePctByEtapa[si]) estado.fretePctByEtapa[si] = {};
    if (!estado.descPctByEtapa[si]) estado.descPctByEtapa[si] = {};
    if (!estado.lockByEtapa[si]) estado.lockByEtapa[si] = {};

    // inicializa valores para etapas ativas (se não existe ainda)
    const denom = basePorFornecedor[si] || 0;
    for (const etapaKey of etapas) {
      const b = basePorEtapaPorFornecedor[si].get(etapaKey) || 0;

      if (!Number.isFinite(estado.fretePctByEtapa[si][etapaKey])) {
        estado.fretePctByEtapa[si][etapaKey] = (denom > 0 ? (b / denom) * 100 : 0);
      }
      if (!Number.isFinite(estado.descPctByEtapa[si][etapaKey])) {
        estado.descPctByEtapa[si][etapaKey] = (denom > 0 ? (b / denom) * 100 : 0);
      }
      if (!Number.isFinite(estado.lockByEtapa[si][etapaKey])) {
        estado.lockByEtapa[si][etapaKey] = false;
      }
    }

    // redistribui automaticamente valores destravados
    redistribuirPercentuaisEtapaPorFornecedor({
      si,
      etapas,
      baseByEtapa: basePorEtapaPorFornecedor[si],
      estado,
      kind: "frete"
    });
    redistribuirPercentuaisEtapaPorFornecedor({
      si,
      etapas,
      baseByEtapa: basePorEtapaPorFornecedor[si],
      estado,
      kind: "desc"
    });
  }

  // funções para obter rateios
  function obterFreteEtapa(si, etapaKey) {
    const freteTotal = freteValorPorFornecedor[si] || 0;
    if (freteTotal === 0) return 0;
    const pct = Number(estado.fretePctByEtapa?.[si]?.[etapaKey]) || 0;
    return freteTotal * (pct / 100);
  }
  function obterDescEtapa(si, etapaKey) {
    const descTotal = descValorPorFornecedor[si] || 0;
    if (descTotal === 0) return 0;
    const pct = Number(estado.descPctByEtapa?.[si]?.[etapaKey]) || 0;
    return descTotal * (pct / 100);
  }

  // cálculo por etapa/fornecedor
  const totaisPorFornecedor = fornecedores.map(() => ({
    base: 0, frete: 0, desc: 0, imposto: 0, total: 0
  }));

  const linhasEtapas = [];

  for (const etapaKey of etapas) {
    const row = etapaMap.get(etapaKey);
    const out = { etapaKey, rotulo: rotuloEtapaResumo(etapaKey), cells: {} };

    for (const si of usadosLista) {
      const base = (row.get(si) || 0);
      const freteEt = obterFreteEtapa(si, etapaKey);
      const descEt = obterDescEtapa(si, etapaKey);
      const tax = obterTaxaImposto(si);

      let imposto = 0;
      let total = 0;

      if (!modoParticular) {
        // frete loja tributado
        const baseNota = base + freteEt - descEt;
        imposto = baseNota * tax;
        total = baseNota + imposto;
      } else {
        // frete particular fora do imposto
        const baseNota = base - descEt;
        imposto = baseNota * tax;
        total = baseNota + imposto + freteEt;
      }

      out.cells[si] = { base, total };

      totaisPorFornecedor[si].base += base;
      totaisPorFornecedor[si].frete += freteEt;
      totaisPorFornecedor[si].desc += descEt;
      totaisPorFornecedor[si].imposto += imposto;
      totaisPorFornecedor[si].total += total;
    }

    linhasEtapas.push(out);
  }

  // inputs e locks
  function checkboxTrava(si, etapaKey, disabled) {
    const dis = disabled ? "disabled" : "";
    const checked = estado.lockByEtapa?.[si]?.[etapaKey] ? "checked" : "";
    const safeEtapa = etapaKey.replace(/'/g, "\\'");
    return `
      <input type="checkbox" class="trava-percentual"
        ${checked} ${dis}
        onchange="(function(el){
          const st = obterEstadoResumo();
          if(!st.lockByEtapa[${si}]) st.lockByEtapa[${si}] = {};
          st.lockByEtapa[${si}]['${safeEtapa}'] = el.checked;
          renderizarResumos();
        })(this)">
    `;
  }

  function inputPercentual({ kind, si, etapaKey, value, disabled }) {
    const dis = disabled ? "disabled" : "";
    const placeholder = "0,00%";
    const safeEtapa = etapaKey.replace(/'/g, "\\'");

    return `
      <input class="entrada-percentual"
        value="${percentualOuVazio(value)}"
        placeholder="${placeholder}"
        ${dis}
        onfocus="this.select()"
        onblur="(function(el){
          const st = obterEstadoResumo();
          const v = parsearPercentualBR(el.value);

          if('${kind}'==='frete'){
            if(!st.fretePctByEtapa[${si}]) st.fretePctByEtapa[${si}] = {};
            st.fretePctByEtapa[${si}]['${safeEtapa}'] = v;
          } else {
            if(!st.descPctByEtapa[${si}]) st.descPctByEtapa[${si}] = {};
            st.descPctByEtapa[${si}]['${safeEtapa}'] = v;
          }

          // Não trava automaticamente: trava é pelo checkbox único.
          renderizarResumos();
        })(this)">
    `;
  }

  function rotuloModoFreteParticular() {
    return modoExibicaoFreteParticular === "valor" ? "R$" : "%";
  }

  function valorFreteRateioFornecedor(si) {
    const valor = Number(totaisPorFornecedor[si].frete) || 0;
    if (modoExibicaoFreteParticular === "valor") return formatarMoeda(valor);
    const pct = Number(estado.privateFretePctBySupplier?.[si]) || 0;
    return formatarPercentualBr(pct);
  }

  // HEADERS
  const header1 = `
    <tr>
      <th></th>
      ${usadosLista.map(si => `<th colspan="4">${nomeFornecedor(si)}</th>`).join("")}
    </tr>
  `;
  const header2 = `
    <tr>
      <th>Etapa</th>
      ${usadosLista.map(() => `
        <th class="valor">Base</th>
        <th class="centro">% Frete</th>
        <th class="centro">% Desc</th>
        <th class="valor">Total</th>
      `).join("")}
    </tr>
  `;

  const body = linhasEtapas.map(r => `
    <tr>
      <td>${r.rotulo}</td>
      ${usadosLista.map(si => {
        const c = r.cells[si] || { base: 0, total: 0 };
        const fretePct = Number(estado.fretePctByEtapa?.[si]?.[r.etapaKey]) || 0;
        const descPct = Number(estado.descPctByEtapa?.[si]?.[r.etapaKey]) || 0;

        const disablePct = (c.base === 0);
        const disableDesc = !personalizadoCompleto || (Number(fornecedores[si].descontoParcial) || 0) === 0 || disablePct;

        // trava única ao lado do %frete (trava ambos)
        const lock = checkboxTrava(si, r.etapaKey, disablePct);

        return `
          <td class="valor">${formatarMoeda(c.base)}</td>

          <td class="centro pct-cell">
            ${lock}
            ${inputPercentual({ kind: "frete", si, etapaKey: r.etapaKey, value: fretePct, disabled: disablePct })}
          </td>

          <td class="centro pct-cell">
            ${inputPercentual({ kind: "desc", si, etapaKey: r.etapaKey, value: descPct, disabled: disableDesc })}
          </td>

          <td class="valor"><b>${formatarMoeda(c.total)}</b></td>
        `;
      }).join("")}
    </tr>
  `).join("");

  // FOOTERS
  const rowFrete = `
    <tr class="resumo-rodape">
      <th>
        Frete
        ${modoParticular ? `
          <button type="button" class="botao-modo-frete" onclick="alternarModoExibicaoFreteResumo()">
            ${rotuloModoFreteParticular()}
          </button>
        ` : ""}
      </th>
      ${usadosLista.map(si => {
        if (modoParticular) {
          return `
            <td class="valor">${formatarMoeda(totaisPorFornecedor[si].frete || 0)}</td>
            <td class="centro">${valorFreteRateioFornecedor(si)}</td>
            <td class="centro">—</td>
            <td class="valor">—</td>
          `;
        }
        // frete loja: valor final rateado (soma do rateio por etapas)
        return `
          <td class="valor">${formatarMoeda(totaisPorFornecedor[si].frete || 0)}</td>
          <td class="centro">—</td>
          <td class="centro">—</td>
          <td class="valor">—</td>
        `;
      }).join("")}
    </tr>
  `;

  const rowDesc = `
    <tr class="resumo-rodape">
      <th>Desconto</th>
      ${usadosLista.map(si => `
        <td class="valor">${formatarMoeda(totaisPorFornecedor[si].desc || 0)}</td>
        <td class="centro">—</td>
        <td class="centro">—</td>
        <td class="valor">—</td>
      `).join("")}
    </tr>
  `;

  const rowImposto = `
    <tr class="resumo-rodape">
      <th>Imposto</th>
      ${usadosLista.map(si => `
        <td class="valor">${formatarMoeda(totaisPorFornecedor[si].imposto || 0)}</td>
        <td class="centro">—</td>
        <td class="centro">—</td>
        <td class="valor">—</td>
      `).join("")}
    </tr>
  `;

  const rowTotal = `
    <tr class="resumo-total">
      <th>Total</th>
      ${usadosLista.map(si => `
        <td class="valor"><b>${formatarMoeda(totaisPorFornecedor[si].total || 0)}</b></td>
        <td class="centro">—</td>
        <td class="centro">—</td>
        <td class="valor">—</td>
      `).join("")}
    </tr>
  `;

  resumoEtapas.innerHTML = `
    <div class="resumo-titulo">Resumos</div>
    <table class="tabela-resumo resumo-consolidado">
      <thead>
        ${header1}
        ${header2}
      </thead>
      <tbody>
        ${body}
      </tbody>
      <tfoot>
        ${rowFrete}
        ${rowDesc}
        ${rowImposto}
        ${rowTotal}
      </tfoot>
    </table>
  `;
}

/* =========================================================
   RESUMO GERAL
   - Compra vencedora = mesmo texto dos Testes de Compra
   - Nº mapa pega do input correto
   ========================================================= */
function renderizarResumoGeral(alocacoes, personalizadoCompleto, testes) {
  const modoParticular = usaFreteParticularAgora();

  const descontos = personalizadoCompleto
    ? montarDescontosPersonalizadosParaMapa(alocacoes)
    : fornecedores.map(() => 0);

  const notas = calcularNotasPorFornecedorDeAlocacoes({
    allocations: alocacoes,
    includeShopFreight: !modoParticular,
    discountsBySupplier: descontos
  });

  const fp = Number(freteParticular) || 0;
  const totalMapa = notas.totals.totalNota + (modoParticular ? fp : 0);

  const numeroMapa = document.querySelector(".numero-mapa input")?.value?.trim() || "—";

  const textoVencedor = obterTextoCompraVencedoraDosTestes(testes);

  resumoMapa.innerHTML = `
    <div class="resumo-titulo">Resumo Geral</div>
    <table class="tabela-resumo">
      <tbody>
        <tr><th style="width:45%">Nº Mapa</th><td>${numeroMapa}</td></tr>
        <tr><th>Compra vencedora</th><td><b>${textoVencedor}</b></td></tr>
        <tr><th>Itens (base)</th><td class="valor">${formatarMoeda(notas.totals.itensBase)}</td></tr>
        <tr><th>Frete na nota</th><td class="valor">${formatarMoeda(notas.totals.frete)}</td></tr>
        <tr><th>Desconto</th><td class="valor">${formatarMoeda(notas.totals.desconto)}</td></tr>
        <tr><th>Imposto</th><td class="valor">${formatarMoeda(notas.totals.impostoNota)}</td></tr>
        ${modoParticular ? `<tr><th>Frete particular</th><td class="valor">${formatarMoeda(fp)}</td></tr>` : ""}
        <tr><th>Total do mapa</th><td class="valor"><b>${formatarMoeda(totalMapa)}</b></td></tr>
      </tbody>
    </table>
  `;
}

function obterTextoCompraVencedoraDosTestes(testes) {
  if (typeof window.obterTextoCompraVencedora === "function") {
    return window.obterTextoCompraVencedora() || "—";
  }

  if (!testes?.winnerKey) return "—";
  const row = testes.rows?.find(r => r.key === testes.winnerKey);
  if (!row) return "—";
  return row.note ? `${row.label} (${row.note})` : row.label;
}

/* =========================================================
   SALDO POR ETAPA (ORÇADO x REALIZADO)
   ========================================================= */
let _cacheOrcadoMapaVersao = -1;
let _cacheOrcadoMapa = new Map();

function somarPorTipoMapa(b) {
  let sum = 0;
  TIPOS_CUSTO_MAPA.forEach((t) => { sum += Number(b?.[t.key]) || 0; });
  return sum;
}

function multiplicarPorTipoMapa(b, fator) {
  const out = criarVazioPorTipo();
  const f = Number(fator) || 0;
  TIPOS_CUSTO_MAPA.forEach((t) => { out[t.key] = (Number(b?.[t.key]) || 0) * f; });
  return out;
}

function somarEmPorTipoMapa(alvo, add) {
  TIPOS_CUSTO_MAPA.forEach((t) => {
    alvo[t.key] = (Number(alvo?.[t.key]) || 0) + (Number(add?.[t.key]) || 0);
  });
  return alvo;
}

function ehDescendenteMapa(parentEap, childEap) {
  const p = String(parentEap || "").trim();
  const c = String(childEap || "").trim();
  if (!p || !c) return false;
  return c.startsWith(p + ".");
}

function calcularValorOverrideBdiMapa(item, totalDireto) {
  const modo = (item?.bdiMode === "value") ? "value" : "pct";

  if (modo === "value") {
    const v = Number(item?.bdiValue) || 0;
    return v > 0 ? v : null;
  }

  const p = Number(item?.bdiPercent) || 0;
  if (p <= 0) return null;
  return (Number(totalDireto) || 0) * (p / 100);
}

function calcularCacheOrcadoEapMapa() {
  const n = snapshotEap.length;

  const diretoPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());
  const totalDireto = Array.from({ length: n }, () => 0);

  const valorOverrideBdi = Array.from({ length: n }, () => null);
  const bdiAplicado = Array.from({ length: n }, () => 0);
  const bdiPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());

  const totalPorTipo = Array.from({ length: n }, () => criarVazioPorTipo());
  const totalComBdi = Array.from({ length: n }, () => 0);

  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;

    const q = Number(it.qtde) || 0;
    const unit = normalizarPorTipo(it.unit);
    const tot = multiplicarPorTipoMapa(unit, q);

    diretoPorTipo[i] = tot;
    totalDireto[i] = somarPorTipoMapa(tot);
  }

  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;
    valorOverrideBdi[i] = calcularValorOverrideBdiMapa(it, totalDireto[i]);
  }

  const modoGlobal = (snapshotCabecalhoEap?.bdiMode === "value") ? "value" : "pct";
  const bdiValorGlobal = Number(snapshotCabecalhoEap?.bdiValue) || 0;
  const bdiPercentualGlobal = Number(snapshotCabecalhoEap?.bdiPercent) || 0;

  if (modoGlobal === "value" && bdiValorGlobal > 0) {
    let somaDiretoSemOverride = 0;
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;
      if (valorOverrideBdi[i] !== null) continue;
      somaDiretoSemOverride += totalDireto[i];
    }

    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;

      if (valorOverrideBdi[i] !== null) {
        bdiAplicado[i] = valorOverrideBdi[i];
      } else {
        bdiAplicado[i] = (somaDiretoSemOverride > 0)
          ? bdiValorGlobal * (totalDireto[i] / somaDiretoSemOverride)
          : 0;
      }
    }
  } else if (modoGlobal === "pct" && bdiPercentualGlobal > 0) {
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;

      if (valorOverrideBdi[i] !== null) bdiAplicado[i] = valorOverrideBdi[i];
      else bdiAplicado[i] = totalDireto[i] * (bdiPercentualGlobal / 100);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const it = snapshotEap[i];
      if (!it || it.isGroup) continue;
      bdiAplicado[i] = (valorOverrideBdi[i] !== null) ? valorOverrideBdi[i] : 0;
    }
  }

  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || it.isGroup) continue;

    const dt = totalDireto[i];
    const bdi = bdiAplicado[i];

    if (dt > 0 && bdi > 0) {
      TIPOS_CUSTO_MAPA.forEach((t) => {
        const share = (Number(diretoPorTipo[i]?.[t.key]) || 0) / dt;
        bdiPorTipo[i][t.key] = bdi * share;
      });
    }

    TIPOS_CUSTO_MAPA.forEach((t) => {
      totalPorTipo[i][t.key] = (Number(diretoPorTipo[i]?.[t.key]) || 0) + (Number(bdiPorTipo[i]?.[t.key]) || 0);
    });

    totalComBdi[i] = dt + bdi;
  }

  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    if (!it || !it.isGroup) continue;

    const eap = String(it.eap || "").trim();
    if (!eap) continue;

    const accDiretoPorTipo = criarVazioPorTipo();
    const accBdiPorTipo = criarVazioPorTipo();
    let accDireto = 0;
    let accBdi = 0;

    for (let j = 0; j < n; j++) {
      const child = snapshotEap[j];
      if (!child || child.isGroup) continue;
      if (!ehDescendenteMapa(eap, child.eap)) continue;

      somarEmPorTipoMapa(accDiretoPorTipo, diretoPorTipo[j]);
      somarEmPorTipoMapa(accBdiPorTipo, bdiPorTipo[j]);
      accDireto += totalDireto[j];
      accBdi += bdiAplicado[j];
    }

    diretoPorTipo[i] = accDiretoPorTipo;
    bdiPorTipo[i] = accBdiPorTipo;
    totalDireto[i] = accDireto;
    bdiAplicado[i] = accBdi;
    totalComBdi[i] = accDireto + accBdi;

    TIPOS_CUSTO_MAPA.forEach((t) => {
      totalPorTipo[i][t.key] = (Number(accDiretoPorTipo?.[t.key]) || 0) + (Number(accBdiPorTipo?.[t.key]) || 0);
    });
  }

  const mapa = new Map();
  for (let i = 0; i < n; i++) {
    const it = snapshotEap[i];
    const id = String(it?.id || "");
    if (!id) continue;
    mapa.set(id, {
      totalPorTipo: totalPorTipo[i],
      total: totalComBdi[i],
    });
  }

  return mapa;
}

function garantirCacheOrcadoEapMapa() {
  if (_cacheOrcadoMapaVersao === versaoEap) return;
  _cacheOrcadoMapa = calcularCacheOrcadoEapMapa();
  _cacheOrcadoMapaVersao = versaoEap;
}

function obterOrcadoPorIdMapa(id) {
  const key = String(id || "");
  if (!key) return null;
  garantirCacheOrcadoEapMapa();
  return _cacheOrcadoMapa.get(key) || null;
}

function calcularRealizadoPorEtapaTipo() {
  const mapa = new Map();
  if (!window.pagamentosUtil) return mapa;

  const payload = window.pagamentosUtil.carregarPayloadPagamentos();
  const list = Array.isArray(payload?.pagamentos) ? payload.pagamentos : [];
  const known = new Set(TIPOS_CUSTO_MAPA.map((t) => t.key));

  list.forEach((p) => {
    const itensPag = window.pagamentosUtil.expandirItensPagamento(p);
    itensPag.forEach((it) => {
      const eapId = String(it?.eapId || "");
      const tipo = String(it?.tipo || "");
      const valor = Number(it?.valorCalculado) || 0;
      if (!eapId || !known.has(tipo) || valor === 0) return;
      if (!mapa.has(eapId)) mapa.set(eapId, criarVazioPorTipo());
      mapa.get(eapId)[tipo] += valor;
    });
  });

  return mapa;
}

function renderizarSaldoEtapas() {
  if (!painelSaldoEtapas) return;

  const tiposNoMapa = TIPOS_CUSTO_MAPA.filter((t) => itens.some((it) => it?.tipo === t.key));
  if (!tiposNoMapa.length) {
    painelSaldoEtapas.innerHTML = `<div class="atenuado">Sem tipos definidos no mapa.</div>`;
    return;
  }

  const etapasUsadas = new Set();
  itens.forEach((it) => {
    const etapas = obterEtapasDoItemParaResumo(it);
    etapas.forEach((e) => {
      const id = String(e?.eapId || "").trim();
      if (id) etapasUsadas.add(id);
    });
  });

  const etapasLista = Array.from(etapasUsadas.values());
  if (!etapasLista.length) {
    painelSaldoEtapas.innerHTML = `<div class="atenuado">Sem etapas vinculadas no mapa.</div>`;
    return;
  }

  const realizadoPorEtapa = calcularRealizadoPorEtapaTipo();
  garantirCacheOrcadoEapMapa();

  const ordenar = (a, b) => {
    const ra = obterRotuloEapPorId(a);
    const rb = obterRotuloEapPorId(b);
    const na = parseInt(String(ra).split(" - ")[0], 10);
    const nb = parseInt(String(rb).split(" - ")[0], 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(ra).localeCompare(String(rb), "pt-BR");
  };

  etapasLista.sort(ordenar);

  const header = `
    <tr>
      <th>Etapa</th>
      ${tiposNoMapa.map((t) => `<th class="valor">${t.label}</th>`).join("")}
    </tr>
  `;

  const body = etapasLista.map((etapaId) => {
    const orcado = obterOrcadoPorIdMapa(etapaId) || { totalPorTipo: criarVazioPorTipo() };
    const realizado = realizadoPorEtapa.get(etapaId) || criarVazioPorTipo();
    const rotulo = obterRotuloEapPorId(etapaId);

    const cells = tiposNoMapa.map((t) => {
      const o = Number(orcado.totalPorTipo?.[t.key]) || 0;
      const r = Number(realizado?.[t.key]) || 0;
      const saldo = o - r;
      return `<td class="valor">${formatarMoeda(saldo)}</td>`;
    }).join("");

    return `<tr><td>${rotulo}</td>${cells}</tr>`;
  }).join("");

  painelSaldoEtapas.innerHTML = `
    <table class="tabela-resumo">
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>
  `;
}
