/* ===== OBRAS (API compartilhada + obra ativa) =====
   Fala direto com o backend relacional (/api/obras), que já existe e já é
   usado pelo Diário de Obra. Este arquivo generaliza esse acesso para
   qualquer tela (EAP, Mapa, Empreita, Pagamentos, Lista de Obras) usar a
   mesma "Obra ativa" e a mesma lista real de obras.
*/
(function () {
  const CHAVE_OBRA_ATIVA = "controleObra.obraAtiva.v1";

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

  function obterAtivaId() {
    try { return localStorage.getItem(CHAVE_OBRA_ATIVA) || ""; } catch (_) { return ""; }
  }

  function definirAtiva(id) {
    try { localStorage.setItem(CHAVE_OBRA_ATIVA, id || ""); } catch (_) { /* sem persistência */ }
  }

  function listar() {
    return chamarApi("/obras");
  }

  function obter(id) {
    return chamarApi(`/obras/${encodeURIComponent(id)}`);
  }

  function criar(dados) {
    return chamarApi("/obras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
  }

  function atualizar(id, dados) {
    return chamarApi(`/obras/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
  }

  function remover(id) {
    return chamarApi(`/obras/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  function escaparTexto(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * Monta (e mantém atualizado) um seletor de "Obra ativa" dentro do
   * elemento indicado. Qualquer tela pode chamar isso para deixar visível
   * e trocável qual Obra está em uso — sem duplicar a lógica em cada
   * módulo (EAP, Mapa, Empreita, Pagamentos).
   *
   * options.onChange(obraId) é chamado sempre que o usuário troca de Obra
   * (tipicamente para recarregar a tela com os dados da nova Obra).
   */
  async function montarSeletorObraAtiva(elementoOuId, options = {}) {
    const raiz = typeof elementoOuId === "string" ? document.getElementById(elementoOuId) : elementoOuId;
    if (!raiz) return;

    raiz.innerHTML = `<span class="atenuado">Carregando obras…</span>`;

    let obras = [];
    try {
      obras = await listar();
    } catch (err) {
      raiz.innerHTML = `<span class="atenuado">Não foi possível carregar as obras.</span>`;
      return;
    }

    if (!obras.length) {
      raiz.innerHTML = `
        <span class="atenuado">Nenhuma obra cadastrada.</span>
        <a href="./obras.html" class="botao-link">Criar obra</a>
      `;
      return;
    }

    const ativaId = obterAtivaId();
    const existeAtiva = obras.some((o) => o.id === ativaId);

    raiz.innerHTML = `
      <label class="seletor-obra-ativa">
        <span class="atenuado pequeno">Obra:</span>
        <select id="seletorObraAtivaGlobal">
          <option value="">(nenhuma selecionada)</option>
          ${obras.map((o) => `
            <option value="${escaparTexto(o.id)}" ${o.id === ativaId ? "selected" : ""}>
              ${escaparTexto(o.obra_nome || o.map_number || "(sem nome)")}
            </option>
          `).join("")}
        </select>
      </label>
    `;

    if (!existeAtiva) definirAtiva("");

    const select = raiz.querySelector("#seletorObraAtivaGlobal");
    select?.addEventListener("change", () => {
      definirAtiva(select.value || "");
      if (typeof options.onChange === "function") options.onChange(select.value || "");
    });
  }

  window.obrasApi = {
    listar,
    obter,
    criar,
    atualizar,
    remover,
    obterAtivaId,
    definirAtiva,
    montarSeletorObraAtiva,
    chamarApi,
  };
})();
