/**
 * Listas fixas do Mapa — portadas de js/mapa/01-data.js.
 *
 * Cliente, Responsável da obra e Etapa passaram a vir de dados reais
 * (obras cadastradas, cadastro de Responsáveis e EAP da obra — revisão
 * 31/07/2026, ver MapaStore). Fornecedores/Contatos continuam fixos aqui
 * até existir o cadastro de Fornecedores previsto no protótipo do Lucas.
 */

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
