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
  /**
   * Com a EAP confirmada, alterna a tabela entre mostrar Real./Orç.
   * empilhados por categoria (`'detalhado'`, o padrão) ou um valor só de
   * Saldo (`orçado − realizado`) por categoria (`'saldo'`) — pedido do
   * Lucas em 23/08/2026, pra ver de relance se alguma etapa vai estourar
   * o planejamento sem precisar calcular a diferença de cabeça. Não
   * confundir com `orcRealMode`, que decide a UNIDADE (R$ x %); este
   * campo decide QUAL bloco aparece.
   */
  modoTotais: 'detalhado' | 'saldo';
  visibleTypes: Record<ChaveTipo, boolean>;
}

/**
 * Linha da EAP. `isGroup` marca as linhas de agrupamento (ex.: "1 —
 * SERVIÇOS PRELIMINARES"), que não têm custo próprio: seus totais são a
 * soma dos descendentes.
 */
export interface ItemEap {
  id: string;
  /**
   * Marca linhas de agrupamento (ex.: "1 — SERVIÇOS PRELIMINARES"), que
   * não têm custo próprio: seus totais em cada categoria são a soma dos
   * descendentes. **Não é mais escolhido pelo usuário** — decisão tomada
   * com o Lucas em 15/08/2026: um grupo é simplesmente qualquer linha que
   * tenha outras linhas aninhadas abaixo dela (nível maior, mesmo que não
   * seja o próximo nível — "1" com só um filho direto "1.2" ainda soma
   * "1.2"). `aplicarNumeracaoAutomatica` recalcula este campo do zero a
   * cada renumeração, depois de fechar os códigos EAP — qualquer valor
   * vindo de fora (payload salvo antes dessa data) é ignorado/sobrescrito.
   * Sem checkbox "Grupo" na tela: uma linha vira grupo automaticamente
   * quando alguém aninha algo embaixo dela, e volta a ser item comum
   * (com seus próprios qtde/custo, se ainda tiver algum valor lançado
   * antes de virar grupo) se os filhos forem removidos.
   */
  isGroup: boolean;
  /**
   * Nível hierárquico (1 a 4), escolhido pelo usuário num select — decisão
   * tomada com o Lucas em 14/08/2026 ao comparar com o protótipo
   * `obracontrol.html` (antes o nível vinha só do checkbox "Grupo" + posição
   * na lista, limitado a 2 níveis). `0` é o sentinela de "ainda não
   * calculado": `aplicarNumeracaoAutomatica` infere o valor legado (grupo =
   * 1, item dentro de grupo = 2) na primeira renumeração de itens antigos e
   * grava o resultado de volta no item.
   */
  nivel: number;
  /** Numeração hierárquica: "1", "1.1", "2.3"… gerada automaticamente a partir de `nivel`. */
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
  /**
   * Snapshot do Orçado (custo direto + BDI) por categoria, gravado no
   * momento em que a EAP é confirmada — decisão tomada com o Lucas em
   * 14/08/2026: "Orçado" deixa de recalcular ao vivo depois de confirmado,
   * pra não virar um alvo móvel se qtde/custo mudarem depois. `null`
   * enquanto o item nunca foi confirmado (ou a EAP foi reaberta) — nesse
   * caso o Orçado exibido continua sendo o cálculo ao vivo.
   */
  orcadoCongelado: PorTipo | null;
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
  /** BDI somado dos descendentes, por categoria — usado no Orçado por categoria (linha de grupo). */
  bdiByType: PorTipo;
  totalWithBdi: number;
  bdiPctApplied: number;
}
