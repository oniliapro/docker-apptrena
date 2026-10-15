import { Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

/**
 * Campo de senha com o botão "mostrar/ocultar" (15/10/2026) — usado no login, na
 * redefinição de senha e no painel da plataforma.
 *
 * Recebe o `FormControl` pronto (em vez de ser um `ControlValueAccessor`) para
 * manter a validação e o `markAsTouched` nas mãos de quem tem o formulário.
 */
@Component({
  selector: 'app-campo-senha',
  imports: [ReactiveFormsModule],
  templateUrl: './campo-senha.html',
  styleUrl: './campo-senha.scss',
})
export class CampoSenha {
  readonly controle = input.required<FormControl<string>>();
  readonly autocomplete = input<string>('current-password');
  readonly placeholder = input<string>('');
  readonly idCampo = input<string | null>(null);

  protected readonly visivel = signal(false);

  protected alternar(): void {
    this.visivel.update((v) => !v);
  }
}
