import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Tela reservada — usada pelas rotas que existem no protótipo do Lucas
 * mas ainda não foram construídas (Clientes, Obras, Responsáveis,
 * Empreiteiros, Relatórios).
 *
 * Existir como rota navegável, em vez de link morto, deixa a estrutura
 * do menu completa e navegável desde já. O título vem de `data.titulo`
 * na definição da rota.
 */
@Component({
  selector: 'app-pagina-reservada',
  template: `
    <h1>{{ titulo }}</h1>
    <div class="painel reservada">
      <div class="painel-titulo">Área reservada</div>
      <p class="atenuado">
        Esta tela entra numa próxima etapa, seguindo o mesmo padrão visual das demais.
      </p>
    </div>
  `,
  styles: `
    :host { display: block; }
    .reservada { max-width: 720px; padding: 28px; }
    p { margin: 0; }
  `,
})
export class PaginaReservada {
  private readonly rota = inject(ActivatedRoute);
  protected readonly titulo = String(this.rota.snapshot.data['titulo'] ?? 'Página');
}
