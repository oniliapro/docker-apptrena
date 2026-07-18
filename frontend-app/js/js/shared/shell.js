/* ===== SHELL (menu lateral + topo) ===== */

const CHAVE_UI_SHELL = "controleObra.ui.shell.v1";
const storageShell = window.controleObraStorage || window.localStorage;

function carregarUiShell() {
  try {
    const raw = storageShell.getItem(CHAVE_UI_SHELL);
    if (!raw) return { sidebarCollapsed: false };
    const parsed = JSON.parse(raw);
    return { sidebarCollapsed: Boolean(parsed?.sidebarCollapsed) };
  } catch (_) {
    return { sidebarCollapsed: false };
  }
}

function salvarUiShell(estado) {
  try {
    storageShell.setItem(CHAVE_UI_SHELL, JSON.stringify(estado));
  } catch (_) {
    // sem persistência
  }
}

function definirBarraLateralRecolhida(recolhida) {
  document.body.classList.toggle("barra-lateral-recolhida", Boolean(recolhida));
}

function iniciarAlternanciaBarraLateral(estadoShell) {
  const botao = document.getElementById("alternarBarraLateral");
  if (!botao) return;

  botao.addEventListener("click", () => {
    estadoShell.sidebarCollapsed = !estadoShell.sidebarCollapsed;
    definirBarraLateralRecolhida(estadoShell.sidebarCollapsed);
    salvarUiShell(estadoShell);
  });
}

function iniciarNavegacaoAtiva() {
  const aqui = String(location.pathname || "").split("/").pop() || "";
  const links = Array.from(document.querySelectorAll(".barra-lateral-nav a[href]"));
  links.forEach((a) => {
    const href = String(a.getAttribute("href") || "");
    const arquivo = href.split("/").pop();
    if (arquivo && arquivo === aqui) a.classList.add("active");
  });
}

function fecharMenuUsuario(botao, menu) {
  if (!botao || !menu) return;
  menu.classList.add("oculto");
  botao.setAttribute("aria-expanded", "false");
}

function alternarMenuUsuario(botao, menu) {
  if (!botao || !menu) return;
  const vaiAbrir = menu.classList.contains("oculto");
  menu.classList.toggle("oculto", !vaiAbrir);
  botao.setAttribute("aria-expanded", vaiAbrir ? "true" : "false");
}

function iniciarMenuUsuario() {
  const botao = document.getElementById("botaoMenuUsuario");
  const menu = document.getElementById("menuUsuario");
  if (!botao || !menu) return;

  botao.setAttribute("aria-haspopup", "menu");
  botao.setAttribute("aria-expanded", "false");

  botao.addEventListener("click", (e) => {
    e.stopPropagation();
    alternarMenuUsuario(botao, menu);
  });

  document.addEventListener("click", () => fecharMenuUsuario(botao, menu));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharMenuUsuario(botao, menu);
  });
}

function limparStorageControleObra() {
  if (typeof storageShell.clearPrefix === "function") {
    storageShell.clearPrefix("controleObra.");
    return;
  }

  try {
    const keys = [];
    for (let i = 0; i < storageShell.length; i++) {
      const k = storageShell.key(i);
      if (k && k.startsWith("controleObra.")) keys.push(k);
    }
    keys.forEach((k) => storageShell.removeItem(k));
  } catch (_) {
    // sem acesso
  }
}

// Ações globais (menu do topo)
function abrirConfiguracoes() {
  window.alert("Configurações: em breve.");
}

function sairAplicativo() {
  const ok = window.confirm("Sair da conta?");
  if (!ok) return;
  if (window.controleObraAuth && typeof window.controleObraAuth.logout === "function") {
    window.controleObraAuth.logout();
    return;
  }
  limparStorageControleObra();
  location.href = "./login.html";
}

// init
(() => {
  const estadoShell = carregarUiShell();
  definirBarraLateralRecolhida(estadoShell.sidebarCollapsed);
  iniciarAlternanciaBarraLateral(estadoShell);
  iniciarNavegacaoAtiva();
  iniciarMenuUsuario();
})();
