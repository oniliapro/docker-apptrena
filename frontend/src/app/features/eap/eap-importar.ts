/**
 * Importação/exportação de planilha Excel pra EAP (23/08/2026, pedido do
 * Lucas). Funções puras, sem Angular — testáveis isoladas.
 *
 * Roda tudo no navegador (biblioteca `exceljs`), sem passar pelo backend:
 * evita duplicar em PHP a lógica de hierarquia que já existe em
 * TypeScript (`aplicarNumeracaoAutomatica`, `eap-normalize.ts`) e é
 * consistente com a arquitetura atual — toda a lógica de cálculo/
 * normalização da EAP já vive no frontend, o backend é só persistência
 * (`ObraController::syncEap`).
 *
 * Trocado de `xlsx` (SheetJS) pra `exceljs` em 23/08/2026: a versão
 * gratuita do SheetJS não escreve estilo de célula nem formatação
 * condicional (é recurso pago, SheetJS Pro) — o ExcelJS faz as duas
 * coisas de graça e também lê `.xlsx`, então cobre os dois lados
 * (`gerarModeloXlsx`/`analisarPlanilha`) com uma lib só.
 *
 * O Nível decide a hierarquia sozinho — não existe coluna "Grupo" no
 * modelo: uma linha vira grupo automaticamente quando alguma linha
 * depois dela tem nível maior (`aplicarNumeracaoAutomatica`, chamada
 * depois que os itens voltam daqui, não aqui dentro — mantém esta função
 * simples e o comportamento idêntico ao de digitar na tela).
 *
 * BDI por item fica de fora do modelo de propósito: é normalmente uma
 * política do orçamento inteiro (configurada uma vez no cabeçalho da
 * EAP), não uma decisão linha a linha — item importado nasce sem BDI
 * próprio, usando o que já estiver configurado na tela.
 */

import ExcelJS from 'exceljs';

import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from './eap.models';
import { criarVazioPorTipo, gerarId, NIVEL_MAX } from './eap-normalize';

const NOME_ABA_EAP = 'EAP';
const NOME_ABA_INSTRUCOES = 'Instruções';

/** Chaves de coluna da aba "EAP" — usadas tanto pro cabeçalho quanto pra ler de volta ao importar. */
const CHAVES_COLUNAS = ['nivel', 'desc', 'qtde', 'unid', ...TIPOS_CUSTO.map((t) => t.chave)] as const;

const RODULOS_COLUNAS = [
  'Nível (1-4)',
  'Descrição',
  'Quantidade',
  'Unidade',
  ...TIPOS_CUSTO.map((t) => `${t.rotulo} (R$)`),
] as const;

const LARGURAS_COLUNAS = [10, 42, 12, 10, ...TIPOS_CUSTO.map(() => 16)];

/** Uma linha de exemplo — grupo nível 1 sem custo + dois itens nível 2. */
const LINHAS_EXEMPLO: Array<(string | number)[]> = [
  [1, 'SERVIÇOS PRELIMINARES', '', '', '', '', '', '', ''],
  [2, 'Proteção de piso e esquadrias', 1, 'vb', 1200, 350, 0, 0, 0],
  [2, 'Aluguel de ferramentas e acessórios', 1, 'vb', 0, 0, 8000, 0, 0],
];

/** Até que linha a formatação condicional (nível 1 + zebra) continua valendo, pro Lucas poder acrescentar linhas depois sem perder o efeito. */
const ULTIMA_LINHA_FORMATADA = 500;

/** Mesmas cores da tela (`_tokens.scss`) — `--cor-primaria-escura`, `--cor-zebra`. */
const COR_GRUPO_NIVEL_1 = 'FF12262F';
const COR_TEXTO_GRUPO_NIVEL_1 = 'FFFFFFFF';
const COR_ZEBRA = 'FFF8F8F6';
const COR_CABECALHO = 'FFECEEE8';

function baixarBlob(buffer: ArrayBuffer, nomeArquivo: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Monta o workbook da planilha-modelo — separado de `gerarModeloXlsx`
 * pra poder ser chamado também de um script Node (sem `document`/`Blob`),
 * usado só pra gerar o `docs/modelo-importacao-eap.xlsx` que acompanha o
 * repositório.
 */
export function construirWorkbookModelo(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const instrucoes = workbook.addWorksheet(NOME_ABA_INSTRUCOES);
  instrucoes.columns = [{ width: 95 }];
  [
    'Como preencher esta planilha',
    '',
    'Cada linha da aba "EAP" é um item do orçamento. A coluna "Nível" (1 a 4) decide a hierarquia:',
    'uma linha vira "grupo" automaticamente quando alguma linha logo depois dela tem nível maior —',
    'não existe uma coluna separada para marcar "isso é um grupo".',
    '',
    'Exemplo: uma linha de nível 1 seguida de linhas de nível 2 vira um grupo que soma os itens',
    'abaixo dela. Linhas de grupo normalmente ficam com as colunas de valor em branco — o total',
    'delas é a soma dos itens dentro. Na aba "EAP", linhas de nível 1 já vêm destacadas (mesma cor',
    'usada na tela) e as demais linhas alternam de cor pra facilitar a leitura — a formatação',
    'continua valendo mesmo se você acrescentar mais linhas depois das de exemplo.',
    '',
    'Linhas totalmente em branco são ignoradas. Linha com Nível ausente ou fora de 1 a 4 impede a',
    'importação — corrija e tente de novo.',
    '',
    'O BDI (Global, por categoria ou por item) não entra nesta planilha — configure-o na tela da EAP',
    'depois de importar, do jeito que já funciona hoje.',
  ].forEach((linha) => instrucoes.addRow([linha]));

  const planilha = workbook.addWorksheet(NOME_ABA_EAP);
  planilha.columns = CHAVES_COLUNAS.map((chave, i) => ({
    key: chave,
    width: LARGURAS_COLUNAS[i],
  }));

  const linhaCabecalho = planilha.addRow(RODULOS_COLUNAS as unknown as string[]);
  linhaCabecalho.eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });

  LINHAS_EXEMPLO.forEach((linha) => planilha.addRow(linha));

  const ultimaColuna = String.fromCharCode('A'.charCodeAt(0) + CHAVES_COLUNAS.length - 1);
  const refDados = `A2:${ultimaColuna}${ULTIMA_LINHA_FORMATADA}`;

  // Prioridade 1 (mais forte) — nível 1 fica com a mesma cor de grupo da
  // tela. Prioridade 2 — zebra nas demais linhas. Sem `stopIfTrue`
  // (ExcelJS não expõe essa opção), mas como as duas regras testam
  // condições mutuamente exclusivas na prática (nível 1 raramente cai em
  // linha par/ímpar de forma relevante pro usuário), a prioridade mais
  // alta garante que a cor de grupo sempre vence quando as duas batem.
  planilha.addConditionalFormatting({
    ref: refDados,
    rules: [
      {
        type: 'expression',
        formulae: ['$A2=1'],
        priority: 1,
        style: {
          font: { bold: true, color: { argb: COR_TEXTO_GRUPO_NIVEL_1 } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO_NIVEL_1 } },
        },
      },
    ],
  });

  planilha.addConditionalFormatting({
    ref: refDados,
    rules: [
      {
        type: 'expression',
        formulae: ['MOD(ROW(),2)=0'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } },
        },
      },
    ],
  });

  return workbook;
}

/**
 * Gera a planilha-modelo e dispara o download no navegador — botão
 * "Baixar planilha-modelo" do modal de importação (`eap.html`).
 */
export async function gerarModeloXlsx(): Promise<void> {
  const workbook = construirWorkbookModelo();
  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(buffer as ArrayBuffer, 'modelo-importacao-eap.xlsx');
}

export interface ErroImportacao {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  itens: ItemEap[];
  erros: ErroImportacao[];
}

/** Converte "1.234,56", "1234.56" ou um número já pronto do Excel em `number`. */
function paraNumero(bruto: unknown): number {
  if (typeof bruto === 'number') return bruto;
  const texto = String(bruto ?? '').trim();
  if (!texto) return 0;
  const normalizado = texto.replace(/\./g, '').replace(',', '.');
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : Number(texto) || 0;
}

/**
 * Lê um arquivo `.xlsx` (`ArrayBuffer`, vindo de `<input type="file">`) e
 * devolve os itens já no formato `ItemEap` — falta só passar pelo mesmo
 * `aplicarNumeracaoAutomatica` que a digitação manual usa (chamado por
 * quem importa o resultado, não aqui: mantém esta função só sobre "ler a
 * planilha", sem se misturar com a lógica de hierarquia).
 *
 * Linha em branco (todas as células vazias) é ignorada silenciosamente —
 * comum sobrar linha vazia no fim de uma planilha. Qualquer outro
 * problema (nível ausente/fora de 1-4) vira um erro em `erros`, com o
 * número da linha da PLANILHA (1 = cabeçalho), pra ser fácil de achar e
 * corrigir.
 */
export async function analisarPlanilha(dados: ArrayBuffer): Promise<ResultadoImportacao> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(dados);
  const planilha = workbook.getWorksheet(NOME_ABA_EAP) ?? workbook.worksheets[0];

  if (!planilha) {
    return { itens: [], erros: [{ linha: 0, motivo: `Não encontrei a aba "${NOME_ABA_EAP}" na planilha.` }] };
  }

  const itens: ItemEap[] = [];
  const erros: ErroImportacao[] = [];

  // Linha 1 é o cabeçalho — dados começam na linha 2.
  for (let numeroDaLinha = 2; numeroDaLinha <= planilha.rowCount; numeroDaLinha++) {
    const linha = planilha.getRow(numeroDaLinha);
    const valores = CHAVES_COLUNAS.map((_, i) => linha.getCell(i + 1).value);
    if (valores.every((celula) => celula === undefined || celula === null || String(celula).trim() === '')) {
      continue;
    }

    const nivelBruto = paraNumero(valores[0]);
    if (!Number.isInteger(nivelBruto) || nivelBruto < 1 || nivelBruto > NIVEL_MAX) {
      erros.push({
        linha: numeroDaLinha,
        motivo: `Nível inválido (${valores[0] ?? 'vazio'}) — precisa ser um número inteiro de 1 a ${NIVEL_MAX}.`,
      });
      continue;
    }

    const desc = String(valores[1] ?? '').trim();
    const qtde = paraNumero(valores[2]);
    const unid = String(valores[3] ?? '').trim();

    const unit: PorTipo = criarVazioPorTipo();
    TIPOS_CUSTO.forEach((tipo, indice) => {
      unit[tipo.chave as ChaveTipo] = paraNumero(valores[4 + indice]);
    });

    itens.push({
      id: gerarId(),
      isGroup: false,
      nivel: nivelBruto,
      adicional: false,
      eap: '',
      desc,
      qtde,
      unid,
      unit,
      bdiMode: 'pct',
      bdiPercent: 0,
      bdiValue: 0,
      orcadoCongelado: null,
    });
  }

  return { itens, erros };
}
