/**
 * Fluxo de Caixa da obra (01/10/2026, pedido do Lucas) — saldo acumulado
 * (recebimentos − pagamentos) numa linha do tempo, com o período trocável.
 *
 * Grade de períodos DIRIGIDA PELAS DATAS reais dos lançamentos (do primeiro
 * ao último encontrado, confirmado ou pendente) — diferente do Cronograma
 * de Desembolso (`cronograma-desembolso-engine.ts`), cuja grade é fixa
 * (data-base da obra + prazo em meses), pensada pra planejar períodos
 * futuros vazios. Aqui não há "prazo da obra" entrando na conta — só reaja
 * ao que já foi lançado. Isso implica alguma duplicação pequena da
 * lógica de "somar N dias/semanas/meses" com aquele arquivo — aceitável:
 * evita risco de regressão numa feature já publicada só pra compartilhar
 * umas poucas linhas de data-math. `paraDataLocal` (parse de data pura,
 * sem fuso) é reaproveitado de lá por ser 100% genérico e já exportado.
 */

import { paraDataLocal } from '../cronograma-desembolso/cronograma-desembolso-engine';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { Recebimento } from '../recebimentos/recebimentos.models';

export type UnidadePeriodoCaixa =
  | 'dia'
  | 'semana'
  | 'quinzena'
  | 'mes'
  | 'bimestre'
  | 'trimestre'
  | 'semestre'
  | 'ano';

export const UNIDADES_PERIODO_CAIXA: ReadonlyArray<{ chave: UnidadePeriodoCaixa; rotulo: string }> = [
  { chave: 'dia', rotulo: 'Dia' },
  { chave: 'semana', rotulo: 'Semana' },
  { chave: 'quinzena', rotulo: 'Quinzena' },
  { chave: 'mes', rotulo: 'Mês' },
  { chave: 'bimestre', rotulo: 'Bimestre' },
  { chave: 'trimestre', rotulo: 'Trimestre' },
  { chave: 'semestre', rotulo: 'Semestre' },
  { chave: 'ano', rotulo: 'Ano' },
];

/** Meses equivalentes de cada unidade baseada em mês — as demais (dia/semana/quinzena) somam dias direto. */
const MESES_POR_UNIDADE: Partial<Record<UnidadePeriodoCaixa, number>> = {
  mes: 1,
  bimestre: 2,
  trimestre: 3,
  semestre: 6,
  ano: 12,
};

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Teto de segurança — mesma ideia do Cronograma de Desembolso, contra grade gigante/loop em dado ruim. */
const LIMITE_PERIODOS = 2000;

export interface PeriodoCaixa {
  chave: string;
  inicio: Date;
  fim: Date;
  rotulo: string;
}

export interface PontoFluxoCaixa {
  periodo: PeriodoCaixa;
  entradasConfirmadas: number;
  saidasConfirmadas: number;
  entradasPendentes: number;
  saidasPendentes: number;
  saldoRealizadoAcumulado: number;
  saldoProjetadoAcumulado: number;
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function adicionarUnidade(data: Date, unidade: UnidadePeriodoCaixa): Date {
  const d = new Date(data);
  switch (unidade) {
    case 'dia':
      d.setDate(d.getDate() + 1);
      break;
    case 'semana':
      d.setDate(d.getDate() + 7);
      break;
    case 'quinzena':
      d.setDate(d.getDate() + 15);
      break;
    default:
      d.setMonth(d.getMonth() + (MESES_POR_UNIDADE[unidade] ?? 1));
      break;
  }
  return d;
}

function rotuloPeriodo(inicio: Date, unidade: UnidadePeriodoCaixa): string {
  const dia = String(inicio.getDate()).padStart(2, '0');
  const mesAno = `${NOMES_MES[inicio.getMonth()]}/${String(inicio.getFullYear()).slice(2)}`;

  switch (unidade) {
    case 'dia':
      return `${dia}/${String(inicio.getMonth() + 1).padStart(2, '0')}`;
    case 'semana':
    case 'quinzena':
      return `${dia} ${mesAno}`;
    case 'ano':
      return String(inicio.getFullYear());
    default:
      return mesAno;
  }
}

export function gerarPeriodosCaixa(
  dataInicio: Date,
  dataFim: Date,
  unidade: UnidadePeriodoCaixa,
): PeriodoCaixa[] {
  if (dataFim < dataInicio) return [];

  const periodos: PeriodoCaixa[] = [];
  let cursor = new Date(dataInicio);

  while (cursor <= dataFim && periodos.length < LIMITE_PERIODOS) {
    const fim = adicionarUnidade(cursor, unidade);
    periodos.push({ chave: paraIso(cursor), inicio: new Date(cursor), fim, rotulo: rotuloPeriodo(cursor, unidade) });
    cursor = fim;
  }
  return periodos;
}

interface Lancamento {
  data: Date;
  valor: number;
  sinal: 1 | -1;
  confirmado: boolean;
}

function lancamentosDePagamentos(pagamentos: readonly Pagamento[]): Lancamento[] {
  const lista: Lancamento[] = [];
  for (const p of pagamentos) {
    const bruto = p.dataPagamento || p.dataSolicitacao;
    if (!bruto) continue;
    lista.push({ data: paraDataLocal(bruto), valor: Number(p.valorTotal) || 0, sinal: -1, confirmado: p.status === 'confirmado' });
  }
  return lista;
}

function lancamentosDeRecebimentos(recebimentos: readonly Recebimento[]): Lancamento[] {
  const lista: Lancamento[] = [];
  for (const r of recebimentos) {
    const bruto = r.dataRecebimento || r.dataSolicitacao;
    if (!bruto) continue;
    lista.push({ data: paraDataLocal(bruto), valor: Number(r.valorTotal) || 0, sinal: 1, confirmado: r.status === 'confirmado' });
  }
  return lista;
}

/**
 * Saldo acumulado (recebimentos − pagamentos) por período, em duas séries:
 * "realizado" (só confirmados) e "projetado" (confirmados + pendentes). A
 * grade cobre do lançamento mais antigo ao mais novo — qualquer um dos
 * dois status, pra já incluir pendentes com data futura. Sem nenhum
 * lançamento, devolve lista vazia (tela mostra estado vazio).
 */
export function calcularFluxoCaixa(
  pagamentos: readonly Pagamento[],
  recebimentos: readonly Recebimento[],
  unidade: UnidadePeriodoCaixa,
): PontoFluxoCaixa[] {
  const lancamentos = [...lancamentosDePagamentos(pagamentos), ...lancamentosDeRecebimentos(recebimentos)];
  if (!lancamentos.length) return [];

  const datas = lancamentos.map((l) => l.data.getTime());
  const periodos = gerarPeriodosCaixa(new Date(Math.min(...datas)), new Date(Math.max(...datas)), unidade);
  if (!periodos.length) return [];

  const porPeriodo = periodos.map(() => ({ entradasConf: 0, saidasConf: 0, entradasPend: 0, saidasPend: 0 }));

  for (const lancamento of lancamentos) {
    const indice = periodos.findIndex((p) => lancamento.data >= p.inicio && lancamento.data < p.fim);
    if (indice < 0) continue;
    const balde = porPeriodo[indice];
    const entrada = lancamento.sinal === 1;
    if (lancamento.confirmado) {
      if (entrada) balde.entradasConf += lancamento.valor;
      else balde.saidasConf += lancamento.valor;
    } else {
      if (entrada) balde.entradasPend += lancamento.valor;
      else balde.saidasPend += lancamento.valor;
    }
  }

  let acumuladoRealizado = 0;
  let acumuladoProjetado = 0;
  return periodos.map((periodo, i) => {
    const balde = porPeriodo[i];
    acumuladoRealizado += balde.entradasConf - balde.saidasConf;
    acumuladoProjetado += balde.entradasConf + balde.entradasPend - balde.saidasConf - balde.saidasPend;
    return {
      periodo,
      entradasConfirmadas: balde.entradasConf,
      saidasConfirmadas: balde.saidasConf,
      entradasPendentes: balde.entradasPend,
      saidasPendentes: balde.saidasPend,
      saldoRealizadoAcumulado: acumuladoRealizado,
      saldoProjetadoAcumulado: acumuladoProjetado,
    };
  });
}
