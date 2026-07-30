import { Injectable, computed, inject, signal } from '@angular/core';

import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { TIPOS_CUSTO } from '../eap/eap.models';
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
 * Chave por obra — task "obra como contexto" (28/07/2026), mesmo padrão
 * do `chaveEap` em `eap.store.ts`.
 */
const chaveMapa = (obraId: string) => `controleObra.mapa.v1.obra-${obraId}`;

/**
 * Estado do Mapa de Fornecedores.
 *
 * Persiste pela ponte chave-valor do backend, namespaced por obra (ver
 * `chaveMapa`).
 *
 * Os cálculos ficam em `mapa-engine.ts`, verificado contra o original em
 * `verificacao/`.
 */
@Injectable()
export class MapaStore {
  private readonly armazenamento = inject(ArmazenamentoService);

  /** Verdadeiro quando os dados estão indo só para o navegador. */
  readonly modoLocal = this.armazenamento.modoLocal;

  /** Obra atual — definida por `carregar(obraId)`, usada em toda gravação. */
  private obraId = '';

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
  /** `obraId` define de qual obra é o mapa — obrigatório desde a task "obra como contexto". */
  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.armazenamento.ler(chaveMapa(obraId)).subscribe({
      next: (value) => {
        const dados = this.interpretar(value);
        if (dados) this.aplicar(dados);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o mapa.');
        this.carregando.set(false);
      },
    });
  }

  private aplicar(dados: Record<string, unknown>): void {
    const cabecalho = (dados['header'] ?? {}) as Record<string, unknown>;
    this.cabecalho.set({
      numeroMapa: String(cabecalho['numeroMapa'] ?? ''),
      descricao: String(cabecalho['descricao'] ?? ''),
      cliente: String(cabecalho['cliente'] ?? ''),
      responsavelObra: String(cabecalho['responsavelObra'] ?? ''),
      responsavelMapa: String(cabecalho['responsavelMapa'] ?? ''),
      data: String(cabecalho['data'] ?? ''),
      freteParticular: Number(cabecalho['freteParticular']) || 0,
      modoManual: Boolean(cabecalho['modoManual']),
    });

    const fornecedores = dados['fornecedores'];
    this.fornecedores.set(
      Array.isArray(fornecedores) ? fornecedores.map((f) => this.normalizarFornecedor(f)) : [],
    );

    const itens = dados['itens'];
    this.itens.set(Array.isArray(itens) ? itens.map((i) => this.normalizarItem(i)) : []);
  }

  private normalizarFornecedor(bruto: unknown): Fornecedor {
    const f = (bruto ?? {}) as Record<string, unknown>;
    return {
      // `fornecedor` é o nome do campo no formato antigo.
      nome: String(f['nome'] ?? f['fornecedor'] ?? ''),
      contato: String(f['contato'] ?? ''),
      ativo: f['ativo'] !== false,
      imposto: Number(f['imposto']) || 0,
      frete: Number(f['frete']) || 0,
      desconto: Number(f['desconto']) || 0,
    };
  }

  private normalizarItem(bruto: unknown): ItemMapa {
    const i = (bruto ?? {}) as Record<string, unknown>;
    const escolha = i['choice'];

    return {
      id: i['id'] ? String(i['id']) : gerarId(),
      desc: String(i['desc'] ?? ''),
      qtde: Number(i['qtde']) || 0,
      unid: String(i['unid'] ?? ''),
      unit: Array.isArray(i['unit']) ? (i['unit'] as unknown[]).map((v) => Number(v) || 0) : [],
      tipo: (String(i['tipo'] ?? '') || '') as ItemMapa['tipo'],
      eapId: String(i['eapId'] ?? ''),
      etapa: String(i['etapa'] ?? ''),
      choice: Number.isFinite(Number(escolha)) && escolha !== null ? Number(escolha) : null,
    };
  }

  salvar(): void {
    this.salvando.set(true);

    const payload = {
      header: this.cabecalho(),
      fornecedores: this.fornecedores(),
      itens: this.itens(),
    };

    this.armazenamento.gravar(chaveMapa(this.obraId), JSON.stringify(payload)).subscribe({
      next: () => this.salvando.set(false),
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

  private interpretar(bruto: string | null): Record<string, unknown> | null {
    if (!bruto) return null;
    try {
      const dados = JSON.parse(bruto);
      return typeof dados === 'object' && dados !== null ? (dados as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
