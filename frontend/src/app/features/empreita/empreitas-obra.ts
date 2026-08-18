import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { Empreita } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarMoeda } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';

type ColunaEmpreitaObra = 'numero' | 'descricao' | 'empreiteiro' | 'total' | 'totalPago';

/**
 * Lista de empreitas de UMA obra, com criação de empreitas novas.
 *
 * Substitui, dentro da obra, o antigo editor único de empreita (que
 * assumia "1 empreita por obra" e persistia na ponte chave-valor). Agora
 * uma obra pode ter várias empreitas — contratos diferentes com
 * empreiteiros diferentes — cada uma é um registro de verdade em
 * `/empreitas`, e esta tela é o índice delas (task "várias por obra",
 * 31/07/2026).
 */
@Component({
  selector: 'app-empreitas-obra',
  imports: [ReactiveFormsModule, RedimensionarColunas],
  templateUrl: './empreitas-obra.html',
  styleUrl: './empreitas-obra.scss',
})
export class EmpreitasObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  protected readonly formulario = this.fb.nonNullable.group({
    numeroEmpreita: [''],
    descricaoEmpreita: ['', [Validators.required]],
    empreiteiro: [''],
    dataMedicao: [''],
  });

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaEmpreitaObra> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;
  protected readonly busca = signal('');

  protected alternarOrdenacaoColuna(coluna: ColunaEmpreitaObra): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  private readonly listaFiltrada = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    if (!termo) return this.empreitas();
    return this.empreitas().filter((e) =>
      [this.numero(e), this.descricao(e), this.empreiteiro(e)].join(' ').toLowerCase().includes(termo),
    );
  });

  protected readonly listaOrdenada = computed(() =>
    ordenarPor(this.listaFiltrada(), this.ordenacao(), (e, coluna) => {
      switch (coluna) {
        case 'numero': return this.numero(e);
        case 'descricao': return this.descricao(e);
        case 'empreiteiro': return this.empreiteiro(e);
        case 'total': return this.total(e);
        case 'totalPago': return this.totalPago(e);
      }
    }),
  );

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarEmpreitas(this.obraId()).subscribe({
      next: (empreitas) => {
        this.empreitas.set(empreitas);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as empreitas.');
        this.carregando.set(false);
      },
    });
  }

  protected numero(empreita: Empreita): string {
    return String(empreita['numero_empreita'] ?? '—');
  }

  protected descricao(empreita: Empreita): string {
    return String(empreita['descricao_empreita'] ?? '—');
  }

  protected empreiteiro(empreita: Empreita): string {
    return String(empreita['empreiteiro'] ?? '—');
  }

  protected total(empreita: Empreita): number {
    return Number(empreita['total_empreita'] ?? 0);
  }

  protected totalPago(empreita: Empreita): number {
    return Number(empreita['total_pago'] ?? 0);
  }

  protected abrir(empreita: Empreita): void {
    void this.router.navigate(['/obras', this.obraId(), 'empreitas', empreita.id]);
  }

  protected remover(empreita: Empreita, evento: Event): void {
    evento.stopPropagation();
    if (!window.confirm(`Excluir a empreita "${this.descricao(empreita)}"?`)) return;

    this.api.excluirEmpreita(empreita.id).subscribe({
      next: () => this.empreitas.update((lista) => lista.filter((e) => e.id !== empreita.id)),
      error: () => window.alert('Não foi possível excluir a empreita.'),
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Nova empreita
  // ------------------------------------------------------------------
  protected novo(): void {
    this.formulario.reset();
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();

    const payload = {
      obra_id: this.obraId(),
      numero_empreita: v.numeroEmpreita.trim(),
      descricao_empreita: v.descricaoEmpreita.trim(),
      empreiteiro: v.empreiteiro.trim(),
      medicao_date: v.dataMedicao || null,
    };

    this.salvando.set(true);
    this.api.criarEmpreita(payload).subscribe({
      next: (empreita) => {
        this.salvando.set(false);
        this.fechar();
        this.router.navigate(['/obras', this.obraId(), 'empreitas', empreita.id]);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar a empreita.');
      },
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }
}
