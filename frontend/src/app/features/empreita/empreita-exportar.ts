/**
 * Exportação da Empreita pra planilha Excel (31/08/2026, pedido do
 * Lucas) — mesma arquitetura de `eap-exportar.ts`/`mapa-exportar.ts`:
 * roda no navegador (ExcelJS), sem passar pelo backend. Os números já
 * vêm calculados de fora (`EmpreitaStore.linhasEstendidas()`), a mesma
 * fonte que a tela usa — a planilha exportada bate exatamente com o que
 * está na tela.
 */

import ExcelJS from 'exceljs';

import { TotaisEmpreitaEstendida } from './empreita.models';

const COR_CABECALHO = 'FFECEEE8';
const COR_ZEBRA = 'FFF8F8F6';

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

/** Uma linha da planilha — já com o Tipo/Etapa traduzidos pra rótulo pelo chamador. */
export interface LinhaExportEmpreita {
  desc: string;
  tipo: string;
  etapa: string;
  qtdeContratada: number | null;
  contratoEmp: number | null;
  contratoReserva: number | null;
  orcado: number;
  acumulado: number;
  atual: number;
  avanco: number;
  pagar: number;
  reservar: number;
  jaPagoEmpreiteiro: number;
  jaPagoReserva: number;
  medido: number;
}

/** Botão "Exportar Excel" de `empreita.html`. */
export async function exportarEmpreitaXlsx(
  linhas: LinhaExportEmpreita[],
  totais: TotaisEmpreitaEstendida,
  empreitaId: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet('Empreita');

  planilha.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Serviço', key: 'desc', width: 34 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Etapa (EAP)', key: 'etapa', width: 26 },
    { header: 'Qtde. contratada', key: 'qtdeContratada', width: 16 },
    { header: 'Contrato — Empreiteiro (R$)', key: 'contratoEmp', width: 20 },
    { header: 'Contrato — Reserva (R$)', key: 'contratoReserva', width: 18 },
    { header: 'Orçado (R$)', key: 'orcado', width: 16 },
    { header: '% Acumulado', key: 'acumulado', width: 14 },
    { header: '% Atual', key: 'atual', width: 12 },
    { header: '% Avanço', key: 'avanco', width: 12 },
    { header: 'A pagar (R$)', key: 'pagar', width: 14 },
    { header: 'A reservar (R$)', key: 'reservar', width: 14 },
    { header: 'Anterior — Empreiteiro (R$)', key: 'jaPagoEmpreiteiro', width: 20 },
    { header: 'Anterior — Reserva (R$)', key: 'jaPagoReserva', width: 18 },
    { header: 'Medição (R$)', key: 'medido', width: 14 },
  ];

  planilha.getRow(1).eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  planilha.views = [{ state: 'frozen', ySplit: 1 }];

  linhas.forEach((linha, i) => {
    const row = planilha.addRow({
      num: i + 1,
      desc: linha.desc,
      tipo: linha.tipo,
      etapa: linha.etapa,
      qtdeContratada: linha.qtdeContratada || '',
      contratoEmp: linha.contratoEmp || '',
      contratoReserva: linha.contratoReserva || '',
      orcado: linha.orcado || '',
      acumulado: linha.acumulado ? linha.acumulado / 100 : 0,
      atual: linha.atual ? linha.atual / 100 : 0,
      avanco: linha.avanco ? linha.avanco / 100 : 0,
      pagar: linha.pagar || '',
      reservar: linha.reservar || '',
      jaPagoEmpreiteiro: linha.jaPagoEmpreiteiro || '',
      jaPagoReserva: linha.jaPagoReserva || '',
      medido: linha.medido || '',
    });

    ['acumulado', 'atual', 'avanco'].forEach((chave) => {
      row.getCell(chave).numFmt = '0.00%';
    });

    if (i % 2 === 1) {
      row.eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } };
      });
    }
  });

  const linhaTotal = planilha.addRow({
    desc: 'TOTAL',
    contratoEmp: totais.valorEmp || '',
    contratoReserva: totais.valorReserva || '',
    orcado: totais.orcadoTotal || '',
    pagar: totais.pagarEmp || '',
    reservar: totais.reservarPgto || '',
    jaPagoEmpreiteiro: totais.jaPagoEmpreiteiro || '',
    jaPagoReserva: totais.jaPagoReserva || '',
    medido: totais.medidoTotal || '',
  });
  linhaTotal.eachCell((celula) => {
    celula.font = { bold: true };
    celula.border = { top: { style: 'thin' } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(buffer as ArrayBuffer, `empreita-${empreitaId}.xlsx`);
}
