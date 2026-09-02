import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ChaveStatusObra, Obra, ObraPayload, STATUS_OBRA, rotuloStatusObra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { formatarData } from '../../core/utils/formato';
import { Cliente, Responsavel } from '../cadastros/cadastros.models';
import { exportarTabelaXlsx } from '../../shared/exportar-xlsx/exportar-xlsx';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
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
  imports: [ReactiveFormsModule, RedimensionarColunas],
  templateUrl: './obras.html',
  styleUrl: './obras.scss',
})
export class Obras implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
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

  protected readonly statusOpcoes = STATUS_OBRA;

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

  protected readonly formulario = this.fb.nonNullable.group({
    mapNumber: [''],
    obraNome: ['', [Validators.required]],
    cliente: [''],
    responsavel: [''],
    dataBase: [''],
    periodo: [''],
    status: ['a_iniciar' as ChaveStatusObra],
    obs: [''],
  });

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
   * obra excluída.
   */
  private proximoCodigo(): string {
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

  protected remover(obra: Obra, evento: Event): void {
    evento.stopPropagation();
    if (!window.confirm(`Excluir a obra "${obra.obra_nome || 'sem nome'}"?`)) return;

    this.api.excluirObra(obra.id).subscribe({
      next: () => this.obras.update((lista) => lista.filter((o) => o.id !== obra.id)),
      error: () => window.alert('Não foi possível excluir a obra.'),
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Nova obra
  // ------------------------------------------------------------------
  protected novo(): void {
    this.formulario.reset({ status: 'a_iniciar', mapNumber: this.proximoCodigo() });
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

    const payload: ObraPayload = {
      // map_number e data_base são as únicas colunas realmente NULLable no
      // banco (obras.map_number, obras.data_base) — as demais colunas de
      // texto/BDI são NOT NULL com default (ver migration
      // 2024_01_01_000000_create_controle_obra_schema.php), então mandar
      // null nelas quebra a constraint. String vazia e os defaults do
      // schema (bdi_scope=global, bdi_mode=pct, bdi_percent/value=0) são o
      // equivalente correto de "não preenchido" aqui.
      map_number: v.mapNumber.trim() || this.proximoCodigo(),
      obra_nome: v.obraNome.trim(),
      cliente: v.cliente.trim(),
      data_base: v.dataBase || null,
      responsavel: v.responsavel.trim(),
      local_obra: '',
      periodo: v.periodo.trim(),
      obs: v.obs.trim(),
      bdi_scope: 'global',
      bdi_mode: 'pct',
      bdi_percent: 0,
      bdi_value: 0,
      is_confirmed: false,
      confirmed_at: null,
      status: v.status,
    };

    this.salvando.set(true);
    this.api.criarObra(payload).subscribe({
      next: (obra) => {
        this.obras.update((lista) => [...lista, obra]);
        this.salvando.set(false);
        this.fechar();
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar a obra.');
      },
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }
}
