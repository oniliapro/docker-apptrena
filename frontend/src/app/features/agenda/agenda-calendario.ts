/**
 * Cálculos puros do calendário da Agenda (26/09/2026) — sem Angular, pra testar
 * à parte. Datas em `YYYY-MM-DD`, data+hora em `YYYY-MM-DDTHH:mm` (horário de
 * parede, sem fuso).
 */
import { EventoAgenda, VisaoAgenda } from './agenda.models';

export const MINUTOS_DO_DIA = 24 * 60;

export function dataIso(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** `YYYY-MM-DD` → Date às 12:00 local (evita saltos de horário de verão). */
export function paraData(iso: string): Date {
  const [ano, mes, dia] = iso.substring(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

export function somarDias(iso: string, dias: number): string {
  const data = paraData(iso);
  data.setDate(data.getDate() + dias);
  return dataIso(data);
}

export function domingoDaSemana(iso: string): string {
  return somarDias(iso, -paraData(iso).getDay());
}

/** Minutos desde 00:00 de um `YYYY-MM-DDTHH:mm`. */
export function minutosDoDia(dataHora: string): number {
  const [hora, minuto] = dataHora.substring(11, 16).split(':').map(Number);
  return (hora || 0) * 60 + (minuto || 0);
}

export function horaTexto(dataHora: string): string {
  return dataHora.substring(11, 16);
}

/** Dias mostrados pela visão: mês = da 1ª semana à última (múltiplo de 7), semana = 7 dias, dia = 1. */
export function diasDaVisao(visao: VisaoAgenda, referencia: string): string[] {
  if (visao === 'dia') return [referencia];
  if (visao === 'semana') {
    const inicio = domingoDaSemana(referencia);
    return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  }

  const primeiro = referencia.substring(0, 8) + '01';
  const ultimoDate = paraData(primeiro);
  ultimoDate.setMonth(ultimoDate.getMonth() + 1);
  ultimoDate.setDate(0);
  const inicio = domingoDaSemana(primeiro);
  const fim = somarDias(dataIso(ultimoDate), 6 - ultimoDate.getDay());

  const dias: string[] = [];
  for (let cursor = inicio; cursor <= fim; cursor = somarDias(cursor, 1)) dias.push(cursor);
  return dias;
}

/** Move a referência um "passo" da visão (mês, semana ou dia). */
export function moverReferencia(visao: VisaoAgenda, referencia: string, passo: number): string {
  if (visao === 'dia') return somarDias(referencia, passo);
  if (visao === 'semana') return somarDias(referencia, passo * 7);
  const data = paraData(referencia.substring(0, 8) + '01');
  data.setMonth(data.getMonth() + passo);
  return dataIso(data);
}

/** O compromisso toca este dia? (`fim` exatamente à meia-noite não conta como o dia seguinte.) */
export function eventoNoDia(evento: EventoAgenda, dia: string): boolean {
  const inicioDia = evento.inicio.substring(0, 10);
  let fimDia = evento.fim.substring(0, 10);
  if (fimDia > inicioDia && evento.fim.substring(11, 16) === '00:00') fimDia = somarDias(fimDia, -1);
  return inicioDia <= dia && dia <= fimDia;
}

/** Fatia do compromisso dentro de um dia, em minutos (para a grade de horas). */
export interface FatiaDoDia {
  evento: EventoAgenda;
  inicioMin: number;
  fimMin: number;
  /** Coluna (0..colunas-1) dentro do bloco de sobreposição e quantas colunas o bloco tem. */
  coluna: number;
  colunas: number;
}

/**
 * Posiciona os compromissos com hora de um dia lado a lado quando se sobrepõem
 * (mesma ideia do Google Agenda): forma grupos de eventos que se tocam em
 * cadeia e reparte cada grupo em colunas.
 */
export function fatiasDoDia(eventos: readonly EventoAgenda[], dia: string): FatiaDoDia[] {
  const fatias: FatiaDoDia[] = eventos
    .filter((e) => !e.diaInteiro && eventoNoDia(e, dia))
    .map((evento) => {
      const comecaHoje = evento.inicio.substring(0, 10) === dia;
      const terminaHoje = evento.fim.substring(0, 10) === dia;
      const inicioMin = comecaHoje ? minutosDoDia(evento.inicio) : 0;
      let fimMin = terminaHoje ? minutosDoDia(evento.fim) : MINUTOS_DO_DIA;
      // Compromisso muito curto (ou sem duração) ainda precisa de altura pra ser clicável.
      if (fimMin - inicioMin < 30) fimMin = Math.min(MINUTOS_DO_DIA, inicioMin + 30);
      return { evento, inicioMin, fimMin, coluna: 0, colunas: 1 };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin);

  let grupo: FatiaDoDia[] = [];
  let fimDoGrupo = -1;
  const fecharGrupo = () => {
    const colunasFim: number[] = [];
    for (const fatia of grupo) {
      let coluna = colunasFim.findIndex((fim) => fim <= fatia.inicioMin);
      if (coluna < 0) coluna = colunasFim.length;
      colunasFim[coluna] = fatia.fimMin;
      fatia.coluna = coluna;
    }
    for (const fatia of grupo) fatia.colunas = colunasFim.length;
    grupo = [];
  };

  for (const fatia of fatias) {
    if (grupo.length && fatia.inicioMin >= fimDoGrupo) fecharGrupo();
    grupo.push(fatia);
    fimDoGrupo = Math.max(fimDoGrupo, fatia.fimMin);
  }
  if (grupo.length) fecharGrupo();

  return fatias;
}

/** Uma cor por obra (estável): a mesma obra sempre pinta com a mesma cor; compromisso sem obra usa a primeira. */
const PALETA = ['#4a7a94', '#4c7a54', '#c6822a', '#8a5a9e', '#c4462f', '#2f8f8f', '#7a6a3a', '#5a63a8'];

export function corDoEvento(obraId: string | null): string {
  if (!obraId) return PALETA[0];
  let hash = 0;
  for (let i = 0; i < obraId.length; i++) hash = (hash * 31 + obraId.charCodeAt(i)) >>> 0;
  return PALETA[1 + (hash % (PALETA.length - 1))];
}
