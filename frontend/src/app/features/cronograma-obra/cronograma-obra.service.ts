import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  DependenciaCronograma,
  DependenciaCronogramaPayload,
  TarefaCronograma,
  TarefaCronogramaPayload,
} from './cronograma-obra.models';

export interface CronogramaObraPayload {
  tarefas: TarefaCronograma[];
  dependencias: DependenciaCronograma[];
}

/** Acesso à API do Cronograma de obra (CPM, 02/10/2026). Mesmo padrão de `ContratosEquipamentosService`. */
@Injectable({ providedIn: 'root' })
export class CronogramaObraService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  obter(obraId: string): Observable<CronogramaObraPayload> {
    return this.http.get<CronogramaObraPayload>(`${this.base}/obras/${obraId}/cronograma`);
  }

  criarTarefa(obraId: string, payload: TarefaCronogramaPayload): Observable<TarefaCronograma> {
    return this.http.post<TarefaCronograma>(`${this.base}/obras/${obraId}/cronograma-tarefas`, payload);
  }

  atualizarTarefa(id: string, payload: TarefaCronogramaPayload): Observable<TarefaCronograma> {
    return this.http.put<TarefaCronograma>(`${this.base}/cronograma-tarefas/${id}`, payload);
  }

  excluirTarefa(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/cronograma-tarefas/${id}`);
  }

  criarDependencia(payload: DependenciaCronogramaPayload): Observable<DependenciaCronograma> {
    return this.http.post<DependenciaCronograma>(`${this.base}/cronograma-dependencias`, payload);
  }

  atualizarDependencia(id: string, payload: { tipo: string; latencia_dias: number }): Observable<DependenciaCronograma> {
    return this.http.put<DependenciaCronograma>(`${this.base}/cronograma-dependencias/${id}`, payload);
  }

  excluirDependencia(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/cronograma-dependencias/${id}`);
  }
}
