import { signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { extrairItensEapResumo, ItemEapResumo } from '../eap-snapshot';
import { EventoSalvarPagamento } from '../../features/pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { normalizarPagamento, paraPayloadApi } from '../../features/pagamentos/pagamentos-calc';
import { Pagamento } from '../../features/pagamentos/pagamentos.models';

/** O que mudou num pagamento a partir de um popup — quem hospeda o popup atualiza a própria lista. */
export type AlteracaoPagamento =
  | { tipo: 'atualizado'; pagamento: Pagamento }
  | { tipo: 'excluido'; id: string };

/** Texto da confirmação de exclusão de UM pagamento a partir de um popup (avisa o que muda). */
export function mensagemExclusaoPagamento(pagamento: Pagamento): string {
  const numero = pagamento.numeroPagamento || 'sem número';
  const aviso =
    pagamento.status === 'pendente'
      ? 'Ele deixa de aparecer nos acompanhamentos de mapa e empreita a que estiver vinculado.'
      : 'Ele JÁ ESTÁ CONFIRMADO: deixa de contar no Realizado da EAP e no "Já pago" da empreita, e some do acompanhamento do mapa a que estiver vinculado.';
  return `Excluir o pagamento ${numero}?\n\n${aviso}`;
}

/**
 * Ações sobre UM pagamento dentro de um popup de lista (21/09/2026, pedido do
 * Lucas: confirmar/excluir/abrir o pagamento direto do popup de pagamentos
 * vinculados de um Mapa, Empreita ou EAP). Não é serviço nem componente: cada
 * popup cria a sua (`new AcoesPagamento(...)`) e diz, em `aoAlterar`, como
 * atualizar a lista onde os pagamentos moram.
 *
 * - `abrir` mostra o `EditarPagamentoModal` do pagamento (`emEdicao`);
 * - `confirmar` passa o pagamento pendente a confirmado, com a data/hora do
 *   clique como data de pagamento (mesma regra do ✔ da lista de Pagamentos);
 * - `excluir` pede confirmação com aviso do que muda e só então apaga.
 */
export class AcoesPagamento {
  readonly emEdicao = signal<Pagamento | null>(null);

  /**
   * `obraIdPadrao` cobre pagamentos que não trazem `obraId` (o payload de
   * atualização precisa dele).
   */
  constructor(
    private readonly api: ApiService,
    private readonly aoAlterar: (alteracao: AlteracaoPagamento) => void,
    private readonly obraIdPadrao: (pagamento: Pagamento) => string = () => '',
  ) {}

  private obraDe(pagamento: Pagamento): string {
    return pagamento.obraId || this.obraIdPadrao(pagamento);
  }

  abrir(pagamento: Pagamento): void {
    this.emEdicao.set(pagamento);
  }

  /** Etapas da EAP da obra do pagamento aberto com `abrirComEap` (rótulos do seletor de etapa do editor). */
  readonly snapshotEap = signal<ItemEapResumo[]>([]);

  /**
   * Abre o editor NA HORA e busca em seguida as etapas da EAP da obra do
   * pagamento (a EAP de uma obra grande leva alguns segundos; o seletor de etapa
   * do editor se preenche quando ela chega).
   */
  abrirComEap(pagamento: Pagamento): void {
    this.snapshotEap.set([]);
    this.emEdicao.set(JSON.parse(JSON.stringify(pagamento)) as Pagamento);
    const obraId = this.obraDe(pagamento);
    if (!obraId) return;
    this.api.obterEap(obraId).subscribe({
      next: (payload) => this.snapshotEap.set(extrairItensEapResumo(payload.eapItems)),
      error: () => undefined,
    });
  }

  fechar(): void {
    this.emEdicao.set(null);
  }

  salvar(evento: EventoSalvarPagamento): void {
    const pagamento = evento.pagamento;
    this.api.atualizarPagamento(pagamento.id, paraPayloadApi(pagamento, this.obraDe(pagamento))).subscribe({
      next: (salvo) => {
        this.aoAlterar({ tipo: 'atualizado', pagamento: normalizarPagamento(salvo as Record<string, unknown>) });
        this.fechar();
      },
      error: () => window.alert('Não foi possível salvar o pagamento — confira os valores e tente de novo.'),
    });
  }

  confirmar(pagamento: Pagamento): void {
    if (pagamento.status !== 'pendente') return;
    const confirmado: Pagamento = { ...pagamento, status: 'confirmado', dataPagamento: new Date().toISOString() };
    this.api.atualizarPagamento(pagamento.id, paraPayloadApi(confirmado, this.obraDe(pagamento))).subscribe({
      next: (salvo) =>
        this.aoAlterar({ tipo: 'atualizado', pagamento: normalizarPagamento(salvo as Record<string, unknown>) }),
      error: () => window.alert('Não foi possível confirmar o pagamento.'),
    });
  }

  excluir(pagamento: Pagamento): void {
    if (!window.confirm(mensagemExclusaoPagamento(pagamento))) return;

    this.api.excluirPagamento(pagamento.id).subscribe({
      next: () => this.aoAlterar({ tipo: 'excluido', id: pagamento.id }),
      error: () => window.alert('Não foi possível excluir o pagamento.'),
    });
  }
}

/** Aplica uma alteração num mapa "id do dono → pagamentos" (usado por Mapas e Empreitas, que agrupam por origem). */
export function aplicarAlteracaoEmMapa(
  atual: Map<string, Pagamento[]>,
  alteracao: AlteracaoPagamento,
): Map<string, Pagamento[]> {
  const copia = new Map(atual);
  for (const [dono, lista] of copia) {
    if (alteracao.tipo === 'excluido') {
      if (lista.some((p) => p.id === alteracao.id)) copia.set(dono, lista.filter((p) => p.id !== alteracao.id));
    } else if (lista.some((p) => p.id === alteracao.pagamento.id)) {
      copia.set(dono, lista.map((p) => (p.id === alteracao.pagamento.id ? alteracao.pagamento : p)));
    }
  }
  return copia;
}
