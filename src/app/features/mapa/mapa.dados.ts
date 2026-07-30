/**
 * Listas fixas do Mapa — portadas de js/mapa/01-data.js.
 *
 * No app original estes valores estavam no código. Ficam aqui até
 * existirem os cadastros de Fornecedores e Responsáveis (telas previstas
 * no protótipo do Lucas), quando passam a vir da API.
 */

export const RESPONSAVEIS_OBRA = ['Otto', 'William', 'Tuany'] as const;
export const RESPONSAVEIS_MAPA = ['Taynara', 'Diogo', 'Lucas'] as const;
export const CLIENTES = ['Nilza', 'Carlos', 'Marcus'] as const;

export const FORNECEDORES = [
  'AC Coelho',
  'Japão da Construção',
  'Objetiva',
  'Itatiaia',
  'DF Atacadista',
] as const;

export const CONTATOS: Record<string, string[]> = {
  'AC Coelho': ['Rose', 'Lucas'],
  'Japão da Construção': ['Divino', 'Sirlei'],
  Objetiva: ['Erisson', 'Pablio'],
  Itatiaia: ['Diego', 'João'],
  'DF Atacadista': ['Cláudio', 'Renato'],
};

export const ETAPAS_POR_CLIENTE: Record<string, string[]> = {
  Nilza: ['1 - PINTURA', '2 - ELÉTRICA', '3 - HIDRÁULICA'],
  Carlos: ['1 - DEMOLIÇÃO', '2 - CONTRAPISO', '3 - ALVENARIA'],
  Marcus: ['1 - REVESTIMENTO', '2 - BANCADAS', '3 - LIMPEZA'],
};
