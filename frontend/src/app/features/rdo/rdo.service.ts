import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  FotoSelecionada,
  RdoContratanteLink,
  RdoObraDados,
  RdoPreparo,
  RdoRegistro,
} from './rdo.models';

/**
 * Acesso à API do módulo RDO.
 *
 * Fica num serviço próprio, e não em `core/services/api.service.ts`, de
 * propósito: aquele arquivo é compartilhado por todos os módulos e já foi
 * origem de um incidente (16/09/2026 — um commit removeu por engano os
 * métodos de Anexos e Tags de outra frente, porque a cópia local estava
 * desatualizada). Mantendo as chamadas do RDO aqui, este módulo não precisa
 * encostar naquele arquivo.
 *
 * O token Sanctum é anexado pelo authInterceptor — este serviço não conhece
 * autenticação, só as rotas.
 */
@Injectable({ providedIn: 'root' })
export class RdoService {
  private readonly http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * Só para a rota de impressão do PDF (ver docs/GERAR-PDF.md). Em
   * desenvolvimento, `environment.apiUrl` é um host absoluto que só existe do
   * ponto de vista do navegador do usuário — o Chromium headless que renderiza
   * o PDF roda DENTRO do container phpfpm, onde `localhost` não chega no
   * nginx. `RdoImprimir` chama isto no construtor, com o valor que veio em
   * `?apiUrl=`, antes de qualquer chamada. Mesmo padrão de
   * `ApiService.definirBaseParaImpressao`.
   */
  definirBaseParaImpressao(url: string): void {
    this.base = url.replace(/\/+$/, '');
  }

  listar(obraId?: string, limite = 30): Observable<RdoRegistro[]> {
    let params = new HttpParams().set('limite', String(limite));
    if (obraId) {
      params = params.set('obra_id', obraId);
    }

    return this.http.get<RdoRegistro[]>(`${this.base}/rdo`, { params });
  }

  obter(id: string): Observable<RdoRegistro> {
    return this.http.get<RdoRegistro>(`${this.base}/rdo/${id}`);
  }

  /** Cabeçalho, próximo número e pré-preenchimento vindo do RDO anterior. */
  preparar(obraId: string): Observable<RdoPreparo> {
    const params = new HttpParams().set('obra_id', obraId);

    return this.http.get<RdoPreparo>(`${this.base}/rdo/preparar`, { params });
  }

  criar(payload: Record<string, unknown>, fotos: FotoSelecionada[]): Observable<RdoRegistro> {
    return this.http.post<RdoRegistro>(`${this.base}/rdo`, this.montarCorpo(payload, fotos));
  }

  /**
   * POST e não PUT: o formulário envia fotos junto (multipart) e o PHP não
   * popula $_FILES em requisições PUT.
   */
  atualizar(id: string, payload: Record<string, unknown>, fotos: FotoSelecionada[]): Observable<RdoRegistro> {
    return this.http.post<RdoRegistro>(`${this.base}/rdo/${id}`, this.montarCorpo(payload, fotos));
  }

  /** Finalizar É assinar — não existe ação separada de assinatura. */
  finalizar(id: string): Observable<RdoRegistro> {
    return this.http.post<RdoRegistro>(`${this.base}/rdo/${id}/finalizar`, {});
  }

  excluir(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/rdo/${id}`);
  }

  removerFoto(id: string, fotoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/rdo/${id}/fotos/${fotoId}`);
  }

  /**
   * O PDF vem como blob e não por link direto porque a rota exige o token
   * Sanctum no cabeçalho — um <a href> não carregaria a autenticação.
   */
  baixarPdf(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/rdo/${id}/pdf`, { responseType: 'blob' });
  }

  obterCabecalho(obraId: string): Observable<RdoObraDados> {
    const params = new HttpParams().set('obra_id', obraId);

    return this.http.get<RdoObraDados>(`${this.base}/rdo/obra-dados`, { params });
  }

  salvarCabecalho(obraId: string, dados: RdoObraDados): Observable<RdoObraDados> {
    return this.http.post<RdoObraDados>(`${this.base}/rdo/obra-dados`, {
      ...dados,
      obra_id: obraId,
    });
  }

  listarLinks(obraId: string): Observable<RdoContratanteLink[]> {
    const params = new HttpParams().set('obra_id', obraId);

    return this.http.get<RdoContratanteLink[]>(`${this.base}/rdo/links`, { params });
  }

  criarLink(obraId: string, email: string | null): Observable<RdoContratanteLink> {
    return this.http.post<RdoContratanteLink>(`${this.base}/rdo/links`, {
      obra_id: obraId,
      email,
    });
  }

  revogarLink(id: string): Observable<RdoContratanteLink> {
    return this.http.post<RdoContratanteLink>(`${this.base}/rdo/links/${id}/revogar`, {});
  }

  /**
   * Monta o multipart. Cada foto vai em `fotos[i]` e seus metadados em
   * `fotos_meta[i]` — a MESMA posição liga os dois (índice 0 = fotos[0]),
   * que é o que o backend espera em `guardarFotos`.
   *
   * Arrays e objetos aninhados são serializados em notação de colchetes
   * (`tarefas[0][descricao]`) porque o FormData é plano; é assim que o
   * Laravel remonta o array no `$request->validate`.
   */
  private montarCorpo(payload: Record<string, unknown>, fotos: FotoSelecionada[]): FormData {
    const corpo = new FormData();
    this.anexar(corpo, payload);

    fotos.forEach((foto, i) => {
      corpo.append(`fotos[${i}]`, foto.arquivo, foto.arquivo.name);
      if (foto.tarefaRef) {
        corpo.append(`fotos_meta[${i}][tarefa_id]`, foto.tarefaRef);
      }
      if (foto.legenda) {
        corpo.append(`fotos_meta[${i}][legenda]`, foto.legenda);
      }
      if (foto.marcador) {
        corpo.append(`fotos_meta[${i}][x]`, String(foto.marcador.x));
        corpo.append(`fotos_meta[${i}][y]`, String(foto.marcador.y));
      }
      if (foto.nota) {
        corpo.append(`fotos_meta[${i}][nota]`, foto.nota);
      }
    });

    return corpo;
  }

  private anexar(corpo: FormData, valor: unknown, prefixo = ''): void {
    if (valor === null || valor === undefined || valor === '') {
      return;
    }

    if (Array.isArray(valor)) {
      valor.forEach((item, i) => this.anexar(corpo, item, `${prefixo}[${i}]`));

      return;
    }

    if (typeof valor === 'object' && !(valor instanceof File)) {
      Object.entries(valor as Record<string, unknown>).forEach(([chave, item]) => {
        this.anexar(corpo, item, prefixo ? `${prefixo}[${chave}]` : chave);
      });

      return;
    }

    if (typeof valor === 'boolean') {
      // O Laravel lê '1'/'0' como booleano; 'true'/'false' quebra a regra
      // `boolean` do validator quando vem por multipart.
      corpo.append(prefixo, valor ? '1' : '0');

      return;
    }

    corpo.append(prefixo, String(valor));
  }
}
