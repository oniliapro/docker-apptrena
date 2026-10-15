import { Component, ElementRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { agoraDeParede, hojeNoFuso } from '../../core/utils/fuso';
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
import { EventoAgenda, ParticipanteAgenda, VisaoAgenda } from './agenda.models';
import { EditarEventoModal, RascunhoEventoAgenda, rascunhoDoEvento } from './editar-evento-modal/editar-evento-modal';

/** Altura de uma hora na grade da semana/dia, em px (`--hora` no scss usa o mesmo valor). */
const PX_POR_HORA = 44;
const MAX_CHIPS_NO_MES = 3;

const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const NOMES_DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const NOMES_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

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
  imports: [EditarEventoModal],
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
  protected readonly referencia = signal(hojeNoFuso());
  protected readonly filtroObra = signal('');
  protected readonly somenteMeus = signal(false);
  protected readonly eventos = signal<EventoAgenda[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly rascunho = signal<RascunhoEventoAgenda | null>(null);

  protected readonly hoje = hojeNoFuso();
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
    this.referencia.set(hojeNoFuso());
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
    const agora = agoraDeParede();
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
    this.novoNoDia(referencia, referencia === this.hoje ? Math.min(23, agoraDeParede().getHours() + 1) : 9);
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
    this.abrirRascunho(rascunhoDoEvento(evento));
  }

  private abrirRascunho(rascunho: RascunhoEventoAgenda): void {
    this.rascunho.set(rascunho);
  }

  protected fecharPopup(): void {
    this.rascunho.set(null);
  }

  /** O popup já gravou pela API; aqui só reflete na grade e leva o calendário até o compromisso novo. */
  protected eventoSalvo(salvo: EventoAgenda): void {
    this.eventos.update((lista) => {
      const semEste = lista.filter((e) => e.id !== salvo.id);
      return [...semEste, salvo].sort((a, b) => a.inicio.localeCompare(b.inicio));
    });
    this.fecharPopup();
    // Compromisso marcado fora da janela aberta: leva o calendário até ele.
    const dias = this.dias();
    const dia = salvo.inicio.substring(0, 10);
    if (dia < dias[0] || dia > dias[dias.length - 1]) this.referencia.set(dia);
  }

  protected eventoExcluido(id: string): void {
    this.eventos.update((lista) => lista.filter((e) => e.id !== id));
    this.fecharPopup();
  }
}
