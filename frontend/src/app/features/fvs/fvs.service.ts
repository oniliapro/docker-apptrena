import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { FvsFoto, FvsModelo, FvsPreenchimento, FvsVinculo } from './fvs.models';

/**
 * Acesso à API da Ficha de Verificação de Serviço (F10, 25/09/2026) — ver o
 * plano ("D4") e `docs/CONTEXTO.md`. Serviço próprio, mesmo raciocínio de
 * `RdoService`: fica fora de `core/services/api.service.ts` pra este módulo
 * não precisar encostar naquele arquivo compartilhado.
 */
@Injectable({ providedIn: 'root' })
export class FvsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // ---------------- Modelos (Configurações) ----------------

  listarModelos(): Observable<FvsModelo[]> {
    return this.http.get<FvsModelo[]>(`${this.base}/fvs-modelos`);
  }

  criarModelo(dados: Partial<FvsModelo>): Observable<FvsModelo> {
    return this.http.post<FvsModelo>(`${this.base}/fvs-modelos`, dados);
  }

  atualizarModelo(id: string, dados: Partial<FvsModelo>): Observable<FvsModelo> {
    return this.http.put<FvsModelo>(`${this.base}/fvs-modelos/${id}`, dados);
  }

  excluirModelo(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/fvs-modelos/${id}`);
  }

  // ---------------- Vínculos (EAP) ----------------

  listarVinculos(obraId: string): Observable<FvsVinculo[]> {
    return this.http.get<FvsVinculo[]>(`${this.base}/obras/${obraId}/fvs-vinculos`);
  }

  vincular(obraId: string, eapItemId: string, fvsModeloId: string): Observable<FvsVinculo> {
    return this.http.post<FvsVinculo>(`${this.base}/obras/${obraId}/fvs-vinculos`, {
      eap_item_id: eapItemId,
      fvs_modelo_id: fvsModeloId,
    });
  }

  desvincular(obraId: string, vinculoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obras/${obraId}/fvs-vinculos/${vinculoId}`);
  }

  // ---------------- Banco de verificações da obra ----------------

  listarDaObra(obraId: string): Observable<FvsPreenchimento[]> {
    return this.http.get<FvsPreenchimento[]>(`${this.base}/obras/${obraId}/fvs`);
  }

  // ---------------- Preenchimento (dentro do RDO) ----------------

  salvar(
    id: string,
    dados: { observacao_geral: string | null; itens: Array<{ id: string; resultado: string | null; observacao: string | null }> },
  ): Observable<FvsPreenchimento> {
    return this.http.put<FvsPreenchimento>(`${this.base}/fvs/${id}`, dados);
  }

  enviarFoto(itemId: string, arquivo: File): Observable<FvsFoto> {
    const corpo = new FormData();
    corpo.append('foto', arquivo, arquivo.name);

    return this.http.post<FvsFoto>(`${this.base}/fvs/itens/${itemId}/fotos`, corpo);
  }

  removerFoto(fotoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/fvs/fotos/${fotoId}`);
  }
}
