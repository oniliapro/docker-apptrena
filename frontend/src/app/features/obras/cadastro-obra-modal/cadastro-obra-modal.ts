import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AcessoObraUsuario, ChaveStatusObra, Obra, ObraPayload, STATUS_OBRA } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { PermissoesService } from '../../../core/services/permissoes.service';
import { Cliente, Responsavel } from '../../cadastros/cadastros.models';
import { GerenciarAcessosObra } from '../../../shared/gerenciar-acessos-obra/gerenciar-acessos-obra';

export interface EventoSalvarObra {
  payload: Partial<ObraPayload>;
  /** Só populado quando a obra ainda não existe (`obra()` null) e o usuário mexeu em "Quem acessa esta obra" — o pai aplica depois que a obra for criada de verdade (sem id antes disso). */
  acessosPendentes: AcessoObraUsuario[] | null;
}

/**
 * Cadastro/edição de obra num popup só (07/09/2026, pedido do Lucas) —
 * antes eram duas telas parecidas, mas diferentes: o formulário de
 * "+ Nova obra" (`Obras`, só criação) e o cabeçalho sempre visível/
 * editável de `ObraDetalhe` (só edição, com Nº/Cliente/Responsável em
 * campos soltos e o "Confirmar obra"/"Quem acessa esta obra" junto).
 * Unificados aqui: `obra() === null` é criação, preenchido é edição —
 * mesmo padrão de `modoNovo` do `EditarPagamentoModal`.
 *
 * "Quem acessa esta obra" mora AQUI dentro (não delegado ao pai como o
 * resto do formulário) porque o fluxo diverge nos dois modos: editando,
 * busca/grava na hora (`listarAcessosObra`/`salvarAcessosObra`, já
 * existe a obra); criando, a lista nasce de `listarUsuarios()` (todo
 * usuário secundário, acesso liberado por padrão) e fica pendente
 * (`acessosPendentes`, emitido junto com `salvar`) até o pai criar a
 * obra de verdade e ter um id pra gravar.
 */
@Component({
  selector: 'app-cadastro-obra-modal',
  imports: [ReactiveFormsModule, GerenciarAcessosObra],
  templateUrl: './cadastro-obra-modal.html',
  styleUrl: './cadastro-obra-modal.scss',
})
export class CadastroObraModal {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly permissoes = inject(PermissoesService);

  readonly obra = input<Obra | null>(null);
  /** Só usado no modo criação — código sugerido, somente leitura (mesmo texto já calculado por `Obras.proximoCodigo()`). */
  readonly proximoCodigo = input('');
  readonly clientesAtivos = input<Cliente[]>([]);
  readonly responsaveisAtivos = input<Responsavel[]>([]);
  readonly salvando = input(false);

  readonly salvar = output<EventoSalvarObra>();
  readonly fechar = output<void>();
  /** Só emitido no modo edição — o pai decide como persistir (mesma lógica que já existia em `ObraDetalhe.alternarConfirmacao`). */
  readonly alternarConfirmacao = output<void>();

  protected readonly statusOpcoes = STATUS_OBRA;
  protected readonly modoNovo = computed(() => this.obra() === null);
  protected readonly confirmada = computed(() => Boolean(this.obra()?.is_confirmed));
  /** Mesma checagem que "Quem acessa esta obra" já tinha antes de virar parte deste popup. */
  protected readonly podeVerAcessos = computed(
    () => this.permissoes.ehAdmin() || this.permissoes.podeGerenciarPermissoes(),
  );

  protected readonly formulario = this.fb.nonNullable.group({
    mapNumber: [''],
    obraNome: ['', [Validators.required]],
    cliente: [''],
    numeroContrato: [''],
    responsavel: [''],
    responsavelTecnico: [''],
    crea: [''],
    art: [''],
    dataBase: [''],
    localObra: [''],
    periodo: [''],
    status: ['a_iniciar' as ChaveStatusObra],
    obs: [''],
  });

  constructor() {
    // Reage a `obra()` mudar — não só na abertura, mas também depois de
    // "Confirmar obra"/"Reabrir obra" (o pai atualiza o objeto e passa de
    // volta pra este MESMO popup, que continua aberto).
    effect(() => {
      const obraAtual = this.obra();
      this.formulario.reset({
        mapNumber: obraAtual ? (obraAtual.map_number ?? '') : this.proximoCodigo(),
        obraNome: obraAtual?.obra_nome ?? '',
        cliente: obraAtual?.cliente ?? '',
        numeroContrato: obraAtual?.numero_contrato ?? '',
        responsavel: obraAtual?.responsavel ?? '',
        responsavelTecnico: obraAtual?.responsavel_tecnico ?? '',
        crea: obraAtual?.crea ?? '',
        art: obraAtual?.art ?? '',
        dataBase: obraAtual?.data_base ?? '',
        localObra: obraAtual?.local_obra ?? '',
        periodo: obraAtual?.periodo ?? '',
        status: obraAtual?.status ?? 'a_iniciar',
        obs: obraAtual?.obs ?? '',
      });
      if (obraAtual?.is_confirmed) this.formulario.disable();
      else this.formulario.enable();
    });
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected fecharClick(): void {
    this.fechar.emit();
  }

  protected salvarClick(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();
    const obraAtual = this.obra();

    const payload: Partial<ObraPayload> = {
      map_number: v.mapNumber.trim() || (obraAtual ? null : this.proximoCodigo()),
      obra_nome: v.obraNome.trim(),
      cliente: v.cliente.trim(),
      numero_contrato: v.numeroContrato.trim() || null,
      responsavel: v.responsavel.trim(),
      responsavel_tecnico: v.responsavelTecnico.trim() || null,
      crea: v.crea.trim() || null,
      art: v.art.trim() || null,
      data_base: v.dataBase || null,
      local_obra: v.localObra.trim(),
      periodo: v.periodo.trim(),
      obs: v.obs.trim(),
      status: v.status,
      // BDI/confirmação não são campos deste formulário — preserva o que
      // já existe na edição; usa os defaults do schema na criação (mesmo
      // valor que `Obras.salvar()` já mandava antes desta unificação).
      bdi_scope: obraAtual?.bdi_scope ?? 'global',
      bdi_mode: obraAtual?.bdi_mode ?? 'pct',
      bdi_percent: obraAtual?.bdi_percent ?? 0,
      bdi_value: obraAtual?.bdi_value ?? 0,
      is_confirmed: obraAtual?.is_confirmed ?? false,
      confirmed_at: obraAtual?.confirmed_at ?? null,
    };

    this.salvar.emit({ payload, acessosPendentes: obraAtual ? null : this.acessosPendentes });
  }

  // ------------------------------------------------------------------
  // "Quem acessa esta obra" (07/09/2026, movido do cabeçalho de
  // `ObraDetalhe` pra dentro deste popup — ver comentário da classe).
  // ------------------------------------------------------------------
  protected readonly acessosAberto = signal(false);
  protected readonly acessosCarregados = signal<AcessoObraUsuario[]>([]);
  protected readonly carregandoAcessos = signal(false);
  protected readonly salvandoAcessos = signal(false);
  /** Só usado no modo criação — guarda a última escolha até o pai criar a obra de verdade. */
  private acessosPendentes: AcessoObraUsuario[] | null = null;

  protected abrirAcessos(): void {
    if (this.confirmada()) return;
    this.acessosAberto.set(true);

    const obraAtual = this.obra();
    if (obraAtual) {
      this.carregandoAcessos.set(true);
      this.api.listarAcessosObra(obraAtual.id).subscribe({
        next: (usuarios) => {
          this.acessosCarregados.set(usuarios);
          this.carregandoAcessos.set(false);
        },
        error: () => {
          this.carregandoAcessos.set(false);
          window.alert('Não foi possível carregar os acessos desta obra.');
        },
      });
      return;
    }

    // Criação: reabrir o popup de acessos não busca de novo — mantém a
    // última escolha que o usuário já tinha feito nesta mesma sessão.
    if (this.acessosPendentes) {
      this.acessosCarregados.set(this.acessosPendentes);
      return;
    }

    this.carregandoAcessos.set(true);
    this.api.listarUsuarios().subscribe({
      next: (usuarios) => {
        this.acessosCarregados.set(
          usuarios
            .filter((u) => u.papel === 'secundario')
            .map((u) => ({ userId: u.id, nome: u.nome, email: u.email, podeVer: true, podeLancar: true })),
        );
        this.carregandoAcessos.set(false);
      },
      error: () => {
        this.carregandoAcessos.set(false);
        window.alert('Não foi possível carregar os usuários da empresa.');
      },
    });
  }

  protected fecharAcessos(): void {
    this.acessosAberto.set(false);
  }

  protected salvarAcessos(lista: AcessoObraUsuario[]): void {
    const obraAtual = this.obra();

    if (obraAtual) {
      this.salvandoAcessos.set(true);
      this.api.salvarAcessosObra(obraAtual.id, lista).subscribe({
        next: (usuarios) => {
          this.acessosCarregados.set(usuarios);
          this.salvandoAcessos.set(false);
        },
        error: () => {
          this.salvandoAcessos.set(false);
          window.alert('Não foi possível salvar os acessos desta obra.');
        },
      });
      return;
    }

    // Criação: nada pra gravar ainda — só guarda, o pai grava depois de criar a obra.
    this.acessosPendentes = lista;
    this.acessosCarregados.set(lista);
  }
}
