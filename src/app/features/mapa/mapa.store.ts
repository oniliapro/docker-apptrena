import { Injectable, computed, inject, signal } from '@angular/core';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { hojeIso } from '../../core/utils/formato';
import { ChaveTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { gerarId } from '../eap/eap-normalize';
import { gerarNumeroPagamento, normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';
import {
  calcularBaseItem,
  calcularFracionado,
  calcularIntegral,
  calcularNotasPorFornecedor,
  obterAlocacoes,
  obterAlocacoesAutomaticas,
} from './mapa-engine';
import { CabecalhoMapa, Fornecedor, ItemMapa } from './mapa.models';

/** Mesma chave de storage usada por `PagamentosStore` — ver pagamentos.store.ts. */
const chavePagamentos = (obraId: string) => `controleObra.pagamentos.v1.obra-${obraId}`;

/** Chave da ponte chave-valor onde o cadastro de Responsáveis é gravado. */
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

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

  /** Id da obra da rota — fallback da EAP de etapas quando não há cliente escolhido. */
  private obraIdDaRota = '';

  /** Todas as obras cadastradas — fonte do select de Cliente e da EAP por cliente. */
  private readonly obras = signal<Obra[]>([]);

  /** Nomes de cliente distintos, das obras cadastradas (revisão 31/07/2026). */
  readonly clientesDisponiveis = computed(() => {
    const nomes = this.obras()
      .map((o) => (o.cliente ?? '').trim())
      .filter((nome) => nome.length > 0);
    return Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  /** Nomes do cadastro de Responsáveis que estão ativos. */
  readonly responsaveisAtivos = signal<string[]>([]);

  /**
   * Etapas (linhas da EAP) da obra do cliente selecionado no cabeçalho.
   *
   * Guarda o `id` da linha da EAP junto do rótulo: até 03/08/2026 só o
   * rótulo era guardado, e o item do mapa ficava sem `eapId` — por isso os
   * pagamentos gerados nasciam sem etapa e não entravam no "Realizado" da
   * EAP.
   */
  readonly etapasDisponiveis = signal<{ id: string; rotulo: string }[]>([]);

  readonly cabecalho = signal<CabecalhoMapa>({
    numeroMapa: '',
    descricao: '',
    cliente: '',
    responsavelObra: '',
    responsavelMapa: '',
    data: '',
    freteParticular: 0,
    modoManual: false,
    isConfirmed: false,
    confirmedAt: '',
  });

  readonly fornecedores = signal<Fornecedor[]>([]);
  readonly itens = signal<ItemMapa[]>([]);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly gerandoPagamento = signal(false);
  /** Mensagem do resultado da última tentativa de gerar pagamento — null limpa o aviso. */
  readonly resultadoGerarPagamento = signal<string | null>(null);

  // ---- Derivados dos cálculos ----
  readonly alocacoes = computed(() =>
    obterAlocacoes(this.itens(), this.fornecedores(), this.cabecalho().modoManual),
  );

  readonly alocacoesAutomaticas = computed(() =>
    obterAlocacoesAutomaticas(this.itens(), this.fornecedores()),
  );

  /** Notas do cenário escolhido (manual ou automático). */
  readonly notas = computed(() =>
    calcularNotasPorFornecedor(
      this.alocacoes(),
      this.itens(),
      this.fornecedores(),
      true,
      this.fornecedores().map(() => 0),
    ),
  );

  readonly fracionado = computed(() =>
    calcularFracionado(this.itens(), this.fornecedores(), this.cabecalho().modoManual),
  );

  readonly integral = computed(() => calcularIntegral(this.itens(), this.fornecedores()));

  /**
   * Melhor cenário integral: o menor total entre os fornecedores que
   * conseguem atender o pedido inteiro. Zero significa que nenhum
   * cotou tudo.
   */
  readonly melhorIntegral = computed(() => {
    const validos = this.integral().filter((v) => v > 0);
    return validos.length ? Math.min(...validos) : 0;
  });

  /** Total do cenário fracionado, somando as notas e o frete particular. */
  readonly totalFracionado = computed(
    () => this.notas().totals.totalNota + (Number(this.cabecalho().freteParticular) || 0),
  );

  // ------------------------------------------------------------------
  /**
   * `mapaId` é o id do registro em `/mapas` — obrigatório desde a migração pro
   * relacional. `obraId` (rota /obras/:id/mapas/:mapaId) só serve aqui para
   * ter uma EAP de referência antes mesmo de o cabeçalho carregar (revisão
   * 31/07/2026: dropdowns de Cliente/Responsável/Etapa passaram a vir de
   * dados reais, em vez das listas fixas de mapa.dados.ts).
   */
  carregar(mapaId: string, obraId: string): void {
    this.mapaId = mapaId;
    this.obraIdDaRota = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterMapa(mapaId).subscribe({
      next: (mapa) => {
        this.aplicar(mapa as Record<string, unknown>);
        this.carregando.set(false);
        // A EAP de etapas segue o cliente já salvo no mapa; se não houver
        // nenhum ainda (mapa novo), cai para a EAP da própria obra.
        this.carregarEapDoCliente(this.cabecalho().cliente || null, obraId);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o mapa.');
        this.carregando.set(false);
      },
    });

    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);
        // A lista de obras pode chegar depois do mapa (ou antes) — refaz a
        // busca da EAP agora que dá pra achar a obra do cliente certo.
        this.carregarEapDoCliente(this.cabecalho().cliente || null, obraId);
      },
      error: () => undefined,
    });

    this.armazenamento.ler(CHAVE_RESPONSAVEIS).subscribe({
      next: (bruto) => this.responsaveisAtivos.set(this.extrairResponsaveisAtivos(bruto)),
      error: () => undefined,
    });
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

  /**
   * Busca a EAP da obra do cliente escolhido, para alimentar o select de
   * Etapa dos itens. Sem cliente escolhido (ou sem obra encontrada para
   * ele), cai para a EAP da própria obra do mapa — melhor do que ficar sem
   * opção nenhuma.
   */
  private carregarEapDoCliente(clienteNome: string | null, obraIdDaRota: string): void {
    const obraDoCliente = clienteNome
      ? this.obras().find((o) => (o.cliente ?? '').trim() === clienteNome.trim())
      : undefined;
    const obraId = obraDoCliente?.id || obraIdDaRota;
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
      },
      error: () => this.etapasDisponiveis.set([]),
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
      // O backend devolve data ISO completa (ex.: 2026-02-12T00:00:00.000000Z);
      // o <input type="date"> só aceita AAAA-MM-DD.
      data: String(mapa['data_finalizacao'] ?? '').slice(0, 10),
      freteParticular: Number(mapa['frete_particular']) || 0,
      modoManual: Boolean(mapa['modo_manual']),
      isConfirmed: Boolean(mapa['is_confirmed']),
      confirmedAt: String(mapa['confirmed_at'] ?? '').slice(0, 10),
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
    this.salvando.set(true);

    const fornecedores = this.fornecedores();
    const cabecalho = this.cabecalho();

    const payload = {
      numero_mapa: cabecalho.numeroMapa,
      descricao: cabecalho.descricao,
      cliente: cabecalho.cliente,
      responsavel_obra: cabecalho.responsavelObra,
      responsavel_mapa: cabecalho.responsavelMapa,
      data_finalizacao: cabecalho.data || null,
      frete_particular: cabecalho.freteParticular,
      modo_manual: cabecalho.modoManual,
      is_confirmed: cabecalho.isConfirmed,
      confirmed_at: cabecalho.confirmedAt || null,
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

    this.api.atualizarMapa(this.mapaId, payload).subscribe({
      next: (mapa) => {
        // Fornecedores/itens recém-criados só ganham id de verdade na
        // resposta — reaplica pra manter os índices corretos na próxima
        // gravação (ex.: fornecedorEscolhidoIndex depende de ordem estável,
        // não de id, então isso é só higiene, não corrige um bug).
        this.aplicar(mapa as Record<string, unknown>);
        this.salvando.set(false);
      },
      error: () => this.salvando.set(false),
    });
  }

  /**
   * Total do mapa (a nota fracionada, com o frete particular somado) —
   * gravado em `total_mapa` só pra alimentar a coluna "Total" da lista de
   * mapas da obra (`MapasObra`). Até 03/08/2026 esse campo nunca era
   * enviado, então a coluna sempre mostrava R$ 0,00 mesmo em mapas com
   * itens e preços preenchidos. Mesma conta de `montarPagamentosPorFornecedor`
   * — desconto real de cada fornecedor, não o zero usado no computed
   * `notas` (que é de propósito, para a tabela de comparação de cenários).
   */
  private calcularTotalGeral(): number {
    const itens = this.itens();
    const fornecedores = this.fornecedores();
    const cabecalho = this.cabecalho();
    const alocacoes = obterAlocacoes(itens, fornecedores, cabecalho.modoManual);
    const notas = calcularNotasPorFornecedor(
      alocacoes,
      itens,
      fornecedores,
      true,
      fornecedores.map((f) => f.desconto),
    );
    return notas.totals.totalNota + (Number(cabecalho.freteParticular) || 0);
  }

  // ------------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------------
  atualizarCabecalho<K extends keyof CabecalhoMapa>(campo: K, valor: CabecalhoMapa[K]): void {
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();

    // Trocar o cliente muda de qual obra vem a EAP usada nas etapas dos itens.
    if (campo === 'cliente') {
      this.carregarEapDoCliente(String(valor) || null, this.obraIdDaRota);
    }
  }

  /**
   * Finaliza (ou reabre) o mapa — mesmo padrão de `EapStore.alternarConfirmacao()`.
   * Enquanto não finalizado, a tela permanece editável e os botões de
   * Gerar PDF / Gerar Pagamento ficam desabilitados.
   */
  alternarConfirmacao(): void {
    this.cabecalho.update((c) => ({
      ...c,
      isConfirmed: !c.isConfirmed,
      confirmedAt: !c.isConfirmed ? new Date().toISOString().slice(0, 10) : '',
    }));
    this.salvar();
  }

  // ------------------------------------------------------------------
  // Gerar Pagamento
  // ------------------------------------------------------------------
  /**
   * Cria um Pagamento por fornecedor vencedor do mapa (agrupando os itens
   * que cada um ganhou, considerando modo manual/escolha por item — a
   * mesma lógica de `alocacoes`). Só chamado com o mapa finalizado.
   *
   * Pagamentos vivem na ponte chave-valor (`PagamentosStore` ainda não
   * migrou pro relacional — ver o comentário lá), então esta função lê e
   * grava direto na mesma chave, sem depender de injetar aquele store
   * (cada aba tem o seu, isolado por obra).
   *
   * Idempotente: rodar de novo substitui os pagamentos "pendente" já
   * gerados por este mapa (reflete preços/escolhas atuais), mas nunca
   * mexe num que o usuário já confirmou na aba Pagamentos — pra esse
   * fornecedor, simplesmente não gera de novo.
   */
  gerarPagamentos(): void {
    if (!this.obraIdDaRota || !this.mapaId) return;

    this.gerandoPagamento.set(true);
    this.resultadoGerarPagamento.set(null);

    const obraId = this.obraIdDaRota;
    const chave = chavePagamentos(obraId);

    this.armazenamento.ler(chave).subscribe({
      next: (bruto) => {
        const { header, pagamentos } = this.interpretarPagamentos(bruto);

        const doMapa = (p: Pagamento) =>
          p.origem?.tipo === 'mapa' && p.origem?.refId === this.mapaId;

        const fornecedoresConfirmados = new Set(
          pagamentos.filter((p) => doMapa(p) && p.status === 'confirmado').map((p) => p.fornecedor),
        );
        // Mantém tudo que não é um "pendente" deste mapa — os confirmados
        // deste mapa ficam, os pendentes antigos deste mapa são
        // substituídos pelos recém-calculados.
        const listaBase = pagamentos.filter((p) => !doMapa(p) || p.status === 'confirmado');

        const numerosEmUso = [...pagamentos];
        const novos = this.montarPagamentosPorFornecedor(fornecedoresConfirmados, numerosEmUso, header);

        if (!novos.length) {
          this.gerandoPagamento.set(false);
          this.resultadoGerarPagamento.set(
            fornecedoresConfirmados.size
              ? 'Todos os fornecedores deste mapa já têm pagamento confirmado — nada novo para gerar.'
              : 'Nenhum item com fornecedor vencedor para gerar pagamento.',
          );
          return;
        }

        const listaFinal = [...listaBase, ...novos];
        const payload = { header, pagamentos: listaFinal };

        this.armazenamento.gravar(chave, JSON.stringify(payload)).subscribe({
          next: () => {
            this.gerandoPagamento.set(false);
            this.resultadoGerarPagamento.set(
              `${novos.length} pagamento(s) gerado(s) — confira na aba Pagamentos da obra.`,
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

  private interpretarPagamentos(bruto: string | null): {
    header: Record<string, unknown>;
    pagamentos: Pagamento[];
  } {
    if (!bruto) return { header: {}, pagamentos: [] };
    try {
      const dados = JSON.parse(bruto);
      const header = (dados?.header ?? {}) as Record<string, unknown>;
      const lista = Array.isArray(dados?.pagamentos) ? dados.pagamentos : [];
      return {
        header,
        pagamentos: lista.map((p: Record<string, unknown>) => normalizarPagamento(p)),
      };
    } catch {
      return { header: {}, pagamentos: [] };
    }
  }

  /**
   * Um Pagamento por fornecedor que ganhou algum item, pulando quem já
   * tem pagamento confirmado deste mesmo mapa. `numerosEmUso` acumula os
   * pagamentos já numerados (existentes + os recém-criados nesta mesma
   * chamada) para não repetir número de sequência.
   */
  private montarPagamentosPorFornecedor(
    fornecedoresConfirmados: Set<string>,
    numerosEmUso: Pagamento[],
    header: Record<string, unknown>,
  ): Pagamento[] {
    const itens = this.itens();
    const fornecedores = this.fornecedores();
    const cabecalho = this.cabecalho();
    const alocacoes = obterAlocacoes(itens, fornecedores, cabecalho.modoManual);
    const notas = calcularNotasPorFornecedor(
      alocacoes,
      itens,
      fornecedores,
      true,
      fornecedores.map((f) => f.desconto),
    );

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

    fornecedores.forEach((fornecedor, si) => {
      const itensDoFornecedor = itensPorFornecedor.get(si);
      if (!itensDoFornecedor?.length) return;
      if (fornecedoresConfirmados.has(fornecedor.nome)) return;

      const nota = notas.bySupplier[si];
      if (!nota?.used || !(nota.totalNota > 0)) return;

      const linhas = itensDoFornecedor.map((item) => ({
        id: gerarId(),
        descricao: item.desc,
        tipo: item.tipo || '',
        eapId: item.eapId || '',
        valor: calcularBaseItem(item, si),
        modoValor: 'valor' as const,
      }));

      // Reconcilia com o total real da nota (imposto + frete − desconto),
      // sem misturar isso no custo de cada item — assim a coluna
      // "Realizado" da EAP recebe só o custo direto, comparável ao
      // "Orçado" (que também é pré-imposto).
      const somaLinhas = linhas.reduce((soma, l) => soma + l.valor, 0);
      const ajuste = nota.totalNota - somaLinhas;
      if (Math.abs(ajuste) > 0.005) {
        linhas.push({
          id: gerarId(),
          descricao: 'Impostos, frete e desconto da nota',
          tipo: '',
          eapId: '',
          valor: ajuste,
          modoValor: 'valor' as const,
        });
      }

      const pagamento: Pagamento = {
        id: gerarId(),
        numeroPagamento: gerarNumeroPagamento(numerosEmUso),
        obraNumber: String(header['obraNumber'] ?? ''),
        dataSolicitacao: hoje,
        dataPagamento: '',
        fornecedor: fornecedor.nome,
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

  // ------------------------------------------------------------------
  // Fornecedores
  // ------------------------------------------------------------------
  adicionarFornecedor(): void {
    this.fornecedores.update((lista) => [
      ...lista,
      { nome: '', contato: '', ativo: true, imposto: 0, frete: 0, desconto: 0 },
    ]);
    // Cada item passa a ter uma casa a mais no array de preços.
    this.itens.update((lista) => lista.map((i) => ({ ...i, unit: [...i.unit, 0] })));
    this.salvar();
  }

  atualizarFornecedor(indice: number, alteracao: Partial<Fornecedor>): void {
    this.fornecedores.update((lista) =>
      lista.map((f, i) => (i === indice ? { ...f, ...alteracao } : f)),
    );
    this.salvar();
  }

  removerFornecedor(indice: number): void {
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
  adicionarItem(): void {
    this.itens.update((lista) => [
      ...lista,
      {
        id: gerarId(),
        desc: '',
        qtde: 0,
        unid: '',
        unit: this.fornecedores().map(() => 0),
        tipo: '',
        eapId: '',
        etapa: '',
        choice: null,
      },
    ]);
    this.salvar();
  }

  atualizarItem(id: string, alteracao: Partial<ItemMapa>): void {
    this.itens.update((lista) => lista.map((i) => (i.id === id ? { ...i, ...alteracao } : i)));
    this.salvar();
  }

  atualizarPreco(id: string, indiceFornecedor: number, valor: number): void {
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
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id
          ? { ...item, choice: item.choice === indiceFornecedor ? null : indiceFornecedor }
          : item,
      ),
    );
    this.salvar();
  }

  removerItem(id: string): void {
    this.itens.update((lista) => lista.filter((i) => i.id !== id));
    this.salvar();
  }

  readonly tiposCusto = TIPOS_CUSTO;
}
