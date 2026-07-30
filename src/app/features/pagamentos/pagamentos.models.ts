/** Modelos de Pagamentos — portados de js/shared/pagamentos-utils.js. */

export type ModoValor = 'valor' | 'percentual';

/** Categorias usadas nos itens de pagamento (chaves do formato antigo). */
export const TIPOS_CUSTO_PAGAMENTO = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
] as const;

export interface ItemPagamento {
  id: string;
  descricao: string;
  tipo: string;
  eapId: string;
  /** Interpretação depende de `modoValor`: reais ou % do total. */
  valor: number;
  modoValor: ModoValor;
}

/** Item com o valor em reais já resolvido a partir do modo. */
export interface ItemPagamentoCalculado extends ItemPagamento {
  valorCalculado: number;
}

export interface OrigemPagamento {
  tipo?: string;
  refId?: string;
}

export interface Pagamento {
  id: string;
  numeroPagamento: string;
  obraNumber: string;
  dataSolicitacao: string;
  dataPagamento: string;
  fornecedor: string;
  descricao: string;
  valorTotal: number;
  itens: ItemPagamento[];
  origem: OrigemPagamento | null;
}

export interface CabecalhoPagamentos {
  obraNumber: string;
}

export interface PayloadPagamentos {
  header: CabecalhoPagamentos;
  pagamentos: Pagamento[];
}

/** Item da EAP usado para rotular a etapa de cada item de pagamento. */
export interface ItemEapSnapshot {
  id: string;
  isGroup: boolean;
  eap: string;
  desc: string;
}
