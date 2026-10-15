import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

const CHAVE_TOKEN = 'trenaapp.plataforma.token';
const CHAVE_ADMIN = 'trenaapp.plataforma.admin';

export interface AdminPlataforma {
  id: number;
  name: string;
  email: string;
}

/** Resposta da 1ª etapa (e-mail + senha). `segredo`/`uri` só vêm na primeira vez, quando o 2º fator ainda não existe. */
export interface RespostaLoginPlataforma {
  ok: boolean;
  etapa: 'codigo' | 'configurar';
  pre_token: string;
  segredo?: string;
  uri?: string;
}

export type PlanoPlataforma = 'trial' | 'basico' | 'profissional' | 'empresarial';
export type StatusAssinatura = 'trial' | 'ativa' | 'suspensa' | 'cancelada';

export const PLANOS: ReadonlyArray<{ valor: PlanoPlataforma; rotulo: string }> = [
  { valor: 'trial', rotulo: 'Teste (trial)' },
  { valor: 'basico', rotulo: 'Básico' },
  { valor: 'profissional', rotulo: 'Profissional' },
  { valor: 'empresarial', rotulo: 'Empresarial' },
];

export const STATUS_ASSINATURA: ReadonlyArray<{ valor: StatusAssinatura; rotulo: string; dica: string }> = [
  { valor: 'trial', rotulo: 'Em teste', dica: 'Acesso liberado durante o período de teste.' },
  { valor: 'ativa', rotulo: 'Ativa', dica: 'Assinatura em dia, acesso liberado.' },
  { valor: 'suspensa', rotulo: 'Suspensa', dica: 'BLOQUEIA o login de todos os usuários da empresa.' },
  { valor: 'cancelada', rotulo: 'Cancelada', dica: 'BLOQUEIA o login de todos os usuários da empresa.' },
];

export interface EmpresaPlataforma {
  id: string;
  nome: string;
  plano: PlanoPlataforma;
  assinaturaStatus: StatusAssinatura;
  /** `AAAA-MM-DD` ou null. */
  assinaturaValidaAte: string | null;
  /** Passou da validade e o status ainda é trial/ativa — só aviso, não bloqueia. */
  vencida: boolean;
  usuarios: number;
  observacoes: string;
  criadaEm: string | null;
  principal: { nome: string; email: string; ativo: boolean } | null;
}

export interface NovaContaPrincipal {
  empresa: string;
  name: string;
  email: string;
  password: string;
  plano: PlanoPlataforma;
  assinatura_status: StatusAssinatura;
  assinatura_valida_ate: string | null;
  observacoes_plataforma: string;
}

export interface AlteracaoEmpresa {
  plano?: PlanoPlataforma;
  assinatura_status?: StatusAssinatura;
  assinatura_valida_ate?: string | null;
  observacoes_plataforma?: string | null;
}

/**
 * Painel de planos (15/10/2026) — a ÚNICA parte do front que fala com
 * `/api/admin-plataforma/*`. Sessão separada do sistema:
 *  - o token vive em `sessionStorage` (some ao fechar a aba), nunca em
 *    `localStorage` como o do usuário comum;
 *  - cada chamada leva o `Authorization` explícito, que o interceptor respeita
 *    em vez de trocar pelo token de usuário.
 */
@Injectable({ providedIn: 'root' })
export class PlataformaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin-plataforma`;

  private readonly _token = signal<string | null>(this.ler(CHAVE_TOKEN));
  private readonly _admin = signal<AdminPlataforma | null>(this.lerAdmin());

  readonly admin = this._admin.asReadonly();
  readonly autenticado = computed(() => this._token() !== null);

  /** 1ª etapa: e-mail e senha. Ainda não dá acesso a nada. */
  entrar(email: string, senha: string): Observable<RespostaLoginPlataforma> {
    return this.http.post<RespostaLoginPlataforma>(`${this.base}/login`, { email, password: senha });
  }

  /** 2ª etapa: código de 6 dígitos do aplicativo autenticador. Só aqui nasce a sessão. */
  verificarCodigo(preToken: string, codigo: string): Observable<{ token: string; admin: AdminPlataforma }> {
    return this.http
      .post<{ token: string; admin: AdminPlataforma }>(`${this.base}/2fa`, { pre_token: preToken, codigo })
      .pipe(tap((resposta) => this.guardarSessao(resposta.token, resposta.admin)));
  }

  sair(): void {
    const finalizar = () => this.limparSessao();
    this.http.post(`${this.base}/logout`, {}, { headers: this.cabecalho() }).subscribe({
      next: finalizar,
      error: finalizar,
    });
  }

  /** Descarta a sessão local sem chamar o servidor (token expirado/recusado). */
  encerrarLocal(): void {
    this.limparSessao();
  }

  listarEmpresas(): Observable<EmpresaPlataforma[]> {
    return this.http.get<EmpresaPlataforma[]>(`${this.base}/empresas`, { headers: this.cabecalho() });
  }

  criarConta(dados: NovaContaPrincipal): Observable<EmpresaPlataforma> {
    return this.http.post<EmpresaPlataforma>(`${this.base}/empresas`, dados, { headers: this.cabecalho() });
  }

  atualizarEmpresa(id: string, dados: AlteracaoEmpresa): Observable<EmpresaPlataforma> {
    return this.http.put<EmpresaPlataforma>(`${this.base}/empresas/${id}`, dados, { headers: this.cabecalho() });
  }

  private cabecalho(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this._token() ?? ''}` });
  }

  private guardarSessao(token: string, admin: AdminPlataforma): void {
    this._token.set(token);
    this._admin.set(admin);
    try {
      sessionStorage.setItem(CHAVE_TOKEN, token);
      sessionStorage.setItem(CHAVE_ADMIN, JSON.stringify(admin));
    } catch {
      // sem sessionStorage: a sessão vale só enquanto a página não recarregar.
    }
  }

  private limparSessao(): void {
    this._token.set(null);
    this._admin.set(null);
    try {
      sessionStorage.removeItem(CHAVE_TOKEN);
      sessionStorage.removeItem(CHAVE_ADMIN);
    } catch {
      // nada a fazer
    }
  }

  private ler(chave: string): string | null {
    try {
      return sessionStorage.getItem(chave);
    } catch {
      return null;
    }
  }

  private lerAdmin(): AdminPlataforma | null {
    try {
      const bruto = sessionStorage.getItem(CHAVE_ADMIN);
      return bruto ? (JSON.parse(bruto) as AdminPlataforma) : null;
    } catch {
      return null;
    }
  }
}
