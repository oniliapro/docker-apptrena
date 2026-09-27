/**
 * Controle de contrato de equipamentos alugados (26/09/2026, pedido do
 * Lucas) — ver `ContratoEquipamentoController` no backend pro ciclo
 * completo (entrega → vencimento → renovações parciais).
 */

export type PeriodoUnidade = 'dias_corridos' | 'dias_uteis';

export const PERIODO_UNIDADES: ReadonlyArray<{ valor: PeriodoUnidade; rotulo: string }> = [
  { valor: 'dias_corridos', rotulo: 'Dias corridos' },
  { valor: 'dias_uteis', rotulo: 'Dias úteis' },
];

/** Sempre calculado na leitura, nunca gravado — ver `ContratoEquipamentoController::comStatus`. */
export type StatusContratoEquipamento = 'ativo' | 'vencido' | 'encerrado';

export interface ContratoEquipamentoItem {
  id: string;
  contrato_id: string;
  descricao: string;
  /** 26/09/2026: etapa da EAP deste item, opcional — rastreio de custo, mesma ideia do item de Pagamento. */
  eap_item_id: string | null;
  quantidade: number;
  valor_unitario: number;
  /** Nulo = ainda com o cliente. Preenchido = devolvido nesta data (sempre a data de uma renovação). */
  devolvido_em: string | null;
  ordem: number;
}

export interface ContratoEquipamentoRenovacao {
  id: string;
  contrato_id: string;
  data_renovacao: string;
  periodo_quantidade: number;
  periodo_unidade: PeriodoUnidade;
  data_vencimento_nova: string;
  valor_total: number;
  pagamento_id: string | null;
}

export interface ContratoEquipamento {
  id: string;
  obra_id: string;
  numero: number;
  nome_contrato: string;
  fornecedor: string;
  /** Frete da entrega inicial (27/09/2026) — só existe na criação, não em renovações. */
  frete: number;
  lancar_frete_como_item: boolean;
  frete_etapa_id: string | null;
  data_entrega: string;
  periodo_quantidade: number;
  periodo_unidade: PeriodoUnidade;
  data_vencimento: string;
  encerrado_em: string | null;
  pagamento_inicial_id: string | null;
  agenda_evento_id: string | null;
  itens: ContratoEquipamentoItem[];
  renovacoes: ContratoEquipamentoRenovacao[];
  /** Calculados pelo backend a cada leitura — não fazem parte do payload de criação/edição. */
  status: StatusContratoEquipamento;
  itens_ativos_qtd: number;
  valor_atual: number;
  renovacoes_qtd: number;
}

export interface ContratoEquipamentoItemPayload {
  descricao: string;
  eap_item_id: string | null;
  quantidade: number;
  valor_unitario: number;
}

export interface ContratoEquipamentoPayload {
  nome_contrato: string;
  fornecedor: string;
  frete: number;
  lancar_frete_como_item: boolean;
  frete_etapa_id: string | null;
  data_entrega: string;
  periodo_quantidade: number;
  periodo_unidade: PeriodoUnidade;
  itens: ContratoEquipamentoItemPayload[];
}

export interface RenovarContratoPayload {
  periodo_quantidade: number;
  periodo_unidade: PeriodoUnidade;
  itens_devolvidos: string[];
  itens: Array<{ id: string; quantidade: number; valor_unitario: number; eap_item_id: string | null }>;
}

export const ROTULOS_STATUS_CONTRATO: Record<StatusContratoEquipamento, string> = {
  ativo: 'Ativo',
  vencido: 'Vencido',
  encerrado: 'Encerrado',
};
