import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { MedicaoResumo } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, confirmarExclusaoEmLote } from '../../shared/selecao-lista/selecao-lista';

/**
 * Lista de medições de UMA obra (23/08/2026, pedido do Lucas) — histórico
 * sequencial (`sequencia` 1, 2, 3…), com "Nova medição" desabilitado
 * enquanto existir uma em rascunho (só uma por vez, ver `MedicaoController`)
 * e exclusão só liberada na mais recente (força excluir de trás pra
 * frente — mesma regra do backend, replicada aqui só pra desabilitar o
 * botão errado antes de tentar).
 */
@Component({
  selector: 'app-medicoes-obra',
  imports: [BarraSelecao],
  templateUrl: './medicoes-obra.html',
  styleUrl: './medicoes-obra.scss',
})
export class MedicoesObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly medicoes = signal<MedicaoResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly criando = signal(false);

  protected readonly formatarData = formatarData;

  protected readonly listaOrdenada = computed(() =>
    [...this.medicoes()].sort((a, b) => a.sequencia - b.sequencia),
  );

  protected readonly existeRascunho = computed(() =>
    this.medicoes().some((m) => m.status === 'rascunho'),
  );

  protected readonly maiorSequencia = computed(() =>
    this.medicoes().reduce((max, m) => Math.max(max, m.sequencia), 0),
  );

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarMedicoes(this.obraId()).subscribe({
      next: (medicoes) => {
        this.medicoes.set(medicoes);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as medições.');
        this.carregando.set(false);
      },
    });
  }

  protected novaMedicao(): void {
    if (this.existeRascunho() || this.criando()) return;

    this.criando.set(true);
    this.api.criarMedicao(this.obraId()).subscribe({
      next: (medicao) => {
        this.criando.set(false);
        void this.router.navigate(['/obras', this.obraId(), 'medicoes', medicao.id]);
      },
      error: () => {
        this.criando.set(false);
        window.alert('Não foi possível criar a medição.');
      },
    });
  }

  protected abrir(medicao: MedicaoResumo): void {
    void this.router.navigate(['/obras', this.obraId(), 'medicoes', medicao.id]);
  }

  // ---- Seleção (20/09/2026): clicar na linha abre a medição; marcar habilita "Abrir" (com 1) e "Excluir". ----
  protected readonly selecao = new SelecaoMultipla<MedicaoResumo>((m) => m.id);
  protected readonly selecionadas = computed(() => this.selecao.selecionados(this.listaOrdenada()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected abrirSelecionada(): void {
    const [primeira] = this.selecionadas();
    if (primeira) this.abrir(primeira);
  }

  /**
   * Regra do backend: só a medição mais recente pode ser excluída, então em
   * lote só vale a SEQUÊNCIA das mais recentes (ex.: 5, 4 e 3 estando a 5 em
   * último; pular a 4 não pode). Exclui da mais nova para a mais antiga, uma
   * por vez, e para na primeira falha.
   */
  protected podeExcluir(medicao: MedicaoResumo): boolean {
    return medicao.sequencia === this.maiorSequencia();
  }

  /** Botão ✖ da linha (21/09/2026): só a medição mais recente, como sempre foi. */
  protected removerUm(medicao: MedicaoResumo): void {
    if (!this.podeExcluir(medicao)) return;
    if (!window.confirm(`Excluir a medição nº ${medicao.sequencia}?`)) return;

    this.api.excluirMedicao(medicao.id).subscribe({
      next: () => this.medicoes.update((lista) => lista.filter((m) => m.id !== medicao.id)),
      error: () => window.alert('Não foi possível excluir a medição.'),
    });
  }

  protected async aoAcaoLista(chave: string): Promise<void> {
    if (chave !== 'excluir') return;
    const alvos = [...this.selecionadas()].sort((a, b) => b.sequencia - a.sequencia);
    if (!alvos.length) return;

    const maior = this.maiorSequencia();
    const emSequencia = alvos.every((m, i) => m.sequencia === maior - i);
    if (!emSequencia) {
      window.alert(
        'Só a medição mais recente pode ser excluída. Marque a última e, se quiser, as imediatamente anteriores ' +
          '(sem pular nenhuma).',
      );
      return;
    }

    const nomes = alvos.map((m) => `Medição nº ${m.sequencia}`);
    if (!confirmarExclusaoEmLote(alvos.length, 'medição', 'medições', '', nomes)) return;

    const excluidas: MedicaoResumo[] = [];
    for (const medicao of alvos) {
      try {
        await firstValueFrom(this.api.excluirMedicao(medicao.id));
        excluidas.push(medicao);
      } catch {
        break;
      }
    }

    const ids = new Set(excluidas.map((m) => m.id));
    this.medicoes.update((lista) => lista.filter((m) => !ids.has(m.id)));
    this.selecao.limpar();
    if (excluidas.length < alvos.length) {
      window.alert(`Não foi possível excluir a medição nº ${alvos[excluidas.length].sequencia}${excluidas.length ? ' (as anteriores da lista foram excluídas)' : ''}.`);
    }
  }
}
