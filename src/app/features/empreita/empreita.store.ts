import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { ChaveTipo, ItemEap, TIPOS_CUSTO } from '../eap/eap.models';
import { gerarId, normalizarItemEap } from '../eap/eap-normalize';
import {
  calcularLinhaEmpreita,
  calcularOrcadoDaEap,
  calcularTotaisEmpreita,
  obterTiposIncluidos,
} from './empreita-engine';
import { CabecalhoEapSnapshot, CabecalhoEmpreita, ItemEmpreita } from './empreita.models';

/**
 * Ids de tipos_custo (tabela seed, ver TiposCustoSeeder.php) — fixos,
 * usados só para traduzir os relacionamentos medicoesPorTipo/
 * contratoPorTipo do EmpreitaController (que guardam um `tipo_custo_id`
 * por linha) de volta para o formato `Record<chave, valor>` que a tela
 * usa.
 */
const CHAVE_POR_ID: Record<number, ChaveTipo> = {
  1: 'material',
  2: 'maoDeObra',
  3: 'equipamento',
  4: 'outros',
  5: 'administracao',
};

/**
 * Estado da Empreita.
 *
 * Até 31/07/2026 persistia na ponte chave-valor, uma empreita por obra.
 * Migrado para o endpoint relacional `/empreitas/{id}` porque uma obra
 * pode ter VÁRIAS empreitas (contratos com empreiteiros diferentes), não
 * só uma — cada empreita agora é seu próprio registro, criado pela lista
 * `EmpreitasObra`.
 *
 * Depende da EAP: é o orçado de cada item que entra como referência de
 * comparação (o contrato em si é lançado à mão, categoria a categoria —
 * task #45). Por isso carrega os dois — e o cabeçalho da EAP também,
 * porque o BDI global entra na composição do orçado.
 */
@Injectable()
export class EmpreitaStore {
  private readonly api = inject(ApiService);

  /** Id da empreita atual — definido por `carregar()`, usado em toda gravação. */
  private empreitaId = '';

  readonly cabecalho = signal<CabecalhoEmpreita>({
    numeroEmpreita: '',
    descricaoEmpreita: '',
    obraNumber: '',
    empreiteiro: '',
    data: '',
    typesIncluded: {},
  });

  readonly itens = signal<ItemEmpreita[]>([]);
  readonly itensEap = signal<ItemEap[]>([]);
  readonly cabecalhoEap = signal<CabecalhoEapSnapshot | null>(null);

  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly tiposCusto = TIPOS_CUSTO;

  /** Categorias consideradas nesta empreita. */
  readonly tipos = computed(() => obterTiposIncluidos(this.cabecalho()));

  /** Orçado da EAP por id, com BDI distribuído — a base de tudo. */
  readonly orcado = computed(() => calcularOrcadoDaEap(this.itensEap(), this.cabecalhoEap()));

  readonly linhas = computed(() =>
    this.itens().map((item) => calcularLinhaEmpreita(item, this.cabecalho(), this.orcado())),
  );

  readonly totais = computed(() =>
    calcularTotaisEmpreita(this.itens(), this.cabecalho(), this.orcado()),
  );

  /** Alguma linha com medição retrocedendo — bloqueia o fechamento. */
  readonly temMedicaoInvalida = computed(() => this.linhas().some((l) => l.reducaoInvalida));

  /** Itens da EAP que podem ser vinculados (com descrição). */
  readonly opcoesEap = computed(() =>
    this.itensEap().filter((i) => i.eap || i.desc),
  );

  // ------------------------------------------------------------------
  /**
   * `empreitaId` é o id do registro em `/empreitas`; `obraId` continua
   * sendo necessário só para buscar a EAP de referência (a empreita já
   * carrega o seu próprio `obra_id`, mas o parâmetro de rota é mais
   * direto e sempre disponível).
   */
  carregar(empreitaId: string, obraId: string): void {
    this.empreitaId = empreitaId;
    this.carregando.set(true);
    this.erro.set(null);

    this.api.obterEmpreita(empreitaId).subscribe({
      next: (empreita) => {
        this.aplicar(empreita as Record<string, unknown>);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar a empreita.');
        this.carregando.set(false);
      },
    });

    this.carregarEap(obraId);
  }

  /**
   * A EAP entra como referência. Falha ao carregá-la não derruba a tela:
   * sem orçado, a distribuição entre categorias passa a ser igualitária,
   * que é o comportamento previsto na engine.
   */
  private carregarEap(obraId: string): void {
    this.api.obterEap(obraId).subscribe({
      next: (payload) => {
        const brutos = payload.eapItems;
        if (Array.isArray(brutos)) {
          this.itensEap.set(brutos.map((i) => normalizarItemEap(i as Record<string, unknown>)));
        }

        const cabecalho = payload.header ?? {};
        this.cabecalhoEap.set({
          mapNumber: String(cabecalho['mapNumber'] ?? ''),
          bdiMode: cabecalho['bdiMode'] === 'value' ? 'value' : 'pct',
          bdiPercent: Number(cabecalho['bdiPercent']) || 0,
          bdiValue: Number(cabecalho['bdiValue']) || 0,
        });
      },
      error: () => undefined,
    });
  }

  private aplicar(empreita: Record<string, unknown>): void {
    const tiposIncluidosBrutos = Array.isArray(empreita['tiposIncluidos'])
      ? (empreita['tiposIncluidos'] as Record<string, unknown>[])
      : [];
    const typesIncluded = TIPOS_CUSTO.reduce<Partial<Record<ChaveTipo, boolean>>>((acc, t) => {
      acc[t.chave] = false;
      return acc;
    }, {});
    for (const linha of tiposIncluidosBrutos) {
      const chave = CHAVE_POR_ID[Number(linha['tipo_custo_id'])];
      if (chave) typesIncluded[chave] = linha['ativo'] !== false;
    }

    this.cabecalho.set({
      numeroEmpreita: String(empreita['numero_empreita'] ?? ''),
      descricaoEmpreita: String(empreita['descricao_empreita'] ?? ''),
      obraNumber: String(empreita['obra_number'] ?? ''),
      empreiteiro: String(empreita['empreiteiro'] ?? ''),
      data: String(empreita['medicao_date'] ?? '').slice(0, 10),
      typesIncluded,
    });

    const itensBrutos = Array.isArray(empreita['itens'])
      ? (empreita['itens'] as Record<string, unknown>[])
      : [];
    this.itens.set(itensBrutos.map((i) => this.normalizarItem(i)));
  }

  private normalizarItem(bruto: Record<string, unknown>): ItemEmpreita {
    const medicoesPorTipo = Array.isArray(bruto['medicoesPorTipo'])
      ? (bruto['medicoesPorTipo'] as Record<string, unknown>[])
      : [];
    const contratoPorTipo = Array.isArray(bruto['contratoPorTipo'])
      ? (bruto['contratoPorTipo'] as Record<string, unknown>[])
      : [];

    const medicaoAcumByType: Record<string, number | null> = {};
    const medicaoAtualByType: Record<string, number | null> = {};
    for (const linha of medicoesPorTipo) {
      const chave = CHAVE_POR_ID[Number(linha['tipo_custo_id'])];
      if (!chave) continue;
      medicaoAcumByType[chave] = Number(linha['medicao_acum']) || 0;
      const atual = linha['medicao_atual'];
      medicaoAtualByType[chave] = atual === null || atual === undefined ? null : Number(atual) || 0;
    }

    const contratoEmpPorTipo: Record<string, number | null> = {};
    const contratoReservaPorTipo: Record<string, number | null> = {};
    for (const linha of contratoPorTipo) {
      const chave = CHAVE_POR_ID[Number(linha['tipo_custo_id'])];
      if (!chave) continue;
      contratoEmpPorTipo[chave] = Number(linha['contrato_emp']) || 0;
      contratoReservaPorTipo[chave] = Number(linha['contrato_reserva']) || 0;
    }

    return {
      id: bruto['id'] ? String(bruto['id']) : gerarId(),
      desc: String(bruto['descricao'] ?? ''),
      eapId: bruto['eap_item_id'] ? String(bruto['eap_item_id']) : '',
      contratoEmpPorTipo,
      contratoReservaPorTipo,
      medicaoAcumByType,
      medicaoAtualByType,
    };
  }

  salvar(): void {
    if (!this.empreitaId) return;
    this.salvando.set(true);

    const cabecalho = this.cabecalho();

    const payload = {
      numero_empreita: cabecalho.numeroEmpreita,
      descricao_empreita: cabecalho.descricaoEmpreita,
      obra_number: cabecalho.obraNumber,
      empreiteiro: cabecalho.empreiteiro,
      medicao_date: cabecalho.data || null,
      tipos_incluidos: cabecalho.typesIncluded,
      itens: this.itens().map((item) => ({
        id: item.id,
        desc: item.desc,
        eapId: item.eapId || null,
        contratoEmpPorTipo: item.contratoEmpPorTipo,
        contratoReservaPorTipo: item.contratoReservaPorTipo,
        medicaoAcumByType: item.medicaoAcumByType,
        medicaoAtualByType: item.medicaoAtualByType,
      })),
    };

    this.api.atualizarEmpreita(this.empreitaId, payload).subscribe({
      next: (empreita) => {
        this.aplicar(empreita as Record<string, unknown>);
        this.salvando.set(false);
      },
      error: () => this.salvando.set(false),
    });
  }

  // ------------------------------------------------------------------
  atualizarCabecalho<K extends keyof CabecalhoEmpreita>(
    campo: K,
    valor: CabecalhoEmpreita[K],
  ): void {
    this.cabecalho.update((c) => ({ ...c, [campo]: valor }));
    this.salvar();
  }

  alternarTipo(chave: ChaveTipo): void {
    this.cabecalho.update((c) => ({
      ...c,
      typesIncluded: { ...c.typesIncluded, [chave]: !c.typesIncluded[chave] },
    }));
    this.salvar();
  }

  adicionarItem(): void {
    this.itens.update((lista) => [
      ...lista,
      {
        id: gerarId(),
        desc: '',
        eapId: '',
        contratoEmpPorTipo: {},
        contratoReservaPorTipo: {},
        medicaoAcumByType: {},
        medicaoAtualByType: {},
      },
    ]);
    this.salvar();
  }

  atualizarItem(id: string, alteracao: Partial<ItemEmpreita>): void {
    this.itens.update((lista) => lista.map((i) => (i.id === id ? { ...i, ...alteracao } : i)));
    this.salvar();
  }

  atualizarMedicao(
    id: string,
    campo: 'medicaoAcumByType' | 'medicaoAtualByType',
    tipo: ChaveTipo,
    valor: number | null,
  ): void {
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, [campo]: { ...item[campo], [tipo]: valor } } : item,
      ),
    );
    this.salvar();
  }

  /** Lança o contrato (empreita ou reserva) de uma categoria de custo, à mão. */
  atualizarContrato(
    id: string,
    campo: 'contratoEmpPorTipo' | 'contratoReservaPorTipo',
    tipo: ChaveTipo,
    valor: number | null,
  ): void {
    this.itens.update((lista) =>
      lista.map((item) =>
        item.id === id ? { ...item, [campo]: { ...item[campo], [tipo]: valor } } : item,
      ),
    );
    this.salvar();
  }

  removerItem(id: string): void {
    this.itens.update((lista) => lista.filter((i) => i.id !== id));
    this.salvar();
  }

  /**
   * Fecha o período: o que foi medido agora vira o novo acumulado, e a
   * medição atual é zerada para o próximo ciclo.
   */
  fecharPeriodo(): void {
    this.itens.update((lista) =>
      lista.map((item) => {
        const novoAcumulado = { ...item.medicaoAcumByType };
        for (const tipo of this.tipos()) {
          const atual = item.medicaoAtualByType?.[tipo];
          if (atual !== null && atual !== undefined) novoAcumulado[tipo] = atual;
        }
        return { ...item, medicaoAcumByType: novoAcumulado, medicaoAtualByType: {} };
      }),
    );
    this.salvar();
  }
}
