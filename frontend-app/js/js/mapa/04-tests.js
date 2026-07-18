/* =========================================================
   04-tests.js
   - Testes de compra + painel (canto esquerdo)
   Ajustes:
   - Remove título duplicado
   - Exponibiliza helper para pegar o texto exato do vencedor:
       window.obterTextoCompraVencedora()
   ========================================================= */

/* ===== TESTES DE COMPRA (tabela abaixo) ===== */
function calcularTestesCompra() {
  const ativos = fornecedores.filter(s => s.ativo).length;
  if (ativos === 0) {
    return {
      rows: [
        { key: "none", label: "Selecione 1 ou mais fornecedores para simular mapa", total: null, note: "" }
      ],
      winnerKey: null,
      integralWinnerSupplierIndex: -1
    };
  }

  // 1) Tudo em uma só loja (melhor integral válido)
  const totaisIntegral = calcularIntegralPorFornecedor();
  let melhorIntegral = { si: -1, total: Infinity };
  totaisIntegral.forEach((t, i) => {
    if (t > 0 && t < melhorIntegral.total) melhorIntegral = { si: i, total: t };
  });
  const integralValido = melhorIntegral.si !== -1;

  // 2) Fracionado + fretes individuais (global)
  const fracionado = calcularFracionadoPorFornecedor();
  let fracionadoComFretesLoja = 0;
  fracionado.forEach((x, i) => {
    if (!fornecedores[i].ativo) return;
    fracionadoComFretesLoja += x.totalItens;
    if (x.used) fracionadoComFretesLoja += (Number(fornecedores[i].frete) || 0) - (Number(fornecedores[i].desconto) || 0);
  });

  // 3) Fracionado + frete particular (se existir)
  const temFreteParticular = (Number(freteParticular) || 0) > 0;
  let fracionadoComFreteParticular = null;
  if (temFreteParticular) {
    let somaItens = 0;
    itens.forEach((item) => {
      const win = obterVencedorEfetivoPorItem(item); // não altera aqui (para o teste atual do app)
      if (win) somaItens += win.total;
    });
    fracionadoComFreteParticular = somaItens + (Number(freteParticular) || 0);
  }

  // 4) Compra personalizada (se modoManual ON)
  let totalPersonalizado = null;
  if (modoManual) {
    let ok = true;
    let somaItens = 0;
    const usadoPorFornecedor = fornecedores.map(() => false);

    for (const it of itens) {
      const q = Number(it.qtde) || 0;
      if (q <= 0) continue;
      if (!(Number.isFinite(it.choice)) || it.choice === null) { ok = false; break; }
      const si = it.choice;
      const s = fornecedores[si];
      if (!s || !s.ativo) { ok = false; break; }
      if (!(Number(it.unit[si]) > 0)) { ok = false; break; }

      somaItens += calcularTotalItemPorFornecedor(it, si);
      usadoPorFornecedor[si] = true;
    }

    if (ok) {
      let total = somaItens;
      fornecedores.forEach((s, i) => {
        if (!s.ativo) return;
        if (usadoPorFornecedor[i]) total += (Number(s.frete) || 0) - (Number(s.desconto) || 0);
      });
      totalPersonalizado = total;
    } else {
      totalPersonalizado = null;
    }
  }

  const rows = [];

  rows.push({
    key: "integral",
    label: "Tudo em uma só loja",
    total: integralValido ? melhorIntegral.total : null,
    note: integralValido ? (fornecedores[melhorIntegral.si]?.fornecedor || "Fornecedor") : "Sem loja com todos os itens"
  });

  rows.push({
    key: "frac_shop",
    label: "Várias lojas + fretes individuais",
    total: fracionadoComFretesLoja,
    note: ""
  });

  if (temFreteParticular) {
    rows.push({
      key: "frac_private",
      label: "Várias lojas + frete particular",
      total: fracionadoComFreteParticular,
      note: ""
    });
  }

  if (modoManual) {
    rows.push({
      key: "custom",
      label: "Compra personalizada",
      total: totalPersonalizado,
      note: totalPersonalizado === null ? "Incompleta (marque 1 loja por item)" : ""
    });
  }

  // vencedor
  let winnerKey = null;
  let best = Infinity;
  for (const r of rows) {
    if (typeof r.total !== "number") continue;
    if (r.total < best) { best = r.total; winnerKey = r.key; }
  }

  return {
    rows,
    winnerKey,
    integralWinnerSupplierIndex: integralValido ? melhorIntegral.si : -1
  };
}

/* helper: texto EXATO que aparece na linha vencedora (sem troféu) */
function montarRotuloLinhaTeste(r) {
  const noteTxt = r.note ? ` (${r.note})` : "";
  return `${r.label}${noteTxt}`;
}

/* disponível globalmente para o resumo geral */
window.obterTextoCompraVencedora = function () {
  const testes = calcularTestesCompra();
  if (!testes?.winnerKey) return "—";

  const row = testes.rows.find(x => x.key === testes.winnerKey);
  if (!row) return "—";
  return montarRotuloLinhaTeste(row);
};

function renderizarPainelTestes() {
  const testes = calcularTestesCompra();

  // mantém APENAS UM título (sem duplicar)
  painelTestes.innerHTML = `
    <div class="testes-titulo">TESTES DE COMPRA</div>
    <table class="testes-tabela">
      <thead>
        <tr>
          <th class="testes-tipo">Tipo</th>
          <th class="testes-valor">Total</th>
        </tr>
      </thead>
      <tbody>
        ${testes.rows.map(r => {
          if (r.total === null && r.key === "none") {
            return `<tr><td colspan="2" class="atenuado">${r.label}</td></tr>`;
          }

          const trofeu = (testes.winnerKey === r.key && typeof r.total === "number")
            ? `<span class="trofeu">🏆</span>`
            : "";

          const totalTxt = (typeof r.total === "number") ? formatarMoeda(r.total) : `<span class="atenuado">—</span>`;
          const label = montarRotuloLinhaTeste(r);

          return `
            <tr>
              <td>${trofeu}${label}</td>
              <td class="testes-valor">${totalTxt}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}
