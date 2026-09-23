import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { DiaCalendario, construirSemanas, mesComPasso, mesDoMaisRecente } from './rdo-calendario';
import { RdoContratanteLink, RdoRegistro } from './rdo.models';
import { RdoService } from './rdo.service';

/**
 * Lista de RDOs (F8, 22/09/2026, pedido do Lucas) — o calendário É a lista:
 * marca os dias com RDO, clicar numa data filtra a lista pra aquele dia,
 * clicar num RDO abre a edição. "Novo RDO" cria o relatório de fato (no
 * editor, `rdo.ts`).
 *
 * Um componente só, dois lugares (mesmo padrão de Mapas/MapasObra):
 *  - `/rdo` (menu lateral) — `obraId` vazio, todas as obras que o usuário
 *    enxerga; cada RDO mostra o nome da obra, e "Novo RDO" pede pra escolher
 *    a obra primeiro (o RDO não existe fora de uma obra).
 *  - `/obras/:id/rdo` (aba da obra) — `obraId` preenchido pela rota, só os
 *    RDOs daquela obra; "Novo RDO" já sabe a obra. O link de acompanhamento
 *    do contratante (por ser um link DA OBRA, não de um RDO) mora aqui.
 */
@Component({
  selector: 'app-rdo-lista',
  imports: [DatePipe],
  templateUrl: './rdo-lista.html',
  styleUrl: './rdo-lista.scss',
})
export class RdoLista implements OnInit {
  private readonly api = inject(ApiService);
  private readonly rdoApi = inject(RdoService);
  private readonly router = inject(Router);

  /** Vazio = lista geral (todas as obras); preenchido pela rota `/obras/:id/rdo`. */
  readonly obraId = input<string>('', { alias: 'id' });
  protected readonly geral = computed(() => !this.obraId());

  protected readonly registros = signal<RdoRegistro[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Só no modo geral — pra "Novo RDO" pedir a obra antes de criar. */
  protected readonly obras = signal<Obra[]>([]);
  protected readonly obraEscolhida = signal('');

  /** Só no modo por obra — link de acompanhamento do contratante (é da OBRA, não de um RDO). */
  protected readonly links = signal<RdoContratanteLink[]>([]);

  protected readonly mesAtual = signal<Date>(new Date());
  protected readonly diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  /** Dia clicado no calendário — filtra a lista abaixo; null = mostra tudo. */
  protected readonly dataFiltro = signal<string | null>(null);

  protected readonly rotuloMes = computed(() =>
    this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  protected readonly semanas = computed<DiaCalendario<RdoRegistro>[][]>(() =>
    construirSemanas(this.mesAtual(), this.registros(), (r) => r.data),
  );

  protected readonly listaFiltrada = computed(() => {
    const dia = this.dataFiltro();
    const lista = this.registros();
    return dia ? lista.filter((r) => r.data.substring(0, 10) === dia) : lista;
  });

  ngOnInit(): void {
    this.carregar();

    if (this.geral()) {
      this.api.listarObras().subscribe({ next: (obras) => this.obras.set(obras), error: () => void 0 });
    } else {
      this.rdoApi.listarLinks(this.obraId()).subscribe({ next: (links) => this.links.set(links), error: () => void 0 });
    }
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    // 100 = teto do backend (`RdoController::index`) — dá pra navegar uns
    // bons meses de histórico sem paginação; se a empresa passar disso,
    // os RDOs mais antigos somem do calendário (limitação conhecida).
    this.rdoApi.listar(this.obraId() || undefined, 100).subscribe({
      next: (registros) => {
        this.registros.set(registros);
        const mes = mesDoMaisRecente(registros, (r) => r.data);
        this.mesAtual.set(mes ?? new Date());
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os relatórios.');
        this.carregando.set(false);
      },
    });
  }

  protected mudarMes(passo: number): void {
    this.mesAtual.set(mesComPasso(this.mesAtual(), passo));
  }

  /** Clicar num dia do calendário filtra a lista; clicar de novo no mesmo dia limpa o filtro. */
  protected selecionarDia(iso: string): void {
    this.dataFiltro.set(this.dataFiltro() === iso ? null : iso);
  }

  protected limparFiltro(): void {
    this.dataFiltro.set(null);
  }

  protected novoRdo(): void {
    const obraId = this.geral() ? this.obraEscolhida() : this.obraId();
    if (!obraId) {
      this.erro.set('Escolha uma obra antes de criar um RDO novo.');
      return;
    }
    void this.router.navigate(['/obras', obraId, 'rdo', 'novo']);
  }

  protected abrir(registro: RdoRegistro): void {
    void this.router.navigate(['/obras', registro.obra_id, 'rdo', registro.id]);
  }

  protected excluir(registro: RdoRegistro, evento: Event): void {
    evento.stopPropagation();
    if (!confirm(`Excluir o RDO nº ${registro.numero}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    this.rdoApi.excluir(registro.id).subscribe({
      next: () => {
        this.aviso.set('Relatório excluído.');
        this.registros.update((lista) => lista.filter((r) => r.id !== registro.id));
      },
      error: () => this.erro.set('Não foi possível excluir este relatório.'),
    });
  }

  protected gerarLink(email: string): void {
    this.rdoApi.criarLink(this.obraId(), email || null).subscribe({
      next: () => {
        this.aviso.set('Link de acompanhamento gerado.');
        this.rdoApi.listarLinks(this.obraId()).subscribe((links) => this.links.set(links));
      },
      error: () => this.erro.set('Não foi possível gerar o link.'),
    });
  }

  protected revogarLink(link: RdoContratanteLink): void {
    this.rdoApi.revogarLink(link.id).subscribe({
      next: () => {
        this.aviso.set('Link revogado.');
        this.rdoApi.listarLinks(this.obraId()).subscribe((links) => this.links.set(links));
      },
      error: () => this.erro.set('Não foi possível revogar o link.'),
    });
  }

  protected urlPublica(link: RdoContratanteLink): string {
    return `${window.location.origin}/publico/rdo/${link.token}`;
  }

  protected copiarLink(link: RdoContratanteLink): void {
    navigator.clipboard?.writeText(this.urlPublica(link));
    this.aviso.set('Link copiado.');
  }
}
