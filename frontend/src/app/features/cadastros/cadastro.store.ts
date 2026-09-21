import { Injectable, computed, inject, signal } from '@angular/core';

import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { gerarId } from '../eap/eap-normalize';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';

/** Registro de cadastro: qualquer coisa com id. */
export interface ComId {
  id: string;
}

/**
 * Base dos cadastros simples (Clientes, Responsáveis, Empreiteiros).
 *
 * Os três têm a mesma mecânica — listar, criar, editar, remover, buscar —
 * mudando só os campos. Em vez de repetir isso três vezes, cada cadastro
 * instancia esta classe com sua chave de armazenamento e seu
 * normalizador.
 *
 * A persistência usa a ponte chave-valor do backend, como os demais
 * módulos: o `laravel-backend` ainda não tem endpoints próprios para
 * estes cadastros, e criar tabelas agora exigiria mexer no backend — que
 * é justamente o que está em espera.
 */
@Injectable()
export class CadastroStore<T extends ComId> {
  private readonly armazenamento = inject(ArmazenamentoService);

  /** Verdadeiro quando os dados estão indo só para o navegador. */
  readonly modoLocal = this.armazenamento.modoLocal;

  private chave = '';
  private normalizar: (bruto: Record<string, unknown>) => T = (b) => b as unknown as T;
  private camposBusca: Array<keyof T> = [];

  readonly registros = signal<T[]>([]);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly busca = signal('');
  readonly filtroAtivos = signal<'todos' | 'ativos' | 'inativos'>('todos');

  /**
   * Filtro extra por coluna (19/08/2026, pedido do Lucas) — ex.: Tipo
   * (PF/PJ) em Clientes/Empreiteiros/Fornecedores. Fica genérico aqui (uma
   * função sobre o registro, não um campo fixo) porque os 4 cadastros têm
   * campos diferentes — cada tela pluga sua própria checagem sem o store
   * genérico precisar conhecer o campo específico dela.
   */
  readonly filtroExtra = signal<((registro: T) => boolean) | null>(null);

  /** Ordenação por cabeçalho clicado (18/08/2026, pedido do Lucas) — compartilhada pelos 4 cadastros. */
  readonly ordenacao = signal<EstadoOrdenacao<Extract<keyof T, string>> | null>(null);
  readonly setaOrdenacao = setaOrdenacao;

  alternarOrdenacaoColuna(coluna: Extract<keyof T, string>): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const filtro = this.filtroAtivos();

    const extra = this.filtroExtra();

    const filtrada = this.registros().filter((registro) => {
      const ativo = (registro as unknown as { ativo?: boolean }).ativo !== false;
      if (filtro === 'ativos' && !ativo) return false;
      if (filtro === 'inativos' && ativo) return false;
      if (extra && !extra(registro)) return false;
      if (!termo) return true;

      return this.camposBusca.some((campo) =>
        String(registro[campo] ?? '')
          .toLowerCase()
          .includes(termo),
      );
    });

    return ordenarPor(filtrada, this.ordenacao(), (registro, coluna) => registro[coluna]);
  });

  /** Configura o cadastro. Chamado uma vez, no início do componente. */
  configurar(
    chave: string,
    normalizar: (bruto: Record<string, unknown>) => T,
    camposBusca: Array<keyof T>,
  ): void {
    this.chave = chave;
    this.normalizar = normalizar;
    this.camposBusca = camposBusca;
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.armazenamento.ler(this.chave).subscribe({
      next: (value) => {
        const lista = this.interpretar(value);
        this.registros.set(lista.map((item) => this.normalizar(item)));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados.');
        this.carregando.set(false);
      },
    });
  }

  private salvar(): void {
    this.salvando.set(true);

    this.armazenamento.gravar(this.chave, JSON.stringify(this.registros())).subscribe({
      next: () => this.salvando.set(false),
      error: () => this.salvando.set(false),
    });
  }

  /** Insere se não existir, atualiza se existir. */
  gravar(registro: T): void {
    const comId = registro.id ? registro : { ...registro, id: gerarId() };

    this.registros.update((lista) => {
      const existe = lista.some((r) => r.id === comId.id);
      return existe ? lista.map((r) => (r.id === comId.id ? comId : r)) : [...lista, comId];
    });

    this.salvar();
  }

  remover(id: string): void {
    this.registros.update((lista) => lista.filter((r) => r.id !== id));
    this.salvar();
  }

  /** Exclusão em lote: uma gravação só para todos os ids. */
  removerVarios(ids: readonly string[]): void {
    const alvo = new Set(ids);
    this.registros.update((lista) => lista.filter((r) => !alvo.has(r.id)));
    this.salvar();
  }

  /**
   * Liga e desliga o registro em vez de excluir.
   * Cliente inativo não pode ser apagado sem perder o histórico das obras
   * que ele contratou — desativar preserva o passado.
   */
  alternarAtivo(id: string): void {
    this.registros.update((lista) =>
      lista.map((registro) => {
        if (registro.id !== id) return registro;
        const atual = (registro as unknown as { ativo?: boolean }).ativo !== false;
        return { ...registro, ativo: !atual };
      }),
    );
    this.salvar();
  }

  obter(id: string): T | undefined {
    return this.registros().find((r) => r.id === id);
  }

  private interpretar(bruto: string | null): Array<Record<string, unknown>> {
    if (!bruto) return [];
    try {
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? dados : [];
    } catch {
      return [];
    }
  }
}
