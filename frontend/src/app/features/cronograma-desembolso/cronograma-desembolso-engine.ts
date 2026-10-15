/**
 * Geração dos períodos (colunas) do Cronograma de Desembolso (24/08/2026,
 * pedido do Lucas) — funções puras, sem Angular.
 *
 * Antes os períodos eram derivados só dos pagamentos já lançados (um mês
 * vira coluna se tiver pelo menos um pagamento confirmado nele) — sem
 * dado nenhum de planejamento futuro, não fazia sentido mostrar coluna
 * pra um mês vazio. Agora que existe "valor planejado" por período, o
 * cronograma precisa de uma grade FIXA cobrindo a obra inteira (da data
 * base até data base + prazo), não só os meses que já tiveram pagamento
 * — senão não daria pra planejar um mês futuro que ainda não tem nada
 * lançado.
 *
 * "Semana"/"quinzena" contam em incrementos fixos de 7/15 dias a partir
 * da data base, não alinhados ao calendário (não é "toda segunda-feira"
 * nem "dia 1 e dia 16 de cada mês") — mais simples e consistente com os
 * outros três (dia/mês/ano, que também contam a partir da data base, não
 * do início do mês/ano civil).
 */

export type UnidadePeriodo = 'dia' | 'semana' | 'quinzena' | 'mes' | 'ano';

export const UNIDADES_PERIODO: ReadonlyArray<{ chave: UnidadePeriodo; rotulo: string }> = [
  { chave: 'dia', rotulo: 'Dia' },
  { chave: 'semana', rotulo: 'Semana' },
  { chave: 'quinzena', rotulo: 'Quinzena' },
  { chave: 'mes', rotulo: 'Mês' },
  { chave: 'ano', rotulo: 'Ano' },
];

export interface Periodo {
  /** Data de início (ISO "AAAA-MM-DD") — chave estável, independente da unidade escolhida depois. */
  chave: string;
  inicio: Date;
  /** Fim EXCLUSIVO — início do próximo período. */
  fim: Date;
  rotulo: string;
}

const NOMES_MES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function paraIso(data: Date): string {
  // Getters locais (e não `toISOString()`): as datas daqui são meia-noite LOCAL, e em UTC
  // elas podem cair no dia anterior conforme o fuso do navegador.
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Meia-noite local, sem hora — evita problema de fuso ao comparar/formatar datas puras. */
export function paraDataLocal(isoOuData: string | Date): Date {
  if (isoOuData instanceof Date) return new Date(isoOuData.getFullYear(), isoOuData.getMonth(), isoOuData.getDate());
  const [ano, mes, dia] = isoOuData.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1);
}

function adicionarUnidade(data: Date, unidade: UnidadePeriodo, quantidade: number): Date {
  const d = new Date(data);
  switch (unidade) {
    case 'dia':
      d.setDate(d.getDate() + quantidade);
      break;
    case 'semana':
      d.setDate(d.getDate() + quantidade * 7);
      break;
    case 'quinzena':
      d.setDate(d.getDate() + quantidade * 15);
      break;
    case 'mes':
      d.setMonth(d.getMonth() + quantidade);
      break;
    case 'ano':
      d.setFullYear(d.getFullYear() + quantidade);
      break;
  }
  return d;
}

function rotuloPeriodo(inicio: Date, unidade: UnidadePeriodo): string {
  const dia = String(inicio.getDate()).padStart(2, '0');
  const mesAno = `${NOMES_MES[inicio.getMonth()]}/${String(inicio.getFullYear()).slice(2)}`;

  switch (unidade) {
    case 'dia':
      return `${dia}/${String(inicio.getMonth() + 1).padStart(2, '0')}`;
    case 'semana':
    case 'quinzena':
      return `${dia} ${mesAno}`;
    case 'mes':
      return mesAno;
    case 'ano':
      return String(inicio.getFullYear());
  }
}

/**
 * Gera a grade fixa de períodos entre `dataBase` (inclusive) e `dataBase`
 * + `prazoMeses` (exclusive), na unidade escolhida. Vazio se faltar
 * `dataBase` ou `prazoMeses` — quem chama decide o que mostrar nesse caso
 * (o cronograma pede os dois antes de gerar a grade).
 */
export function gerarPeriodos(
  dataBase: Date | null,
  prazoMeses: number | null,
  unidade: UnidadePeriodo,
): Periodo[] {
  if (!dataBase || !prazoMeses || prazoMeses <= 0) return [];

  const fimTotal = adicionarUnidade(dataBase, 'mes', prazoMeses);
  const periodos: Periodo[] = [];
  let cursor = new Date(dataBase);

  // Piso de segurança — evita loop indefinido se algo vier absurdo (ex.:
  // prazo de 600 meses em unidade "dia" seriam ~18.000 colunas).
  const LIMITE_PERIODOS = 2000;

  while (cursor < fimTotal && periodos.length < LIMITE_PERIODOS) {
    const fim = adicionarUnidade(cursor, unidade, 1);
    periodos.push({
      chave: paraIso(cursor),
      inicio: cursor,
      fim,
      rotulo: rotuloPeriodo(cursor, unidade),
    });
    cursor = fim;
  }

  return periodos;
}

/** Período (da grade) que contém a data informada — usado pra encaixar pagamentos realizados na coluna certa. */
export function periodoContendo(periodos: Periodo[], data: Date): Periodo | undefined {
  return periodos.find((p) => data >= p.inicio && data < p.fim);
}
