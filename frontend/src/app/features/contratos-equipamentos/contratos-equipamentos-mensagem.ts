import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { ContratoEquipamento } from './contratos-equipamentos.models';

const ROTULO_PERIODO: Record<ContratoEquipamento['periodo_unidade'], string> = {
  dias_corridos: 'DIAS CORRIDOS',
  dias_uteis: 'DIAS ÚTEIS',
};

/**
 * "Copiar solicitação de pagamento" do Contrato de equipamentos
 * (27/09/2026, formato exato definido pelo Lucas) — o valor pedido é
 * sempre o do pagamento mais recente gerado por este contrato (a entrega
 * inicial, se ainda não teve renovação, ou a última renovação), com o
 * histórico completo abaixo e o mais recente marcado "(HOJE)". `pagamentos`
 * é a lista já filtrada por `origem.refId === contrato.id` (mesma fonte
 * usada no popup de "Total pago" da lista), sem chamada extra à API.
 */
export function montarMensagemPagamentoContratoEquipamento(
  contrato: ContratoEquipamento,
  pagamentos: Pagamento[],
  pix: string,
): string | null {
  if (!pagamentos.length) return null;

  const ordenados = [...pagamentos].sort(
    (a, b) => new Date(a.dataPagamento || a.dataSolicitacao).getTime() - new Date(b.dataPagamento || b.dataSolicitacao).getTime(),
  );
  // 01/10/2026: era `ordenados[ordenados.length - 1]` (o último por DATA) —
  // bug achado testando de verdade: `AcoesPagamento.confirmar()` grava
  // `dataPagamento` como o instante do clique em "confirmar", não a data do
  // pagamento em si. Se um pagamento ANTIGO (de uma renovação anterior) é
  // confirmado depois que a renovação ATUAL já existe como pendente, a data
  // dele "pula" pra hoje e pode ficar depois da `dataSolicitacao` do
  // pendente — a ordenação por data inverte e o "último" passava a ser o
  // pagamento já pago, cobrando o valor errado. O pagamento "atual" (a
  // cobrar) é sempre o PENDENTE, não importa a data.
  const atual = ordenados.find((p) => p.status === 'pendente') ?? ordenados[ordenados.length - 1];

  const equipamentos = contrato.itens
    .filter((item) => !item.devolvido_em)
    .map((item) => `- \`${item.descricao} (x${item.quantidade})\``);

  const historico = ordenados.map((pagamento) => {
    const data = formatarData(pagamento.dataPagamento || pagamento.dataSolicitacao);
    const marca = pagamento === atual ? ' (HOJE)' : '';
    return `${data} - ${formatarMoeda(pagamento.valorTotal)}${marca}`;
  });

  return [
    '*SOLICITAÇÃO DE PAGAMENTO*',
    '',
    `ALUGUEL COM VENCIMENTO EM ${formatarData(contrato.data_vencimento)} (${contrato.periodo_quantidade} ${ROTULO_PERIODO[contrato.periodo_unidade]})`,
    ...equipamentos,
    `VALOR A SER PAGO: *${formatarMoeda(atual.valorTotal)}*`,
    '',
    '*PAGAMENTOS ANTERIORES*',
    ...historico,
    '',
    '*RESUMO DE PAGAMENTO*',
    `\`${contrato.fornecedor}\``,
    `\`DADOS DE PAGAMENTO (PIX): ${pix || '-'}\``,
  ].join('\n');
}
