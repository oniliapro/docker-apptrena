/** Modelos da Empreita — portados de js/empreita/*.js. */

import { ChaveTipo } from '../eap/eap.models';

/**
 * Serviço contratado dentro de uma empreita.
 *
 * 25/08/2026 (pedido do Lucas: "cada item da lista só vai ter um tipo"):
 * cada serviço pertence a UMA categoria de custo só (`tipo`) — antes um
 * mesmo serviço podia ter contrato/medição em várias categorias ao mesmo
 * tempo, empilhadas dentro da célula; agora, se o Lucas precisa de duas
 * categorias no mesmo item da EAP, lança dois serviços (dois `ItemEmpreita`
 * diferentes, mesmo `eapId`, `tipo` diferente).
 *
 * O contrato é lançado à mão pelo usuário — decisão da task #45
 * (28/07/2026): o sistema não calcula nem distribui esse valor a partir
 * do orçado, só exibe o orçado como referência.
 *
 * `contratoReserva` é a **reserva discricionária** — o diferencial do
 * ComTrena. Em vez de calcular a retenção como percentual fixo atrelado
 * ao avanço físico, o valor é lançado manualmente por serviço, o que
 * permite usar a reserva de uma obra para cobrir um problema em outra.
 */
export interface ItemEmpreita {
  id: string;
  desc: string;
  /** Item da EAP a que este serviço se refere — usado só como referência de orçado. */
  eapId: string;
  /** Categoria de custo deste serviço. */
  tipo: ChaveTipo;
  /**
   * Quantidade contratada, na mesma unidade do item da EAP (25/08/2026,
   * pedido do Lucas) — referência pro toggle R$⇄%⇄Qtde da Medição:
   * quando o contrato cobre só uma PARTE do item da EAP, a % medida
   * precisa ser relativa a esta quantidade, não à quantidade total do
   * item (`itemEap.qtde`).
   */
  qtdeContratada: number | null;
  /** Valor de empreita contratado. */
  contratoEmp: number | null;
  /** Reserva discricionária. */
  contratoReserva: number | null;
  /** Percentual já medido em períodos anteriores. */
  medicaoAcum: number | null;
  /** Percentual medido neste período. Null herda o acumulado. */
  medicaoAtual: number | null;
  /**
   * Rascunho do "Pagamento" do período atual (25/08/2026) — null = sem
   * sobrescrita, herda o valor calculado pela engine (`pagar`/`reservar`).
   * Pré-preenchido na tela mas editável antes de "Gerar pagamento"; some
   * (volta a null) depois de um "Gerar pagamento" bem-sucedido.
   */
  pagamentoEmp: number | null;
  pagamentoReserva: number | null;
}

export interface CabecalhoEmpreita {
  numeroEmpreita: string;
  descricaoEmpreita: string;
  obraNumber: string;
  empreiteiro: string;
  data: string;
  /** Previsão de conclusão (15/10/2026, pedido do Lucas) — `{{previsao_conclusao}}` do contrato. `AAAA-MM-DD` ou vazio. */
  previsaoConclusao: string;
  /**
   * Confirmada/em edição (25/08/2026, pedido do Lucas) — mesmo padrão já
   * usado na EAP (`CabecalhoObra.isConfirmed`/`confirmedAt`). Em edição,
   * cabeçalho e serviços (desc/tipo/etapa/contrato/quantidade) ficam
   * livres; confirmando, tudo isso trava.
   *
   * 03/09/2026, pedido do Lucas: confirmar NÃO libera mais a tela de
   * Medição/Pagamento sozinho — isso agora é `pagamentoIniciado`, um
   * passo à parte (botão "Realizar pagamento", dentro de "Pagamentos
   * registrados"), que só pode ser ligado depois de confirmada. Reabrir
   * a empreita (`isConfirmed` volta a `false`) também reseta
   * `pagamentoIniciado` pra `false`.
   */
  isConfirmed: boolean;
  confirmedAt: string;
  pagamentoIniciado: boolean;
  pagamentoIniciadoAt: string;
  /**
   * Qual dos 2 botões — "Realizar medição"/"Realizar pagamento" — está
   * habilitado agora (03/09/2026, pedido do Lucas: "pode fazer
   * persistir" — antes era um sinal só de tela, que se perdia ao
   * recarregar). `true` = "Realizar medição" habilitado (padrão);
   * `false` = "Realizar pagamento" habilitado. Alterna a cada clique num
   * dos dois — independente de `pagamentoIniciado`, que não muda com
   * isso (uma vez revelada, a tabela de Medição/Pagamento continua
   * revelada pra sempre, mesmo alternando este campo).
   */
  medicaoHabilitada: boolean;
  /**
   * Contrato assinado (27/09/2026, pedido do Lucas) — marcado manualmente,
   * independente de ter ou não arquivo anexado (`AnexosLancamento`, mesmo
   * mecanismo de Pagamento/Recebimento). Enquanto houver um contrato
   * anexado e isto continuar `false`, existe um lembrete de assinatura
   * pendente na Agenda (criado/apagado sozinho pelo backend).
   */
  contratoAssinado: boolean;
  contratoAssinadoEm: string;
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
  diretoPorTipo: Record<ChaveTipo, number>;
  totalDireto: number;
  bdiPorTipo: Record<ChaveTipo, number>;
  bdiTotal: number;
  totalPorTipo: Record<ChaveTipo, number>;
  total: number;
}

/** Resultado do cálculo de uma linha de empreita. */
export interface LinhaEmpreita {
  valorEmp: number;
  valorReserva: number;
  valorTotal: number;

  orcado: number;
  /** Contrato (empreita + reserva) lançado pelo usuário. */
  contrato: number;

  acumulado: number;
  atual: number;
  /** Avanço do período: atual − acumulado, nunca negativo. */
  avanco: number;
  pagar: number;
  reservar: number;

  temAvanco: boolean;
  totalPeriodo: number;
  /** A medição retrocedeu — inválida. */
  reducaoInvalida: boolean;
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

/**
 * Contrato de uma empreita-irmã (mesma obra), visto por outra empreita só
 * pra calcular o "Saldo disp." — resposta de `GET /empreitas/resumo`
 * (25/08/2026). Não é o `ItemEmpreita` completo, só o suficiente pra somar
 * comprometimento por eapId/categoria.
 */
export interface ResumoContratoEmpreita {
  id: string;
  numeroEmpreita: string;
  criadoEm: string;
  itens: Array<{
    eapId: string;
    tipo: ChaveTipo;
    qtdeContratada: number;
    contratoEmp: number;
    contratoReserva: number;
    /** Percentual já medido em períodos anteriores (01/09/2026, "% medida" na lista de empreitas). */
    medicaoAcum: number;
    /** Percentual medido neste período. Null herda o acumulado. */
    medicaoAtual: number | null;
  }>;
}

/** Acumulado de pagamentos confirmados de uma linha de serviço, até agora. */
export interface JaPagoLinha {
  empreiteiro: number;
  reserva: number;
  /**
   * Medido menos liberado, soma corrida desde o início (sem clamp — pode
   * ficar negativa se o empreiteiro recebeu adiantado). Positiva = azul
   * (ainda tem a receber); negativa = vermelho (recebeu adiantado). Nome
   * escolhido pelo Lucas (25/08/2026) no lugar de "Sobra", porque "sobra"
   * sugeria só o caso positivo.
   */
  divergencia: number;
  /** Empreiteiro + Reserva — a Divergência fica de fora (é dinheiro ainda não liberado, não pago de fato). */
  total: number;
}

/** Unidade de exibição/edição da Medição de contrato — primeiro toggle de 3 estados do sistema. */
export type UnidadeMedicao = 'pct' | 'valor' | 'qtde';

/**
 * `LinhaEmpreita` (cálculo já existente, intocado) + tudo que o layout
 * novo precisa (25/08/2026): saldo comprometido entre empreitas, Já
 * pago/Divergência acumulados, o rascunho efetivo de Pagamento (o que
 * `gerarPagamento()` de fato emite) e o "Saldo após pagamento".
 */
export interface LinhaEmpreitaEstendida extends LinhaEmpreita {
  /** Saldo disp. (Contrato) — orçado menos o contrato de empreitas anteriores, mesma etapa/categoria. */
  saldoDisp: number;

  /**
   * Qtde. disp. (25/08/2026, pedido do Lucas) — mesma ideia do Saldo
   * disp., mas em quantidade física: quantidade do item da EAP menos a
   * quantidade contratada de empreitas anteriores (mesmo item da EAP,
   * qualquer categoria — a quantidade física é um recurso só, comum a
   * todas as categorias do item, diferente do orçado que é por
   * categoria).
   */
  qtdeDisp: number;

  jaPago: JaPagoLinha;

  /**
   * "Medido" (26/09/2026, pedido do Lucas) — acumulado% × valor do
   * empreiteiro (tela não simplificada). Fica na coluna "Já pago".
   */
  medido: number;

  /** Medido sobre o TOTAL do contrato (empreiteiro + reserva), usado com a tela simplificada. */
  medidoContrato: number;

  /** "Disponível (emp.)" da coluna Pagamento: (acumulado + avanço) × contrato do empreiteiro − já pago ao empreiteiro. */
  disponivelEmp: number;
  /** Idem sobre o total do contrato e o total já pago (tela simplificada). */
  disponivelContrato: number;
  /** "Medição" do Saldo remanescente: (100% − medição atual) × total do contrato. */
  saldoMedicao: number;

  /** Valor efetivo do rascunho de Pagamento — override do usuário, ou o calculado (pagar/reservar) se não houver. */
  pagamentoEmpDraft: number;
  pagamentoReservaDraft: number;
  pagamentoDraftTotal: number;

  saldoAposPagamentoEtapa: number;
  saldoAposPagamentoEmp: number;
  saldoAposPagamentoReserva: number;
  saldoAposPagamentoTotal: number;
}

/**
 * `TotaisEmpreita` + os totais dos blocos novos, para o rodapé TOTAIS da
 * tabela. Sem "Saldo disp." nem "Saldo após pagamento → Etapa": são
 * valores por etapa da EAP, somar entre linhas de serviços diferentes (ou
 * pior, repetidos na mesma etapa) não tem significado — a tela mostra "—"
 * nessas duas células do rodapé.
 */
export interface TotaisEmpreitaEstendida extends TotaisEmpreita {
  jaPagoEmpreiteiro: number;
  jaPagoReserva: number;
  jaPagoDivergencia: number;
  jaPagoTotal: number;
  /** Medido sobre o valor do empreiteiro (tela não simplificada). */
  medidoTotal: number;
  /** Medido sobre o total do contrato (tela simplificada). */
  medidoContratoTotal: number;
  disponivelEmpTotal: number;
  disponivelContratoTotal: number;
  saldoMedicaoTotal: number;
  pagamentoDraftEmp: number;
  pagamentoDraftReserva: number;
  pagamentoDraftTotal: number;
  saldoAposPagamentoEmp: number;
  saldoAposPagamentoReserva: number;
  saldoAposPagamentoTotal: number;
}
