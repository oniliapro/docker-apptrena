/**
 * Exportação da EAP pra planilha Excel, com os dados de verdade da obra
 * (31/08/2026, pedido do Lucas) — diferente de `eap-importar.ts`
 * (`gerarModeloXlsx`), que gera um modelo em branco só de exemplo pra
 * quem vai IMPORTAR. Aqui é o caminho oposto: exportar o que já está
 * lançado, com os totais calculados (Direto, BDI, Total c/ BDI) — o
 * mesmo número que aparece na tela e no PDF do relatório, só que numa
 * planilha filtrável/copiável.
 *
 * Roda no navegador (ExcelJS), sem passar pelo backend — mesmo motivo de
 * `eap-importar.ts`: os cálculos de orçado/BDI já vivem inteiros em
 * `eap-engine.ts`, não faz sentido duplicá-los em PHP só pra isso.
 *
 * Cabeçalho ficou "achatado" (uma linha só, sem células mescladas) em vez
 * de repetir a grade de dois níveis da tela ("Orçado Realizado" / "Custo
 * direto" / "BDI") — uma planilha exportada normalmente é pra filtrar/
 * somar/copiar em outro lugar, e cabeçalho mesclado atrapalha isso mais
 * do que ajuda.
 */

import ExcelJS from 'exceljs';

import { CabecalhoObra, ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from './eap.models';
import { calcularCacheOrcado, somarDescendentesDoGrupo } from './eap-engine';

/**
 * Realizado (o que já foi de fato gasto via Mapas/Empreitas/Pagamentos
 * confirmados) de uma linha da EAP — calculado inteiro no componente
 * `eap.ts` (não vive no engine puro, porque depende dos pagamentos da
 * obra, carregados à parte). Um item por linha, na mesma ordem/índice de
 * `itens`; quem monta esse array é `eap.ts`, usando os métodos que já
 * tem prontos (`realizadoDoItemTipo`/`realizadoSemCategoria`/
 * `realizadoDoItem`, que já sabem somar os descendentes de um grupo).
 */
export interface RealizadoPorLinha {
  porTipo: PorTipo;
  semCategoria: number;
  total: number;
}

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
 * Gera a planilha com os itens de verdade da EAP e dispara o download —
 * botão "Exportar Excel" de `eap.html`.
 */
export async function exportarEapXlsx(
  cabecalho: CabecalhoObra,
  itens: ItemEap[],
  obraId: string,
  realizadoPorLinha: RealizadoPorLinha[],
): Promise<void> {
  const cache = calcularCacheOrcado(itens, cabecalho);

  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet('EAP');

  const colunas = [
    { header: 'Nível', key: 'nivel', width: 8 },
    { header: 'EAP', key: 'eap', width: 12 },
    { header: 'Descrição', key: 'desc', width: 42 },
    { header: 'Qtde', key: 'qtde', width: 10 },
    { header: 'Un.', key: 'unid', width: 8 },
    ...TIPOS_CUSTO.map((t) => ({ header: `${t.rotulo} — Direto (R$)`, key: `direto_${t.chave}`, width: 18 })),
    { header: 'Total Direto (R$)', key: 'totalDireto', width: 16 },
    { header: 'BDI (R$)', key: 'bdi', width: 14 },
    { header: 'Total c/ BDI (R$)', key: 'totalComBdi', width: 16 },
    ...TIPOS_CUSTO.map((t) => ({ header: `${t.rotulo} — Realizado (R$)`, key: `realizado_${t.chave}`, width: 18 })),
    { header: 'Realizado S/ Categoria (R$)', key: 'realizadoSemCategoria', width: 20 },
    { header: 'Total Realizado (R$)', key: 'totalRealizado', width: 18 },
  ];
  planilha.columns = colunas;

  const linhaCabecalho = planilha.getRow(1);
  linhaCabecalho.eachCell((celula) => {
    celula.font = { bold: true };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_CABECALHO } };
  });
  planilha.views = [{ state: 'frozen', ySplit: 1 }];

  itens.forEach((item, i) => {
    const totais = item.isGroup ? somarDescendentesDoGrupo(i, itens, cache) : null;
    const realizado = realizadoPorLinha[i];

    const diretoPorTipo: Record<ChaveTipo, number> = {} as Record<ChaveTipo, number>;
    TIPOS_CUSTO.forEach((t) => {
      diretoPorTipo[t.chave] = totais ? totais.directByType[t.chave] : cache.directByType[i][t.chave];
    });

    const linha = planilha.addRow({
      nivel: item.nivel,
      eap: item.eap,
      desc: item.desc,
      qtde: item.isGroup ? '' : item.qtde || '',
      unid: item.isGroup ? '' : item.unid,
      ...Object.fromEntries(TIPOS_CUSTO.map((t) => [`direto_${t.chave}`, diretoPorTipo[t.chave] || ''])),
      totalDireto: totais ? totais.directTotal : cache.directTotal[i],
      bdi: totais ? totais.bdiApplied : cache.bdiApplied[i],
      totalComBdi: totais ? totais.totalWithBdi : cache.totalWithBdi[i],
      ...Object.fromEntries(
        TIPOS_CUSTO.map((t) => [`realizado_${t.chave}`, realizado?.porTipo[t.chave] || '']),
      ),
      realizadoSemCategoria: realizado?.semCategoria || '',
      totalRealizado: realizado?.total || '',
    });

    if (item.nivel === 1) {
      linha.eachCell((celula) => {
        celula.font = { bold: true, color: { argb: COR_TEXTO_GRUPO_NIVEL_1 } };
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO_NIVEL_1 } };
      });
    } else if (i % 2 === 1) {
      linha.eachCell((celula) => {
        celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ZEBRA } };
      });
    }
  });

  // Realizado total — soma só das linhas-BASE (não-grupo), mesma regra
  // de `totalOrcado`/`totalsDirect`: somar grupo + descendentes juntos
  // contaria o mesmo gasto duas vezes.
  const totaisRealizadoPorTipo: PorTipo = { material: 0, maoDeObra: 0, equipamento: 0, outros: 0, administracao: 0 };
  let totalRealizadoSemCategoriaGeral = 0;
  let totalRealizadoGeral = 0;
  itens.forEach((item, i) => {
    if (item.isGroup) return;
    const realizado = realizadoPorLinha[i];
    if (!realizado) return;
    TIPOS_CUSTO.forEach((t) => { totaisRealizadoPorTipo[t.chave] += realizado.porTipo[t.chave] || 0; });
    totalRealizadoSemCategoriaGeral += realizado.semCategoria || 0;
    totalRealizadoGeral += realizado.total || 0;
  });

  // Linha de totais gerais, ao final — mesmos números do rodapé "TOTAIS" da tela.
  const linhaTotais = planilha.addRow({
    desc: 'TOTAIS',
    ...Object.fromEntries(
      TIPOS_CUSTO.map((t) => [`direto_${t.chave}`, cache.totalsDirectByType[t.chave] || '']),
    ),
    totalDireto: cache.totalsDirect,
    bdi: cache.totalsBdi,
    totalComBdi: cache.totalsWithBdi,
    ...Object.fromEntries(
      TIPOS_CUSTO.map((t) => [`realizado_${t.chave}`, totaisRealizadoPorTipo[t.chave] || '']),
    ),
    realizadoSemCategoria: totalRealizadoSemCategoriaGeral || '',
    totalRealizado: totalRealizadoGeral || '',
  });
  linhaTotais.eachCell((celula) => {
    celula.font = { bold: true };
    celula.border = { top: { style: 'thin' } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  baixarBlob(buffer as ArrayBuffer, `eap-${obraId}.xlsx`);
}
