import { Component, OnInit, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { DadosPagamentoModal } from '../../shared/dados-pagamento/dados-pagamento-modal';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { AcoesPagamento, aplicarAlteracaoEmMapa } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { copiarParaAreaDeTransferencia } from '../../shared/selecao-lista/selecao-lista';
import { EditarPagamentoModal, EventoSalvarPagamento } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { montarMensagemPagamentoContratoEquipamento } from './contratos-equipamentos-mensagem';
import { ContratoEquipamento, ROTULOS_STATUS_CONTRATO } from './contratos-equipamentos.models';
import { ContratosEquipamentosService } from './contratos-equipamentos.service';
import { EditarContratoEquipamentoModal } from './editar-contrato-equipamento-modal';

type ContratoComObra = ContratoEquipamento & { obra_nome: string };

/**
 * Página de controle geral de Contratos de equipamentos (27/09/2026, pedido
 * do Lucas: "igual a aba, mas com coluna identificando a obra") — mesma
 * tabela/ações de `ContratosEquipamentosObra`, cruzando todas as obras da
 * empresa. Criar contrato novo continua só na aba da obra (o formulário
 * pede dados que fazem mais sentido já dentro do contexto dela); aqui dá
 * pra abrir, editar, excluir e solicitar pagamento de qualquer contrato.
 */
@Component({
  selector: 'app-contratos-equipamentos-geral',
  imports: [RedimensionarColunas, EditarPagamentoModal, EditarContratoEquipamentoModal, DadosPagamentoModal],
  templateUrl: './contratos-equipamentos-geral.html',
  styleUrl: './contratos-equipamentos-obra.scss',
})
export class ContratosEquipamentosGeral implements OnInit {
  private readonly api = inject(ContratosEquipamentosService);
  private readonly apiGeral = inject(ApiService);

  protected readonly contratos = signal<ContratoComObra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotulosStatus = ROTULOS_STATUS_CONTRATO;

  protected readonly pagamentosPorContrato = signal<Map<string, Pagamento[]>>(new Map());
  protected readonly popupContrato = signal<ContratoComObra | null>(null);

  private readonly acoesPagamento = new AcoesPagamento(
    this.apiGeral,
    (alteracao) => this.pagamentosPorContrato.update((mapa) => aplicarAlteracaoEmMapa(mapa, alteracao)),
    () => this.popupContrato()?.obra_id ?? '',
  );
  protected readonly pagamentoEmEdicao = this.acoesPagamento.emEdicao;

  /** `obra_id -> itens da EAP dela`, buscado só na hora de editar (evita carregar EAP de toda obra de cara). */
  private readonly itensEapPorObra = signal<Map<string, ItemEapResumo[]>>(new Map());
  protected readonly contratoEmEdicao = signal<ContratoComObra | null | undefined>(undefined);
  protected readonly itensEapDaEdicao = signal<ItemEapResumo[]>([]);

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.api.listarGeral().subscribe({
      next: (lista) => {
        this.contratos.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os contratos de equipamentos.');
        this.carregando.set(false);
      },
    });

    this.apiGeral
      .listarPagamentos()
      .pipe(catchError(() => of([])))
      .subscribe((lista) => {
        const porContrato = new Map<string, Pagamento[]>();
        for (const bruto of lista) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const origem = pagamento.origem;
          if (origem?.tipo !== 'contrato_equipamento' || !origem.refId) continue;
          const atual = porContrato.get(origem.refId) ?? [];
          atual.push(pagamento);
          porContrato.set(origem.refId, atual);
        }
        this.pagamentosPorContrato.set(porContrato);
      });
  }

  protected equipamentosAtuais(contrato: ContratoEquipamento): string[] {
    return contrato.itens.filter((i) => !i.devolvido_em).map((i) => `${i.descricao} (x${i.quantidade})`);
  }

  protected pagamentosDoContrato(contrato: ContratoEquipamento): Pagamento[] {
    return this.pagamentosPorContrato().get(contrato.id) ?? [];
  }

  protected totalPago(contrato: ContratoEquipamento): number {
    return this.pagamentosDoContrato(contrato).reduce((soma, p) => soma + (p.valorTotal || 0), 0);
  }

  protected abrirPopupPagamentos(contrato: ContratoComObra, evento: Event): void {
    evento.stopPropagation();
    if (!this.pagamentosDoContrato(contrato).length) return;
    this.popupContrato.set(contrato);
  }

  protected fecharPopupPagamentos(): void {
    this.popupContrato.set(null);
  }

  protected abrirPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.abrir(pagamento);
  }

  protected fecharPagamento(): void {
    this.acoesPagamento.fechar();
  }

  protected salvarPagamento(evento: EventoSalvarPagamento): void {
    this.acoesPagamento.salvar(evento);
  }

  protected excluirPagamentoDoEditor(pagamento: Pagamento): void {
    this.acoesPagamento.excluirDoEditor(pagamento);
  }

  protected confirmarPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.confirmar(pagamento);
  }

  protected excluirPagamento(pagamento: Pagamento): void {
    this.acoesPagamento.excluir(pagamento);
  }

  protected readonly contratoSolicitacaoPagamento = signal<ContratoComObra | null>(null);

  protected abrirSolicitacaoPagamento(contrato: ContratoComObra, evento: Event): void {
    evento.stopPropagation();
    if (!this.pagamentosDoContrato(contrato).length) return;
    this.contratoSolicitacaoPagamento.set(contrato);
  }

  protected fecharSolicitacaoPagamento(): void {
    this.contratoSolicitacaoPagamento.set(null);
  }

  protected async confirmarSolicitacaoPagamento(pixPorNome: Map<string, string>): Promise<void> {
    const contrato = this.contratoSolicitacaoPagamento();
    this.contratoSolicitacaoPagamento.set(null);
    if (!contrato) return;

    const pix = pixPorNome.get(contrato.fornecedor) ?? '';
    const mensagem = montarMensagemPagamentoContratoEquipamento(contrato, this.pagamentosDoContrato(contrato), pix);
    if (!mensagem) return;

    const ok = await copiarParaAreaDeTransferencia(mensagem);
    if (!ok) window.alert('Não foi possível copiar — copie manualmente o texto abaixo:\n\n' + mensagem);
  }

  // ------------------------------------------------------------------
  // Editar/excluir — a EAP da obra dona do contrato é buscada só ao abrir.
  // ------------------------------------------------------------------

  protected abrirEdicao(contrato: ContratoComObra): void {
    this.contratoEmEdicao.set(contrato);

    const cache = this.itensEapPorObra().get(contrato.obra_id);
    if (cache) {
      this.itensEapDaEdicao.set(cache);
      return;
    }

    this.itensEapDaEdicao.set([]);
    this.apiGeral.obterEap(contrato.obra_id).subscribe({
      next: (payload) => {
        const itens = extrairItensEapResumo(payload.eapItems);
        this.itensEapPorObra.update((mapa) => new Map(mapa).set(contrato.obra_id, itens));
        this.itensEapDaEdicao.set(itens);
      },
      error: () => this.itensEapDaEdicao.set([]),
    });
  }

  protected fecharEdicaoContrato(): void {
    this.contratoEmEdicao.set(undefined);
  }

  protected contratoSalvo(contrato: ContratoEquipamento): void {
    this.contratos.update((lista) =>
      lista.map((c) => (c.id === contrato.id ? { ...contrato, obra_nome: c.obra_nome } : c)),
    );
    this.contratoEmEdicao.set(undefined);
  }

  protected contratoExcluido(id: string): void {
    this.contratos.update((lista) => lista.filter((c) => c.id !== id));
    this.fecharEdicaoContrato();
  }

  protected excluirContrato(contrato: ContratoComObra): void {
    if (!confirm(`Excluir o contrato nº ${contrato.numero} — ${contrato.nome_contrato}? Os pagamentos já gerados NÃO são excluídos. Esta ação não pode ser desfeita.`)) {
      return;
    }
    this.api.excluir(contrato.id).subscribe({
      next: () => this.contratos.update((lista) => lista.filter((c) => c.id !== contrato.id)),
      error: () => this.erro.set('Não foi possível excluir este contrato.'),
    });
  }
}
