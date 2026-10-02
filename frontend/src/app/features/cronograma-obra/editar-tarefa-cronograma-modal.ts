import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of, switchMap } from 'rxjs';

import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { ItemEapResumo } from '../../shared/eap-snapshot';
import { CronogramaObraService } from './cronograma-obra.service';
import {
  DependenciaCronograma,
  TIPOS_PRECEDENCIA,
  TarefaCronograma,
  TipoPrecedencia,
} from './cronograma-obra.models';

/**
 * Popup de criação/edição de uma tarefa do Cronograma de obra (CPM,
 * 02/10/2026) — mesmo padrão do `EditarContratoEquipamentoModal`:
 * `tarefa() === null` é criação. A data de início só é editável quando a
 * tarefa NÃO tem nenhuma predecessora — com predecessora, a data é sempre
 * calculada pelo motor de CPM (`cronograma-obra-engine.ts`), nunca digitada.
 */
@Component({
  selector: 'app-editar-tarefa-cronograma-modal',
  imports: [ReactiveFormsModule, Autocomplete],
  templateUrl: './editar-tarefa-cronograma-modal.html',
  styleUrl: './editar-tarefa-cronograma-modal.scss',
})
export class EditarTarefaCronogramaModal {
  private readonly api = inject(CronogramaObraService);
  private readonly fb = inject(FormBuilder);

  readonly tarefa = input<TarefaCronograma | null>(null);
  readonly obraId = input.required<string>();
  readonly todasTarefas = input<TarefaCronograma[]>([]);
  readonly dependencias = input<DependenciaCronograma[]>([]);
  readonly itensEap = input<ItemEapResumo[]>([]);

  readonly fechar = output<void>();
  readonly salvo = output<void>();

  protected readonly tiposPrecedencia = TIPOS_PRECEDENCIA;
  protected readonly modoNovo = computed(() => this.tarefa() === null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly tarefasDisponiveis = computed(() =>
    this.todasTarefas().filter((t) => t.id !== this.tarefa()?.id),
  );

  protected readonly opcoesEtapaEap = computed<OpcaoAutocomplete[]>(() =>
    this.itensEap()
      .filter((i) => !i.isGroup)
      .map((i) => ({ id: i.id, rotulo: this.rotuloEap(i) })),
  );

  private rotuloEap(item: ItemEapResumo): string {
    const eap = String(item.eap ?? '').trim();
    const desc = String(item.desc ?? '').trim();
    return eap && desc ? `${eap} - ${desc}` : eap || desc || '—';
  }

  protected readonly formulario: FormGroup = this.fb.group({
    nome: ['', Validators.required],
    tipo: ['tarefa' as 'tarefa' | 'marco'],
    duracao_dias: [1, [Validators.required, Validators.min(0)]],
    eap_item_id: [null as string | null],
    data_inicio_manual: [''],
    predecessoras: this.fb.array([]),
  });

  /**
   * `FormControl.value` não é um signal — um `computed()` lendo-o direto
   * NUNCA reavaliaria quando o usuário troca a opção (bug real, achado
   * testando: a duração não zerava visualmente ao marcar "Marco", mesmo
   * `salvar()` já forçando 0 no payload por fora). `toSignal` liga o
   * `valueChanges` (Observable de verdade) numa signal de verdade.
   */
  private readonly tipoSignal = toSignal(this.formulario.get('tipo')!.valueChanges, {
    initialValue: this.formulario.get('tipo')!.value as 'tarefa' | 'marco',
  });
  protected readonly ehMarco = computed(() => this.tipoSignal() === 'marco');

  /** Atualizado manualmente a cada adicionar/remover/carregar linha — `FormArray.length` não é um signal. */
  protected readonly tamanhoPredecessoras = signal(0);
  protected readonly temPredecessoras = computed(() => this.tamanhoPredecessoras() > 0);

  constructor() {
    effect(() => {
      const tarefa = this.tarefa();
      this.erro.set(null);
      this.predecessorasArr().clear();

      if (tarefa) {
        this.formulario.patchValue({
          nome: tarefa.nome,
          tipo: tarefa.tipo,
          duracao_dias: tarefa.duracao_dias,
          eap_item_id: tarefa.eap_item_id,
          data_inicio_manual: tarefa.data_inicio_manual?.slice(0, 10) ?? '',
        });
        for (const dep of this.dependencias().filter((d) => d.sucessora_id === tarefa.id)) {
          this.adicionarPredecessora(dep);
        }
      } else {
        this.formulario.reset({ nome: '', tipo: 'tarefa', duracao_dias: 1, eap_item_id: null, data_inicio_manual: '' });
      }
      this.tamanhoPredecessoras.set(this.predecessorasArr().length);
    });

    // Marco não tem duração — trava em 0 e desabilita o campo de verdade
    // (`.disable()` no FormControl, não `[disabled]` no template — os dois
    // juntos é o que o Angular avisa pra não fazer: o Reactive Forms
    // ignora/sobrescreve o atributo do template, então o campo continuava
    // editável de verdade mesmo parecendo travado, bug achado testando).
    effect(() => {
      const campo = this.formulario.get('duracao_dias');
      if (this.ehMarco()) {
        campo?.setValue(0, { emitEvent: false });
        campo?.disable({ emitEvent: false });
      } else {
        campo?.enable({ emitEvent: false });
      }
    });

    // Com predecessora, a data é sempre calculada pelo motor de CPM — o
    // campo de início manual é só pra tarefa sem nenhuma predecessora.
    // Mesmo cuidado acima: `.disable()` de verdade, não `[disabled]` no template.
    effect(() => {
      const campo = this.formulario.get('data_inicio_manual');
      if (this.temPredecessoras()) campo?.disable({ emitEvent: false });
      else campo?.enable({ emitEvent: false });
    });
  }

  protected fecharClick(): void {
    this.fechar.emit();
  }

  protected escolherEtapaEap(opcao: OpcaoAutocomplete | null): void {
    this.formulario.get('eap_item_id')?.setValue(opcao?.id ?? null);
  }

  // ------------------------------------------------------------------
  // Predecessoras (FormArray)
  // ------------------------------------------------------------------

  protected predecessorasArr(): FormArray {
    return this.formulario.get('predecessoras') as FormArray;
  }

  protected adicionarPredecessora(dep?: DependenciaCronograma): void {
    this.predecessorasArr().push(
      this.fb.group({
        dependenciaId: [dep?.id ?? null],
        predecessoraId: [dep?.predecessora_id ?? '', Validators.required],
        tipo: [(dep?.tipo ?? 'TI') as TipoPrecedencia],
        latenciaDias: [dep?.latencia_dias ?? 0],
      }),
    );
    this.tamanhoPredecessoras.set(this.predecessorasArr().length);
  }

  protected removerPredecessora(i: number): void {
    this.predecessorasArr().removeAt(i);
    this.tamanhoPredecessoras.set(this.predecessorasArr().length);
  }

  // ------------------------------------------------------------------
  // Salvar
  // ------------------------------------------------------------------

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.erro.set('Confira os campos destacados.');
      return;
    }

    this.salvando.set(true);
    this.erro.set(null);
    const v = this.formulario.getRawValue();

    const payloadTarefa = {
      eap_item_id: v.eap_item_id,
      nome: v.nome,
      tipo: v.tipo,
      duracao_dias: v.tipo === 'marco' ? 0 : Number(v.duracao_dias),
      data_inicio_manual: v.data_inicio_manual || null,
    };

    const tarefaExistente = this.tarefa();
    const salvarTarefa$ = tarefaExistente
      ? this.api.atualizarTarefa(tarefaExistente.id, payloadTarefa)
      : this.api.criarTarefa(this.obraId(), payloadTarefa);

    salvarTarefa$
      .pipe(switchMap((tarefaSalva) => this.sincronizarPredecessoras(tarefaSalva.id)))
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.salvo.emit();
        },
        error: (e) => {
          this.salvando.set(false);
          this.erro.set(this.mensagemDeErro(e));
        },
      });
  }

  /** Reconcilia as linhas do formulário com as dependências que já existiam — cria/atualiza/exclui o que mudou. */
  private sincronizarPredecessoras(tarefaId: string) {
    const linhas = this.predecessorasArr().getRawValue() as Array<{
      dependenciaId: string | null;
      predecessoraId: string;
      tipo: TipoPrecedencia;
      latenciaDias: number;
    }>;
    const existentes = this.dependencias().filter((d) => d.sucessora_id === tarefaId);
    const idsNaForma = new Set(linhas.map((l) => l.dependenciaId).filter(Boolean));

    const chamadas = [
      ...existentes
        .filter((d) => !idsNaForma.has(d.id))
        .map((d) => this.api.excluirDependencia(d.id)),
      ...linhas.map((linha) => {
        if (linha.dependenciaId) {
          return this.api.atualizarDependencia(linha.dependenciaId, { tipo: linha.tipo, latencia_dias: Number(linha.latenciaDias) || 0 });
        }
        return this.api.criarDependencia({
          predecessora_id: linha.predecessoraId,
          sucessora_id: tarefaId,
          tipo: linha.tipo,
          latencia_dias: Number(linha.latenciaDias) || 0,
        });
      }),
    ];

    return chamadas.length ? forkJoin(chamadas) : of(null);
  }

  private mensagemDeErro(e: unknown): string {
    const erro = e as { error?: { message?: string; mensagem?: string } };
    return erro?.error?.mensagem ?? erro?.error?.message ?? 'Não foi possível concluir a operação.';
  }
}
