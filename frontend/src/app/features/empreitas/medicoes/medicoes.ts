import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../../core/utils/formato';

/** Uma medição já registrada de uma empreita. */
interface RegistroMedicao {
  date?: string;
  competencia?: string;
  obs?: string;
  totals?: {
    pagarEmp?: number;
    reservarPgto?: number;
    totalPeriodo?: number;
  };
}

interface EmpreitaComRegistros {
  id: string;
  obraNumber?: string;
  numeroEmpreita?: string;
  descricaoEmpreita?: string;
  registros?: RegistroMedicao[];
}

/**
 * Histórico de medições de uma empreita — portado de
 * js/empreitas/02-medicoes.js.
 *
 * Mostra os períodos já fechados, com o que foi pago e o que foi retido
 * como reserva em cada um. É o registro que sustenta a conversa com o
 * empreiteiro sobre o que já foi medido.
 */
@Component({
  selector: 'app-medicoes',
  imports: [RouterLink],
  templateUrl: './medicoes.html',
  styleUrl: './medicoes.scss',
})
export class Medicoes implements OnInit {
  private readonly api = inject(ApiService);

  /** Id da empreita, vindo da rota. */
  readonly id = input.required<string>();

  protected readonly empreita = signal<EmpreitaComRegistros | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarMoeda = formatarMoeda;

  protected readonly registros = computed(() => this.empreita()?.registros ?? []);

  /** Somatório de tudo que já foi medido nesta empreita. */
  protected readonly acumulado = computed(() =>
    this.registros().reduce(
      (totais, registro) => ({
        pagar: totais.pagar + (Number(registro.totals?.pagarEmp) || 0),
        reserva: totais.reserva + (Number(registro.totals?.reservarPgto) || 0),
        total: totais.total + (Number(registro.totals?.totalPeriodo) || 0),
      }),
      { pagar: 0, reserva: 0, total: 0 },
    ),
  );

  ngOnInit(): void {
    this.api.obterEmpreita(this.id()).subscribe({
      next: (dados) => {
        this.empreita.set(dados as unknown as EmpreitaComRegistros);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar esta empreita.');
        this.carregando.set(false);
      },
    });
  }

  protected campo(chave: 'obraNumber' | 'numeroEmpreita' | 'descricaoEmpreita'): string {
    return String(this.empreita()?.[chave] ?? '') || '—';
  }

  /**
   * Aceita data ISO ou já formatada — o formato antigo gravava as duas
   * coisas em `date`, dependendo de onde o registro foi criado.
   */
  protected data(iso: string | undefined): string {
    const texto = String(iso ?? '');
    if (!texto) return '—';
    return texto.includes('-') ? formatarData(texto) : texto;
  }
}
