/**
 * Cronograma de obra (CPM — Critical Path Method), 02/10/2026, pedido do
 * Lucas — não confundir com "Cronograma de Desembolso"
 * (`../cronograma-desembolso/`), que é sobre desembolso financeiro por
 * período, sem nenhuma noção de precedência/duração.
 *
 * Campos em snake_case, batendo direto com a API (mesmo padrão recente de
 * `contratos-equipamentos.models.ts`) — sem camada de normalização.
 */

/** TI = término-início, II = início-início, TT = término-término, IT = início-término. */
export type TipoPrecedencia = 'TI' | 'II' | 'TT' | 'IT';

export const TIPOS_PRECEDENCIA: ReadonlyArray<{ chave: TipoPrecedencia; rotulo: string }> = [
  { chave: 'TI', rotulo: 'Término para Início (TI)' },
  { chave: 'II', rotulo: 'Início para Início (II)' },
  { chave: 'TT', rotulo: 'Término para Término (TT)' },
  { chave: 'IT', rotulo: 'Início para Término (IT)' },
];

export type TipoTarefaCronograma = 'tarefa' | 'marco';

export interface TarefaCronograma {
  id: string;
  obra_id: string;
  eap_item_id: string | null;
  ordem: number;
  nome: string;
  tipo: TipoTarefaCronograma;
  /** Dias corridos — marco sempre 0. */
  duracao_dias: number;
  /** Só usada quando a tarefa não tem NENHUMA predecessora — com predecessora, a data é sempre calculada. */
  data_inicio_manual: string | null;
}

export interface TarefaCronogramaPayload {
  eap_item_id: string | null;
  ordem?: number;
  nome: string;
  tipo: TipoTarefaCronograma;
  duracao_dias: number;
  data_inicio_manual: string | null;
}

export interface DependenciaCronograma {
  id: string;
  predecessora_id: string;
  sucessora_id: string;
  tipo: TipoPrecedencia;
  /** Pode ser negativa (antecipação/lead). */
  latencia_dias: number;
}

export interface DependenciaCronogramaPayload {
  predecessora_id: string;
  sucessora_id: string;
  tipo: TipoPrecedencia;
  latencia_dias: number;
}

/** Resultado do motor de cálculo (`cronograma-obra-engine.ts`) para uma tarefa. */
export interface TarefaCronogramaCalculada {
  tarefa: TarefaCronograma;
  /** Datas ISO ("AAAA-MM-DD"), já convertidas de volta dos dias ordinais internos do motor. */
  inicio: string;
  fim: string;
  folgaDias: number;
  critica: boolean;
  erro: string | null;
}
