import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  Empreita,
  Mapa,
  Obra,
  Pagamento,
  RegistroDiario,
  dadosDaEmpresa,
  rotuloStatusObra,
} from '../../core/models/api.models';
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
  protected readonly rotuloStatusObra = rotuloStatusObra;

  // ---- Indicadores ----
  protected readonly obrasEmAndamento = signal<string | number>('—');
  protected readonly obrasTotais = signal<number | null>(null);
  protected readonly obrasFinalizadas = signal<string | number>('—');
  protected readonly assinatura = signal('—');
  protected readonly assinaturaNota = signal('');

  // ---- Listas ----
  protected readonly obras = signal<Obra[]>([]);
  protected readonly diarios = signal<RegistroDiario[]>([]);
  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly empreitas = signal<Empreita[]>([]);
  protected readonly pagamentos = signal<Pagamento[]>([]);

  protected readonly carregandoObras = signal(true);
  protected readonly carregandoDiarios = signal(true);
  protected readonly carregandoMapas = signal(true);
  protected readonly carregandoEmpreitas = signal(true);
  protected readonly carregandoPagamentos = signal(true);

  /** Quantos itens cada card mostra antes do "ver mais". */
  private readonly LIMITE = 5;

  ngOnInit(): void {
    this.carregarObras();
    this.carregarAssinatura();
    this.carregarDiarios();
    this.carregarMapas();
    this.carregarEmpreitas();
    this.carregarPagamentos();
  }

  private carregarObras(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        // `status` é o campo de verdade pro andamento da obra (03/08/2026)
        // — antes disso o dashboard usava `is_confirmed` (que é só sobre a
        // EAP/orçamento estar travado) como se fosse "obra finalizada",
        // o que é enganoso: uma obra pode ter a EAP confirmada e ainda
        // estar em andamento, ou nem ter começado.
        const emAndamento = obras.filter((o) => o.status === 'em_andamento').length;
        const finalizadas = obras.filter((o) => o.status === 'finalizada').length;
        const emAberto = obras.filter((o) => o.status !== 'cancelada' && o.status !== 'finalizada');

        this.obras.set(emAberto.slice(0, this.LIMITE));
        this.obrasEmAndamento.set(emAndamento);
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

  /**
   * Card "Pagamentos" — ficou como placeholder estático desde antes da
   * migração pro endpoint relacional (03/08/2026): antes não existia
   * como listar "todos os pagamentos" nenhum lugar. Mesmo padrão dos
   * cards de Mapas/Empreitas acima.
   */
  private carregarPagamentos(): void {
    this.api.listarPagamentos().subscribe({
      next: (pagamentos) => {
        this.pagamentos.set(pagamentos.slice(0, this.LIMITE));
        this.carregandoPagamentos.set(false);
      },
      error: () => this.carregandoPagamentos.set(false),
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
