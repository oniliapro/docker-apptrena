/**
 * Modelos de Recebimentos (01/09/2026, pedido do Lucas: "funciona
 * exatamente como os pagamentos") — mirror de `pagamentos.models.ts`,
 * mais simples: não existe a distinção Empreiteiro/Reserva aqui (isso é
 * específico do contrato de empreitada), então `ItemRecebimento` não
 * replica `parcela`/`empreitaItemId`/`valorReferencia`.
 */

export type ModoValor = 'valor' | 'percentual';

export const TIPOS_CUSTO_RECEBIMENTO = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
] as const;

export interface ItemRecebimento {
  id: string;
  descricao: string;
  tipo: string;
  eapId: string;
  /** Interpretação depende de `modoValor`: reais ou % do total. */
  valor: number;
  modoValor: ModoValor;
}

/** Item com o valor em reais já resolvido a partir do modo. */
export interface ItemRecebimentoCalculado extends ItemRecebimento {
  valorCalculado: number;
}

export interface OrigemRecebimento {
  tipo?: string;
  refId?: string;
}

/**
 * `pendente`: gerado automaticamente (a partir de uma Medição aprovada) e
 * ainda não conferido. `confirmado`: conferido pelo usuário na aba
 * Recebimentos (ou lançado à mão, que já nasce confirmado).
 */
export type StatusRecebimento = 'pendente' | 'confirmado';

export interface Recebimento {
  id: string;
  numeroRecebimento: string;
  obraNumber: string;
  dataSolicitacao: string;
  dataRecebimento: string;
  cliente: string;
  descricao: string;
  valorTotal: number;
  itens: ItemRecebimento[];
  origem: OrigemRecebimento | null;
  status: StatusRecebimento;
}

export interface CabecalhoRecebimentos {
  obraNumber: string;
}

export interface PayloadRecebimentos {
  header: CabecalhoRecebimentos;
  recebimentos: Recebimento[];
}

/** Item da EAP usado para rotular a etapa de cada item de recebimento. */
export interface ItemEapSnapshotRecebimento {
  id: string;
  isGroup: boolean;
  eap: string;
  desc: string;
}
