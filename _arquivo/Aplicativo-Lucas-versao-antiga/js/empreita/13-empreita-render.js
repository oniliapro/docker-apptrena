/* ===== RENDER (Empreita) ===== */

function renderizarGrupoColunasEmpreita() {
  grupoColunasEmpreita.innerHTML = `
    <col class="col-numero">
    <col class="col-descricao">
    <col class="col-etapa">

    <col class="col-valor">

    <col class="col-valor">
    <col class="col-valor">
    <col class="col-valor">

    <col class="col-percentual">
    <col class="col-percentual">
    <col class="col-percentual">

    <col class="col-valor">
    <col class="col-valor">
    <col class="col-valor">

    <col class="col-acoes">
  `;
}

function renderizarCabecalhoTabelaEmpreita() {
  cabecalhoTabelaEmpreita.innerHTML = `
    <tr class="cabecalho-grupo">
      <th rowspan="2">#</th>
      <th rowspan="2">Serviço</th>
      <th rowspan="2">Etapa (EAP)</th>

      <th rowspan="2" class="separador-esquerda">Orçado (R$)</th>
      <th colspan="3" class="separador-esquerda">Contrato (R$)</th>
      <th colspan="3" class="separador-esquerda">Medição (%)</th>
      <th colspan="3" class="separador-esquerda">Pagamento do Período (R$)</th>

      <th rowspan="2">Ações</th>
    </tr>
    <tr>
      <th class="separador-esquerda">Empreiteiro</th>
      <th>Reserva</th>
      <th>Total</th>

      <th class="separador-esquerda">Acum.</th>
      <th>Atual</th>
      <th>Avanço</th>

      <th class="separador-esquerda">Pagar</th>
      <th>Reservar</th>
      <th>Total</th>
    </tr>
  `;
}

function obterMetaTipo(chaveTipo) {
  return TIPOS_CUSTO_EMPREITA.find((t) => t.key === chaveTipo) || {
    key: chaveTipo,
    label: chaveTipo,
    short: chaveTipo,
  };
}

function renderizarPilhaPercentualLeitura(valoresPorTipo, tipos) {
  const linhas = tipos.map((k) => {
    const meta = obterMetaTipo(k);
    const v = Number(valoresPorTipo?.[k]) || 0;
    return `
      <div class="tipo-linha">
        <span class="tipo-etiqueta">${escaparHtml(meta.short || meta.label || k)}</span>
        <span class="tipo-valor">${escaparHtml(formatarPercentual(v))}</span>
      </div>
    `;
  }).join("");

  return `<div class="tipo-pilha">${linhas}</div>`;
}

function renderizarPilhaPercentualEntrada(item, tipos, indiceLinha, tiposInvalidos = []) {
  const linhas = tipos.map((k) => {
    const meta = obterMetaTipo(k);
    const v = item?.medicaoAtualByType?.[k];
    const invalido = tiposInvalidos.includes(k);
    const classeEntrada = `valor ${invalido ? "entrada-invalida" : ""}`.trim();

    return `
      <div class="tipo-linha">
        <span class="tipo-etiqueta">${escaparHtml(meta.short || meta.label || k)}</span>
        <input class="${classeEntrada}"
          value="${v == null ? "" : escaparHtml(formatarPercentual(v))}"
          placeholder="0,00 %"
          onblur="definirMedicaoAtualPorTipo(${indiceLinha}, '${k}', this.value)">
      </div>
    `;
  }).join("");

  return `<div class="tipo-pilha">${linhas}</div>`;
}

function renderizarPilhaAvanco(avancoPorTipo, tipos) {
  const ativos = tipos.filter((k) => (Number(avancoPorTipo?.[k]) || 0) > 0);
  if (!ativos.length) return `<span class="atenuado">—</span>`;

  const linhas = ativos.map((k) => {
    const meta = obterMetaTipo(k);
    const v = Number(avancoPorTipo?.[k]) || 0;
    return `
      <div class="tipo-linha">
        <span class="tipo-etiqueta">${escaparHtml(meta.short || meta.label || k)}</span>
        <span class="tipo-valor"><b>${escaparHtml(formatarPercentual(v))}</b></span>
      </div>
    `;
  }).join("");

  return `<div class="tipo-pilha">${linhas}</div>`;
}

function montarOpcoesEap(idSelecionado) {
  const sid = String(idSelecionado || "");
  if (!snapshotEap.length) {
    return `<option value="">(Cadastre a EAP primeiro)</option>`;
  }

  const opcoes = [
    `<option value=""></option>`,
    ...snapshotEap.map((x) => {
      const level = String(x.eap || "").split(".").filter(Boolean).length - 1;
      const indent = "\u00A0".repeat(Math.max(0, level) * 3);
      const label = rotuloEapDoSnapshot(x);
      const txt = x.isGroup ? `${indent}${label}` : `${indent}${label}`;
      const sel = (x.id === sid) ? "selected" : "";
      return `<option value="${escaparHtml(x.id)}" ${sel}>${escaparHtml(txt)}</option>`;
    }),
  ];

  return opcoes.join("");
}

function renderizarCorpoEmpreita() {
  const linhas = itensEmpreita.map((it, i) => {
    const r = calcularLinhaEmpreita(it);

    const classeLinha = [
      r.reducaoInvalida ? "linha-invalida" : "",
      r.temAvanco ? "tem-avanco" : "",
    ].filter(Boolean).join(" ");

    const selectEap = `
      <select
        data-r="${i}"
        onchange="itensEmpreita[${i}].eapId=this.value;enfileirarRenderizacao()">
        ${montarOpcoesEap(it.eapId)}
      </select>
    `;

    return `
      <tr class="${classeLinha}">
        <td class="centro">${i + 1}</td>
        <td>
          <input
            value="${escaparHtml(it.desc || "")}"
            placeholder="Descrição do serviço"
            onblur="itensEmpreita[${i}].desc=this.value;enfileirarRenderizacao()">
        </td>
        <td>${selectEap}</td>

        <td class="valor separador-esquerda"><b>${formatarMoeda(r.orcadoTotal)}</b></td>

        <td class="separador-esquerda">
          <input class="valor"
            value="${moedaOuVazio(it.valorEmp)}"
            placeholder="R$ 0,00"
            onblur="itensEmpreita[${i}].valorEmp=parsearBR(this.value);enfileirarRenderizacao()">
        </td>
        <td>
          <input class="valor"
            value="${moedaOuVazio(it.valorReserva)}"
            placeholder="R$ 0,00"
            onblur="itensEmpreita[${i}].valorReserva=parsearBR(this.value);enfileirarRenderizacao()">
        </td>
        <td class="valor"><b>${formatarMoeda(r.valorTotal)}</b></td>

        <td class="separador-esquerda">
          ${renderizarPilhaPercentualLeitura(r.acumuladoPorTipo, r.tipos)}
        </td>
        <td>
          ${renderizarPilhaPercentualEntrada(it, r.tipos, i, r.tiposInvalidos)}
        </td>
        <td>
          ${renderizarPilhaAvanco(r.avancoPorTipo, r.tipos)}
        </td>

        <td class="valor separador-esquerda">${formatarMoeda(r.pagarEmp)}</td>
        <td class="valor">${formatarMoeda(r.reservarPgto)}</td>
        <td class="valor"><b>${formatarMoeda(r.totalPeriodo)}</b></td>

        <td class="acoes-linha centro">
          <button title="Mover para cima" onclick="moverItemEmpreitaParaCima(${i})">▲</button>
          <button title="Mover para baixo" onclick="moverItemEmpreitaParaBaixo(${i})">▼</button>
          <button title="Inserir linha abaixo" onclick="inserirItemEmpreitaAbaixo(${i})">＋</button>
          <button title="Excluir" onclick="removerItemEmpreita(${i})">✖</button>
        </td>
      </tr>
    `;
  }).join("");

  corpoEmpreita.innerHTML = linhas;
}

function renderizarRodapeEmpreita() {
  const t = calcularTotaisEmpreita();

  rodapeEmpreita.innerHTML = `
    <tr class="bloco-topo bloco-base">
      <th colspan="3" class="rotulo-rodape">TOTAL</th>

      <th class="valor separador-esquerda"><b>${formatarMoeda(t.orcadoTotal)}</b></th>
      <th class="valor separador-esquerda">${formatarMoeda(t.valorEmp)}</th>
      <th class="valor">${formatarMoeda(t.valorReserva)}</th>
      <th class="valor"><b>${formatarMoeda(t.valorTotal)}</b></th>

      <th class="valor separador-esquerda">—</th>
      <th class="valor">—</th>
      <th class="valor">—</th>

      <th class="valor separador-esquerda">${formatarMoeda(t.pagarEmp)}</th>
      <th class="valor">${formatarMoeda(t.reservarPgto)}</th>
      <th class="valor"><b>${formatarMoeda(t.totalPeriodo)}</b></th>

      <th></th>
    </tr>
  `;
}

function renderizarPainelResumo() {
  if (!painelResumo) return;
  const t = calcularTotaisEmpreita();

  painelResumo.innerHTML = `
    <table class="tabela-resumo">
      <tbody>
        <tr><th>Serviços</th><td class="valor">${itensEmpreita.length}</td></tr>
        <tr><th>Orçado (EAP)</th><td class="valor"><b>${formatarMoeda(t.orcadoTotal)}</b></td></tr>
        <tr><th>Contrato (empreiteiro)</th><td class="valor">${formatarMoeda(t.valorEmp)}</td></tr>
        <tr><th>Contrato (reserva)</th><td class="valor">${formatarMoeda(t.valorReserva)}</td></tr>
        <tr><th>Contrato (total)</th><td class="valor"><b>${formatarMoeda(t.valorTotal)}</b></td></tr>
        <tr><th>Pagar no período</th><td class="valor"><b>${formatarMoeda(t.pagarEmp)}</b></td></tr>
        <tr><th>Reservar no período</th><td class="valor">${formatarMoeda(t.reservarPgto)}</td></tr>
        <tr><th>Total do período</th><td class="valor"><b>${formatarMoeda(t.totalPeriodo)}</b></td></tr>
      </tbody>
    </table>
  `;
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

function renderizarPainelRegistros() {
  if (!painelRegistros) return;

  if (!registros.length) {
    painelRegistros.innerHTML = `<div class="atenuado">—</div>`;
    return;
  }

  const itens = registros.slice(-20).reverse().map((r) => `
    <div class="cartao-registro">
      <div><b>${formatarDataPtBr(r.date)}</b> <span class="atenuado">${escaparHtml(r.competencia || "")}</span></div>
      <div class="pequeno atenuado">${escaparHtml(r.obs || "")}</div>
      <div class="totais-registro">
        <div><span class="atenuado">Pagar:</span> <b>${formatarMoeda(r.totals?.pagarEmp || 0)}</b></div>
        <div><span class="atenuado">Reservar:</span> ${formatarMoeda(r.totals?.reservarPgto || 0)}</div>
        <div><span class="atenuado">Total:</span> <b>${formatarMoeda(r.totals?.totalPeriodo || 0)}</b></div>
      </div>
    </div>
  `).join("");

  painelRegistros.innerHTML = itens;
}

function renderizarEmpreita() {
  if (!cabecalhoTabelaEmpreita || !corpoEmpreita || !rodapeEmpreita || !grupoColunasEmpreita) return;
  renderizarGrupoColunasEmpreita();
  renderizarCabecalhoTabelaEmpreita();
  renderizarCorpoEmpreita();
  renderizarRodapeEmpreita();
  renderizarPainelResumo();
  renderizarPainelRegistros();
}
