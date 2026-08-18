import { Component, OnInit, computed, inject, input } from '@angular/core';

import { formatarMoeda } from '../../core/utils/formato';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { ChaveTipo, ItemEap } from '../eap/eap.models';
import { parsearBR } from '../pagamentos/pagamentos-calc';
import { EmpreitaStore } from './empreita.store';
import { CabecalhoEmpreita, ItemEmpreita, LinhaEmpreita } from './empreita.models';

/**
 * Empreita — serviços contratados e suas medições.
 *
 * Cada serviço aponta para um item da EAP (usado só como referência de
 * orçado, para comparação). O contrato — empreita e reserva — é lançado
 * pelo usuário categoria a categoria (task #45, 28/07/2026): o sistema
 * não distribui esse valor automaticamente. A medição é em percentual
 * por categoria, e o que se paga é o avanço em relação ao acumulado.
 *
 * As colunas **Contrato** e **Reserva** de cada categoria são o
 * diferencial do produto: valores lançados à mão por serviço e por
 * categoria, em vez de uma retenção percentual fixa calculada.
 */
@Component({
  selector: 'app-empreita',
  imports: [NavegacaoTabela, RedimensionarColunas],
  providers: [EmpreitaStore],
  templateUrl: './empreita.html',
  styleUrl: './empreita.scss',
})
export class Empreita implements OnInit {
  protected readonly store = inject(EmpreitaStore);
  protected readonly formatarMoeda = formatarMoeda;

  /**
   * Id da obra — vem do param `:id` da rota avó (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Mesmo mecanismo usado pela EAP. Usado aqui só para
   * buscar a EAP de referência — a própria empreita é identificada por
   * `empreitaId`.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  /** Id da empreita — vem do param `:empreitaId` da própria rota. */
  readonly empreitaId = input.required<string>({ alias: 'empreitaId' });

  /**
   * Colunas fixas da tabela: #, Serviço, Etapa (EAP), Orçado (2), Contrato
   * (3), Medição (3), Pagamento do período (3), Saldo, Ações — 16 no
   * total. Não depende mais de `store.tipos().length`: a discriminação
   * por categoria agora fica em linhas dentro de cada célula, não em
   * colunas repetidas (revisão 31/07/2026, modelo do sistema antigo).
   */
  protected readonly totalColunas = computed(() => 16);

  ngOnInit(): void {
    this.store.carregar(this.empreitaId(), this.obraId());
  }

  // ------------------------------------------------------------------
  protected editarCabecalho(campo: keyof CabecalhoEmpreita, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.store.atualizarCabecalho(campo, valor as never);
  }

  protected editarTexto(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { desc: (evento.target as HTMLInputElement).value });
  }

  protected editarEap(item: ItemEmpreita, evento: Event): void {
    this.store.atualizarItem(item.id, { eapId: (evento.target as HTMLSelectElement).value });
  }

  /** Lança o contrato (empreita ou reserva) de uma categoria, digitado pelo usuário. */
  protected editarContrato(
    item: ItemEmpreita,
    campo: 'contratoEmpPorTipo' | 'contratoReservaPorTipo',
    tipo: ChaveTipo,
    evento: Event,
  ): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    this.store.atualizarContrato(item.id, campo, tipo, bruto === '' ? null : parsearBR(bruto));
  }

  protected editarMedicao(
    item: ItemEmpreita,
    campo: 'medicaoAcumByType' | 'medicaoAtualByType',
    tipo: ChaveTipo,
    evento: Event,
  ): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    // Campo vazio guarda null: "sem medição neste período" é diferente
    // de "medi zero por cento".
    this.store.atualizarMedicao(item.id, campo, tipo, bruto === '' ? null : parsearBR(bruto));
  }

  /** Shift + `+`: novo serviço ao final da lista. */
  protected inserirLinha(): void {
    this.store.adicionarItem();
  }

  /** Shift + `-`: remove a linha atual, sem confirmar. */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.store.itens()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  protected remover(item: ItemEmpreita): void {
    if (!window.confirm('Remover este serviço da empreita?')) return;
    this.store.removerItem(item.id);
  }

  protected fecharPeriodo(): void {
    const totais = this.store.totais();

    if (this.store.temMedicaoInvalida()) {
      window.alert('Há medições menores que o acumulado. Corrija antes de fechar o período.');
      return;
    }
    if (totais.totalPeriodo <= 0) {
      window.alert('Nenhum avanço medido neste período.');
      return;
    }

    const mensagem =
      `Fechar o período?\n\n` +
      `A pagar: ${formatarMoeda(totais.pagarEmp)}\n` +
      `Reserva: ${formatarMoeda(totais.reservarPgto)}\n` +
      `Total: ${formatarMoeda(totais.totalPeriodo)}\n\n` +
      `As medições atuais passam a ser o acumulado.`;

    if (!window.confirm(mensagem)) return;
    this.store.fecharPeriodo();
  }

  /**
   * Gera o pagamento pendente do avanço medido — precisa rodar ANTES de
   * "Fechar período" (que zera o avanço). Ver comentário em
   * `EmpreitaStore.gerarPagamento`.
   */
  protected gerarPagamento(): void {
    const totais = this.store.totais();

    if (this.store.temMedicaoInvalida()) {
      window.alert('Há medições menores que o acumulado. Corrija antes de gerar o pagamento.');
      return;
    }
    if (totais.pagarEmp <= 0) {
      window.alert('Nenhum avanço medido pra pagar ao empreiteiro neste período.');
      return;
    }

    const mensagem =
      `Gerar pagamento ao empreiteiro com o avanço deste período?\n\n` +
      `A pagar: ${formatarMoeda(totais.pagarEmp)}\n\n` +
      `Cria um pagamento pendente, pra confirmar depois na aba Pagamentos.`;

    if (!window.confirm(mensagem)) return;
    this.store.gerarPagamento();
  }

  // ------------------------------------------------------------------
  protected rotuloEap(itemEap: ItemEap): string {
    const eap = String(itemEap.eap ?? '').trim();
    const desc = String(itemEap.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  protected linha(indice: number): LinhaEmpreita {
    return this.store.linhas()[indice];
  }

  protected rotuloTipo(chave: ChaveTipo): string {
    return this.store.tiposCusto.find((t) => t.chave === chave)?.rotulo ?? chave;
  }

  /** Rótulo curto de cada categoria, para caber na linha empilhada da célula. */
  private static readonly ABREVIACOES: Record<ChaveTipo, string> = {
    material: 'Mat.',
    maoDeObra: 'M.O.',
    equipamento: 'Equip.',
    outros: 'Out.',
    administracao: 'Adm.',
  };

  protected rotuloAbrev(chave: ChaveTipo): string {
    return Empreita.ABREVIACOES[chave] ?? chave;
  }

  /** Orçado da EAP, por categoria — só referência, não editável. */
  protected valorOrcadoPorTipo(indice: number, tipo: ChaveTipo): string {
    return this.moedaOuVazio(Number(this.linha(indice).orcadoPorTipo[tipo]) || 0);
  }

  /** Contrato total (empreiteiro + reserva) da categoria, calculado. */
  protected valorContratoTotalPorTipo(indice: number, tipo: ChaveTipo): string {
    return this.moedaOuVazio(Number(this.linha(indice).contratoPorTipo[tipo]) || 0);
  }

  protected valorAvancoPorTipo(indice: number, tipo: ChaveTipo): string {
    const valor = this.linha(indice).avancoPorTipo[tipo];
    return this.percentualOuVazio(valor ?? 0);
  }

  protected valorPagarPorTipo(indice: number, tipo: ChaveTipo): string {
    return this.moedaOuVazio(Number(this.linha(indice).pagarPorTipo[tipo]) || 0);
  }

  protected valorReservarPorTipo(indice: number, tipo: ChaveTipo): string {
    return this.moedaOuVazio(Number(this.linha(indice).reservarPorTipo[tipo]) || 0);
  }

  protected valorPagamentoTotalPorTipo(indice: number, tipo: ChaveTipo): string {
    const linha = this.linha(indice);
    const valor = (Number(linha.pagarPorTipo[tipo]) || 0) + (Number(linha.reservarPorTipo[tipo]) || 0);
    return this.moedaOuVazio(valor);
  }

  /** Quanto ainda falta contratar em relação ao orçado da EAP. */
  protected saldo(indice: number): number {
    const linha = this.linha(indice);
    return linha.orcadoTotal - linha.valorTotal;
  }

  protected percentualOuVazio(valor: number | null | undefined): string {
    if (valor === null || valor === undefined) return '';
    return valor ? String(valor).replace('.', ',') : '';
  }

  protected moedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  protected valorMedicaoAtual(item: ItemEmpreita, tipo: ChaveTipo): string {
    return this.percentualOuVazio(item.medicaoAtualByType?.[tipo]);
  }

  protected valorMedicaoAcumulada(item: ItemEmpreita, tipo: ChaveTipo): string {
    return this.percentualOuVazio(item.medicaoAcumByType?.[tipo]);
  }

  protected valorContrato(
    item: ItemEmpreita,
    campo: 'contratoEmpPorTipo' | 'contratoReservaPorTipo',
    tipo: ChaveTipo,
  ): string {
    return this.moedaOuVazio(Number(item[campo]?.[tipo]) || 0);
  }
}
