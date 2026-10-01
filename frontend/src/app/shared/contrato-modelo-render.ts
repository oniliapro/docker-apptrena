/**
 * Escapa um valor pra entrar com segurança dentro do HTML do modelo
 * (29/09/2026: o editor virou rico/visual — `conteudo` passou a ser HTML,
 * não mais texto puro — então um valor de variável com `&`, `<` etc.
 * (nome de obra, cliente...) precisa ser escapado pra não quebrar a marcação
 * nem virar injeção de HTML).
 */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Substitui variáveis `{{chave}}` no HTML de um modelo de contrato
 * (28/09/2026, itens 8/9) pelos valores já calculados de uma empreita/obra
 * específica. Puro — sem chamada de API. `ContratoImprimir` injeta o
 * resultado como HTML confiável (`[innerHTML]`), então cada valor é
 * escapado aqui antes de entrar no texto.
 *
 * Uma chave sem valor correspondente em `variaveis` é deixada como está
 * (`{{chave}}` visível no resultado) — mais fácil de notar um nome de
 * variável errado no modelo do que sumir a informação silenciosamente.
 */
export function preencherModeloContrato(conteudo: string, variaveis: Record<string, string>): string {
  return conteudo.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (correspondencia, chave: string) =>
    Object.prototype.hasOwnProperty.call(variaveis, chave) ? escaparHtml(variaveis[chave]) : correspondencia,
  );
}
