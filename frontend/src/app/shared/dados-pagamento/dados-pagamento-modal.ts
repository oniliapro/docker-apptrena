import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';

import { DadosPagamentoService, OpcaoPix } from './dados-pagamento';

/**
 * Popup "Dados de pagamento" (27/09/2026) — passo antes de copiar uma
 * mensagem de solicitação de pagamento: um campo de PIX por fornecedor
 * envolvido, com sugestão do que já está cadastrado (Fornecedores/
 * Profissionais) e aceitando texto livre quando não há nada cadastrado.
 * Confirmar devolve um Map nome → texto do PIX pra quem chamou montar a
 * mensagem (o formato da mensagem em si é de cada tela, não deste popup).
 */
@Component({
  selector: 'app-dados-pagamento-modal',
  templateUrl: './dados-pagamento-modal.html',
  styleUrl: './dados-pagamento-modal.scss',
})
export class DadosPagamentoModal implements OnInit {
  private readonly api = inject(DadosPagamentoService);

  /** Nomes únicos dos fornecedores/profissionais que vão aparecer na mensagem. */
  readonly nomes = input.required<string[]>();
  readonly titulo = input('Dados de pagamento');

  readonly confirmado = output<Map<string, string>>();
  readonly fechar = output<void>();

  protected readonly opcoesPorNome = signal<Map<string, OpcaoPix[]>>(new Map());
  protected readonly valores = signal<Map<string, string>>(new Map());
  protected readonly carregando = signal(true);

  protected readonly linhas = computed(() =>
    [...new Set(this.nomes())].map((nome) => ({
      nome,
      opcoes: this.opcoesPorNome().get(nome) ?? [],
      datalistId: 'pix-' + nome.replace(/[^a-zA-Z0-9]+/g, '-'),
    })),
  );

  ngOnInit(): void {
    const nomes = [...new Set(this.nomes())];
    if (!nomes.length) {
      this.carregando.set(false);
      return;
    }

    let restantes = nomes.length;
    const opcoes = new Map<string, OpcaoPix[]>();
    const valoresIniciais = new Map<string, string>();

    nomes.forEach((nome) => {
      this.api.buscarOpcoesPix(nome).subscribe({
        next: (lista) => {
          opcoes.set(nome, lista);
          if (lista.length) valoresIniciais.set(nome, lista[0].valor);
          if (--restantes === 0) {
            this.opcoesPorNome.set(opcoes);
            this.valores.set(valoresIniciais);
            this.carregando.set(false);
          }
        },
        error: () => {
          if (--restantes === 0) {
            this.opcoesPorNome.set(opcoes);
            this.valores.set(valoresIniciais);
            this.carregando.set(false);
          }
        },
      });
    });
  }

  protected valorDe(nome: string): string {
    return this.valores().get(nome) ?? '';
  }

  protected atualizarValor(nome: string, valor: string): void {
    this.valores.update((mapa) => new Map(mapa).set(nome, valor));
  }

  protected fecharClick(): void {
    this.fechar.emit();
  }

  protected confirmarClick(): void {
    this.confirmado.emit(this.valores());
  }
}
