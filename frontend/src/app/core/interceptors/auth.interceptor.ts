import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, timeout } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Tempo máximo de espera por resposta da API.
 *
 * Sem isso, uma API fora do ar deixa a requisição pendurada e a tela
 * presa em "Carregando…" para sempre. Com o limite, ela falha e o
 * componente mostra sua mensagem de erro — muito melhor do que uma
 * espera silenciosa e infinita.
 */
const LIMITE_MS = 15_000;

/**
 * Requisições que sabidamente demoram mais que 15s numa conexão real —
 * upload/download de arquivos anexados (até 100MB) — marcam este
 * contexto pra escapar do timeout padrão. Ver ArquivosStore.
 */
export const SEM_TIMEOUT_LONGO = new HttpContextToken<boolean>(() => false);
const LIMITE_MS_LONGO = 10 * 60_000;

/**
 * Anexa o token Sanctum, impõe tempo limite e trata 401 de forma
 * central: se o token expirou, manda o usuário de volta para o login em
 * vez de deixar cada tela lidar com isso.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const requisicao = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    : req.clone({ setHeaders: { Accept: 'application/json' } });

  const limite = req.context.get(SEM_TIMEOUT_LONGO) ? LIMITE_MS_LONGO : LIMITE_MS;

  return next(requisicao).pipe(
    timeout(limite),
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && !req.url.includes('/login')) {
        void router.navigate(['/login']);
      }
      return throwError(() => erro);
    }),
  );
};
