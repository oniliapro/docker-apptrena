/**
 * Exportação do Mapa de Cotação pra planilha Excel (31/08/2026, pedido do
 * Lucas) — mesma arquitetura de `eap-exportar.ts`: roda no navegador
 * (ExcelJS), sem passar pelo backend, reaproveitando os cálculos que já
 * existem em `mapa-engine.ts`.
 *
 * Quatro abas: "Itens" (a comparação item a item, preço de cada fornecedor
 * e quem venceu — 02/09/2026: ganhou 3 linhas extras ao final, Frete/
 * Desconto/Markup de cada fornecedor "como se fossem itens", pra fechar
 * exatamente com o total da nota sem precisar abrir outra aba), "Resumo
 * por fornecedor" (Itens/Frete/Desconto/Markup/Total de cada nota, mesmos
 * números do painel "Detalhe por fornecedor" da tela), "Rateio por etapa"
 * (02/09/2026, pedido do Lucas: de qual etapa sai cada real, mesma tabela
 * do painel "Rateio por etapa da obra" da tela — sem a coluna "SALDO APÓS
 * MAPA", que depende do orçado da EAP e não é resolvida aqui) e
 * "Comparação de cenários" (deixa explícita a compra recomendada).
 *
 * Frete/Desconto nas linhas extras de "Itens" usam o valor JÁ COM MARKUP
 * aplicado (`fornecedor.frete/desconto × (1 + imposto/100)`) — o mesmo
 * "valor real" que `Mapa.freteFinalComBdi()`/`descontoFinalComBdi()` já
 * mostravam na tela — porque o Total de cada item já inclui o markup dele
 * mesmo (`calcularTotalItem`); somando itens + essas duas linhas, o total
 * bate exatamente com `nota.totalNota` sem contar markup em dobro. Por
 * isso a linha "Markup" não soma nada em R$: mostra só a alíquota (%),
 * já refletida nos outros valores.
 */

import ExcelJS from 'exceljs';

import { TIPOS_CUSTO } from '../eap/eap.models';
import { calcularTotalItem, obterVencedorEfetivo, rotuloFornecedor } from './mapa-engine';
import { LinhaEtapa } from './mapa-resumo-etapas';
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

/** Frete/desconto já com o markup do fornecedor aplicado — mesma conta de `Mapa.freteFinalComBdi()`/`descontoFinalComBdi()`. */
function valorComMarkup(valor: number, imposto: number): number {
  return (Number(valor) || 0) * (1 + (Number(imposto) || 0) / 100);
}

/** Botão "Exportar Excel" de `mapa.html`. */
export async function exportarMapaXlsx(
  itens: ItemMapa[],
  fornecedores: Fornecedor[],
  notas: { bySupplier: NotaFornecedor[]; totals: TotaisNotas },
  modoManual: boolean,
  cenarios: CenarioMapa[],
  linhasEtapa: LinhaEtapa[],
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

  // ---- Frete / Desconto / Markup "como se fossem itens" (02/09/2026) — ver comentário do topo do arquivo. ----
  const linhaFrete = abaItens.addRow({ desc: 'FRETE (com markup aplicado)' });
  const linhaDesconto = abaItens.addRow({ desc: 'DESCONTO (com markup aplicado)' });
  const linhaMarkup = abaItens.addRow({ desc: 'MARKUP (alíquota do fornecedor)' });
  [linhaFrete, linhaDesconto, linhaMarkup].forEach((linha) => {
    linha.font = { italic: true };
  });

  fornecedores.forEach((fornecedor, si) => {
    if (!notas.bySupplier[si]?.used) return;

    linhaFrete.getCell(`total_${si}`).value = valorComMarkup(fornecedor.frete, fornecedor.imposto) || '';
    linhaDesconto.getCell(`total_${si}`).value = fornecedor.desconto
      ? -valorComMarkup(fornecedor.desconto, fornecedor.imposto)
      : '';

    const celulaMarkup = linhaMarkup.getCell(`total_${si}`);
    celulaMarkup.value = (Number(fornecedor.imposto) || 0) / 100;
    celulaMarkup.numFmt = '0.00%';
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

  // ---- Aba 3: Rateio por etapa (02/09/2026) ----
  const abaRateio = workbook.addWorksheet('Rateio por etapa');
  abaRateio.columns = [
    { header: 'Etapa', key: 'etapa', width: 30 },
    ...fornecedores.flatMap((f, i) => [
      { header: `${rotuloFornecedor(fornecedores, i)} — Base (R$)`, key: `base_${i}`, width: 16 },
      { header: `${rotuloFornecedor(fornecedores, i)} — Frete (R$)`, key: `frete_${i}`, width: 14 },
      { header: `${rotuloFornecedor(fornecedores, i)} — Desconto (R$)`, key: `desconto_${i}`, width: 14 },
      { header: `${rotuloFornecedor(fornecedores, i)} — Markup (R$)`, key: `markup_${i}`, width: 14 },
      { header: `${rotuloFornecedor(fornecedores, i)} — Total (R$)`, key: `totalForn_${i}`, width: 16 },
    ]),
    { header: 'Total da etapa (R$)', key: 'totalEtapa', width: 16 },
  ];
  abaRateio.getRow(1).eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  abaRateio.views = [{ state: 'frozen', ySplit: 1 }];

  linhasEtapa.forEach((linha, i) => {
    const porFornecedor = new Map(linha.celulas.map((c) => [c.fornecedor, c]));

    const row = abaRateio.addRow({
      etapa: linha.etapa,
      ...Object.fromEntries(
        fornecedores.flatMap((_, si) => {
          const celula = porFornecedor.get(si);
          return [
            [`base_${si}`, celula?.base || ''],
            [`frete_${si}`, celula?.freteValor || ''],
            [`desconto_${si}`, celula?.descValor ? -celula.descValor : ''],
            [`markup_${si}`, celula?.markup || ''],
            [`totalForn_${si}`, celula?.total || ''],
          ];
        }),
      ),
      totalEtapa: linha.total,
    });

    if (i % 2 === 1) {
      row.eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } };
      });
    }
  });

  if (linhasEtapa.length) {
    const linhaTotalRateio = abaRateio.addRow({
      etapa: 'TOTAL',
      totalEtapa: linhasEtapa.reduce((soma, l) => soma + l.total, 0),
    });
    linhaTotalRateio.eachCell((celula) => {
      celula.font = { bold: true };
      celula.border = { top: { style: 'thin' } };
    });
  }

  // ---- Aba 4: Comparação de cenários ----
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
