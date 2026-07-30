/** Modelos da EAP — portados de js/eap/01-data.js e 02-state-utils.js. */

export type ChaveTipo =
  | 'material'
  | 'maoDeObra'
  | 'equipamento'
  | 'outros'
  | 'administracao';

/** Categorias de custo, na ordem em que aparecem nas colunas. */
export const TIPOS_CUSTO: ReadonlyArray<{ chave: ChaveTipo; rotulo: string }> = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
];

/** Valores distribuídos por categoria de custo. */
export type PorTipo = Record<ChaveTipo, number>;

/** Onde o BDI incide. */
export type EscopoBdi = 'global' | 'category' | 'item';

/** Se o BDI é percentual ou valor absoluto. */
export type ModoBdi = 'pct' | 'value';

/** Configuração de BDI de uma categoria (escopo "category"). */
export interface BdiDoTipo {
  mode: ModoBdi;
  percent: number;
  value: number;
}

export interface CabecalhoObra {
  mapNumber: string;
  obraNome: string;
  cliente: string;
  dataBase: string;
  responsavel: string;
  local: string;
  periodo: string;
  obs: string;
  bdiScope: EscopoBdi;
  bdiMode: ModoBdi;
  bdiPercent: number;
  bdiValue: number;
  bdiByType: Record<ChaveTipo, BdiDoTipo>;
  isConfirmed: boolean;
  confirmedAt: string;
}

export interface EstadoUi {
  showUnit: boolean;
  showTotal: boolean;
  showBDI: boolean;
  showTypes: boolean;
  /** Como comparar orçado x realizado: em reais ou em percentual. */
  orcRealMode: 'value' | 'pct';
  visibleTypes: Record<ChaveTipo, boolean>;
}

/**
 * Linha da EAP. `isGroup` marca as linhas de agrupamento (ex.: "1 —
 * SERVIÇOS PRELIMINARES"), que não têm custo próprio: seus totais são a
 * soma dos descendentes.
 */
export interface ItemEap {
  id: string;
  isGroup: boolean;
  /** Numeração hierárquica: "1", "1.1", "2.3"… gerada automaticamente. */
  eap: string;
  desc: string;
  qtde: number;
  unid: string;
  /** Custo unitário por categoria. */
  unit: PorTipo;
  /** BDI específico deste item, que sobrepõe o global/categoria. */
  bdiMode: ModoBdi;
  bdiPercent: number;
  bdiValue: number;
}

/**
 * Payload da EAP, hoje persistido via `GET/PUT /obras/{id}/eap`
 * (`ApiService.obterEap`/`salvarEap` — migrado da ponte chave-valor em
 * 28/07/2026, ver `INTEGRACAO.md`).
 */
export interface EstadoEap {
  header: CabecalhoObra;
  ui: EstadoUi;
  eapItems: ItemEap[];
}

/**
 * Resultado dos cálculos, indexado na mesma ordem de `itensEap`.
 * Linhas de grupo ficam zeradas aqui — seus totais vêm de
 * `somarDescendentesDoGrupo`.
 */
export interface CacheOrcado {
  unitByType: PorTipo[];
  unitTotal: number[];
  directByType: PorTipo[];
  directTotal: number[];
  /** BDI definido no próprio item, ou null se não houver. */
  bdiOverrideValue: Array<number | null>;
  bdiApplied: number[];
  bdiByType: PorTipo[];
  bdiPctApplied: number[];
  totalWithBdi: number[];
  totalsDirectByType: PorTipo;
  totalsBdiByType: PorTipo;
  totalsDirect: number;
  totalsBdi: number;
  totalsWithBdi: number;
}

export interface TotaisDoGrupo {
  directByType: PorTipo;
  directTotal: number;
  bdiApplied: number;
  totalWithBdi: number;
  bdiPctApplied: number;
}
