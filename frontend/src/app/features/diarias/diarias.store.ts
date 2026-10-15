import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { gerarNumeroPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import { CHAVE_EMPREITEIROS, normalizarEmpreiteiro } from '../cadastros/empreiteiros/empreiteiros';
import { Empreiteiro } from '../cadastros/cadastros.models';
import { erroParaFechar, gerarItensPagamento } from './diarias-engine';
import { PayloadDiaria, normalizarCategorias, normalizarDiaria } from './diarias-normalize';
import { CATEGORIAS_DIARIA_PADRAO, CategoriasDiaria, Diaria } from './diarias.models';

/**
 * Store da aba Diárias (F7, 22/09/2026). Mistura três fontes: a API própria
 * das diárias, a EAP da obra (rótulo/opções de etapa) e o cadastro de
 * Profissionais (ainda na ponte de storage — mesmo jeito que `Empreita` já
 * lê, ver `empreita.ts`).
 */
@Injectable()
export class DiariasStore {
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);

  private obraId = '';

  readonly diarias = signal<Diaria[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);

  readonly itensEap = signal<ItemEapResumo[]>([]);
  readonly profissionais = signal<Empreiteiro[]>([]);
  readonly categorias = signal<CategoriasDiaria>(CATEGORIAS_DIARIA_PADRAO);

  /** Só os ativos, alfabético — pro seletor do formulário. */
  readonly opcoesProfissional = computed<OpcaoAutocomplete[]>(() =>
    this.profissionais()
      .filter((p) => p.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => ({ id: p.id, rotulo: p.especialidade ? `${p.nome} — ${p.especialidade}` : p.nome })),
  );

  /** Etapas-folha da EAP (grupo não recebe lançamento direto) — pro seletor de etapa. */
  readonly opcoesEtapa = computed<OpcaoAutocomplete[]>(() =>
    this.itensEap()
      .filter((i) => !i.isGroup)
      .map((i) => ({ id: i.id, rotulo: this.rotuloEap(i) })),
  );

  protected rotuloEap(item: ItemEapResumo): string {
    const eap = String(item.eap ?? '').trim();
    const desc = String(item.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarDiarias(obraId).subscribe({
      next: (lista) => {
        this.diarias.set(lista.map((d) => normalizarDiaria(d)));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as diárias.');
        this.carregando.set(false);
      },
    });

    // EAP e Profissionais entram só como rótulo/opção — uma falha ao carregar
    // não deve travar a tela principal, os seletores apenas ficam vazios.
    this.api.obterEap(obraId).subscribe({
      next: (payload) => this.itensEap.set(extrairItensEapResumo(payload.eapItems)),
      error: () => this.itensEap.set([]),
    });

    this.armazenamento.ler(CHAVE_EMPREITEIROS).subscribe({
      next: (bruto) => {
        if (!bruto) return;
        try {
          const dados = JSON.parse(bruto);
          if (Array.isArray(dados)) this.profissionais.set(dados.map((d) => normalizarEmpreiteiro(d)));
        } catch {
          // cadastro fica vazio, o seletor só mostra "(nenhum)"
        }
      },
      error: () => this.profissionais.set([]),
    });

    this.api.obterCategoriasDiaria().subscribe({
      next: (bruto) => this.categorias.set(normalizarCategorias(bruto, CATEGORIAS_DIARIA_PADRAO)),
      error: () => this.categorias.set(CATEGORIAS_DIARIA_PADRAO),
    });
  }

  /** Recarrega só a lista de diárias (depois do popup gravar/excluir) — EAP/profissionais não mudaram. */
  recarregarDiarias(): void {
    if (!this.obraId) return;
    this.api.listarDiarias(this.obraId).subscribe({
      next: (lista) => this.diarias.set(lista.map((d) => normalizarDiaria(d))),
      error: () => this.erro.set('Não foi possível carregar as diárias.'),
    });
  }

  obterProfissional(id: string): Empreiteiro | undefined {
    return this.profissionais().find((p) => p.id === id);
  }

  criar(dados: PayloadDiaria, aoSalvar: (erro: string | null) => void): void {
    this.salvando.set(true);
    this.api.criarDiaria(this.obraId, dados).subscribe({
      next: (bruto) => {
        this.diarias.update((lista) => [normalizarDiaria(bruto), ...lista]);
        this.salvando.set(false);
        aoSalvar(null);
      },
      error: (erro) => {
        this.salvando.set(false);
        aoSalvar(this.mensagemDeErro(erro));
      },
    });
  }

  atualizar(id: string, dados: PayloadDiaria, aoSalvar: (erro: string | null) => void): void {
    this.salvando.set(true);
    this.api.atualizarDiaria(this.obraId, id, dados).subscribe({
      next: (bruto) => {
        const atualizada = normalizarDiaria(bruto);
        this.diarias.update((lista) => lista.map((d) => (d.id === id ? atualizada : d)));
        this.salvando.set(false);
        aoSalvar(null);
      },
      error: (erro) => {
        this.salvando.set(false);
        aoSalvar(this.mensagemDeErro(erro));
      },
    });
  }

  remover(id: string): void {
    this.api.excluirDiaria(this.obraId, id).subscribe({
      next: () => this.diarias.update((lista) => lista.filter((d) => d.id !== id)),
      error: (erro) => window.alert(this.mensagemDeErro(erro)),
    });
  }

  /**
   * Fecha o lote em UM Pagamento pendente. `gerarItensPagamento` (motor
   * puro, já testado) calcula os itens; a store só monta o payload e chama
   * a API. `pagamentosDaObra` é usado só pra gerar o próximo número
   * (`PG-000N`) — mesmo mecanismo do Mapa/Empreita.
   */
  fechar(
    idsSelecionados: string[],
    opcoes: { fornecedor: string; descricao: string; dataPagamento: string },
    pagamentosDaObra: Pagamento[],
    aoFechar: (resultado: { ok: true } | { ok: false; erro: string }) => void,
  ): void {
    const diarias = this.diarias().filter((d) => idsSelecionados.includes(d.id));
    const resultado = gerarItensPagamento(diarias, this.categorias());

    if (resultado.erros.size) {
      const [[, mensagem]] = resultado.erros;
      aoFechar({ ok: false, erro: mensagem });
      return;
    }
    if (!resultado.itens.length) {
      aoFechar({ ok: false, erro: 'Nenhum valor para fechar — confira os lançamentos selecionados.' });
      return;
    }

    this.salvando.set(true);
    this.api
      .fecharDiarias(this.obraId, {
        numero_pagamento: gerarNumeroPagamento(pagamentosDaObra),
        fornecedor: opcoes.fornecedor,
        descricao: opcoes.descricao,
        data_pagamento: opcoes.dataPagamento || null,
        diaria_ids: idsSelecionados,
        valor_total: resultado.total,
        itens: resultado.itens.map((item) => ({
          descricao: item.descricao,
          tipo: item.tipo,
          eap_item_id: item.eapId,
          valor: item.valor,
          diaria_id: item.diariaId,
        })),
      })
      .subscribe({
        next: (resposta) => {
          const fechadas = new Map(resposta.diarias.map((d) => [String(d['id']), normalizarDiaria(d)]));
          this.diarias.update((lista) => lista.map((d) => fechadas.get(d.id) ?? d));
          this.salvando.set(false);
          aoFechar({ ok: true });
        },
        error: (erro) => {
          this.salvando.set(false);
          aoFechar({ ok: false, erro: this.mensagemDeErro(erro) });
        },
      });
  }

  /** Prévia do fechamento (pro popup mostrar antes de confirmar) — mesmo motor, sem gravar nada. */
  pretendeFechar(idsSelecionados: string[]) {
    const diarias = this.diarias().filter((d) => idsSelecionados.includes(d.id));
    return gerarItensPagamento(diarias, this.categorias());
  }

  erroParaFecharUma(d: Diaria): string | null {
    return erroParaFechar(d);
  }

  salvarCategorias(categorias: CategoriasDiaria, aoSalvar: (erro: string | null) => void): void {
    this.api.salvarCategoriasDiaria(categorias).subscribe({
      next: (bruto) => {
        this.categorias.set(normalizarCategorias(bruto, CATEGORIAS_DIARIA_PADRAO));
        aoSalvar(null);
      },
      error: (erro) => aoSalvar(this.mensagemDeErro(erro)),
    });
  }

  private mensagemDeErro(erro: unknown): string {
    const corpo = (erro as { error?: { message?: string } })?.error;
    return corpo?.message || 'Não foi possível concluir a operação.';
  }
}
