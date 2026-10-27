import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';

import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { AutoAlturaTextarea } from '../../shared/auto-altura-textarea/auto-altura-textarea';

import { ApiService } from '../../core/services/api.service';
import { Obra } from '../../core/models/api.models';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { dataDentroDoIntervalo, valoresDistintos } from '../../shared/filtros/filtros';
import { expandirItensPagamento, parsearBR } from '../pagamentos/pagamentos-calc';
import { ItemPagamentoCalculado, Pagamento } from '../pagamentos/pagamentos.models';
import { EditarPagamentoModal } from '../pagamentos/editar-pagamento-modal/editar-pagamento-modal';
import { mensagemExclusaoPagamento } from '../../shared/pagamentos-vinculados-popup/acoes-pagamento';
import { PagamentosStore } from '../pagamentos/pagamentos.store';
import { FvsModelo, FvsVinculo } from '../fvs/fvs.models';
import { FvsService } from '../fvs/fvs.service';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';
import { calcularValoresEmAbertoPorEmpreitas, ehDescendente } from './eap-engine';
import { CampoCelula, apelidoDaChave } from './eap-formulas';
import { calcularContextoPendente, calcularContextoRealizado } from './eap-realizado';
import { ResumoContratoEmpreita } from '../empreita/empreita.models';
import { exportarEapXlsx, RealizadoPorLinha } from './eap-exportar';
import { analisarPlanilha, gerarModeloXlsx, ResultadoImportacao } from './eap-importar';
import { criarVazioPorTipo, itensOcultosPorColapso, recuoDoCodigoEap } from './eap-normalize';
import { nomeArquivoPdf } from '../../shared/pdf-nome-arquivo';
import { PropostaConfig } from '../../shared/proposta-config/proposta-config';
import { ConfigProposta, normalizarConfigProposta } from '../../shared/proposta-eap';
import { ContratoModelo } from '../configuracoes/contrato-modelos/contrato-modelo.models';
import { EapStore } from './eap.store';
import {
  ChaveTipo,
  EscopoBdi,
  EstadoUi,
  ItemEap,
  ModoBdi,
  PorTipo,
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
  imports: [DecimalPipe, NavegacaoTabela, RedimensionarColunas, AutoAlturaTextarea, BarraSelecao, EditarPagamentoModal, PropostaConfig],
  providers: [EapStore, PagamentosStore],
  templateUrl: './eap.html',
  styleUrl: './eap.scss',
})
export class Eap implements OnInit {
  protected readonly store = inject(EapStore);
  private readonly api = inject(ApiService);

  /** Estado do botão "Baixar PDF" (23/08/2026) — ver EapPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  /**
   * Só para ler os pagamentos da obra e calcular o "Realizado" por item
   * (task "orçado x realizado", 28/07/2026) — a EAP não grava nada aqui,
   * só lê. Cada aba tem sua própria instância de `PagamentosStore`
   * (providers acima), então isso não interfere com a aba Pagamentos.
   */
  private readonly pagamentosStore = inject(PagamentosStore);

  /**
   * Empreitas-irmãs da obra (01/10/2026, "Saldo não comprometido") — só
   * leitura, mesma fonte que `calcularSaldoDisponivelPorEap` já usa na
   * Empreita (`empreita.store.ts`/`empreita-engine.ts:345`). A EAP não
   * tinha motivo pra carregar isso antes de existir este modo de
   * exibição.
   */
  protected readonly siblingsEmpreitas = signal<ResumoContratoEmpreita[]>([]);

  /**
   * `true` até a primeira resposta de `siblingsEmpreitas` chegar (01/10/2026,
   * bug relatado pelo Lucas: o "Saldo não comprometido" saiu sem descontar
   * o valor em aberto das empreitas). Causa raiz: `modoTotais` fica salvo
   * entre sessões — ao reabrir a EAP já em "saldo_nao_comprometido", a
   * tabela renderiza na hora com `siblingsEmpreitas()` ainda vazio (medido
   * testando de verdade: mais de 1s de janela onde o componente já existe
   * mas a lista de empreitas ainda não chegou), mostrando um saldo maior
   * do que o real até a resposta chegar — sem nada avisando que o número
   * ainda está incompleto. Usado pra travar os botões de saldo não
   * comprometido com um "carregando…" nessa janela, em vez de mostrar um
   * valor que parece definitivo mas não é.
   */
  protected readonly carregandoSiblings = signal(true);

  /**
   * Vínculo com modelos de FVS (F10, 25/09/2026, "qualquer linha da EAP
   * pode ter uma ou mais fichas") — carregado à parte do resto da EAP
   * (`EapStore`) porque é uma peça pequena e nova, sem afetar o motor de
   * cálculo. `fvsModelos` é o cadastro de Configurações; `fvsVinculos`, os
   * vínculos já feitos NESTA obra.
   */
  private readonly fvsApi = inject(FvsService);
  protected readonly fvsModelos = signal<FvsModelo[]>([]);
  protected readonly fvsVinculos = signal<FvsVinculo[]>([]);
  protected readonly fvsPopupItemId = signal<string | null>(null);

  protected vinculosDoItem(itemId: string): FvsVinculo[] {
    return this.fvsVinculos().filter((v) => v.eap_item_id === itemId);
  }

  protected abrirPopupFvs(itemId: string): void {
    this.fvsPopupItemId.set(itemId);
  }

  protected fecharPopupFvs(): void {
    this.fvsPopupItemId.set(null);
  }

  protected estaVinculado(modeloId: string): boolean {
    const itemId = this.fvsPopupItemId();
    return !!itemId && this.fvsVinculos().some((v) => v.eap_item_id === itemId && v.fvs_modelo_id === modeloId);
  }

  protected alternarVinculoFvs(modeloId: string): void {
    const itemId = this.fvsPopupItemId();
    if (!itemId) return;
    const existente = this.fvsVinculos().find((v) => v.eap_item_id === itemId && v.fvs_modelo_id === modeloId);

    if (existente) {
      this.fvsApi.desvincular(this.obraId(), existente.id).subscribe({
        next: () => this.fvsVinculos.update((lista) => lista.filter((v) => v.id !== existente.id)),
        error: () => window.alert('Não foi possível desvincular.'),
      });
    } else {
      this.fvsApi.vincular(this.obraId(), itemId, modeloId).subscribe({
        next: (vinculo) => this.fvsVinculos.update((lista) => [...lista, vinculo]),
        error: () => window.alert('Não foi possível vincular.'),
      });
    }
  }

  /**
   * Id da obra — vem do param `:id` da rota pai (/obras/:id), herdado
   * via `withRouterConfig({ paramsInheritanceStrategy: 'always' })` em
   * app.config.ts. Sem isso, a EAP não sabe de qual obra é.
   */
  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly tipos = TIPOS_CUSTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly formatarData = formatarData;

  /**
   * Filtro do modal de pagamentos vinculados — null quando o modal está
   * fechado. Guarda o título a mostrar e um predicado sobre o item de
   * pagamento (`ItemPagamentoCalculado`), em vez de guardar separadamente
   * "item da EAP" + "tipo" como antes (19/08/2026, pedido do Lucas): o
   * rodapé de totais e as novas linhas/colunas "S/ Definição"/"S/
   * Categoria" precisam abrir esse mesmo modal com critérios que não são
   * "um item específico + um tipo específico" (ex.: todos os itens, ou
   * "sem eapId nenhum") — um predicado cobre todos os casos com uma peça
   * só, sem multiplicar sinais de estado.
   */
  protected readonly filtroPagamentosAberto = signal<FiltroPagamentosAberto | null>(null);

  /** "Empreitas desta etapa" do popup, só preenchido no modo Saldo não comprometido — ver `abrirPagamentosDoItem`/`empreitasDaEtapa`. */
  protected readonly empreitasPopup = signal<Array<{ numeroEmpreita: string; contratado: number; emAberto: number }> | null>(null);

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
   * Mesma soma de `realizadoPorItem`, mas quebrada por categoria de custo
   * (03/08/2026, task "Orçado x Realizado por categoria") — cada item de
   * pagamento já carrega seu `tipo` (Material, Mão de obra…), então basta
   * agrupar por ele. Itens sem tipo válido (ex.: a linha automática
   * "Impostos, frete e desconto da nota", gerada pelo Mapa) ficam de fora
   * da quebra por categoria, mas continuam entrando no total geral via
   * `realizadoPorItem` acima — por isso a soma das categorias pode ficar
   * um pouco abaixo do total nessas linhas, de propósito.
   */
  private readonly contextoDosPagamentos = computed(() => calcularContextoRealizado(this.pagamentosStore.pagamentos()));

  protected readonly realizadoPorItemPorTipo = computed(() => this.contextoDosPagamentos().porItem);

  /**
   * Contrapartida de `realizadoPorItemPorTipo`: soma, por item da EAP, dos
   * itens de pagamento QUE TÊM etapa (eapId preenchido) mas cujo tipo não
   * é nenhuma das 5 categorias padrão — antes esse valor era descartado
   * em silêncio (ver comentário acima, "a soma das categorias pode ficar
   * um pouco abaixo do total"); agora vira a coluna "S/ Categoria"
   * (19/08/2026, pedido do Lucas).
   */
  protected readonly realizadoPorItemSemCategoria = computed(() => {
    const mapa = new Map<string, number>();
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        if (chaves.has(item.tipo as ChaveTipo)) continue;

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

  /**
   * Pagamentos com item sem eapId nenhum — não direcionados a etapa
   * alguma da EAP. Antes ficavam invisíveis (nem entravam no total do
   * rodapé, nem apareciam em lugar nenhum); agora viram a linha "S/
   * Definição" do rodapé (19/08/2026, pedido do Lucas), quebrada por
   * categoria igual às linhas normais: um pagamento com tipo Material mas
   * sem etapa cai em "S/ Definição" na coluna Material; sem tipo E sem
   * etapa cai em "S/ Definição" na coluna "S/ Categoria".
   */
  protected readonly realizadoSemDefinicaoPorTipo = computed(() => this.contextoDosPagamentos().semDefinicao);

  /** Contrapartida de `realizadoSemDefinicaoPorTipo`: sem etapa E sem categoria padrão. */
  protected readonly realizadoSemDefinicaoSemCategoria = computed(() => {
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));
    let soma = 0;
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status === 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (item.eapId) continue;
        if (chaves.has(item.tipo as ChaveTipo)) continue;
        soma += item.valorCalculado;
      }
    }
    return soma;
  });

  /** Total da linha "S/ Definição" — soma de todas as categorias + "S/ Categoria" dela (mesma regra de qualquer Total). */
  protected readonly totalRealizadoSemDefinicao = computed(() => {
    const porTipo = this.realizadoSemDefinicaoPorTipo();
    const semCategoria = this.realizadoSemDefinicaoSemCategoria();
    return TIPOS_CUSTO.reduce((soma, t) => soma + porTipo[t.chave], semCategoria);
  });

  /** Mesmo total do rodapé, por categoria — usado no rodapé do bloco por categoria. */
  protected readonly totalRealizadoPorTipo = computed(() => {
    const mapa = this.realizadoPorItemPorTipo();
    const totais = criarVazioPorTipo();
    for (const item of this.store.itens()) {
      const porTipo = mapa.get(item.id);
      if (!porTipo) continue;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += porTipo[tipo.chave] ?? 0;
    }
    return totais;
  });

  /** Mesmo total do rodapé, para a coluna "S/ Categoria". */
  protected readonly totalRealizadoSemCategoria = computed(() => {
    const mapa = this.realizadoPorItemSemCategoria();
    return this.store.itens().reduce((soma, item) => soma + (mapa.get(item.id) ?? 0), 0);
  });

  // ------------------------------------------------------------------
  // Totais "gerais" da linha TOTAIS — somam também os valores sem etapa
  // definida (linha "S/ Definição"), pra manter a regra de que o Total é
  // sempre a soma das categorias + "S/ Categoria" (19/08/2026, pedido do
  // Lucas: "o rodapé totais deve contabilizar os valores sem etapa
  // definida também").
  // ------------------------------------------------------------------
  protected readonly totalRealizadoPorTipoGeral = computed(() => {
    const porEtapa = this.totalRealizadoPorTipo();
    const semDefinicao = this.realizadoSemDefinicaoPorTipo();
    const totais = criarVazioPorTipo();
    for (const tipo of TIPOS_CUSTO) totais[tipo.chave] = porEtapa[tipo.chave] + semDefinicao[tipo.chave];
    return totais;
  });

  protected readonly totalRealizadoSemCategoriaGeral = computed(
    () => this.totalRealizadoSemCategoria() + this.realizadoSemDefinicaoSemCategoria(),
  );

  protected readonly totalRealizadoGeral = computed(
    () => this.totalRealizado() + this.totalRealizadoSemDefinicao(),
  );

  /** Número de colunas da tabela, para o colspan das linhas vazias. */
  protected readonly totalColunas = computed(() => {
    const ui = this.store.ui();
    const porTipo = this.store.mostrarColunasTipo() ? this.store.tiposVisiveis().length : 0;

    // adicional, EAP, descrição, quantidade, unidade — "Nível" some
    // confirmada (03/09/2026, pedido do Lucas).
    // (+1: coluna de seleção em lote, sempre presente)
    let colunas = this.store.travada() ? 6 : 7;

    if (this.store.cabecalho().isConfirmed) {
      // Bloco único "Totais (Orçado x Realizado)": uma coluna por
      // categoria + "S/ Categoria" (só quando as categorias estão
      // detalhadas) + Total (cada uma já com Real./Orç. empilhados dentro).
      colunas += porTipo + (porTipo ? 1 : 0) + 1;
    } else {
      // Coluna única "Custo": uma por categoria + Total, cada uma já com
      // Unit./Total empilhados dentro (mesmo padrão do bloco confirmado).
      if (ui.showUnit) colunas += porTipo + 1;
      // BDI: uma coluna com BDI do item/aplicado empilhados + uma de Total + BDI.
      if (ui.showBDI) colunas += 2;
    }
    return colunas + 1; // ações
  });

  ngOnInit(): void {
    this.store.carregar(this.obraId());
    this.pagamentosStore.carregar(this.obraId());

    this.fvsApi.listarModelos().subscribe({ next: (lista) => this.fvsModelos.set(lista), error: () => void 0 });
    this.fvsApi.listarVinculos(this.obraId()).subscribe({ next: (lista) => this.fvsVinculos.set(lista), error: () => void 0 });

    this.api.obterResumoContratoEmpreitas(this.obraId()).subscribe({
      next: (lista) => {
        this.siblingsEmpreitas.set(lista);
        this.carregandoSiblings.set(false);
      },
      error: () => this.carregandoSiblings.set(false),
    });
  }

  // ------------------------------------------------------------------
  // Cabeçalho (só o que é específico da EAP/orçamento — BDI, confirmação)
  // ------------------------------------------------------------------
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
    const alvo = evento.target as HTMLInputElement | HTMLTextAreaElement;
    this.store.atualizarItem(item.id, { [campo]: alvo.value });
  }

  // ------------------------------------------------------------------
  // Células com fórmula (F5, 21/09/2026): quantidade, custo unitário e BDI do
  // item. A célula mostra o número; ao receber foco mostra a FÓRMULA (com os
  // códigos atuais dos itens) para editar; `=...` vira fórmula, número comum
  // desfaz a fórmula. Ver `eap-formulas.ts` e `EapStore.definirFormula`.
  // ------------------------------------------------------------------
  /** Texto que a célula mostra em repouso (o número formatado). */
  private textoDaCelula(item: ItemEap, campo: CampoCelula): string {
    if (campo === 'qtde') return this.numeroOuVazio(item.qtde);
    if (campo === 'bdi') return this.valorBdiItem(item);
    return this.moedaOuVazio(item.unit[campo.slice(5) as ChaveTipo]);
  }

  protected celulaTemFormula(item: ItemEap, campo: string): boolean {
    return !!item.formulas?.[campo];
  }

  /** Dica da célula: o erro da fórmula, ou a fórmula em si. */
  protected tituloDaCelula(item: ItemEap, campo: string): string {
    const erro = this.store.erroDaCelula(item.id, campo as CampoCelula);
    if (erro) return 'Erro na fórmula: ' + erro;
    const formula = this.store.formulaDaCelula(item.id, campo as CampoCelula);
    return formula ? 'Fórmula: ' + formula : '';
  }

  protected mostrarFormulaNoCampo(item: ItemEap, campo: string, evento: Event): void {
    const formula = this.store.formulaDaCelula(item.id, campo as CampoCelula);
    if (!formula) return;
    const campoTexto = evento.target as HTMLInputElement;
    campoTexto.value = formula;
    campoTexto.select();
  }

  protected editarCelula(item: ItemEap, campo: string, evento: Event): void {
    const campoTexto = evento.target as HTMLInputElement;
    const texto = campoTexto.value.trim();
    const celula = campo as CampoCelula;

    if (texto.startsWith('=')) {
      const erro = this.store.definirFormula(item.id, celula, texto);
      if (erro) {
        // Fórmula que não serve não é gravada: avisa o motivo e devolve o valor anterior.
        window.alert('Fórmula inválida: ' + erro);
        this.restaurarTexto(item.id, celula, campoTexto);
        return;
      }
    } else {
      this.store.definirNumero(item.id, celula, parsearBR(texto));
    }

    this.restaurarTexto(item.id, celula, campoTexto);
  }

  protected restaurarCelula(item: ItemEap, campo: string, evento: Event): void {
    this.restaurarTexto(item.id, campo as CampoCelula, evento.target as HTMLInputElement);
  }

  private restaurarTexto(id: string, campo: CampoCelula, campoTexto: HTMLInputElement): void {
    const atual = this.store.itens().find((i) => i.id === id);
    if (atual) campoTexto.value = this.textoDaCelula(atual, campo);
  }

  /** Resumo das fórmulas com erro para a barra de ferramentas (também com a EAP confirmada). */
  protected readonly resumoErrosFormulas = computed(() => {
    const erros = this.store.errosFormulas();
    if (!erros.size) return null;
    const itens = this.store.itens();
    const linhas = [...erros.entries()].map(([chave, mensagem]) => {
      const [id, campo] = chave.split('|');
      const codigo = itens.find((i) => i.id === id)?.eap ?? '?';
      return `${codigo} (${apelidoDaChave(campo)}): ${mensagem}`;
    });
    return { quantidade: erros.size, detalhe: linhas.join('\n') };
  });

  /** Entrega ao motor de fórmulas o Realizado dos pagamentos (Real./Saldo.) sempre que ele muda. */
  private readonly enviarRealizadoAsFormulas = effect(() => {
    if (this.pagamentosStore.carregando()) return;
    this.store.definirRealizado({
      porItem: this.realizadoPorItemPorTipo(),
      semDefinicao: this.realizadoSemDefinicaoPorTipo(),
    });
  });

  /**
   * Nível (1-4) escolhido pelo usuário — decisão de 14/08/2026, substitui a
   * inferência automática a partir do checkbox "Grupo" + posição na lista
   * (ver `aplicarNumeracaoAutomatica` em `eap-normalize.ts`). Desde
   * 15/08/2026 o próprio "ser grupo" também não é mais escolhido — vira
   * automático assim que alguma linha ganha um nível maior logo abaixo.
   */
  protected mudarNivel(item: ItemEap, evento: Event): void {
    const nivel = Number((evento.target as HTMLSelectElement).value) || 1;
    this.store.atualizarItem(item.id, { nivel });
  }

  protected alternarAdicional(item: ItemEap): void {
    this.store.alternarAdicional(item.id);
  }

  protected alternarModoBdiItem(item: ItemEap): void {
    this.store.atualizarItem(item.id, { bdiMode: item.bdiMode === 'pct' ? 'value' : 'pct' });
  }


  // ---- Seleção em lote (20/09/2026) — opcional: os botões de cada linha (↑ ↓ + ✖) continuam. ----
  protected readonly selecao = new SelecaoMultipla<ItemEap>((item) => item.id);
  /** Só as marcadas que ainda existem; com a EAP confirmada (travada) não há ação em lote. */
  protected readonly selecionadas = computed(() =>
    this.store.travada() ? [] : this.selecao.selecionados(this.store.itens()),
  );
  protected readonly acoesLista = computed<AcaoLista[]>(() => [
    { chave: 'subir', rotulo: 'Mover para cima' },
    { chave: 'descer', rotulo: 'Mover para baixo' },
    { chave: 'excluir', rotulo: 'Excluir', perigo: true },
  ]);

  /** Marcar um grupo leva junto TODOS os itens dentro dele (desmarcar também). */
  protected alternarSelecaoLinha(item: ItemEap): void {
    if (!item.isGroup) {
      this.selecao.alternar(item);
      return;
    }
    const filhos = this.store.itens().filter((outro) => ehDescendente(item.eap, outro.eap));
    this.selecao.definir([item, ...filhos], !this.selecao.estaSelecionado(item));
  }

  protected aoAcaoLista(chave: string): void {
    const alvos = this.selecionadas();
    if (!alvos.length) return;
    const ids = alvos.map((item) => item.id);

    if (chave === 'subir' || chave === 'descer') {
      this.store.moverVarios(ids, chave === 'subir' ? -1 : 1);
      return;
    }
    if (chave !== 'excluir') return;

    const nomes = alvos.map((item) => [item.eap, item.desc].filter(Boolean).join(' — '));
    if (!confirmarExclusaoEmLote(alvos.length, 'linha da EAP', 'linhas da EAP', '', nomes)) return;
    this.store.removerVarios(ids);
    this.selecao.limpar();
  }

  protected remover(item: ItemEap): void {
    if (!window.confirm('Excluir esta linha da EAP?')) return;
    this.store.removerItem(item.id);
  }

  /**
   * Linhas que estão NA TELA, na ordem da tela — a navegação por teclado (`trenaNavegacaoTabela`) conta
   * as linhas visíveis, então é aqui que o número da linha vira item. Usar direto como posição em
   * `store.itens()` estava errado com grupo recolhido: os itens escondidos não aparecem na tela, mas
   * contam na lista — e a linha removida era outra, lá de cima (bug de 26/10/2026).
   */
  private readonly itensVisiveis = computed(() => {
    const ocultos = this.itensOcultos();
    return this.store.itens().filter((item) => !ocultos.has(item.id));
  });

  /** Ctrl + Enter na tabela: insere item logo abaixo da linha atual. */
  protected inserirAbaixo(indiceLinha: number): void {
    if (indiceLinha < 0) {
      this.store.adicionarItem();
      return;
    }
    const item = this.itensVisiveis()[indiceLinha];
    if (!item) return;

    const posicao = this.store.itens().findIndex((i) => i.id === item.id);
    if (posicao < 0) return;
    // Na linha de um grupo a linha nova entra logo abaixo dele, como primeiro item do grupo; se o grupo
    // estiver recolhido, ele abre — senão a linha nova nasceria escondida.
    if (this.estaColapsado(item)) this.alternarColapso(item);
    this.store.adicionarItem(posicao + 1);
  }

  /** Ctrl + Delete na tabela: remove a linha atual (a diretiva já pediu confirmação). */
  protected removerPorIndice(indiceLinha: number): void {
    const item = this.itensVisiveis()[indiceLinha];
    if (item) this.store.removerItem(item.id);
  }

  protected limpar(): void {
    if (!window.confirm('Isso apaga todos os itens e os dados da obra. Continuar?')) return;
    this.store.limpar();
  }

  /**
   * Baixa o PDF da EAP (23/08/2026) — ver EapPdfController/eap-imprimir.ts.
   * Mesmo padrão de `Mapa.baixarPdf()`.
   */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    this.api.baixarEapPdf(this.obraId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf('EAP', [this.store.cabecalho().mapNumber, this.store.cabecalho().obraNome], this.obraId());
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoPdf.set(false);
      },
      error: () => {
        this.erroPdf.set('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
        this.gerandoPdf.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Gerar proposta (14/10/2026, pedido do Lucas) — o texto vem de um
  // "modelo de documento" do tipo proposta (Configurações); a tabela da
  // EAP entra onde o modelo tem `{{tabela_eap}}`. O modal parte do padrão
  // da tabela salvo no modelo escolhido e deixa ajustar só pra esta geração.
  // ------------------------------------------------------------------
  protected readonly mostrarModalProposta = signal(false);
  protected readonly modelosProposta = signal<ContratoModelo[]>([]);
  protected readonly carregandoModelosProposta = signal(false);
  protected readonly modeloPropostaId = signal('');
  protected readonly configProposta = signal<ConfigProposta>(normalizarConfigProposta(null));
  protected readonly gerandoProposta = signal(false);
  protected readonly erroProposta = signal<string | null>(null);
  /** As colunas de categoria da tabela da proposta são as mesmas marcadas na EAP (a tela de impressão lê o mesmo estado gravado). */
  protected readonly rotulosCategoriasProposta = computed(() =>
    this.store.tiposVisiveis().map((t) => t.rotulo).join(', '),
  );

  protected abrirModalProposta(): void {
    this.erroProposta.set(null);
    this.modeloPropostaId.set('');
    this.mostrarModalProposta.set(true);
    this.carregandoModelosProposta.set(true);

    this.api.listarContratoModelos('proposta').subscribe({
      next: (lista) => {
        const ativos = lista.filter((m) => m.ativo !== false);
        this.modelosProposta.set(ativos);
        this.carregandoModelosProposta.set(false);
        // Um modelo só: já vem escolhido, é o caso mais comum.
        if (ativos.length === 1) this.escolherModeloProposta(ativos[0].id);
      },
      error: () => {
        this.erroProposta.set('Não foi possível carregar os modelos de proposta.');
        this.carregandoModelosProposta.set(false);
      },
    });
  }

  protected fecharModalProposta(): void {
    if (this.gerandoProposta()) return;
    this.mostrarModalProposta.set(false);
  }

  protected escolherModeloProposta(id: string): void {
    this.modeloPropostaId.set(id);
    const modelo = this.modelosProposta().find((m) => m.id === id);
    this.configProposta.set(normalizarConfigProposta(modelo?.config_proposta));
  }

  protected gerarProposta(): void {
    const modeloId = this.modeloPropostaId();
    if (!modeloId) {
      this.erroProposta.set('Escolha um modelo de proposta.');
      return;
    }

    this.erroProposta.set(null);
    this.gerandoProposta.set(true);

    this.api.baixarPropostaPdf(this.obraId(), modeloId, this.configProposta()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf(
          'Proposta',
          [this.store.cabecalho().mapNumber, this.store.cabecalho().obraNome],
          this.obraId(),
        );
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoProposta.set(false);
        this.mostrarModalProposta.set(false);
      },
      error: () => {
        this.erroProposta.set('Não foi possível gerar a proposta. Tente novamente em alguns segundos.');
        this.gerandoProposta.set(false);
      },
    });
  }

  /**
   * Exporta os itens de verdade da EAP pra planilha Excel (31/08/2026,
   * pedido do Lucas) — ver `eap-exportar.ts`. Roda no navegador, sem
   * chamada à API (mesma arquitetura de `gerarModeloXlsx`/
   * `analisarPlanilha`, em `eap-importar.ts`).
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      // Realizado é calculado aqui (não no engine puro) porque depende
      // dos pagamentos da obra, já carregados neste componente — ver
      // `realizadoDoItemTipo`/`realizadoSemCategoria`/`realizadoDoItem`.
      const realizadoPorLinha: RealizadoPorLinha[] = this.store.itens().map((item) => ({
        porTipo: Object.fromEntries(
          TIPOS_CUSTO.map((t) => [t.chave, this.realizadoDoItemTipo(item, t.chave)]),
        ) as PorTipo,
        semCategoria: this.realizadoSemCategoria(item),
        total: this.realizadoDoItem(item),
      }));
      await exportarEapXlsx(this.store.cabecalho(), this.store.itens(), this.obraId(), realizadoPorLinha);
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  // ------------------------------------------------------------------
  // Importação de planilha Excel (23/08/2026, pedido do Lucas) — ver
  // eap-importar.ts pra análise/geração da planilha; a hierarquia
  // (nível → código EAP → quem é grupo) só se resolve de verdade dentro
  // de `EapStore.importarItens`, que roda `aplicarNumeracaoAutomatica`
  // sobre a lista combinada.
  // ------------------------------------------------------------------
  protected readonly mostrarModalImportar = signal(false);
  protected readonly resultadoImportacao = signal<ResultadoImportacao | null>(null);

  protected abrirModalImportar(): void {
    this.resultadoImportacao.set(null);
    this.mostrarModalImportar.set(true);
  }

  protected fecharModalImportar(): void {
    this.mostrarModalImportar.set(false);
    this.resultadoImportacao.set(null);
  }

  protected async baixarModeloXlsx(): Promise<void> {
    await gerarModeloXlsx();
  }

  protected async selecionarArquivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;

    const dados = await arquivo.arrayBuffer();
    this.resultadoImportacao.set(await analisarPlanilha(dados));
    // Limpa o input — sem isso, escolher o MESMO arquivo de novo (depois
    // de corrigir e salvar por cima) não dispara outro `change`.
    input.value = '';
  }

  protected confirmarImportacao(modo: 'adicionar' | 'substituir'): void {
    const resultado = this.resultadoImportacao();
    if (!resultado || resultado.erros.length || !resultado.itens.length) return;
    this.store.importarItens(resultado.itens, modo);
    this.fecharModalImportar();
  }

  // ------------------------------------------------------------------
  // Copiar EAP de outra obra (23/08/2026, pedido do Lucas) — busca a EAP
  // de uma obra escolhida num popup e substitui a EAP atual por ela.
  // Nenhum endpoint novo: `GET obras/{id}/eap` (`ApiService.obterEap`)
  // já traz os dados de qualquer obra, e a clonagem em si é só chamar o
  // mesmo `EapStore.clonarDeOutraObra` que faz o merge certo (cabeçalho
  // de orçamento vem de lá, identidade da obra atual fica intacta).
  // ------------------------------------------------------------------
  protected readonly mostrarModalCopiarEap = signal(false);
  protected readonly buscaCopiarEap = signal('');
  protected readonly obrasParaCopiar = signal<Obra[]>([]);
  protected readonly carregandoObrasParaCopiar = signal(false);
  protected readonly copiandoEap = signal(false);
  protected readonly erroCopiarEap = signal<string | null>(null);

  protected readonly obrasFiltradasParaCopiar = computed(() => {
    const termo = this.buscaCopiarEap().trim().toLowerCase();
    const lista = this.obrasParaCopiar().filter((obra) => obra.id !== this.obraId());
    if (!termo) return lista;

    return lista.filter((obra) =>
      [obra.obra_nome, obra.cliente, obra.map_number].join(' ').toLowerCase().includes(termo),
    );
  });

  protected abrirModalCopiarEap(): void {
    this.erroCopiarEap.set(null);
    this.buscaCopiarEap.set('');
    this.mostrarModalCopiarEap.set(true);
    this.carregandoObrasParaCopiar.set(true);

    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obrasParaCopiar.set(obras);
        this.carregandoObrasParaCopiar.set(false);
      },
      error: () => {
        this.erroCopiarEap.set('Não foi possível carregar a lista de obras.');
        this.carregandoObrasParaCopiar.set(false);
      },
    });
  }

  protected fecharModalCopiarEap(): void {
    this.mostrarModalCopiarEap.set(false);
  }

  protected mudarBuscaCopiarEap(evento: Event): void {
    this.buscaCopiarEap.set((evento.target as HTMLInputElement).value);
  }

  protected copiarEapDe(obraOrigem: Obra): void {
    const nomeOrigem = obraOrigem.obra_nome || 'sem nome';
    if (
      !window.confirm(
        `Copiar a EAP de "${nomeOrigem}" substitui TODOS os itens e a configuração de BDI da EAP atual. Continuar?`,
      )
    ) {
      return;
    }

    this.copiandoEap.set(true);
    this.erroCopiarEap.set(null);

    this.api.obterEap(obraOrigem.id).subscribe({
      next: (payload) => {
        this.store.clonarDeOutraObra(payload.header, payload.eapItems);
        this.copiandoEap.set(false);
        this.fecharModalCopiarEap();
      },
      error: () => {
        this.erroCopiarEap.set('Não foi possível carregar a EAP da obra escolhida.');
        this.copiandoEap.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Leitura de valores calculados
  // ------------------------------------------------------------------
  /**
   * Recuo visual da descrição: "1.2.3" recua dois níveis. Derivado do
   * código EAP já calculado, não confundir com `item.nivel` (1-4, o nível
   * escolhido pelo usuário que gera esse código).
   */
  protected recuo(item: ItemEap): number {
    return recuoDoCodigoEap(item.eap);
  }

  // ------------------------------------------------------------------
  // Recolher/expandir grupos (17/08/2026, pedido do Lucas)
  // ------------------------------------------------------------------
  /**
   * Ids dos grupos recolhidos — estado de tela, não dado da EAP (como as
   * travas do rateio do Mapa): reabrir a tela sempre começa com tudo
   * expandido.
   */
  private readonly gruposColapsados = signal<Set<string>>(new Set());

  /** Ids escondidos por causa de algum ancestral colapsado — ver `itensOcultosPorColapso`. */
  protected readonly itensOcultos = computed(() =>
    itensOcultosPorColapso(this.store.itens(), this.gruposColapsados()),
  );

  protected estaColapsado(item: ItemEap): boolean {
    return this.gruposColapsados().has(item.id);
  }

  protected alternarColapso(item: ItemEap): void {
    this.gruposColapsados.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(item.id)) novo.delete(item.id);
      else novo.add(item.id);
      return novo;
    });
  }

  /** Se algum grupo está recolhido — decide o rótulo do botão "expandir/recolher tudo". */
  protected readonly existeGrupoColapsado = computed(() => this.gruposColapsados().size > 0);

  /**
   * Um botão só, alternando entre os dois extremos (19/08/2026, pedido do
   * Lucas): se algum grupo estiver recolhido, expande todos; senão,
   * recolhe todos.
   */
  protected alternarTodosOsColapsos(): void {
    if (this.existeGrupoColapsado()) {
      this.gruposColapsados.set(new Set());
      return;
    }
    const todosOsGrupos = this.store.itens().filter((i) => i.isGroup).map((i) => i.id);
    this.gruposColapsados.set(new Set(todosOsGrupos));
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
   * "Orçado" do item. Enquanto a EAP nunca foi confirmada (ou foi
   * reaberta), é o total calculado ao vivo — o mesmo valor da coluna
   * Total + BDI. Depois de confirmada, é o snapshot gravado no momento da
   * confirmação (`item.orcadoCongelado`, ver `EapStore.alternarConfirmacao`)
   * — decisão tomada com o Lucas em 14/08/2026, pra não virar um alvo
   * móvel se qtde/custo mudarem depois da confirmação.
   */
  protected orcadoDoItem(indice: number, item: ItemEap): number {
    if (item.orcadoCongelado) {
      return TIPOS_CUSTO.reduce((soma, t) => soma + (item.orcadoCongelado![t.chave] ?? 0), 0);
    }
    return this.totalComBdi(indice, item);
  }

  /**
   * Ids relevantes pro "Realizado" de um item: ele mesmo, e — se for
   * grupo — também cada descendente-folha. Usado tanto pelo total
   * (`realizadoDoItem`/`realizadoDoItemTipo`) quanto pela lista de
   * pagamentos do modal (`pagamentosVinculados`), pra garantir que a
   * soma mostrada e a lista detalhada sempre batem uma com a outra
   * (17/08/2026, pedido do Lucas: clicar no Realizado de um grupo tinha
   * que mostrar os pagamentos dos subitens também, não só os lançados
   * direto nele).
   */
  private idsRealizadoDoItem(item: ItemEap): string[] {
    if (!item.isGroup) return [item.id];

    const eapGrupo = String(item.eap ?? '').trim();
    if (!eapGrupo) return [item.id];

    const ids = [item.id];
    for (const filho of this.store.itens()) {
      if (!filho.isGroup && ehDescendente(eapGrupo, filho.eap)) ids.push(filho.id);
    }
    return ids;
  }

  /**
   * Total do Realizado. Linha de grupo soma os descendentes — antes
   * (28/07/2026) lia direto o mapa pelo id do próprio grupo, que nunca
   * bate com o `eapId` de um pagamento (pagamentos só apontam para itens
   * de base), então todo grupo aparecia com Realizado zerado. Corrigido
   * junto com a quebra por categoria (03/08/2026).
   */
  protected realizadoDoItem(item: ItemEap): number {
    const mapa = this.realizadoPorItem();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id) ?? 0), 0);
  }

  /**
   * Orçado (custo direto + BDI) de uma categoria — item ou soma do grupo.
   * Mesma regra de congelamento de `orcadoDoItem`.
   */
  protected orcadoDoItemTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    if (item.orcadoCongelado) return item.orcadoCongelado[tipo] ?? 0;

    if (item.isGroup) {
      const totais = this.store.totaisDoGrupo(indice);
      return (totais.directByType[tipo] ?? 0) + (totais.bdiByType[tipo] ?? 0);
    }
    const cache = this.store.cache();
    return (cache.directByType[indice]?.[tipo] ?? 0) + (cache.bdiByType[indice]?.[tipo] ?? 0);
  }

  /**
   * Total do Orçado no rodapé — soma dos itens-base (não-grupo), mesma
   * regra de não duplicar contagem que `store.cache().totalsWithBdi` já
   * usa. Precisa existir à parte da cache porque, depois de confirmada,
   * cada item pode estar lendo seu snapshot congelado em vez do valor ao
   * vivo.
   */
  protected readonly totalOrcado = computed(() => {
    let soma = 0;
    this.store.itens().forEach((item, i) => {
      if (item.isGroup) return;
      soma += this.orcadoDoItem(i, item);
    });
    return soma;
  });

  /** Mesmo total do rodapé, por categoria. */
  protected readonly totalOrcadoPorTipo = computed(() => {
    const totais = criarVazioPorTipo();
    this.store.itens().forEach((item, i) => {
      if (item.isGroup) return;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += this.orcadoDoItemTipo(i, item, tipo.chave);
    });
    return totais;
  });

  /** Realizado de uma categoria — item ou soma do grupo (mesma ideia de `realizadoDoItem`). */
  protected realizadoDoItemTipo(item: ItemEap, tipo: ChaveTipo): number {
    const mapa = this.realizadoPorItemPorTipo();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id)?.[tipo] ?? 0), 0);
  }

  /** "S/ Categoria" de um item — item ou soma do grupo (mesma ideia de `realizadoDoItem`). */
  protected realizadoSemCategoria(item: ItemEap): number {
    const mapa = this.realizadoPorItemSemCategoria();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id) ?? 0), 0);
  }

  // ------------------------------------------------------------------
  // Saldo (orçado − realizado) — modo alternativo de exibição da EAP
  // confirmada (23/08/2026, pedido do Lucas: ver de relance se uma etapa
  // vai estourar o planejamento, sem ter que calcular a diferença de
  // cabeça a partir do Real./Orç. empilhados). Não é uma fonte de cálculo
  // nova — só reaproveita os mesmos números que a tela já calcula acima.
  // ------------------------------------------------------------------
  protected saldoDoItemTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    return this.orcadoDoItemTipo(indice, item, tipo) - this.realizadoDoItemTipo(item, tipo);
  }

  protected saldoDoItem(indice: number, item: ItemEap): number {
    return this.orcadoDoItem(indice, item) - this.realizadoDoItem(item);
  }

  protected readonly saldoTotalPorTipo = computed(() => {
    const orcado = this.totalOrcadoPorTipo();
    const realizado = this.totalRealizadoPorTipoGeral();
    const totais = criarVazioPorTipo();
    for (const tipo of TIPOS_CUSTO) totais[tipo.chave] = orcado[tipo.chave] - realizado[tipo.chave];
    return totais;
  });

  protected readonly saldoTotalGeral = computed(() => this.totalOrcado() - this.totalRealizadoGeral());

  protected definirModoTotais(modo: EstadoUi['modoTotais']): void {
    this.store.definirModoTotais(modo);
  }

  // ------------------------------------------------------------------
  // Saldo NÃO comprometido (01/10/2026, pedido do Lucas) — terceiro modo
  // de exibição da EAP confirmada: além do Realizado, desconta também
  // pagamentos em ABERTO (de qualquer origem) e a fatia do contrato das
  // empreitas-irmãs que ainda nem virou pagamento nenhum. Ver
  // `calcularValoresEmAbertoPorEmpreitas` (eap-engine.ts) e
  // `calcularContextoPendente` (eap-realizado.ts) pro porquê da conta não
  // ter sobreposição entre os termos.
  // ------------------------------------------------------------------

  /** Flat, mesma ideia de `realizadoPorItem` — usado pelo total POR ITEM (`pendenteDoItem`), que precisa incluir também pagamentos de categoria inválida ("S/ Categoria"). */
  protected readonly pendentePorItem = computed(() => {
    const mapa = new Map<string, number>();
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status !== 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) continue;
        mapa.set(item.eapId, (mapa.get(item.eapId) ?? 0) + item.valorCalculado);
      }
    }
    return mapa;
  });

  private readonly contextoPendenteDosPagamentos = computed(() => calcularContextoPendente(this.pagamentosStore.pagamentos()));
  protected readonly pendentePorItemPorTipo = computed(() => this.contextoPendenteDosPagamentos().porItem);
  protected readonly pendenteSemDefinicaoPorTipo = computed(() => this.contextoPendenteDosPagamentos().semDefinicao);

  protected pendenteDoItem(item: ItemEap): number {
    const mapa = this.pendentePorItem();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id) ?? 0), 0);
  }

  protected pendenteDoItemTipo(item: ItemEap, tipo: ChaveTipo): number {
    const mapa = this.pendentePorItemPorTipo();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id)?.[tipo] ?? 0), 0);
  }

  protected readonly totalPendentePorTipo = computed(() => {
    const mapa = this.pendentePorItemPorTipo();
    const totais = criarVazioPorTipo();
    for (const item of this.store.itens()) {
      if (item.isGroup) continue;
      const porTipo = mapa.get(item.id);
      if (!porTipo) continue;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += porTipo[tipo.chave] ?? 0;
    }
    return totais;
  });

  protected readonly totalPendentePorTipoGeral = computed(() => {
    const porEtapa = this.totalPendentePorTipo();
    const semDefinicao = this.pendenteSemDefinicaoPorTipo();
    const totais = criarVazioPorTipo();
    for (const tipo of TIPOS_CUSTO) totais[tipo.chave] = porEtapa[tipo.chave] + semDefinicao[tipo.chave];
    return totais;
  });

  protected readonly totalPendenteGeral = computed(() => {
    const mapa = this.pendentePorItem();
    let semEtapa = 0;
    for (const pagamento of this.pagamentosStore.pagamentos()) {
      if (pagamento.status !== 'pendente') continue;
      for (const item of expandirItensPagamento(pagamento)) {
        if (!item.eapId) semEtapa += item.valorCalculado;
      }
    }
    return this.store.itens().reduce((soma, item) => soma + (mapa.get(item.id) ?? 0), semEtapa);
  });

  /** Por item×categoria, a fatia do contrato das empreitas-irmãs que ainda não virou pagamento — ver `calcularValoresEmAbertoPorEmpreitas`. */
  protected readonly valoresEmAbertoPorItemPorTipo = computed(() =>
    calcularValoresEmAbertoPorEmpreitas(this.siblingsEmpreitas(), this.pagamentosStore.pagamentos()),
  );

  protected valoresEmAbertoDoItemTipo(item: ItemEap, tipo: ChaveTipo): number {
    const mapa = this.valoresEmAbertoPorItemPorTipo();
    return this.idsRealizadoDoItem(item).reduce((soma, id) => soma + (mapa.get(id)?.[tipo] ?? 0), 0);
  }

  protected valoresEmAbertoDoItem(item: ItemEap): number {
    return TIPOS_CUSTO.reduce((soma, t) => soma + this.valoresEmAbertoDoItemTipo(item, t.chave), 0);
  }

  protected readonly totalValoresEmAbertoPorTipo = computed(() => {
    const mapa = this.valoresEmAbertoPorItemPorTipo();
    const totais = criarVazioPorTipo();
    for (const item of this.store.itens()) {
      if (item.isGroup) continue;
      const porTipo = mapa.get(item.id);
      if (!porTipo) continue;
      for (const tipo of TIPOS_CUSTO) totais[tipo.chave] += porTipo[tipo.chave] ?? 0;
    }
    return totais;
  });

  protected readonly totalValoresEmAbertoGeral = computed(() =>
    TIPOS_CUSTO.reduce((soma, t) => soma + this.totalValoresEmAbertoPorTipo()[t.chave], 0),
  );

  protected saldoNaoComprometidoDoItemTipo(indice: number, item: ItemEap, tipo: ChaveTipo): number {
    return (
      this.orcadoDoItemTipo(indice, item, tipo) -
      this.realizadoDoItemTipo(item, tipo) -
      this.pendenteDoItemTipo(item, tipo) -
      this.valoresEmAbertoDoItemTipo(item, tipo)
    );
  }

  protected saldoNaoComprometidoDoItem(indice: number, item: ItemEap): number {
    return (
      this.orcadoDoItem(indice, item) -
      this.realizadoDoItem(item) -
      this.pendenteDoItem(item) -
      this.valoresEmAbertoDoItem(item)
    );
  }

  protected readonly saldoNaoComprometidoTotalPorTipo = computed(() => {
    const orcado = this.totalOrcadoPorTipo();
    const realizado = this.totalRealizadoPorTipoGeral();
    const pendente = this.totalPendentePorTipoGeral();
    const emAberto = this.totalValoresEmAbertoPorTipo();
    const totais = criarVazioPorTipo();
    for (const tipo of TIPOS_CUSTO) {
      totais[tipo.chave] = orcado[tipo.chave] - realizado[tipo.chave] - pendente[tipo.chave] - emAberto[tipo.chave];
    }
    return totais;
  });

  protected readonly saldoNaoComprometidoTotalGeral = computed(
    () => this.totalOrcado() - this.totalRealizadoGeral() - this.totalPendenteGeral() - this.totalValoresEmAbertoGeral(),
  );

  /**
   * Empreitas-irmãs com item nesta etapa, pro bloco "Empreitas desta etapa" do
   * popup — ver `abrirPagamentosDoItem`. `tipo` filtra pela mesma categoria da
   * célula clicada (undefined = Total, mostra todas as categorias) — sem isso
   * o popup aberto pela coluna "Mão de obra" também listava itens de empreita
   * classificados como "material"/outras categorias, confundindo o Lucas ao
   * dar a entender que aquele valor deveria (mas não devia) descontar do
   * saldo de mão de obra (01/10/2026).
   */
  protected empreitasDaEtapa(
    item: ItemEap,
    tipo?: ChaveTipo,
  ): Array<{ numeroEmpreita: string; contratado: number; emAberto: number }> {
    const ids = new Set(this.idsRealizadoDoItem(item));
    const linhas: Array<{ numeroEmpreita: string; contratado: number; emAberto: number }> = [];

    for (const sibling of this.siblingsEmpreitas()) {
      const itensDaEtapa = sibling.itens.filter((i) => ids.has(i.eapId) && (!tipo || i.tipo === tipo));
      if (!itensDaEtapa.length) continue;

      const contratado = itensDaEtapa.reduce((soma, i) => soma + (i.contratoEmp || 0) + (i.contratoReserva || 0), 0);
      const mapaEmAberto = calcularValoresEmAbertoPorEmpreitas([sibling], this.pagamentosStore.pagamentos());
      const emAberto = itensDaEtapa.reduce((soma, i) => soma + (mapaEmAberto.get(i.eapId)?.[i.tipo] ?? 0), 0);

      linhas.push({ numeroEmpreita: sibling.numeroEmpreita, contratado, emAberto });
    }
    return linhas;
  }

  // ------------------------------------------------------------------
  // Modal de pagamentos vinculados — abertura pelos vários pontos de
  // entrada (item, rodapé de totais, "S/ Categoria", "S/ Definição").
  // Ver comentário de `filtroPagamentosAberto` sobre o desenho com
  // predicado (19/08/2026, pedido do Lucas).
  // ------------------------------------------------------------------
  protected abrirPagamentosDoItem(item: ItemEap, tipo?: ChaveTipo): void {
    const ids = new Set(this.idsRealizadoDoItem(item));
    const titulo = `${item.eap} ${item.desc}` + (tipo ? ` · ${this.rotuloTipo(tipo)}` : '');
    this.filtroPagamentosAberto.set({
      titulo,
      corresponde: (ip) => ids.has(ip.eapId) && (!tipo || ip.tipo === tipo),
    });
    // "Empreitas desta etapa" (01/10/2026) — só faz sentido no modo Saldo
    // não comprometido, aberto a partir de um item de verdade (não dos
    // agregados "Totais"/"S/ Categoria"/"S/ Definição", que não têm um
    // `ItemEap` único pra calcular `idsRealizadoDoItem`).
    this.empreitasPopup.set(
      this.store.ui().modoTotais === 'saldo_nao_comprometido' ? this.empreitasDaEtapa(item, tipo) : null,
    );
  }

  /**
   * Rodapé de totais — todos os itens da EAP, opcionalmente filtrados por
   * categoria. Inclui também os pagamentos sem etapa definida (19/08/2026,
   * pedido do Lucas: "o rodapé totais deve contabilizar os valores sem
   * etapa definida também") — o valor mostrado na célula já soma os dois,
   * então a lista do popup precisa bater com isso.
   */
  protected abrirPagamentosTotais(tipo?: ChaveTipo): void {
    const idsValidos = new Set(this.store.itens().map((i) => i.id));
    const titulo = 'Total geral' + (tipo ? ` · ${this.rotuloTipo(tipo)}` : '');
    this.filtroPagamentosAberto.set({
      titulo,
      corresponde: (ip) => (!ip.eapId || idsValidos.has(ip.eapId)) && (!tipo || ip.tipo === tipo),
    });
  }

  /**
   * "S/ Categoria" — de um item específico (e descendentes) quando vem de
   * uma linha da tabela, ou de todos os itens (com e sem etapa) quando
   * vem do rodapé de totais (`item` omitido) — mesmo motivo de
   * `abrirPagamentosTotais`.
   */
  protected abrirPagamentosSemCategoria(item?: ItemEap): void {
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));
    const titulo = (item ? `${item.eap} ${item.desc}` : 'Total geral') + ' · S/ Categoria';

    if (item) {
      const ids = new Set(this.idsRealizadoDoItem(item));
      this.filtroPagamentosAberto.set({
        titulo,
        corresponde: (ip) => ids.has(ip.eapId) && !chaves.has(ip.tipo as ChaveTipo),
      });
      return;
    }

    const idsValidos = new Set(this.store.itens().map((i) => i.id));
    this.filtroPagamentosAberto.set({
      titulo,
      corresponde: (ip) => (!ip.eapId || idsValidos.has(ip.eapId)) && !chaves.has(ip.tipo as ChaveTipo),
    });
  }

  /** "S/ Definição" — pagamentos cujo item não tem eapId nenhum (não direcionados a etapa alguma), opcionalmente filtrados por categoria. */
  protected abrirPagamentosSemDefinicao(tipo?: ChaveTipo): void {
    const titulo = 'S/ Definição' + (tipo ? ` · ${this.rotuloTipo(tipo)}` : '');
    this.filtroPagamentosAberto.set({
      titulo,
      corresponde: (ip) => !ip.eapId && (!tipo || ip.tipo === tipo),
    });
  }

  /** "S/ Definição" · "S/ Categoria" — sem etapa E sem categoria padrão. */
  protected abrirPagamentosSemDefinicaoSemCategoria(): void {
    const chaves = new Set(TIPOS_CUSTO.map((t) => t.chave));
    this.filtroPagamentosAberto.set({
      titulo: 'S/ Definição · S/ Categoria',
      corresponde: (ip) => !ip.eapId && !chaves.has(ip.tipo as ChaveTipo),
    });
  }

  // ---- Ações por linha no popup de pagamentos vinculados (21/09/2026) ----
  /** Pagamento aberto no editor a partir do popup; `null` = fechado. */
  protected readonly pagamentoEmEdicao = signal<Pagamento | null>(null);
  protected readonly snapshotEapPagamentos = computed(() => this.pagamentosStore.snapshotEap());

  protected abrirPagamentoDoPopup(linha: PagamentoVinculado): void {
    // cópia: o editor não pode mexer no pagamento da lista antes de salvar
    this.pagamentoEmEdicao.set(JSON.parse(JSON.stringify(linha.pagamento)) as Pagamento);
  }

  protected excluirPagamentoDoEditor(pagamento: Pagamento): void {
    this.pagamentosStore.remover(pagamento.id);
    this.fecharEditorDePagamento();
  }

  protected fecharEditorDePagamento(): void {
    this.pagamentoEmEdicao.set(null);
  }

  protected salvarPagamentoDoPopup(evento: { pagamento: Pagamento }): void {
    this.pagamentosStore.inserirOuAtualizar(evento.pagamento, evento.pagamento.id, () => this.fecharEditorDePagamento());
  }

  /** ✔ da linha: confirma o pagamento pendente — o Realizado da EAP se atualiza sozinho (mesma lista do `PagamentosStore`). */
  protected confirmarPagamentoDoPopup(linha: PagamentoVinculado): void {
    this.pagamentosStore.confirmarVarios([linha.pagamento]).subscribe(({ falhas }) => {
      if (falhas.length) window.alert('Não foi possível confirmar o pagamento.');
    });
  }

  /** ✖ da linha: exclui com aviso do que muda. */
  protected excluirPagamentoDoPopup(linha: PagamentoVinculado): void {
    if (!window.confirm(mensagemExclusaoPagamento(linha.pagamento))) return;
    this.pagamentosStore.removerVarios([linha.pagamento]).subscribe(({ falhas }) => {
      if (falhas.length) window.alert('Não foi possível excluir o pagamento.');
    });
  }

  protected fecharModalPagamentos(): void {
    this.filtroPagamentosAberto.set(null);
    this.filtroPopupBeneficiado.set('');
    this.filtroPopupDataDe.set('');
    this.filtroPopupDataAte.set('');
    this.empreitasPopup.set(null);
  }

  /** Rótulo de uma categoria de custo (Material, Mão de obra…), para o detalhamento do hover. */
  protected rotuloTipo(tipo: string): string {
    return TIPOS_CUSTO.find((t) => t.chave === tipo)?.rotulo ?? tipo;
  }

  /**
   * Decide se o detalhamento do hover abre pra baixo (padrão) ou pra cima
   * — quando a linha está perto do fim do corpo rolável do modal e o
   * detalhamento não caberia até o fim da tela visível (18/08/2026,
   * pedido do Lucas). Estimativa de altura pelo número de itens (o
   * elemento em si fica `display:none` até o hover, então não dá pra
   * medir a altura real do DOM antes de abrir).
   */
  protected ajustarPosicaoHover(evento: MouseEvent, quantidadeItens: number): void {
    const gatilho = evento.currentTarget as HTMLElement;
    const corpoModal = gatilho.closest('.modal-corpo') as HTMLElement | null;
    const limiteInferior = corpoModal?.getBoundingClientRect().bottom ?? window.innerHeight;
    const alturaEstimada = 40 + quantidadeItens * 22 + 16;
    const cabeAbaixo = gatilho.getBoundingClientRect().top + alturaEstimada <= limiteInferior;
    gatilho.classList.toggle('abrir-para-cima', !cabeAbaixo);
  }

  // ------------------------------------------------------------------
  // Ordenação da lista de pagamentos vinculados (18/08/2026, pedido do Lucas)
  // ------------------------------------------------------------------
  protected readonly ordenacaoPagamentos = signal<EstadoOrdenacao<ColunaPagamentoVinculado>>({
    coluna: 'numeroPagamento',
    direcao: 'asc',
  });
  protected readonly setaOrdenacao = setaOrdenacao;

  protected alternarOrdenacaoPagamentos(coluna: ColunaPagamentoVinculado): void {
    this.ordenacaoPagamentos.update((atual) => alternarOrdenacao(atual, coluna));
  }

  // ------------------------------------------------------------------
  // Filtros da lista do popup — por beneficiado e por período
  // (19/08/2026, pedido do Lucas).
  // ------------------------------------------------------------------
  protected readonly filtroPopupBeneficiado = signal('');
  protected readonly filtroPopupDataDe = signal('');
  protected readonly filtroPopupDataAte = signal('');

  protected mudarFiltroPopupBeneficiado(evento: Event): void {
    this.filtroPopupBeneficiado.set((evento.target as HTMLSelectElement).value);
  }

  protected mudarFiltroPopupDataDe(evento: Event): void {
    this.filtroPopupDataDe.set((evento.target as HTMLInputElement).value);
  }

  protected mudarFiltroPopupDataAte(evento: Event): void {
    this.filtroPopupDataAte.set((evento.target as HTMLInputElement).value);
  }

  /**
   * Pagamentos que casam com o filtro aberto no modal — um por pagamento
   * (18/08/2026, pedido do Lucas: antes repetia o mesmo pagamento uma vez
   * por item da compra que caía na etapa, ficando poluído). `filtro` cobre
   * tanto o caso "um item específico (+ descendentes, + categoria)" quanto
   * os casos do rodapé — total geral, "S/ Categoria" e "S/ Definição"
   * (19/08/2026). `itensDirecionados` é o detalhamento (descrição, tipo,
   * etapa de destino e valor) só dos itens DAQUELE pagamento que casam com
   * o filtro atual — mostrado no hover da soma direcionada, não na lista
   * principal. Item sem descrição própria mostra "s/ descrição" (não
   * repete a descrição do pagamento — antes ambíguo, parecia que o
   * pagamento inteiro era só aquele item).
   *
   * Fica em duas etapas: `listaPagamentosBase` (só o filtro do
   * item/categoria/etapa clicado, sem beneficiado/período) alimenta o
   * dropdown de beneficiados disponíveis; `listaPagamentosFiltrada`
   * aplica beneficiado/período por cima — assim o dropdown sempre lista
   * quem de fato aparece nesse contexto, não todo fornecedor da obra.
   */
  private readonly listaPagamentosBase = computed(() => {
    const filtro = this.filtroPagamentosAberto();
    if (!filtro) return [] as PagamentoVinculado[];

    const rotuloPorId = new Map(this.store.itens().map((i) => [i.id, i.eap]));
    const lista: PagamentoVinculado[] = [];

    for (const pagamento of this.pagamentosStore.pagamentos()) {
      const itensDirecionados = expandirItensPagamento(pagamento)
        .filter(filtro.corresponde)
        .map((itemPag) => ({
          descricao: itemPag.descricao || 's/ descrição',
          tipo: itemPag.tipo,
          etapa: itemPag.eapId ? (rotuloPorId.get(itemPag.eapId) ?? '') : 's/ etapa',
          valor: itemPag.valorCalculado,
        }));

      if (!itensDirecionados.length) continue;

      lista.push({
        pagamento,
        numeroPagamento: pagamento.numeroPagamento,
        fornecedor: pagamento.fornecedor,
        dataSolicitacao: pagamento.dataSolicitacao,
        dataPagamento: pagamento.dataPagamento,
        descricao: pagamento.descricao,
        valorTotal: pagamento.valorTotal,
        valorDirecionado: itensDirecionados.reduce((soma, i) => soma + i.valor, 0),
        // Listado para transparência, mas não entra na soma do
        // "Realizado" enquanto não for confirmado na aba Pagamentos.
        pendente: pagamento.status === 'pendente',
        itensDirecionados,
      });
    }

    return lista;
  });

  protected readonly beneficiariosPopupDisponiveis = computed(() =>
    valoresDistintos(this.listaPagamentosBase(), (p) => p.fornecedor),
  );

  private readonly listaPagamentosFiltrada = computed(() => {
    const beneficiado = this.filtroPopupBeneficiado();
    const de = this.filtroPopupDataDe();
    const ate = this.filtroPopupDataAte();

    return this.listaPagamentosBase().filter((p) => {
      if (beneficiado && p.fornecedor !== beneficiado) return false;
      return dataDentroDoIntervalo(p.dataSolicitacao, de, ate);
    });
  });

  /** Soma do valor total dos pagamentos exibidos (após os filtros) — mostrada empilhada abaixo do nome da etapa. */
  protected readonly totalValorPagamentosPopup = computed(() =>
    this.listaPagamentosFiltrada().reduce((soma, p) => soma + p.valorTotal, 0),
  );

  /** Soma do valor direcionado ao filtro aberto, entre os pagamentos exibidos (após os filtros). */
  protected readonly totalValorDirecionadoPopup = computed(() =>
    this.listaPagamentosFiltrada().reduce((soma, p) => soma + p.valorDirecionado, 0),
  );

  protected readonly pagamentosVinculados = computed(() =>
    ordenarPor(this.listaPagamentosFiltrada(), this.ordenacaoPagamentos(), (p, coluna) => p[coluna]),
  );
}

type ColunaPagamentoVinculado =
  | 'numeroPagamento'
  | 'fornecedor'
  | 'dataSolicitacao'
  | 'dataPagamento'
  | 'descricao'
  | 'valorTotal'
  | 'valorDirecionado';

interface PagamentoVinculado {
  /** O pagamento de origem — as ações da linha (abrir, ✔, ✖) agem sobre ele. */
  pagamento: Pagamento;
  numeroPagamento: string;
  fornecedor: string;
  dataSolicitacao: string;
  dataPagamento: string;
  descricao: string;
  valorTotal: number;
  valorDirecionado: number;
  pendente: boolean;
  itensDirecionados: Array<{ descricao: string; tipo: string; etapa: string; valor: number }>;
}

interface FiltroPagamentosAberto {
  titulo: string;
  corresponde: (itemPagamento: ItemPagamentoCalculado) => boolean;
}
