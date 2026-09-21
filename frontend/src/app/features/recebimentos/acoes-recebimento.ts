import { signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { extrairItensEapResumo, ItemEapResumo } from '../../shared/eap-snapshot';
import { EventoSalvarRecebimento } from './editar-recebimento-modal/editar-recebimento-modal';
import { normalizarRecebimento, paraPayloadApi } from './recebimentos-calc';
import { Recebimento } from './recebimentos.models';

/** O que mudou num recebimento a partir de uma lista/card — quem hospeda atualiza a própria lista. */
export type AlteracaoRecebimento =
  | { tipo: 'atualizado'; recebimento: Recebimento }
  | { tipo: 'excluido'; id: string };

/** Texto da confirmação de exclusão de UM recebimento (avisa o que muda). */
export function mensagemExclusaoRecebimento(recebimento: Recebimento): string {
  const numero = recebimento.numeroRecebimento || 'sem número';
  const aviso =
    recebimento.status === 'pendente'
      ? 'Ele deixa de aparecer nos acompanhamentos da obra.'
      : 'Ele JÁ ESTÁ CONFIRMADO: deixa de contar como recebido nos totais da obra.';
  return `Excluir o recebimento ${numero}?\n\n${aviso}`;
}

/**
 * Ações sobre UM recebimento fora da tela de Recebimentos da obra (listas
 * gerais e cards do painel — 21/09/2026): abrir o editor (com as etapas da
 * EAP da obra do recebimento), confirmar um pendente e excluir. Espelha
 * `AcoesPagamento`; cada tela cria a sua e diz em `aoAlterar` como atualizar
 * a própria lista.
 */
export class AcoesRecebimento {
  readonly emEdicao = signal<Recebimento | null>(null);
  readonly snapshotEap = signal<ItemEapResumo[]>([]);

  constructor(
    private readonly api: ApiService,
    private readonly aoAlterar: (alteracao: AlteracaoRecebimento) => void,
    private readonly obraIdPadrao: (recebimento: Recebimento) => string = () => '',
  ) {}

  private obraDe(recebimento: Recebimento): string {
    return String((recebimento as { obraId?: string }).obraId ?? '') || this.obraIdPadrao(recebimento);
  }

  /**
   * Abre o editor NA HORA e busca em seguida as etapas da EAP da obra do
   * recebimento (a EAP de uma obra grande leva alguns segundos; o seletor de
   * etapa do editor se preenche quando ela chega).
   */
  abrir(recebimento: Recebimento): void {
    this.snapshotEap.set([]);
    this.emEdicao.set(normalizarRecebimento(JSON.parse(JSON.stringify(recebimento))));
    const obraId = this.obraDe(recebimento);
    if (!obraId) return;
    this.api.obterEap(obraId).subscribe({
      next: (payload) => this.snapshotEap.set(extrairItensEapResumo(payload.eapItems)),
      error: () => undefined,
    });
  }

  fechar(): void {
    this.emEdicao.set(null);
  }

  salvar(evento: EventoSalvarRecebimento): void {
    const recebimento = evento.recebimento;
    this.api.atualizarRecebimento(recebimento.id, paraPayloadApi(recebimento, this.obraDe(recebimento))).subscribe({
      next: (salvo) => {
        this.aoAlterar({ tipo: 'atualizado', recebimento: normalizarRecebimento(salvo as Record<string, unknown>) });
        this.fechar();
      },
      error: () => window.alert('Não foi possível salvar o recebimento — confira os valores e tente de novo.'),
    });
  }

  confirmar(recebimento: Recebimento): void {
    if (recebimento.status !== 'pendente') return;
    const confirmado: Recebimento = { ...recebimento, status: 'confirmado', dataRecebimento: new Date().toISOString() };
    this.api.atualizarRecebimento(recebimento.id, paraPayloadApi(confirmado, this.obraDe(recebimento))).subscribe({
      next: (salvo) =>
        this.aoAlterar({ tipo: 'atualizado', recebimento: normalizarRecebimento(salvo as Record<string, unknown>) }),
      error: () => window.alert('Não foi possível confirmar o recebimento.'),
    });
  }

  excluir(recebimento: Recebimento): void {
    if (!window.confirm(mensagemExclusaoRecebimento(recebimento))) return;

    this.api.excluirRecebimento(recebimento.id).subscribe({
      next: () => this.aoAlterar({ tipo: 'excluido', id: recebimento.id }),
      error: () => window.alert('Não foi possível excluir o recebimento.'),
    });
  }
}
