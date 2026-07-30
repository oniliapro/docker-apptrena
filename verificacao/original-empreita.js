/**
 * Shim para rodar a engine ORIGINAL da Empreita no Node.
 *
 * 12-empreita-engine.js depende das globais `snapshotEap`,
 * `itensEmpreita`, `cabecalhoEmpreita`, `TIPOS_CUSTO_EMPREITA`,
 * `versaoEap` e de alguns utilitários de 11-empreita-state.js — que toca
 * no DOM ao carregar. Declaramos só o necessário e avaliamos a engine no
 * mesmo escopo.
 */
const fs = require('fs');
const path = require('path');

const engine = fs.readFileSync(
  path.resolve(__dirname, '../../_arquivo/Aplicativo-Lucas-versao-antiga/js/empreita/12-empreita-engine.js'),
  'utf8',
);

const codigo = `
  const TIPOS_CUSTO_EMPREITA = [
    { key: "material", label: "Material" },
    { key: "maoDeObra", label: "Mão de obra" },
    { key: "equipamento", label: "Equipamento" },
    { key: "outros", label: "Outros" },
    { key: "administracao", label: "Administração" },
  ];

  function criarVazioPorTipo() {
    const b = {};
    TIPOS_CUSTO_EMPREITA.forEach((t) => { b[t.key] = 0; });
    return b;
  }

  function normalizarPorTipo(raw) {
    const b = criarVazioPorTipo();
    TIPOS_CUSTO_EMPREITA.forEach((t) => { b[t.key] = Number(raw?.[t.key]) || 0; });
    return b;
  }

  function limitarPercentual(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  let snapshotEap = [];
  let itensEmpreita = [];
  let cabecalhoEmpreita = { typesIncluded: {} };
  let snapshotCabecalhoEap = { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
  let versaoEap = 0;

  ${engine}

  return {
    definirEstado(eap, itens, cabecalho, cabecalhoEap) {
      snapshotEap = eap;
      itensEmpreita = itens;
      cabecalhoEmpreita = cabecalho;
      snapshotCabecalhoEap = cabecalhoEap || { mapNumber: "", bdiMode: "pct", bdiPercent: 0, bdiValue: 0 };
      versaoEap++;
    },
    obterTiposIncluidos,
    obterOrcadoEapPorId,
    calcularLinhaEmpreita,
    calcularTotaisEmpreita,
  };
`;

module.exports = new Function(codigo)();
