(function iniciarDemoRedimensionamentoColunas() {
  const tabela = document.getElementById("tabelaResizeDemo");
  if (!tabela) return;

  const colunas = Array.from(tabela.querySelectorAll("colgroup col"));
  const headers = Array.from(tabela.querySelectorAll("thead th"));
  const botaoReset = document.getElementById("resetarLargurasDemo");

  if (!colunas.length || headers.length !== colunas.length) return;

  let estadoDrag = null;

  function lerLarguraColuna(i) {
    const col = colunas[i];
    const th = headers[i];
    if (!col || !th) return 0;

    const viaStyle = parseFloat(String(col.style.width || "").replace("px", ""));
    if (Number.isFinite(viaStyle) && viaStyle > 0) return viaStyle;

    const viaComputed = parseFloat(getComputedStyle(col).width || "");
    if (Number.isFinite(viaComputed) && viaComputed > 0) return viaComputed;

    return th.getBoundingClientRect().width || 0;
  }

  function aplicarLarguraColuna(i, largura) {
    const col = colunas[i];
    if (!col) return;
    col.style.width = `${Math.max(1, Math.round(largura))}px`;
  }

  function ajustarLarguraTabela() {
    let total = 0;
    for (let i = 0; i < colunas.length; i++) total += lerLarguraColuna(i);
    tabela.style.width = `${Math.max(1, Math.round(total))}px`;
  }

  // Normaliza as colunas para larguras explicitas em px.
  for (let i = 0; i < colunas.length; i++) {
    const w = lerLarguraColuna(i);
    if (w > 0) aplicarLarguraColuna(i, w);
  }
  ajustarLarguraTabela();

  const largurasIniciais = colunas.map((_, i) => lerLarguraColuna(i));

  function encerrarRedimensionamento() {
    if (!estadoDrag) return;

    const h = headers[estadoDrag.colIndex];
    if (h) h.classList.remove("coluna-em-redimensionamento");

    document.body.classList.remove("redimensionando-colunas");
    estadoDrag = null;
    window.removeEventListener("mousemove", aoMoverMouse);
    window.removeEventListener("mouseup", aoSoltarMouse);
  }

  function aoMoverMouse(evento) {
    if (!estadoDrag) return;

    const delta = evento.clientX - estadoDrag.inicioX;
    const novaLargura = Math.max(
      estadoDrag.minLargura,
      Math.round(estadoDrag.larguraInicial + delta)
    );

    aplicarLarguraColuna(estadoDrag.colIndex, novaLargura);
    ajustarLarguraTabela();
  }

  function aoSoltarMouse() {
    encerrarRedimensionamento();
  }

  function iniciarRedimensionamento(evento, colIndex) {
    if (evento.button !== 0) return;
    evento.preventDefault();

    const col = colunas[colIndex];
    const th = headers[colIndex];
    if (!col || !th) return;

    estadoDrag = {
      colIndex,
      inicioX: evento.clientX,
      larguraInicial: lerLarguraColuna(colIndex),
      minLargura: Number(th.dataset.minWidth) || 60,
    };

    th.classList.add("coluna-em-redimensionamento");
    document.body.classList.add("redimensionando-colunas");
    window.addEventListener("mousemove", aoMoverMouse);
    window.addEventListener("mouseup", aoSoltarMouse);
  }

  headers.forEach((th, i) => {
    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.title = "Arraste para redimensionar coluna";
    handle.addEventListener("mousedown", (evento) => iniciarRedimensionamento(evento, i));
    th.appendChild(handle);
  });

  if (botaoReset) {
    botaoReset.addEventListener("click", () => {
      largurasIniciais.forEach((w, i) => {
        if (w > 0) aplicarLarguraColuna(i, w);
      });
      ajustarLarguraTabela();
      encerrarRedimensionamento();
    });
  }

  window.addEventListener("blur", encerrarRedimensionamento);
})();
