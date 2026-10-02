import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { forkJoin, from } from 'rxjs';
import { mergeMap, toArray } from 'rxjs/operators';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { CronogramaObraService } from './cronograma-obra.service';
import { duracaoEfetiva, calcularCronograma, isoParaOrdinal } from './cronograma-obra-engine';
import {
  DependenciaCronograma,
  TarefaCronograma,
  TarefaCronogramaCalculada,
} from './cronograma-obra.models';
import { EditarTarefaCronogramaModal } from './editar-tarefa-cronograma-modal';

type ZoomGantt = 'dia' | 'semana' | 'mes';

/** px por dia, por nível de zoom. */
const LARGURA_DIA_PX: Record<ZoomGantt, number> = { dia: 32, semana: 12, mes: 4 };
const ALTURA_LINHA = 32;
const ALTURA_CABECALHO = 36;
const LARGURA_COLUNAS_FIXAS = 420;

interface LinhaGantt {
  calculado: TarefaCronogramaCalculada;
  linha: number;
  leftPx: number;
  widthPx: number;
}

interface MarcadorGrade {
  leftPx: number;
  rotulo: string;
}

interface SetaGantt {
  id: string;
  d: string;
  critica: boolean;
}

/**
 * Cronograma de obra (CPM — Critical Path Method), 02/10/2026, pedido do
 * Lucas. Todo o cálculo vem de `cronograma-obra-engine.ts` (função pura,
 * testada à parte) — este componente só carrega os dados crus, monta a
 * geometria do Gantt (posição em pixel das barras/setas) e abre o popup de
 * edição. Sem arrastar nesta 1ª entrega (decisão confirmada com o Lucas) —
 * toda edição é por formulário, mesmo padrão do resto do sistema.
 */
@Component({
  selector: 'app-cronograma-obra',
  imports: [EditarTarefaCronogramaModal],
  templateUrl: './cronograma-obra.html',
  styleUrl: './cronograma-obra.scss',
})
export class CronogramaObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly cronogramaApi = inject(CronogramaObraService);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly formatarData = formatarData;
  protected readonly alturaLinha = ALTURA_LINHA;
  protected readonly larguraColunasFixas = LARGURA_COLUNAS_FIXAS;

  protected readonly obra = signal<Obra | null>(null);
  protected readonly tarefas = signal<TarefaCronograma[]>([]);
  protected readonly dependencias = signal<DependenciaCronograma[]>([]);
  protected readonly itensEap = signal<ItemEapResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly zoom = signal<ZoomGantt>('semana');
  protected readonly larguraDiaPx = computed(() => LARGURA_DIA_PX[this.zoom()]);

  /** "AAAA-MM-DD" pro `<input type="date">` — `obra.data_base` volta da API como ISO completo. */
  protected dataBaseParaInput(): string {
    return this.obra()?.data_base?.slice(0, 10) ?? '';
  }

  private readonly dataBaseObraIso = computed(() => this.obra()?.data_base?.slice(0, 10) ?? '');

  protected readonly calculado = computed<TarefaCronogramaCalculada[]>(() => {
    if (!this.dataBaseObraIso()) return [];
    return calcularCronograma(this.tarefas(), this.dependencias(), this.dataBaseObraIso());
  });

  protected readonly haErros = computed(() => this.calculado().some((c) => !!c.erro));

  private readonly validos = computed(() => this.calculado().filter((c) => !c.erro));

  private readonly dataMinimaOrdinal = computed(() => {
    const v = this.validos();
    if (!v.length) return isoParaOrdinal(this.dataBaseObraIso() || '2026-01-01');
    return Math.min(...v.map((c) => isoParaOrdinal(c.inicio)));
  });

  private readonly dataMaximaOrdinal = computed(() => {
    const v = this.validos();
    if (!v.length) return this.dataMinimaOrdinal();
    return Math.max(...v.map((c) => isoParaOrdinal(c.fim)));
  });

  protected readonly larguraGradeTotalPx = computed(
    () => Math.max(this.dataMaximaOrdinal() - this.dataMinimaOrdinal() + 1, 1) * this.larguraDiaPx() + this.larguraDiaPx(),
  );

  /** Uma linha por tarefa calculada (inclusive as em erro, sem barra) — ordem de `ordem`/cadastro. */
  protected readonly linhasGantt = computed<LinhaGantt[]>(() =>
    this.calculado().map((calc, indice) => {
      if (calc.erro) return { calculado: calc, linha: indice, leftPx: 0, widthPx: 0 };
      const leftPx = (isoParaOrdinal(calc.inicio) - this.dataMinimaOrdinal()) * this.larguraDiaPx();
      const widthPx = duracaoEfetiva(calc.tarefa.duracao_dias) * this.larguraDiaPx();
      return { calculado: calc, linha: indice, leftPx, widthPx };
    }),
  );

  protected readonly alturaGradeTotalPx = computed(() => this.linhasGantt().length * ALTURA_LINHA);

  /** Marcadores de grade (linhas verticais + rótulo) no cabeçalho — varia com o zoom. */
  protected readonly marcadoresGrade = computed<MarcadorGrade[]>(() => {
    const inicio = this.dataMinimaOrdinal();
    const fim = this.dataMaximaOrdinal();
    const passoDias = this.zoom() === 'dia' ? 1 : this.zoom() === 'semana' ? 7 : 30;
    const marcadores: MarcadorGrade[] = [];
    for (let ordinal = inicio; ordinal <= fim + 1 && marcadores.length < 1000; ordinal += passoDias) {
      const iso = new Date(ordinal * 86_400_000);
      const rotulo =
        this.zoom() === 'mes'
          ? iso.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
          : iso.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
      marcadores.push({ leftPx: (ordinal - inicio) * this.larguraDiaPx(), rotulo });
    }
    return marcadores;
  });

  /** Setas de dependência (SVG) — linha em cotovelo simples ligando borda da predecessora à da sucessora. */
  protected readonly setasGantt = computed<SetaGantt[]>(() => {
    const porId = new Map(this.linhasGantt().map((l) => [l.calculado.tarefa.id, l]));
    const setas: SetaGantt[] = [];
    for (const dep of this.dependencias()) {
      const pred = porId.get(dep.predecessora_id);
      const suc = porId.get(dep.sucessora_id);
      if (!pred || !suc || pred.calculado.erro || suc.calculado.erro) continue;
      const y1 = pred.linha * ALTURA_LINHA + ALTURA_LINHA / 2;
      const y2 = suc.linha * ALTURA_LINHA + ALTURA_LINHA / 2;
      const x1 = pred.leftPx + Math.max(pred.widthPx, 1);
      const x2 = suc.leftPx;
      const meioX = x2 >= x1 + 8 ? (x1 + x2) / 2 : x1 + 8;
      const d = `M ${x1} ${y1} H ${meioX} V ${y2} H ${x2}`;
      setas.push({ id: dep.id, d, critica: suc.calculado.critica && pred.calculado.critica });
    }
    return setas;
  });

  /** `null` = nova tarefa (modal aberto); um objeto = editando essa tarefa. `mostrarModalTarefa` controla se o popup está aberto. */
  protected readonly tarefaEmEdicao = signal<TarefaCronograma | null>(null);
  protected readonly mostrarModalTarefa = signal(false);

  ngOnInit(): void {
    this.carregando.set(true);
    this.erro.set(null);
    forkJoin({
      obra: this.api.obterObra(this.obraId()),
      cronograma: this.cronogramaApi.obter(this.obraId()),
      eap: this.api.obterEap(this.obraId()),
    }).subscribe({
      next: ({ obra, cronograma, eap }) => {
        this.obra.set(obra);
        this.tarefas.set(cronograma.tarefas);
        this.dependencias.set(cronograma.dependencias);
        this.itensEap.set(extrairItensEapResumo(eap.eapItems));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o cronograma.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Recarrega só obra + cronograma (não a EAP, que não muda por edição de
   * tarefa — evita repetir uma busca potencialmente grande, 222 itens na
   * Obra do Beltrano, a cada salvar/excluir). `forkJoin` das duas chamadas:
   * bug achado testando — com só a chamada do cronograma destravando a
   * tela, uma janela em que o cronograma já carregou mas a obra ainda não
   * mostrava "defina a data base" por engano numa obra que já TINHA data
   * base (mesma classe de corrida já vista no Fluxo de Caixa/EAP).
   */
  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    forkJoin({
      obra: this.api.obterObra(this.obraId()),
      cronograma: this.cronogramaApi.obter(this.obraId()),
    }).subscribe({
      next: ({ obra, cronograma }) => {
        this.obra.set(obra);
        this.tarefas.set(cronograma.tarefas);
        this.dependencias.set(cronograma.dependencias);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o cronograma.');
        this.carregando.set(false);
      },
    });
  }

  protected salvarDataBase(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    if (!valor) return;
    this.api.atualizarObra(this.obraId(), { data_base: valor }).subscribe({
      next: (o) => this.obra.set(o),
    });
  }

  protected mudarZoom(evento: Event): void {
    this.zoom.set((evento.target as HTMLSelectElement).value as ZoomGantt);
  }

  protected abrirNovaTarefa(): void {
    this.tarefaEmEdicao.set(null);
    this.mostrarModalTarefa.set(true);
  }

  protected abrirEdicaoTarefa(tarefa: TarefaCronograma): void {
    this.tarefaEmEdicao.set(tarefa);
    this.mostrarModalTarefa.set(true);
  }

  protected fecharEdicao(): void {
    this.mostrarModalTarefa.set(false);
  }

  protected aoSalvarTarefa(): void {
    this.mostrarModalTarefa.set(false);
    this.carregar();
  }

  protected readonly importandoEap = signal(false);

  /**
   * "Importar itens da EAP" (02/10/2026, pedido do Lucas: "vai dar muito
   * trabalho montar o cronograma item a item") — cria uma tarefa por item
   * da EAP (grupo e folha, decisão confirmada com o Lucas), vinculada via
   * `eap_item_id` (mesmo campo opcional que já existia, só rastreabilidade
   * até aqui). Tarefas nascem SOLTAS, sem nenhuma predecessora — a decisão
   * confirmada foi "sem encadear automaticamente", o Lucas liga como quiser
   * depois. Pula item que já tem uma tarefa vinculada (evita duplicar se
   * clicar de novo por engano).
   *
   * `mergeMap(..., 3)` — NÃO dispara tudo de uma vez (`forkJoin`): uma EAP
   * grande (achado testando com os 222 itens reais da Obra do Beltrano) tem
   * muito mais itens do que o PHP-FPM tem workers (`pm.max_children = 5`
   * no `php-fpm.d/www.conf` deste projeto) — 222 requisições simultâneas
   * sobrecarregam a fila e algumas chegam a dar timeout (bug real: só 129
   * de 222 chegaram a ser criadas antes de estourar). No máximo 3 de cada
   * vez garante uma folga de workers livres pro resto do sistema continuar
   * respondendo durante a importação.
   */
  protected importarEap(): void {
    const jaImportados = new Set(this.tarefas().map((t) => t.eap_item_id).filter((id): id is string => !!id));
    const itensParaImportar = this.itensEap().filter((i) => !jaImportados.has(i.id));
    if (!itensParaImportar.length) {
      window.alert('Todos os itens da EAP já têm uma tarefa no cronograma.');
      return;
    }
    if (!window.confirm(`Importar ${itensParaImportar.length} item(ns) da EAP como tarefas? Nascem sem predecessora (todas começando na data-base) — você liga as dependências depois.`)) {
      return;
    }

    this.importandoEap.set(true);
    let ordem = Math.max(0, ...this.tarefas().map((t) => t.ordem)) + 1;

    from(itensParaImportar)
      .pipe(
        mergeMap(
          (item) =>
            this.cronogramaApi.criarTarefa(this.obraId(), {
              eap_item_id: item.id,
              ordem: ordem++,
              nome: this.rotuloEap(item),
              tipo: 'tarefa',
              duracao_dias: 1,
              data_inicio_manual: null,
            }),
          3,
        ),
        toArray(),
      )
      .subscribe({
        next: () => {
          this.importandoEap.set(false);
          this.carregar();
        },
        error: () => {
          this.importandoEap.set(false);
          this.erro.set('Não foi possível importar todos os itens da EAP — confira o que já foi criado antes de tentar de novo.');
          this.carregar();
        },
      });
  }

  private rotuloEap(item: ItemEapResumo): string {
    const eap = item.eap.trim();
    const desc = item.desc.trim();
    return eap && desc ? `${eap} - ${desc}` : eap || desc || 'Item sem descrição';
  }

  protected excluirTarefa(tarefa: TarefaCronograma): void {
    if (!window.confirm(`Excluir a tarefa "${tarefa.nome}"? As dependências ligadas a ela também serão removidas.`)) return;
    this.cronogramaApi.excluirTarefa(tarefa.id).subscribe({ next: () => this.carregar() });
  }
}
