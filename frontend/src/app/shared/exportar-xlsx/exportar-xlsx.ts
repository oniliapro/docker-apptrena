/**
 * Exportação genérica de uma lista pra planilha Excel (31/08/2026,
 * pedido do Lucas) — pras telas de lista simples (uma linha por
 * registro, sem cálculo próprio), como Pagamentos geral e a lista de
 * Obras. Telas com números CALCULADOS de verdade (EAP, Mapa, Empreita)
 * têm cada uma seu próprio módulo `*-exportar.ts`, porque cada uma
 * precisa reaproveitar sua própria engine de cálculo — aqui é só
 * "pegar o que já está na tela e jogar numa planilha".
 *
 * Roda no navegador (ExcelJS), sem passar pelo backend — mesma
 * arquitetura das outras exportações do sistema.
 */

import ExcelJS from 'exceljs';

const COR_CABECALHO = 'FFECEEE8';
const COR_ZEBRA = 'FFF8F8F6';

export interface ColunaExportXlsx {
  header: string;
  key: string;
  width?: number;
  /** Formato numérico do Excel (ex.: `'#,##0.00'`, `'dd/mm/yyyy'`). */
  numFmt?: string;
}

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
 * `linhas` é um array de objetos simples, cada chave batendo com a `key`
 * de alguma coluna — exatamente o shape que `worksheet.addRow()` do
 * ExcelJS já aceita quando as colunas têm `key`.
 */
export async function exportarTabelaXlsx(
  nomeAba: string,
  colunas: ColunaExportXlsx[],
  linhas: Record<string, unknown>[],
  nomeArquivo: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet(nomeAba);
  planilha.columns = colunas.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));

  planilha.getRow(1).eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  planilha.views = [{ state: 'frozen', ySplit: 1 }];

  linhas.forEach((dados, i) => {
    const linha = planilha.addRow(dados);
    colunas.forEach((c) => {
      if (c.numFmt) linha.getCell(c.key).numFmt = c.numFmt;
    });
    if (i % 2 === 1) {
      linha.eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(buffer as ArrayBuffer, nomeArquivo);
}
