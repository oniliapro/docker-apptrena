/**
 * Shim para rodar a engine ORIGINAL do Mapa no Node.
 *
 * js/mapa/03-engine.js opera sobre as globais `fornecedores`, `itens` e
 * `modoManual`, e depende de utilitários de 02-state-utils.js — que por
 * sua vez toca no DOM logo no carregamento. Em vez de carregar o arquivo
 * inteiro, declaramos aqui só as globais e as poucas funções de que a
 * engine precisa, e avaliamos a engine no mesmo escopo.
 */
const fs = require('fs');
const path = require('path');

const engine = fs.readFileSync(
  path.resolve(__dirname, '../../_arquivo/Aplicativo-Lucas-versao-antiga/js/mapa/03-engine.js'),
  'utf8',
);

const codigo = `
  let fornecedores = [];
  let itens = [];
  let modoManual = false;

  ${engine}

  return {
    definirEstado(f, i, m) { fornecedores = f; itens = i; modoManual = !!m; },
    obterTaxaImposto,
    calcularBaseItemPorFornecedor,
    calcularTotalItemPorFornecedor,
    calcularImpostoItemPorFornecedor,
    obterVencedorAutomaticoPorItem,
    obterVencedorEfetivoPorItem,
    obterAlocacoesEfetivasEstadoAtual,
    obterAlocacoesAutomaticasEstadoAtual,
    calcularNotasPorFornecedorDeAlocacoes,
    calcularFracionadoPorFornecedor,
    calcularIntegralPorFornecedor,
  };
`;

module.exports = new Function(codigo)();
