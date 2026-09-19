import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, concatMap, finalize, switchMap, tap } from 'rxjs/operators';

import { Mapa, Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarTelefone } from '../../core/utils/documento';
import { hojeIso } from '../../core/utils/formato';
import { calcularCacheOrcado, orcadoDaEtapa } from '../eap/eap-engine';
import {
  aplicarNumeracaoAutomatica,
  cabecalhoVazio,
  criarVazioPorTipo,
  gerarId,
  normalizarCabecalho,
  normalizarItemEap,
} from '../eap/eap-normalize';
import { CabecalhoObra, ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import {
  gerarNumeroPagamento,
  normalizarPagamento,
  paraPayloadApi,
  parsearBR,
} from '../pagamentos/pagamentos-calc';
import { ItemPagamento, Pagamento } from '../pagamentos/pagamentos.models';
import {
  calcularBaseItem,
  calcularFracionado,
  calcularIntegral,
  calcularValorFinalPorFornecedor,
  calcularNota,
  calcularNotasPorFornecedor,
  calcularTotalCenario,
  calcularTotalItem,
  descontosAplicaveis,
  obterAlocacoes,
  obterAlocacoesAutomaticas,
  ratearFreteiro,
  rotuloFornecedor,
} from './mapa-engine';
import { proximoNumeroMapa } from './mapa-numero';
import { ResumoEtapas } from './mapa-resumo-etapas';
import { ETAPA_SEM_NOME, obterRateiosDoItem } from './mapa-resumos';
import { CabecalhoMapa, ColunaMapaColavel, Fornecedor, ItemMapa, NotaFornecedor } from './mapa.models';

/** Chave da ponte chave-valor onde o cadastro de Responsáveis é gravado. */
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

/** Chave da ponte chave-valor onde o cadastro de Fornecedores é gravado. */
const CHAVE_FORNECEDORES = 'controleObra.fornecedores.v1';

/**
 * Ids de tipos_custo (tabela seed, ver TiposCustoSeeder.php) — fixos,
 * usados só para falar com o MapaController, que guarda um único
 * tipo_custo_id por item (diferente da EAP/Empreita, que guardam um mapa
 * inteiro por categoria).
 */
const ID_POR_CHAVE: Record<ChaveTipo, number> = {
  material: 1,
  maoDeObra: 2,
  equipamento: 3,
  outros: 4,
  administracao: 5,
};
const CHAVE_POR_ID: Record<number, ChaveTipo> = {
  1: 'material',
  2: 'maoDeObra',
  3: 'equipamento',
  4: 'outros',
  5: 'administracao',
};

/**
 * Estado do Mapa de Fornecedores.
 *
 * Até 31/07/2026 este store persistia na ponte chave-valor, um mapa por
 * obra. Migrado para o endpoint relacional `/mapas/{id}` (que já existia
 * pronto no backend, ver MapaController) porque uma obra pode ter VÁRIOS
 * mapas nomeados (ex.: "Mapa de Aço #07"), não só um — cada mapa agora é
 * seu próprio registro, criado pela lista `MapasObra`.
 *
 * Os cálculos ficam em `mapa-engine.ts`, verificado contra o original em
 * `verificacao/`.
 */
@Injectable()
export class MapaStore {
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);

  /** Id do mapa atual — definido por `carregar(mapaId)`, usado em toda gravação. */
  private mapaId = '';

  /** Id da obra dona do mapa — vem da rota, usado pra EAP de etapas e Gerar Pagamento. */
  private obraIdDaRota = '';

  /**
   * Fila de gravações (04/08/2026, investigação de mapas de teste que
   * sumiram): `salvar()` é chamado a cada edição (fornecedor, item, preço…)
   * e cada chamada dispara um PUT completo do mapa. Sem sequenciar essas
   * chamadas, duas edições próximas no tempo geram dois PUTs concorrentes —
   * se o servidor responder fora de ordem, o PUT mais antigo (com um
   * snapshot de itens/fornecedores desatualizado) pode chegar por último e
   * apagar dados de uma edição mais recente já confirmada, já que o
   * backend faz sync completo (substitui itens/fornecedores pelo que veio
   * no payload). `concatMap` garante que cada PUT só começa depois do
   * anterior terminar, e como cada execução lê o estado atual dos signals
   * no momento em que roda (não no momento em que foi enfileirada), o
   * último PUT da fila sempre carrega o estado mais recente de verdade.
   */
  private readonly salvarSubject = new Subject<void>();
  private readonly salvar$ = this.salvarSubject.pipe(
    concatMap(() => this.executarSalvar().pipe(catchError(() => of(null)))),
  );

  constructor() {
    this.salvar$.subscribe();
  }

  /**
   * Obra dona deste mapa (04/08/2026, pedido do Lucas: "Cliente" deixa de
   * ser um dropdown escolhido à mão e vira só a Obra, fixa desde a
   * criação do mapa — `MapasObra.salvar()` já grava `obra_id` no
   * momento em que o mapa nasce). Usada pra exibir o nome da obra no
   * cabeçalho (somente leitura) e pra puxar o nome do cliente pro campo
   * `cabecalho().cliente` automaticamente, sem digitação.
   */
  private readonly obraAtual = signal<Obra | null>(null);

  /** Nome da obra pra exibição no cabeçalho — "—" enquanto carrega. */
  readonly nomeDaObra = computed(() => this.obraAtual()?.obra_nome || '—');

  /** Nomes do cadastro de Responsáveis que estão ativos. */
  readonly responsaveisAtivos = signal<string[]>([]);

  /**
   * Cadastro de Fornecedores (nome + contatos), só os ativos — substitui
   * a lista fixa de `mapa.dados.ts` (04/08/2026, pedido do Lucas: o Mapa
   * deve selecionar o fornecedor pelo cadastro de verdade, não uma lista
   * predefinida). Mesma ponte chave-valor usada por Clientes/Responsáveis/
   * Empreiteiros — ver `features/cadastros/fornecedores`.
   */
  private readonly fornecedoresCadastro = signal<
    { nome: string; contatos: { nome: string; telefone: string }[] }[]
  >([]);

  readonly nomesFornecedoresCadastrados = computed(() =>
    this.fornecedoresCadastro()
      .map((f) => f.nome)
      .filter((nome) => nome.length > 0)
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  );

  contatosDoFornecedor(nome: string): string[] {
    return (
      this.fornecedoresCadastro()
        .find((f) => f.nome === nome)
        ?.contatos.map((c) => c.nome) ?? []
    );
  }

  /** Telefone do contato, como cadastrado — exibido no cabeçalho do fornecedor, sem ser editável ali. */
  telefoneDoContato(nomeFornecedor: string, nomeContato: string): string {
    const contato = this.fornecedoresCadastro()
      .find((f) => f.nome === nomeFornecedor)
      ?.contatos.find((c) => c.nome === nomeContato);
    return contato?.telefone ?? '';
  }

  /**
   * Etapas (linhas da EAP) da obra dona do mapa.
   *
   * Guarda o `id` da linha da EAP junto do rótulo: até 03/08/2026 só o
   * rótulo era guardado, e o item do mapa ficava sem `eapId` — por isso os
   * pagamentos gerados nasciam sem etapa e não entravam no "Realizado" da
   * EAP.
   */
  readonly etapasDisponiveis = signal<{ id: string; rotulo: string }[]>([]);

  /**
   * Itens/cabeçalho da EAP da obra — usados só pra calcular o "Saldo
   * remanescente por etapa" do Rateio (17/08/2026, pedido do Lucas), que
   * compara o orçado de cada etapa com o que já foi realizado (outros
   * mapas/pagamentos) mais o que este mapa está gastando.
   */
  private readonly itensEap = signal<ItemEap[]>([]);
  private readonly cabecalhoEap = signal<CabecalhoObra>(cabecalhoVazio());

  /** Pagamentos confirmados/pendentes da obra inteira — mesmo uso acima. */
  private readonly pagamentosDaObra = signal<Pagamento[]>([]);

  readonly cabecalho = signal<CabecalhoMapa>({
    numeroMapa: '',
    descricao: '',
    cliente: '',
    responsavelObra: '',
    responsavelMapa: '',
    criadoEm: '',
    freteParticular: 0,
    freteiroParticular: '',
    lancarFreteComoItem: false,
    freteEtapaId: '',
    freteCategoriaTipo: '',
    lancarImpostoDescontoComoItem: false,
    impostoDescontoEtapaId: '',
    impostoDescontoCategoriaTipo: '',
    modoManual: false,
    isConfirmed: false,
    confirmedAt: '',
    ultimaFinalizacaoEm: '',
  });

  readonly fornecedores = signal<Fornecedor[]>([]);
  readonly itens = signal<ItemMapa[]>([]);

  readonly carregando = signal(true);

  /**
   * Quantas gravações estão pendentes na fila (enfileiradas + a que está
   * em voo agora) — não só "a última está em andamento". Antes,
   * `salvando` virava `false` assim que UM PUT terminava, mesmo com vários
   * outros ainda esperando a vez no `concatMap` (ex.: usuário definiu o
   * Tipo de 40 itens em sequência — cada edição é uma gravação própria).
   * Isso fazia o aviso "salvando…" sumir da tela bem antes de tudo ter
   * sido gravado de verdade, dando a falsa impressão de que já era seguro
   * sair da página (31/08/2026, investigação do Lucas sobre Tipo sumindo
   * depois de finalizar um mapa grande).
   */
  private readonly pendentes = signal(0);
  readonly salvando = computed(() => this.pendentes() > 0);

  readonly erro = signal<string | null>(null);
  readonly duplicando = signal(false);

  readonly gerandoPagamento = signal(false);
  /** Mensagem do resultado da última tentativa de gerar pagamento — null limpa o aviso. */
  readonly resultadoGerarPagamento = signal<string | null>(null);

  // ---- Derivados dos cálculos ----
  /**
   * Alocação item a item (respeita a escolha manual, se ligada) — a base
   * usada pelo cenário fracionado. Não usar diretamente fora daqui: quem
   * precisa da alocação efetiva (a que o mapa recomenda) deve ler
   * `alocacoes()`, que pode substituir isto pela compra integral.
   */
  private readonly alocacoesFracionadas = computed(() =>
    obterAlocacoes(this.itens(), this.fornecedores(), this.cabecalho().modoManual),
  );

  readonly alocacoesAutomaticas = computed(() =>
    obterAlocacoesAutomaticas(this.itens(), this.fornecedores()),
  );

  /**
   * As cinco formas de fechar a compra — mesma lista do painel
   * "Comparação de cenários". Fica no store (não só no componente) porque
   * `alocacoes()`/`incluirFreteLoja()` precisam saber qual cenário venceu
   * pra decidir a recomendação efetiva; manter uma cópia só aqui evita a
   * tabela de cenários e as tabelas que consomem essa recomendação
   * discordarem entre si (18/08/2026, pedido do Lucas).
   *
   * Com "Compra manual" ligada, a recomendação passa a valer só ENTRE as
   * duas variantes manuais (frete das lojas x frete particular) — os três
   * cenários automáticos continuam calculados e exibidos no painel, só
   * pra referência/comparação, mas não competem pelo 🏆 nem decidem
   * `alocacoes()`/`incluirFreteLoja()` enquanto o modo manual estiver
   * ligado (18/08/2026, pedido do Lucas: "a preferência do relatório é
   * com a compra manual ligada" — antes a integral ou o automático podiam
   * vencer por baixo da escolha manual do usuário mesmo com o modo
   * ligado, o que não fazia sentido pra quem tinha acabado de escolher
   * fornecedor item a item de propósito).
   */
  readonly cenarios = computed(() => {
    const itens = this.itens();
    const fornecedores = this.fornecedores();
    const freteParticular = Number(this.cabecalho().freteParticular) || 0;
    const modoManual = this.cabecalho().modoManual;

    const automaticas = this.alocacoesAutomaticas();
    const manuais = modoManual ? obterAlocacoes(itens, fornecedores, true) : [];

    const linhas = [
      {
        rotulo: 'Tudo em uma só loja',
        valor: this.melhorIntegral(),
        disponivel: !modoManual && this.melhorIntegral() > 0,
      },
      {
        rotulo: 'Várias lojas e seus fretes',
        valor: calcularTotalCenario(itens, fornecedores, automaticas, true, 0),
        disponivel: !modoManual,
      },
      {
        rotulo: 'Várias lojas e um frete particular',
        valor: calcularTotalCenario(itens, fornecedores, automaticas, false, freteParticular),
        disponivel: !modoManual && freteParticular > 0,
      },
      {
        rotulo: 'Compra manual com frete das lojas',
        valor: calcularTotalCenario(itens, fornecedores, manuais, true, 0),
        disponivel: modoManual,
      },
      {
        rotulo: 'Compra manual com frete particular',
        valor: calcularTotalCenario(itens, fornecedores, manuais, false, freteParticular),
        disponivel: modoManual && freteParticular > 0,
      },
    ];

    const validos = linhas.filter((c) => c.disponivel && c.valor > 0);
    const menor = validos.length ? Math.min(...validos.map((c) => c.valor)) : null;

    return linhas.map((c) => ({ ...c, vencedor: c.disponivel && c.valor === menor }));
  });

  /** Se "Tudo em uma só loja" é o cenário vencedor — nunca é true em modo manual (ver `cenarios`). */
  readonly cenarioVencedorIntegral = computed(() =>
    this.cenarios().some((c) => c.vencedor && c.rotulo === 'Tudo em uma só loja'),
  );

  /**
   * Se o cenário vencedor usa frete particular (dentro do grupo
   * relevante: automático fora do modo manual, manual dentro dele).
   * Substitui o antigo `!(freteParticular > 0)` como critério de
   * `incluirFreteLoja` — digitar um frete particular sozinho não bastava
   * mais pra decidir nada; agora é sempre a comparação que decide.
   */
  readonly freteParticularVencedor = computed(() =>
    this.cenarios().some(
      (c) =>
        c.vencedor &&
        (c.rotulo === 'Várias lojas e um frete particular' || c.rotulo === 'Compra manual com frete particular'),
    ),
  );

  /**
   * Alocação efetiva — a que "Rateio por etapa da obra", "Detalhe por
   * fornecedor" e "Gerar Pagamento" usam: item a item, a menos que "Tudo
   * em uma só loja" seja o cenário vencedor (o que só pode acontecer fora
   * do modo manual — ver `cenarios`), caso em que todo item (com
   * quantidade) vai para esse único fornecedor.
   */
  readonly alocacoes = computed(() => {
    const fracionadas = this.alocacoesFracionadas();
    if (!this.cenarioVencedorIntegral()) return fracionadas;

    const melhor = this.melhorIntegral();
    const si = this.integral().findIndex((valor) => valor === melhor);
    if (si < 0) return fracionadas;

    return this.itens()
      .map((item, itemIndex) => ({ itemIndex, qtde: Number(item.qtde) || 0 }))
      .filter((entrada) => entrada.qtde > 0)
      .map(({ itemIndex }) => ({ itemIndex, supplierIndex: si }));
  });

  /**
   * Com frete particular vencendo a comparação de cenários, o frete de
   * cada loja sai da nota — cobrar os dois seria contar o frete em dobro,
   * já que o freteiro vira um pagamento independente (17/08/2026, pedido
   * do Lucas). Até 18/08/2026 isso era decidido só por
   * `freteParticular > 0` (digitou um valor, já trocava, sem comparar) —
   * agora segue `freteParticularVencedor()`, a mesma recomendação que
   * decide `alocacoes()` e a geração de pagamento.
   */
  readonly incluirFreteLoja = computed(() => !this.freteParticularVencedor());

  /**
   * Notas da compra recomendada (`alocacoes()`) — usada por "Rateio por
   * etapa da obra", "Detalhe por fornecedor" e pela própria geração de
   * pagamento. O desconto só entra pra um fornecedor quando ele leva
   * TODOS os itens desta alocação (`descontosAplicaveis`) — é um valor
   * global negociado pra compra integral, então se a recomendação for
   * fracionada (mesmo que "vencedora" entre os cenários) o desconto não
   * se aplica a ninguém (19/08/2026, pedido do Lucas: "o desconto só é
   * aplicado na compra integral"). Quando a recomendação É a compra
   * integral, o único fornecedor "used" aqui é justamente quem leva tudo,
   * então o desconto aparece normalmente.
   */
  readonly notas = computed(() =>
    calcularNotasPorFornecedor(
      this.alocacoes(),
      this.itens(),
      this.fornecedores(),
      this.incluirFreteLoja(),
      descontosAplicaveis(this.alocacoes(), this.itens(), this.fornecedores()),
    ),
  );

  readonly fracionado = computed(() =>
    calcularFracionado(
      this.itens(),
      this.fornecedores(),
      this.cabecalho().modoManual,
      this.incluirFreteLoja(),
    ),
  );

  readonly integral = computed(() => calcularIntegral(this.itens(), this.fornecedores()));

  /** "Valor final do fornecedor" — itens cotados + frete + markup, mesmo com cotação parcial (ver `calcularValorFinalPorFornecedor`). */
  readonly valorFinalFornecedor = computed(() => calcularValorFinalPorFornecedor(this.itens(), this.fornecedores()));

  /**
   * Melhor cenário integral: o menor total entre os fornecedores que
   * conseguem atender o pedido inteiro. Zero significa que nenhum
   * cotou tudo.
   */
  readonly melhorIntegral = computed(() => {
    const validos = this.integral().filter((v) => v > 0);
    return validos.length ? Math.min(...validos) : 0;
  });

  /**
   * Instância "muda" do rateio (nunca trava nada) só pra chegar no total
   * de verdade de cada etapa — ver `saldoPorEtapa` abaixo. É a mesma
   * classe que `mapa.ts`/`mapa-imprimir.ts` usam pro "Rateio por etapa da
   * obra" (com as travas do usuário); aqui não interessam travas, só o
   * número que sai do cálculo proporcional padrão.
   */
  private readonly resumoEtapasParaSaldo = new ResumoEtapas();

  /**
   * Saldo remanescente de cada etapa, por categoria de custo, depois da
   * compra deste mapa — pedido do Lucas, 17/08/2026, pro Rateio por
   * etapa: `orçado da etapa − já realizado por OUTROS mapas/pagamentos
   * confirmados − o que este mapa está gastando agora` (lido ao vivo dos
   * itens, não do que já foi eventualmente gerado como pagamento deste
   * mesmo mapa — por isso os pagamentos deste mapa são excluídos do
   * "realizado": senão a contribuição dele entraria contada duas vezes).
   *
   * "O que este mapa está gastando" de cada etapa (23/08/2026, correção
   * de bug apontado pelo Lucas) é o TOTAL da etapa — base + parte do
   * frete + parte do desconto + markup, exatamente o número que já
   * aparece em "Total da etapa" no Rateio por etapa (`ResumoEtapas`,
   * reaproveitada aqui) — não só a base dos itens como antes. Frete e
   * desconto são da NOTA do fornecedor, não têm categoria própria, então
   * o total da etapa é repartido entre os tipos de custo NA PROPORÇÃO do
   * valor BASE de cada tipo dentro daquela etapa (ex.: se "Material" é
   * 70% da base da etapa e "Equipamento" 30%, o total da etapa — já com
   * frete/desconto/markup embutidos — é descontado nessa mesma proporção
   * do saldo de cada um).
   *
   * Chave do mapa devolvido = a mesma `etapaKey` das células do Rateio
   * (o RÓTULO da etapa, `item.etapa` — nunca `ETAPA_SEM_NOME`, sem etapa
   * não tem orçado pra comparar). Ver `eapIdRealPorEtapaKey` logo abaixo:
   * o id de verdade da EAP (`item.eapId`) só entra na hora de consultar
   * orçado/realizado, não como chave deste mapa.
   */
  readonly saldoPorEtapa = computed(() => {
    const itensEap = this.itensEap();
    const resultado = new Map<string, PorTipo>();
    if (!itensEap.length) return resultado;

    const cache = calcularCacheOrcado(itensEap, this.cabecalhoEap());
    const itens = this.itens();
    const fornecedores = this.fornecedores();
    const alocacoes = this.alocacoes();

    const etapasUsadas = new Set<string>();
    for (const item of itens) {
      for (const rateio of obterRateiosDoItem(item)) {
        if (rateio.etapaKey !== ETAPA_SEM_NOME) etapasUsadas.add(rateio.etapaKey);
      }
    }
    if (!etapasUsadas.size) return resultado;

    /**
     * `rateio.etapaKey` (usado como chave em toda esta função, pra bater
     * com `linha.etapa` do Rateio por etapa) vem de `item.etapa` — que
     * NÃO é o id real da EAP, é o RÓTULO ("2.4 - Aluguel de ferramenta
     * e acessórios..."), gravado assim de propósito por
     * `MapaEditor.editarEtapa()` (`{ eapId: etapa.id, etapa: etapa.rotulo
     * }` — dois campos, o rótulo pro rateio/exibição, o id de verdade em
     * `item.eapId`, usado hoje só pra gerar pagamento). `orcadoDaEtapa`
     * (abaixo) espera um id real — comparando com um rótulo, nunca
     * encontra o item e sempre devolve zero; pagamentos confirmados
     * (`linha.eapId`, sempre um id de verdade) também nunca batiam contra
     * `etapasUsadas` (cheio de rótulos) — os dois lados zerados ao mesmo
     * tempo é o bug relatado pelo Lucas (23/08/2026): "como se todas as
     * etapas estivessem com orçado=realizado", quando na verdade os dois
     * simplesmente não eram encontrados. Esta tabela resolve rótulo → id
     * real, então o cálculo abaixo consulta a EAP pelo id de verdade sem
     * abrir mão do rótulo como chave externa (o Rateio por etapa e o
     * template continuam indexando por rótulo).
     */
    const eapIdRealPorEtapaKey = new Map<string, string>();
    for (const item of itens) {
      if (!item.eapId) continue;
      for (const rateio of obterRateiosDoItem(item)) {
        if (rateio.etapaKey !== ETAPA_SEM_NOME) eapIdRealPorEtapaKey.set(rateio.etapaKey, item.eapId);
      }
    }
    const etapaKeyPorEapIdReal = new Map<string, string>();
    for (const [etapaKey, eapIdReal] of eapIdRealPorEtapaKey) {
      etapaKeyPorEapIdReal.set(eapIdReal, etapaKey);
    }

    // Total de verdade de cada etapa (base + frete + desconto + markup),
    // o mesmo número da coluna "Total da etapa" do Rateio.
    const totalPorEtapa = new Map<string, number>();
    for (const linha of this.resumoEtapasParaSaldo.calcular(
      alocacoes,
      itens,
      fornecedores,
      this.notas().bySupplier,
    )) {
      totalPorEtapa.set(linha.etapa, linha.total);
    }

    // Proporção de BASE por tipo de custo dentro de cada etapa — usada só
    // pra ratear o total acima entre os tipos, nunca somada diretamente
    // ao saldo (frete/desconto/markup não têm tipo próprio).
    const basePorTipoPorEtapa = new Map<string, PorTipo>();
    for (const alocacao of alocacoes) {
      const item = itens[alocacao.itemIndex];
      if (!item?.tipo) continue;
      const base = calcularBaseItem(item, alocacao.supplierIndex);
      for (const rateio of obterRateiosDoItem(item)) {
        if (rateio.etapaKey === ETAPA_SEM_NOME) continue;
        if (!basePorTipoPorEtapa.has(rateio.etapaKey)) {
          basePorTipoPorEtapa.set(rateio.etapaKey, criarVazioPorTipo());
        }
        const porTipo = basePorTipoPorEtapa.get(rateio.etapaKey)!;
        porTipo[item.tipo as ChaveTipo] += base * rateio.fator;
      }
    }

    const doMapaAtual = (p: Pagamento) => p.origem?.tipo === 'mapa' && p.origem?.refId === this.mapaId;
    const realizadoPorEtapa = new Map<string, PorTipo>();
    for (const pagamento of this.pagamentosDaObra()) {
      if (pagamento.status === 'pendente' || doMapaAtual(pagamento)) continue;
      for (const linha of pagamento.itens) {
        if (!linha.eapId || !linha.tipo) continue;
        // `linha.eapId` (de um pagamento já confirmado) é sempre um id
        // real da EAP — resolve pra qual `etapaKey` (rótulo) este mapa
        // usa antes de bater contra `etapasUsadas`, ver comentário acima.
        const etapaKey = etapaKeyPorEapIdReal.get(linha.eapId);
        if (!etapaKey || !etapasUsadas.has(etapaKey)) continue;
        const valor =
          linha.modoValor === 'percentual'
            ? pagamento.valorTotal * ((Number(linha.valor) || 0) / 100)
            : Number(linha.valor) || 0;
        if (!realizadoPorEtapa.has(etapaKey)) {
          realizadoPorEtapa.set(etapaKey, criarVazioPorTipo());
        }
        const porTipo = realizadoPorEtapa.get(etapaKey)!;
        porTipo[linha.tipo as ChaveTipo] += valor;
      }
    }

    for (const etapaId of etapasUsadas) {
      const eapIdReal = eapIdRealPorEtapaKey.get(etapaId) ?? etapaId;
      const orcado = orcadoDaEtapa(eapIdReal, itensEap, cache);
      const realizado = realizadoPorEtapa.get(etapaId) ?? criarVazioPorTipo();
      const basePorTipo = basePorTipoPorEtapa.get(etapaId) ?? criarVazioPorTipo();
      const totalEtapa = totalPorEtapa.get(etapaId) ?? 0;
      const baseTotalEtapa = TIPOS_CUSTO.reduce((soma, t) => soma + (basePorTipo[t.chave] || 0), 0);

      const saldo = criarVazioPorTipo();
      TIPOS_CUSTO.forEach((t) => {
        const proporcao = baseTotalEtapa > 0 ? (basePorTipo[t.chave] || 0) / baseTotalEtapa : 0;
        const contribuicaoTipo = totalEtapa * proporcao;
        saldo[t.chave] = (orcado[t.chave] || 0) - (realizado[t.chave] || 0) - contribuicaoTipo;
      });
      resultado.set(etapaId, saldo);
    }

    return resultado;
  });

  /**
   * Com o mapa finalizado, nenhum campo é editável — só "Reabrir mapa"
   * volta a permitir mudanças (mesmo padrão de `EapStore.travada`, pedido
   * do Lucas 16/08/2026). Checada em todo método que muda `cabecalho`,
   * `fornecedores` ou `itens` (exceto a própria `alternarConfirmacao`,
   * que é a única saída do estado travado).
   */
  readonly travada = computed(() => this.cabecalho().isConfirmed);

  // ------------------------------------------------------------------
  /**
   * `mapaId` é o id do registro em `/mapas` — obrigatório desde a migração pro
   * relacional. `obraId` (rota /obras/:id/mapas/:mapaId) é a obra dona do
   * mapa — fixa desde a criação (04/08/2026: deixou de existir um fluxo de
   * "cliente escolhido à mão"; a obra já vem certa da rota).
   */
  carregar(mapaId: string, obraId: string): void {
    this.mapaId = mapaId;
    this.obraIdDaRota = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterMapa(mapaId).subscribe({
      next: (mapa) => {
        // Aplica os dados reais do mapa (itens/fornecedores incluídos)
        // ANTES de buscar a obra — importante: `carregarObra` pode
        // disparar um `salvar()` pra preencher o cliente automaticamente,
        // e esse `salvar()` sempre envia o estado atual completo. Se
        // rodasse antes de `aplicar()`, mandaria itens/fornecedores vazios
        // (o estado inicial do signal) e apagaria os dados reais do mapa
        // no servidor.
        this.aplicar(mapa as Record<string, unknown>);
        this.carregando.set(false);
        this.corrigirTotalSeDivergente(mapa as Record<string, unknown>);
        this.carregarObra(obraId);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o mapa.');
        this.carregando.set(false);
      },
    });

    // A EAP de etapas é sempre a da própria obra do mapa — não depende
    // mais de "achar a obra do cliente escolhido".
    this.carregarEapDaObra(obraId);
    this.carregarPagamentosDaObra(obraId);

    this.armazenamento.ler(CHAVE_RESPONSAVEIS).subscribe({
      next: (bruto) => this.responsaveisAtivos.set(this.extrairResponsaveisAtivos(bruto)),
      error: () => undefined,
    });

    this.armazenamento.ler(CHAVE_FORNECEDORES).subscribe({
      next: (bruto) => this.fornecedoresCadastro.set(this.extrairFornecedoresAtivos(bruto)),
      error: () => undefined,
    });
  }

  /**
   * Corrige silenciosamente o `total_mapa` gravado se ele não bater com o
   * total calculado agora (02/09/2026, achado do Lucas: um mapa salvo com
   * a fórmula antiga de `calcularTotalGeral()` — corrigida nesta mesma
   * sessão — continua mostrando o total ERRADO na lista de mapas até ser
   * salvo de novo, porque `total_mapa` só é recalculado no momento de um
   * `salvar()`, nunca retroativamente numa mapa já existente). Este
   * resave silencioso, uma vez, ao abrir, resolve isso sem precisar de
   * nenhuma migração de dados: basta o Lucas abrir cada mapa afetado uma
   * vez pra lista voltar a mostrar o valor certo. Só as computeds de
   * itens/fornecedores/cabecalho entram nessa conta (já aplicados nesse
   * ponto) — não depende da EAP/pagamentos da obra, que ainda estão
   * carregando.
   */
  private corrigirTotalSeDivergente(mapaBruto: Record<string, unknown>): void {
    const totalGravado = Number(mapaBruto['total_mapa']) || 0;
    const totalCorreto = this.calcularTotalGeral();
    if (Math.abs(totalGravado - totalCorreto) > 0.01) {
      this.salvar();
    }
  }

  private extrairResponsaveisAtivos(bruto: string | null): string[] {
    if (!bruto) return [];
    try {
      const lista = JSON.parse(bruto);
      if (!Array.isArray(lista)) return [];
      return lista
        .filter((r: Record<string, unknown>) => r?.['ativo'] !== false)
        .map((r: Record<string, unknown>) => String(r?.['nome'] ?? '').trim())
        .filter((nome) => nome.length > 0)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch {
      return [];
    }
  }

  private extrairFornecedoresAtivos(
    bruto: string | null,
  ): { nome: string; contatos: { nome: string; telefone: string }[] }[] {
    if (!bruto) return [];
    try {
      const lista = JSON.parse(bruto);
      if (!Array.isArray(lista)) return [];
      return lista
        .filter((f: Record<string, unknown>) => f?.['ativo'] !== false)
        .map((f: Record<string, unknown>) => ({
          nome: String(f?.['nome'] ?? '').trim(),
          contatos: (Array.isArray(f?.['contatos']) ? (f['contatos'] as Record<string, unknown>[]) : [])
            .map((c) => ({
              nome: String(c?.['nome'] ?? '').trim(),
              telefone: formatarTelefone(c?.['telefone']),
            }))
            .filter((c) => c.nome.length > 0),
        }))
        .filter((f) => f.nome.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Busca a obra dona do mapa, pro nome exibido no cabeçalho e pra
   * preencher `cabecalho().cliente` automaticamente (só se ainda estiver
   * vazio — mapa novo, ou mapa antigo sem cliente gravado; nunca
   * sobrescreve um valor já existente). Chamado só depois de `aplicar()`
   * — ver comentário em `carregar()`.
   */
  private carregarObra(obraId: string): void {
    this.api.obterObra(obraId).subscribe({
      next: (obra) => {
        this.obraAtual.set(obra);
        if (!this.cabecalho().cliente && obra.cliente) {
          this.cabecalho.update((c) => ({ ...c, cliente: obra.cliente ?? '' }));
          this.salvar();
        }
      },
      error: () => undefined,
    });
  }

  /** Busca a EAP da obra do mapa, para alimentar o select de Etapa dos itens. */
  private carregarEapDaObra(obraId: string): void {
    if (!obraId) return;

    this.api.obterEap(obraId).subscribe({
      next: (payload) => {
        // Grupos E itens da EAP, ambos viram opção de etapa — o usuário
        // pode querer ratear tanto para um grupo (ex.: "2 - ELÉTRICA")
        // quanto para um item específico dentro dele (revisão 31/07/2026).
        const linhas = Array.isArray(payload.eapItems) ? payload.eapItems : [];
        this.etapasDisponiveis.set(
          linhas
            .map((i) => ({ id: String(i.id ?? ''), rotulo: `${i.eap} - ${i.desc}`.trim() }))
            .filter((e) => e.id && e.rotulo !== '-'),
        );
        this.casarEtapasAntigas();

        // Orçado por etapa (Saldo remanescente do Rateio) — mesma
        // normalização da EAP e de Relatórios, pra `isGroup`/`nivel`
        // saírem certos.
        this.itensEap.set(
          aplicarNumeracaoAutomatica(
            linhas.map((i) => normalizarItemEap(i as Record<string, unknown>)),
          ),
        );
        this.cabecalhoEap.set(normalizarCabecalho(payload.header));
      },
      error: () => this.etapasDisponiveis.set([]),
    });
  }

  /** Pagamentos da obra inteira — só pro "Saldo remanescente por etapa" do Rateio. */
  private carregarPagamentosDaObra(obraId: string): void {
    if (!obraId) return;

    this.api.listarPagamentos({ obraId }).subscribe({
      next: (lista) => {
        this.pagamentosDaObra.set(lista.map((p) => normalizarPagamento(p as Record<string, unknown>)));
      },
      error: () => this.pagamentosDaObra.set([]),
    });
  }

  /**
   * Mapas salvos antes de 03/08/2026 guardaram só o rótulo da etapa, sem o
   * `eapId`. Assim que a lista de etapas chega, reencontra o id pelo rótulo
   * e completa os itens — sem isso, um mapa antigo continuaria gerando
   * pagamento sem etapa. Só grava se algo mudou de fato.
   */
  private casarEtapasAntigas(): void {
    const porRotulo = new Map(this.etapasDisponiveis().map((e) => [e.rotulo, e.id]));
    let mudou = false;

    const atualizados = this.itens().map((item) => {
      if (item.eapId || !item.etapa) return item;
      const id = porRotulo.get(item.etapa);
      if (!id) return item;
      mudou = true;
      return { ...item, eapId: id };
    });

    if (!mudou) return;
    this.itens.set(atualizados);
    this.salvar();
  }

  private aplicar(mapa: Record<string, unknown>): void {
    this.cabecalho.set({
      numeroMapa: String(mapa['numero_mapa'] ?? ''),
      descricao: String(mapa['descricao'] ?? ''),
      cliente: String(mapa['cliente'] ?? ''),
      responsavelObra: String(mapa['responsavel_obra'] ?? ''),
      responsavelMapa: String(mapa['responsavel_mapa'] ?? ''),
      // Datas automáticas (04/08/2026) — vêm prontas do servidor, com
      // hora, e não são mais digitadas: `created_at` é o timestamp padrão
      // do Eloquent (quando o registro do mapa nasceu); `confirmed_at` é
      // gravado por `alternarConfirmacao()` no momento de "Finalizar mapa".
      criadoEm: String(mapa['created_at'] ?? ''),
      freteParticular: Number(mapa['frete_particular']) || 0,
      freteiroParticular: String(mapa['freteiro_particular'] ?? ''),
      // Ausente (mapa salvo antes de 16/08/2026) cai em `true` — mesmo
      // padrão do backend (coluna com `default(true)`), pra não mudar o
      // comportamento de mapas antigos.
      lancarFreteComoItem: mapa['lancar_frete_como_item'] === undefined
        ? true
        : Boolean(mapa['lancar_frete_como_item']),
      freteEtapaId: mapa['frete_etapa_id'] ? String(mapa['frete_etapa_id']) : '',
      freteCategoriaTipo: (mapa['frete_categoria_tipo'] as ChaveTipo) || '',
      // Mesma regra de compatibilidade acima — mapa salvo antes de
      // 01/09/2026 cai em `true` (comportamento de sempre: imposto e
      // desconto sempre viraram item).
      lancarImpostoDescontoComoItem: mapa['lancar_imposto_desconto_como_item'] === undefined
        ? true
        : Boolean(mapa['lancar_imposto_desconto_como_item']),
      impostoDescontoEtapaId: mapa['imposto_desconto_etapa_id'] ? String(mapa['imposto_desconto_etapa_id']) : '',
      impostoDescontoCategoriaTipo: (mapa['imposto_desconto_categoria_tipo'] as ChaveTipo) || '',
      modoManual: Boolean(mapa['modo_manual']),
      isConfirmed: Boolean(mapa['is_confirmed']),
      confirmedAt: String(mapa['confirmed_at'] ?? ''),
      ultimaFinalizacaoEm: String(mapa['ultima_finalizacao_em'] ?? ''),
    });

    const fornecedoresBrutos = Array.isArray(mapa['fornecedores'])
      ? (mapa['fornecedores'] as Record<string, unknown>[])
      : [];

    this.fornecedores.set(
      fornecedoresBrutos.map((f) => ({
        nome: String(f['fornecedor'] ?? ''),
        contato: String(f['contato'] ?? ''),
        ativo: f['ativo'] !== false,
        imposto: Number(f['imposto_percent']) || 0,
        frete: Number(f['frete']) || 0,
        desconto: Number(f['desconto']) || 0,
      })),
    );

    // fornecedor_id (relacional) -> posição no array (frontend trabalha por índice).
    const indicePorId = new Map<string, number>(
      fornecedoresBrutos.map((f, i) => [String(f['id']), i]),
    );

    const itensBrutos = Array.isArray(mapa['itens'])
      ? (mapa['itens'] as Record<string, unknown>[])
      : [];

    this.itens.set(
      itensBrutos.map((i) => {
        const unit = fornecedoresBrutos.map(() => 0);
        const precos = Array.isArray(i['precos']) ? (i['precos'] as Record<string, unknown>[]) : [];
        for (const preco of precos) {
          const indice = indicePorId.get(String(preco['fornecedor_id']));
          if (indice !== undefined) unit[indice] = Number(preco['valor_unitario']) || 0;
        }

        const escolhaId = i['escolha_fornecedor_id'];
        const choice = escolhaId ? indicePorId.get(String(escolhaId)) ?? null : null;

        return {
          id: i['id'] ? String(i['id']) : gerarId(),
          desc: String(i['descricao'] ?? ''),
          qtde: Number(i['quantidade']) || 0,
          unid: String(i['unidade'] ?? ''),
          unit,
          tipo: (CHAVE_POR_ID[Number(i['tipo_custo_id'])] ?? '') as ChaveTipo | '',
          eapId: i['eap_item_id'] ? String(i['eap_item_id']) : '',
          etapa: String(i['etapa'] ?? ''),
          choice,
        };
      }),
    );
  }

  salvar(): void {
    if (!this.mapaId) return;
    this.pendentes.update((n) => n + 1);
    this.salvarSubject.next();
  }

  /** Execução de fato do PUT — sempre lê o estado mais atual dos signals. */
  private executarSalvar(): Observable<unknown> {
    const fornecedores = this.fornecedores();
    const cabecalho = this.cabecalho();

    const payload = {
      numero_mapa: cabecalho.numeroMapa,
      descricao: cabecalho.descricao,
      cliente: cabecalho.cliente,
      responsavel_obra: cabecalho.responsavelObra,
      responsavel_mapa: cabecalho.responsavelMapa,
      frete_particular: cabecalho.freteParticular,
      freteiro_particular: cabecalho.freteiroParticular || null,
      lancar_frete_como_item: cabecalho.lancarFreteComoItem,
      frete_etapa_id: cabecalho.freteEtapaId || null,
      frete_categoria_tipo: cabecalho.freteCategoriaTipo || null,
      lancar_imposto_desconto_como_item: cabecalho.lancarImpostoDescontoComoItem,
      imposto_desconto_etapa_id: cabecalho.impostoDescontoEtapaId || null,
      imposto_desconto_categoria_tipo: cabecalho.impostoDescontoCategoriaTipo || null,
      modo_manual: cabecalho.modoManual,
      is_confirmed: cabecalho.isConfirmed,
      confirmed_at: cabecalho.confirmedAt || null,
      ultima_finalizacao_em: cabecalho.ultimaFinalizacaoEm || null,
      total_mapa: this.calcularTotalGeral(),
      fornecedores: fornecedores.map((f) => ({
        fornecedor: f.nome,
        contato: f.contato,
        ativo: f.ativo,
        impostoPercent: f.imposto,
        frete: f.frete,
        desconto: f.desconto,
      })),
      itens: this.itens().map((item) => ({
        id: item.id,
        descricao: item.desc,
        tipoCustoId: item.tipo ? ID_POR_CHAVE[item.tipo] : null,
        quantidade: item.qtde,
        unidade: item.unid,
        etapa: item.etapa,
        eapItemId: item.eapId || null,
        fornecedorEscolhidoIndex: item.choice,
        precos: item.unit.map((valorUnitario, fornecedorIndex) => ({
          fornecedorIndex,
          valorUnitario,
          comprar: false,
        })),
      })),
    };

    // 31/08/2026, investigação do Lucas ("quando preencho rápido o sistema
    // não capta o campo anterior, meio que reseta"): até aqui, a resposta
    // deste PUT era reaplicada em cima de `itens`/`fornecedores`/
    // `cabecalho` via `aplicar()`. Como o backend sempre grava a `ordem`
    // de fornecedores/itens pela POSIÇÃO do array recebido (não por um id
    // que precisasse voltar pra alinhar de novo — ver
    // `MapaController::syncCompleto`), essa resposta é sempre só um ECO do
    // que acabou de ser enviado, nunca traz nada computado só no servidor.
    // Reaplicar sobrescrevia qualquer edição feita DEPOIS deste PUT ter
    // partido mas ANTES dele responder — exatamente o bug relatado. Mesmo
    // padrão (não reaplicar) que `EapStore.salvar()`/`MedicaoStore` já
    // usavam sem esse problema.
    return this.api.atualizarMapa(this.mapaId, payload).pipe(
      tap({
        next: () => this.pendentes.update((n) => Math.max(0, n - 1)),
        error: () => this.pendentes.update((n) => Math.max(0, n - 1)),
      }),
    );
  }

  /**
   * Total do mapa — gravado em `total_mapa` só pra alimentar a coluna
   * "Total" da lista de mapas da obra (`MapasObra`).
   *
   * 01/09/2026 (bug relatado pelo Lucas: mapa mostrando um total diferente
   * do que a própria tela recomenda): esta função tinha uma fórmula
   * PRÓPRIA, desatualizada em relação a `notas()`/`cenarios()` — sempre
   * embutia o frete de cada loja (`incluirFreteLoja=true` fixo) E ainda
   * somava o frete particular por cima incondicionalmente (dobrava a
   * conta sempre que havia frete particular cadastrado), nunca verificava
   * se "Tudo em uma só loja" tinha vencido a comparação de cenários, e
   * aplicava o desconto de TODOS os fornecedores, mesmo os que não
   * levaram a compra inteira (o comentário antigo desta função dizia
   * "desconto real, não o zero usado em notas" — isso refletia o
   * `notas()` de ANTES da correção de 19/08/2026, que já passou a aplicar
   * desconto só a quem venceu a compra inteira; esta função nunca foi
   * atualizada depois disso). Agora usa exatamente a mesma composição que
   * a tela usa pra mostrar/recomendar o total (`notas()` +
   * `incluirFreteLoja()` + `freteParticularVencedor()`), então os dois
   * números nunca mais divergem.
   */
  private calcularTotalGeral(): number {
    const notas = calcularNotasPorFornecedor(
      this.alocacoes(),
      this.itens(),
      this.fornecedores(),
      this.incluirFreteLoja(),
      descontosAplicaveis(this.alocacoes(), this.itens(), this.fornecedores()),
    );
    return (
      notas.totals.totalNota +
      (this.freteParticularVencedor() ? Number(this.cabecalho().freteParticular) || 0 : 0)
    );
  }

  // ------------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------------
  atualizarCabecalho<K extends keyof CabecalhoMapa>(campo: K, valor: CabecalhoMapa[K]): void {
    if (this.travada()) return;
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  /**
   * Finaliza (ou reabre) o mapa — mesmo padrão de `EapStore.alternarConfirmacao()`.
   * Enquanto não finalizado, a tela permanece editável e os botões de
   * Gerar PDF / Gerar Pagamento ficam desabilitados.
   *
   * `confirmedAt` ("Finalização do mapa") grava só a PRIMEIRA finalização
   * e trava nesse valor pra sempre — reabrir e finalizar de novo não
   * mexe nele (20/08/2026, pedido do Lucas: antes ele era regravado a
   * cada finalização, perdendo a data original). `ultimaFinalizacaoEm`
   * ("Última edição") é o par que acompanha toda finalização, inclusive
   * a primeira — o backend reforça essa trava de novo por segurança (ver
   * `MapaController::syncCompleto`), mas já não sobrescrever aqui evita
   * mandar um valor errado na primeira tentativa.
   */
  alternarConfirmacao(): void {
    this.cabecalho.update((c) => {
      const vaiFinalizar = !c.isConfirmed;
      const agora = new Date().toISOString();
      return {
        ...c,
        isConfirmed: vaiFinalizar,
        confirmedAt: vaiFinalizar && !c.confirmedAt ? agora : c.confirmedAt,
        ultimaFinalizacaoEm: vaiFinalizar ? agora : c.ultimaFinalizacaoEm,
      };
    });
    this.salvar();
  }

  /**
   * Duplica este mapa (20/08/2026, pedido do Lucas): cria um mapa NOVO na
   * mesma obra, copiando fornecedores/itens/preços e o cabeçalho —
   * exceto os campos que o próprio sistema gera sozinho, que nascem
   * frescos: `codigo` (o backend sempre gera um novo em `store()`),
   * "Nº do mapa" (recalculado como o próximo da obra, não o do mapa
   * copiado), "Responsável da obra" (relido da obra agora, não copiado
   * do mapa de origem), datas de início/finalização/última edição
   * (vazias) e status (nasce em edição, nunca finalizado).
   *
   * Encadeia com `listarMapas` porque o "Nº do mapa" novo depende de
   * conhecer os mapas atuais da obra — não dá pra usar `this.mapas` (não
   * existe aqui; quem lista os mapas da obra é a tela `MapasObra`, não
   * este store).
   */
  duplicar(): Observable<Mapa> {
    const cabecalho = this.cabecalho();
    const fornecedores = this.fornecedores();
    const itens = this.itens();
    const obraId = this.obraIdDaRota;
    const responsavelObraAtual = this.obraAtual()?.responsavel ?? '';
    const totalCopiado = this.calcularTotalGeral();

    this.duplicando.set(true);

    return this.api.listarMapas(obraId).pipe(
      switchMap((mapasDaObra) => {
        const payload = {
          obra_id: obraId,
          numero_mapa: proximoNumeroMapa(mapasDaObra),
          descricao: cabecalho.descricao,
          cliente: cabecalho.cliente,
          responsavel_obra: responsavelObraAtual,
          responsavel_mapa: cabecalho.responsavelMapa,
          frete_particular: cabecalho.freteParticular,
          freteiro_particular: cabecalho.freteiroParticular || null,
          lancar_frete_como_item: cabecalho.lancarFreteComoItem,
          frete_etapa_id: cabecalho.freteEtapaId || null,
          frete_categoria_tipo: cabecalho.freteCategoriaTipo || null,
          lancar_imposto_desconto_como_item: cabecalho.lancarImpostoDescontoComoItem,
          imposto_desconto_etapa_id: cabecalho.impostoDescontoEtapaId || null,
          imposto_desconto_categoria_tipo: cabecalho.impostoDescontoCategoriaTipo || null,
          modo_manual: cabecalho.modoManual,
          is_confirmed: false,
          confirmed_at: null,
          ultima_finalizacao_em: null,
          total_mapa: totalCopiado,
          fornecedores: fornecedores.map((f) => ({
            fornecedor: f.nome,
            contato: f.contato,
            ativo: f.ativo,
            impostoPercent: f.imposto,
            frete: f.frete,
            desconto: f.desconto,
          })),
          // Sem `id` de propósito — são itens de um mapa DIFERENTE, então
          // precisam nascer com id novo (reaproveitar o id do item de
          // origem colidiria com a linha existente na tabela mapa_itens).
          itens: itens.map((item) => ({
            descricao: item.desc,
            tipoCustoId: item.tipo ? ID_POR_CHAVE[item.tipo] : null,
            quantidade: item.qtde,
            unidade: item.unid,
            etapa: item.etapa,
            eapItemId: item.eapId || null,
            fornecedorEscolhidoIndex: item.choice,
            precos: item.unit.map((valorUnitario, fornecedorIndex) => ({
              fornecedorIndex,
              valorUnitario,
              comprar: false,
            })),
          })),
        };

        return this.api.criarMapa(payload);
      }),
      finalize(() => this.duplicando.set(false)),
    );
  }

  // ------------------------------------------------------------------
  // Gerar Pagamento
  // ------------------------------------------------------------------
  /**
   * Cria um Pagamento por fornecedor vencedor do mapa (agrupando os itens
   * que cada um ganhou, considerando modo manual/escolha por item — a
   * mesma lógica de `alocacoes`). Só chamado com o mapa finalizado.
   *
   * Migrado em 03/08/2026 da ponte chave-valor pro endpoint relacional
   * `/api/pagamentos` — ver `PagamentosStore` pro mesmo motivo.
   *
   * Idempotente: rodar de novo substitui os pagamentos "pendente" já
   * gerados por este mapa (reflete preços/escolhas atuais, via delete +
   * recriação — a API relacional não tem "regravar tudo de uma vez" como
   * a chave-valor tinha), mas nunca mexe num que o usuário já confirmou
   * na aba Pagamentos — pra esse fornecedor, simplesmente não gera de
   * novo.
   */
  gerarPagamentos(): void {
    if (!this.obraIdDaRota || !this.mapaId) return;

    this.gerandoPagamento.set(true);
    this.resultadoGerarPagamento.set(null);

    const obraId = this.obraIdDaRota;
    const mapaId = this.mapaId;

    forkJoin({
      pagamentos: this.api.listarPagamentos({ obraId }),
      obra: this.api.obterObra(obraId).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ pagamentos: brutos, obra }) => {
        const pagamentos = brutos.map((p) => normalizarPagamento(p as Record<string, unknown>));
        const header = { obraNumber: String(obra?.map_number ?? '') };

        const doMapa = (p: Pagamento) => p.origem?.tipo === 'mapa' && p.origem?.refId === mapaId;

        const fornecedoresConfirmados = new Set(
          pagamentos.filter((p) => doMapa(p) && p.status === 'confirmado').map((p) => p.fornecedor),
        );
        // Pendentes antigos deste mapa serão substituídos pelos recém-calculados.
        const pendentesDesteMapa = pagamentos.filter((p) => doMapa(p) && p.status === 'pendente');

        const numerosEmUso = [...pagamentos];
        const novos = this.montarPagamentosPorFornecedor(fornecedoresConfirmados, numerosEmUso, header);
        const frete = this.montarPagamentoFreteiro(fornecedoresConfirmados, numerosEmUso, header);
        novos.push(...frete.pagamentos);
        const complementoFrete = frete.aviso ? ` ${frete.aviso}` : '';

        if (!novos.length) {
          this.gerandoPagamento.set(false);
          this.resultadoGerarPagamento.set(
            (fornecedoresConfirmados.size
              ? 'Todos os fornecedores deste mapa já têm pagamento confirmado — nada novo para gerar.'
              : 'Nenhum item com fornecedor vencedor para gerar pagamento.') + complementoFrete,
          );
          return;
        }

        const exclusoes: Observable<unknown> = pendentesDesteMapa.length
          ? forkJoin(pendentesDesteMapa.map((p) => this.api.excluirPagamento(p.id)))
          : of(null);

        exclusoes
          .pipe(
            catchError(() => of(null)),
            switchMap(() => forkJoin(novos.map((p) => this.api.criarPagamento(paraPayloadApi(p, obraId))))),
          )
          .subscribe({
            next: () => {
              this.gerandoPagamento.set(false);
              this.resultadoGerarPagamento.set(
                `${novos.length} pagamento(s) gerado(s) — confira na aba Pagamentos da obra.${complementoFrete}`,
              );
            },
            error: () => {
              this.gerandoPagamento.set(false);
              this.resultadoGerarPagamento.set('Não foi possível gravar os pagamentos.');
            },
          });
      },
      error: () => {
        this.gerandoPagamento.set(false);
        this.resultadoGerarPagamento.set('Não foi possível ler os pagamentos existentes desta obra.');
      },
    });
  }

  /**
   * Um Pagamento por fornecedor que ganhou algum item, pulando quem já
   * tem pagamento confirmado deste mesmo mapa — seguindo a MESMA
   * recomendação de `cenarios()`/`alocacoes()`/`incluirFreteLoja()` que
   * "Rateio por etapa da obra" e "Detalhe por fornecedor" já mostram
   * (18/08/2026, pedido do Lucas — antes "Gerar Pagamento" tinha sua
   * própria comparação, mais restrita, que só considerava a compra
   * integral fora do modo manual e sempre cobrava o frete de cada loja
   * na nota mesmo quando o frete particular era a opção vencedora).
   * Concretamente: **fora do modo manual**, se "Tudo em uma só loja" for
   * o cenário vencedor, gera um pagamento único com a compra inteira
   * daquele fornecedor; senão (fracionado, automático ou manual) gera um
   * pagamento por fornecedor vencedor, com ou sem o frete de cada loja
   * embutido na nota conforme `incluirFreteLoja()` — **com modo manual
   * ligado**, a alocação é sempre a escolha manual item a item, e só o
   * modo do frete (das lojas ou particular) é decidido pela comparação
   * entre as duas variantes manuais.
   *
   * `numerosEmUso` acumula os pagamentos já numerados (existentes + os
   * recém-criados nesta mesma chamada) para não repetir número de
   * sequência.
   */
  private montarPagamentosPorFornecedor(
    fornecedoresConfirmados: Set<string>,
    numerosEmUso: Pagamento[],
    header: Record<string, unknown>,
  ): Pagamento[] {
    const itens = this.itens();
    const fornecedores = this.fornecedores();
    const cabecalho = this.cabecalho();

    const fornecedorIntegral = this.decidirCompraIntegral();
    if (fornecedorIntegral !== null) {
      return this.montarPagamentoIntegral(
        fornecedorIntegral,
        itens,
        fornecedores,
        cabecalho,
        fornecedoresConfirmados,
        numerosEmUso,
        header,
      );
    }

    // `this.notas()` já é exatamente esta conta (alocação recomendada +
    // desconto real) desde a correção de "Detalhe por fornecedor" —
    // reaproveitar evita ter a fórmula duplicada em dois lugares.
    const alocacoes = this.alocacoes();
    const notas = this.notas();

    const itensPorFornecedor = new Map<number, ItemMapa[]>();
    for (const alocacao of alocacoes) {
      const item = itens[alocacao.itemIndex];
      if (!item) continue;
      const lista = itensPorFornecedor.get(alocacao.supplierIndex) ?? [];
      lista.push(item);
      itensPorFornecedor.set(alocacao.supplierIndex, lista);
    }

    const hoje = hojeIso();
    const descricaoBase = [cabecalho.numeroMapa, cabecalho.descricao].filter(Boolean).join(' — ');
    const resultado: Pagamento[] = [];

    fornecedores.forEach((_, si) => {
      const rotulo = rotuloFornecedor(fornecedores, si);
      const itensDoFornecedor = itensPorFornecedor.get(si);
      if (!itensDoFornecedor?.length) return;
      if (fornecedoresConfirmados.has(rotulo)) return;

      const nota = notas.bySupplier[si];
      if (!nota?.used || !(nota.totalNota > 0)) return;

      const linhas = this.construirLinhasDoFornecedor(itensDoFornecedor, si, nota, cabecalho);

      const pagamento: Pagamento = {
        id: gerarId(),
        numeroPagamento: gerarNumeroPagamento(numerosEmUso),
        obraNumber: String(header['obraNumber'] ?? ''),
        dataSolicitacao: hoje,
        dataPagamento: '',
        fornecedor: rotulo,
        descricao: descricaoBase || `Mapa de fornecedores`,
        valorTotal: nota.totalNota,
        itens: linhas,
        origem: { tipo: 'mapa', refId: this.mapaId },
        status: 'pendente',
      };

      numerosEmUso.push(pagamento);
      resultado.push(pagamento);
    });

    return resultado;
  }

  /**
   * Decide se a geração deve seguir o cenário **integral** (tudo de um
   * fornecedor só) — delega em `cenarioVencedorIntegral()`, a mesma
   * decisão de `alocacoes()`, então nunca diverge do que "Rateio por
   * etapa da obra"/"Detalhe por fornecedor" já mostram (18/08/2026).
   * Só pode ser não-nulo fora do modo manual (ver `cenarios`).
   */
  private decidirCompraIntegral(): number | null {
    if (!this.cenarioVencedorIntegral()) return null;
    const melhor = this.melhorIntegral();
    const si = this.integral().findIndex((valor) => valor === melhor);
    return si >= 0 ? si : null;
  }

  /** Um único Pagamento com a compra inteira (todos os itens com quantidade) do fornecedor `si`. */
  private montarPagamentoIntegral(
    si: number,
    itens: ItemMapa[],
    fornecedores: Fornecedor[],
    cabecalho: CabecalhoMapa,
    fornecedoresConfirmados: Set<string>,
    numerosEmUso: Pagamento[],
    header: Record<string, unknown>,
  ): Pagamento[] {
    const fornecedor = fornecedores[si];
    const rotulo = rotuloFornecedor(fornecedores, si);
    if (!fornecedor || fornecedoresConfirmados.has(rotulo)) return [];

    const itensComQtde = itens.filter((item) => (Number(item.qtde) || 0) > 0);
    if (!itensComQtde.length) return [];

    const itensBase = itensComQtde.reduce((soma, item) => soma + calcularBaseItem(item, si), 0);
    const itensComImposto = itensComQtde.reduce(
      (soma, item) => soma + calcularTotalItem(item, si, fornecedores),
      0,
    );
    const notaCalc = calcularNota(
      itensBase,
      si,
      fornecedores,
      true,
      Number(fornecedor.frete) || 0,
      Number(fornecedor.desconto) || 0,
    );
    const nota: NotaFornecedor = {
      used: true,
      itensBase,
      itensComImposto,
      frete: Number(fornecedor.frete) || 0,
      desconto: Number(fornecedor.desconto) || 0,
      baseNota: notaCalc.baseNota,
      impostoNota: notaCalc.impostoNota,
      totalNota: notaCalc.totalNota,
    };
    if (!(nota.totalNota > 0)) return [];

    const linhas = this.construirLinhasDoFornecedor(itensComQtde, si, nota, cabecalho);
    const hoje = hojeIso();
    const descricaoBase = [cabecalho.numeroMapa, cabecalho.descricao].filter(Boolean).join(' — ');

    const pagamento: Pagamento = {
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(numerosEmUso),
      obraNumber: String(header['obraNumber'] ?? ''),
      dataSolicitacao: hoje,
      dataPagamento: '',
      fornecedor: rotulo,
      descricao: descricaoBase || 'Mapa de fornecedores (compra integral)',
      valorTotal: nota.totalNota,
      itens: linhas,
      origem: { tipo: 'mapa', refId: this.mapaId },
      status: 'pendente',
    };

    numerosEmUso.push(pagamento);
    return [pagamento];
  }

  /**
   * Monta as linhas do pagamento de um fornecedor: uma por item (custo
   * base, sem imposto — comparável ao Orçado da EAP), mais frete e
   * imposto/desconto, cada um por SEU PRÓPRIO toggle independente
   * (01/09/2026, pedido do Lucas: imposto/desconto ganhou o mesmo
   * controle que o frete já tinha desde 16-19/08/2026) —
   * `cabecalho.lancarFreteComoItem` e `cabecalho.lancarImpostoDescontoComoItem`
   * podem estar ligados/desligados em qualquer combinação:
   *
   *  - **Ligado**: vira uma linha própria no pagamento, com a etapa/
   *    categoria escolhida nos campos correspondentes (vazio cai em
   *    "S/ Categoria" na EAP, como sempre foi).
   *  - **Desligado**: é distribuído proporcionalmente entre os itens do
   *    próprio fornecedor (peso = valor BASE de cada item, antes de
   *    qualquer embutimento — os dois embutimentos são independentes
   *    entre si, nunca um distorce o peso do outro), sem virar linha
   *    própria.
   */
  private construirLinhasDoFornecedor(
    itensDoFornecedor: ItemMapa[],
    si: number,
    nota: NotaFornecedor,
    cabecalho: CabecalhoMapa,
  ): ItemPagamento[] {
    const linhas: ItemPagamento[] = itensDoFornecedor.map((item) => ({
      id: gerarId(),
      descricao: item.desc,
      tipo: item.tipo || '',
      eapId: item.eapId || '',
      valor: calcularBaseItem(item, si),
      modoValor: 'valor' as const,
    }));

    // Peso de cada linha pro rateio proporcional — capturado ANTES de
    // qualquer embutimento, pra frete e imposto/desconto ficarem
    // independentes um do outro (nenhum distorce a base do outro).
    // `quantidadeItens` trava o rateio só nas linhas de ITEM originais —
    // sem isso, distribuir o imposto/desconto DEPOIS de já ter empurrado
    // a linha própria de frete (quando só o frete está "como item")
    // iterava também sobre essa linha nova, mas lendo `pesos[i]` fora dos
    // limites do array original (`undefined`), virando `NaN`.
    const quantidadeItens = linhas.length;
    const pesos = linhas.map((linha) => linha.valor);
    const somaLinhas = pesos.reduce((soma, peso) => soma + peso, 0);

    const ajusteTotal = nota.totalNota - somaLinhas; // frete + imposto − desconto, todos juntos
    const frete = nota.frete > 0 ? nota.frete : 0;
    const impostoDesconto = ajusteTotal - frete; // imposto − desconto, isolado do frete

    const distribuirProporcional = (valor: number) => {
      if (somaLinhas <= 0) return;
      for (let i = 0; i < quantidadeItens; i++) {
        linhas[i].valor += valor * (pesos[i] / somaLinhas);
      }
    };

    if (cabecalho.lancarFreteComoItem) {
      if (Math.abs(frete) > 0.005) {
        linhas.push({
          id: gerarId(),
          descricao: 'Frete da nota',
          tipo: cabecalho.freteCategoriaTipo || '',
          eapId: cabecalho.freteEtapaId || '',
          valor: frete,
          modoValor: 'valor' as const,
        });
      }
    } else if (frete > 0) {
      distribuirProporcional(frete);
    }

    if (cabecalho.lancarImpostoDescontoComoItem) {
      if (Math.abs(impostoDesconto) > 0.005) {
        linhas.push({
          id: gerarId(),
          descricao: 'Impostos e desconto da nota',
          tipo: cabecalho.impostoDescontoCategoriaTipo || '',
          eapId: cabecalho.impostoDescontoEtapaId || '',
          valor: impostoDesconto,
          modoValor: 'valor' as const,
        });
      }
    } else if (impostoDesconto !== 0) {
      distribuirProporcional(impostoDesconto);
    }

    return this.arredondarLinhasParaTotal(linhas, nota.totalNota);
  }

  /**
   * Arredonda cada linha a centavos e absorve a sobra (a diferença entre
   * a soma já arredondada e o total real, que arredondar célula a célula
   * pode introduzir) na ÚLTIMA linha — garante que a soma dos itens do
   * pagamento bate exatamente com o total, mesmo depois de cada valor
   * virar uma coluna `decimal` de 2 casas no banco (01/09/2026, pedido do
   * Lucas: "o sistema deve tentar resolver pequenas divergências de
   * arredondamento" ao distribuir frete/imposto/desconto nos itens).
   */
  private arredondarLinhasParaTotal(linhas: ItemPagamento[], totalNota: number): ItemPagamento[] {
    if (!linhas.length) return linhas;

    const arredondadas = linhas.map((linha) => ({ ...linha, valor: Math.round(linha.valor * 100) / 100 }));
    const somaArredondada = arredondadas.reduce((soma, linha) => soma + linha.valor, 0);
    const residuo = Math.round((totalNota - somaArredondada) * 100) / 100;

    if (residuo !== 0) {
      const ultima = arredondadas[arredondadas.length - 1];
      ultima.valor = Math.round((ultima.valor + residuo) * 100) / 100;
    }

    return arredondadas;
  }

  /**
   * Pagamento pro freteiro do frete particular — ele "entra no rateio como
   * se fosse um fornecedor" (17/08/2026, pedido do Lucas): uma linha por
   * etapa, com o valor proporcional ao peso de cada etapa no mapa (ver
   * `ratearFreteiro`). Só gera quando há frete particular e o freteiro
   * está preenchido; usa o próprio nome do freteiro como chave de
   * "fornecedor" pra dedupe com `fornecedoresConfirmados`, igual aos
   * outros pagamentos deste mapa.
   */
  private montarPagamentoFreteiro(
    fornecedoresConfirmados: Set<string>,
    numerosEmUso: Pagamento[],
    header: Record<string, unknown>,
  ): { pagamentos: Pagamento[]; aviso: string | null } {
    const cabecalho = this.cabecalho();
    const freteParticular = Number(cabecalho.freteParticular) || 0;
    // Sem valor de frete particular não há o que gerar — e nem o que avisar.
    if (freteParticular <= 0) return { pagamentos: [], aviso: null };

    // Só gera o pagamento do freteiro quando o frete particular é de fato
    // a opção vencedora — digitar um valor sozinho não basta (18/08/2026):
    // senão o freteiro seria cobrado mesmo quando a recomendação decidiu
    // usar o frete de cada loja, embutido na própria nota.
    //
    // 19/09/2026: antes, TODOS os motivos de não gerar (não ser o vencedor,
    // faltar o nome do freteiro, já existir pagamento confirmado, não ter
    // item com preço) devolviam `[]` em silêncio — o usuário via o mapa
    // "sem pagamento de frete" sem saber por quê. Agora cada caso devolve
    // o motivo, e a falta do nome do freteiro deixa de bloquear.
    if (!this.freteParticularVencedor()) {
      return {
        pagamentos: [],
        aviso:
          'Frete particular NÃO gerado: a comparação de cenários indica que o frete das lojas é mais vantajoso (o pagamento do freteiro só é gerado quando o frete particular é o cenário vencedor 🏆).',
      };
    }

    const freteiro = cabecalho.freteiroParticular?.trim() || 'Frete particular';
    const semNome = !cabecalho.freteiroParticular?.trim();
    if (fornecedoresConfirmados.has(freteiro)) {
      return { pagamentos: [], aviso: `Frete particular: "${freteiro}" já tem pagamento confirmado neste mapa — nada novo.` };
    }

    // Etapa(s) de cada linha do pagamento (19/09/2026, correção de bug):
    //  - Se "Etapa do frete" foi escolhida no cabeçalho, o frete inteiro vai
    //    pra ela, numa linha só.
    //  - Senão, é dividido entre as etapas na MESMA proporção dos itens
    //    comprados nas lojas (`ratearFreteiro`).
    // `ratearFreteiro` devolve o RÓTULO da etapa (`item.etapa`, o texto que o
    // usuário vê) como chave — igual ao "Rateio por etapa da obra". O
    // pagamento, porém, guarda o ID do item da EAP. Antes, o rótulo era
    // gravado direto em `eapId`: sem etapa nos itens dava certo (`''`), mas
    // com etapa o servidor recusava a linha (id inexistente) e o pagamento
    // do freteiro simplesmente não era criado.
    const categoriaFrete = cabecalho.freteCategoriaTipo || '';
    const etapaFixaId = cabecalho.freteEtapaId || '';
    const rotuloDaEtapaFixa =
      this.etapasDisponiveis().find((e) => e.id === etapaFixaId)?.rotulo || 'Etapa do frete';

    let linhasFrete: Array<{ eapId: string; rotulo: string; valor: number }>;
    if (etapaFixaId) {
      linhasFrete = [{ eapId: etapaFixaId, rotulo: rotuloDaEtapaFixa, valor: freteParticular }];
    } else {
      const porEtapa = ratearFreteiro(this.itens(), this.fornecedores(), this.alocacoes(), freteParticular);
      const eapIdPorRotulo = new Map<string, string>();
      for (const item of this.itens()) {
        if (item.etapa && item.eapId) eapIdPorRotulo.set(item.etapa, item.eapId);
      }
      linhasFrete = Array.from(porEtapa.entries()).map(([etapaKey, valor]) => ({
        eapId: etapaKey === ETAPA_SEM_NOME ? '' : (eapIdPorRotulo.get(etapaKey) ?? ''),
        rotulo: etapaKey === ETAPA_SEM_NOME ? 'Sem etapa' : etapaKey,
        valor,
      }));
    }

    const itensPagamento: ItemPagamento[] = this.arredondarLinhasParaTotal(
      linhasFrete
        .filter((linha) => Math.abs(linha.valor) > 0.005)
        .map((linha) => ({
          id: gerarId(),
          descricao: `Frete particular — ${linha.rotulo}`,
          tipo: categoriaFrete,
          eapId: linha.eapId,
          valor: linha.valor,
          modoValor: 'valor' as const,
        })),
      freteParticular,
    );
    if (!itensPagamento.length) {
      return {
        pagamentos: [],
        aviso:
          'Frete particular NÃO gerado: nenhum item do mapa tem preço/quantidade para ratear o frete entre as etapas.',
      };
    }

    const hoje = hojeIso();
    const descricaoBase = [cabecalho.numeroMapa, cabecalho.descricao].filter(Boolean).join(' — ');

    const pagamento: Pagamento = {
      id: gerarId(),
      numeroPagamento: gerarNumeroPagamento(numerosEmUso),
      obraNumber: String(header['obraNumber'] ?? ''),
      dataSolicitacao: hoje,
      dataPagamento: '',
      fornecedor: freteiro,
      descricao: descricaoBase
        ? `${descricaoBase} — frete particular`
        : 'Frete particular do mapa',
      valorTotal: freteParticular,
      itens: itensPagamento,
      origem: { tipo: 'mapa', refId: this.mapaId },
      status: 'pendente',
    };

    numerosEmUso.push(pagamento);
    return {
      pagamentos: [pagamento],
      aviso: semNome
        ? 'Frete particular gerado SEM nome do freteiro (campo "Freteiro" vazio) — edite o fornecedor desse pagamento na aba Pagamentos.'
        : null,
    };
  }

  // ------------------------------------------------------------------
  // Fornecedores
  // ------------------------------------------------------------------
  adicionarFornecedor(): void {
    if (this.travada()) return;
    this.fornecedores.update((lista) => [
      ...lista,
      { nome: '', contato: '', ativo: true, imposto: 0, frete: 0, desconto: 0 },
    ]);
    // Cada item passa a ter uma casa a mais no array de preços.
    this.itens.update((lista) => lista.map((i) => ({ ...i, unit: [...i.unit, 0] })));
    this.salvar();
  }

  atualizarFornecedor(indice: number, alteracao: Partial<Fornecedor>): void {
    if (this.travada()) return;
    this.fornecedores.update((lista) =>
      lista.map((f, i) => (i === indice ? { ...f, ...alteracao } : f)),
    );
    this.salvar();
  }

  removerFornecedor(indice: number): void {
    if (this.travada()) return;
    this.fornecedores.update((lista) => lista.filter((_, i) => i !== indice));

    this.itens.update((lista) =>
      lista.map((item) => {
        const unit = item.unit.filter((_, i) => i !== indice);

        // A escolha manual guarda a posição do fornecedor; remover um do
        // meio desloca os seguintes, então a referência tem que ser
        // corrigida — ou descartada, se o escolhido foi o removido.
        let choice = item.choice;
        if (choice === indice) choice = null;
        else if (choice !== null && choice > indice) choice = choice - 1;

        return { ...item, unit, choice };
      }),
    );

    this.salvar();
  }

  // ------------------------------------------------------------------
  // Itens
  // ------------------------------------------------------------------
  /**
   * Insere um item. `posicao` permite inserir no meio da lista (usado
   * pelo botão "+" da coluna de Ações, e por Shift + `+` — mesmo padrão
   * de `EapStore.adicionarItem`, 17/08/2026, pedido do Lucas); omitida,
   * acrescenta ao final.
   */
  adicionarItem(posicao?: number): void {
    if (this.travada()) return;
    this.itens.update((lista) => {
      const novo: ItemMapa = {
        id: gerarId(),
        desc: '',
        qtde: 0,
        unid: '',
        unit: this.fornecedores().map(() => 0),
        tipo: '',
        eapId: '',
        etapa: '',
        choice: null,
      };
      if (posicao === undefined || posicao < 0 || posicao > lista.length) {
        return [...lista, novo];
      }
      const copia = [...lista];
      copia.splice(posicao, 0, novo);
      return copia;
    });
    this.salvar();
  }

  /**
   * "Colar com quebra de linha" (31/08/2026, pedido do Lucas): ao colar um
   * texto com várias linhas numa célula da tabela de itens, cada linha
   * vira o valor da MESMA coluna nas linhas seguintes — criando itens
   * novos no final da lista se não houver linhas suficientes abaixo.
   * `itemId` é a linha onde o colar começou; `linhas` já vem sem as
   * quebras (uma entrada por linha colada).
   */
  colarEmColuna(itemId: string, coluna: ColunaMapaColavel, linhas: string[]): void {
    if (this.travada() || !linhas.length) return;

    this.itens.update((lista) => {
      const indiceInicial = lista.findIndex((i) => i.id === itemId);
      if (indiceInicial < 0) return lista;

      const copia = [...lista];
      const faltam = indiceInicial + linhas.length - copia.length;
      for (let i = 0; i < faltam; i++) {
        copia.push({
          id: gerarId(),
          desc: '',
          qtde: 0,
          unid: '',
          unit: this.fornecedores().map(() => 0),
          tipo: '',
          eapId: '',
          etapa: '',
          choice: null,
        });
      }

      linhas.forEach((texto, deslocamento) => {
        const indice = indiceInicial + deslocamento;
        copia[indice] = this.aplicarValorNaColuna(copia[indice], coluna, texto.trim());
      });

      return copia;
    });

    this.salvar();
  }

  /**
   * "Preencher pra baixo" (Ctrl/Cmd + D, 31/08/2026, pedido do Lucas: mapas
   * gigantes onde o mesmo Tipo vale pra todos os itens) — copia o valor da
   * célula focada (`itemId`/`coluna`) pra todas as linhas ABAIXO dela, na
   * mesma coluna. Diferente de `colarEmColuna`, não passa pelo texto: pega
   * o valor já tipado do item de origem direto (evita, por exemplo, ter
   * que re-achar o Tipo pelo rótulo — aqui já se tem a chave certa).
   */
  preencherParaBaixo(itemId: string, coluna: ColunaMapaColavel): void {
    if (this.travada()) return;

    this.itens.update((lista) => {
      const indice = lista.findIndex((i) => i.id === itemId);
      if (indice < 0 || indice >= lista.length - 1) return lista;

      const origem = lista[indice];
      const copia = [...lista];
      for (let i = indice + 1; i < copia.length; i++) {
        copia[i] = this.copiarValorDeColuna(origem, copia[i], coluna);
      }
      return copia;
    });

    this.salvar();
  }

  private copiarValorDeColuna(origem: ItemMapa, destino: ItemMapa, coluna: ColunaMapaColavel): ItemMapa {
    switch (coluna.tipo) {
      case 'desc':
        return { ...destino, desc: origem.desc };
      case 'unid':
        return { ...destino, unid: origem.unid };
      case 'qtde':
        return { ...destino, qtde: origem.qtde };
      case 'tipoCusto':
        return { ...destino, tipo: origem.tipo };
      case 'etapa':
        return { ...destino, eapId: origem.eapId, etapa: origem.etapa };
      case 'preco': {
        const unit = [...destino.unit];
        while (unit.length < this.fornecedores().length) unit.push(0);
        unit[coluna.fornecedorIndice] = origem.unit[coluna.fornecedorIndice] ?? 0;
        return { ...destino, unit };
      }
    }
  }

  private aplicarValorNaColuna(item: ItemMapa, coluna: ColunaMapaColavel, valor: string): ItemMapa {
    switch (coluna.tipo) {
      case 'desc':
        return { ...item, desc: valor };
      case 'unid':
        return { ...item, unid: valor };
      case 'qtde':
        return { ...item, qtde: parsearBR(valor) };
      case 'tipoCusto': {
        if (!valor) return { ...item, tipo: '' };
        const alvo = valor.toLowerCase();
        const tipo = TIPOS_CUSTO.find(
          (t) => t.chave.toLowerCase() === alvo || t.rotulo.toLowerCase() === alvo,
        );
        return tipo ? { ...item, tipo: tipo.chave } : item;
      }
      case 'etapa': {
        if (!valor) return { ...item, eapId: '', etapa: '' };
        const etapa = this.etapasDisponiveis().find((e) => e.rotulo.toLowerCase() === valor.toLowerCase());
        return etapa ? { ...item, eapId: etapa.id, etapa: etapa.rotulo } : item;
      }
      case 'preco': {
        const unit = [...item.unit];
        while (unit.length < this.fornecedores().length) unit.push(0);
        unit[coluna.fornecedorIndice] = parsearBR(valor);
        return { ...item, unit };
      }
    }
  }

  atualizarItem(id: string, alteracao: Partial<ItemMapa>): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((i) => (i.id === id ? { ...i, ...alteracao } : i)));
    this.salvar();
  }

  atualizarPreco(id: string, indiceFornecedor: number, valor: number): void {
    if (this.travada()) return;
    this.itens.update((lista) =>
      lista.map((item) => {
        if (item.id !== id) return item;
        const unit = [...item.unit];
        while (unit.length < this.fornecedores().length) unit.push(0);
        unit[indiceFornecedor] = valor;
        return { ...item, unit };
      }),
    );
    this.salvar();
  }

  escolherFornecedor(id: string, indiceFornecedor: number): void {
    if (this.travada()) return;
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id
          ? { ...item, choice: item.choice === indiceFornecedor ? null : indiceFornecedor }
          : item,
      ),
    );
    this.salvar();
  }

  /**
   * Limpa a escolha manual de todos os itens — chamado ao desligar
   * "Compra manual" (17/08/2026, pedido do Lucas): sem isso, as escolhas
   * antigas ficavam guardadas escondidas e continuavam valendo pros
   * cenários "Compra manual com..." mesmo com o modo desligado na tela.
   */
  resetarEscolhasManuais(): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.map((item) => ({ ...item, choice: null })));
    this.salvar();
  }

  removerItem(id: string): void {
    if (this.travada()) return;
    this.itens.update((lista) => lista.filter((i) => i.id !== id));
    this.salvar();
  }

  /** Reordena um item — mesmo padrão de `EapStore.moverItem` (17/08/2026, pedido do Lucas). */
  moverItem(id: string, direcao: -1 | 1): void {
    if (this.travada()) return;
    this.itens.update((lista) => {
      const atual = lista.findIndex((i) => i.id === id);
      const destino = atual + direcao;
      if (atual < 0 || destino < 0 || destino >= lista.length) return lista;

      const copia = [...lista];
      [copia[atual], copia[destino]] = [copia[destino], copia[atual]];
      return copia;
    });
    this.salvar();
  }

  readonly tiposCusto = TIPOS_CUSTO;
}
