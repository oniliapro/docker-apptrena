import { Component, OnInit, computed, inject, input } from '@angular/core';

import { formatarMoeda } from '../../core/utils/formato';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { parsearBR } from '../pagamentos/pagamentos-calc';
import {
  calcularBaseItem,
  calcularTotalItem,
  obterVencedorAutomatico,
  obterVencedorEfetivo,
} from './mapa-engine';
import { CONTATOS, FORNECEDORES } from './mapa.dados';
import { ResumoEtapas } from './mapa-resumo-etapas';
import { CabecalhoMapa, Fornecedor, ItemMapa } from './mapa.models';
import { MapaStore } from './mapa.store';

/**
 * Mapa de Fornecedores — comparação de propostas.
 *
 * Cada item tem uma coluna de preço por fornecedor. O mais barato é
 * destacado em verde, considerando o imposto de cada um — um fornecedor
 * com preço menor mas alíquota maior pode perder.
 *
 * No rodapé, dois cenários: **fracionado** (cada item de quem ofereceu
 * mais barato) e **integral** (tudo de um só fornecedor, válido apenas
 * para quem cotou todos os itens).
 *
 * Os cálculos ficam em `mapa-engine.ts`, verificado contra o original em
 * `verificacao/`.
 */
@Component({
  selector: 'app-mapa',
  imports: [NavegacaoTabela],
  providers: [MapaStore],
  templateUrl: './mapa.html',
  styleUrl: './mapa.scss',
})
export class Mapa implements OnInit {
  protected readonly store = inject(MapaStore);

  /**
   * Id da obra — vem do param `:id` da rota avó (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Não é usado pra
   * carregar o mapa (isso é feito por `mapaId`), só fica disponível
   * caso a tela precise voltar pra obra.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  /** Id do mapa — vem do param `:mapaId` da própria rota (/obras/:id/mapas/:mapaId). */
  readonly mapaId = input.required<string>({ alias: 'mapaId' });

  protected readonly formatarMoeda = formatarMoeda;
  protected readonly listaFornecedores = FORNECEDORES;

  /**
   * Rateio por etapa. Fica como instância própria do componente porque
   * as travas são estado de simulação, não dado do mapa.
   */
  protected readonly resumo = new ResumoEtapas();

  /** Linhas do cruzamento etapa × fornecedor, recalculadas sozinhas. */
  protected readonly linhasEtapa = computed(() =>
    this.resumo.calcular(
      this.store.alocacoes(),
      this.store.itens(),
      this.store.fornecedores(),
      this.store.notas().bySupplier,
    ),
  );

  /** Fornecedores que ficaram com algum item — colunas do resumo. */
  protected readonly fornecedoresUsados = computed(() =>
    Array.from(new Set(this.store.alocacoes().map((a) => a.supplierIndex))).sort((a, b) => a - b),
  );

  protected readonly ratearFreteParticular = computed(() =>
    this.resumo.calcularFreteParticular(this.store.alocacoes(), this.store.itens()),
  );

  /** Colunas fixas antes das colunas de fornecedor. */
  private readonly COLUNAS_FIXAS = 6;

  protected readonly totalColunas = computed(
    () => this.COLUNAS_FIXAS + this.store.fornecedores().length * 3 + 1,
  );

  ngOnInit(): void {
    this.store.carregar(this.mapaId(), this.obraId());
  }

  // ------------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------------
  protected editarCabecalho(campo: keyof CabecalhoMapa, evento: Event): void {
    const alvo = evento.target as HTMLInputElement | HTMLSelectElement;
    this.store.atualizarCabecalho(campo, alvo.value as never);
  }

  protected editarFreteParticular(evento: Event): void {
    this.store.atualizarCabecalho(
      'freteParticular',
      parsearBR((evento.target as HTMLInputElement).value),
    );
  }

  protected alternarModoManual(): void {
    this.store.atualizarCabecalho('modoManual', !this.store.cabecalho().modoManual);
  }

  // ------------------------------------------------------------------
  // Fornecedores
  // ------------------------------------------------------------------
  protected contatosDe(fornecedor: Fornecedor): string[] {
    return CONTATOS[fornecedor.nome] ?? [];
  }

  protected editarNomeFornecedor(indice: number, evento: Event): void {
    // Trocar o fornecedor invalida o contato anterior.
    this.store.atualizarFornecedor(indice, {
      nome: (evento.target as HTMLSelectElement).value,
      contato: '',
    });
  }

  protected editarContato(indice: number, evento: Event): void {
    this.store.atualizarFornecedor(indice, {
      contato: (evento.target as HTMLSelectElement).value,
    });
  }

  protected editarNumeroFornecedor(
    indice: number,
    campo: 'imposto' | 'frete' | 'desconto',
    evento: Event,
  ): void {
    this.store.atualizarFornecedor(indice, {
      [campo]: parsearBR((evento.target as HTMLInputElement).value),
    });
  }

  protected alternarAtivo(indice: number, fornecedor: Fornecedor): void {
    this.store.atualizarFornecedor(indice, { ativo: !fornecedor.ativo });
  }

  protected removerFornecedor(indice: number, fornecedor: Fornecedor): void {
    const nome = fornecedor.nome || `fornecedor ${indice + 1}`;
    if (!window.confirm(`Remover ${nome} do mapa? Os preços cotados serão perdidos.`)) return;
    this.store.removerFornecedor(indice);
  }

  // ------------------------------------------------------------------
  // Itens
  // ------------------------------------------------------------------
  protected editarTexto(item: ItemMapa, campo: 'desc' | 'unid' | 'etapa', evento: Event): void {
    this.store.atualizarItem(item.id, { [campo]: (evento.target as HTMLInputElement).value });
  }

  protected editarTipo(item: ItemMapa, evento: Event): void {
    this.store.atualizarItem(item.id, {
      tipo: (evento.target as HTMLSelectElement).value as ItemMapa['tipo'],
    });
  }

  protected editarQuantidade(item: ItemMapa, evento: Event): void {
    this.store.atualizarItem(item.id, {
      qtde: parsearBR((evento.target as HTMLInputElement).value),
    });
  }

  protected editarPreco(item: ItemMapa, indice: number, evento: Event): void {
    this.store.atualizarPreco(item.id, indice, parsearBR((evento.target as HTMLInputElement).value));
  }

  /** Shift + `+`: no mapa, novo item vai sempre ao final da lista. */
  protected inserirLinha(): void {
    this.store.adicionarItem();
  }

  /** Shift + `-`: remove a linha atual, sem confirmar. */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.store.itens()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  protected removerItem(item: ItemMapa): void {
    if (!window.confirm('Remover este item do mapa?')) return;
    this.store.removerItem(item.id);
  }

  // ------------------------------------------------------------------
  // Cálculos por célula
  // ------------------------------------------------------------------
  protected precoUnitario(item: ItemMapa, indice: number): string {
    const valor = Number(item.unit?.[indice]) || 0;
    return valor ? formatarMoeda(valor) : '';
  }

  protected totalDoItem(item: ItemMapa, indice: number): string {
    if (!(Number(item.unit?.[indice]) > 0)) return '';
    return formatarMoeda(calcularTotalItem(item, indice, this.store.fornecedores()));
  }

  protected baseDoItem(item: ItemMapa, indice: number): number {
    return calcularBaseItem(item, indice);
  }

  /**
   * O destaque verde segue sempre o vencedor **automático** (o mais
   * barato), mesmo no modo manual — para o usuário continuar vendo qual
   * seria a melhor opção enquanto escolhe outra.
   */
  protected ehVencedorAutomatico(item: ItemMapa, indice: number): boolean {
    const vencedor = obterVencedorAutomatico(item, this.store.fornecedores());
    return vencedor?.indice === indice;
  }

  protected estaMarcado(item: ItemMapa, indice: number): boolean {
    if (this.store.cabecalho().modoManual) return item.choice === indice;

    const vencedor = obterVencedorEfetivo(item, this.store.fornecedores(), false);
    return vencedor?.indice === indice && this.store.fornecedores()[indice]?.ativo;
  }

  protected escolher(item: ItemMapa, indice: number): void {
    if (!this.store.cabecalho().modoManual) return;
    this.store.escolherFornecedor(item.id, indice);
  }

  protected numeroOuVazio(valor: number): string {
    return valor ? String(valor).replace('.', ',') : '';
  }

  // ------------------------------------------------------------------
  // Resumo por etapa
  // ------------------------------------------------------------------
  protected nomeFornecedor(indice: number): string {
    return this.store.fornecedores()[indice]?.nome || `Fornecedor ${indice + 1}`;
  }

  protected editarFretePct(fornecedor: number, etapa: string, evento: Event): void {
    this.resumo.definirFrete(fornecedor, etapa, parsearBR((evento.target as HTMLInputElement).value));
  }

  protected editarDescPct(fornecedor: number, etapa: string, evento: Event): void {
    this.resumo.definirDesconto(
      fornecedor,
      etapa,
      parsearBR((evento.target as HTMLInputElement).value),
    );
  }

  protected percentual(valor: number): string {
    return valor ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '';
  }

  protected freteParticularDe(indice: number): number {
    const pct = Number(this.ratearFreteParticular()[indice]) || 0;
    return (Number(this.store.cabecalho().freteParticular) || 0) * (pct / 100);
  }

  /** Economia do cenário fracionado em relação ao melhor integral. */
  protected readonly economia = computed(() => {
    const integral = this.store.melhorIntegral();
    if (integral <= 0) return 0;
    return integral - this.store.totalFracionado();
  });
}
