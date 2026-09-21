import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { FormulaCamposService } from './shared/numero/formula-campos.service';
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
  // Idem: o listener de fórmulas (`=conta` nos campos de valor) é global.
  private readonly formulaCampos = inject(FormulaCamposService);
}
