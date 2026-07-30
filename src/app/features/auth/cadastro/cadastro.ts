import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

/** Confere se senha e confirmação batem. */
function senhasIguais(controle: AbstractControl): ValidationErrors | null {
  const senha = controle.get('senha')?.value;
  const confirmacao = controle.get('confirmacao')?.value;
  return senha && confirmacao && senha !== confirmacao ? { senhasDiferentes: true } : null;
}

/**
 * Criar conta — portado de html/cadastro.html.
 *
 * O cadastro cria a **empresa** junto com o usuário: quem se registra
 * vira o administrador de uma empresa nova, com 14 dias de teste. É por
 * isso que o nome da empresa é obrigatório aqui e não numa configuração
 * posterior — sem empresa, o usuário não tem onde gravar nada (todo o
 * armazenamento é isolado por empresa).
 */
@Component({
  selector: 'app-cadastro',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './cadastro.html',
  styleUrl: './cadastro.scss',
})
export class Cadastro {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = this.fb.nonNullable.group(
    {
      empresa: ['', [Validators.required, Validators.maxLength(150)]],
      nome: ['', [Validators.required, Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email]],
      // Mínimo de 8 caracteres para casar com a regra do backend.
      senha: ['', [Validators.required, Validators.minLength(8)]],
      confirmacao: ['', [Validators.required]],
    },
    { validators: senhasIguais },
  );

  protected criar(): void {
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);

    const { empresa, nome, email, senha } = this.formulario.getRawValue();

    this.auth
      .registrar({ empresa, name: nome, email, password: senha })
      .subscribe({
        // O backend já devolve o token: entra direto, sem pedir login.
        next: () => void this.router.navigateByUrl('/inicio'),
        error: (e: { status?: number; error?: { errors?: Record<string, string[]> } }) => {
          this.enviando.set(false);

          const validacao = e?.error?.errors;
          if (e?.status === 422 && validacao) {
            // Mostra a primeira mensagem que o backend devolveu — mais
            // útil que um "dados inválidos" genérico.
            const primeira = Object.values(validacao)[0]?.[0];
            this.erro.set(primeira ?? 'Verifique os dados informados.');
            return;
          }

          this.erro.set(
            e?.status === 429
              ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
              : 'Não foi possível criar a conta. Verifique sua conexão.',
          );
        },
      });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected get senhasDiferentes(): boolean {
    const grupo = this.formulario;
    return Boolean(
      grupo.hasError('senhasDiferentes') && grupo.get('confirmacao')?.touched,
    );
  }
}
