import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { agoraDeParede } from '../../core/utils/fuso';
import { urlDoApp } from '../../core/utils/url-app';
import { DiaCalendario, construirSemanas, mesComPasso, mesDoMaisRecente } from './rdo-calendario';
import { RdoFilaService } from './rdo-fila.service';
import { RdoContratanteLink, RdoRegistro } from './rdo.models';
import { RdoService } from './rdo.service';

/** Linha da lista: um RDO do servidor ou (app) um RDO ainda na fila do celular. */
type ItemLista = RdoRegistro & { naFila?: 'pendente' | 'erro'; erroFila?: string | null };

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
  private readonly fila = inject(RdoFilaService);

  /** App ComTrena (09/10/2026) — no site é sempre `false`. */
  protected readonly ehApp = environment.app;
  private estavaEnviando = false;

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

  protected readonly mesAtual = signal<Date>(agoraDeParede());
  protected readonly diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  /** Dia clicado no calendário — filtra a lista abaixo; null = mostra tudo. */
  protected readonly dataFiltro = signal<string | null>(null);

  protected readonly rotuloMes = computed(() =>
    this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );

  /**
   * App: RDOs lançados no celular que ainda não chegaram ao servidor entram
   * na lista e no calendário junto com os do servidor, marcados como "no
   * celular". No site a fila é sempre vazia.
   */
  protected readonly todos = computed<ItemLista[]>(() => {
    const obra = this.obraId();
    const locais: ItemLista[] = this.fila
      .itens()
      .filter((i) => !obra || i.obraId === obra)
      .map((i) => ({
        id: i.id,
        empresa_id: '',
        obra_id: i.obraId,
        numero: null,
        data: typeof i.payload['data'] === 'string' ? (i.payload['data'] as string) : i.criadoEm.substring(0, 10),
        status: 'rascunho',
        obra: { id: i.obraId, obra_nome: i.obraNome ?? '' },
        naFila: i.estado,
        erroFila: i.ultimoErro,
      }) as unknown as ItemLista);
    const idsLocais = new Set(locais.map((l) => l.id));

    return [...locais, ...this.registros().filter((r) => !idsLocais.has(r.id))].sort((a, b) =>
      b.data.localeCompare(a.data),
    );
  });

  protected readonly semanas = computed<DiaCalendario<ItemLista>[][]>(() =>
    construirSemanas(this.mesAtual(), this.todos(), (r) => r.data),
  );

  protected readonly listaFiltrada = computed(() => {
    const dia = this.dataFiltro();
    const lista = this.todos();
    return dia ? lista.filter((r) => r.data.substring(0, 10) === dia) : lista;
  });

  constructor() {
    // App: terminou uma rodada de envio da fila → atualiza a lista do servidor
    // (o RDO que estava "no celular" agora aparece com número).
    effect(() => {
      const enviando = this.fila.enviando();
      if (this.estavaEnviando && !enviando) untracked(() => this.carregar(true));
      this.estavaEnviando = enviando;
    });
  }

  ngOnInit(): void {
    this.carregar();

    if (this.geral()) {
      this.api.listarObras().subscribe({
        next: (obras) => {
          this.obras.set(obras);
          if (this.ehApp) {
            // Com uma obra só, já deixa escolhida para o "+ Novo RDO".
            if (obras.length === 1 && !this.obraEscolhida()) this.obraEscolhida.set(obras[0].id);
            void this.fila.prepararParaUsoSemInternet(obras.slice(0, 20).map((o) => o.id));
          }
        },
        error: () => void 0,
      });
    } else {
      if (this.ehApp) void this.fila.prepararParaUsoSemInternet([this.obraId()]);
      this.rdoApi.listarLinks(this.obraId()).subscribe({ next: (links) => this.links.set(links), error: () => void 0 });
    }
  }

  /** `silencioso`: atualiza sem trocar a tela por "Carregando…" (app, depois de um envio). */
  private carregar(silencioso = false): void {
    if (!silencioso) this.carregando.set(true);
    this.erro.set(null);

    // 100 = teto do backend (`RdoController::index`) — dá pra navegar uns
    // bons meses de histórico sem paginação; se a empresa passar disso,
    // os RDOs mais antigos somem do calendário (limitação conhecida).
    this.rdoApi.listar(this.obraId() || undefined, 100).subscribe({
      next: (registros) => {
        this.registros.set(registros);
        const mes = mesDoMaisRecente(registros, (r) => r.data);
        this.mesAtual.set(mes ?? agoraDeParede());
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

  protected excluir(registro: ItemLista, evento: Event): void {
    evento.stopPropagation();
    if (registro.naFila) {
      if (confirm('Excluir este RDO do celular? Ele ainda não foi enviado ao servidor e vai ser perdido.')) {
        void this.fila.remover(registro.id).then(() => this.aviso.set('RDO excluído do celular.'));
      }
      return;
    }
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

  /** Endereço que o contratante abre — respeita o `/app/` de produção (ver `urlDoApp`). */
  protected urlPublica(link: RdoContratanteLink): string {
    return urlDoApp(`publico/rdo/${link.token}`);
  }

  protected async copiarLink(link: RdoContratanteLink): Promise<void> {
    const url = this.urlPublica(link);
    try {
      await navigator.clipboard.writeText(url);
      this.aviso.set('Link copiado.');
    } catch {
      // Sem permissão de área de transferência (http, navegador antigo): mostra o
      // endereço pra copiar à mão em vez de dizer que copiou sem ter copiado.
      window.prompt('Copie o link abaixo:', url);
    }
  }
}
