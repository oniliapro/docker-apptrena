import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ChaveStatusObra, Obra, ObraPayload, STATUS_OBRA } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData } from '../../core/utils/formato';

type FiltroStatus = 'todos' | 'confirmada' | 'aberta';

/**
 * Lista de Obras — tela nova, vinda do protótipo do Lucas.
 *
 * É o ponto de entrada para a página de obra: cada linha leva às abas
 * (EAP, medições, pagamentos…). No app vanilla não existia equivalente
 * — os módulos eram páginas soltas, sem uma obra como contexto.
 */
@Component({
  selector: 'app-obras',
  imports: [ReactiveFormsModule],
  templateUrl: './obras.html',
  styleUrl: './obras.scss',
})
export class Obras implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected readonly filtro = signal<FiltroStatus>('todos');
  protected readonly busca = signal('');

  protected readonly formatarData = formatarData;

  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);

  protected readonly statusOpcoes = STATUS_OBRA;

  protected readonly formulario = this.fb.nonNullable.group({
    mapNumber: [''],
    obraNome: ['', [Validators.required]],
    cliente: ['', [Validators.required]],
    responsavel: [''],
    dataBase: [''],
    periodo: [''],
    status: ['a_iniciar' as ChaveStatusObra],
    obs: [''],
  });

  protected readonly listaFiltrada = computed(() => {
    const filtro = this.filtro();
    const termo = this.busca().trim().toLowerCase();

    return this.obras().filter((obra) => {
      if (filtro === 'confirmada' && !obra.is_confirmed) return false;
      if (filtro === 'aberta' && obra.is_confirmed) return false;
      if (!termo) return true;

      const alvo = [obra.obra_nome, obra.cliente, obra.responsavel, obra.map_number]
        .join(' ')
        .toLowerCase();
      return alvo.includes(termo);
    });
  });

  ngOnInit(): void {
    this.carregar();
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

  protected mudarFiltro(evento: Event): void {
    this.filtro.set((evento.target as HTMLSelectElement).value as FiltroStatus);
  }

  protected mudarBusca(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
  }

  protected acessar(obra: Obra): void {
    void this.router.navigate(['/obras', obra.id, 'eap']);
  }

  protected remover(obra: Obra): void {
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
    this.formulario.reset({ status: 'a_iniciar' });
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
      map_number: v.mapNumber.trim() || null,
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

  /**
   * Troca de status direto na lista — sem precisar reabrir a obra.
   *
   * Manda o payload COMPLETO da obra (não só `{status}`) por segurança:
   * o backend tem um efeito colateral em PUTs parciais (ver comentário em
   * ObraController::validated(), já corrigido em 03/08/2026, mas vale
   * manter essa defesa aqui também) — um PUT que só envia `status` podia
   * apagar nome/cliente/etc. de uma obra existente.
   */
  protected mudarStatusInline(obra: Obra, evento: Event): void {
    const status = (evento.target as HTMLSelectElement).value as ChaveStatusObra;
    const anterior = obra.status;

    this.obras.update((lista) => lista.map((o) => (o.id === obra.id ? { ...o, status } : o)));

    const payload: Partial<ObraPayload> = {
      map_number: obra.map_number ?? null,
      obra_nome: obra.obra_nome ?? '',
      cliente: obra.cliente ?? '',
      data_base: obra.data_base ?? null,
      responsavel: obra.responsavel ?? '',
      local_obra: obra.local_obra ?? '',
      periodo: obra.periodo ?? '',
      obs: obra.obs ?? '',
      bdi_scope: obra.bdi_scope ?? 'global',
      bdi_mode: obra.bdi_mode ?? 'pct',
      bdi_percent: obra.bdi_percent ?? 0,
      bdi_value: obra.bdi_value ?? 0,
      is_confirmed: obra.is_confirmed ?? false,
      confirmed_at: obra.confirmed_at ?? null,
      status,
    };

    this.api.atualizarObra(obra.id, payload).subscribe({
      error: () => {
        this.obras.update((lista) =>
          lista.map((o) => (o.id === obra.id ? { ...o, status: anterior } : o)),
        );
        window.alert('Não foi possível atualizar o status da obra.');
      },
    });
  }
}
