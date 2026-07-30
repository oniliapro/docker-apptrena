/* ===== DIÁRIO DE OBRA ===== */
(function () {
  const CHAVE_OBRA_ATIVA = "controleObra.obraAtiva.v1";

  const seletorObra = document.getElementById("seletorObra");
  const formDiario = document.getElementById("formDiario");
  const campoData = document.getElementById("campoData");
  const campoClima = document.getElementById("campoClima");
  const campoAutor = document.getElementById("campoAutor");
  const campoTitulo = document.getElementById("campoTitulo");
  const campoDescricao = document.getElementById("campoDescricao");
  const campoFotos = document.getElementById("campoFotos");
  const statusDiario = document.getElementById("statusDiario");
  const listaDiario = document.getElementById("listaDiario");

  const modalNovaObra = document.getElementById("modalNovaObra");
  const campoNovaObraNome = document.getElementById("campoNovaObraNome");
  const campoNovaObraCliente = document.getElementById("campoNovaObraCliente");

  let obras = [];

  function apiBase() {
    return window.controleObraApiBase || "http://localhost:8088/api";
  }

  function token() {
    return window.controleObraAuth ? window.controleObraAuth.getToken() : "";
  }

  async function chamarApi(path, options = {}) {
    const headers = Object.assign(
      { Accept: "application/json" },
      options.headers || {},
      token() ? { Authorization: `Bearer ${token()}` } : {}
    );
    const resposta = await fetch(`${apiBase()}${path}`, { ...options, headers });
    const payload = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const msg = payload?.message || "Erro ao falar com o servidor.";
      throw new Error(msg);
    }
    return payload;
  }

  function obraAtivaId() {
    return seletorObra?.value || "";
  }

  function salvarObraAtiva(id) {
    try { localStorage.setItem(CHAVE_OBRA_ATIVA, id || ""); } catch (_) {}
  }

  function carregarObraAtivaSalva() {
    try { return localStorage.getItem(CHAVE_OBRA_ATIVA) || ""; } catch (_) { return ""; }
  }

  function renderizarSeletorObra() {
    if (!seletorObra) return;
    if (!obras.length) {
      seletorObra.innerHTML = `<option value="">Nenhuma obra cadastrada</option>`;
      return;
    }
    const salva = carregarObraAtivaSalva();
    seletorObra.innerHTML = obras
      .map((o) => `<option value="${o.id}">${escaparTexto(o.obra_nome || "(sem nome)")}</option>`)
      .join("");
    if (salva && obras.some((o) => o.id === salva)) seletorObra.value = salva;
  }

  function escaparTexto(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  async function carregarObras() {
    try {
      obras = await chamarApi("/obras");
      renderizarSeletorObra();
      if (obraAtivaId()) await carregarRegistros();
    } catch (err) {
      listaDiario.innerHTML = `<div class="atenuado">Não foi possível carregar as obras: ${escaparTexto(err.message)}</div>`;
    }
  }

  window.abrirModalNovaObra = function () {
    campoNovaObraNome.value = "";
    campoNovaObraCliente.value = "";
    modalNovaObra.classList.remove("oculto");
    modalNovaObra.setAttribute("aria-hidden", "false");
  };

  window.fecharModalNovaObra = function () {
    modalNovaObra.classList.add("oculto");
    modalNovaObra.setAttribute("aria-hidden", "true");
  };

  window.criarObra = async function () {
    const nome = campoNovaObraNome.value.trim();
    if (!nome) { window.alert("Informe o nome da obra."); return; }

    try {
      const nova = await chamarApi("/obras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ obra_nome: nome, cliente: campoNovaObraCliente.value.trim() }),
      });
      window.fecharModalNovaObra();
      await carregarObras();
      seletorObra.value = nova.id;
      salvarObraAtiva(nova.id);
      await carregarRegistros();
    } catch (err) {
      window.alert(err.message || "Não foi possível criar a obra.");
    }
  };

  async function carregarRegistros() {
    const obraId = obraAtivaId();
    if (!obraId) { listaDiario.innerHTML = `<div class="atenuado">Escolha ou crie uma obra acima.</div>`; return; }

    listaDiario.innerHTML = `<div class="atenuado">Carregando...</div>`;
    try {
      const registros = await chamarApi(`/diario?obra_id=${encodeURIComponent(obraId)}`);
      renderizarRegistros(registros);
    } catch (err) {
      listaDiario.innerHTML = `<div class="atenuado">Erro ao carregar registros: ${escaparTexto(err.message)}</div>`;
    }
  }

  function renderizarRegistros(registros) {
    if (!registros.length) {
      listaDiario.innerHTML = `<div class="diario-vazio atenuado">Nenhum registro ainda para esta obra.</div>`;
      return;
    }

    listaDiario.innerHTML = registros.map((r) => `
      <div class="cartao-registro diario-cartao">
        <div class="diario-cartao-corpo">
          <div class="diario-cartao-cabecalho">
            <span class="diario-data">${escaparTexto(formatarData(r.data))}${r.clima ? " · " + escaparTexto(r.clima) : ""}</span>
            <button type="button" class="perigo" onclick="removerRegistroDiario('${r.id}')">✖</button>
          </div>
          ${r.titulo ? `<div><strong>${escaparTexto(r.titulo)}</strong></div>` : ""}
          ${r.descricao ? `<div>${escaparTexto(r.descricao)}</div>` : ""}
          ${r.autor ? `<div class="atenuado pequeno">Registrado por ${escaparTexto(r.autor)}</div>` : ""}
          ${
            (r.fotos || []).length
              ? `<div class="diario-fotos">${r.fotos.map((f) => `<img class="diario-foto" src="${f.url}" onclick="window.open('${f.url}','_blank')">`).join("")}</div>`
              : ""
          }
        </div>
      </div>
    `).join("");
  }

  function formatarData(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  }

  window.removerRegistroDiario = async function (id) {
    const ok = window.confirm("Excluir este registro do diário?");
    if (!ok) return;
    try {
      await chamarApi(`/diario/${id}`, { method: "DELETE" });
      await carregarRegistros();
    } catch (err) {
      window.alert(err.message || "Não foi possível excluir.");
    }
  };

  seletorObra?.addEventListener("change", () => {
    salvarObraAtiva(obraAtivaId());
    carregarRegistros();
  });

  formDiario?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const obraId = obraAtivaId();
    if (!obraId) { window.alert("Escolha ou crie uma obra primeiro."); return; }
    if (!campoData.value) { window.alert("Informe a data."); return; }

    statusDiario.textContent = "Salvando...";

    try {
      const formData = new FormData();
      formData.append("obra_id", obraId);
      formData.append("data", campoData.value);
      formData.append("clima", campoClima.value);
      formData.append("autor", campoAutor.value);
      formData.append("titulo", campoTitulo.value);
      formData.append("descricao", campoDescricao.value);
      Array.from(campoFotos.files || []).forEach((f) => formData.append("fotos[]", f));

      await chamarApi("/diario", { method: "POST", body: formData });

      formDiario.reset();
      campoData.value = "";
      statusDiario.textContent = "Registro salvo.";
      await carregarRegistros();
    } catch (err) {
      statusDiario.textContent = "";
      window.alert(err.message || "Não foi possível salvar o registro.");
    }
  });

  // data padrão = hoje
  if (campoData) campoData.value = new Date().toISOString().slice(0, 10);

  carregarObras();
})();
