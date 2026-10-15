import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { MedicaoPayload, Obra, rotuloStatusObra } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../../core/utils/formato';
import { calcularCacheOrcado } from '../../eap/eap-engine';
import {
  aplicarNumeracaoAutomatica,
  cabecalhoVazio,
  normalizarCabecalho,
  normalizarItemEap,
} from '../../eap/eap-normalize';
import { CabecalhoObra, ChaveTipo, ItemEap, TIPOS_CUSTO } from '../../eap/eap.models';
import { pctParaValor } from '../../medicoes/medicao-engine';
import { normalizarPagamento } from '../../pagamentos/pagamentos-calc';

/** Uma categoria a mais que `TIPOS_CUSTO`: itens sem `tipo` reconhecido caem aqui em vez de sumir da soma (ver docblock de `baldeCategoria`). */
type BaldeCategoria = ChaveTipo | 'semCategoria';

/** Categorias + a coluna "Total" — mesma chave usada tanto pro card em Detalhar quanto pro total geral. */
type ChaveColuna = BaldeCategoria | 'total';

const CATEGORIAS_RELATORIO: ReadonlyArray<{ chave: BaldeCategoria; rotulo: string }> = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
  { chave: 'semCategoria', rotulo: 'S/ categoria' },
];

const COLUNAS_RELATORIO: readonly ChaveColuna[] = [...CATEGORIAS_RELATORIO.map((c) => c.chave), 'total'];

/** Orçado/Realizado/Saldo/Medido de uma categoria (ou do total) — nessa ordem, que é a do mockup do Lucas (14/09/2026). */
interface Metricas {
  orcado: number;
  realizado: number;
  saldo: number;
  medido: number;
}

function metricasZeradas(): Metricas {
  return { orcado: 0, realizado: 0, saldo: 0, medido: 0 };
}

/** `Record<ChaveColuna, Metricas>` já zerado, uma entrada por categoria + "total". */
function mapaDeColunasZerado(): Record<ChaveColuna, Metricas> {
  return COLUNAS_RELATORIO.reduce(
    (acc, chave) => ({ ...acc, [chave]: metricasZeradas() }),
    {} as Record<ChaveColuna, Metricas>,
  );
}

interface LinhaRelatorio {
  obraId: string;
  obraNumber: string;
  obraNome: string;
  cliente: string;
  dataBase: string;
  statusObra: string;
  statusEap: string;
  /** Só itens/pagamentos/medições SEM a EAP marcada como "serviço adicional" (fora do escopo original). */
  semAdicionais: Record<ChaveColuna, Metricas>;
  /** Só os marcados como adicional. */
  somenteAdicionais: Record<ChaveColuna, Metricas>;
  /** `semAdicionais + somenteAdicionais` — usado quando "Segmentar adicionais" está desligado. */
  geral: Record<ChaveColuna, Metricas>;
}

/**
 * Tipo vazio/desconhecido cai em "S/ categoria" — em vez de simplesmente
 * desaparecer da soma, como a tela de Relatórios de uma obra já faz hoje
 * (`relatorios.ts::realizado`, `if (item.tipo && item.tipo in totais)`).
 */
function baldeCategoria(tipo: string | undefined | null): BaldeCategoria {
  if (
    tipo === 'material' ||
    tipo === 'maoDeObra' ||
    tipo === 'equipamento' ||
    tipo === 'outros' ||
    tipo === 'administracao'
  ) {
    return tipo;
  }
  return 'semCategoria';
}

/**
 * Lista "Relatórios" — Orçado x Realizado x Saldo x Medido de várias obras, por
 * categoria (15/10/2026: extraída do dashboard para também virar a página
 * "Relatórios" do menu lateral, com TODAS as obras).
 *
 * Recebe as obras que deve mostrar (`obras`): o dashboard passa só as primeiras
 * em aberto (é um card), a página passa todas. Cada obra vira uma linha — a
 * mesma árvore de colunas dos dois lugares, de propósito, para a página ser
 * "igual à lista do card".
 *
 * `linkVerTodos`, quando informado, mostra o "Ver todos →" no cabeçalho do card.
 */
@Component({
  selector: 'app-lista-relatorios',
  imports: [RouterLink],
  templateUrl: './lista-relatorios.html',
  styleUrl: './lista-relatorios.scss',
})
export class ListaRelatorios {
  private readonly api = inject(ApiService);

  readonly obras = input.required<Obra[]>();
  /** O pai ainda está buscando a lista de obras (mostra "Carregando…" antes de ter quem calcular). */
  readonly carregandoObras = input(false);
  readonly linkVerTodos = input<string | null>(null);
  readonly tituloVazio = input('Nenhuma obra em aberto.');

  protected readonly formatarMoeda = formatarMoeda;

  /** Cada nova lista de obras recalcula tudo (descarta uma resposta atrasada da lista anterior). */
  private geracao = 0;

  private readonly recalcular = effect(() => {
    const obras = this.obras();
    untracked(() => this.carregarRelatorios(obras));
  });

  protected readonly carregando = computed(() => this.carregandoObras() || this.calculando());
  private readonly calculando = signal(false);

  protected readonly relatorios = signal<LinhaRelatorio[]>([]);
  protected readonly detalharRelatorios = signal(false);
  protected readonly segmentarAdicionais = signal(false);

  /**
   * Orçado (EAP) x Realizado (pagamentos confirmados) x Medido (última
   * medição aprovada), por categoria — mesma lógica de
   * `relatorios.ts` (a tela de Relatórios de UMA obra), rodada aqui pra
   * cada obra do recorte. "Medido" é novo (14/09/2026, decisão do
   * Lucas): valor de cada item na última medição APROVADA, convertido
   * de "% acumulado" pra R$ usando o orçado daquele item (mesma
   * conversão de `medicao-engine.ts::pctParaValor`, já usada na tela de
   * Medição) — não existia antes um "Medido" agregado por categoria em
   * lugar nenhum do sistema.
   */
  private carregarRelatorios(obras: Obra[]): void {
    const minha = ++this.geracao;

    if (!obras.length) {
      this.relatorios.set([]);
      this.calculando.set(false);
      return;
    }

    this.calculando.set(true);

    forkJoin(obras.map((obra) => this.montarLinhaRelatorio(obra))).subscribe((linhas) => {
      if (minha !== this.geracao) return;
      this.relatorios.set(linhas);
      this.calculando.set(false);
    });
  }

  /**
   * Orçado x Realizado x Saldo x Medido, por categoria E por "adicional"
   * (14/09/2026, mockup do Lucas com os botões "Detalhar" e "Segmentar
   * adicionais"): cada item da EAP já tem um `adicional: boolean` de
   * verdade ("Serviço adicional, fora do escopo original") — junta tudo
   * em dois baldes, `semAdicionais`/`somenteAdicionais`, e soma os dois
   * pra formar `geral` (usado quando "Segmentar adicionais" tá
   * desligado). Pagamento e Medição não têm esse flag direto — só dá
   * pra saber olhando de qual item da EAP aquele lançamento veio
   * (`item.eapId`/`item.eapItemId`), por isso os mapas
   * `indicePorEapId`/`itensEap` são a fonte de verdade dos dois.
   */
  private montarLinhaRelatorio(obra: Obra): Observable<LinhaRelatorio> {
    return forkJoin({
      eap: this.api.obterEap(obra.id).pipe(catchError(() => of(null))),
      pagamentos: this.api.listarPagamentos({ obraId: obra.id }).pipe(catchError(() => of([]))),
      medicoes: this.api.listarMedicoes(obra.id).pipe(catchError(() => of([]))),
    }).pipe(
      switchMap(({ eap, pagamentos, medicoes }) => {
        const itensEap = Array.isArray(eap?.eapItems)
          ? aplicarNumeracaoAutomatica(eap!.eapItems.map((i) => normalizarItemEap(i as Record<string, unknown>)))
          : ([] as ItemEap[]);
        const cabecalho: CabecalhoObra = eap ? normalizarCabecalho(eap.header) : cabecalhoVazio();
        const cache = calcularCacheOrcado(itensEap, cabecalho);
        const indicePorEapId = new Map(itensEap.map((item, i) => [item.id, i]));

        const semAdicionais = mapaDeColunasZerado();
        const somenteAdicionais = mapaDeColunasZerado();
        const balde = (adicional: boolean) => (adicional ? somenteAdicionais : semAdicionais);

        // Orçado — soma direto do cache por item (grupos contribuem 0,
        // já são a soma dos filhos, ver `calcularCacheOrcado`), then
        // bucketed por `item.adicional`.
        for (let i = 0; i < itensEap.length; i++) {
          const item = itensEap[i];
          const alvo = balde(item.adicional);
          for (const t of TIPOS_CUSTO) {
            const valor = (cache.directByType[i]?.[t.chave] ?? 0) + (cache.bdiByType[i]?.[t.chave] ?? 0);
            const chave = baldeCategoria(t.chave);
            alvo[chave].orcado += valor;
            alvo['total'].orcado += valor;
          }
        }

        // Realizado — só pagamentos confirmados; item sem `eapId`
        // reconhecido (lançamento manual/legado) cai em "sem adicionais"
        // por padrão, pra não sumir da soma.
        const listaPagamentos = pagamentos
          .map((p) => normalizarPagamento(p as Record<string, unknown>))
          .filter((p) => p.status !== 'pendente');
        for (const pagamento of listaPagamentos) {
          for (const item of pagamento.itens) {
            const valor =
              item.modoValor === 'percentual'
                ? pagamento.valorTotal * ((Number(item.valor) || 0) / 100)
                : Number(item.valor) || 0;
            const indice = item.eapId ? indicePorEapId.get(item.eapId) : undefined;
            const adicional = indice !== undefined ? itensEap[indice].adicional : false;
            const chave = baldeCategoria(item.tipo);
            balde(adicional)[chave].realizado += valor;
            balde(adicional)['total'].realizado += valor;
          }
        }

        // Orçado por item (mesmo índice de `itensEap`) — necessário pra
        // converter o "% medido" de cada item em R$. Lê o snapshot
        // congelado quando existe (mesma regra de
        // `medicao.store.ts::orcadoPorItem` — item medido é sempre um
        // item-base, nunca um grupo, então não precisa replicar a
        // ramificação de grupo daquele arquivo).
        const orcadoPorItem = itensEap.map((item, i) => {
          if (item.orcadoCongelado) return item.orcadoCongelado as Record<ChaveTipo, number>;
          const total: Record<ChaveTipo, number> = {} as Record<ChaveTipo, number>;
          for (const t of TIPOS_CUSTO) {
            total[t.chave] = (cache.directByType[i]?.[t.chave] ?? 0) + (cache.bdiByType[i]?.[t.chave] ?? 0);
          }
          return total;
        });

        const montarMedido = (payload: MedicaoPayload) => {
          for (const item of payload.itens) {
            const indice = indicePorEapId.get(item.eapItemId);
            if (indice === undefined) continue;
            const adicional = itensEap[indice].adicional;
            for (const t of TIPOS_CUSTO) {
              const pct = item.valores[t.chave]?.valor;
              if (!pct) continue;
              const valor = pctParaValor(pct, orcadoPorItem[indice][t.chave] ?? 0);
              const chave = baldeCategoria(t.chave);
              balde(adicional)[chave].medido += valor;
              balde(adicional)['total'].medido += valor;
            }
          }
        };

        const linhaBase: LinhaRelatorio = {
          obraId: obra.id,
          obraNumber: obra.map_number || '',
          obraNome: obra.obra_nome || '(sem nome)',
          cliente: obra.cliente || '—',
          dataBase: obra.data_base ? formatarData(obra.data_base) : '—',
          statusObra: rotuloStatusObra(obra.status),
          statusEap: obra.is_confirmed ? 'Confirmada' : 'Aberta',
          semAdicionais,
          somenteAdicionais,
          geral: mapaDeColunasZerado(),
        };

        const ultimaAprovada = medicoes
          .filter((m) => m.status === 'aprovada')
          .sort((a, b) => (b.dataMedicao ?? '').localeCompare(a.dataMedicao ?? ''))[0];

        if (!ultimaAprovada) {
          return of(this.fecharLinha(linhaBase));
        }

        return this.api.obterMedicao(ultimaAprovada.id).pipe(
          catchError(() => of(null)),
          map((payload) => {
            if (payload) montarMedido(payload);
            return this.fecharLinha(linhaBase);
          }),
        );
      }),
    );
  }

  /** Fecha o Saldo (Orçado − Realizado) de cada balde e soma os dois baldes em `geral`. */
  private fecharLinha(linha: LinhaRelatorio): LinhaRelatorio {
    for (const chave of COLUNAS_RELATORIO) {
      linha.semAdicionais[chave].saldo = linha.semAdicionais[chave].orcado - linha.semAdicionais[chave].realizado;
      linha.somenteAdicionais[chave].saldo =
        linha.somenteAdicionais[chave].orcado - linha.somenteAdicionais[chave].realizado;

      linha.geral[chave] = {
        orcado: linha.semAdicionais[chave].orcado + linha.somenteAdicionais[chave].orcado,
        realizado: linha.semAdicionais[chave].realizado + linha.somenteAdicionais[chave].realizado,
        saldo: linha.semAdicionais[chave].saldo + linha.somenteAdicionais[chave].saldo,
        medido: linha.semAdicionais[chave].medido + linha.somenteAdicionais[chave].medido,
      };
    }
    return linha;
  }

  /** Percentual de uma métrica em relação ao Orçado do mesmo balde/categoria — "Orçado" sempre dá 100%. */
  protected pct(m: Metricas, campo: keyof Metricas): number {
    return m.orcado > 0 ? (m[campo] / m.orcado) * 100 : 0;
  }

  protected formatarPercentual(valor: number): string {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  /** Ordem fixa Orçado → Realizado → Saldo → Medido (mockup do Lucas, 14/09/2026). */
  protected readonly ordemMetricas: ReadonlyArray<{ campo: keyof Metricas; rotulo: string }> = [
    { campo: 'orcado', rotulo: 'Orçado' },
    { campo: 'realizado', rotulo: 'Realizado' },
    { campo: 'saldo', rotulo: 'Saldo' },
    { campo: 'medido', rotulo: 'Medido' },
  ];

  /**
   * Uma "banda" da linha: 1 banda ("Geral") quando "Segmentar
   * adicionais" tá desligado, 2 quando ligado (Sem adicionais /
   * Somente adicionais, a segunda destacada). Cada banda carrega o
   * mapa de todas as colunas (categorias + total) — `colunasParaExibir()`
   * decide quais delas de fato aparecem.
   */
  protected bandasDetalhe(
    linha: LinhaRelatorio,
  ): Array<{ rotulo: string; dados: Record<ChaveColuna, Metricas>; destaque: boolean }> {
    if (!this.segmentarAdicionais()) {
      return [{ rotulo: 'Geral', dados: linha.geral, destaque: false }];
    }
    return [
      { rotulo: 'Sem adicionais', dados: linha.semAdicionais, destaque: false },
      { rotulo: 'Somente adicionais', dados: linha.somenteAdicionais, destaque: true },
    ];
  }

  /**
   * "Detalhar" (14/09/2026, redesenho depois dos 4 mockups definitivos
   * do Lucas) não muda a estrutura da linha — só troca quais colunas
   * aparecem depois do rótulo das métricas: sem Detalhar é só "Total";
   * com Detalhar entra uma coluna por categoria antes do Total.
   */
  protected colunasParaExibir(): ReadonlyArray<{ chave: ChaveColuna; rotulo: string }> {
    const total = { chave: 'total' as const, rotulo: 'Total' };
    return this.detalharRelatorios() ? [...CATEGORIAS_RELATORIO, total] : [total];
  }
}
