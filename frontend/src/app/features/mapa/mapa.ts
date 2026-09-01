import { Component, HostListener, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { nomeDaEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarDataHora, formatarMoeda } from '../../core/utils/formato';
import { AutoAlturaTextarea } from '../../shared/auto-altura-textarea/auto-altura-textarea';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { ChaveTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { formatarPercentual, parsearBR } from '../pagamentos/pagamentos-calc';
import {
  calcularBaseItem,
  calcularTotalItem,
  obterVencedorAutomatico,
  obterVencedorEfetivo,
  ratearFreteiro,
  rotuloFornecedor,
} from './mapa-engine';
import { ResumoEtapas } from './mapa-resumo-etapas';
import { CabecalhoMapa, ColunaMapaColavel, Fornecedor, ItemMapa } from './mapa.models';
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
  imports: [NavegacaoTabela, RedimensionarColunas, AutoAlturaTextarea],
  providers: [MapaStore],
  templateUrl: './mapa.html',
  styleUrl: './mapa.scss',
})
export class Mapa implements OnInit {
  protected readonly store = inject(MapaStore);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Estado do botão "Baixar PDF" (22/08/2026) — ver MapaPdfController. */
  protected readonly gerandoPdf = signal(false);
  protected readonly erroPdf = signal<string | null>(null);

  /**
   * "Assinatura" do documento — nome da empresa dona da conta, pra deixar
   * claro de onde saiu o mapa quando impresso/exportado (17/08/2026,
   * pedido do Lucas). Mesma fonte que a barra lateral usa (`AuthService`,
   * já carregado no login/`/me` — não faz uma chamada nova à API).
   */
  protected readonly nomeEmpresa = computed(() => nomeDaEmpresa(this.auth.usuario()) || 'Sua empresa');

  protected readonly inicialEmpresa = computed(() => this.nomeEmpresa().charAt(0).toUpperCase());

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
  protected readonly formatarDataHora = formatarDataHora;
  protected readonly formatarPercentual = formatarPercentual;

  /**
   * Rateio por etapa. Fica como instância própria do componente porque
   * as travas são estado de simulação, não dado do mapa.
   */
  protected readonly resumo = new ResumoEtapas();

  /** Mostra/esconde o relatório "Rateio por etapa da obra" (17/08/2026, pedido do Lucas). */
  protected readonly mostrarRateio = signal(true);

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

  /**
   * Frete particular dividido por etapa — o freteiro "entra no rateio
   * como se fosse um fornecedor" (17/08/2026, pedido do Lucas), na coluna
   * extra que aparece na tabela de Rateio por etapa quando há frete
   * particular. Chave = `linha.etapa` (mesma etapaKey usada pelas células
   * de cada fornecedor, então dá pra somar ao total da linha direto).
   *
   * Vazio quando o frete particular não é a opção vencedora da comparação
   * de cenários (18/08/2026) — mostrar a coluna com valores quando a
   * recomendação é usar o frete de cada loja seria exibir um custo que
   * não é o que o mapa está de fato considerando.
   */
  protected readonly rateioFreteiro = computed(() => {
    if (!this.store.freteParticularVencedor()) return new Map<string, number>();
    return ratearFreteiro(
      this.store.itens(),
      this.store.fornecedores(),
      this.store.alocacoes(),
      Number(this.store.cabecalho().freteParticular) || 0,
    );
  });

  protected freteiroDaEtapa(etapa: string): number {
    return this.rateioFreteiro().get(etapa) ?? 0;
  }

  /**
   * Categorias de custo realmente usadas nos itens deste mapa, na ordem
   * canônica da EAP — a "Saldo remanescente por etapa" só mostra uma
   * linha por categoria que de fato aparece no mapa (17/08/2026, pedido
   * do Lucas: "se é um mapa de material e equipamento, cada etapa exibe
   * duas linhas").
   */
  protected readonly tiposUsados = computed(() => {
    const presentes = new Set(this.store.itens().map((i) => i.tipo).filter(Boolean));
    return TIPOS_CUSTO.filter((t) => presentes.has(t.chave));
  });

  protected saldoDaEtapa(etapa: string, tipo: ChaveTipo): number {
    return this.store.saldoPorEtapa().get(etapa)?.[tipo] ?? 0;
  }

  /** Colunas fixas antes das colunas de fornecedor. */
  private readonly COLUNAS_FIXAS = 6;

  protected readonly totalColunas = computed(
    () => this.COLUNAS_FIXAS + this.store.fornecedores().length * 2 + 1,
  );

  ngOnInit(): void {
    this.store.carregar(this.mapaId(), this.obraId());
  }

  /**
   * Avisa antes de fechar/recarregar a aba com gravações pendentes
   * (31/08/2026, investigação do Lucas sobre Tipo sumindo depois de
   * finalizar um mapa grande) — um mapa com muitos itens editados em
   * sequência pode levar alguns segundos pra terminar de gravar tudo
   * (cada edição é uma gravação própria, em fila); fechar a aba nesse meio
   * tempo cancela as gravações que ainda não saíram, perdendo essas
   * edições de vez. Não cobre navegação DENTRO do próprio app (SPA) — só
   * fechar a aba, recarregar ou digitar outra URL.
   */
  @HostListener('window:beforeunload', ['$event'])
  protected aoTentarFecharAba(evento: BeforeUnloadEvent): void {
    if (!this.store.salvando()) return;
    evento.preventDefault();
  }

  // ------------------------------------------------------------------
  // Finalizar / Gerar PDF / Gerar Pagamento
  // ------------------------------------------------------------------
  /** Finaliza o mapa (trava edição, libera PDF/Pagamento) ou reabre para editar. */
  protected alternarFinalizacao(): void {
    const cabecalho = this.store.cabecalho();
    if (!cabecalho.isConfirmed) {
      if (!window.confirm('Finalizar este mapa? A edição fica travada até reabrir.')) return;
    } else if (!window.confirm('Reabrir este mapa para edição?')) {
      return;
    }
    this.store.alternarConfirmacao();
  }

  /**
   * Baixa o PDF do mapa (22/08/2026) — gerado no backend renderizando a
   * tela de impressão num Chromium headless (ver MapaPdfController).
   * Substitui o antigo `window.print()`, que dependia do usuário
   * escolher "Salvar como PDF" na caixa de diálogo do navegador. Mesmo
   * padrão de `Relatorios.baixarPdf()`.
   */
  protected baixarPdf(): void {
    this.erroPdf.set(null);
    this.gerandoPdf.set(true);

    this.api.baixarMapaPdf(this.mapaId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mapa-${this.mapaId()}.pdf`;
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

  protected gerarPagamento(): void {
    if (!this.store.cabecalho().isConfirmed) return;
    if (
      !window.confirm(
        'Gerar pagamento(s) a partir deste mapa? Cria um pagamento pendente por fornecedor vencedor, para confirmar depois na aba Pagamentos.',
      )
    ) {
      return;
    }
    this.store.gerarPagamentos();
  }

  /**
   * Duplica o mapa (20/08/2026, pedido do Lucas): cria um mapa novo,
   * em edição, com os mesmos fornecedores/itens/preços — pra cotações
   * parecidas sem redigitar tudo de novo. Navega direto pro mapa recém-
   * criado, igual `MapasObra.salvar()` já faz ao cadastrar um mapa novo.
   */
  protected duplicar(): void {
    if (this.store.duplicando()) return;
    if (!window.confirm('Duplicar este mapa? Cria uma cópia em edição com os mesmos itens e fornecedores.')) {
      return;
    }
    this.store.duplicar().subscribe({
      next: (mapa) => void this.router.navigate(['/obras', this.obraId(), 'mapas', mapa.id]),
      error: () => window.alert('Não foi possível duplicar o mapa.'),
    });
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

  /**
   * O campo "Frete particular" nasce travado — só é liberado marcando a
   * caixa "Considerar" (17/08/2026: era um botão só de ligar; virou caixa
   * de seleção porque o usuário também precisa poder desligar de novo).
   * Inicializa marcada sozinha, uma única vez, se o mapa carregado já
   * tinha frete particular/freteiro salvos — depois disso quem manda é
   * só a caixa.
   */
  protected readonly freteParticularHabilitado = signal(false);
  private freteParticularHabilitadoInicializado = false;

  private readonly inicializarFreteParticularHabilitado = effect(() => {
    if (this.freteParticularHabilitadoInicializado || this.store.carregando()) return;
    const cabecalho = this.store.cabecalho();
    this.freteParticularHabilitado.set(
      Boolean(cabecalho.freteParticular) || Boolean(cabecalho.freteiroParticular),
    );
    this.freteParticularHabilitadoInicializado = true;
  });

  protected alternarFreteParticular(evento: Event): void {
    const marcado = (evento.target as HTMLInputElement).checked;
    // Desmarcar zera o valor antes de travar o campo (17/08/2026, pedido do
    // Lucas) — senão o mapa ficava com um frete particular "fantasma"
    // guardado, mesmo com o campo escondido/travado de novo.
    if (!marcado) this.store.atualizarCabecalho('freteParticular', 0);
    this.freteParticularHabilitado.set(marcado);
  }

  protected editarFreteiroParticular(evento: Event): void {
    this.store.atualizarCabecalho('freteiroParticular', (evento.target as HTMLInputElement).value);
  }

  protected alternarModoManual(): void {
    const ligar = !this.store.cabecalho().modoManual;
    this.store.atualizarCabecalho('modoManual', ligar);
    // Desligar reseta as escolhas — senão elas ficavam guardadas escondidas
    // e continuavam valendo pros cenários "Compra manual com..." mesmo com
    // o modo desligado (17/08/2026, pedido do Lucas).
    if (!ligar) this.store.resetarEscolhasManuais();
  }

  protected alternarLancarFreteComoItem(): void {
    this.store.atualizarCabecalho(
      'lancarFreteComoItem',
      !this.store.cabecalho().lancarFreteComoItem,
    );
  }

  protected editarFreteEtapa(evento: Event): void {
    this.store.atualizarCabecalho('freteEtapaId', (evento.target as HTMLSelectElement).value);
  }

  protected editarFreteCategoriaTipo(evento: Event): void {
    this.store.atualizarCabecalho(
      'freteCategoriaTipo',
      (evento.target as HTMLSelectElement).value as ChaveTipo | '',
    );
  }

  // ------------------------------------------------------------------
  // Fornecedores
  // ------------------------------------------------------------------
  protected contatosDe(fornecedor: Fornecedor): string[] {
    return this.store.contatosDoFornecedor(fornecedor.nome);
  }

  protected telefoneDoContato(fornecedor: Fornecedor): string {
    return this.store.telefoneDoContato(fornecedor.nome, fornecedor.contato);
  }

  /** "Fornecedor 01", "Fornecedor 02"... — só pra indicar a ordem em que aparecem na tela. */
  protected rotuloOrdemFornecedor(indice: number): string {
    return `Fornecedor ${String(indice + 1).padStart(2, '0')}`;
  }

  protected editarNomeFornecedor(indice: number, evento: Event): void {
    // Trocar o fornecedor invalida o contato anterior.
    this.store.atualizarFornecedor(indice, {
      nome: (evento.target as HTMLInputElement).value,
      contato: '',
    });
  }

  protected editarContato(indice: number, evento: Event): void {
    this.store.atualizarFornecedor(indice, {
      contato: (evento.target as HTMLInputElement).value,
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

  /**
   * Frete/Desconto "com BDI" — o valor final que de fato entra na nota
   * (18/08/2026, pedido do Lucas): o BDI incide sobre a base da nota
   * (itens + frete − desconto), e por linearidade dá pra decompor esse
   * efeito por componente — frete final = frete × (1 + BDI); desconto
   * final = desconto × (1 + BDI) (o desconto "vale mais" porque tira da
   * base que seria tributada). Mostrado embaixo de cada input pra deixar
   * claro que o valor digitado não é o que sai na nota.
   */
  protected freteFinalComBdi(fornecedor: Fornecedor): number {
    return (Number(fornecedor.frete) || 0) * (1 + (Number(fornecedor.imposto) || 0) / 100);
  }

  protected descontoFinalComBdi(fornecedor: Fornecedor): number {
    return (Number(fornecedor.desconto) || 0) * (1 + (Number(fornecedor.imposto) || 0) / 100);
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

  /**
   * A Etapa passa a guardar o id da linha da EAP (`eapId`), e não só o
   * rótulo. O rótulo (`etapa`) continua sendo gravado porque o painel
   * "Rateio por etapa da obra" agrupa por ele — e porque é o que aparece
   * impresso no PDF do mapa.
   *
   * Virou campo de busca (`<input list>`, 17/08/2026, pedido do Lucas) em
   * vez de `<select>` — o valor digitado é resolvido pelo rótulo exibido;
   * texto que não bate com nenhuma etapa é ignorado (mantém a seleção
   * anterior), e campo vazio limpa a etapa.
   */
  protected rotuloDaEtapa(eapId: string): string {
    return this.store.etapasDisponiveis().find((e) => e.id === eapId)?.rotulo ?? '';
  }

  protected editarEtapa(item: ItemMapa, evento: Event): void {
    const texto = (evento.target as HTMLInputElement).value.trim();
    if (!texto) {
      this.store.atualizarItem(item.id, { eapId: '', etapa: '' });
      return;
    }
    const etapa = this.store.etapasDisponiveis().find((e) => e.rotulo === texto);
    if (!etapa) return;
    this.store.atualizarItem(item.id, { eapId: etapa.id, etapa: etapa.rotulo });
  }

  /**
   * "Tipo" voltou a ser um `<select>` simples, com todas as opções
   * sempre visíveis (19/08/2026, pedido do Lucas) — é um conjunto fixo de
   * só 5 categorias, então o combo de busca (que fazia sentido pra Nome/
   * Contato/Etapa, com dezenas de opções) só atrapalhava aqui.
   */
  protected editarTipo(item: ItemMapa, evento: Event): void {
    const tipo = (evento.target as HTMLSelectElement).value as ChaveTipo | '';
    this.store.atualizarItem(item.id, { tipo });
  }

  protected editarQuantidade(item: ItemMapa, evento: Event): void {
    this.store.atualizarItem(item.id, {
      qtde: parsearBR((evento.target as HTMLInputElement).value),
    });
  }

  protected editarPreco(item: ItemMapa, indice: number, evento: Event): void {
    this.store.atualizarPreco(item.id, indice, parsearBR((evento.target as HTMLInputElement).value));
  }

  /**
   * Botão "+" na coluna de Ações, e Shift + `+` na tabela: insere item
   * logo abaixo da linha indicada (17/08/2026, pedido do Lucas — antes o
   * atalho sempre acrescentava ao final). `-1` (nenhuma linha focada,
   * como o atalho de teclado manda quando disparado fora de uma célula)
   * cai no mesmo comportamento de sempre — acrescenta ao final.
   */
  protected inserirAbaixo(indiceLinha: number): void {
    this.store.adicionarItem(indiceLinha < 0 ? undefined : indiceLinha + 1);
  }

  /**
   * Quantidade de colunas FOCÁVEIS (as que `trenaNavegacaoTabela` navega —
   * ver `NavegacaoTabela.camposDaLinha`, que ignora a coluna "#" e as
   * caixas de "Comprar") antes das colunas de preço por fornecedor: desc,
   * tipo, qtde, unid, etapa. Não confundir com `COLUNAS_FIXAS` acima, que
   * conta a coluna "#" (usada só pra colspan do cabeçalho).
   */
  private readonly COLUNAS_FOCAVEIS_FIXAS = 5;

  /**
   * "Colar com quebra de linha" (31/08/2026, pedido do Lucas): descobre a
   * partir da coluna focável em que o colar aconteceu qual campo do item
   * ela representa, e delega a distribuição das linhas pro store.
   */
  protected colarQuebraDeLinha(evento: { linha: number; coluna: number; linhas: string[] }): void {
    const item = this.store.itens()[evento.linha];
    if (!item) return;

    const coluna = this.resolverColunaColavel(evento.coluna);
    if (!coluna) return;

    this.store.colarEmColuna(item.id, coluna, evento.linhas);
  }

  /**
   * "Preencher pra baixo" — Ctrl/Cmd + D (31/08/2026, pedido do Lucas: em
   * mapas gigantes, o Tipo costuma ser o mesmo pra todos os itens). Copia
   * o valor da célula focada pra todas as linhas abaixo, na mesma coluna.
   */
  protected aoPreencherParaBaixo(evento: { linha: number; coluna: number }): void {
    const item = this.store.itens()[evento.linha];
    if (!item) return;

    const coluna = this.resolverColunaColavel(evento.coluna);
    if (!coluna) return;

    this.store.preencherParaBaixo(item.id, coluna);
  }

  private resolverColunaColavel(coluna: number): ColunaMapaColavel | null {
    switch (coluna) {
      case 0: return { tipo: 'desc' };
      case 1: return { tipo: 'tipoCusto' };
      case 2: return { tipo: 'qtde' };
      case 3: return { tipo: 'unid' };
      case 4: return { tipo: 'etapa' };
      default: {
        const fornecedorIndice = coluna - this.COLUNAS_FOCAVEIS_FIXAS;
        if (fornecedorIndice >= 0 && fornecedorIndice < this.store.fornecedores().length) {
          return { tipo: 'preco', fornecedorIndice };
        }
        return null;
      }
    }
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

  /**
   * Imposto/frete/desconto do rodapé, formatados conforme o tipo — antes
   * apareciam como número cru, sem indicar se era porcentagem ou reais
   * (bug visto pelo Lucas, 16/08/2026). `parsearBR` já ignora "R$"/"%"/
   * espaços ao reler o valor digitado, então é seguro mostrar formatado.
   */
  protected valorPercentualOuVazio(valor: number): string {
    return valor ? formatarPercentual(valor) : '';
  }

  protected valorMoedaOuVazio(valor: number): string {
    return valor ? formatarMoeda(valor) : '';
  }

  // ------------------------------------------------------------------
  // Resumo por etapa
  // ------------------------------------------------------------------
  protected nomeFornecedor(indice: number): string {
    return rotuloFornecedor(this.store.fornecedores(), indice);
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

  /**
   * Frete/desconto por etapa também podem ser digitados em R$ em vez de %
   * (17/08/2026, pedido do Lucas — botão de alternar unidade). Por baixo
   * continua tudo em percentual (`ResumoEtapas.definirFrete`/
   * `definirDesconto`): o valor digitado só é convertido usando o frete/
   * desconto total da nota daquele fornecedor como base.
   */
  protected editarFreteValor(fornecedor: number, etapa: string, notaFrete: number, evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    this.resumo.definirFrete(fornecedor, etapa, notaFrete > 0 ? (valor / notaFrete) * 100 : 0);
  }

  protected editarDescValor(fornecedor: number, etapa: string, notaDesconto: number, evento: Event): void {
    const valor = parsearBR((evento.target as HTMLInputElement).value);
    this.resumo.definirDesconto(fornecedor, etapa, notaDesconto > 0 ? (valor / notaDesconto) * 100 : 0);
  }

  // ------------------------------------------------------------------
  // Comparação de cenários
  // ------------------------------------------------------------------
  /**
   * Os cinco jeitos de fechar a compra (17/08/2026, pedido do Lucas):
   * tudo de uma loja só, fracionado entre várias (com o frete de cada
   * uma, ou com um frete particular só), e as mesmas duas variantes de
   * frete só que respeitando a escolha manual de fornecedor por item
   * (`item.choice`) em vez da automática. O mais barato entre os
   * disponíveis ganha o 🏆.
   *
   * Vive no store, não aqui (18/08/2026) — `MapaStore.alocacoes()`
   * precisa saber qual cenário venceu pra decidir se "Rateio por etapa da
   * obra" e "Detalhe por fornecedor" usam a compra integral ou a
   * fracionada, então manter só uma cópia evita essas tabelas discordarem
   * do 🏆 mostrado aqui do lado.
   */
  protected readonly cenarios = this.store.cenarios;

  /** Se o cenário vencedor usa frete particular — ver "Detalhe por fornecedor" e "Rateio por etapa". */
  protected readonly freteParticularVantajoso = this.store.freteParticularVencedor;

  /** Se o cenário mais vantajoso é comprar tudo de uma loja só — ver "Análise de compra individual". */
  protected readonly cenarioVencedorIntegral = this.store.cenarioVencedorIntegral;

  /**
   * 🏆 na "Compra integral" do fornecedor que de fato é o melhor cenário
   * integral (17/08/2026, pedido do Lucas) — só quando esse é também o
   * cenário mais vantajoso entre os cinco comparados.
   */
  protected ehVencedorIntegral(indice: number): boolean {
    if (!this.cenarioVencedorIntegral()) return false;
    const melhor = this.store.melhorIntegral();
    return melhor > 0 && this.store.integral()[indice] === melhor;
  }

  /**
   * Rótulo da 1a linha de "Análise de compra individual" — "Itens mais
   * baratos" fora do modo manual (cada item vai pra quem cotou mais
   * barato); "Itens marcados" com o modo manual ligado, porque a divisão
   * deixa de ser "mais barato" e passa a ser a escolha do usuário
   * (18/08/2026, pedido do Lucas).
   */
  protected rotuloItensReferencia(): string {
    return this.store.cabecalho().modoManual ? 'Itens marcados' : 'Itens mais baratos';
  }

  /** Mesma ideia da linha "NOTA FISCAL" antiga, renomeada pra deixar claro que é uma referência por loja, não a nota da compra recomendada. */
  protected rotuloItensReferenciaComFrete(): string {
    return this.store.cabecalho().modoManual ? 'MARCADOS + FRETE' : 'MAIS BARATOS + FRETE';
  }
}
