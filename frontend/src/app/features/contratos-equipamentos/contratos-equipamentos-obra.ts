import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { AcoesPagamento, aplicarAlteracaoEmMapa } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { EditarPagamentoModal, EventoSalvarPagamento } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { ContratoEquipamento, ROTULOS_STATUS_CONTRATO } from './contratos-equipamentos.models';
import { ContratosEquipamentosService } from './contratos-equipamentos.service';
import { EditarContratoEquipamentoModal } from './editar-contrato-equipamento-modal';

/**
 * Controle de contrato de equipamentos alugados (26/09/2026, pedido do
 * Lucas) — lista da obra. Mesmo padrão visual e de popups de `MapasObra`:
 * lista em `.painel`/tabela padrão do sistema, "Total pago" abre o popup de
 * pagamentos vinculados (confirmar/editar/excluir), criação e edição do
 * contrato em popup (`EditarContratoEquipamentoModal`).
 */
@Component({
  selector: 'app-contratos-equipamentos-obra',
  imports: [RedimensionarColunas, EditarPagamentoModal, EditarContratoEquipamentoModal],
  templateUrl: './contratos-equipamentos-obra.html',
  styleUrl: './contratos-equipamentos-obra.scss',
})
export class ContratosEquipamentosObra implements OnInit {
  private readonly api = inject(ContratosEquipamentosService);
  private readonly apiGeral = inject(ApiService);
  private readonly router = inject(Router);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly contratos = signal<ContratoEquipamento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly itensEap = signal<ItemEapResumo[]>([]);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly rotulosStatus = ROTULOS_STATUS_CONTRATO;

  /** Pagamentos gerados a partir de cada contrato — `contratoId -> Pagamento[]`. Mesmo padrão de `MapasObra`. */
  protected readonly pagamentosPorContrato = signal<Map<string, Pagamento[]>>(new Map());
  /** Contrato cujo popup de pagamentos está aberto — null quando fechado. */
  protected readonly popupContrato = signal<ContratoEquipamento | null>(null);

  private readonly acoesPagamento = new AcoesPagamento(
    this.apiGeral,
    (alteracao) => this.pagamentosPorContrato.update((mapa) => aplicarAlteracaoEmMapa(mapa, alteracao)),
  );
  protected readonly pagamentoEmEdicao = this.acoesPagamento.emEdicao;

  /** Contrato aberto no popup de criação/edição — null = fechado. */
  protected readonly contratoEmEdicao = signal<ContratoEquipamento | null | undefined>(undefined);

  ngOnInit(): void {
    this.carregar();
    this.apiGeral.obterEap(this.obraId()).subscribe({
      next: (payload) => this.itensEap.set(extrairItensEapResumo(payload.eapItems)),
      error: () => this.itensEap.set([]),
    });
  }

  private carregar(): void {
    this.carregando.set(true);
    this.api.listar(this.obraId()).subscribe({
      next: (lista) => {
        this.contratos.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os contratos de equipamentos desta obra.');
        this.carregando.set(false);
      },
    });

    this.apiGeral
      .listarPagamentos({ obraId: this.obraId() })
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

  protected abrirPopupPagamentos(contrato: ContratoEquipamento, evento: Event): void {
    evento.stopPropagation();
    if (!this.pagamentosDoContrato(contrato).length) return;
    this.popupContrato.set(contrato);
  }

  protected fecharPopupPagamentos(): void {
    this.popupContrato.set(null);
  }

  protected irParaPagamentos(): void {
    this.fecharPopupPagamentos();
    void this.router.navigate(['/obras', this.obraId(), 'pagamentos']);
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

  // ------------------------------------------------------------------
  // Popup de criação/edição do contrato
  // ------------------------------------------------------------------

  protected abrirNovo(): void {
    this.contratoEmEdicao.set(null);
  }

  protected abrirEdicao(contrato: ContratoEquipamento): void {
    this.contratoEmEdicao.set(contrato);
  }

  protected fecharEdicaoContrato(): void {
    this.contratoEmEdicao.set(undefined);
  }

  protected contratoSalvo(contrato: ContratoEquipamento): void {
    this.contratos.update((lista) => {
      const existe = lista.some((c) => c.id === contrato.id);
      return existe ? lista.map((c) => (c.id === contrato.id ? contrato : c)) : [contrato, ...lista];
    });
    this.contratoEmEdicao.set(contrato);
  }

  protected contratoExcluido(id: string): void {
    this.contratos.update((lista) => lista.filter((c) => c.id !== id));
    this.fecharEdicaoContrato();
  }

  protected excluirContrato(contrato: ContratoEquipamento): void {
    if (!confirm(`Excluir o contrato nº ${contrato.numero} — ${contrato.nome_contrato}? Os pagamentos já gerados NÃO são excluídos. Esta ação não pode ser desfeita.`)) {
      return;
    }
    this.api.excluir(contrato.id).subscribe({
      next: () => this.contratos.update((lista) => lista.filter((c) => c.id !== contrato.id)),
      error: () => this.erro.set('Não foi possível excluir este contrato.'),
    });
  }
}
