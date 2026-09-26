import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { AcoesPagamento, aplicarAlteracaoEmMapa } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { EditarPagamentoModal, EventoSalvarPagamento } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { paraPayloadApi } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { EmpreitaMedicaoDetalhe, EventoSalvarMedicao } from './empreita-medicao-detalhe';
import { EmpreitaRelatorioPagamentos } from './empreita-relatorio-pagamentos';
import { ordenarPagamentosDaEmpreita, recalcularHistorico } from './empreita-historico';
import { EmpreitaStore } from './empreita.store';

/**
 * "Pagamentos registrados" de uma empreita, como popup aberto ao clicar na empreita da LISTA de
 * empreitas da obra (26/09/2026, pedido do Lucas — a tabela saiu da página da empreita completa).
 *
 * Reúne: a tabela de pagamentos (Beneficiado, medições física/financeira, valor pago, com
 * "Simplificar"), as ações por pagamento (editar / confirmar / tornar pendente) e o popup da
 * "empreita completa" de cada medição, de onde se edita ou apaga a medição (com confirmação:
 * recalcula as medições seguintes mantendo o avanço e o pagamento de cada uma).
 */
@Component({
  selector: 'app-empreita-pagamentos-popup',
  imports: [EmpreitaRelatorioPagamentos, EmpreitaMedicaoDetalhe, EditarPagamentoModal],
  providers: [EmpreitaStore],
  templateUrl: './empreita-pagamentos-popup.html',
  styleUrl: './empreita-pagamentos-popup.scss',
})
export class EmpreitaPagamentosPopup implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly store = inject(EmpreitaStore);

  readonly empreitaId = input.required<string>();
  readonly obraId = input.required<string>();
  readonly titulo = input('');

  readonly fechar = output<void>();
  /** Levar para a tela da empreita completa (editor). */
  readonly abrirEmpreita = output<boolean>();
  /** Algo mudou (pagamento editado/confirmado/apagado, medições recalculadas): a lista precisa se atualizar. */
  readonly alterado = output<void>();

  /** Mesmo padrão da tela da empreita: ligado por padrão, mostra só o Total. */
  protected readonly simplificado = signal(true);
  protected readonly ordenados = computed(() => ordenarPagamentosDaEmpreita(this.store.pagamentosDaEmpreita()));
  protected readonly salvando = signal(false);

  /** Saldo disp. de cada serviço (do cálculo da própria empreita) — vai pro popup da empreita completa. */
  protected readonly saldoDispPorServico = computed(() => {
    const itens = this.store.itens();
    const linhas = this.store.linhasEstendidas();
    return new Map(itens.map((item, i) => [item.id, linhas[i]?.saldoDisp ?? 0] as [string, number]));
  });

  /** Medição aberta no popup da "empreita completa". */
  protected readonly medicaoAbertaId = signal<string | null>(null);
  protected readonly indiceAberto = computed(() => this.ordenados().findIndex((p) => p.id === this.medicaoAbertaId()));

  private readonly acoes = new AcoesPagamento(
    this.api,
    (alteracao) => {
      this.store.pagamentosDaEmpreita.update((lista) => {
        const mapa = aplicarAlteracaoEmMapa(new Map([['x', lista]]), alteracao);
        return mapa.get('x') ?? lista;
      });
      this.alterado.emit();
    },
    () => this.obraId(),
  );
  protected readonly pagamentoEmEdicao = this.acoes.emEdicao;
  protected readonly snapshotEap = this.acoes.snapshotEap;

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
  }

  protected alternarSimplificado(evento: Event): void {
    this.simplificado.set((evento.target as HTMLInputElement).checked);
  }

  // ---- ações por pagamento ----
  protected editarPagamento(pagamento: Pagamento): void {
    this.acoes.abrirComEap(pagamento);
  }

  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    this.acoes.salvar(evento);
  }

  protected excluirPagamentoDoEditor(pagamento: Pagamento): void {
    this.acoes.excluirDoEditor(pagamento);
  }

  protected fecharEditor(): void {
    this.acoes.fechar();
  }

  protected confirmarPagamento(pagamento: Pagamento): void {
    this.acoes.confirmar(pagamento);
  }

  protected tornarPendente(pagamento: Pagamento): void {
    if (!window.confirm(`Voltar o pagamento ${pagamento.numeroPagamento || ''} para PENDENTE? Ele deixa de contar como pago (Realizado da EAP e "Anterior" da empreita).`)) return;
    const pendente: Pagamento = { ...pagamento, status: 'pendente', dataPagamento: '' };
    this.api.atualizarPagamento(pagamento.id, paraPayloadApi(pendente, pagamento.obraId || this.obraId())).subscribe({
      next: () => {
        this.store.pagamentosDaEmpreita.update((lista) => lista.map((p) => (p.id === pagamento.id ? pendente : p)));
        this.alterado.emit();
      },
      error: () => window.alert('Não foi possível tornar o pagamento pendente.'),
    });
  }

  // ---- popup da empreita completa de uma medição ----
  protected abrirMedicao(pagamento: Pagamento): void {
    this.medicaoAbertaId.set(pagamento.id);
  }

  protected fecharMedicao(): void {
    this.medicaoAbertaId.set(null);
  }

  protected salvarMedicao(evento: EventoSalvarMedicao): void {
    const resultado = recalcularHistorico(this.ordenados(), evento.pagamentoId, evento.edicoes);
    const seguintes = resultado.atualizados.length - 1;
    let aviso =
      'Editar esta medição também altera o pagamento vinculado a ela' +
      (seguintes > 0 ? ` e recalcula as ${seguintes} medição(ões) seguinte(s), mantendo o avanço e os valores pagos de cada uma` : '') +
      '.\n\nIsso pode gerar erros de preenchimento (medição acima de 100%, saldos negativos). Confirmar a edição?';
    if (resultado.avisos.length) aviso = 'ATENÇÃO:\n• ' + resultado.avisos.join('\n• ') + '\n\n' + aviso;
    if (!window.confirm(aviso)) return;

    this.persistir(resultado.atualizados, null, resultado.deslocamentoPorServico);
  }

  protected apagarMedicao(pagamentoId: string): void {
    const resultado = recalcularHistorico(this.ordenados(), pagamentoId, null);
    const seguintes = resultado.atualizados.length;
    let aviso =
      'Apagar esta medição EXCLUI o pagamento vinculado a ela' +
      (seguintes > 0 ? ` e recalcula as ${seguintes} medição(ões) seguinte(s), mantendo o avanço e os valores pagos de cada uma` : '') +
      '. O avanço apagado volta a ficar por medir.\n\nConfirmar a exclusão?';
    if (resultado.avisos.length) aviso = 'ATENÇÃO:\n• ' + resultado.avisos.join('\n• ') + '\n\n' + aviso;
    if (!window.confirm(aviso)) return;

    this.persistir(resultado.atualizados, pagamentoId, resultado.deslocamentoPorServico);
  }

  private persistir(atualizados: Pagamento[], apagarId: string | null, deslocamento: Map<string, number>): void {
    this.salvando.set(true);
    const chamadas = [
      ...atualizados.map((p) => this.api.atualizarPagamento(p.id, paraPayloadApi(p, p.obraId || this.obraId()))),
      ...(apagarId ? [this.api.excluirPagamento(apagarId)] : []),
    ];

    forkJoin(chamadas.length ? chamadas : [of(null)]).subscribe({
      next: () => {
        this.store.aplicarDeslocamentoDeMedicao(deslocamento);
        this.store.recarregarPagamentos();
        this.salvando.set(false);
        this.medicaoAbertaId.set(null);
        this.alterado.emit();
      },
      error: () => {
        this.salvando.set(false);
        this.store.recarregarPagamentos();
        window.alert('Não foi possível gravar todas as alterações. Confira a lista de pagamentos e refaça o que faltar.');
      },
    });
  }
}
