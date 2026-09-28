import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PermissoesService } from '../../../core/services/permissoes.service';
import { ABAS_OBRA } from '../obra-detalhe/obra-abas';

/**
 * Tela de entrada de uma obra (28/09/2026, item 16 do lote de melhorias:
 * "ao clicar numa obra, em vez de abrir a EAP direto, mostra uma tela com
 * uma grade de botões (uma por aba) pra escolher; cada aba ganha um botão
 * '← Voltar' pra essa tela" — a faixa horizontal de abas tinha virado
 * muitas e ficou difícil de navegar).
 *
 * Caminho vazio dentro de `obras/:id` (ver `app.routes.ts`, `abasDaObra`)
 * — substitui o antigo `redirectTo: 'eap'`. Os links são relativos
 * (`[routerLink]="aba.caminho"`), resolvidos contra a rota atual
 * (`obras/:id`), sem precisar do id da obra aqui.
 */
@Component({
  selector: 'app-obra-inicio',
  imports: [RouterLink],
  templateUrl: './obra-inicio.html',
  styleUrl: './obra-inicio.scss',
})
export class ObraInicio {
  private readonly permissoes = inject(PermissoesService);

  protected readonly abas = computed(() =>
    ABAS_OBRA.filter((aba) => !aba.moduloChave || this.permissoes.podeModulo(aba.moduloChave, 'usar')),
  );
}
