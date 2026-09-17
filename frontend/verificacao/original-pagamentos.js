/**
 * Shim mínimo de browser para carregar o util ORIGINAL do app vanilla
 * dentro do Node, sem alterar uma linha do arquivo original.
 */
const path = require('path');

global.window = global;
global.crypto = require('crypto').webcrypto;
global.window.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
};

require(path.resolve(__dirname, '../../_arquivo/Aplicativo-Lucas-versao-antiga/js/shared/pagamentos-utils.js'));

module.exports = global.window.pagamentosUtil;
