/* =========================================================
   NAVEGAÇÃO GLOBAL + ATALHOS SHIFT (seu código, intacto)
   ========================================================= */
function obterCelulaFocadaQualquerGrupo() {
  const el = document.activeElement;
  if (!el) return null;
  const grupo = el.dataset?.group;
  const r = Number(el.dataset?.r);
  const c = Number(el.dataset?.c);
  if (!grupo || !Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { el, grupo, r, c };
}

function montarModeloFocoPorGrupo(grupo) {
  const raiz = obterRaizGrupo(grupo);
  if (!raiz) return null;

  const nodes = Array.from(raiz.querySelectorAll(`[data-group="${grupo}"][data-r][data-c]`))
    .filter((n) => !n.disabled && n.offsetParent !== null);

  const mapaLinha = new Map();
  const colunasLinha = new Map();
  const linhasSet = new Set();

  for (const n of nodes) {
    const rr = Number(n.dataset.r);
    const cc = Number(n.dataset.c);
    linhasSet.add(rr);
    if (!mapaLinha.has(rr)) mapaLinha.set(rr, new Map());
    mapaLinha.get(rr).set(cc, n);
  }

  for (const [rr, cmap] of mapaLinha.entries()) {
    colunasLinha.set(rr, Array.from(cmap.keys()).sort((a, b) => a - b));
  }

  const linhas = Array.from(linhasSet.values()).sort((a, b) => a - b);
  return { mapaLinha, colunasLinha, linhas };
}

function obterProximoNaLinha(modelo, r, c, dir) {
  const cols = modelo.colunasLinha.get(r);
  if (!cols || cols.length === 0) return null;
  const idx = cols.indexOf(c);
  if (idx === -1) return modelo.mapaLinha.get(r).get(cols[0]) || null;
  const ni = idx + dir;
  if (ni < 0 || ni >= cols.length) return null;
  return modelo.mapaLinha.get(r).get(cols[ni]) || null;
}

function obterLinhaVizinha(modelo, r, dir) {
  const idx = modelo.linhas.indexOf(r);
  if (idx === -1) return null;
  const ni = idx + dir;
  if (ni < 0 || ni >= modelo.linhas.length) return null;
  return modelo.linhas[ni];
}

function obterCelulaNaColunaMaisProxima(modelo, r, c) {
  const cmap = modelo.mapaLinha.get(r);
  const cols = modelo.colunasLinha.get(r);
  if (!cmap || !cols || cols.length === 0) return null;
  if (cmap.has(c)) return cmap.get(c);

  let best = cols[0];
  let bestDist = Math.abs(best - c);
  for (const cc of cols) {
    const d = Math.abs(cc - c);
    if (d < bestDist) { bestDist = d; best = cc; }
  }
  return cmap.get(best) || null;
}

function tratarTeclaNavegacaoGlobal(e) {
  const cell = obterCelulaFocadaQualquerGrupo();
  if (!cell) return;

  const { el, grupo, r, c } = cell;

  const key = e.key;
  const isEnter = key === "Enter";
  const isTab = key === "Tab";
  const isArrow = key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";

  if (!isEnter && !isTab && !isArrow) return;
  if (isArrow && el.tagName === "SELECT") return;

  e.preventDefault();

  const modelo = montarModeloFocoPorGrupo(grupo);
  if (!modelo) return;

  let target = null;

  if (isTab) {
    target = obterProximoNaLinha(modelo, r, c, e.shiftKey ? -1 : 1);
  } else if (isEnter) {
    const nr = obterLinhaVizinha(modelo, r, e.shiftKey ? -1 : 1);
    if (nr != null) target = obterCelulaNaColunaMaisProxima(modelo, nr, c);
  } else {
    if (key === "ArrowLeft") target = obterProximoNaLinha(modelo, r, c, -1);
    if (key === "ArrowRight") target = obterProximoNaLinha(modelo, r, c, +1);
    if (key === "ArrowUp") {
      const nr = obterLinhaVizinha(modelo, r, -1);
      if (nr != null) target = obterCelulaNaColunaMaisProxima(modelo, nr, c);
    }
    if (key === "ArrowDown") {
      const nr = obterLinhaVizinha(modelo, r, +1);
      if (nr != null) target = obterCelulaNaColunaMaisProxima(modelo, nr, c);
    }
  }

  if (!target) return;

  const commit = el.dataset.commit;

  if (commit === "blur") {
    if (grupo === "header") { target.focus(); return; }
    definirProximoFoco(Number(target.dataset.r), Number(target.dataset.c), grupo);
    el.blur();
    return;
  }

  if (commit === "render") {
    definirProximoFoco(Number(target.dataset.r), Number(target.dataset.c), grupo);
    enfileirarRenderizacao();
    return;
  }

  target.focus();
}

function tratarAtalhos(e) {
  if (!e.shiftKey) return;

  const addItemKey = (e.key === "+" || e.key === "=");
  const removeItemKey = (e.key === "-" || e.key === "_");
  const addSupplierKey = (e.key === ">" || e.key === ".");
  const removeSupplierKey = (e.key === "<" || e.key === ",");

  if (!(addItemKey || removeItemKey || addSupplierKey || removeSupplierKey)) return;
  e.preventDefault();

  const cell = obterCelulaFocadaQualquerGrupo();
  const grupo = cell?.grupo || "header";
  const r = cell?.r ?? 0;
  const c = cell?.c ?? 0;

  if (addItemKey) {
    const newRow = itens.length;
    definirProximoFoco(newRow, 0, "body");
    adicionarItem();
    return;
  }

  if (removeItemKey) {
    if (grupo !== "body") return;
    if (itens.length === 0) return;

    const rowToRemove = Math.max(0, Math.min(itens.length - 1, r));
    const focusRow = Math.max(0, Math.min(itens.length - 2, rowToRemove));
    definirProximoFoco(focusRow, 0, "body");
    removerItem(rowToRemove);
    return;
  }

  if (addSupplierKey) {
    if (grupo === "body") definirProximoFoco(r, c, "body");
    if (grupo === "footer") definirProximoFoco(r, c, "footer");
    adicionarFornecedor();
    return;
  }

  if (removeSupplierKey) {
    const si = indiceFornecedorPorColuna(c);
    if (si === -1) return;
    const focusRow = (grupo === "body") ? r : 0;
    removerFornecedor(si, focusRow);
  }
}

function iniciarNavegacaoCabecalho() {
  const headerTable = document.querySelector("table.cabecalho-tabela");
  if (!headerTable) return;

  const rows = Array.from(headerTable.querySelectorAll("tr"));
  rows.forEach((tr, ri) => {
    const focusables = Array.from(tr.querySelectorAll("input,select,textarea"))
      .filter(el => !el.disabled);

    focusables.forEach((el, ci) => {
      el.dataset.group = "header";
      el.dataset.r = String(ri);
      el.dataset.c = String(ci);
    });
  });

  const numeroMapa = document.querySelector(".numero-mapa input");
  if (numeroMapa) {
    numeroMapa.dataset.group = "header";
    numeroMapa.dataset.r = "0";
    numeroMapa.dataset.c = "99";
  }
}

function iniciarNavegacaoGlobal() {
  document.addEventListener("keydown", (e) => {
    tratarAtalhos(e);
    if (e.defaultPrevented) return;
    tratarTeclaNavegacaoGlobal(e);
  }, true);
}
