import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { PermissaoModulo, UsuarioSecundario } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { PermissoesService } from '../../../core/services/permissoes.service';

/** Mesma lista de `PermissaoService::MODULOS` no backend — precisa bater com as chaves salvas. */
const MODULOS = [
  { chave: 'obras', rotulo: 'Obras' },
  { chave: 'eap', rotulo: 'EAP' },
  { chave: 'cronograma', rotulo: 'Cronograma' },
  { chave: 'desembolso', rotulo: 'Cronograma de desembolso' },
  { chave: 'medicoes', rotulo: 'Medições' },
  { chave: 'mapas', rotulo: 'Mapas' },
  { chave: 'empreitas', rotulo: 'Empreitas' },
  { chave: 'pagamentos', rotulo: 'Pagamentos' },
  { chave: 'diarias', rotulo: 'Diárias' },
  { chave: 'agenda', rotulo: 'Agenda' },
  { chave: 'diario_obra', rotulo: 'Diário de obra' },
  { chave: 'contratos_equipamentos', rotulo: 'Contratos de equipamentos' },
  { chave: 'relatorios', rotulo: 'Relatórios' },
  { chave: 'arquivos', rotulo: 'Arquivos' },
] as const;

/**
 * Aba "Controle de permissões" do popup de Configurações (31/08/2026,
 * pedido do Lucas) — cadastro de usuários secundários (mesmo padrão de
 * `dados-empresa.ts`) + matriz de permissão por módulo. A regra de
 * hierarquia (quem pode editar quem) é reforçada aqui só como
 * conveniência de UI (`podeEditarAlvo`) — quem garante de verdade é o
 * backend (`UsuarioController::autorizarEdicaoDoAlvo`).
 *
 * Backend só aplica de verdade (bloqueia via API) os módulos `mapas` e
 * `eap` nesta rodada — os outros já aparecem aqui pro admin configurar,
 * mas ainda não travam nada fora da navegação do próprio app. Ver o
 * plano "Controle de permissões".
 */
@Component({
  selector: 'app-controle-permissoes',
  imports: [ReactiveFormsModule],
  templateUrl: './controle-permissoes.html',
  styleUrl: './controle-permissoes.scss',
})
export class ControlePermissoes implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly permissoes = inject(PermissoesService);
  private readonly fb = inject(FormBuilder);

  protected readonly modulos = MODULOS;

  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly usuarios = signal<UsuarioSecundario[]>([]);

  // ------------------------------------------------------------------
  // Novo usuário
  // ------------------------------------------------------------------
  protected readonly formularioAberto = signal(false);
  protected readonly salvando = signal(false);
  protected readonly formulario = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  // ------------------------------------------------------------------
  // Matriz de permissão
  // ------------------------------------------------------------------
  protected readonly usuarioNaMatriz = signal<UsuarioSecundario | null>(null);
  protected readonly matriz = signal<PermissaoModulo[]>([]);
  protected readonly salvandoMatriz = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarUsuarios().subscribe({
      next: (usuarios) => {
        this.usuarios.set(usuarios);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os usuários.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Espelha `UsuarioController::autorizarEdicaoDoAlvo` — só pra não
   * mostrar controles que o backend vai recusar de qualquer forma.
   */
  protected podeEditarAlvo(alvo: UsuarioSecundario): boolean {
    if (this.permissoes.ehAdmin()) return true;
    if (!this.permissoes.podeGerenciarPermissoes()) return false;
    return !alvo.podeGerenciarPermissoes;
  }

  // ------------------------------------------------------------------
  protected novo(): void {
    this.formulario.reset();
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.formularioAberto.set(false);
  }

  protected temErro(campo: string): boolean {
    const controle = this.formulario.get(campo);
    return Boolean(controle?.invalid && (controle.dirty || controle.touched));
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const v = this.formulario.getRawValue();
    this.salvando.set(true);
    this.api.criarUsuario({ name: v.name.trim(), email: v.email.trim(), password: v.password }).subscribe({
      next: (usuario) => {
        this.usuarios.update((lista) => [...lista, usuario]);
        this.salvando.set(false);
        this.fechar();
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível criar o usuário — confira se o e-mail já está em uso.');
      },
    });
  }

  protected alternarAtivo(usuario: UsuarioSecundario): void {
    this.api.atualizarUsuario(usuario.id, { ativo: !usuario.ativo }).subscribe({
      next: (atualizado) => {
        this.usuarios.update((lista) => lista.map((u) => (u.id === atualizado.id ? atualizado : u)));
      },
      error: () => window.alert('Não foi possível alterar o status do usuário.'),
    });
  }

  protected alternarGerente(usuario: UsuarioSecundario): void {
    if (!this.permissoes.ehAdmin()) return; // só o admin de verdade concede/revoga isso

    this.api
      .atualizarUsuario(usuario.id, { pode_gerenciar_permissoes: !usuario.podeGerenciarPermissoes })
      .subscribe({
        next: (atualizado) => {
          this.usuarios.update((lista) => lista.map((u) => (u.id === atualizado.id ? atualizado : u)));
        },
        error: () => window.alert('Não foi possível alterar essa permissão.'),
      });
  }

  // ------------------------------------------------------------------
  protected abrirMatriz(usuario: UsuarioSecundario): void {
    if (!this.podeEditarAlvo(usuario)) return;

    this.usuarioNaMatriz.set(usuario);
    this.matriz.set([]);
    this.api.obterPermissoesUsuario(usuario.id).subscribe({
      next: (modulos) => this.matriz.set(modulos),
      error: () => window.alert('Não foi possível carregar as permissões deste usuário.'),
    });
  }

  protected fecharMatriz(): void {
    this.usuarioNaMatriz.set(null);
  }

  protected linhaDoModulo(chave: string): PermissaoModulo {
    return (
      this.matriz().find((m) => m.modulo === chave) ?? {
        modulo: chave,
        podeUsar: false,
        podeCriar: false,
        podeEditar: false,
        podeExcluir: false,
        podeReabrir: false,
      }
    );
  }

  /** "Todos" (25/09/2026, pedido do Lucas): marcado quando as cinco permissões da linha estão ligadas. */
  protected todosMarcados(chave: string): boolean {
    const l = this.linhaDoModulo(chave);
    return l.podeUsar && l.podeCriar && l.podeEditar && l.podeExcluir && l.podeReabrir;
  }

  /** Liga as cinco permissões da linha; se já estavam todas ligadas, desliga todas. */
  protected alternarTodos(chave: string): void {
    const ligar = !this.todosMarcados(chave);
    this.matriz.update((lista) => {
      const existe = lista.some((m) => m.modulo === chave);
      const atualizada: PermissaoModulo = {
        ...this.linhaDoModulo(chave),
        podeUsar: ligar,
        podeCriar: ligar,
        podeEditar: ligar,
        podeExcluir: ligar,
        podeReabrir: ligar,
      };
      return existe ? lista.map((m) => (m.modulo === chave ? atualizada : m)) : [...lista, atualizada];
    });
  }

  protected alternarFlag(
    chave: string,
    campo: 'podeUsar' | 'podeCriar' | 'podeEditar' | 'podeExcluir' | 'podeReabrir',
  ): void {
    this.matriz.update((lista) => {
      const existe = lista.some((m) => m.modulo === chave);
      const base = this.linhaDoModulo(chave);
      const atualizada = { ...base, [campo]: !base[campo] };

      // Desligar "usar" desliga as 4 ações finas junto — não faz sentido
      // manter "pode editar" ligado num módulo que o usuário nem enxerga.
      if (campo === 'podeUsar' && !atualizada.podeUsar) {
        atualizada.podeCriar = false;
        atualizada.podeEditar = false;
        atualizada.podeExcluir = false;
        atualizada.podeReabrir = false;
      }

      return existe
        ? lista.map((m) => (m.modulo === chave ? atualizada : m))
        : [...lista, atualizada];
    });
  }

  protected salvarMatriz(): void {
    const usuario = this.usuarioNaMatriz();
    if (!usuario) return;

    this.salvandoMatriz.set(true);
    this.api.salvarPermissoesUsuario(usuario.id, this.matriz()).subscribe({
      next: (modulos) => {
        this.matriz.set(modulos);
        this.salvandoMatriz.set(false);
      },
      error: () => {
        this.salvandoMatriz.set(false);
        window.alert('Não foi possível salvar as permissões.');
      },
    });
  }
}
