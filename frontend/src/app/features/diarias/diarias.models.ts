/**
 * Modelos da aba Diárias (F7, 22/09/2026) — ver o motor de rateio em
 * `diarias-engine.ts` e a decisão do Lucas no plano ("Aba Diárias").
 */
import { ChaveTipo } from '../eap/eap.models';

/** Os 4 adicionais, além da diária em si. */
export type CampoAdicional = 'valeTransporte' | 'valeAlimentacao' | 'combustivel' | 'valorExtra';

/** `'diaria'` = o valor da diária (inteira ou meia); os outros 4 são os adicionais. */
export type CampoDiaria = 'diaria' | CampoAdicional;

export const CAMPOS_DIARIA: readonly CampoDiaria[] = [
  'diaria',
  'valeTransporte',
  'valeAlimentacao',
  'combustivel',
  'valorExtra',
];

export const ROTULO_CAMPO_DIARIA: Record<CampoDiaria, string> = {
  diaria: 'Diária',
  valeTransporte: 'Vale transporte',
  valeAlimentacao: 'Vale alimentação',
  combustivel: 'Combustível',
  valorExtra: 'Valor extra',
};

/**
 * Mapa de configuração ("Categorias de custo padrão" em Configurações, uma
 * por empresa): em qual categoria de custo (a mesma da EAP/Pagamento) cada
 * um dos 5 tipos de lançamento da diária entra. Vale pra toda diária —
 * não é escolhido lançamento a lançamento.
 */
export type CategoriasDiaria = Record<CampoDiaria, ChaveTipo>;

/** Padrão de fábrica, usado até a empresa configurar o próprio (e nos testes). */
export const CATEGORIAS_DIARIA_PADRAO: CategoriasDiaria = {
  diaria: 'maoDeObra',
  valeTransporte: 'outros',
  valeAlimentacao: 'outros',
  combustivel: 'outros',
  valorExtra: 'outros',
};

/** Uma etapa da EAP e o percentual da diária que vai pra ela. */
export interface EtapaDiaria {
  eapItemId: string;
  /** 0 a 100. A soma de todas as etapas de uma diária tem que fechar em 100. */
  percentual: number;
}

export type StatusDiaria = 'rascunho' | 'fechada';

/**
 * Um lançamento de diária. `profissional*` e `valorDiariaBase` são SNAPSHOT
 * do cadastro no momento do lançamento (decisão do plano: "snapshot de nome/
 * função/valor da diária, para não mudar diárias já pagas se o cadastro
 * mudar") — mudar o cadastro depois não altera diárias já lançadas.
 */
export interface Diaria {
  id: string;
  obraId: string;
  profissionalId: string;
  profissionalNome: string;
  profissionalFuncao: string;
  data: string;
  meiaDiaria: boolean;
  /** Valor da diária inteira, vindo do cadastro no momento do lançamento (antes do desconto da meia diária). */
  valorDiariaBase: number;
  etapas: EtapaDiaria[];
  valeTransporte: number;
  valeAlimentacao: number;
  combustivel: number;
  valorExtra: number;
  observacoes: string;
  status: StatusDiaria;
  /** Id do Pagamento gerado no fechamento — presente só quando `status === 'fechada'`. */
  pagamentoId: string | null;
  /** `'manual'` (lançada na aba) ou `'rdo'` (virá do RDO na F9 — ainda não implementado). */
  origem: 'manual' | 'rdo';
}
