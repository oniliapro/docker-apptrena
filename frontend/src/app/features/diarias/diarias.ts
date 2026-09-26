import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { formatarMoeda, hojeIso } from '../../core/utils/formato';
import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { FormulaCampo, FormulasContexto } from '../../shared/numero/formulas-guardadas';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';
import { normalizarPagamento, parsearBR } from '../pagamentos/pagamentos-calc';
import { erroDasEtapas, valorDiaria, valorTotalDiaria } from './diarias-engine';
import { PayloadDiaria } from './diarias-normalize';
import { CAMPOS_DIARIA, Diaria, EtapaDiaria, ROTULO_CAMPO_DIARIA } from './diarias.models';
import { DiariasStore } from './diarias.store';

/** Uma linha do editor de etapas — igual a `EtapaDiaria`, só separada pra deixar claro que é estado de formulário. */
interface LinhaEtapa {
  eapItemId: string;
  percentual: string;
}

/**
 * Aba Diárias de uma obra (F7, 22/09/2026) — ver o plano ("Aba Diárias") e
 * o motor de rateio em `diarias-engine.ts`.
 *
 * Lançamento manual aqui (o lançamento automático a partir do RDO ao
 * finalizar o dia entra na F9, quando o RDO for mexido de novo). O
 * fechamento junta uma ou mais diárias selecionadas num único Pagamento
 * pendente — depois disso a diária vira só histórico (não edita, não
 * exclui; excluir o Pagamento gerado é o único jeito de desfazer).
 */
@Component({
  selector: 'app-diarias',
  imports: [Autocomplete, BarraSelecao, FormulaCampo],
  providers: [DiariasStore, FormulasContexto],
  templateUrl: './diarias.html',
  styleUrl: './diarias.scss',
})
export class Diarias implements OnInit {
  protected readonly store = inject(DiariasStore);
  /** Fórmulas guardadas dos campos de valor da diária em edição (ver `formulas-guardadas.ts`). */
  private readonly formulas = inject(FormulasContexto);
  private readonly api = inject(ApiService);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotuloCampo = ROTULO_CAMPO_DIARIA;
  protected readonly camposDiaria = CAMPOS_DIARIA;
  protected readonly valorDiaria = valorDiaria;
  protected readonly valorTotalDiaria = valorTotalDiaria;

  protected readonly filtroSituacao = signal<'todas' | 'rascunho' | 'fechada'>('todas');

  protected readonly listaFiltrada = computed(() => {
    const filtro = this.filtroSituacao();
    const lista = [...this.store.diarias()].sort((a, b) => (a.data < b.data ? 1 : -1));
    if (filtro === 'todas') return lista;
    return lista.filter((d) => d.status === filtro);
  });

  // ---- Seleção múltipla — só faz sentido para diárias em rascunho (fechar/excluir em lote) ----
  protected readonly selecao = new SelecaoMultipla<Diaria>((d) => d.id);
  protected readonly rascunhosDaLista = computed(() => this.listaFiltrada().filter((d) => d.status === 'rascunho'));
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.rascunhosDaLista()));
  protected readonly acoesLista: AcaoLista[] = [
    { chave: 'fechar', rotulo: 'Fechar em pagamento' },
    { chave: 'excluir', rotulo: 'Excluir', perigo: true },
  ];

  private readonly definirContextoDeFormulas = effect(() => {
    const id = this.editandoId();
    this.formulas.definir(id ? 'diaria.' + id : null);
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
  }

  protected mudarFiltro(evento: Event): void {
    this.filtroSituacao.set((evento.target as HTMLSelectElement).value as 'todas' | 'rascunho' | 'fechada');
  }

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionados();
    if (!alvos.length) return;
    if (chave === 'excluir') {
      if (!confirmarExclusaoEmLote(alvos.length, 'diária', 'diárias', '', alvos.map((d) => `${d.profissionalNome} (${d.data})`))) return;
      alvos.forEach((d) => this.store.remover(d.id));
      this.selecao.limpar();
    } else if (chave === 'fechar') {
      this.abrirFechamento(alvos.map((d) => d.id));
    }
  }

  protected removerUm(d: Diaria): void {
    if (!window.confirm(`Excluir a diária de ${d.profissionalNome} em ${d.data}?`)) return;
    this.store.remover(d.id);
  }

  protected editar(d: Diaria): void {
    if (d.status === 'fechada') return;
    this.abrirFormulario(d);
  }

  // ------------------------------------------------------------------
  // Formulário (criar/editar uma diária em rascunho)
  // ------------------------------------------------------------------
  protected readonly formularioAberto = signal(false);
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

  protected novo(): void {
    this.abrirFormulario(null);
  }

  private abrirFormulario(d: Diaria | null): void {
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
    this.formularioAberto.set(true);
  }

  /** "Excluir" dentro do popup de edição (26/09/2026) — sempre pede confirmação antes. */
  protected excluirDoPopup(): void {
    const id = this.editandoId();
    const diaria = this.store.diarias().find((d) => d.id === id);
    if (!id || !diaria) return;
    if (!window.confirm(`Excluir a diária de ${diaria.profissionalNome} em ${diaria.data}?`)) return;
    this.store.remover(id);
    this.fechar();
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
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
      this.fechar();
    };

    const id = this.editandoId();
    if (id) this.store.atualizar(id, payload, aoSalvar);
    else this.store.criar(payload, aoSalvar);
  }

  // ------------------------------------------------------------------
  // Fechamento (uma ou mais diárias -> um Pagamento pendente)
  // ------------------------------------------------------------------
  protected readonly fechamentoAberto = signal(false);
  protected readonly fechamentoIds = signal<string[]>([]);
  protected readonly fechamentoErro = signal<string | null>(null);
  protected readonly fechamentoFornecedor = signal('');
  protected readonly fechamentoDescricao = signal('');
  protected readonly fechamentoData = signal(hojeIso());

  protected readonly previaFechamento = computed(() => this.store.pretendeFechar(this.fechamentoIds()));

  protected abrirFechamento(ids: string[]): void {
    this.fechamentoIds.set(ids);
    this.fechamentoErro.set(null);
    this.fechamentoFornecedor.set('');
    this.fechamentoDescricao.set('Diárias — ' + hojeIso());
    this.fechamentoData.set(hojeIso());
    this.fechamentoAberto.set(true);
  }

  protected fecharPopupFechamento(): void {
    this.fechamentoAberto.set(false);
  }

  protected confirmarFechamento(): void {
    const previa = this.previaFechamento();
    if (previa.erros.size) {
      const [[, mensagem]] = previa.erros;
      this.fechamentoErro.set(mensagem);
      return;
    }

    this.api.listarPagamentos({ obraId: this.obraId() }).subscribe({
      next: (brutos) => {
        const pagamentos = brutos.map((p) => normalizarPagamento(p as Record<string, unknown>));
        this.store.fechar(
          this.fechamentoIds(),
          {
            fornecedor: this.fechamentoFornecedor(),
            descricao: this.fechamentoDescricao(),
            dataPagamento: this.fechamentoData(),
          },
          pagamentos,
          (resultado) => {
            if (!resultado.ok) {
              this.fechamentoErro.set(resultado.erro);
              return;
            }
            this.selecao.limpar();
            this.fecharPopupFechamento();
          },
        );
      },
      error: () => this.fechamentoErro.set('Não foi possível gerar o número do pagamento — tente de novo.'),
    });
  }

  protected rotuloEtapasDaLinha(d: Diaria): string {
    if (!d.etapas.length) return d.origem === 'rdo' ? 'Falta definir (gerada pelo RDO)' : '—';
    return d.etapas
      .map((e) => {
        const item = this.store.itensEap().find((i) => i.id === e.eapItemId);
        const rotulo = item ? (item.eap ? `${item.eap} - ${item.desc}` : item.desc) : 'etapa removida';
        return `${e.percentual}% ${rotulo}`;
      })
      .join(', ');
  }
}
