import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';

import { formatarMoeda } from '../../core/utils/formato';
import { expandirItensPagamento, parsearBR } from '../pagamentos/pagamentos-calc';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { EapStore } from './eap.store';
import {
  CabecalhoObra,
  ChaveTipo,
  EscopoBdi,
  ItemEap,
  ModoBdi,
  TIPOS_CUSTO,
} from './eap.models';

/**
 * Cadastro de EAP — a tela central do sistema.
 *
 * Uma tabela hierárquica em que cada linha é um item de orçamento com
 * custo unitário dividido por categoria (material, mão de obra…), e as
 * linhas de grupo somam seus descendentes. Sobre esse custo direto
 * incide o BDI, configurável em três escopos.
 *
 * Os cálculos ficam em `eap-engine.ts`, verificado número a número
 * contra o app original — ver `verificacao/`.
 */
@Component({
  selector: 'app-eap',
  imports: [DecimalPipe, NavegacaoTabela],
  providers: [EapStore, PagamentosStore],
  templateUrl: './eap.html',
  styleUrl: './eap.scss',
})
export class Eap implements OnInit {
  protected readonly store = inject(EapStore);

  /**
   * Só para ler os pagamentos da obra e calcular o "Realizado" por item
   * (task "orçado x realizado", 28/07/2026) — a EAP não grava nada aqui,
   * só lê. Cada aba tem sua própria instância de `PagamentosStore`
   * (providers acima), então isso não interfere com a aba Pagamentos.
   */
  private readonly pagamentosStore = inject(PagamentosStore);

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Sem isso, a EAP não sabe de qual obra é.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;

  /**
   * Item da EAP cujo modal de pagamentos vinculados está aberto — null
   * quando o modal está fechado.
   */
  protected readonly itemPagamentosAberto = signal<ItemEap | null>(null);

  /**
   * Soma do "Realizado" de cada item da EAP: o total já pago em itens de
   * pagamento cujo `eapId` aponta para aquele item. Vem da mesma ideia do
   * protótipo do Lucas (obracontrol.html) — lá é `it.realizado`, mockado;
   * aqui é somado de verdade a partir do `PagamentosStore` da obra.
   */
  protected readonly realizadoPorItem = computed(() => {
    const mapa = new Map<string, number>();
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      // Pagamento "pendente" (gerado pela aba Mapas e ainda não conferido)
      // não conta como realizado — só depois de confirmado na aba
      // Pagamentos (31/07/2026, task "Gerar Pagamento" do Mapa).
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        mapa.set(item.eapId, (mapa.get(item.eapId) ?? 0) + item.valorCalculado);
      }
    }
    return mapa;
  });

  /**
   * Soma do realizado só dos itens que ainda existem na EAP — um
   * pagamento vinculado a um item já excluído não entra no total do
   * rodapé (mas continua contando para a coluna daquele item, se ele
   * ainda existir).
   */
  protected readonly totalRealizado = computed(() => {
    const mapa = this.realizadoPorItem();
    return this.store.itens().reduce((soma, item) => soma + (mapa.get(item.id) ?? 0), 0);
  });

  /** Número de colunas da tabela, para o colspan das linhas vazias. */
  protected readonly totalColunas = computed(() => {
    const ui = this.store.ui();
    const porTipo = this.store.mostrarColunasTipo() ? this.store.tiposVisiveis().length : 0;

    let colunas = 5; // grupo, EAP, descrição, quantidade, unidade
    if (ui.showUnit) colunas += porTipo + 1;
    if (ui.showTotal) colunas += porTipo + 1;
    if (ui.showBDI) colunas += 3;
    if (this.store.cabecalho().isConfirmed) colunas += 2; // orçado + realizado
    return colunas + 1; // ações
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
    this.pagamentosStore.carregar(this.obraId());
  }

  // ------------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------------
  protected editarCabecalho(campo: keyof CabecalhoObra, evento: Event): void {
    this.store.atualizarCabecalho(campo, (evento.target as HTMLInputElement).value);
  }

  protected mudarEscopoBdi(escopo: EscopoBdi): void {
    this.store.atualizarCabecalho('bdiScope', escopo);
  }

  protected alternarModoBdiGlobal(): void {
    const modo: ModoBdi = this.store.cabecalho().bdiMode === 'pct' ? 'value' : 'pct';
    this.store.atualizarCabecalho('bdiMode', modo);
  }

  protected editarBdiGlobal(evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    const campo = this.store.cabecalho().bdiMode === 'pct' ? 'bdiPercent' : 'bdiValue';
    this.store.atualizarCabecalho(campo, valor);
  }

  protected alternarModoBdiTipo(chave: ChaveTipo): void {
    const atual = this.store.cabecalho().bdiByType[chave];
    const modo: ModoBdi = atual.mode === 'pct' ? 'value' : 'pct';
    this.store.atualizarCabecalho('bdiByType', {
      ...this.store.cabecalho().bdiByType,
      [chave]: { ...atual, mode: modo },
    });
  }

  protected editarBdiTipo(chave: ChaveTipo, evento: Event): void {
    const atual = this.store.cabecalho().bdiByType[chave];
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    const campo = atual.mode === 'pct' ? 'percent' : 'value';

    this.store.atualizarCabecalho('bdiByType', {
      ...this.store.cabecalho().bdiByType,
      [chave]: { ...atual, [campo]: valor },
    });
  }

  // ------------------------------------------------------------------
  // Linhas
  // ------------------------------------------------------------------
  protected editarTexto(item: ItemEap, campo: 'desc' | 'unid', evento: Event): void {
    this.store.atualizarItem(item.id, { [campo]: (evento.target as HTMLInputElement).value });
  }

  protected editarQuantidade(item: ItemEap, evento: Event): void {
    this.store.atualizarItem(item.id, { qtde: parsearBR((evento.target as HTMLInputElement).value) });
  }

  protected editarCusto(item: ItemEap, tipo: ChaveTipo, evento: Event): void {
    this.store.atualizarCustoUnitario(
      item.id,
      tipo,
      parsearBR((evento.target as HTMLInputElement).value),
    );
  }

  protected alternarGrupo(item: ItemEap): void {
    this.store.atualizarItem(item.id, { isGroup: !item.isGroup });
  }

  protected alternarModoBdiItem(item: ItemEap): void {
    this.store.atualizarItem(item.id, { bdiMode: item.bdiMode === 'pct' ? 'value' : 'pct' });
  }

  protected editarBdiItem(item: ItemEap, evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    const campo = item.bdiMode === 'pct' ? 'bdiPercent' : 'bdiValue';
    this.store.atualizarItem(item.id, { [campo]: valor });
  }

  protected remover(item: ItemEap): void {
    if (!window.confirm('Excluir esta linha da EAP?')) return;
    this.store.removerItem(item.id);
  }

  /** Shift + `+` na tabela: insere item logo abaixo da linha atual. */
  protected inserirAbaixo(indiceLinha: number): void {
    this.store.adicionarItem(false, indiceLinha < 0 ? undefined : indiceLinha + 1);
  }

  /** Shift + `-` na tabela: remove a linha atual, sem confirmar. */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.store.itens()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  protected limpar(): void {
    if (!window.confirm('Isso apaga todos os itens e os dados da obra. Continuar?')) return;
    this.store.limpar();
  }

  // ------------------------------------------------------------------
  // Leitura de valores calculados
  // ------------------------------------------------------------------
  /** Nível de indentação: "1.2.3" recua dois níveis. */
  protected nivel(item: ItemEap): number {
    return Math.max(0, String(item.eap ?? '').split('.').filter(Boolean).length - 1);
  }

  protected custoDireto(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).directTotal
      : this.store.cache().directTotal[indice];
  }

  protected custoDiretoTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).directByType[tipo]
      : this.store.cache().directByType[indice][tipo];
  }

  protected bdi(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).bdiApplied
      : this.store.cache().bdiApplied[indice];
  }

  protected bdiPercentual(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).bdiPctApplied
      : this.store.cache().bdiPctApplied[indice];
  }

  protected totalComBdi(indice: number, item: ItemEap): number {
    return item.isGroup
      ? this.store.totaisDoGrupo(indice).totalWithBdi
      : this.store.cache().totalWithBdi[indice];
  }

  protected valorBdiItem(item: ItemEap): string {
    const valor = item.bdiMode === 'pct' ? item.bdiPercent : item.bdiValue;
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected valorBdiGlobal(): string {
    const cabecalho = this.store.cabecalho();
    const valor = cabecalho.bdiMode === 'pct' ? cabecalho.bdiPercent : cabecalho.bdiValue;
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected valorBdiTipo(chave: ChaveTipo): string {
    const slot = this.store.cabecalho().bdiByType[chave];
    const valor = slot.mode === 'pct' ? slot.percent : slot.value;
    return valor ? String(valor).replace('.', ',') : '';
  }

  /** Campos numéricos ficam vazios quando zerados, para não poluir a tabela. */
  protected numeroOuVazio(valor: number): string {
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  // ------------------------------------------------------------------
  // Orçado x Realizado
  // ------------------------------------------------------------------
  /**
   * "Orçado" aqui é o total calculado ao vivo (custo direto + BDI), o
   * mesmo valor da coluna Total + BDI — não um retrato congelado no
   * momento da confirmação. O protótipo do Lucas (obracontrol.html)
   * sugere um `orcado` separado do cálculo, possivelmente congelado; não
   * implementei isso porque ainda não foi decidido com ele. Se for esse
   * o comportamento desejado, é só passar a gravar aqui o valor do
   * momento da confirmação em vez de recalcular sempre.
   */
  protected orcadoDoItem(indice: number, item: ItemEap): number {
    return this.totalComBdi(indice, item);
  }

  protected realizadoDoItem(item: ItemEap): number {
    return this.realizadoPorItem().get(item.id) ?? 0;
  }

  protected abrirPagamentosDoItem(item: ItemEap): void {
    this.itemPagamentosAberto.set(item);
  }

  protected fecharModalPagamentos(): void {
    this.itemPagamentosAberto.set(null);
  }

  /** Pagamentos (já expandidos por item) vinculados ao item aberto no modal. */
  protected pagamentosVinculados(item: ItemEap): Array<{
    numeroPagamento: string;
    fornecedor: string;
    descricao: string;
    dataPagamento: string;
    valor: number;
    pendente: boolean;
  }> {
    const lista: Array<{
      numeroPagamento: string;
      fornecedor: string;
      descricao: string;
      dataPagamento: string;
      valor: number;
      pendente: boolean;
    }> = [];

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      for (const itemPag of expandirItensPagamento(pagamento)) {
        if (itemPag.eapId !== item.id) continue;
        lista.push({
          numeroPagamento: pagamento.numeroPagamento,
          fornecedor: pagamento.fornecedor,
          descricao: itemPag.descricao || pagamento.descricao,
          dataPagamento: pagamento.dataPagamento,
          valor: itemPag.valorCalculado,
          // Listado para transparência, mas não entra na soma do
          // "Realizado" enquanto não for confirmado na aba Pagamentos.
          pendente: pagamento.status === 'pendente',
        });
      }
    }
    return lista;
  }
}
