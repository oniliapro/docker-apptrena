/* ===== DASHBOARD (página inicial) ===== */
(function () {
  function apiBase() {
    return window.controleObraApiBase || "http://localhost:8088/api";
  }

  function token() {
    return window.controleObraAuth ? window.controleObraAuth.getToken() : "";
  }

  async function chamarApi(path) {
    const headers = { Accept: "application/json" };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const resposta = await fetch(`${apiBase()}${path}`, { headers });
    if (!resposta.ok) throw new Error(`Erro ${resposta.status}`);
    return resposta.json();
  }

  function escaparTexto(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatarData(iso) {
    if (!iso) return "";
    const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
    return `${dia}/${mes}/${ano}`;
  }

  function diasRestantes(dataIso) {
    if (!dataIso) return null;
    const alvo = new Date(dataIso);
    const hoje = new Date();
    const diff = Math.ceil((alvo - hoje) / (1000 * 60 * 60 * 24));
    return diff;
  }

  async function carregarKpisObras() {
    try {
      const obras = await chamarApi("/obras");
      const total = obras.length;
      const confirmadas = obras.filter((o) => o.is_confirmed).length;
      const abertas = total - confirmadas;

      setTexto("kpiTotalObras", total);
      setTexto("kpiEapConfirmada", confirmadas);
      setTexto("kpiEapAberta", abertas);
    } catch (_) {
      setTexto("kpiTotalObras", "—");
      setTexto("kpiEapConfirmada", "—");
      setTexto("kpiEapAberta", "—");
    }
  }

  async function carregarAssinatura() {
    try {
      const payload = await chamarApi("/me");
      const empresa = payload?.user?.empresa;
      if (!empresa) { setTexto("kpiAssinatura", "—"); return; }

      const status = String(empresa.assinatura_status || "").toLowerCase();
      if (status === "trial") {
        const dias = diasRestantes(empresa.assinatura_valida_ate);
        setTexto("kpiAssinatura", dias !== null ? `${Math.max(dias, 0)}d` : "Trial");
        setTexto("kpiAssinaturaRotulo", "Dias restantes de teste");
      } else if (status === "ativa") {
        setTexto("kpiAssinatura", "Ativa");
        setTexto("kpiAssinaturaRotulo", "Assinatura");
      } else {
        setTexto("kpiAssinatura", empresa.assinatura_status || "—");
        setTexto("kpiAssinaturaRotulo", "Assinatura");
      }
    } catch (_) {
      setTexto("kpiAssinatura", "—");
    }
  }

  async function carregarDiarioRecente() {
    const alvo = document.getElementById("listaDiarioRecente");
    if (!alvo) return;
    try {
      const registros = await chamarApi("/diario?limite=8");
      if (!registros.length) {
        alvo.innerHTML = `<span class="atenuado">Nenhum registro de diário ainda. <a href="./diario-obra.html">Criar o primeiro</a>.</span>`;
        return;
      }
      alvo.innerHTML = registros.map((r) => `
        <div class="diario-recente-linha">
          <span class="diario-recente-data">${escaparTexto(formatarData(r.data))}</span>
          <span class="diario-recente-obra">${escaparTexto(r.obra?.obra_nome || "")}</span>
          <span>${escaparTexto(r.titulo || r.descricao || "")}</span>
        </div>
      `).join("");
    } catch (_) {
      alvo.innerHTML = `<span class="atenuado">Não foi possível carregar os registros.</span>`;
    }
  }

  function setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  carregarKpisObras();
  carregarAssinatura();
  carregarDiarioRecente();
})();
