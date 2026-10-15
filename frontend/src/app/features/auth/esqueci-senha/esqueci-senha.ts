import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

/**
 * "Esqueci minha senha" (15/10/2026) — pede o e-mail e dispara o link de uso
 * único. A tela mostra a MESMA confirmação exista a conta ou não: o servidor
 * responde igual nos dois casos, de propósito, para ninguém usar o formulário
 * para descobrir quais e-mails têm conta.
 */
@Component({
  selector: 'app-esqueci-senha',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './esqueci-senha.html',
  styleUrl: './esqueci-senha.scss',
})
export class EsqueciSenha {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly rota = inject(ActivatedRoute);

  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = this.fb.nonNullable.group({
    email: [this.rota.snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
  });

  protected enviar(): void {
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);

    this.auth.solicitarRedefinicaoDeSenha(this.formulario.controls.email.value.trim()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.enviado.set(true);
      },
      error: (e: { status?: number }) => {
        this.enviando.set(false);
        this.erro.set(
          e?.status === 429
            ? 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
            : 'Não foi possível enviar agora. Verifique sua conexão e tente novamente.',
        );
      },
    });
  }
}
