import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { MedicaoResumo } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';

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

  protected podeExcluir(medicao: MedicaoResumo): boolean {
    return medicao.sequencia === this.maiorSequencia();
  }

  protected excluir(medicao: MedicaoResumo, evento: Event): void {
    evento.stopPropagation();
    if (!this.podeExcluir(medicao)) return;
    if (!window.confirm(`Excluir a medição nº ${medicao.sequencia}?`)) return;

    this.api.excluirMedicao(medicao.id).subscribe({
      next: () => this.medicoes.update((lista) => lista.filter((m) => m.id !== medicao.id)),
      error: () => window.alert('Não foi possível excluir a medição.'),
    });
  }
}
