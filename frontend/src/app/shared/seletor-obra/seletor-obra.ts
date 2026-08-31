import { Component, computed, input, output, signal } from '@angular/core';

import { Obra } from '../../core/models/api.models';

/**
 * Combobox de obra com busca (26/08/2026, pedido do Lucas: permitir criar
 * Mapa/Empreita/Pagamento a partir das listas gerais, escolhendo a obra
 * ali mesmo, em vez de precisar entrar na obra primeiro). Não existia
 * nenhum seletor de obra por id no app até agora — o mais perto era o
 * `<select>` simples de FILTRO das listas gerais (só filtra os registros
 * já carregados, não atribui obra a um registro novo).
 *
 * `input`/`output` puros (não é um `ControlValueAccessor` de Reactive
 * Forms) — mesmo princípio de `mudarFiltroObra` etc. já usado nas listas
 * gerais: o componente pai guarda o id escolhido num signal próprio, fora
 * do FormGroup dos outros campos.
 */
@Component({
  selector: 'app-seletor-obra',
  templateUrl: './seletor-obra.html',
  styleUrl: './seletor-obra.scss',
  host: {
    '(document:click)': 'fechar()',
  },
})
export class SeletorObra {
  readonly obras = input.required<readonly Obra[]>();
  readonly valor = input<string>('');
  readonly mudou = output<string>();

  protected readonly aberto = signal(false);
  protected readonly busca = signal('');

  protected readonly obraSelecionada = computed(
    () => this.obras().find((o) => o.id === this.valor()) ?? null,
  );

  protected readonly filtradas = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    if (!termo) return this.obras();
    return this.obras().filter((o) => (o.obra_nome ?? '').toLowerCase().includes(termo));
  });

  protected alternar(evento: Event): void {
    evento.stopPropagation();
    this.busca.set('');
    this.aberto.update((v) => !v);
  }

  protected fechar(): void {
    this.aberto.set(false);
  }

  protected manterAberto(evento: Event): void {
    evento.stopPropagation();
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected selecionar(obra: Obra): void {
    this.mudou.emit(obra.id);
    this.aberto.set(false);
  }
}
