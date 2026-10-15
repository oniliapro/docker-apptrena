import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { CampoSenha } from '../../../shared/campo-senha/campo-senha';

function senhasIguais(grupo: AbstractControl): ValidationErrors | null {
  const senha = grupo.get('senha')?.value;
  const confirmacao = grupo.get('confirmacao')?.value;
  return senha && confirmacao && senha !== confirmacao ? { senhasDiferentes: true } : null;
}

/**
 * Destino do link do e-mail de recuperação (`/redefinir-senha?token=...&email=...`).
 * Sem token ou e-mail na URL não há o que fazer aqui — mostra o caminho de volta
 * em vez de um formulário que nunca vai funcionar.
 */
@Component({
  selector: 'app-redefinir-senha',
  imports: [ReactiveFormsModule, RouterLink, CampoSenha],
  templateUrl: './redefinir-senha.html',
  styleUrl: './redefinir-senha.scss',
})
export class RedefinirSenha {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly token = this.rota.snapshot.queryParamMap.get('token') ?? '';
  protected readonly email = this.rota.snapshot.queryParamMap.get('email') ?? '';
  protected readonly linkIncompleto = !this.token || !this.email;

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = this.fb.nonNullable.group(
    {
      senha: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(100)]],
      confirmacao: ['', [Validators.required]],
    },
    { validators: senhasIguais },
  );

  protected salvar(): void {
    if (this.formulario.invalid || this.enviando()) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.enviando.set(true);
    this.erro.set(null);

    const { senha, confirmacao } = this.formulario.getRawValue();

    this.auth.redefinirSenha({ email: this.email, token: this.token, senha, confirmacao }).subscribe({
      next: () => {
        void this.router.navigate(['/login'], { queryParams: { senha: 'alterada' } });
      },
      error: (e: { status?: number; error?: { errors?: Record<string, string[]> } }) => {
        this.enviando.set(false);
        const erros = e?.error?.errors ?? {};
        const primeira = Object.values(erros)[0]?.[0];
        this.erro.set(
          primeira ||
            (e?.status === 429
              ? 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'
              : 'Não foi possível trocar a senha agora. Tente novamente.'),
        );
      },
    });
  }
}
