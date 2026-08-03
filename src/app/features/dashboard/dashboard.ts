import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Empreita, Mapa, Obra, RegistroDiario, dadosDaEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { diasRestantes, formatarData } from '../../core/utils/formato';

/**
 * Página inicial — visão geral de todas as obras.
 *
 * Estrutura vinda do protótipo do Lucas: cinco indicadores no topo e,
 * abaixo, cards de lista com os registros mais recentes de cada módulo.
 *
 * Cada bloco carrega por conta própria. Se um falhar, os outros
 * continuam aparecendo — comportamento herdado de
 * js/home/01-dashboard.js e mantido de propósito: um dashboard que
 * some inteiro porque um endpoint caiu é pior do que um com lacunas.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly formatarData = formatarData;

  // ---- Indicadores ----
  protected readonly obrasAtivas = signal<string | number>('—');
  protected readonly obrasTotais = signal<number | null>(null);
  protected readonly obrasFinalizadas = signal<string | number>('—');
  protected readonly assinatura = signal('—');
  protected readonly assinaturaNota = signal('');

  // ---- Listas ----
  protected readonly obras = signal<Obra[]>([]);
  protected readonly diarios = signal<RegistroDiario[]>([]);
  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly empreitas = signal<Empreita[]>([]);

  protected readonly carregandoObras = signal(true);
  protected readonly carregandoDiarios = signal(true);
  protected readonly carregandoMapas = signal(true);
  protected readonly carregandoEmpreitas = signal(true);

  /** Quantos itens cada card mostra antes do "ver mais". */
  private readonly LIMITE = 5;

  ngOnInit(): void {
    this.carregarObras();
    this.carregarAssinatura();
    this.carregarDiarios();
    this.carregarMapas();
    this.carregarEmpreitas();
  }

  private carregarObras(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        // `is_confirmed` é sobre a EAP (orçamento travado), não sobre a
        // obra estar concluída — não existe (ainda) um status de "obra
        // finalizada" no backend. Os rótulos na tela refletem isso
        // (03/08/2026, achado na varredura geral de bugs).
        const finalizadas = obras.filter((o) => o.is_confirmed).length;
        this.obras.set(obras.filter((o) => !o.is_confirmed).slice(0, this.LIMITE));
        this.obrasAtivas.set(obras.length - finalizadas);
        this.obrasFinalizadas.set(finalizadas);
        this.obrasTotais.set(obras.length);
        this.carregandoObras.set(false);
      },
      error: () => this.carregandoObras.set(false),
    });
  }

  private carregarAssinatura(): void {
    this.api.obterUsuarioAtual().subscribe({
      next: ({ user }) => {
        const empresa = dadosDaEmpresa(user);
        if (!empresa) return;

        const status = String(empresa.assinatura_status ?? '').toLowerCase();

        if (status === 'trial') {
          const dias = diasRestantes(empresa.assinatura_valida_ate);
          this.assinatura.set('Teste');
          this.assinaturaNota.set(
            dias !== null ? `${Math.max(dias, 0)} dias restantes` : 'período de teste',
          );
          return;
        }

        this.assinatura.set(status === 'ativa' ? 'Ativa' : (empresa.assinatura_status ?? '—'));
        if (empresa.assinatura_valida_ate) {
          this.assinaturaNota.set(`renova em ${formatarData(empresa.assinatura_valida_ate)}`);
        }
      },
      error: () => undefined,
    });
  }

  private carregarDiarios(): void {
    this.api.listarDiario({ limite: this.LIMITE }).subscribe({
      next: (registros) => {
        this.diarios.set(registros.slice(0, this.LIMITE));
        this.carregandoDiarios.set(false);
      },
      error: () => this.carregandoDiarios.set(false),
    });
  }

  private carregarMapas(): void {
    this.api.listarMapas().subscribe({
      next: (mapas) => {
        this.mapas.set(mapas.slice(0, this.LIMITE));
        this.carregandoMapas.set(false);
      },
      error: () => this.carregandoMapas.set(false),
    });
  }

  private carregarEmpreitas(): void {
    this.api.listarEmpreitas().subscribe({
      next: (empreitas) => {
        this.empreitas.set(empreitas.slice(0, this.LIMITE));
        this.carregandoEmpreitas.set(false);
      },
      error: () => this.carregandoEmpreitas.set(false),
    });
  }

  // ---- Leitura tolerante dos campos (snake_case novo / camelCase antigo) ----
  protected campo(registro: Record<string, unknown>, ...chaves: string[]): string {
    for (const chave of chaves) {
      const valor = registro?.[chave];
      if (valor !== undefined && valor !== null && valor !== '') return String(valor);
    }
    return '—';
  }
}
