import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { CampoSenha } from '../../../shared/campo-senha/campo-senha';

/** Tela de login — substitui html/login.html. */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, CampoSenha],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  /** Só em desenvolvimento: atalho para revisar as telas sem backend. */
  protected readonly permiteDemonstracao = !environment.producao;

  /** Build de revisão: o acesso é só pelo botão de demonstração. */
  protected readonly ehRevisao = environment.revisao;

  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  /** "Senha alterada" depois de concluir a redefinição (a tela de redefinição redireciona pra cá com `?senha=alterada`). */
  protected readonly aviso = signal<string | null>(
    this.rota.snapshot.queryParamMap.get('senha') === 'alterada'
      ? 'Senha alterada com sucesso. Entre com a nova senha.'
      : null,
  );

  /** Leva o e-mail já digitado para a tela de recuperação, pra a pessoa não ter que digitar de novo. */
  protected emailParaRecuperacao(): Record<string, string> {
    const email = this.formulario.controls.email.value.trim();
    return email ? { email } : {};
  }

  protected readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected entrarSemServidor(): void {
    if (!this.auth.entrarModoDemonstracao()) return;
    void this.router.navigateByUrl('/inicio');
  }

  protected entrar(): void {
    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.erro.set(null);

    const { email, senha } = this.formulario.getRawValue();

    this.auth.entrar(email, senha).subscribe({
      next: () => {
        const destino = this.rota.snapshot.queryParamMap.get('redirect') ?? '/inicio';
        void this.router.navigateByUrl(destino);
      },
      error: (e: { status?: number; error?: { errors?: { email?: string[] } } }) => {
        this.enviando.set(false);
        // O servidor responde 422 com a mensagem certa (senha errada x conta suspensa) — usa a dele
        // quando existe, em vez de sempre dizer "senha incorreta".
        const doServidor = e?.error?.errors?.email?.[0];
        this.erro.set(
          doServidor ||
            (e?.status === 422 || e?.status === 401
              ? 'E-mail ou senha incorretos.'
              : 'Não foi possível entrar. Verifique sua conexão e tente novamente.'),
        );
      },
    });
  }
}
