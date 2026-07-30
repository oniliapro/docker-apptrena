import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
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
 * Chave por obra da própria empreita — task "obra como contexto"
 * (28/07/2026). A Empreita continua na ponte chave-valor por enquanto
 * (o endpoint relacional `/empreitas` ainda não foi confirmado como
 * pronto pro formato que esta tela usa — ver `INTEGRACAO.md`).
 *
 * A leitura de referência da EAP, por outro lado, já migrou (28/07/2026)
 * pro endpoint relacional `GET /obras/{id}/eap` — ver `carregarEap` —
 * porque é de lá que a EAP de verdade vem desde que `EapStore` também
 * migrou. Continuar lendo a chave antiga aqui mostraria dado órfão.
 */
const chaveEmpreita = (obraId: string) => `controleObra.empreita.v1.obra-${obraId}`;

/**
 * Estado da Empreita.
 *
 * Depende da EAP: é o orçado de cada item que entra como referência de
 * comparação (o contrato em si é lançado à mão, categoria a categoria —
 * task #45). Por isso carrega os dois — e o cabeçalho da EAP também,
 * porque o BDI global entra na composição do orçado.
 */
@Injectable()
export class EmpreitaStore {
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly api = inject(ApiService);

  /** Verdadeiro quando os dados estão indo só para o navegador. */
  readonly modoLocal = this.armazenamento.modoLocal;

  /** Obra atual — definida por `carregar(obraId)`, usada em toda gravação. */
  private obraId = '';

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
  /** `obraId` define de qual obra é a empreita — obrigatório desde a task "obra como contexto". */
  carregar(obraId: string): void {
    this.obraId = obraId;
    this.carregando.set(true);
    this.erro.set(null);

    this.armazenamento.ler(chaveEmpreita(obraId)).subscribe({
      next: (value) => {
        const dados = this.interpretar(value);
        if (dados) this.aplicar(dados);
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

  private aplicar(dados: Record<string, unknown>): void {
    const cabecalho = (dados['header'] ?? {}) as Record<string, unknown>;
    const incluidos = (cabecalho['typesIncluded'] ?? {}) as Record<string, unknown>;

    this.cabecalho.set({
      numeroEmpreita: String(cabecalho['numeroEmpreita'] ?? ''),
      descricaoEmpreita: String(cabecalho['descricaoEmpreita'] ?? ''),
      obraNumber: String(cabecalho['obraNumber'] ?? ''),
      empreiteiro: String(cabecalho['empreiteiro'] ?? ''),
      data: String(cabecalho['data'] ?? ''),
      typesIncluded: TIPOS_CUSTO.reduce<Partial<Record<ChaveTipo, boolean>>>((acc, t) => {
        acc[t.chave] = Boolean(incluidos[t.chave]);
        return acc;
      }, {}),
    });

    const itens = dados['itens'];
    this.itens.set(Array.isArray(itens) ? itens.map((i) => this.normalizarItem(i)) : []);
  }

  private normalizarItem(bruto: unknown): ItemEmpreita {
    const i = (bruto ?? {}) as Record<string, unknown>;
    const lerMedicao = (chave: string) => {
      const origem = (i[chave] ?? {}) as Record<string, unknown>;
      return TIPOS_CUSTO.reduce<Record<string, number | null>>((acc, t) => {
        const valor = origem[t.chave];
        acc[t.chave] = valor === null || valor === undefined ? null : Number(valor) || 0;
        return acc;
      }, {});
    };

    // Compatibilidade: itens salvos antes da task #45 tinham valorEmp/
    // valorReserva únicos, sem categoria. Não distribuímos isso — fica
    // como contrato 0 por categoria, e o usuário lança de novo à mão.
    // (Se um dia quisermos preservar o valor antigo, dá pra somar ele
    // numa categoria "outros", mas isso também seria uma decisão do
    // usuário, não do sistema — por ora fica em branco.)
    return {
      id: i['id'] ? String(i['id']) : gerarId(),
      desc: String(i['desc'] ?? ''),
      eapId: String(i['eapId'] ?? ''),
      contratoEmpPorTipo: lerMedicao('contratoEmpPorTipo'),
      contratoReservaPorTipo: lerMedicao('contratoReservaPorTipo'),
      medicaoAcumByType: lerMedicao('medicaoAcumByType'),
      medicaoAtualByType: lerMedicao('medicaoAtualByType'),
    };
  }

  salvar(): void {
    this.salvando.set(true);

    const payload = { header: this.cabecalho(), itens: this.itens() };

    this.armazenamento.gravar(chaveEmpreita(this.obraId), JSON.stringify(payload)).subscribe({
      next: () => this.salvando.set(false),
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
