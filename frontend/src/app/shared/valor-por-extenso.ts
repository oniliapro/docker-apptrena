/**
 * Valor em reais por extenso (14/10/2026, pedido do Lucas): função
 * `TEXTO(x)` das fórmulas dos modelos de documento (`{{=TEXTO(x+y)}}`) —
 * R$ 15.542,75 vira "quinze mil quinhentos e quarenta e dois reais e setenta
 * e cinco centavos". Arredonda pra 2 casas antes (só lê até o centavo).
 *
 * Regra do "e" entre as classes (milhar, milhão…): só antes da ÚLTIMA classe
 * não nula, e só quando ela é menor que 100 ou uma centena redonda — "mil e
 * cem", "um milhão e duzentos mil", mas "quinze mil quinhentos e quarenta e
 * dois" (é o formato do exemplo do Lucas, sem vírgula entre as classes).
 * Milhão/bilhão redondo leva "de": "dois milhões de reais".
 */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Classes acima da unidade: [singular, plural]. */
const CLASSES: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
];

/** 1 a 999 por extenso ("cento e vinte e três"; 100 é "cem"). */
function ate999(n: number): string {
  if (n === 100) return 'cem';
  const partes: string[] = [];
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  if (centena) partes.push(CENTENAS[centena]);
  if (resto >= 20) {
    const unidade = resto % 10;
    partes.push(unidade ? `${DEZENAS[Math.floor(resto / 10)]} e ${UNIDADES[unidade]}` : DEZENAS[Math.floor(resto / 10)]);
  } else if (resto >= 10) {
    partes.push(DEZ_A_DEZENOVE[resto - 10]);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(' e ');
}

/** Inteiro positivo por extenso ("quinze mil quinhentos e quarenta e dois"). */
function inteiroPorExtenso(n: number): string {
  const grupos: number[] = []; // do menor (unidades) pro maior
  for (let resto = n; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);

  const partes: Array<{ texto: string; valor: number }> = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const valor = grupos[i];
    if (!valor) continue;
    let texto: string;
    if (i === 0) texto = ate999(valor);
    else if (i === 1) texto = valor === 1 ? 'mil' : `${ate999(valor)} mil`;
    else texto = `${ate999(valor)} ${valor === 1 ? CLASSES[i][0] : CLASSES[i][1]}`;
    partes.push({ texto, valor });
  }

  return partes
    .map((parte, i) => {
      if (i === 0) return parte.texto;
      const ultima = i === partes.length - 1;
      return (ultima && (parte.valor < 100 || parte.valor % 100 === 0) ? ' e ' : ' ') + parte.texto;
    })
    .join('');
}

/** Maior valor aceito (999 trilhões e uns quebrados) — acima disso devolve vazio. */
const LIMITE = 1e15;

export function valorPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || Math.abs(valor) >= LIMITE) return '';

  // `toPrecision(15)` tira o resto de ponto flutuante antes de arredondar
  // (15542.745 * 100 = 1554274.4999999998, que arredondaria pra baixo).
  const centavosTotais = Math.round(Number((Math.abs(valor) * 100).toPrecision(15)));
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const partes: string[] = [];
  if (reais > 0) {
    const milhaoRedondo = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${milhaoRedondo ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (!partes.length) return 'zero reais';

  return (valor < 0 ? 'menos ' : '') + partes.join(' e ');
}
