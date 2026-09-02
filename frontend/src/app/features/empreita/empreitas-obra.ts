import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { Empreita } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { RedimensionarColunas } from '../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../shared/ordenacao/ordenacao';
import { ResumoContratoEmpreita } from './empreita.models';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';

type ColunaEmpreitaObra =
  | 'numero'
  | 'descricao'
  | 'empreiteiro'
  | 'total'
  | 'totalPago'
  | 'ultimaSolicitacao';

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
  protected readonly formatarData = formatarData;

  /** `resumo()`/pagamentos desta obra, usados só pra derivar Total/Pago/Última solicitação por empreita. */
  private readonly resumoContrato = signal<ResumoContratoEmpreita[]>([]);
  private readonly pagamentosPorEmpreita = signal<Map<string, Pagamento[]>>(new Map());

  /**
   * 26/08/2026, pedido do Lucas: "não está aparecendo o valor total da
   * empreita e nem o valor pago" — `total_empreita`/`total_pago` nunca são
   * gravados no banco (campos mortos), então precisam ser calculados aqui:
   * Total = soma do contrato (Empreiteiro + Reserva) de cada item, via
   * `resumoObra`; Pago = soma dos pagamentos já CONFIRMADOS desta empreita
   * (mesma semântica de "Realizado" usada em EAP/Mapa — pendente não conta).
   */
  private readonly totalPorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const r of this.resumoContrato()) {
      const soma = r.itens.reduce((s, it) => s + (it.contratoEmp || 0) + (it.contratoReserva || 0), 0);
      mapa.set(r.id, soma);
    }
    return mapa;
  });

  /**
   * "% Medida" (01/09/2026, pedido do Lucas) — um percentual só por
   * empreita, ponderado pelo valor do contrato do EMPREITEIRO de cada
   * item (não soma a Reserva: ela é uma retenção discricionária,
   * desvinculada do avanço físico — ponderar por ela distorceria "quanto
   * do serviço já foi de fato executado"). `medicaoAtual` herda o
   * acumulado quando nulo (mesma regra de sempre — ver
   * `ItemEmpreita.medicaoAtual`). Itens sem contrato lançado saem do
   * cálculo (dividir por zero); sem nenhum item com contrato, `null`
   * (a tela mostra "—").
   */
  private readonly percentualMedidoPorEmpreita = computed(() => {
    const mapa = new Map<string, number | null>();
    for (const r of this.resumoContrato()) {
      let somaPonderada = 0;
      let somaContrato = 0;
      for (const item of r.itens) {
        const contrato = item.contratoEmp || 0;
        if (contrato <= 0) continue;
        const medido = item.medicaoAtual ?? item.medicaoAcum ?? 0;
        somaPonderada += medido * contrato;
        somaContrato += contrato;
      }
      mapa.set(r.id, somaContrato > 0 ? somaPonderada / somaContrato : null);
    }
    return mapa;
  });

  private readonly pagoPorEmpreita = computed(() => {
    const mapa = new Map<string, number>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      mapa.set(
        id,
        lista.filter((p) => p.status === 'confirmado').reduce((s, p) => s + p.valorTotal, 0),
      );
    }
    return mapa;
  });

  /** Data do pagamento mais recentemente SOLICITADO (pendente ou confirmado), pra coluna "Última solicitação". */
  private readonly ultimaSolicitacaoPorEmpreita = computed(() => {
    const mapa = new Map<string, string>();
    for (const [id, lista] of this.pagamentosPorEmpreita()) {
      const datas = lista.map((p) => p.dataSolicitacao).filter(Boolean).sort();
      if (datas.length) mapa.set(id, datas[datas.length - 1]);
    }
    return mapa;
  });

  protected readonly pagamentosModalEmpreita = signal<Empreita | null>(null);
  protected readonly pagamentosModalLista = computed(() => {
    const empreita = this.pagamentosModalEmpreita();
    if (!empreita) return [];
    return [...(this.pagamentosPorEmpreita().get(empreita.id) ?? [])].sort((a, b) =>
      (b.dataSolicitacao || '').localeCompare(a.dataSolicitacao || ''),
    );
  });

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
        case 'ultimaSolicitacao': return this.ultimaSolicitacao(e);
      }
    }),
  );

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    forkJoin({
      empreitas: this.api.listarEmpreitas(this.obraId()),
      resumo: this.api.obterResumoContratoEmpreitas(this.obraId()),
      pagamentosBrutos: this.api.listarPagamentos({ obraId: this.obraId(), origemTipo: 'empreita' }),
    }).subscribe({
      next: ({ empreitas, resumo, pagamentosBrutos }) => {
        this.empreitas.set(empreitas);
        this.resumoContrato.set(resumo);

        const porEmpreita = new Map<string, Pagamento[]>();
        for (const bruto of pagamentosBrutos) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const empreitaId = pagamento.origem?.tipo === 'empreita' ? pagamento.origem.refId : null;
          if (!empreitaId) continue;
          const lista = porEmpreita.get(empreitaId) ?? [];
          lista.push(pagamento);
          porEmpreita.set(empreitaId, lista);
        }
        this.pagamentosPorEmpreita.set(porEmpreita);

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
    return this.totalPorEmpreita().get(empreita.id) ?? 0;
  }

  /** Texto pronto pra célula "% Medida" — "—" quando não há contrato lançado ainda. */
  protected percentualMedidoTexto(empreita: Empreita): string {
    const percentual = this.percentualMedidoPorEmpreita().get(empreita.id);
    if (percentual === null || percentual === undefined) return '—';
    return `${percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  protected totalPago(empreita: Empreita): number {
    return this.pagoPorEmpreita().get(empreita.id) ?? 0;
  }

  protected ultimaSolicitacao(empreita: Empreita): string {
    return this.ultimaSolicitacaoPorEmpreita().get(empreita.id) ?? '';
  }

  protected abrir(empreita: Empreita): void {
    void this.router.navigate(['/obras', this.obraId(), 'empreitas', empreita.id]);
  }

  /** 26/08/2026, pedido do Lucas: clicar no valor "Pago" mostra a lista de pagamentos desta empreita. */
  protected abrirPagamentos(empreita: Empreita, evento: Event): void {
    evento.stopPropagation();
    this.pagamentosModalEmpreita.set(empreita);
  }

  protected fecharPagamentos(): void {
    this.pagamentosModalEmpreita.set(null);
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
