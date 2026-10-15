import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { formatarMoeda, hojeIso } from '../../core/utils/formato';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';
import { normalizarPagamento, parsearBR } from '../pagamentos/pagamentos-calc';
import { valorDiaria, valorTotalDiaria } from './diarias-engine';
import { CAMPOS_DIARIA, Diaria, ROTULO_CAMPO_DIARIA } from './diarias.models';
import { DiariasStore } from './diarias.store';
import { EditarDiariaModal } from './editar-diaria-modal/editar-diaria-modal';

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
  imports: [BarraSelecao, EditarDiariaModal],
  providers: [DiariasStore],
  templateUrl: './diarias.html',
  styleUrl: './diarias.scss',
})
export class Diarias implements OnInit {
  protected readonly store = inject(DiariasStore);
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

  // ------------------------------------------------------------------
  // Popup (criar/editar uma diária em rascunho) — `EditarDiariaModal`
  // ------------------------------------------------------------------
  /** `undefined` = fechado; `null` = criando; preenchido = editando. */
  protected readonly diariaEmEdicao = signal<Diaria | null | undefined>(undefined);

  protected editar(d: Diaria): void {
    if (d.status === 'fechada') return;
    this.diariaEmEdicao.set(d);
  }

  protected novo(): void {
    this.diariaEmEdicao.set(null);
  }

  protected fecharPopup(): void {
    this.diariaEmEdicao.set(undefined);
  }

  /** O popup já gravou (ou excluiu); a lista é recarregada para refletir o servidor. */
  protected aoSalvarPopup(): void {
    this.fecharPopup();
    this.store.recarregarDiarias();
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

  /** Valor puro de um `<input>` — usado nos campos do popup de fechamento. */
  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
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
