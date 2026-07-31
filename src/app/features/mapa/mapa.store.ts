import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { ChaveTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { gerarId } from '../eap/eap-normalize';
import {
  calcularFracionado,
  calcularIntegral,
  calcularNotasPorFornecedor,
  obterAlocacoes,
  obterAlocacoesAutomaticas,
} from './mapa-engine';
import { CabecalhoMapa, Fornecedor, ItemMapa } from './mapa.models';

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

  /** Id do mapa atual — definido por `carregar(mapaId)`, usado em toda gravação. */
  private mapaId = '';

  readonly cabecalho = signal<CabecalhoMapa>({
    numeroMapa: '',
    descricao: '',
    cliente: '',
    responsavelObra: '',
    responsavelMapa: '',
    data: '',
    freteParticular: 0,
    modoManual: false,
  });

  readonly fornecedores = signal<Fornecedor[]>([]);
  readonly itens = signal<ItemMapa[]>([]);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

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
  /** `mapaId` é o id do registro em `/mapas` — obrigatório desde a migração pro relacional. */
  carregar(mapaId: string): void {
    this.mapaId = mapaId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterMapa(mapaId).subscribe({
      next: (mapa) => {
        this.aplicar(mapa as Record<string, unknown>);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o mapa.');
        this.carregando.set(false);
      },
    });
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

  // ------------------------------------------------------------------
  // Cabeçalho
  // ------------------------------------------------------------------
  atualizarCabecalho<K extends keyof CabecalhoMapa>(campo: K, valor: CabecalhoMapa[K]): void {
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
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
