import { HttpClient, HttpContext, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SEM_TIMEOUT_LONGO } from '../../core/interceptors/auth.interceptor';
import { SEM_CACHE_OFFLINE } from '../../core/offline/cache-offline.interceptor';
import {
  FotoSelecionada,
  RdoContratanteLink,
  RdoObraDados,
  RdoPreparo,
  RdoRegistro,
  VideoSelecionado,
} from './rdo.models';

/** Campos que podem ir `null` de propósito ("S/ expediente" no turno) — ver `montarCorpo`. */
const CAMPOS_CLIMA_ANULAVEIS = [
  'clima_manha',
  'clima_tarde',
  'clima_noite',
  'condicao_manha',
  'condicao_tarde',
  'condicao_noite',
] as const;

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

  /**
   * `payload.id` (09/10/2026, app): o RDO novo já nasce com o id gerado no
   * aparelho. Se o envio cair no meio e for repetido, o servidor não cria um
   * segundo RDO (o id é a chave primária) — ver `RdoFilaService`.
   */
  criar(
    payload: Record<string, unknown>,
    fotos: FotoSelecionada[],
    videos: VideoSelecionado[] = [],
  ): Observable<RdoRegistro> {
    return this.http.post<RdoRegistro>(`${this.base}/rdo`, this.montarCorpo(payload, fotos, videos), {
      context: this.contextoEnvio(),
    });
  }

  /**
   * POST e não PUT: o formulário envia fotos/vídeos junto (multipart) e o PHP
   * não popula $_FILES em requisições PUT.
   */
  atualizar(
    id: string,
    payload: Record<string, unknown>,
    fotos: FotoSelecionada[],
    videos: VideoSelecionado[] = [],
  ): Observable<RdoRegistro> {
    return this.http.post<RdoRegistro>(`${this.base}/rdo/${id}`, this.montarCorpo(payload, fotos, videos), {
      context: this.contextoEnvio(),
    });
  }

  /**
   * Confere direto no servidor (nunca no cache do celular) se um RDO já
   * existe — usado pela fila de envio do app quando a tentativa anterior caiu
   * sem resposta e não dá pra saber se o RDO chegou ou não.
   */
  existeNoServidor(id: string): Observable<boolean> {
    return this.http
      .get<RdoRegistro>(`${this.base}/rdo/${id}`, { context: new HttpContext().set(SEM_CACHE_OFFLINE, true) })
      .pipe(
        map(() => true),
        catchError((erro: unknown) =>
          erro instanceof HttpErrorResponse && erro.status === 404 ? of(false) : throwError(() => erro),
        ),
      );
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

  /** Somente leitura desde 26/09/2026 — o cabeçalho vem da obra, não é mais editável no RDO. */
  obterCabecalho(obraId: string): Observable<RdoObraDados> {
    const params = new HttpParams().set('obra_id', obraId);

    return this.http.get<RdoObraDados>(`${this.base}/rdo/obra-dados`, { params });
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
   * Envio com fotos/vídeos (09/10/2026): sem o tempo-limite padrão de 15 s do
   * authInterceptor — no 4G da obra, subir as fotos do dia passa disso fácil,
   * e o RDO chegava no servidor enquanto a tela dizia que tinha dado erro.
   */
  private contextoEnvio(): HttpContext {
    return new HttpContext().set(SEM_TIMEOUT_LONGO, true);
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
  private montarCorpo(
    payload: Record<string, unknown>,
    fotos: FotoSelecionada[],
    videos: VideoSelecionado[],
  ): FormData {
    const corpo = new FormData();
    this.anexar(corpo, payload);

    // "S/ expediente" por turno: clima e condição do turno vão como null. Só
    // que FormData não tem null e `anexar` pula valor vazio — a chave nem
    // chegava no backend, que aí aplicava o padrão "praticável" na condição
    // e a marcação se perdia ao salvar. String vazia vira null no Laravel
    // (ConvertEmptyStringsToNull) COM a chave presente.
    CAMPOS_CLIMA_ANULAVEIS.forEach((chave) => {
      if (chave in payload && (payload[chave] === null || payload[chave] === '')) {
        corpo.append(chave, '');
      }
    });

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

    // Vídeo (F8, 22/09/2026) — mesma ideia, sem croqui.
    videos.forEach((video, i) => {
      corpo.append(`videos[${i}]`, video.arquivo, video.arquivo.name);
      if (video.tarefaRef) {
        corpo.append(`videos_meta[${i}][tarefa_id]`, video.tarefaRef);
      }
      if (video.legenda) {
        corpo.append(`videos_meta[${i}][legenda]`, video.legenda);
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
