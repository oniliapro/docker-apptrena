/**
 * Mantém as fórmulas da EAP em dia sem precisar abrir a EAP (F5, 21/09/2026).
 *
 * As fórmulas com `Real.*`/`Saldo.*` mudam de valor quando um pagamento é
 * criado, editado, confirmado ou excluído — em qualquer tela (Pagamentos, Mapa,
 * Empreita, popups…). Como o motor roda no navegador, este interceptor observa
 * as gravações em `/pagamentos` e, depois delas, pede ao `EapFormulasSync` para
 * refazer as fórmulas da obra afetada: lê a EAP, e só se ela tiver fórmulas lê
 * os pagamentos, recalcula e grava de volta (valores das células + orçado
 * congelado dos itens com fórmula). Assim dashboard, cronograma e PDFs — que
 * leem o valor gravado — ficam atualizados mesmo com a EAP travada.
 */
import { HttpEventType, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { atualizarSnapshotDosItensComFormula, recalcularFormulas } from './eap-formulas';
import { aplicarNumeracaoAutomatica, normalizarCabecalho, normalizarItemEap } from './eap-normalize';
import { calcularContextoRealizado } from './eap-realizado';
import { EapItem as EapItemApi } from '../../core/models/api.models';

/** Espera juntar várias gravações seguidas (ex.: lote de exclusões) antes de recalcular. */
const ESPERA_MS = 1200;

@Injectable({ providedIn: 'root' })
export class EapFormulasSync {
  private readonly api = inject(ApiService);
  private readonly pendentes = new Set<string>();
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private rodando = false;

  /** Obra de cada pagamento já visto (a exclusão só traz o id do pagamento na URL). */
  private readonly obraDoPagamento = new Map<string, string>();

  lembrarPagamentos(lista: unknown): void {
    if (!Array.isArray(lista)) return;
    for (const p of lista) this.lembrarPagamento(p);
  }

  lembrarPagamento(pagamento: unknown): string | null {
    if (!pagamento || typeof pagamento !== 'object') return null;
    const { id, obraId } = pagamento as { id?: unknown; obraId?: unknown };
    if (typeof id !== 'string') return null;
    if (typeof obraId === 'string' && obraId) {
      this.obraDoPagamento.set(id, obraId);
      return obraId;
    }
    return this.obraDoPagamento.get(id) ?? null;
  }

  obraDe(id: string): string | null {
    return this.obraDoPagamento.get(id) ?? null;
  }

  esquecer(id: string): void {
    this.obraDoPagamento.delete(id);
  }

  /** Agenda a atualização das fórmulas da obra (várias chamadas juntas viram uma). */
  agendar(obraId: string | null | undefined): void {
    if (!obraId) return;
    this.pendentes.add(obraId);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.processar(), ESPERA_MS);
  }

  private async processar(): Promise<void> {
    this.temporizador = null;
    if (this.rodando) {
      this.temporizador = setTimeout(() => void this.processar(), ESPERA_MS);
      return;
    }
    this.rodando = true;
    try {
      while (this.pendentes.size) {
        const [obraId] = this.pendentes;
        this.pendentes.delete(obraId);
        try {
          await this.atualizarObra(obraId);
        } catch {
          // Melhor esforço: se falhar, a próxima abertura da EAP recalcula do mesmo jeito.
        }
      }
    } finally {
      this.rodando = false;
    }
  }

  private async atualizarObra(obraId: string): Promise<void> {
    const eap = await firstValueFromApi(this.api.obterEap(obraId));
    const cabecalho = normalizarCabecalho(eap.header);
    const brutos = Array.isArray(eap.eapItems) ? eap.eapItems : [];
    const itens = aplicarNumeracaoAutomatica(
      brutos.map((i) => normalizarItemEap(i as unknown as Record<string, unknown>)),
    );
    if (!itens.some((i) => i.formulas && Object.keys(i.formulas).length)) return;

    const pagamentos = (await firstValueFromApi(this.api.listarPagamentos({ obraId }))).map((p) =>
      normalizarPagamento(p as Record<string, unknown>),
    );
    const resultado = recalcularFormulas(itens, cabecalho, calcularContextoRealizado(pagamentos));
    let finais = resultado.itens;
    let mudou = resultado.alterou;
    if (cabecalho.isConfirmed) {
      const comSnapshot = atualizarSnapshotDosItensComFormula(finais, cabecalho);
      if (comSnapshot !== finais) {
        finais = comSnapshot;
        mudou = true;
      }
    }
    if (!mudou) return;

    await firstValueFromApi(
      this.api.salvarEap(obraId, { header: eap.header, ui: eap.ui, eapItems: finais as unknown as EapItemApi[] }),
    );
  }
}

function firstValueFromApi<T>(fonte: Observable<T>): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    fonte.subscribe({ next: resolver, error: rejeitar });
  });
}

/** Observa as gravações em `/pagamentos` (não anexos nem leitura de nota) e agenda o recálculo das fórmulas. */
export const eapFormulasInterceptor: HttpInterceptorFn = (req, next) => {
  const alvo = /\/pagamentos(?:\/([^/?]+))?(?:\?|$)/.exec(req.url);
  if (!alvo || alvo[1] === 'ler-nota') return next(req);

  const sync = inject(EapFormulasSync);
  const idNaUrl = alvo[1];
  const ehGravacao = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  // A obra antes da gravação (a exclusão não devolve corpo; a edição pode ter trocado de obra).
  const obraAntes = idNaUrl ? sync.obraDe(idNaUrl) : null;

  return next(req).pipe(
    tap((evento) => {
      if (evento.type !== HttpEventType.Response) return;
      if (req.method === 'GET') {
        if (!idNaUrl) sync.lembrarPagamentos(evento.body);
        else sync.lembrarPagamento(evento.body);
        return;
      }
      if (!ehGravacao || !evento.ok) return;
      if (req.method === 'DELETE') {
        sync.agendar(obraAntes);
        if (idNaUrl) sync.esquecer(idNaUrl);
        return;
      }
      sync.agendar(sync.lembrarPagamento(evento.body));
      sync.agendar(obraAntes);
    }),
  );
};
