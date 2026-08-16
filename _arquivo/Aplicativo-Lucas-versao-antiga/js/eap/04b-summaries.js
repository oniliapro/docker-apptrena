/* ===== RESUMO POR CATEGORIA (EAP) ===== */

function renderizarResumos() {
  if (!resumoCategoria) return;
  renderizarResumoCategoria();
}

function renderizarResumoCategoria() {
  const cache = calcularCacheBaseOrcado();
  const scope = (cabecalhoObra?.bdiScope === "category" || cabecalhoObra?.bdiScope === "item")
    ? cabecalhoObra.bdiScope
    : "global";
  const locked = Boolean(cabecalhoObra?.isConfirmed);

  const globalMode = (cabecalhoObra?.bdiMode === "value") ? "value" : "pct";
  const globalToggleLabel = (globalMode === "value") ? "R$" : "%";
  const globalValue = (globalMode === "value")
    ? moedaOuVazio(cabecalhoObra?.bdiValue)
    : percentualOuVazio(cabecalhoObra?.bdiPercent);
  const globalPlaceholder = (globalMode === "value") ? "R$ 0,00" : "0,00 %";
  const globalOnBlur = (globalMode === "value")
    ? "cabecalhoObra.bdiValue=parsearBR(this.value);enfileirarRenderizacao()"
    : "cabecalhoObra.bdiPercent=parsearBR(this.value);enfileirarRenderizacao()";

  const rows = TIPOS_CUSTO.map((t) => {
    const o = Number(cache.totalsDirectByType?.[t.key]) || 0;
    const b = Number(cache.totalsBdiByType?.[t.key]) || 0;
    const tot = o + b;

    const bdiCell = (scope === "category")
      ? (() => {
        const slot = cabecalhoObra?.bdiByType?.[t.key] || { mode: "pct", percent: 0, value: 0 };
        const mode = (slot.mode === "value") ? "value" : "pct";
        const toggleLabel = (mode === "value") ? "R$" : "%";
        const value = (mode === "value") ? moedaOuVazio(slot.value) : percentualOuVazio(slot.percent);
        const placeholder = (mode === "value") ? "R$ 0,00" : "0,00 %";
        const onblur = (mode === "value")
          ? `cabecalhoObra.bdiByType['${t.key}'].value=parsearBR(this.value);enfileirarRenderizacao()`
          : `cabecalhoObra.bdiByType['${t.key}'].percent=parsearBR(this.value);enfileirarRenderizacao()`;

        return `
          <td class="separador-esquerda">
            <div class="bdi-celula">
              <button class="bdi-alternar" title="Alternar BDI (% / R$)" ${locked ? "disabled" : ""} onclick="alternarModoBdiCategoria('${t.key}')">${toggleLabel}</button>
              <input
                value="${escaparHtml(value)}"
                placeholder="${escaparHtml(placeholder)}"
                ${locked ? "disabled" : ""}
                onblur="${onblur}">
            </div>
          </td>
        `;
      })()
      : `<td class="valor separador-esquerda">${formatarMoeda(b)}</td>`;

    return `
      <tr>
        <td>${escaparHtml(t.label)}</td>
        <td class="valor">${formatarMoeda(o)}</td>
        ${bdiCell}
        <td class="valor"><b>${formatarMoeda(tot)}</b></td>
      </tr>
    `;
  }).join("");

  const scopeControl = `
    <div class="controles-resumo">
      <div class="controle-resumo">
        <span class="rotulo-resumo">BDI</span>
        <select ${locked ? "disabled" : ""} onchange="definirEscopoBdi(this.value)">
          <option value="global" ${scope === "global" ? "selected" : ""}>Global (obra)</option>
          <option value="category" ${scope === "category" ? "selected" : ""}>Por categoria</option>
          <option value="item" ${scope === "item" ? "selected" : ""}>Apenas por item</option>
        </select>
      </div>
      ${scope === "category" ? `<div class="atenuado pequeno">Edite a coluna BDI por categoria. BDI por item substitui.</div>` : ""}
      ${scope === "item" ? `<div class="atenuado pequeno">Preencha BDI diretamente nos itens (coluna BDI).</div>` : ""}
      ${locked ? `<div class="atenuado pequeno">EAP confirmada: orcamento/BDI bloqueados ate reabrir.</div>` : ""}
    </div>
  `;

  const globalControlTop = scope === "global" ? `
    <div class="resumo-categoria-tabela-topo">
      <div class="controle-resumo">
        <span class="rotulo-resumo">BDI Global</span>
        <button class="bdi-alternar" title="Alternar BDI (% / R$)" ${locked ? "disabled" : ""} onclick="alternarModoBdiGlobal()">${globalToggleLabel}</button>
        <input
          value="${escaparHtml(globalValue)}"
          placeholder="${escaparHtml(globalPlaceholder)}"
          ${locked ? "disabled" : ""}
          onblur="${globalOnBlur}">
      </div>
      <div class="atenuado pequeno">BDI por item (coluna BDI) substitui o global.</div>
    </div>
  ` : "";

  resumoCategoria.innerHTML = `
    <div class="resumo-categoria-layout">
      <div class="resumo-categoria-controles">
        ${scopeControl}
      </div>
      <div class="resumo-categoria-tabela">
        ${globalControlTop}
        <table class="tabela-resumo">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Orcado</th>
              <th>BDI</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th class="valor">${formatarMoeda(cache.totalsDirect)}</th>
              <th class="valor">${formatarMoeda(cache.totalsBdi)}</th>
              <th class="valor"><b>${formatarMoeda(cache.totalsWithBdi)}</b></th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}
