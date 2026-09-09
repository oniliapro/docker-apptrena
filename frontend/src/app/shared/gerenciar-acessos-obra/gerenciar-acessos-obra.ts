import { Component, input, linkedSignal, output } from '@angular/core';

import { AcessoObraUsuario } from '../../core/models/api.models';

/**
 * "Quem acessa esta obra" — extraído de `ObraDetalhe` (07/09/2026, pedido
 * do Lucas: o mesmo botão precisa existir também no CADASTRO de obra, não
 * só depois de já existir). Componente "burro" de propósito (sem
 * `ApiService` próprio): recebe a lista pronta e devolve, via `salvar`, o
 * que o usuário marcou — quem persiste é sempre o componente-pai, porque
 * os dois usos têm o MESMO formato de dado mas jeitos diferentes de
 * gravar:
 *
 * - `ObraDetalhe` (obra já existe): busca via `ApiService.listarAcessosObra(obraId)`
 *   e grava na hora com `salvarAcessosObra(obraId, lista)`.
 * - `Obras` (formulário de "Nova obra"): a obra ainda não tem `id`, então
 *   não dá pra buscar/gravar por obra — a lista nasce de
 *   `ApiService.listarUsuarios()` (todo usuário secundário da empresa,
 *   com "vê"/"lança" true por padrão, mesmo default do backend) e fica
 *   pendente até a obra ser criada de verdade, aí sim grava com
 *   `salvarAcessosObra(idNovo, lista)`.
 */
@Component({
  selector: 'app-gerenciar-acessos-obra',
  templateUrl: './gerenciar-acessos-obra.html',
  styleUrl: './gerenciar-acessos-obra.scss',
})
export class GerenciarAcessosObra {
  readonly acessos = input.required<AcessoObraUsuario[]>();
  readonly carregando = input(false);
  readonly salvando = input(false);

  readonly salvar = output<AcessoObraUsuario[]>();
  readonly fechar = output<void>();

  /** Cópia local editável — `linkedSignal` porque `acessos` é `input.required()` (ver mesmo padrão/motivo em `EditarPagamentoModal.rascunho`). */
  protected readonly lista = linkedSignal<AcessoObraUsuario[]>(() => this.acessos());

  protected alternar(usuario: AcessoObraUsuario, campo: 'podeVer' | 'podeLancar'): void {
    this.lista.update((atual) =>
      atual.map((u) => (u.userId === usuario.userId ? { ...u, [campo]: !u[campo] } : u)),
    );
  }

  protected salvarClick(): void {
    this.salvar.emit(this.lista());
  }
}
