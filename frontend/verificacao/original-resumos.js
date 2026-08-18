/**
 * Shim para rodar as funções de rateio ORIGINAIS dos resumos do Mapa.
 *
 * 04b-summaries.js é quase todo renderização, e depende de muitas globais
 * de estado e de DOM. Extraímos por texto só as três funções puras de
 * rateio — as que fazem conta — e as avaliamos isoladamente.
 */
const fs = require('fs');
const path = require('path');

const fonte = fs.readFileSync(
  path.resolve(__dirname, '../../_arquivo/Aplicativo-Lucas-versao-antiga/js/mapa/04b-summaries.js'),
  'utf8',
);

/**
 * Recorta uma função pelo nome, contando chaves do corpo.
 *
 * A lista de parâmetros é pulada primeiro: estas funções usam
 * desestruturação (`function f({ a, b })`), e contar o `{` dos argumentos
 * faria o corpo fechar antes da hora.
 */
function recortarFuncao(texto, nome) {
  const inicio = texto.indexOf(`function ${nome}`);
  if (inicio < 0) throw new Error(`Função não encontrada: ${nome}`);

  // Anda até o ) que fecha a lista de parâmetros.
  let i = texto.indexOf('(', inicio);
  let parenteses = 0;
  for (; i < texto.length; i++) {
    if (texto[i] === '(') parenteses++;
    else if (texto[i] === ')') {
      parenteses--;
      if (parenteses === 0) break;
    }
  }

  // Daí em diante, conta as chaves do corpo.
  let profundidade = 0;
  let vendoCorpo = false;

  for (; i < texto.length; i++) {
    if (texto[i] === '{') {
      profundidade++;
      vendoCorpo = true;
    } else if (texto[i] === '}') {
      profundidade--;
      if (vendoCorpo && profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  throw new Error(`Função sem fechamento: ${nome}`);
}

const codigo = [
  recortarFuncao(fonte, 'obterEtapasDoItemParaResumo'),
  recortarFuncao(fonte, 'obterRateiosEtapaItem'),
  recortarFuncao(fonte, 'redistribuirPercentuaisEtapaPorFornecedor'),
  recortarFuncao(fonte, 'redistribuirPercentuaisFreteParticular'),
  `return {
     obterRateiosEtapaItem,
     redistribuirPercentuaisEtapaPorFornecedor,
     redistribuirPercentuaisFreteParticular,
   };`,
].join('\n');

module.exports = new Function(codigo)();
