import { formatarData, formatarMoeda, hojeIso } from '../../core/utils/formato';
import { expandirItensPagamento } from './pagamentos-calc';
import { Pagamento } from './pagamentos.models';

/**
 * Mensagem "RESUMO DE CUSTOS" (25/09/2026, pedido do Lucas) — o texto que
 * "Copiar mensagem" gera com os pagamentos marcados na lista de Pagamentos
 * (da obra e geral), pronto pra colar no WhatsApp. Formato definido por ele:
 * resumo por categoria de custo, total pago e a lista de pagamentos.
 *
 * Cada categoria soma o valor dos ITENS dos pagamentos marcados. Item sem
 * categoria reconhecida — e a parte do total que os itens não cobrem — entra
 * em OUTROS, pra a soma das categorias sempre fechar com o total. A data de
 * cada linha é a data de pagamento; pagamento ainda pendente (sem data de
 * pagamento) mostra a data de solicitação.
 */
const CATEGORIAS: ReadonlyArray<{ chave: string; icone: string; rotulo: string }> = [
  { chave: 'material', icone: '🧱', rotulo: 'MATERIAL' },
  { chave: 'maoDeObra', icone: '👷🏼‍♂️', rotulo: 'MÃO DE OBRA' },
  { chave: 'equipamento', icone: '🔨', rotulo: 'EQUIPAMENTO' },
  { chave: 'outros', icone: '📃', rotulo: 'OUTROS' },
  { chave: 'administracao', icone: '📊', rotulo: 'ADMINISTRAÇÃO' },
];

export function montarMensagemResumoCustos(pagamentos: Pagamento[], hoje: string = hojeIso()): string {
  const porCategoria = new Map<string, number>(CATEGORIAS.map((c) => [c.chave, 0]));
  let totalPago = 0;

  for (const pagamento of pagamentos) {
    totalPago += Number(pagamento.valorTotal) || 0;

    let somaItens = 0;
    for (const item of expandirItensPagamento(pagamento)) {
      const valor = Number(item.valorCalculado) || 0;
      somaItens += valor;
      const chave = porCategoria.has(item.tipo) ? item.tipo : 'outros';
      porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + valor);
    }

    // O que os itens não cobrem do total do pagamento (ou pagamento sem itens) cai em OUTROS.
    const resto = (Number(pagamento.valorTotal) || 0) - somaItens;
    if (Math.abs(resto) > 0.005) porCategoria.set('outros', (porCategoria.get('outros') ?? 0) + resto);
  }

  const dinheiro = (valor: number): string => formatarMoeda(valor);

  const linhasPagamentos = pagamentos.map((pagamento) => {
    const data = formatarData(pagamento.dataPagamento || pagamento.dataSolicitacao) || '—';
    return `\`${pagamento.numeroPagamento || '—'} - (${data}) - ${pagamento.fornecedor || '—'}: ${dinheiro(Number(pagamento.valorTotal) || 0)}\``;
  });

  return [
    '*RESUMO DE CUSTOS*',
    `🗓️ *ATUALIZAÇÃO: ${formatarData(hoje)}*`,
    '',
    '*RESUMO DE VALORES PAGOS:*',
    ...CATEGORIAS.map((c) => `* ${c.icone}${c.rotulo}: ${dinheiro(porCategoria.get(c.chave) ?? 0)}`),
    `🌐 *TOTAL PAGO ATUALIZADO: ${dinheiro(totalPago)}*`,
    '',
    '*LISTA DE PAGAMENTOS*',
    ...linhasPagamentos,
  ].join('\n');
}
