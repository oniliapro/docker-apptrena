import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { formatarMoeda, hojeIso } from '../../../core/utils/formato';
import { Autocomplete, OpcaoAutocomplete } from '../../../shared/autocomplete/autocomplete';
import { FormulaCampo, FormulasContexto } from '../../../shared/numero/formulas-guardadas';
import { parsearBR } from '../../pagamentos/pagamentos-calc';
import { erroDasEtapas } from '../diarias-engine';
import { PayloadDiaria } from '../diarias-normalize';
import { Diaria, EtapaDiaria } from '../diarias.models';
import { DiariasStore } from '../diarias.store';

/** Uma linha do editor de etapas — igual a `EtapaDiaria`, só separada pra deixar claro que é estado de formulário. */
interface LinhaEtapa {
  eapItemId: string;
  percentual: string;
}

/**
 * Popup de criar/editar uma diária em rascunho (22/09/2026, F7) — extraído da
 * aba Diárias em 15/10/2026 para abrir também a partir do card "Diárias" do
 * dashboard, sem levar o usuário para a lista.
 *
 * Tem o PRÓPRIO `DiariasStore` (EAP da obra, cadastro de profissionais e
 * categorias são carregados aqui, por obra): quem abre só informa a obra e a
 * diária. O que foi gravado volta pelos outputs, e quem abriu recarrega a sua
 * lista — o popup não tenta manter a lista do pai em dia.
 */
@Component({
  selector: 'app-editar-diaria-modal',
  imports: [Autocomplete, FormulaCampo],
  providers: [DiariasStore, FormulasContexto],
  templateUrl: './editar-diaria-modal.html',
  styleUrl: './editar-diaria-modal.scss',
})
export class EditarDiariaModal implements OnInit {
  protected readonly store = inject(DiariasStore);
  private readonly api = inject(ApiService);
  /** Fórmulas guardadas dos campos de valor da diária em edição (ver `formulas-guardadas.ts`). */
  private readonly formulas = inject(FormulasContexto);

  readonly obraId = input.required<string>();
  /** `null` = criar uma diária nova. */
  readonly diaria = input<Diaria | null>(null);

  readonly salvo = output<void>();
  readonly excluido = output<string>();
  readonly fechar = output<void>();

  protected readonly formatarMoeda = formatarMoeda;

  protected readonly editandoId = signal<string | null>(null);
  protected readonly erroFormulario = signal<string | null>(null);

  protected readonly fProfissionalId = signal('');
  protected readonly fProfissionalNome = signal('');
  protected readonly fProfissionalFuncao = signal('');
  protected readonly fData = signal(hojeIso());
  protected readonly fMeiaDiaria = signal(false);
  protected readonly fValorDiariaBase = signal('');
  protected readonly fValeTransporte = signal('');
  protected readonly fValeAlimentacao = signal('');
  protected readonly fCombustivel = signal('');
  protected readonly fValorExtra = signal('');
  protected readonly fObservacoes = signal('');
  protected readonly fEtapas = signal<LinhaEtapa[]>([{ eapItemId: '', percentual: '' }]);

  protected readonly somaPercentuais = computed(() =>
    this.fEtapas().reduce((soma, linha) => soma + (parsearBR(linha.percentual) || 0), 0),
  );

  protected readonly previaTotal = computed(() => {
    const base = parsearBR(this.fValorDiariaBase());
    const diaria = this.fMeiaDiaria() ? base / 2 : base;
    return (
      diaria +
      parsearBR(this.fValeTransporte()) +
      parsearBR(this.fValeAlimentacao()) +
      parsearBR(this.fCombustivel()) +
      parsearBR(this.fValorExtra())
    );
  });

  private readonly definirContextoDeFormulas = effect(() => {
    const id = this.editandoId();
    this.formulas.definir(id ? 'diaria.' + id : null);
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
    this.preencher(this.diaria());
  }

  private preencher(d: Diaria | null): void {
    this.editandoId.set(d?.id ?? null);
    this.erroFormulario.set(null);
    this.fProfissionalId.set(d?.profissionalId ?? '');
    this.fProfissionalNome.set(d?.profissionalNome ?? '');
    this.fProfissionalFuncao.set(d?.profissionalFuncao ?? '');
    this.fData.set(d?.data || hojeIso());
    this.fMeiaDiaria.set(d?.meiaDiaria ?? false);
    this.fValorDiariaBase.set(d?.valorDiariaBase ? formatarMoeda(d.valorDiariaBase) : '');
    this.fValeTransporte.set(d?.valeTransporte ? formatarMoeda(d.valeTransporte) : '');
    this.fValeAlimentacao.set(d?.valeAlimentacao ? formatarMoeda(d.valeAlimentacao) : '');
    this.fCombustivel.set(d?.combustivel ? formatarMoeda(d.combustivel) : '');
    this.fValorExtra.set(d?.valorExtra ? formatarMoeda(d.valorExtra) : '');
    this.fObservacoes.set(d?.observacoes ?? '');
    this.fEtapas.set(
      d?.etapas.length
        ? d.etapas.map((e) => ({ eapItemId: e.eapItemId, percentual: String(e.percentual).replace('.', ',') }))
        : [{ eapItemId: '', percentual: '' }],
    );
  }

  /** "Excluir" dentro do popup de edição (26/09/2026) — sempre pede confirmação antes. */
  protected excluirDoPopup(): void {
    const d = this.diaria();
    if (!d) return;
    if (!window.confirm(`Excluir a diária de ${d.profissionalNome} em ${d.data}?`)) return;

    // Direto pela API (e não por `store.remover`): só avisa o pai DEPOIS de apagar, para a lista
    // que ele recarrega já vir sem a diária.
    this.api.excluirDiaria(this.obraId(), d.id).subscribe({
      next: () => this.excluido.emit(d.id),
      error: (erro) =>
        window.alert(erro?.error?.message || 'Não foi possível excluir a diária.'),
    });
  }

  protected fecharPopup(): void {
    this.fechar.emit();
  }

  /**
   * Valor puro do campo — pros campos com `class="valor"` (diária e os 4
   * adicionais), o `FormulaCamposService` global já trocou `=conta` pelo
   * resultado antes deste handler rodar (F3), então basta ler o texto.
   */
  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected escolherProfissional(opcao: OpcaoAutocomplete | null): void {
    this.fProfissionalId.set(opcao?.id ?? '');
    if (!opcao) return;
    const profissional = this.store.obterProfissional(opcao.id);
    if (!profissional) return;
    this.fProfissionalNome.set(profissional.nome);
    this.fProfissionalFuncao.set(profissional.especialidade);
    // Snapshot do valor do cadastro — só preenche automaticamente ao TROCAR de
    // profissional; o valor continua editável depois (pode ter mudado desde o cadastro).
    this.fValorDiariaBase.set(profissional.valorDiaria ? formatarMoeda(profissional.valorDiaria) : '');
  }

  protected adicionarEtapa(): void {
    this.fEtapas.update((lista) => [...lista, { eapItemId: '', percentual: '' }]);
  }

  protected removerEtapa(indice: number): void {
    this.fEtapas.update((lista) => lista.filter((_, i) => i !== indice));
  }

  protected mudarEtapaEap(indice: number, opcao: OpcaoAutocomplete | null): void {
    this.fEtapas.update((lista) =>
      lista.map((linha, i) => (i === indice ? { ...linha, eapItemId: opcao?.id ?? '' } : linha)),
    );
  }

  protected mudarEtapaPercentual(indice: number, evento: Event): void {
    const texto = (evento.target as HTMLInputElement).value;
    this.fEtapas.update((lista) => lista.map((linha, i) => (i === indice ? { ...linha, percentual: texto } : linha)));
  }

  /** Completa o que falta pra fechar 100% na última etapa vazia/incompleta — atalho comum (2 etapas: preenche uma, a outra completa sozinha). */
  protected completarComOResto(indice: number): void {
    const falta = 100 - this.somaPercentuais() + (parsearBR(this.fEtapas()[indice].percentual) || 0);
    this.fEtapas.update((lista) =>
      lista.map((linha, i) => (i === indice ? { ...linha, percentual: String(Math.max(0, falta)).replace('.', ',') } : linha)),
    );
  }

  protected salvar(): void {
    if (!this.fProfissionalId()) {
      this.erroFormulario.set('Escolha um profissional.');
      return;
    }
    const etapas: EtapaDiaria[] = this.fEtapas()
      .filter((l) => l.eapItemId)
      .map((l) => ({ eapItemId: l.eapItemId, percentual: parsearBR(l.percentual) }));

    const erroEtapas = erroDasEtapas(etapas);
    if (erroEtapas) {
      this.erroFormulario.set(erroEtapas);
      return;
    }

    const payload: PayloadDiaria = {
      profissional_id: this.fProfissionalId(),
      profissional_nome: this.fProfissionalNome(),
      profissional_funcao: this.fProfissionalFuncao(),
      data: this.fData(),
      meia_diaria: this.fMeiaDiaria(),
      valor_diaria_base: parsearBR(this.fValorDiariaBase()),
      vale_transporte: parsearBR(this.fValeTransporte()),
      vale_alimentacao: parsearBR(this.fValeAlimentacao()),
      combustivel: parsearBR(this.fCombustivel()),
      valor_extra: parsearBR(this.fValorExtra()),
      observacoes: this.fObservacoes(),
      etapas: etapas.map((e) => ({ eap_item_id: e.eapItemId, percentual: e.percentual })),
    };

    const aoSalvar = (erro: string | null) => {
      if (erro) {
        this.erroFormulario.set(erro);
        return;
      }
      this.salvo.emit();
    };

    const id = this.editandoId();
    if (id) this.store.atualizar(id, payload, aoSalvar);
    else this.store.criar(payload, aoSalvar);
  }
}
