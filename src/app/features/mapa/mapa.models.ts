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
  cliente: string;
  responsavelObra: string;
  responsavelMapa: string;
  data: string;
  /** Frete pago por fora da nota — não sofre imposto. */
  freteParticular: number;
  /** Quando ligado, o usuário escolhe o fornecedor de cada item. */
  modoManual: boolean;
  /** Mapa finalizado: trava edição e libera Gerar PDF / Gerar Pagamento. */
  isConfirmed: boolean;
  confirmedAt: string;
}
