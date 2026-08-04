/** Modelos dos cadastros — telas novas, vindas do protótipo do Lucas. */

export type TipoPessoa = 'PF' | 'PJ';

/**
 * Cliente da construtora.
 *
 * Pessoa física e jurídica compartilham a mesma estrutura, com campos
 * que só valem para um dos dois. Manter num só tipo — em vez de dois
 * separados — evita duplicar tudo que é comum e simplifica a listagem.
 */
export interface Cliente {
  id: string;
  /** Código interno, ex.: "CLI-014". */
  identificacao: string;
  nome: string;
  tipo: TipoPessoa;
  /** CPF ou CNPJ, guardado só com os dígitos. */
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
  ativo: boolean;

  // ---- Só pessoa física ----
  rg: string;
  dataNascimento: string;

  // ---- Só pessoa jurídica ----
  inscricaoEstadual: string;
  /** Responsável legal pela empresa. */
  responsavel: string;
  documentoResponsavel: string;

  observacoes: string;
}

/** Responsável técnico por obras (engenheiro, técnico). */
export interface Responsavel {
  id: string;
  nome: string;
  /** CREA, CAU ou outro registro profissional. */
  registro: string;
  telefone: string;
  email: string;
  ativo: boolean;
  observacoes: string;
}

/** Empreiteiro que executa serviços. */
export interface Empreiteiro {
  id: string;
  nome: string;
  tipo: TipoPessoa;
  documento: string;
  telefone: string;
  email: string;
  /** Área em que atua: alvenaria, elétrica, pintura… */
  especialidade: string;
  ativo: boolean;
  observacoes: string;
}

/** Contato de um fornecedor — pode ter mais de um (comercial, financeiro…). */
export interface ContatoFornecedor {
  id: string;
  nome: string;
  telefone: string;
}

/**
 * Fornecedor de materiais/serviços (quem entra no Mapa de cotação).
 *
 * Pedido do Lucas (04/08/2026): hoje o Mapa aceita fornecedor digitado
 * livremente; a ideia é ter um cadastro de verdade, com contatos, pra
 * selecionar no Mapa em vez de digitar de novo toda vez.
 */
export interface Fornecedor {
  id: string;
  nome: string;
  tipo: TipoPessoa;
  documento: string;
  endereco: string;
  /** Área em que atua: material elétrico, ferragens… — texto livre por enquanto. */
  especialidade: string;
  observacoes: string;
  contatos: ContatoFornecedor[];
  ativo: boolean;
}
