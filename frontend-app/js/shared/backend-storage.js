(function () {
  const fallback = window.localStorage;

  const CHAVE_API_BASE = "controleObra.apiBaseOverride";

  // Em produção (qualquer domínio que não seja localhost/127.0.0.1), a API
  // fica no mesmo domínio/origem, em /api — o nginx do servidor já repassa
  // pra dentro do container certo. Isso evita depender do "?api=..." na URL
  // pra funcionar em qualquer navegador/celular/aba nova.
  const API_BASE_PADRAO = (function () {
    const host = String(location.hostname || "");
    if (host === "localhost" || host === "127.0.0.1" || host === "") {
      return "http://localhost:8088/api";
    }
    return location.origin + "/api";
  })();

  // Permite abrir um link com ?api=https://xxxx.exemplo.com/api embutido
  // (usado pro túnel temporário do Cloudflare, ou futuramente pro domínio
  // de produção) — guarda no localStorage e passa a usar em toda chamada
  // seguinte, mesmo navegando pra outras páginas.
  (function aplicarApiBaseDaUrl() {
    try {
      const params = new URLSearchParams(location.search);
      const apiParam = params.get("api");
      if (apiParam) fallback.setItem(CHAVE_API_BASE, apiParam);
    } catch (_) {}
  })();

  function obterApiBase() {
    try { return fallback.getItem(CHAVE_API_BASE) || API_BASE_PADRAO; } catch (_) { return API_BASE_PADRAO; }
  }

  // URL da API Laravel. Padrão é o ambiente local (docker-crtlobras); pode
  // ser sobrescrita via ?api=... na URL (ver aplicarApiBaseDaUrl acima).
  const API_BASE = obterApiBase();

  const CHAVE_TOKEN = "controleObra.auth.token";
  const CHAVE_USUARIO = "controleObra.auth.user";
  const paginaLogin = "./login.html";

  let backendAtivo = true;
  let logFalhaFeito = false;

  function registrarFalhaBackend() {
    if (logFalhaFeito) return;
    logFalhaFeito = true;
    console.warn("[controleObraStorage] API indisponível. Usando localStorage.");
  }

  function nomeArquivoAtual() {
    return String(location.pathname || "").split("/").pop() || "";
  }

  function getToken() {
    try { return fallback.getItem(CHAVE_TOKEN) || ""; } catch (_) { return ""; }
  }

  function setToken(token, usuario) {
    try {
      fallback.setItem(CHAVE_TOKEN, token || "");
      if (usuario) fallback.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    } catch (_) {}
  }

  function limparToken() {
    try {
      fallback.removeItem(CHAVE_TOKEN);
      fallback.removeItem(CHAVE_USUARIO);
    } catch (_) {}
  }

  function irParaLogin() {
    if (nomeArquivoAtual() === "login.html") return;
    location.href = paginaLogin;
  }

  function requestApiSync(method, path, queryParams, body) {
    const qs = new URLSearchParams(queryParams || {}).toString();
    const url = `${API_BASE}${path}${qs ? `?${qs}` : ""}`;

    const xhr = new XMLHttpRequest();
    xhr.open(method, url, false);
    xhr.setRequestHeader("Accept", "application/json");
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (body != null) xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(body != null ? JSON.stringify(body) : null);

    if (xhr.status === 401) {
      limparToken();
      irParaLogin();
      return { ok: false, status: 401, payload: null };
    }

    if (xhr.status < 200 || xhr.status >= 300) {
      return { ok: false, status: xhr.status, payload: null };
    }

    let payload = {};
    if (xhr.responseText) {
      try {
        payload = JSON.parse(xhr.responseText);
      } catch (_) {
        return { ok: false, status: xhr.status, payload: null };
      }
    }

    if (payload && payload.ok === false) {
      return { ok: false, status: xhr.status, payload };
    }

    return { ok: true, status: xhr.status, payload };
  }

  /* ===== AUTENTICAÇÃO ===== */
  async function login(email, password) {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload.token) {
        const mensagem =
          (payload.errors && Object.values(payload.errors)[0]?.[0]) ||
          payload.message ||
          "Email ou senha incorretos.";
        return { ok: false, mensagem };
      }

      setToken(payload.token, payload.user);
      backendAtivo = true;
      logFalhaFeito = false;
      return { ok: true, usuario: payload.user };
    } catch (_) {
      return { ok: false, mensagem: "Não foi possível falar com o servidor." };
    }
  }

  async function registrar(nomeEmpresa, nome, email, password) {
    try {
      const res = await fetch(`${API_BASE}/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ empresa: nomeEmpresa, name: nome, email, password }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !payload.token) {
        const mensagem =
          (payload.errors && Object.values(payload.errors)[0]?.[0]) ||
          payload.message ||
          "Não foi possível criar a conta.";
        return { ok: false, mensagem };
      }

      setToken(payload.token, payload.user);
      backendAtivo = true;
      logFalhaFeito = false;
      return { ok: true, usuario: payload.user };
    } catch (_) {
      return { ok: false, mensagem: "Não foi possível falar com o servidor." };
    }
  }

  function logout() {
    try {
      requestApiSync("POST", "/logout", null, {});
    } catch (_) {}
    limparToken();
    irParaLogin();
  }

  function usuarioAtual() {
    try {
      const raw = fallback.getItem(CHAVE_USUARIO);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  window.controleObraAuth = { login, registrar, logout, getToken, usuarioAtual };
  window.controleObraApiBase = API_BASE;

  // Toda página (exceto login e cadastro) exige token antes de continuar.
  const paginasPublicas = ["login.html", "cadastro.html"];
  if (!paginasPublicas.includes(nomeArquivoAtual()) && !getToken()) {
    irParaLogin();
  }

  /* ===== STORAGE (chave/valor) ===== */
  function backendGet(key) {
    return requestApiSync("GET", "/storage", { key }, null);
  }

  function backendSet(key, value) {
    return requestApiSync("POST", "/storage", null, { key, value });
  }

  function backendRemove(key) {
    return requestApiSync("DELETE", "/storage", { key }, null);
  }

  function backendClearPrefix(prefix) {
    return requestApiSync("POST", "/storage", null, { action: "clear-prefix", prefix });
  }

  function getItem(key) {
    const k = String(key || "");
    if (!k) return null;

    if (!backendAtivo) {
      try { return fallback.getItem(k); } catch (_) { return null; }
    }

    try {
      const res = backendGet(k);
      if (!res.ok) throw new Error("backend_get_failed");

      const value = Object.prototype.hasOwnProperty.call(res.payload || {}, "value")
        ? res.payload.value
        : null;

      if (value === null || value === undefined) {
        const local = fallback.getItem(k);
        if (local !== null && local !== undefined) {
          const migrate = backendSet(k, String(local));
          if (migrate.ok) return String(local);
        }
        return null;
      }

      const txt = String(value);
      try { fallback.setItem(k, txt); } catch (_) {}
      return txt;
    } catch (_) {
      backendAtivo = false;
      registrarFalhaBackend();
      try { return fallback.getItem(k); } catch (_) { return null; }
    }
  }

  function setItem(key, value) {
    const k = String(key || "");
    if (!k) return;
    const txt = String(value ?? "");

    try { fallback.setItem(k, txt); } catch (_) {}

    if (!backendAtivo) return;

    try {
      const res = backendSet(k, txt);
      if (!res.ok) throw new Error("backend_set_failed");
    } catch (_) {
      backendAtivo = false;
      registrarFalhaBackend();
    }
  }

  function removeItem(key) {
    const k = String(key || "");
    if (!k) return;

    try { fallback.removeItem(k); } catch (_) {}

    if (!backendAtivo) return;

    try {
      const res = backendRemove(k);
      if (!res.ok) throw new Error("backend_remove_failed");
    } catch (_) {
      backendAtivo = false;
      registrarFalhaBackend();
    }
  }

  function clearPrefix(prefix = "controleObra.") {
    const p = String(prefix || "");
    try {
      const keys = [];
      for (let i = 0; i < fallback.length; i++) {
        const k = fallback.key(i);
        if (!k) continue;
        if (!p || k.startsWith(p)) keys.push(k);
      }
      keys.forEach((k) => fallback.removeItem(k));
    } catch (_) {}

    if (!backendAtivo) return;

    try {
      const res = backendClearPrefix(p || "controleObra.");
      if (!res.ok) throw new Error("backend_clear_failed");
    } catch (_) {
      backendAtivo = false;
      registrarFalhaBackend();
    }
  }

  window.controleObraStorage = {
    getItem,
    setItem,
    removeItem,
    clearPrefix,
    isBackendAtivo() { return backendAtivo; },
  };
})();
