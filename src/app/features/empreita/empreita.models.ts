/** Modelos da Empreita — portados de js/empreita/*.js. */

import { ChaveTipo, PorTipo } from '../eap/eap.models';

/** Percentuais de medição por categoria de custo. */
export type MedicaoPorTipo = Partial<Record<ChaveTipo, number | null>>;

/** Valores de contrato lançados por categoria de custo (moeda, não percentual). */
export type ValorPorTipo = Partial<Record<ChaveTipo, number | null>>;

/**
 * Serviço contratado dentro de uma empreita.
 *
 * O contrato é lançado **por categoria de custo**, à mão pelo usuário —
 * decisão da task #45 (28/07/2026): o sistema não calcula nem distribui
 * esse valor a partir do orçado, só exibe o orçado como referência.
 *
 * `contratoReservaPorTipo` é a **reserva discricionária** — o
 * diferencial do AppTrena. Em vez de calcular a retenção como percentual
 * fixo atrelado ao avanço físico, o valor é lançado manualmente por
 * serviço e por categoria, o que permite usar a reserva de uma obra para
 * cobrir um problema em outra. Nenhum concorrente resolve isso.
 */
export interface ItemEmpreita {
  id: string;
  desc: string;
  /** Item da EAP a que este serviço se refere — usado só como referência de orçado. */
  eapId: string;
  /** Valor de empreita contratado, por categoria de custo. */
  contratoEmpPorTipo: ValorPorTipo;
  /** Reserva discricionária, por categoria de custo. */
  contratoReservaPorTipo: ValorPorTipo;
  /** Percentual já medido em períodos anteriores, por categoria. */
  medicaoAcumByType: MedicaoPorTipo;
  /** Percentual medido neste período. Null herda o acumulado. */
  medicaoAtualByType: MedicaoPorTipo;
}

export interface CabecalhoEmpreita {
  numeroEmpreita: string;
  descricaoEmpreita: string;
  obraNumber: string;
  empreiteiro: string;
  data: string;
  /** Categorias de custo consideradas nesta empreita. */
  typesIncluded: Partial<Record<ChaveTipo, boolean>>;
}

/**
 * Cabeçalho da EAP visto pela empreita — só o BDI global interessa aqui,
 * porque é ele que compõe o orçado de cada item.
 */
export interface CabecalhoEapSnapshot {
  mapNumber: string;
  bdiMode: 'pct' | 'value';
  bdiPercent: number;
  bdiValue: number;
}

/** Orçado de um item da EAP, já com BDI distribuído por categoria. */
export interface OrcadoEap {
  diretoPorTipo: PorTipo;
  totalDireto: number;
  bdiPorTipo: PorTipo;
  bdiTotal: number;
  totalPorTipo: PorTipo;
  total: number;
}

/** Resultado do cálculo de uma linha de empreita. */
export interface LinhaEmpreita {
  valorEmp: number;
  valorReserva: number;
  valorTotal: number;
  tipos: ChaveTipo[];

  orcadoPorTipo: PorTipo;
  orcadoTotal: number;
  /** Contrato (empreita + reserva) lançado pelo usuário, por categoria. */
  contratoPorTipo: Partial<PorTipo>;

  acumuladoPorTipo: Partial<Record<ChaveTipo, number>>;
  atualPorTipo: Partial<Record<ChaveTipo, number>>;
  /** Avanço do período: atual − acumulado, nunca negativo. */
  avancoPorTipo: Partial<Record<ChaveTipo, number>>;
  pagarPorTipo: Partial<Record<ChaveTipo, number>>;
  reservarPorTipo: Partial<Record<ChaveTipo, number>>;

  temAvanco: boolean;
  pagarEmp: number;
  reservarPgto: number;
  totalPeriodo: number;
  /** Alguma categoria retrocedeu — medição inválida. */
  reducaoInvalida: boolean;
  tiposInvalidos: ChaveTipo[];
}

export interface TotaisEmpreita {
  orcadoTotal: number;
  valorEmp: number;
  valorReserva: number;
  valorTotal: number;
  pagarEmp: number;
  reservarPgto: number;
  totalPeriodo: number;
}
