import { formatarMoeda } from '../../core/utils/formato';
import { CabecalhoMapa, Fornecedor, NotaFornecedor } from './mapa.models';

/**
 * "Copiar solicitação de pagamento" do Mapa (27/09/2026, formato exato
 * definido pelo Lucas) — um fornecedor por bloco, separado por uma linha de
 * traços, com o PIX escolhido/digitado na hora (ver `DadosPagamentoModal`).
 * `notas` é `MapaStore.notas().bySupplier`, na MESMA ordem/índice de
 * `fornecedores` — já reflete o cenário vencedor (ou a escolha manual).
 */
export function montarMensagemPagamentoMapa(
  cabecalho: CabecalhoMapa,
  fornecedores: Fornecedor[],
  notas: NotaFornecedor[],
  cenarioVencedorRotulo: string | null,
  pixPorNome: Map<string, string>,
): string {
  const blocos = fornecedores
    .map((fornecedor, indice) => ({ fornecedor, nota: notas[indice] }))
    .filter(({ fornecedor, nota }) => fornecedor.ativo !== false && nota?.used)
    .map(({ fornecedor, nota }) => {
      const identificacao = fornecedor.contato ? `${fornecedor.nome} (${fornecedor.contato})` : fornecedor.nome;
      const pix = pixPorNome.get(fornecedor.nome) || '-';
      return [`\`${identificacao}\``, `*${formatarMoeda(nota.totalNota)}*`, `\`DADOS DE PAGAMENTO (PIX): ${pix}\``].join('\n');
    });

  return [
    '*SOLICITAÇÃO DE PAGAMENTO*',
    '',
    `MAPA Nº: ${cabecalho.numeroMapa || '—'}`,
    `DESCRIÇÃO: ${cabecalho.descricao || '—'}`,
    `CENÁRIO INDICADO: ${(cenarioVencedorRotulo || '—').toUpperCase()}`,
    '',
    '*RESUMO DE PAGAMENTOS*',
    blocos.join('\n\n---------------\n\n'),
  ].join('\n');
}
