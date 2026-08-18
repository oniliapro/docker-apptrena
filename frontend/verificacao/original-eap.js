/**
 * Shim para rodar a engine ORIGINAL da EAP no Node, sem alterar os
 * arquivos do app vanilla.
 *
 * Os arquivos de js/eap/ dependem de globais compartilhadas (dados,
 * TIPOS_CUSTO, itensEap, cabecalhoObra) e de funções espalhadas entre
 * 01-data, 02-state-utils e 03-engine. Em vez de carregá-los como
 * módulos — o que não funcionaria, porque declaram `const` no escopo
 * global — são lidos como texto e avaliados juntos, no mesmo escopo.
 * Depois só as partes que não dependem do DOM são expostas.
 */
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '../../_arquivo/Aplicativo-Lucas-versao-antiga/js/eap');
const ler = (arquivo) => fs.readFileSync(path.join(base, arquivo), 'utf8');

// 02-state-utils tem funções de DOM/persistência que não interessam e
// quebrariam fora do browser; cortamos o arquivo antes delas.
const stateUtils = ler('02-state-utils.js').split('/* ===== PERSISTÊNCIA ===== */')[0];

const codigo = [
  'const window = { crypto: cryptoDoNode, localStorage: null };',
  ler('01-data.js'),
  stateUtils,
  ler('03-engine.js'),
  `return {
     calcular(itens, header) {
       itensEap = itens.map(normalizarItemEap);
       cabecalhoObra = normalizarCabecalho(header);
       aplicarNumeracaoAutomaticaEap();
       const cache = calcularCacheBaseOrcado();
       return { itens: itensEap, cabecalho: cabecalhoObra, cache };
     },
     somarGrupo(indice, cache) { return somarDescendentesDoGrupo(indice, cache); },
     normalizarItemEap,
     normalizarCabecalho,
   };`,
].join('\n');

// `new Function` cria escopo próprio, sem acesso a require — o crypto
// entra como parâmetro.
module.exports = new Function('cryptoDoNode', codigo)(require('crypto').webcrypto);
