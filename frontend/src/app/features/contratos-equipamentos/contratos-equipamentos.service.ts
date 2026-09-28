import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ContratoEquipamento,
  ContratoEquipamentoPayload,
  RenovarContratoPayload,
} from './contratos-equipamentos.models';

/** Acesso à API do módulo Contratos de equipamentos (26/09/2026). Mesmo padrão de `RdoService`. */
@Injectable({ providedIn: 'root' })
export class ContratosEquipamentosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listar(obraId: string): Observable<ContratoEquipamento[]> {
    return this.http.get<ContratoEquipamento[]>(`${this.base}/obras/${obraId}/contratos-equipamentos`);
  }

  /** Página de controle geral (27/09/2026) — todos os contratos, de todas as obras, com `obra_nome`. */
  listarGeral(): Observable<Array<ContratoEquipamento & { obra_nome: string }>> {
    return this.http.get<Array<ContratoEquipamento & { obra_nome: string }>>(`${this.base}/contratos-equipamentos`);
  }

  obter(id: string): Observable<ContratoEquipamento> {
    return this.http.get<ContratoEquipamento>(`${this.base}/contratos-equipamentos/${id}`);
  }

  criar(obraId: string, payload: ContratoEquipamentoPayload): Observable<ContratoEquipamento> {
    return this.http.post<ContratoEquipamento>(`${this.base}/obras/${obraId}/contratos-equipamentos`, payload);
  }

  atualizar(id: string, payload: { nome_contrato: string; fornecedor: string }): Observable<ContratoEquipamento> {
    return this.http.put<ContratoEquipamento>(`${this.base}/contratos-equipamentos/${id}`, payload);
  }

  renovar(id: string, payload: RenovarContratoPayload): Observable<ContratoEquipamento> {
    return this.http.post<ContratoEquipamento>(`${this.base}/contratos-equipamentos/${id}/renovar`, payload);
  }

  excluir(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/contratos-equipamentos/${id}`);
  }
}
