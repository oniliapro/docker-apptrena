/** Modelos do Mapa de Fornecedores — portados de js/mapa/*.js. */

import { ChaveTipo } from '../eap/eap.models';

/** Um fornecedor concorrendo no mapa. */
export interface Fornecedor {
  nome: string;
  contato: string;
  /** Fornecedor desmarcado sai da comparação sem perder os preços. */
  ativo: boolean;
  /** Alíquota em porcentagem (ex.: 18 para 18%). */
  imposto: number;
  /** Frete cobrado pela loja — entra na nota e é tributado. */
  frete: number;
  /** Desconto concedido na nota; reduz a base de imposto. */
  desconto: number;
}

/**
 * Item cotado. `unit` guarda o preço unitário de cada fornecedor, na
 * mesma ordem do array de fornecedores.
 */
export interface ItemMapa {
  id: string;
  desc: string;
  qtde: number;
  unid: string;
  /** Preço unitário por fornecedor, indexado por posição. */
  unit: number[];
  /** Categoria de custo, para cruzar com a EAP. */
  tipo: ChaveTipo | '';
  /** Item da EAP a que este item se refere. */
  eapId: string;
  /** Etapa da obra. */
  etapa: string;
  /** Fornecedor escolhido à mão, quando o modo manual está ligado. */
  choice: number | null;
}

/**
 * Coluna alvo de um "colar com quebra de linha" (31/08/2026, pedido do
 * Lucas): cada linha do texto colado vira uma linha da tabela, na MESMA
 * coluna onde o colar aconteceu — ver `MapaStore.colarEmColuna`.
 */
export type ColunaMapaColavel =
  | { tipo: 'desc' | 'unid' | 'qtde' | 'tipoCusto' | 'etapa' }
  | { tipo: 'preco'; fornecedorIndice: number };

/** Item vencedor de uma linha: qual fornecedor e por quanto. */
export interface Vencedor {
  indice: number;
  total: number;
}

/** Ligação item → fornecedor escolhido. */
export interface Alocacao {
  itemIndex: number;
  supplierIndex: number;
}

/** Nota fiscal calculada de um fornecedor. */
export interface NotaFornecedor {
  /** Se o fornecedor ficou com algum item. */
  used: boolean;
  /** Soma dos itens sem imposto. */
  itensBase: number;
  /** Soma dos itens com o imposto de cada item. */
  itensComImposto: number;
  frete: number;
  desconto: number;
  /** itensBase + frete − desconto. */
  baseNota: number;
  impostoNota: number;
  totalNota: number;
}

export interface TotaisNotas {
  itensBase: number;
  itensComImposto: number;
  frete: number;
  desconto: number;
  baseNota: number;
  impostoNota: number;
  totalNota: number;
}

/** Resultado do cenário "compra fracionada" (cada item no mais barato). */
export interface Fracionado {
  totalItens: number;
  totalItensComFrete: number;
  used: boolean;
}

/** Item da EAP usado para calcular saldo entre orçado e cotado. */
export interface ItemEapSnapshot {
  id: string;
  isGroup: boolean;
  eap: string;
  desc: string;
  qtde: number;
  unit: Record<ChaveTipo, number>;
  bdiMode: 'pct' | 'value';
  bdiPercent: number;
  bdiValue: number;
}

export interface CabecalhoEapSnapshot {
  mapNumber: string;
  bdiMode: 'pct' | 'value';
  bdiPercent: number;
  bdiValue: number;
}

/** Cabeçalho do próprio mapa. */
export interface CabecalhoMapa {
  numeroMapa: string;
  descricao: string;
  /**
   * Nome do cliente — não é mais digitado nem escolhido aqui (04/08/2026):
   * é puxado automaticamente da Obra dona do mapa (`MapaStore.obraAtual`),
   * só guardado neste campo pra manter o dado no registro do mapa (ex.:
   * impressão). Ver `nomeDaObra`/`obraAtual` no store — o vínculo de
   * verdade é `obra_id`, fixo desde a criação do mapa.
   */
  cliente: string;
  responsavelObra: string;
  responsavelMapa: string;
  /**
   * Data/hora de criação do mapa (`created_at`) — só leitura, preenchida
   * pelo servidor. Substitui o antigo campo "Data" editável à mão
   * (04/08/2026, pedido do Lucas: as duas datas do cabeçalho devem ser
   * automáticas, com hora, e travadas pra edição).
   */
  criadoEm: string;
  /** Frete pago por fora da nota — não sofre imposto. */
  freteParticular: number;
  /** Nome do freteiro (transportador) responsável pelo frete particular. */
  freteiroParticular: string;
  /**
   * Quando ligado (padrão — sempre foi assim), o frete de cada
   * fornecedor vira uma linha própria no pagamento gerado, com etapa
   * opcional (`freteEtapaId`). Desligado, o frete não vira linha: é
   * distribuído proporcionalmente entre os itens de cada fornecedor,
   * embutido no valor de cada um (pedido do Lucas, 16/08/2026 — ver
   * `MapaStore.construirLinhasDoFornecedor`).
   */
  lancarFreteComoItem: boolean;
  /** Etapa da linha de frete no pagamento — só usada quando `lancarFreteComoItem` está ligado. */
  freteEtapaId: string;
  /**
   * Categoria de custo da linha de frete no pagamento gerado — só usada
   * quando `lancarFreteComoItem` está ligado (19/08/2026, pedido do
   * Lucas). Vazio = "S/ categoria" (comportamento de sempre: a linha
   * nasce sem tipo definido).
   */
  freteCategoriaTipo: ChaveTipo | '';
  /**
   * Mesma ideia de `lancarFreteComoItem`, só que pro imposto+desconto da
   * nota (01/09/2026, pedido do Lucas) — os dois sempre andaram juntos
   * numa linha só ("Impostos e desconto da nota"/parte de "Impostos,
   * frete e desconto da nota"), então ganham UM toggle só, independente
   * do de frete: ligado, viram uma linha própria no pagamento gerado
   * (com etapa/categoria opcionais); desligado, ficam embutidos
   * proporcionalmente no valor dos itens de cada fornecedor — mesmo
   * comportamento de sempre, agora dá pra desligar.
   */
  lancarImpostoDescontoComoItem: boolean;
  /** Etapa da linha de imposto/desconto no pagamento — só usada quando `lancarImpostoDescontoComoItem` está ligado. */
  impostoDescontoEtapaId: string;
  /** Categoria de custo da linha de imposto/desconto no pagamento gerado — só usada quando `lancarImpostoDescontoComoItem` está ligado. */
  impostoDescontoCategoriaTipo: ChaveTipo | '';
  /** Quando ligado, o usuário escolhe o fornecedor de cada item. */
  modoManual: boolean;
  /** Mapa finalizado: trava edição e libera Gerar PDF / Gerar Pagamento. */
  isConfirmed: boolean;
  /**
   * Data/hora da PRIMEIRA finalização — trava nesse valor pra sempre
   * (20/08/2026, pedido do Lucas: antes era regravada a cada "Finalizar
   * mapa", perdendo a data original sempre que o mapa era reaberto e
   * finalizado de novo). Quem acompanha finalizações seguintes é
   * `ultimaFinalizacaoEm`.
   */
  confirmedAt: string;
  /** Data/hora da finalização mais recente — atualiza a cada "Finalizar mapa", inclusive a primeira. */
  ultimaFinalizacaoEm: string;
}
