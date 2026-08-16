/* ===== PAINEL: Indicadores / Validações (EAP) ===== */

function renderizarPainelTestes() {
  if (!painelTestes) return;

  const cache = calcularCacheBaseOrcado();

  const itensBase = itensEap.filter((x) => x && !x.isGroup).length;
  const grupos = itensEap.filter((x) => x && x.isGroup).length;

  let missingEap = 0;
  let missingDesc = 0;
  let zeroQty = 0;
  let bdiOverrides = 0;
  let bdiBothFilled = 0;

  for (const it of itensEap) {
    if (!it || it.isGroup) continue;
    if (!String(it.eap || "").trim()) missingEap++;
    if (!String(it.desc || "").trim()) missingDesc++;
    if ((Number(it.qtde) || 0) <= 0) zeroQty++;
    if ((Number(it.bdiPercent) || 0) > 0 || (Number(it.bdiValue) || 0) > 0) bdiOverrides++;
    if ((Number(it.bdiPercent) || 0) > 0 && (Number(it.bdiValue) || 0) > 0) bdiBothFilled++;
  }

  const avisos = [];
  if (missingEap) avisos.push(`EAP vazia em ${missingEap} item(ns).`);
  if (missingDesc) avisos.push(`Descrição vazia em ${missingDesc} item(ns).`);
  if (zeroQty) avisos.push(`Qtde <= 0 em ${zeroQty} item(ns) (totais ficam zerados).`);
  if (bdiBothFilled) avisos.push(`BDI % e R$ preenchidos em ${bdiBothFilled} item(ns) (R$ tem prioridade).`);

  const pctBdi = percentualSeguro(cache.totalsBdi, cache.totalsDirect);

  painelTestes.innerHTML = `
    <div class="testes-titulo">INDICADORES</div>
    <table class="testes-tabela">
      <thead>
        <tr>
          <th class="testes-tipo">Tipo</th>
          <th class="testes-valor">Valor</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Itens (base)</td><td class="testes-valor">${itensBase}</td></tr>
        <tr><td>Grupos</td><td class="testes-valor">${grupos}</td></tr>
        <tr><td>Orçado (direto)</td><td class="testes-valor">${formatarMoeda(cache.totalsDirect)}</td></tr>
        <tr><td>BDI (total)</td><td class="testes-valor">${formatarMoeda(cache.totalsBdi)}</td></tr>
        <tr><td>% BDI aplicado</td><td class="testes-valor">${formatarPercentual(pctBdi)}</td></tr>
        <tr><td>Total (com BDI)</td><td class="testes-valor"><b>${formatarMoeda(cache.totalsWithBdi)}</b></td></tr>
        <tr><td>Itens com BDI próprio</td><td class="testes-valor">${bdiOverrides}</td></tr>
      </tbody>
    </table>
    ${avisos.length ? `<div class="aviso-simulacao" style="margin-top:8px">${avisos.join("<br>")}</div>` : ""}
  `;
}
