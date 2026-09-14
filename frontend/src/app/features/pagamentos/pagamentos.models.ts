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
  /**
   * Qual lado do contrato de uma Empreita este item representa — null pra
   * item de Mapa/manual, que não têm esse eixo (25/08/2026, redesign da
   * Empreita). Usado pra separar "Já pago" (Empreiteiro x Reserva) e pra
   * calcular a Divergência (só o lado empreiteiro entra nessa conta).
   */
  parcela?: 'empreiteiro' | 'reserva' | null;
  /** Id da linha de serviço da empreita (`ItemEmpreita.id`) que originou este item. */
  empreitaItemId?: string;
  /**
   * Snapshot imutável do valor que a engine calculou como "devido" no
   * momento em que este pagamento foi gerado (`pagarPorTipo`/
   * `reservarPorTipo`) — não muda depois, mesmo que o contrato ou a
   * medição mudem. É o "medido" da fórmula de Divergência: medido − o que
   * foi de fato liberado (`valor`, acima).
   */
  valorReferencia?: number | null;
}

/** Item com o valor em reais já resolvido a partir do modo. */
export interface ItemPagamentoCalculado extends ItemPagamento {
  valorCalculado: number;
}

export interface OrigemPagamento {
  tipo?: string;
  refId?: string;
}

/**
 * `pendente`: gerado automaticamente (hoje só a partir de um Mapa
 * finalizado) e ainda não conferido — não entra no "Realizado" da EAP.
 * `confirmado`: conferido pelo usuário na aba Pagamentos (ou lançado à
 * mão, que já nasce confirmado) — esse sim conta como realizado.
 */
export type StatusPagamento = 'pendente' | 'confirmado';

/**
 * Retrato de UM serviço da Empreita no momento em que o pagamento foi
 * gerado (03/09/2026, "guardar as medições") — ver `MedicaoSnapshotEmpreita`.
 */
export interface ItemSnapshotMedicao {
  empreitaItemId: string;
  desc: string;
  tipo: string;
  eapId: string;
  medicaoAcum: number;
  medicaoAtual: number;
  contratoEmp: number;
  contratoReserva: number;
}

/**
 * Retrato da Empreita inteira no momento em que "Fechar período" gerou
 * este pagamento (03/09/2026, pedido do Lucas) — só existe pra
 * `origem.tipo === 'empreita'`. `contratoTotalEmpreita` existe à parte
 * (não só a soma de `itens[].contratoEmp/contratoReserva`) porque o
 * contrato pode crescer/diminuir DEPOIS deste pagamento (serviço
 * adicionado/removido, valor editado) — o snapshot precisa continuar
 * mostrando o total de ENTÃO, não o de agora.
 */
export interface MedicaoSnapshotEmpreita {
  contratoTotalEmpreita: number;
  itens: ItemSnapshotMedicao[];
}

export interface Pagamento {
  id: string;
  numeroPagamento: string;
  /** Id/nome da obra (14/09/2026) — card "Pagamentos" do dashboard, que cruza várias obras. Opcional porque rascunhos locais (pagamento novo) ainda não têm. */
  obraId?: string;
  obraNome?: string;
  obraNumber: string;
  dataSolicitacao: string;
  dataPagamento: string;
  fornecedor: string;
  descricao: string;
  valorTotal: number;
  itens: ItemPagamento[];
  origem: OrigemPagamento | null;
  status: StatusPagamento;
  /** `null` pra pagamentos que não são de Empreita, ou gerados antes desta feature existir. */
  medicaoSnapshot?: MedicaoSnapshotEmpreita | null;
  /** Quantidade de anexos (06/09/2026, controle de notas fiscais) — vem pronto de `PagamentoController` (`withCount`), sem 1 chamada por linha. */
  anexosCount?: number;
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
