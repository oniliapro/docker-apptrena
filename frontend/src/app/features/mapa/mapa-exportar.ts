/**
 * Exportação do Mapa de Cotação pra planilha Excel (31/08/2026, pedido do
 * Lucas) — mesma arquitetura de `eap-exportar.ts`: roda no navegador
 * (ExcelJS), sem passar pelo backend, reaproveitando os cálculos que já
 * existem em `mapa-engine.ts`.
 *
 * Três abas: "Itens" (a comparação item a item, preço de cada fornecedor
 * e quem venceu), "Resumo por fornecedor" (Itens/Frete/Desconto/Markup/
 * Total de cada nota, mesmos números do painel "Detalhe por fornecedor"
 * da tela) e "Comparação de cenários" (01/09/2026, pedido do Lucas: deixar
 * explícita a compra recomendada — as mesmas 5 linhas do painel
 * "Comparação de cenários" da tela, com o vencedor marcado).
 */

import ExcelJS from 'exceljs';

import { TIPOS_CUSTO } from '../eap/eap.models';
import { calcularTotalItem, obterVencedorEfetivo, rotuloFornecedor } from './mapa-engine';
import { Fornecedor, ItemMapa, NotaFornecedor, TotaisNotas } from './mapa.models';

const COR_CABECALHO = 'FFECEEE8';
const COR_ZEBRA = 'FFF8F8F6';
const COR_VENCEDOR = 'FFDCF3E4';

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

function rotuloTipo(chave: string): string {
  return TIPOS_CUSTO.find((t) => t.chave === chave)?.rotulo ?? '';
}

/** Uma linha da "Comparação de cenários" — mesmo shape de `MapaStore.cenarios()`. */
export interface CenarioMapa {
  rotulo: string;
  valor: number;
  disponivel: boolean;
  vencedor: boolean;
}

/** Botão "Exportar Excel" de `mapa.html`. */
export async function exportarMapaXlsx(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  notas: { bySupplier: NotaFornecedor[]; totals: TotaisNotas },
  modoManual: boolean,
  cenarios: CenarioMapa[],
  mapaId: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // ---- Aba 1: Itens ----
  const abaItens = workbook.addWorksheet('Itens');
  abaItens.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Descrição', key: 'desc', width: 38 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Qtde', key: 'qtde', width: 10 },
    { header: 'Un.', key: 'unid', width: 8 },
    { header: 'Etapa', key: 'etapa', width: 24 },
    ...fornecedores.flatMap((f, i) => [
      { header: `${rotuloFornecedor(fornecedores, i)} — Unit. (R$)`, key: `unit_${i}`, width: 18 },
      { header: `${rotuloFornecedor(fornecedores, i)} — Total (R$)`, key: `total_${i}`, width: 18 },
    ]),
    { header: 'Vencedor', key: 'vencedor', width: 20 },
    { header: 'Total vencedor (R$)', key: 'totalVencedor', width: 18 },
  ];

  const cabecalhoItens = abaItens.getRow(1);
  cabecalhoItens.eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  abaItens.views = [{ state: 'frozen', ySplit: 1 }];

  itens.forEach((item, i) => {
    const vencedor = obterVencedorEfetivo(item, fornecedores, modoManual);

    const linha = abaItens.addRow({
      num: i + 1,
      desc: item.desc,
      tipo: rotuloTipo(item.tipo),
      qtde: item.qtde || '',
      unid: item.unid,
      etapa: item.etapa,
      ...Object.fromEntries(
        fornecedores.flatMap((_, si) => {
          const unit = Number(item.unit?.[si]) || 0;
          return [
            [`unit_${si}`, unit || ''],
            [`total_${si}`, unit > 0 ? calcularTotalItem(item, si, fornecedores) : ''],
          ];
        }),
      ),
      vencedor: vencedor ? rotuloFornecedor(fornecedores, vencedor.indice) : '',
      totalVencedor: vencedor ? vencedor.total : '',
    });

    if (i % 2 === 1) {
      linha.eachCell((celula) => {
        if (!celula.fill) celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } };
      });
    }
    if (vencedor) {
      const colunaVencedor = 6 + fornecedores.length * 2 + 1;
      linha.getCell(colunaVencedor).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VENCEDOR } };
      linha.getCell(colunaVencedor + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VENCEDOR } };
    }
  });

  // ---- Aba 2: Resumo por fornecedor ----
  const abaResumo = workbook.addWorksheet('Resumo por fornecedor');
  abaResumo.columns = [
    { header: 'Fornecedor', key: 'fornecedor', width: 24 },
    { header: 'Itens (R$)', key: 'itens', width: 16 },
    { header: 'Frete (R$)', key: 'frete', width: 14 },
    { header: 'Desconto (R$)', key: 'desconto', width: 14 },
    { header: 'Markup (R$)', key: 'markup', width: 14 },
    { header: 'Total (R$)', key: 'total', width: 16 },
  ];
  abaResumo.getRow(1).eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });

  notas.bySupplier.forEach((nota, i) => {
    if (!nota.used) return;
    abaResumo.addRow({
      fornecedor: rotuloFornecedor(fornecedores, i),
      itens: nota.itensBase,
      frete: nota.frete,
      desconto: nota.desconto ? -nota.desconto : 0,
      markup: nota.impostoNota,
      total: nota.totalNota,
    });
  });

  const linhaTotalResumo = abaResumo.addRow({
    fornecedor: 'TOTAL',
    itens: notas.totals.itensBase,
    frete: notas.totals.frete,
    desconto: notas.totals.desconto ? -notas.totals.desconto : 0,
    markup: notas.totals.impostoNota,
    total: notas.totals.totalNota,
  });
  linhaTotalResumo.eachCell((celula) => {
    celula.font = { bold: true };
    celula.border = { top: { style: 'thin' } };
  });

  // ---- Aba 3: Comparação de cenários ----
  const abaCenarios = workbook.addWorksheet('Comparação de cenários');
  abaCenarios.columns = [
    { header: 'Cenário', key: 'rotulo', width: 36 },
    { header: 'Valor (R$)', key: 'valor', width: 16 },
    { header: 'Disponível', key: 'disponivel', width: 12 },
    { header: 'Recomendado', key: 'vencedor', width: 14 },
  ];
  abaCenarios.getRow(1).eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });

  cenarios.forEach((cenario) => {
    const linha = abaCenarios.addRow({
      rotulo: cenario.rotulo,
      valor: cenario.disponivel ? cenario.valor : '',
      disponivel: cenario.disponivel ? 'Sim' : 'Não',
      vencedor: cenario.vencedor ? '🏆 Recomendado' : '',
    });
    if (cenario.vencedor) {
      linha.eachCell((celula) => {
        celula.font = { bold: true };
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_VENCEDOR } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(buffer as ArrayBuffer, `mapa-${mapaId}.xlsx`);
}
