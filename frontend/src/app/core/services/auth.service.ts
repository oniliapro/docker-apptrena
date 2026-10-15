import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { RespostaLogin, UsuarioAutenticado } from '../models/api.models';
import { definirFuso } from '../utils/fuso';

const CHAVE_TOKEN = 'trenaapp.token';
const CHAVE_USUARIO = 'trenaapp.usuario';

/**
 * Autenticação via Sanctum (POST /api/login devolve um token que vai no
 * header Authorization das demais chamadas).
 *
 * Substitui a lógica hoje espalhada entre html/login.html e o
 * window.controleObraAuth do app vanilla.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiUrl;

  private readonly _token = signal<string | null>(this.lerToken());
  private readonly _usuario = signal<UsuarioAutenticado | null>(this.lerUsuario());

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._token() !== null);

  get token(): string | null {
    return this._token();
  }

  entrar(email: string, senha: string): Observable<RespostaLogin> {
    return this.http
      .post<RespostaLogin>(`${this.base}/login`, { email, password: senha })
      .pipe(tap((resposta) => this.guardarSessao(resposta)));
  }

  /**
   * "Esqueci minha senha" — o servidor manda um link de uso único por e-mail. A resposta é
   * sempre a mesma exista a conta ou não (não revela quem usa o sistema).
   */
  solicitarRedefinicaoDeSenha(email: string): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.base}/esqueci-senha`, { email });
  }

  /** Conclui a troca de senha com o token que veio no link do e-mail. */
  redefinirSenha(dados: {
    email: string;
    token: string;
    senha: string;
    confirmacao: string;
  }): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.base}/redefinir-senha`, {
      email: dados.email,
      token: dados.token,
      password: dados.senha,
      password_confirmation: dados.confirmacao,
    });
  }

  /**
   * Guarda o fuso horário novo da empresa na sessão (depois de salvar em Dados da empresa) —
   * sem isso, o próximo carregamento da página voltaria ao fuso antigo até um novo login.
   */
  atualizarFuso(fuso: string): void {
    definirFuso(fuso);
    const atual = this._usuario();
    if (!atual) return;
    const atualizado = { ...atual, fusoHorario: fuso };
    this._usuario.set(atualizado);
    try {
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(atualizado));
    } catch {
      // vale só nesta sessão.
    }
  }

  /**
   * Cria uma sessão local falsa, sem falar com o servidor.
   *
   * Existe só para permitir revisar as telas durante a migração,
   * enquanto o laravel-backend ainda não está no ar. O token não vale
   * nada: qualquer chamada à API vai falhar com 401 — as telas apenas
   * mostram seus estados de erro/vazio, que é justamente o que se quer
   * conferir nesta fase.
   *
   * Protegido por `environment.producao`: em build de produção este
   * método não faz nada.
   */
  entrarModoDemonstracao(): boolean {
    if (environment.producao) return false;

    this.guardarSessao({
      token: 'demonstracao-sem-servidor',
      user: { id: 0, name: 'Modo demonstração', email: 'demo@local' },
    });

    return true;
  }

  /**
   * Avisa o backend para revogar o token e limpa a sessão local.
   * A limpeza local acontece mesmo se a chamada falhar — o usuário
   * pediu para sair, e ficar preso numa sessão morta seria pior.
   */
  sair(): void {
    const finalizar = () => {
      this.limparSessao();
      void this.router.navigate(['/login']);
    };

    this.http.post(`${this.base}/logout`, {}).subscribe({
      next: finalizar,
      error: finalizar,
    });
  }

  /**
   * Define o token diretamente em memória, sem persistir no
   * localStorage nem passar pelo fluxo normal de login (22/08/2026).
   *
   * Usado só pela rota de impressão de relatório
   * (`/imprimir/obras/:id/relatorios`), que roda dentro de um Chromium
   * headless (via Browsershot, ver RelatorioPdfController no backend) —
   * um contexto de navegador sem sessão nenhuma. O token vem de curta
   * duração (2 minutos) na query string dessa rota; gravá-lo só no
   * signal (e não no localStorage) evita deixá-lo em qualquer
   * armazenamento persistente, mesmo que efêmero nesse navegador.
   */
  definirTokenParaImpressao(token: string): void {
    this._token.set(token);
  }

  private guardarSessao(resposta: RespostaLogin): void {
    this._token.set(resposta.token);
    this._usuario.set(resposta.user);
    if (resposta.user.fusoHorario) definirFuso(resposta.user.fusoHorario);
    try {
      localStorage.setItem(CHAVE_TOKEN, resposta.token);
      localStorage.setItem(CHAVE_USUARIO, JSON.stringify(resposta.user));
    } catch {
      // navegador sem localStorage (aba anônima restrita): a sessão
      // continua válida em memória até fechar a aba.
    }
  }

  private limparSessao(): void {
    this._token.set(null);
    this._usuario.set(null);
    try {
      localStorage.removeItem(CHAVE_TOKEN);
      localStorage.removeItem(CHAVE_USUARIO);
    } catch {
      // nada a fazer
    }
  }

  private lerToken(): string | null {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch {
      return null;
    }
  }

  private lerUsuario(): UsuarioAutenticado | null {
    try {
      const bruto = localStorage.getItem(CHAVE_USUARIO);
      return bruto ? (JSON.parse(bruto) as UsuarioAutenticado) : null;
    } catch {
      return null;
    }
  }
}
