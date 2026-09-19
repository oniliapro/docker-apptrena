import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ModalEscService } from './shared/modal/modal-esc.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Instanciado aqui (raiz) de propósito: o listener de Esc dos popups precisa
  // existir antes do AppShell, cujo Esc fecha menus, pra ter prioridade.
  private readonly modalEsc = inject(ModalEscService);
}
