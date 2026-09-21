import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Obra, ObraPayload, rotuloStatusObra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarData } from '../../core/utils/formato';
import { Cliente, Responsavel } from '../cadastros/cadastros.models';
import { exportarTabelaXlsx } from '../../shared/exportar-xlsx/exportar-xlsx';
import { BarraSelecao, AcaoLista } from '../../shared/barra-selecao/barra-selecao';
import { SelecaoMultipla, avisarFalhasDeExclusao, confirmarExclusaoEmLote, excluirEmLote } from '../../shared/selecao-lista/selecao-lista';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import { CadastroObraModal, EventoSalvarObra } from './cadastro-obra-modal/cadastro-obra-modal';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';

const CHAVE_CLIENTES = 'controleObra.clientes.v1';
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

type FiltroStatus = 'todos' | 'confirmada' | 'aberta';
type ColunaObra = 'map_number' | 'obra_nome' | 'cliente' | 'responsavel' | 'data_base' | 'status';

/**
 * Lista de Obras — tela nova, vinda do protótipo do Lucas.
 *
 * É o ponto de entrada para a página de obra: cada linha leva às abas
 * (EAP, medições, pagamentos…). No app vanilla não existia equivalente
 * — os módulos eram páginas soltas, sem uma obra como contexto.
 */
@Component({
  selector: 'app-obras',
  imports: [RedimensionarColunas, CadastroObraModal, BarraSelecao],
  templateUrl: './obras.html',
  styleUrl: './obras.scss',
})
export class Obras implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly armazenamento = inject(ArmazenamentoService);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly filtro = signal<FiltroStatus>('todos');
  protected readonly busca = signal('');

  protected readonly formatarData = formatarData;
  protected readonly rotuloStatusObra = rotuloStatusObra;

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  /**
   * Clientes/Responsáveis ativos, pro dropdown com busca do formulário
   * (20/08/2026, pedido do Lucas: campos deixam de ser texto livre e
   * passam a sugerir os cadastros). Lidos diretamente da ponte
   * chave-valor, no mesmo padrão já usado em `ObraDetalhe` — não dá pra
   * usar `CadastroStore` aqui porque ele só suporta uma instância por
   * componente e precisamos de duas listas ao mesmo tempo.
   */
  protected readonly clientesAtivos = signal<Cliente[]>([]);
  protected readonly responsaveisAtivos = signal<Responsavel[]>([]);

  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaObra> | null>(null);
  protected readonly setaOrdenacao = setaOrdenacao;

  protected alternarOrdenacaoColuna(coluna: ColunaObra): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected readonly listaFiltrada = computed(() => {
    const filtro = this.filtro();
    const termo = this.busca().trim().toLowerCase();

    const filtrada = this.obras().filter((obra) => {
      if (filtro === 'confirmada' && !obra.is_confirmed) return false;
      if (filtro === 'aberta' && obra.is_confirmed) return false;
      if (!termo) return true;

      const alvo = [obra.obra_nome, obra.cliente, obra.responsavel, obra.map_number]
        .join(' ')
        .toLowerCase();
      return alvo.includes(termo);
    });

    return ordenarPor(filtrada, this.ordenacao(), (obra, coluna) =>
      coluna === 'status' ? rotuloStatusObra(obra.status) : obra[coluna],
    );
  });

  /**
   * Exporta a lista JÁ FILTRADA/ordenada pra planilha Excel (31/08/2026,
   * pedido do Lucas).
   */
  protected readonly exportandoXlsx = signal(false);

  protected async exportarXlsx(): Promise<void> {
    this.exportandoXlsx.set(true);
    try {
      await exportarTabelaXlsx(
        'Obras',
        [
          { header: 'Nº', key: 'numero', width: 10 },
          { header: 'Obra', key: 'nome', width: 34 },
          { header: 'Cliente', key: 'cliente', width: 24 },
          { header: 'Responsável', key: 'responsavel', width: 22 },
          { header: 'Data base', key: 'dataBase', width: 14 },
          { header: 'Status', key: 'status', width: 16 },
          { header: 'EAP', key: 'eap', width: 14 },
        ],
        this.listaFiltrada().map((obra) => ({
          numero: obra.map_number || '',
          nome: obra.obra_nome || '(sem nome)',
          cliente: obra.cliente || '',
          responsavel: obra.responsavel || '',
          dataBase: this.formatarData(obra.data_base) || '',
          status: rotuloStatusObra(obra.status),
          eap: obra.is_confirmed ? 'Confirmada' : 'Em aberto',
        })),
        'obras.xlsx',
      );
    } catch {
      window.alert('Não foi possível gerar a planilha.');
    } finally {
      this.exportandoXlsx.set(false);
    }
  }

  ngOnInit(): void {
    this.carregar();
    this.carregarClientesEResponsaveis();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar as obras.');
        this.carregando.set(false);
      },
    });
  }

  private carregarClientesEResponsaveis(): void {
    this.armazenamento.ler(CHAVE_CLIENTES).subscribe((bruto) => {
      this.clientesAtivos.set(this.interpretarLista<Cliente>(bruto).filter((c) => c.ativo !== false));
    });

    this.armazenamento.ler(CHAVE_RESPONSAVEIS).subscribe((bruto) => {
      this.responsaveisAtivos.set(this.interpretarLista<Responsavel>(bruto).filter((r) => r.ativo !== false));
    });
  }

  private interpretarLista<T>(bruto: string | null): T[] {
    if (!bruto) return [];
    try {
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? (dados as T[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Código interno da obra (ex.: "OBR-014") — identificador único,
   * gerado pelo sistema na criação (20/08/2026, pedido do Lucas). Mesmo
   * padrão "escaneia o maior sufixo, +1" já usado pelos códigos dos
   * cadastros (CLI-NNN, EMP-NNN…), pra não reaproveitar número de uma
   * obra excluída. `protected` (não `private`) porque o template passa
   * pro `CadastroObraModal` como `[proximoCodigo]`.
   */
  protected proximoCodigo(): string {
    const maior = this.obras().reduce((max, obra) => {
      const combinacao = /^OBR-(\d+)$/.exec(obra.map_number?.trim() ?? '');
      const numero = combinacao ? Number(combinacao[1]) : 0;
      return numero > max ? numero : max;
    }, 0);
    return `OBR-${String(maior + 1).padStart(3, '0')}`;
  }

  protected mudarFiltro(evento: Event): void {
    this.filtro.set((evento.target as HTMLSelectElement).value as FiltroStatus);
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  /** Clicar na linha abre a obra (20/08/2026, pedido do Lucas — tirou o botão "Acessar obra"). */
  protected acessar(obra: Obra): void {
    void this.router.navigate(['/obras', obra.id, 'eap']);
  }

  // ---- Seleção múltipla (20/09/2026): clicar na linha abre a obra; marcar habilita "Abrir" (com 1) e "Excluir". ----
  protected readonly selecao = new SelecaoMultipla<Obra>((o) => o.id);
  protected readonly selecionadas = computed(() => this.selecao.selecionados(this.listaFiltrada()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected abrirSelecionada(): void {
    const [primeira] = this.selecionadas();
    if (primeira) this.acessar(primeira);
  }

  /** Botão ✖ da linha (21/09/2026): exclui só esta obra, com a confirmação de sempre. */
  protected removerUm(obra: Obra): void {
    if (!window.confirm(`Excluir a obra "${obra.obra_nome || 'sem nome'}"?`)) return;

    this.api.excluirObra(obra.id).subscribe({
      next: () => this.obras.update((lista) => lista.filter((o) => o.id !== obra.id)),
      error: () => window.alert('Não foi possível excluir a obra.'),
    });
  }

  protected aoAcaoLista(chave: string): void {
    if (chave !== 'excluir') return;
    const alvos = this.selecionadas();
    if (
      !alvos.length ||
      !confirmarExclusaoEmLote(
        alvos.length,
        'obra',
        'obras',
        'Os dados lançados nelas (EAP, mapas, empreitas, pagamentos…) deixam de aparecer.',
        alvos.map((o) => o.obra_nome || '(sem nome)'),
      )
    ) {
      return;
    }

    excluirEmLote(alvos, (obra) => this.api.excluirObra(obra.id)).subscribe(({ excluidos, falhas }) => {
      const ids = new Set(excluidos.map((o) => o.id));
      this.obras.update((lista) => lista.filter((o) => !ids.has(o.id)));
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'obra(s)', (o) => o.obra_nome || '(sem nome)');
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Nova obra (07/09/2026, movido pro `CadastroObraModal`
  // compartilhado com `ObraDetalhe` — ver comentário na classe dele).
  // ------------------------------------------------------------------
  protected novo(): void {
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  /**
   * `acessosPendentes` (07/09/2026) — só vem preenchido se o usuário
   * mexeu em "Quem acessa esta obra" durante a criação; sem obra_id
   * ainda naquele momento, só dá pra gravar de verdade agora que a obra
   * foi criada.
   */
  protected salvarNovaObra(evento: EventoSalvarObra): void {
    this.salvando.set(true);
    this.api.criarObra(evento.payload as ObraPayload).subscribe({
      next: (obra) => {
        this.obras.update((lista) => [...lista, obra]);
        this.salvando.set(false);
        this.fechar();

        if (evento.acessosPendentes) {
          this.api.salvarAcessosObra(obra.id, evento.acessosPendentes).subscribe({
            error: () => window.alert('A obra foi criada, mas não foi possível salvar os acessos definidos.'),
          });
        }
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar a obra.');
      },
    });
  }
}
