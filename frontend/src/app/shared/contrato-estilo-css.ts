import { AlinhamentoEstilo, ContratoEstilo, ListaFormatoEstilo } from '../features/configuracoes/contrato-modelos/contrato-modelo.models';

/**
 * Gera o CSS de todos os estilos de uma empresa como um único bloco de
 * texto, injetado numa tag `<style>` tanto no editor quanto na tela de
 * impressão (30/09/2026) — a peça central da reformulação que o Lucas
 * pediu: "se eu alterar o formato do título 1 o texto não atualiza,
 * isso é um comportamento indesejado". Antes, aplicar um estilo COPIAVA
 * os valores como `style` inline no bloco (um retrato daquele momento);
 * agora aplicar um estilo só marca o bloco com a classe `.estilo-<id>`,
 * e a formatação de verdade vive AQUI, gerada de novo sempre que os
 * estilos mudam — editar um estilo depois atualiza todo texto que usa
 * ele, em qualquer lugar, sem precisar reabrir/tocar em cada trecho.
 *
 * A numeração automática (lista avulsa ou título hierárquico) também sai
 * daqui, via contadores CSS — não guarda posição nem recalcula nada em
 * JS: o navegador já recalcula contador CSS sozinho a cada edição,
 * então inserir/excluir/mover um título já renumera tudo more abaixo de
 * graça (era o comportamento mais complexo pedido, e sai "de graça" da
 * própria CSS).
 *
 * Compartilhado entre `ContratoModeloEditor` (o autor edita) e
 * `ContratoImprimir` (o PDF gerado) pra garantir que os dois enxergam
 * exatamente a mesma formatação —ančora do "WYSIWYG de verdade".
 */

const ALINHAMENTO_CSS: Record<AlinhamentoEstilo, string> = {
  esquerda: 'left',
  centro: 'center',
  direita: 'right',
  justificado: 'justify',
};

const LISTA_FORMATO_CSS: Record<ListaFormatoEstilo, string> = {
  numero: 'decimal',
  romano_minusculo: 'lower-roman',
  romano_maiusculo: 'upper-roman',
  letra_minuscula: 'lower-alpha',
  letra_maiuscula: 'upper-alpha',
};

const MAX_NIVEIS_TITULO = 7;

/** Nomes de contador CSS (`titulo1`..`titulo7`) pra numeração hierárquica de títulos, compartilhados por TODOS os estilos que participam da hierarquia. */
function nomeContadorNivel(nivel: number): string {
  return `titulo${nivel}`;
}

/** Contador de uma lista ordenada AVULSA — um por ESTILO (cada uma numera independente das outras). */
function nomeContadorLista(estiloId: string): string {
  return `lista-${estiloId.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

function seletorEstilo(estiloId: string): string {
  return `.estilo-${estiloId.replace(/[^a-zA-Z0-9-]/g, '')}`;
}

/**
 * Regra base — reseta o contador do NÍVEL 1 no início de cada "documento"
 * (o `.area-edicao` do editor, o `.corpo-contrato` do PDF). Só o nível 1:
 * os níveis 2-7 já são resetados pelo `counter-reset` que cada estilo de
 * título gera nele mesmo (ver `gerarCssEstilos`) — resetar esses níveis
 * AQUI TAMBÉM, redundante, quebra a renumeração entre grupos no Chromium
 * (o 1º título de nível 2 dentro do 2º título de nível 1 sai com o número
 * que faltava do 1º grupo, em vez de recomeçar do 1 — comportamento
 * confirmado testando de verdade, não é regra CSS documentada em lugar
 * óbvio).
 */
export function cssBaseContadores(seletorContainer: string): string {
  return `${seletorContainer} { counter-reset: ${nomeContadorNivel(1)}; }`;
}

export function gerarCssEstilos(estilos: readonly ContratoEstilo[]): string {
  const blocos: string[] = [];

  for (const estilo of estilos) {
    const seletor = seletorEstilo(estilo.id);
    const decls: string[] = [];

    if (estilo.fonte) decls.push(`font-family: ${estilo.fonte.replace(/[{}]/g, '')}`);
    if (estilo.tamanho_pt) decls.push(`font-size: ${estilo.tamanho_pt}pt`);
    if (estilo.cor) decls.push(`color: ${estilo.cor}`);
    if (estilo.negrito) decls.push('font-weight: 700');
    if (estilo.italico) decls.push('font-style: italic');
    if (estilo.sublinhado) decls.push('text-decoration: underline');
    decls.push(`text-align: ${ALINHAMENTO_CSS[estilo.alinhamento]}`);
    if (estilo.caixa_texto === 'maiuscula') decls.push('text-transform: uppercase');
    if (estilo.caixa_texto === 'cada_palavra') decls.push('text-transform: capitalize');

    if (estilo.eh_lista) decls.push(`counter-increment: ${nomeContadorLista(estilo.id)}`);
    if (estilo.nivel_titulo) {
      const nivel = estilo.nivel_titulo;
      decls.push(`counter-increment: ${nomeContadorNivel(nivel)}`);
      const filhos = [];
      for (let n = nivel + 1; n <= MAX_NIVEIS_TITULO; n++) filhos.push(nomeContadorNivel(n));
      if (filhos.length) decls.push(`counter-reset: ${filhos.join(' ')}`);
    }

    blocos.push(`${seletor} { ${decls.join('; ')}; }`);

    const numerado = estilo.eh_lista || !!estilo.nivel_titulo;

    // "Só a 1ª maiúscula" + numeração (`::before`) — achado testando de
    // verdade: por padrão, o Chromium conta o conteúdo do `::before`
    // (prefixo/número gerado) como parte da "primeira linha" pra fins de
    // `::first-letter`, então `text-transform: uppercase` mirava a
    // primeira letra do PREFIXO ("C" de "Cláusula", já maiúsculo por
    // natureza), não a do texto digitado — o efeito ficava invisível.
    // Fix: tirar o `::before` do fluxo inline normal com `float: left`
    // faz o `::first-letter` "enxergar" corretamente a primeira letra do
    // texto de verdade (técnica clássica de CSS pra separar um marcador
    // gerado do drop-cap do conteúdo real; testado isolado, com quebra de
    // linha normal). Só é seguro fazer isso com `alinhamento: esquerda`
    // — `float` ignora completamente `text-align`, então num título
    // centralizado/à direita o prefixo "escaparia" sempre pra esquerda
    // da caixa, independente do resto do texto (testado, quebra o
    // alinhamento visualmente). Nos outros alinhamentos, mantém o
    // `::before` inline normal e a opção continua sem efeito (limitação
    // conhecida, mesmo caso já avisado no formulário do estilo).
    const flutuarPrefixo = numerado && estilo.caixa_texto === 'primeira_maiuscula' && estilo.alinhamento === 'esquerda';

    if (estilo.caixa_texto === 'primeira_maiuscula' && (!numerado || flutuarPrefixo)) {
      blocos.push(`${seletor}::first-letter { text-transform: uppercase; }`);
    }

    const estiloPrefixo = flutuarPrefixo ? 'float: left; ' : '';

    if (estilo.eh_lista) {
      const formato = LISTA_FORMATO_CSS[estilo.lista_formato];
      blocos.push(
        `${seletor}::before { content: var(--lista-prefixo, '') counter(${nomeContadorLista(estilo.id)}, ${formato}) var(--lista-sufixo, '.'); font-weight: 700; ${estiloPrefixo}margin-right: 6px; }`,
      );
    } else if (estilo.nivel_titulo) {
      const cadeia = Array.from({ length: estilo.nivel_titulo }, (_, i) => `counter(${nomeContadorNivel(i + 1)})`).join(` "." `);
      blocos.push(
        `${seletor}::before { content: var(--lista-prefixo, '') ${cadeia} var(--lista-sufixo, ''); font-weight: 700; ${estiloPrefixo}margin-right: 6px; }`,
      );
    }
  }

  return blocos.join('\n');
}
