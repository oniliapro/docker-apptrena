import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiService } from '../../core/services/api.service';
import { MedicaoPayload } from '../../core/models/api.models';
import { ChaveTipo, ItemEap, PorTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { criarVazioPorTipo } from '../eap/eap-normalize';
import { ehDescendente } from '../eap/eap-engine';
import { EapStore } from '../eap/eap.store';
import {
  gerarId,
  gerarNumeroRecebimento,
  normalizarRecebimento,
  paraPayloadApi,
} from '../recebimentos/recebimentos-calc';
import { Recebimento } from '../recebimentos/recebimentos.models';
import {
  EntradaMedicao,
  ValorGravado,
  montarEntradas,
  pctEfetivoPorTipo,
  pctParaValor,
  pctTotalItem,
  regrediu,
} from './medicao-engine';

/**
 * Estado de uma medição (23/08/2026, pedido do Lucas) — injeta `EapStore`
 * (mesmo `providers` do componente `Medicao`) pra ler a hierarquia e o
 * orçado dos itens, que a Medição não duplica: só grava o percentual
 * medido de cada um. Autosave a cada célula editada, mesmo padrão do
 * resto do sistema (EapStore.salvar()) — sem debounce, sem botão
 * "Salvar" separado.
 */
@Injectable()
export class MedicaoStore {
  private readonly api = inject(ApiService);
  private readonly eap = inject(EapStore);

  private medicaoId = '';

  readonly payload = signal<MedicaoPayload | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);

  readonly aprovada = computed(() => this.payload()?.status === 'aprovada');

  carregar(obraId: string, medicaoId: string): void {
    this.medicaoId = medicaoId;
    this.carregando.set(true);
    this.erro.set(null);

    this.eap.carregar(obraId);
    this.api.obterMedicao(medicaoId).subscribe({
      next: (payload) => {
        this.payload.set(payload);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar a medição.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Orçado (custo direto + BDI) por categoria de cada item da EAP — item
   * ou soma do grupo, mesma regra de congelamento que `eap.ts::orcadoDoItemTipo`
   * usa (lê o snapshot congelado se a EAP estiver confirmada). Indexado
   * na mesma ordem de `eap.itens()`.
   */
  private readonly orcadoPorItem = computed<PorTipo[]>(() => {
    const itens = this.eap.itens();
    const cache = this.eap.cache();

    return itens.map((item, i) => {
      if (item.orcadoCongelado) return item.orcadoCongelado;

      if (item.isGroup) {
        const totais = this.eap.totaisDoGrupo(i);
        return TIPOS_CUSTO.reduce((acc, t) => {
          acc[t.chave] = (totais.directByType[t.chave] ?? 0) + (totais.bdiByType[t.chave] ?? 0);
          return acc;
        }, criarVazioPorTipo());
      }

      return TIPOS_CUSTO.reduce((acc, t) => {
        acc[t.chave] =
          (cache.directByType[i]?.[t.chave] ?? 0) + (cache.bdiByType[i]?.[t.chave] ?? 0);
        return acc;
      }, criarVazioPorTipo());
    });
  });

  /** O que já foi gravado nesta medição, por eapItemId. */
  private readonly valoresGravados = computed(() => {
    const mapa = new Map<string, Partial<Record<ChaveTipo, ValorGravado>>>();
    for (const item of this.payload()?.itens ?? []) {
      mapa.set(item.eapItemId, item.valores as Partial<Record<ChaveTipo, ValorGravado>>);
    }
    return mapa;
  });

  readonly entradas = computed<EntradaMedicao[]>(() =>
    montarEntradas(this.eap.itens(), this.orcadoPorItem(), this.valoresGravados()),
  );

  private readonly entradaPorId = computed(() => {
    const mapa = new Map<string, EntradaMedicao>();
    for (const entrada of this.entradas()) mapa.set(entrada.eapItemId, entrada);
    return mapa;
  });

  pctEfetivo(eapItemId: string, tipo: ChaveTipo): number {
    const entrada = this.entradaPorId().get(eapItemId);
    return entrada ? pctEfetivoPorTipo(entrada, tipo, this.entradas()) : 0;
  }

  pctTotal(eapItemId: string): number {
    const entrada = this.entradaPorId().get(eapItemId);
    return entrada ? pctTotalItem(entrada, this.entradas()) : 0;
  }

  orcadoDoItem(eapItemId: string, tipo: ChaveTipo): number {
    return this.entradaPorId().get(eapItemId)?.orcadoPorTipo[tipo] ?? 0;
  }

  acumuladoAnterior(eapItemId: string, tipo: ChaveTipo): number {
    return this.payload()?.acumuladoAnterior?.[eapItemId]?.[tipo] ?? 0;
  }

  /** Avanço desta categoria (nova medição − acumulado), sempre em R$ — mesmo motivo do "Orçado". */
  avancoDoItemTipoRS(eapItemId: string, tipo: ChaveTipo): number {
    const orcado = this.orcadoDoItem(eapItemId, tipo);
    return (
      pctParaValor(this.pctEfetivo(eapItemId, tipo), orcado) -
      pctParaValor(this.acumuladoAnterior(eapItemId, tipo), orcado)
    );
  }

  /** Percentual acumulado do item, ponderado entre categorias pelo orçado — mesma ideia de `pctTotal`, mas pro valor "antes" da medição. */
  pctTotalAcumulado(eapItemId: string): number {
    let somaPesos = 0;
    let somaPonderada = 0;
    for (const tipo of TIPOS_CUSTO) {
      const peso = this.orcadoDoItem(eapItemId, tipo.chave);
      somaPonderada += this.acumuladoAnterior(eapItemId, tipo.chave) * peso;
      somaPesos += peso;
    }
    return somaPesos > 0 ? somaPonderada / somaPesos : 0;
  }

  // ------------------------------------------------------------------
  // Coluna "Total" (24/08/2026, pedido do Lucas) — soma em R$ das 5
  // categorias de um item, sempre em R$ (sem alternância, mesmo motivo
  // do "Orçado" de cada categoria).
  // ------------------------------------------------------------------
  orcadoTotalDoItem(eapItemId: string): number {
    return TIPOS_CUSTO.reduce((soma, t) => soma + this.orcadoDoItem(eapItemId, t.chave), 0);
  }

  acumuladoTotalDoItemRS(eapItemId: string): number {
    return TIPOS_CUSTO.reduce(
      (soma, t) =>
        soma + pctParaValor(this.acumuladoAnterior(eapItemId, t.chave), this.orcadoDoItem(eapItemId, t.chave)),
      0,
    );
  }

  novaTotalDoItemRS(eapItemId: string): number {
    return TIPOS_CUSTO.reduce(
      (soma, t) => soma + pctParaValor(this.pctEfetivo(eapItemId, t.chave), this.orcadoDoItem(eapItemId, t.chave)),
      0,
    );
  }

  avancoTotalDoItemRS(eapItemId: string): number {
    return this.novaTotalDoItemRS(eapItemId) - this.acumuladoTotalDoItemRS(eapItemId);
  }

  // ------------------------------------------------------------------
  // Rodapé "TOTAIS" (24/08/2026, pedido do Lucas) — soma de todos os
  // itens que "contam de verdade" pra cada categoria.
  //
  // Não é simplesmente "toda folha, nenhum grupo" (a regra que a EAP usa
  // pro Orçado): lá isso funciona porque o Orçado de um grupo É SEMPRE a
  // soma dos filhos, sem exceção. Na Medição não — um grupo pode ter
  // sobrescrita manual numa categoria (`manual: true`), e nesse caso o
  // valor dele NÃO é mais derivado dos filhos, é a própria medição feita
  // no grupo. Somar as folhas por baixo (ainda zeradas, por exemplo)
  // IGNORARIA a medição manual do grupo inteira — foi o que causou o
  // rodapé/dashboard aparentando "não calcular" (bug visto pelo Lucas,
  // 24/08/2026): um grupo medido manualmente em 50% não aparecia em
  // lugar nenhum do total, porque as folhas por baixo continuavam em 0.
  //
  // Por isso a lista de quem conta é resolvida POR CATEGORIA: uma folha
  // conta, a menos que algum grupo ancestral tenha aquela categoria
  // sobrescrita à mão (aí é o grupo que conta, não mais os filhos —
  // senão a medição do grupo seria contada de novo, uma segunda vez).
  // ------------------------------------------------------------------
  private itensContribuintesPorTipo(tipo: ChaveTipo): ItemEap[] {
    const itens = this.eap.itens();
    const grupos = itens.filter((i) => i.isGroup);
    const gruposManuaisIds = new Set(
      grupos.filter((g) => this.celulaEhManual(g.id, tipo)).map((g) => g.id),
    );

    return itens.filter((item) => {
      if (item.isGroup) return gruposManuaisIds.has(item.id);
      return !grupos.some(
        (grupo) => gruposManuaisIds.has(grupo.id) && ehDescendente(grupo.eap, item.eap),
      );
    });
  }

  totalOrcadoPorTipo(tipo: ChaveTipo): number {
    return this.itensContribuintesPorTipo(tipo).reduce(
      (soma, item) => soma + this.orcadoDoItem(item.id, tipo),
      0,
    );
  }

  totalAcumuladoPorTipoRS(tipo: ChaveTipo): number {
    return this.itensContribuintesPorTipo(tipo).reduce(
      (soma, item) => soma + pctParaValor(this.acumuladoAnterior(item.id, tipo), this.orcadoDoItem(item.id, tipo)),
      0,
    );
  }

  totalNovaPorTipoRS(tipo: ChaveTipo): number {
    return this.itensContribuintesPorTipo(tipo).reduce(
      (soma, item) => soma + pctParaValor(this.pctEfetivo(item.id, tipo), this.orcadoDoItem(item.id, tipo)),
      0,
    );
  }

  totalAvancoPorTipoRS(tipo: ChaveTipo): number {
    return this.totalNovaPorTipoRS(tipo) - this.totalAcumuladoPorTipoRS(tipo);
  }

  /** Percentual acumulado/nova/avanço de UMA categoria só, ponderado entre os itens pelo orçado — pro dashboard discriminado por tipo. */
  pctAcumuladoPorTipo(tipo: ChaveTipo): number {
    const orcado = this.totalOrcadoPorTipo(tipo);
    return orcado > 0 ? (this.totalAcumuladoPorTipoRS(tipo) / orcado) * 100 : 0;
  }

  pctNovaPorTipo(tipo: ChaveTipo): number {
    const orcado = this.totalOrcadoPorTipo(tipo);
    return orcado > 0 ? (this.totalNovaPorTipoRS(tipo) / orcado) * 100 : 0;
  }

  pctAvancoPorTipo(tipo: ChaveTipo): number {
    return this.pctNovaPorTipo(tipo) - this.pctAcumuladoPorTipo(tipo);
  }

  readonly totalOrcadoGeral = computed(() =>
    TIPOS_CUSTO.reduce((soma, t) => soma + this.totalOrcadoPorTipo(t.chave), 0),
  );

  readonly totalAcumuladoGeralRS = computed(() =>
    TIPOS_CUSTO.reduce((soma, t) => soma + this.totalAcumuladoPorTipoRS(t.chave), 0),
  );

  readonly totalNovaGeralRS = computed(() =>
    TIPOS_CUSTO.reduce((soma, t) => soma + this.totalNovaPorTipoRS(t.chave), 0),
  );

  readonly totalAvancoGeralRS = computed(() => this.totalNovaGeralRS() - this.totalAcumuladoGeralRS());

  readonly pctTotalAcumuladoGeral = computed(() => {
    const orcado = this.totalOrcadoGeral();
    return orcado > 0 ? (this.totalAcumuladoGeralRS() / orcado) * 100 : 0;
  });

  readonly pctTotalGeral = computed(() => {
    const orcado = this.totalOrcadoGeral();
    return orcado > 0 ? (this.totalNovaGeralRS() / orcado) * 100 : 0;
  });

  readonly pctAvancoGeral = computed(() => this.pctTotalGeral() - this.pctTotalAcumuladoGeral());

  /** Uma célula digitada abaixo do acumulado anterior — bloqueia "Aprovar" (não bloqueia digitar). */
  celulaRegrediu(eapItemId: string, tipo: ChaveTipo): boolean {
    const entrada = this.entradaPorId().get(eapItemId);
    const gravado = entrada?.valorGravado[tipo];
    // Mesmo critério de `pctEfetivoPorTipo`: só é "digitado de verdade"
    // numa folha, ou num grupo com `manual`. Um grupo não-manual está
    // sempre recalculando dos filhos — são eles que já são checados
    // individualmente, checar o grupo também seria redundante (e, pior,
    // podia bloquear "Aprovar" por causa de um valor que nem está mais
    // em uso).
    if (!gravado || (entrada!.isGroup && !gravado.manual)) return false;
    return regrediu(gravado.valor, this.acumuladoAnterior(eapItemId, tipo));
  }

  /** Se a célula de um grupo está com sobrescrita manual (mostra o botão "usar automático"). */
  celulaEhManual(eapItemId: string, tipo: ChaveTipo): boolean {
    return Boolean(this.entradaPorId().get(eapItemId)?.valorGravado[tipo]?.manual);
  }

  /**
   * Desfaz a sobrescrita manual de um grupo — regrava o mesmo valor com
   * `manual: false`, que `pctEfetivoPorTipo` passa a ignorar (volta a
   * calcular ao vivo dos filhos). Não apaga a linha no banco, só o flag —
   * mais simples que suportar exclusão de uma célula avulsa.
   */
  reverterAutomatico(eapItemId: string, tipo: ChaveTipo): void {
    const gravado = this.entradaPorId().get(eapItemId)?.valorGravado[tipo];
    if (!gravado) return;
    this.gravarCelula(eapItemId, tipo, gravado.valor, false);
  }

  readonly temRegressao = computed(() => {
    for (const entrada of this.entradas()) {
      for (const tipo of TIPOS_CUSTO) {
        if (this.celulaRegrediu(entrada.eapItemId, tipo.chave)) return true;
      }
    }
    return false;
  });

  /** Grava uma célula (autosave — mesmo padrão do resto do sistema). */
  gravarCelula(eapItemId: string, tipo: ChaveTipo, valor: number, manual: boolean): void {
    if (this.aprovada()) return;

    this.payload.update((atual) => {
      if (!atual) return atual;
      const itens = atual.itens.map((item) =>
        item.eapItemId === eapItemId
          ? { ...item, valores: { ...item.valores, [tipo]: { valor, manual } } }
          : item,
      );
      return { ...atual, itens };
    });

    this.salvando.set(true);
    this.api
      .salvarMedicao(this.medicaoId, { itens: [{ eapItemId, valores: { [tipo]: { valor, manual } } }] })
      .subscribe({
        next: () => this.salvando.set(false),
        error: () => this.salvando.set(false),
      });
  }

  /**
   * Aprovar — calcula o valor efetivo de cada item x categoria (manual
   * se houver, senão a média ponderada ao vivo) e manda o payload
   * completo pro backend persistir de uma vez, virando um snapshot
   * fechado (não recalcula mais depois, nem quando os filhos mudarem em
   * medições futuras) — ver o comentário em `MedicaoController::aprovar`.
   */
  aprovar(): void {
    if (this.temRegressao()) return;

    const entradas = this.entradas();
    const itens = entradas.map((entrada) => {
      const valores: Record<string, { valor: number; manual: boolean }> = {};
      for (const tipo of TIPOS_CUSTO) {
        const gravado = entrada.valorGravado[tipo.chave];
        valores[tipo.chave] = {
          valor: pctEfetivoPorTipo(entrada, tipo.chave, entradas),
          manual: Boolean(gravado?.manual),
        };
      }
      return { eapItemId: entrada.eapItemId, valores };
    });

    this.salvando.set(true);
    this.api.aprovarMedicao(this.medicaoId, { itens }).subscribe({
      next: (payload) => {
        this.payload.set(payload);
        this.salvando.set(false);
      },
      error: () => this.salvando.set(false),
    });
  }

  // ------------------------------------------------------------------
  // Gerar Recebimento (01/09/2026, pedido do Lucas) — mirror simplificado
  // de `EmpreitaStore.fecharPeriodo()`/`MapaStore.gerarPagamentos()`: sem
  // split Empreiteiro/Reserva (não existe esse eixo em Medição), um item
  // por (etapa da EAP × categoria de custo) com avanço não-zero nesta
  // medição — mesma granularidade que os outros dois já dão pros
  // pagamentos que geram.
  // ------------------------------------------------------------------
  readonly gerandoRecebimento = signal(false);
  /** Mensagem do resultado da última tentativa de gerar recebimento — null limpa o aviso. */
  readonly resultadoGerarRecebimento = signal<string | null>(null);

  gerarRecebimento(): void {
    if (!this.aprovada()) return;
    const obraId = this.payload()?.obraId;
    if (!obraId) return;

    const descricaoPorId = new Map(
      this.eap.itens().map((i) => [i.id, `${i.eap} - ${i.desc}`.trim()]),
    );

    const itens: Recebimento['itens'] = [];
    for (const entrada of this.entradas()) {
      for (const tipo of TIPOS_CUSTO) {
        const avanco = this.avancoDoItemTipoRS(entrada.eapItemId, tipo.chave);
        if (Math.abs(avanco) < 0.005) continue;
        itens.push({
          id: gerarId(),
          descricao: descricaoPorId.get(entrada.eapItemId) || tipo.rotulo,
          tipo: tipo.chave,
          eapId: entrada.eapItemId,
          valor: avanco,
          modoValor: 'valor',
        });
      }
    }

    if (!itens.length) {
      this.resultadoGerarRecebimento.set('Nenhum avanço medido nesta medição.');
      return;
    }

    const valorTotal = itens.reduce((soma, item) => soma + item.valor, 0);

    this.gerandoRecebimento.set(true);
    this.resultadoGerarRecebimento.set(null);

    this.api.listarRecebimentos({ obraId }).subscribe({
      next: (existentes) => {
        const numero = gerarNumeroRecebimento(
          existentes.map((r) => normalizarRecebimento(r as Record<string, unknown>)),
        );

        const novo: Recebimento = {
          id: gerarId(),
          numeroRecebimento: numero,
          obraNumber: '',
          dataSolicitacao: new Date().toISOString().slice(0, 10),
          dataRecebimento: '',
          cliente: '',
          descricao: `Medição nº ${this.payload()?.sequencia ?? ''}`.trim(),
          valorTotal,
          itens,
          origem: { tipo: 'medicao', refId: this.medicaoId },
          status: 'pendente',
        };

        this.api.criarRecebimento(paraPayloadApi(novo, obraId)).subscribe({
          next: () => {
            this.gerandoRecebimento.set(false);
            this.resultadoGerarRecebimento.set(
              'Recebimento gerado — confira na aba Recebimentos da obra.',
            );
          },
          error: () => {
            this.gerandoRecebimento.set(false);
            this.resultadoGerarRecebimento.set('Não foi possível gravar o recebimento.');
          },
        });
      },
      error: () => {
        this.gerandoRecebimento.set(false);
        this.resultadoGerarRecebimento.set('Não foi possível ler os recebimentos existentes desta obra.');
      },
    });
  }
}
