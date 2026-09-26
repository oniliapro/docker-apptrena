import { Component, ElementRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  FatiaDoDia,
  corDoEvento,
  dataIso,
  diasDaVisao,
  eventoNoDia,
  fatiasDoDia,
  horaTexto,
  moverReferencia,
  paraData,
} from './agenda-calendario';
import { EventoAgenda, ParticipanteAgenda, PayloadEventoAgenda, VisaoAgenda } from './agenda.models';

/** Altura de uma hora na grade da semana/dia, em px (`--hora` no scss usa o mesmo valor). */
const PX_POR_HORA = 44;
const MAX_CHIPS_NO_MES = 3;

const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const NOMES_DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Rascunho do popup — campos separados de data e hora (o que os `<input type="date|time">` entregam). */
interface RascunhoEvento {
  id: string | null;
  titulo: string;
  descricao: string;
  local: string;
  diaInteiro: boolean;
  dataInicio: string;
  horaInicio: string;
  dataFim: string;
  horaFim: string;
  obraId: string;
  participantes: number[];
  podeEditar: boolean;
  criadoPorNome: string | null;
}

/**
 * Agenda (26/09/2026, pedido do Lucas) — compromissos com horário, no estilo do
 * Google Agenda: visões de mês, semana e dia, clique no dia/horário para marcar,
 * e participantes escolhidos entre os usuários da empresa.
 *
 * Um componente só, dois lugares (mesmo padrão de Mapas/MapasObra e RDO):
 *  - `/agenda` (menu lateral): compromissos de TODAS as obras (e os sem obra),
 *    com filtro por obra; o popup deixa escolher a obra (ou nenhuma);
 *  - `/obras/:id/agenda` (aba da obra): só os compromissos daquela obra; os
 *    novos já nascem ligados a ela.
 * Todos os usuários da empresa enxergam os compromissos; só quem criou (e o
 * administrador) altera ou exclui.
 */
@Component({
  selector: 'app-agenda',
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
})
export class Agenda implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** Preenchido pela rota da aba da obra; vazio na Agenda geral. */
  readonly obraId = input<string>('', { alias: 'id' });

  protected readonly obras = signal<Obra[]>([]);
  protected readonly usuarios = signal<ParticipanteAgenda[]>([]);
  protected readonly visao = signal<VisaoAgenda>('mes');
  protected readonly referencia = signal(dataIso(new Date()));
  protected readonly filtroObra = signal('');
  protected readonly somenteMeus = signal(false);
  protected readonly eventos = signal<EventoAgenda[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly rascunho = signal<RascunhoEvento | null>(null);
  protected readonly buscaParticipante = signal('');
  protected readonly erroPopup = signal<string | null>(null);

  protected readonly hoje = dataIso(new Date());
  protected readonly nomesDias = NOMES_DIAS;
  protected readonly horas = Array.from({ length: 24 }, (_, i) => i);
  protected readonly alturaDoDia = 24 * PX_POR_HORA;
  protected readonly pxPorHora = PX_POR_HORA;

  protected readonly naObra = computed(() => !!this.obraId());
  protected readonly dias = computed(() => diasDaVisao(this.visao(), this.referencia()));
  protected readonly mesDaReferencia = computed(() => this.referencia().substring(0, 7));

  /** Semanas do mês (visão mês) — cada uma com 7 dias. */
  protected readonly semanas = computed(() => {
    const dias = this.dias();
    const semanas: string[][] = [];
    for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
    return semanas;
  });

  private get meuId(): number {
    return Number(this.auth.usuario()?.id) || 0;
  }

  /** Compromissos depois do filtro "só os meus". */
  protected readonly eventosVisiveis = computed(() => {
    const todos = this.eventos();
    if (!this.somenteMeus()) return todos;
    const meu = this.meuId;
    return todos.filter((e) => e.criadoPorId === meu || e.participantes.some((p) => p.id === meu));
  });

  protected readonly titulo = computed(() => {
    const ref = this.referencia();
    const data = paraData(ref);
    const visao = this.visao();
    if (visao === 'mes') return `${NOMES_MESES[data.getMonth()]} de ${data.getFullYear()}`;
    if (visao === 'dia') {
      return `${NOMES_DIAS_LONGOS[data.getDay()]}, ${data.getDate()} de ${NOMES_MESES[data.getMonth()]} de ${data.getFullYear()}`;
    }
    const dias = this.dias();
    const primeiro = paraData(dias[0]);
    const ultimo = paraData(dias[6]);
    const mesmoMes = primeiro.getMonth() === ultimo.getMonth();
    return mesmoMes
      ? `${primeiro.getDate()} – ${ultimo.getDate()} de ${NOMES_MESES[ultimo.getMonth()]} de ${ultimo.getFullYear()}`
      : `${primeiro.getDate()} de ${NOMES_MESES[primeiro.getMonth()].substring(0, 3)} – ${ultimo.getDate()} de ${NOMES_MESES[ultimo.getMonth()].substring(0, 3)} de ${ultimo.getFullYear()}`;
  });

  /** Participantes do popup que combinam com a busca. */
  protected readonly usuariosFiltrados = computed(() => {
    const termo = this.buscaParticipante().trim().toLowerCase();
    return this.usuarios().filter((u) => !termo || u.nome.toLowerCase().includes(termo));
  });

  /** Recarrega sempre que a janela de datas, a visão ou a obra mudam. */
  private readonly recarregar = effect(() => {
    const dias = this.dias();
    const obra = this.obraId() || this.filtroObra();
    untracked(() => this.carregar(dias[0], dias[dias.length - 1], obra));
  });

  /** Nas visões de semana/dia a grade abre já perto do começo do expediente (7h), não à meia-noite. */
  private readonly corpoDaGrade = viewChild<ElementRef<HTMLElement>>('corpo');
  private readonly rolarParaOExpediente = effect(() => {
    const corpo = this.corpoDaGrade()?.nativeElement;
    if (corpo) corpo.scrollTop = 7 * PX_POR_HORA - 4;
  });

  ngOnInit(): void {
    this.api.usuariosDaAgenda().subscribe({
      next: (lista) => this.usuarios.set(lista),
      error: () => this.usuarios.set([]),
    });
    if (!this.naObra()) {
      this.api.listarObras().subscribe({
        next: (lista) => this.obras.set(lista),
        error: () => this.obras.set([]),
      });
    }
  }

  private carregar(inicio: string, fim: string, obraId: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.api.listarAgenda(inicio, fim, obraId || undefined).subscribe({
      next: (lista) => {
        this.eventos.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.carregando.set(false);
        this.erro.set('Não foi possível carregar a agenda.');
      },
    });
  }

  // ------------------------------------------------------------------
  // Navegação
  // ------------------------------------------------------------------
  protected irParaHoje(): void {
    this.referencia.set(dataIso(new Date()));
  }

  protected mover(passo: number): void {
    this.referencia.set(moverReferencia(this.visao(), this.referencia(), passo));
  }

  protected mudarVisao(visao: VisaoAgenda): void {
    this.visao.set(visao);
  }

  protected abrirDia(dia: string): void {
    this.referencia.set(dia);
    this.visao.set('dia');
  }

  protected mudarFiltroObra(evento: Event): void {
    this.filtroObra.set((evento.target as HTMLSelectElement).value);
  }

  protected alternarMeus(evento: Event): void {
    this.somenteMeus.set((evento.target as HTMLInputElement).checked);
  }

  // ------------------------------------------------------------------
  // Exibição
  // ------------------------------------------------------------------
  protected numeroDoDia(dia: string): number {
    return paraData(dia).getDate();
  }

  protected rotuloDoDia(dia: string): string {
    const data = paraData(dia);
    return `${NOMES_DIAS[data.getDay()]} ${data.getDate()}`;
  }

  protected doMes(dia: string): boolean {
    return dia.substring(0, 7) === this.mesDaReferencia();
  }

  protected eventosDoDia(dia: string): EventoAgenda[] {
    return this.eventosVisiveis()
      .filter((e) => eventoNoDia(e, dia))
      .sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.inicio.localeCompare(b.inicio));
  }

  protected chipsDoMes(dia: string): EventoAgenda[] {
    return this.eventosDoDia(dia).slice(0, MAX_CHIPS_NO_MES);
  }

  protected excedenteDoMes(dia: string): number {
    return Math.max(0, this.eventosDoDia(dia).length - MAX_CHIPS_NO_MES);
  }

  protected eventosDiaInteiro(dia: string): EventoAgenda[] {
    return this.eventosDoDia(dia).filter((e) => e.diaInteiro);
  }

  protected fatias(dia: string): FatiaDoDia[] {
    return fatiasDoDia(this.eventosVisiveis(), dia);
  }

  protected temDiaInteiro(): boolean {
    return this.dias().some((dia) => this.eventosDiaInteiro(dia).length > 0);
  }

  protected estiloDaFatia(fatia: FatiaDoDia): Record<string, string> {
    const largura = 100 / fatia.colunas;
    return {
      top: `${(fatia.inicioMin / 60) * PX_POR_HORA}px`,
      height: `${((fatia.fimMin - fatia.inicioMin) / 60) * PX_POR_HORA - 2}px`,
      left: `calc(${fatia.coluna * largura}% + 1px)`,
      width: `calc(${largura}% - 3px)`,
      '--cor-evento': this.cor(fatia.evento),
    };
  }

  protected cor(evento: EventoAgenda): string {
    return corDoEvento(evento.obraId);
  }

  protected hora(dataHora: string): string {
    return horaTexto(dataHora);
  }

  /** "14:00 – 15:30" (ou "dia inteiro"), com a data quando o compromisso passa de um dia para outro. */
  protected quando(evento: EventoAgenda): string {
    if (evento.diaInteiro) return 'Dia inteiro';
    const mesmoDia = evento.inicio.substring(0, 10) === evento.fim.substring(0, 10);
    return mesmoDia
      ? `${horaTexto(evento.inicio)} – ${horaTexto(evento.fim)}`
      : `${this.dataCurta(evento.inicio)} ${horaTexto(evento.inicio)} – ${this.dataCurta(evento.fim)} ${horaTexto(evento.fim)}`;
  }

  private dataCurta(dataHora: string): string {
    const [, mes, dia] = dataHora.substring(0, 10).split('-');
    return `${dia}/${mes}`;
  }

  protected linhaDoAgora(): number | null {
    if (!this.dias().includes(this.hoje)) return null;
    const agora = new Date();
    return ((agora.getHours() * 60 + agora.getMinutes()) / 60) * PX_POR_HORA;
  }

  protected dicaDoEvento(evento: EventoAgenda): string {
    const partes = [evento.titulo, this.quando(evento)];
    if (evento.obraNome) partes.push(`Obra: ${evento.obraNome}`);
    if (evento.local) partes.push(`Local: ${evento.local}`);
    if (evento.participantes.length) partes.push(`Participantes: ${evento.participantes.map((p) => p.nome).join(', ')}`);
    return partes.join('\n');
  }

  // ------------------------------------------------------------------
  // Popup de compromisso
  // ------------------------------------------------------------------
  protected novoNoDia(dia: string, hora = 9): void {
    const inicio = String(Math.min(23, hora)).padStart(2, '0');
    const fim = String(Math.min(23, hora + 1)).padStart(2, '0');
    this.abrirRascunho({
      id: null,
      titulo: '',
      descricao: '',
      local: '',
      diaInteiro: false,
      dataInicio: dia,
      horaInicio: `${inicio}:00`,
      dataFim: dia,
      horaFim: hora >= 23 ? '23:59' : `${fim}:00`,
      obraId: this.obraId() || this.filtroObra(),
      participantes: [],
      podeEditar: true,
      criadoPorNome: null,
    });
  }

  protected novoAgora(): void {
    const referencia = this.dias().includes(this.hoje) ? this.hoje : this.referencia();
    this.novoNoDia(referencia, referencia === this.hoje ? Math.min(23, new Date().getHours() + 1) : 9);
  }

  /** Clique numa faixa vazia da grade de horas: nasce ali, com 1 hora de duração. */
  protected novoNaGrade(dia: string, evento: MouseEvent): void {
    const alvo = evento.currentTarget as HTMLElement;
    if (evento.target !== alvo) return;
    const y = evento.clientY - alvo.getBoundingClientRect().top;
    this.novoNoDia(dia, Math.max(0, Math.min(23, Math.floor(y / PX_POR_HORA))));
  }

  protected abrirEvento(evento: EventoAgenda, clique?: Event): void {
    clique?.stopPropagation();
    this.abrirRascunho({
      id: evento.id,
      titulo: evento.titulo,
      descricao: evento.descricao,
      local: evento.local,
      diaInteiro: evento.diaInteiro,
      dataInicio: evento.inicio.substring(0, 10),
      horaInicio: horaTexto(evento.inicio),
      dataFim: evento.fim.substring(0, 10),
      horaFim: horaTexto(evento.fim),
      obraId: evento.obraId ?? '',
      participantes: evento.participantes.map((p) => p.id),
      podeEditar: evento.podeEditar,
      criadoPorNome: evento.criadoPorNome,
    });
  }

  private abrirRascunho(rascunho: RascunhoEvento): void {
    this.erroPopup.set(null);
    this.buscaParticipante.set('');
    this.rascunho.set(rascunho);
  }

  protected fecharPopup(): void {
    this.rascunho.set(null);
  }

  protected editarCampo(campo: 'titulo' | 'descricao' | 'local' | 'dataInicio' | 'horaInicio' | 'dataFim' | 'horaFim', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.rascunho.update((r) => {
      if (!r) return r;
      const novo = { ...r, [campo]: valor };
      // Mudar o dia de início arrasta o de fim junto se ficaria antes.
      if (campo === 'dataInicio' && novo.dataFim < valor) novo.dataFim = valor;
      return novo;
    });
  }

  protected alternarDiaInteiro(evento: Event): void {
    const marcado = (evento.target as HTMLInputElement).checked;
    this.rascunho.update((r) => (r ? { ...r, diaInteiro: marcado } : r));
  }

  protected escolherObra(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.rascunho.update((r) => (r ? { ...r, obraId: valor } : r));
  }

  protected participa(id: number): boolean {
    return !!this.rascunho()?.participantes.includes(id);
  }

  protected alternarParticipante(id: number): void {
    this.rascunho.update((r) => {
      if (!r) return r;
      const participantes = r.participantes.includes(id)
        ? r.participantes.filter((p) => p !== id)
        : [...r.participantes, id];
      return { ...r, participantes };
    });
  }

  protected mudarBusca(evento: Event): void {
    this.buscaParticipante.set((evento.target as HTMLInputElement).value);
  }

  protected nomeDaObra(obraId: string): string {
    const obra = this.obras().find((o) => o.id === obraId);
    return obra?.obra_nome || obra?.map_number || '(obra sem nome)';
  }

  protected salvarPopup(): void {
    const r = this.rascunho();
    if (!r || !r.podeEditar || this.salvando()) return;

    if (!r.titulo.trim()) {
      this.erroPopup.set('Dê um título ao compromisso.');
      return;
    }
    if (!r.dataInicio || !r.dataFim) {
      this.erroPopup.set('Informe a data do compromisso.');
      return;
    }

    const horaInicio = r.diaInteiro ? '00:00' : r.horaInicio || '00:00';
    const horaFim = r.diaInteiro ? '23:59' : r.horaFim || horaInicio;
    const inicio = `${r.dataInicio}T${horaInicio}`;
    const fim = `${r.dataFim}T${horaFim}`;
    if (fim < inicio) {
      this.erroPopup.set('O fim do compromisso não pode ser antes do início.');
      return;
    }

    const payload: PayloadEventoAgenda = {
      titulo: r.titulo.trim(),
      descricao: r.descricao.trim(),
      local: r.local.trim(),
      dia_inteiro: r.diaInteiro,
      inicio,
      fim,
      obra_id: this.obraId() || r.obraId || null,
      participantes: r.participantes,
    };

    this.salvando.set(true);
    this.erroPopup.set(null);
    const chamada = r.id ? this.api.atualizarEventoAgenda(r.id, payload) : this.api.criarEventoAgenda(payload);
    chamada.subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.eventos.update((lista) => {
          const semEste = lista.filter((e) => e.id !== salvo.id);
          return [...semEste, salvo].sort((a, b) => a.inicio.localeCompare(b.inicio));
        });
        this.fecharPopup();
        // Compromisso marcado fora da janela aberta: leva o calendário até ele.
        const dias = this.dias();
        const dia = salvo.inicio.substring(0, 10);
        if (dia < dias[0] || dia > dias[dias.length - 1]) this.referencia.set(dia);
      },
      error: (falha) => {
        this.salvando.set(false);
        const mensagem = falha?.error?.message;
        this.erroPopup.set(typeof mensagem === 'string' ? mensagem : 'Não foi possível salvar o compromisso.');
      },
    });
  }

  protected excluirPopup(): void {
    const r = this.rascunho();
    if (!r?.id || !r.podeEditar) return;
    if (!window.confirm(`Excluir o compromisso "${r.titulo}"?`)) return;

    this.api.excluirEventoAgenda(r.id).subscribe({
      next: () => {
        this.eventos.update((lista) => lista.filter((e) => e.id !== r.id));
        this.fecharPopup();
      },
      error: () => this.erroPopup.set('Não foi possível excluir o compromisso.'),
    });
  }

}
