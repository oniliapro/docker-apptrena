import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { Obra } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { EventoAgenda, ParticipanteAgenda, PayloadEventoAgenda } from '../agenda.models';

/** Rascunho do popup — campos separados de data e hora (o que os `<input type="date|time">` entregam). */
export interface RascunhoEventoAgenda {
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

/** `YYYY-MM-DDTHH:mm` → `HH:mm`. */
function horaTexto(dataHora: string): string {
  return dataHora.length >= 16 ? dataHora.substring(11, 16) : '00:00';
}

/** Rascunho a partir de um compromisso já gravado (abrir para editar). */
export function rascunhoDoEvento(evento: EventoAgenda): RascunhoEventoAgenda {
  return {
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
  };
}

/**
 * Popup de um compromisso da agenda (26/09/2026) — extraído de `Agenda` em
 * 15/10/2026 para abrir também a partir do card "Agenda" do dashboard, sem
 * levar o usuário para a página.
 *
 * Recebe o rascunho pronto (`inicial`) e as listas de obras/usuários; salva e
 * exclui sozinho pela API e avisa o pai pelos outputs.
 */
@Component({
  selector: 'app-editar-evento-modal',
  templateUrl: './editar-evento-modal.html',
  styleUrl: './editar-evento-modal.scss',
})
export class EditarEventoModal {
  private readonly api = inject(ApiService);

  readonly inicial = input.required<RascunhoEventoAgenda>();
  readonly obras = input<Obra[]>([]);
  readonly usuarios = input<ParticipanteAgenda[]>([]);
  /** Obra da aba onde a agenda está aberta — vazio na Agenda geral e no dashboard. */
  readonly obraFixa = input<string>('');

  readonly salvo = output<EventoAgenda>();
  readonly excluido = output<string>();
  readonly fechar = output<void>();

  /** Cópia editável do rascunho — recomeça sempre que o pai entrega outro. */
  protected readonly rascunho = linkedSignal<RascunhoEventoAgenda>(() => this.inicial());

  protected readonly buscaParticipante = signal('');
  protected readonly erroPopup = signal<string | null>(null);
  protected readonly salvando = signal(false);

  /** Participantes do popup que combinam com a busca. */
  protected readonly usuariosFiltrados = computed(() => {
    const termo = this.buscaParticipante().trim().toLowerCase();
    return this.usuarios().filter((u) => !termo || u.nome.toLowerCase().includes(termo));
  });

  protected fecharPopup(): void {
    this.fechar.emit();
  }

  protected editarCampo(
    campo: 'titulo' | 'descricao' | 'local' | 'dataInicio' | 'horaInicio' | 'dataFim' | 'horaFim',
    evento: Event,
  ): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.rascunho.update((r) => {
      const novo = { ...r, [campo]: valor };
      // Mudar o dia de início arrasta o de fim junto se ficaria antes.
      if (campo === 'dataInicio' && novo.dataFim < valor) novo.dataFim = valor;
      return novo;
    });
  }

  protected alternarDiaInteiro(evento: Event): void {
    const marcado = (evento.target as HTMLInputElement).checked;
    this.rascunho.update((r) => ({ ...r, diaInteiro: marcado }));
  }

  protected escolherObra(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.rascunho.update((r) => ({ ...r, obraId: valor }));
  }

  protected participa(id: number): boolean {
    return this.rascunho().participantes.includes(id);
  }

  protected alternarParticipante(id: number): void {
    this.rascunho.update((r) => {
      const participantes = r.participantes.includes(id)
        ? r.participantes.filter((p) => p !== id)
        : [...r.participantes, id];
      return { ...r, participantes };
    });
  }

  protected mudarBusca(evento: Event): void {
    this.buscaParticipante.set((evento.target as HTMLInputElement).value);
  }

  protected salvarPopup(): void {
    const r = this.rascunho();
    if (!r.podeEditar || this.salvando()) return;

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
      obra_id: this.obraFixa() || r.obraId || null,
      participantes: r.participantes,
    };

    this.salvando.set(true);
    this.erroPopup.set(null);
    const chamada = r.id ? this.api.atualizarEventoAgenda(r.id, payload) : this.api.criarEventoAgenda(payload);
    chamada.subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.salvo.emit(salvo);
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
    if (!r.id || !r.podeEditar) return;
    if (!window.confirm(`Excluir o compromisso "${r.titulo}"?`)) return;

    this.api.excluirEventoAgenda(r.id).subscribe({
      next: () => this.excluido.emit(r.id as string),
      error: () => this.erroPopup.set('Não foi possível excluir o compromisso.'),
    });
  }
}
