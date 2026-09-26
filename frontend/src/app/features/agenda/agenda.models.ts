/** Modelos da Agenda (26/09/2026) — ver `AgendaController`. Datas/horas são "horário de parede": `YYYY-MM-DDTHH:mm`, sem fuso. */

export interface ParticipanteAgenda {
  id: number;
  nome: string;
}

export interface EventoAgenda {
  id: string;
  titulo: string;
  descricao: string;
  local: string;
  diaInteiro: boolean;
  /** `YYYY-MM-DDTHH:mm` */
  inicio: string;
  /** `YYYY-MM-DDTHH:mm` */
  fim: string;
  obraId: string | null;
  obraNome: string | null;
  criadoPorId: number | null;
  criadoPorNome: string | null;
  participantes: ParticipanteAgenda[];
  /** Só o criador e o administrador alteram/excluem. */
  podeEditar: boolean;
}

/** Corpo de POST/PUT — nomes em snake_case, como o servidor valida. */
export interface PayloadEventoAgenda {
  titulo: string;
  descricao: string;
  local: string;
  dia_inteiro: boolean;
  inicio: string;
  fim: string;
  obra_id: string | null;
  participantes: number[];
}

export type VisaoAgenda = 'mes' | 'semana' | 'dia';
