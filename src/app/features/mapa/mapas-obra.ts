import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';

import { Mapa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { normalizarPagamento } from '../pagamentos/pagamentos-calc';
import { Pagamento } from '../pagamentos/pagamentos.models';

/**
 * Lista de mapas de UMA obra, com criação de mapas novos.
 *
 * Substitui, dentro da obra, o antigo editor único de mapa (que
 * assumia "1 mapa por obra" e persistia na ponte chave-valor). Agora uma
 * obra pode ter vários mapas nomeados — cada um é um registro de verdade
 * em `/mapas`, e esta tela é o índice deles (task "várias por obra",
 * 31/07/2026).
 */
@Component({
  selector: 'app-mapas-obra',
  imports: [ReactiveFormsModule],
  templateUrl: './mapas-obra.html',
  styleUrl: './mapas-obra.scss',
})
export class MapasObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly obraId = input.required<string>({ alias: 'id' });

  protected readonly mapas = signal<Mapa[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly formatarData = formatarData;
  protected readonly formatarMoeda = formatarMoeda;

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  protected readonly formulario = this.fb.nonNullable.group({
    numeroMapa: [''],
    descricao: ['', [Validators.required]],
    cliente: [''],
    responsavelObra: [''],
    responsavelMapa: [''],
    dataFinalizacao: [''],
  });

  ngOnInit(): void {
    this.carregar();
  }

  /**
   * Pagamentos gerados a partir de cada mapa desta obra —
   * `mapaId -> Pagamento[]`. Mesma correção da lista geral de Mapas
   * (04/08/2026): o campo `total_mapa` salvo no mapa vinha zerado em
   * vários casos reais, então o Total passou a ser a soma dos pagamentos
   * de verdade vinculados por `origem.refId`.
   */
  private readonly pagamentosPorMapa = signal<Map<string, Pagamento[]>>(new Map());

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarMapas(this.obraId()).subscribe({
      next: (mapas) => {
        this.mapas.set(mapas);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os mapas.');
        this.carregando.set(false);
      },
    });

    this.api
      .listarPagamentos({ obraId: this.obraId() })
      .pipe(catchError(() => of([])))
      .subscribe((lista) => {
        const porMapa = new Map<string, Pagamento[]>();
        for (const bruto of lista) {
          const pagamento = normalizarPagamento(bruto as Record<string, unknown>);
          const origem = pagamento.origem;
          if (origem?.tipo !== 'mapa' || !origem.refId) continue;
          const atual = porMapa.get(origem.refId) ?? [];
          atual.push(pagamento);
          porMapa.set(origem.refId, atual);
        }
        this.pagamentosPorMapa.set(porMapa);
      });
  }

  protected numero(mapa: Mapa): string {
    return String(mapa['numero_mapa'] ?? '—');
  }

  protected descricao(mapa: Mapa): string {
    return String(mapa['descricao'] ?? '—');
  }

  protected cliente(mapa: Mapa): string {
    return String(mapa['cliente'] ?? '—');
  }

  protected dataFinalizacao(mapa: Mapa): string {
    const bruto = mapa['data_finalizacao'];
    return bruto ? formatarData(String(bruto)) : '—';
  }

  protected total(mapa: Mapa): number {
    const lista = this.pagamentosPorMapa().get(mapa.id) ?? [];
    return lista.reduce((soma, p) => soma + (Number(p.valorTotal) || 0), 0);
  }

  protected abrir(mapa: Mapa): void {
    void this.router.navigate(['/obras', this.obraId(), 'mapas', mapa.id]);
  }

  protected remover(mapa: Mapa, evento: Event): void {
    evento.stopPropagation();
    if (!window.confirm(`Excluir o mapa "${this.descricao(mapa)}"?`)) return;

    this.api.excluirMapa(mapa.id).subscribe({
      next: () => this.mapas.update((lista) => lista.filter((m) => m.id !== mapa.id)),
      error: () => window.alert('Não foi possível excluir o mapa.'),
    });
  }

  // ------------------------------------------------------------------
  // Formulário — Novo mapa
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
      numero_mapa: v.numeroMapa.trim(),
      descricao: v.descricao.trim(),
      cliente: v.cliente.trim(),
      responsavel_obra: v.responsavelObra.trim(),
      responsavel_mapa: v.responsavelMapa.trim(),
      data_finalizacao: v.dataFinalizacao || null,
      frete_particular: 0,
      modo_manual: false,
    };

    this.salvando.set(true);
    this.api.criarMapa(payload).subscribe({
      next: (mapa) => {
        this.salvando.set(false);
        this.fechar();
        this.router.navigate(['/obras', this.obraId(), 'mapas', mapa.id]);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar o mapa.');
      },
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }
}
