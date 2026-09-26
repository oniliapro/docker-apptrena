import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { ItemEapResumo } from '../../shared/eap-snapshot';
import {
  ContratoEquipamento,
  PERIODO_UNIDADES,
  PeriodoUnidade,
  ROTULOS_STATUS_CONTRATO,
} from './contratos-equipamentos.models';
import { ContratosEquipamentosService } from './contratos-equipamentos.service';

/**
 * Popup de criação/edição de um contrato de equipamento (26/09/2026, pedido
 * do Lucas: "coloque a edição do contrato por meio de popup" — antes era uma
 * página própria). `contrato() === null` é criação, preenchido é edição —
 * mesmo padrão do `CadastroObraModal`.
 *
 * Período e itens só são digitados livremente na CRIAÇÃO; depois disso, só
 * mudam através de uma renovação (`abrirRenovacao`/`confirmarRenovacao`) —
 * o histórico de cada período fica em `renovacoes`, cada um com seu próprio
 * Pagamento.
 */
@Component({
  selector: 'app-editar-contrato-equipamento-modal',
  imports: [ReactiveFormsModule, Autocomplete],
  templateUrl: './editar-contrato-equipamento-modal.html',
  styleUrl: './editar-contrato-equipamento-modal.scss',
})
export class EditarContratoEquipamentoModal {
  private readonly api = inject(ContratosEquipamentosService);
  private readonly fb = inject(FormBuilder);

  readonly contrato = input<ContratoEquipamento | null>(null);
  readonly obraId = input.required<string>();
  readonly itensEap = input<ItemEapResumo[]>([]);

  readonly fechar = output<void>();
  readonly salvo = output<ContratoEquipamento>();
  readonly excluido = output<string>();

  protected readonly periodoUnidades = PERIODO_UNIDADES;
  protected readonly rotulosStatus = ROTULOS_STATUS_CONTRATO;
  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;

  protected readonly modoNovo = computed(() => this.contrato() === null);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly renovando = signal(false);

  protected readonly opcoesEtapaEap = computed<OpcaoAutocomplete[]>(() =>
    this.itensEap()
      .filter((i) => !i.isGroup)
      .map((i) => ({ id: i.id, rotulo: this.rotuloEap(i) })),
  );

  private rotuloEap(item: ItemEapResumo): string {
    const eap = String(item.eap ?? '').trim();
    const desc = String(item.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  /** Só usado na criação — depois disso, período/itens só mudam via renovação. */
  protected readonly formulario: FormGroup = this.fb.group({
    nome_contrato: ['', Validators.required],
    fornecedor: ['', Validators.required],
    data_entrega: ['', Validators.required],
    periodo_quantidade: [30, [Validators.required, Validators.min(1)]],
    periodo_unidade: ['dias_corridos' as PeriodoUnidade],
    itens: this.fb.array([]),
  });

  protected readonly formularioRenovacao: FormGroup = this.fb.group({
    periodo_quantidade: [30, [Validators.required, Validators.min(1)]],
    periodo_unidade: ['dias_corridos' as PeriodoUnidade],
    itens: this.fb.array([]),
  });

  constructor() {
    effect(() => {
      const contrato = this.contrato();
      this.renovando.set(false);
      this.erro.set(null);
      this.aviso.set(null);
      this.itensArr().clear();

      if (contrato) {
        this.formulario.patchValue({ nome_contrato: contrato.nome_contrato, fornecedor: contrato.fornecedor });
      } else {
        this.formulario.reset({
          nome_contrato: '',
          fornecedor: '',
          data_entrega: '',
          periodo_quantidade: 30,
          periodo_unidade: 'dias_corridos',
        });
        this.adicionarItem();
      }
    });
  }

  protected fecharClick(): void {
    this.fechar.emit();
  }

  // ------------------------------------------------------------------
  // Itens (só na criação)
  // ------------------------------------------------------------------

  protected itensArr(): FormArray {
    return this.formulario.get('itens') as FormArray;
  }

  protected adicionarItem(): void {
    this.itensArr().push(
      this.fb.group({
        descricao: ['', Validators.required],
        eap_item_id: [null as string | null],
        quantidade: [1, [Validators.required, Validators.min(1)]],
        valor_unitario: [0, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  protected removerItem(i: number): void {
    this.itensArr().removeAt(i);
  }

  protected escolherEtapaEapDoItem(i: number, opcao: OpcaoAutocomplete | null): void {
    (this.itensArr().at(i) as FormGroup).patchValue({ eap_item_id: opcao?.id ?? null });
  }

  protected itensAtivosDoContrato() {
    return (this.contrato()?.itens ?? []).filter((i) => !i.devolvido_em);
  }

  protected itensDevolvidosDoContrato() {
    return (this.contrato()?.itens ?? []).filter((i) => i.devolvido_em);
  }

  protected rotuloEapDoItem(eapItemId: string | null): string {
    if (!eapItemId) return '—';
    const item = this.itensEap().find((i) => i.id === eapItemId);
    return item ? this.rotuloEap(item) : '—';
  }

  // ------------------------------------------------------------------
  // Criar
  // ------------------------------------------------------------------

  protected salvarNovo(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.erro.set('Confira os campos destacados.');
      return;
    }

    this.salvando.set(true);
    this.erro.set(null);
    const v = this.formulario.getRawValue();

    this.api.criar(this.obraId(), {
      nome_contrato: v.nome_contrato,
      fornecedor: v.fornecedor,
      data_entrega: v.data_entrega,
      periodo_quantidade: Number(v.periodo_quantidade),
      periodo_unidade: v.periodo_unidade,
      itens: v.itens.map((i: { descricao: string; eap_item_id: string | null; quantidade: number; valor_unitario: number }) => ({
        descricao: i.descricao,
        eap_item_id: i.eap_item_id,
        quantidade: Number(i.quantidade),
        valor_unitario: Number(i.valor_unitario),
      })),
    }).subscribe({
      next: (contrato) => {
        this.salvando.set(false);
        this.salvo.emit(contrato);
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(this.mensagemDeErro(e));
      },
    });
  }

  protected salvarEdicao(): void {
    const contrato = this.contrato();
    if (!contrato) return;
    if (this.formulario.get('nome_contrato')?.invalid || this.formulario.get('fornecedor')?.invalid) {
      this.erro.set('Confira o nome do contrato e o fornecedor.');
      return;
    }

    this.salvando.set(true);
    const v = this.formulario.getRawValue();
    this.api.atualizar(contrato.id, { nome_contrato: v.nome_contrato, fornecedor: v.fornecedor }).subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.aviso.set('Contrato atualizado.');
        this.salvo.emit(atualizado);
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(this.mensagemDeErro(e));
      },
    });
  }

  // ------------------------------------------------------------------
  // Renovação
  // ------------------------------------------------------------------

  protected itensRenovacaoArr(): FormArray {
    return this.formularioRenovacao.get('itens') as FormArray;
  }

  protected abrirRenovacao(): void {
    const contrato = this.contrato();
    if (!contrato) return;

    this.itensRenovacaoArr().clear();
    this.itensAtivosDoContrato().forEach((item) => {
      this.itensRenovacaoArr().push(
        this.fb.group({
          id: [item.id],
          descricao: [item.descricao],
          devolver: [false],
          eap_item_id: [item.eap_item_id],
          quantidade: [item.quantidade, [Validators.required, Validators.min(1)]],
          valor_unitario: [item.valor_unitario, [Validators.required, Validators.min(0)]],
        }),
      );
    });
    this.formularioRenovacao.patchValue({
      periodo_quantidade: contrato.periodo_quantidade,
      periodo_unidade: contrato.periodo_unidade,
    });
    this.renovando.set(true);
    this.aviso.set(null);
    this.erro.set(null);
  }

  protected fecharRenovacao(): void {
    this.renovando.set(false);
  }

  protected escolherEtapaEapDaRenovacao(i: number, opcao: OpcaoAutocomplete | null): void {
    (this.itensRenovacaoArr().at(i) as FormGroup).patchValue({ eap_item_id: opcao?.id ?? null });
  }

  protected confirmarRenovacao(): void {
    const contrato = this.contrato();
    if (!contrato || this.formularioRenovacao.invalid) {
      this.formularioRenovacao.markAllAsTouched();
      return;
    }

    const v = this.formularioRenovacao.getRawValue();
    const itens = v.itens as Array<{ id: string; devolver: boolean; eap_item_id: string | null; quantidade: number; valor_unitario: number }>;
    const devolvidos = itens.filter((i) => i.devolver);

    if (devolvidos.length === itens.length) {
      if (!confirm('Todos os itens estão marcados para devolução — este contrato será ENCERRADO. Confirma?')) {
        return;
      }
    }

    this.salvando.set(true);
    this.erro.set(null);

    this.api.renovar(contrato.id, {
      periodo_quantidade: Number(v.periodo_quantidade),
      periodo_unidade: v.periodo_unidade,
      itens_devolvidos: devolvidos.map((i) => i.id),
      itens: itens
        .filter((i) => !i.devolver)
        .map((i) => ({ id: i.id, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario), eap_item_id: i.eap_item_id })),
    }).subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.renovando.set(false);
        this.aviso.set(
          atualizado.status === 'encerrado'
            ? 'Contrato renovado e encerrado — todos os itens foram devolvidos.'
            : 'Contrato renovado. Um novo pagamento foi gerado e o lembrete na Agenda foi atualizado.',
        );
        this.salvo.emit(atualizado);
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(this.mensagemDeErro(e));
      },
    });
  }

  protected excluir(): void {
    const contrato = this.contrato();
    if (!contrato) return;
    if (!confirm(`Excluir o contrato nº ${contrato.numero} — ${contrato.nome_contrato}? Os pagamentos já gerados NÃO são excluídos. Esta ação não pode ser desfeita.`)) {
      return;
    }
    this.api.excluir(contrato.id).subscribe({
      next: () => this.excluido.emit(contrato.id),
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  private mensagemDeErro(e: unknown): string {
    const erro = e as { error?: { message?: string; mensagem?: string } };
    return erro?.error?.mensagem ?? erro?.error?.message ?? 'Não foi possível concluir a operação.';
  }
}
