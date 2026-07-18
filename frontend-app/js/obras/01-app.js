/* ===== LISTA DE OBRAS ===== */
(function () {
  const formObra = document.getElementById("formObra");
  const campoId = document.getElementById("campoObraId");
  const campoNumero = document.getElementById("campoObraNumero");
  const campoNome = document.getElementById("campoObraNome");
  const campoCliente = document.getElementById("campoObraCliente");
  const campoDataBase = document.getElementById("campoObraDataBase");
  const campoResponsavel = document.getElementById("campoObraResponsavel");
  const campoLocal = document.getElementById("campoObraLocal");
  const campoPeriodo = document.getElementById("campoObraPeriodo");
  const campoObs = document.getElementById("campoObraObs");
  const statusObra = document.getElementById("statusObra");
  const botaoSalvar = document.getElementById("botaoSalvarObra");
  const botaoCancelarEdicao = document.getElementById("botaoCancelarEdicaoObra");
  const corpoObras = document.getElementById("corpoObras");

  let obras = [];

  function escaparTexto(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function limparFormulario() {
    campoId.value = "";
    formObra.reset();
    botaoSalvar.textContent = "💾 Criar obra";
    botaoCancelarEdicao.classList.add("oculto");
  }

  function preencherFormularioParaEdicao(obra) {
    campoId.value = obra.id;
    campoNumero.value = obra.map_number || "";
    campoNome.value = obra.obra_nome || "";
    campoCliente.value = obra.cliente || "";
    campoDataBase.value = obra.data_base ? String(obra.data_base).slice(0, 10) : "";
    campoResponsavel.value = obra.responsavel || "";
    campoLocal.value = obra.local_obra || "";
    campoPeriodo.value = obra.periodo || "";
    campoObs.value = obra.obs || "";
    botaoSalvar.textContent = "💾 Salvar alterações";
    botaoCancelarEdicao.classList.remove("oculto");
    campoNome.focus();
  }

  function dadosDoFormulario() {
    return {
      map_number: campoNumero.value.trim(),
      obra_nome: campoNome.value.trim(),
      cliente: campoCliente.value.trim(),
      data_base: campoDataBase.value || null,
      responsavel: campoResponsavel.value.trim(),
      local_obra: campoLocal.value.trim(),
      periodo: campoPeriodo.value.trim(),
      obs: campoObs.value.trim(),
    };
  }

  async function carregarObras() {
    corpoObras.innerHTML = `<tr><td colspan="7" class="atenuado centro">Carregando…</td></tr>`;
    try {
      obras = await window.obrasApi.listar();
      renderizarTabela();
    } catch (err) {
      corpoObras.innerHTML = `<tr><td colspan="7" class="atenuado centro">Não foi possível carregar as obras: ${escaparTexto(err.message)}</td></tr>`;
    }
  }

  function renderizarTabela() {
    if (!obras.length) {
      corpoObras.innerHTML = `<tr><td colspan="7" class="atenuado centro">Nenhuma obra cadastrada ainda.</td></tr>`;
      return;
    }

    const ativaId = window.obrasApi.obterAtivaId();

    corpoObras.innerHTML = obras.map((o) => {
      const ativa = o.id === ativaId;
      return `
        <tr class="${ativa ? "linha-obra-ativa" : ""}">
          <td>${escaparTexto(o.map_number || "—")}</td>
          <td><b>${escaparTexto(o.obra_nome || "(sem nome)")}</b></td>
          <td>${escaparTexto(o.cliente || "—")}</td>
          <td>${escaparTexto(o.responsavel || "—")}</td>
          <td>${escaparTexto(o.local_obra || "—")}</td>
          <td class="centro">${ativa ? "<b>✔ Ativa</b>" : `<button type="button" onclick="selecionarObraAtiva('${o.id}')">Selecionar</button>`}</td>
          <td class="acoes-linha centro">
            <button title="Editar" onclick="editarObra('${o.id}')">✎</button>
            <button title="Excluir" onclick="excluirObra('${o.id}')">✖</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.selecionarObraAtiva = function (id) {
    window.obrasApi.definirAtiva(id);
    renderizarTabela();
    statusObra.textContent = "Obra ativa alterada. As telas de EAP, Mapa, Empreita e Pagamentos agora usam os dados dessa obra.";
  };

  window.editarObra = function (id) {
    const obra = obras.find((o) => o.id === id);
    if (!obra) return;
    preencherFormularioParaEdicao(obra);
  };

  window.excluirObra = async function (id) {
    const obra = obras.find((o) => o.id === id);
    const ok = window.confirm(`Excluir a obra "${obra?.obra_nome || ""}"? Isso apaga também a EAP cadastrada para ela.`);
    if (!ok) return;

    try {
      await window.obrasApi.remover(id);
      if (window.obrasApi.obterAtivaId() === id) window.obrasApi.definirAtiva("");
      await carregarObras();
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir a obra.");
    }
  };

  formObra.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dados = dadosDoFormulario();
    if (!dados.obra_nome) { window.alert("Informe o nome da obra."); return; }

    statusObra.textContent = "Salvando…";
    try {
      if (campoId.value) {
        await window.obrasApi.atualizar(campoId.value, dados);
        statusObra.textContent = "Obra atualizada.";
      } else {
        const nova = await window.obrasApi.criar(dados);
        statusObra.textContent = "Obra criada.";
        // primeira obra criada já vira automaticamente a obra ativa
        if (!window.obrasApi.obterAtivaId()) window.obrasApi.definirAtiva(nova.id);
      }
      limparFormulario();
      await carregarObras();
    } catch (err) {
      statusObra.textContent = "";
      window.alert(err.message || "Não foi possível salvar a obra.");
    }
  });

  botaoCancelarEdicao.addEventListener("click", limparFormulario);

  carregarObras();
})();
