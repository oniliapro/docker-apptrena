import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  AlteracaoEmpresa,
  EmpresaPlataforma,
  PLANOS,
  PlanoPlataforma,
  PlataformaService,
  STATUS_ASSINATURA,
  StatusAssinatura,
} from '../../core/services/plataforma.service';
import { formatarData } from '../../core/utils/formato';
import { CampoSenha } from '../../shared/campo-senha/campo-senha';

type Etapa = 'senha' | 'configurar' | 'codigo' | 'painel';

/** Rascunho de edição de uma linha da tabela (só o que o dono pode mexer). */
interface RascunhoEmpresa {
  plano: PlanoPlataforma;
  status: StatusAssinatura;
  validade: string;
  observacoes: string;
}

/**
 * Painel de planos (15/10/2026, pedido do Lucas: "somente eu terei acesso a essa
 * página, tem que ter login próprio e verificação de duas etapas").
 *
 * Fora do AppShell, sem item de menu e sem relação com o login do sistema:
 * o administrador da plataforma é outra tabela (`admins_plataforma`) e a sessão
 * dele vive só na aba (`sessionStorage`). Aqui o dono:
 *  - cria a CONTA PRINCIPAL de cada cliente (o cadastro público saiu do login);
 *  - define plano, status e validade — `suspensa`/`cancelada` bloqueiam o login
 *    da empresa inteira.
 */
@Component({
  selector: 'app-plataforma',
  imports: [ReactiveFormsModule, CampoSenha],
  templateUrl: './plataforma.html',
  styleUrl: './plataforma.scss',
})
export class Plataforma implements OnInit {
  private readonly fb = inject(FormBuilder);
  protected readonly servico = inject(PlataformaService);

  protected readonly planos = PLANOS;
  protected readonly statusOpcoes = STATUS_ASSINATURA;
  protected readonly formatarData = formatarData;

  protected readonly etapa = signal<Etapa>(this.servico.autenticado() ? 'painel' : 'senha');
  protected readonly enviando = signal(false);
  protected readonly erro = signal<string | null>(null);

  // ---- Login em duas etapas ----
  private preToken = '';
  protected readonly segredo = signal('');
  protected readonly uri = signal('');

  protected readonly formSenha = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]],
  });

  protected readonly formCodigo = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(/^\s*\d{3}\s?\d{3}\s*$/)]],
  });

  // ---- Painel ----
  protected readonly empresas = signal<EmpresaPlataforma[]>([]);
  protected readonly carregando = signal(false);
  protected readonly busca = signal('');
  protected readonly rascunhos = signal<Record<string, RascunhoEmpresa>>({});
  protected readonly salvandoId = signal<string | null>(null);
  protected readonly avisoPainel = signal<string | null>(null);
  protected readonly novaContaAberta = signal(false);
  protected readonly erroNovaConta = signal<string | null>(null);

  protected readonly formNovaConta = this.fb.nonNullable.group({
    empresa: ['', [Validators.required, Validators.maxLength(150)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    plano: ['trial' as PlanoPlataforma],
    status: ['trial' as StatusAssinatura],
    validade: [''],
    observacoes: [''],
  });

  protected readonly filtradas = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    if (!termo) return this.empresas();
    return this.empresas().filter((e) =>
      [e.nome, e.principal?.nome ?? '', e.principal?.email ?? ''].some((t) => t.toLowerCase().includes(termo)),
    );
  });

  protected readonly resumo = computed(() => {
    const lista = this.empresas();
    return {
      total: lista.length,
      ativas: lista.filter((e) => e.assinaturaStatus === 'ativa').length,
      emTeste: lista.filter((e) => e.assinaturaStatus === 'trial').length,
      bloqueadas: lista.filter((e) => e.assinaturaStatus === 'suspensa' || e.assinaturaStatus === 'cancelada').length,
    };
  });

  ngOnInit(): void {
    if (this.etapa() === 'painel') this.carregarEmpresas();
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------
  protected entrar(): void {
    if (this.formSenha.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);

    const { email, senha } = this.formSenha.getRawValue();

    this.servico.entrar(email.trim(), senha).subscribe({
      next: (resposta) => {
        this.enviando.set(false);
        this.preToken = resposta.pre_token;
        this.formCodigo.reset({ codigo: '' });

        if (resposta.etapa === 'configurar') {
          this.segredo.set(this.agruparSegredo(resposta.segredo ?? ''));
          this.uri.set(resposta.uri ?? '');
          this.etapa.set('configurar');
        } else {
          this.etapa.set('codigo');
        }
      },
      error: (e) => {
        this.enviando.set(false);
        this.erro.set(this.mensagemDeErro(e, 'E-mail ou senha incorretos.'));
      },
    });
  }

  protected confirmarCodigo(): void {
    if (this.formCodigo.invalid || this.enviando()) return;
    this.enviando.set(true);
    this.erro.set(null);

    this.servico.verificarCodigo(this.preToken, this.formCodigo.controls.codigo.value).subscribe({
      next: () => {
        this.enviando.set(false);
        this.preToken = '';
        this.segredo.set('');
        this.uri.set('');
        this.formSenha.reset({ email: '', senha: '' });
        this.etapa.set('painel');
        this.carregarEmpresas();
      },
      error: (e) => {
        this.enviando.set(false);
        this.erro.set(this.mensagemDeErro(e, 'Código incorreto ou expirado.'));
        // Sessão de 5 min esgotada ou tentativas acabaram: volta ao começo.
        if (e?.status === 422 && /Entre de novo/i.test(this.erro() ?? '')) this.voltarAoInicio();
      },
    });
  }

  protected voltarAoInicio(): void {
    this.preToken = '';
    this.segredo.set('');
    this.uri.set('');
    this.formCodigo.reset({ codigo: '' });
    this.etapa.set('senha');
  }

  protected sair(): void {
    this.servico.sair();
    this.empresas.set([]);
    this.rascunhos.set({});
    this.erro.set(null);
    this.etapa.set('senha');
  }

  // ------------------------------------------------------------------
  // Painel
  // ------------------------------------------------------------------
  protected carregarEmpresas(): void {
    this.carregando.set(true);
    this.avisoPainel.set(null);

    this.servico.listarEmpresas().subscribe({
      next: (lista) => {
        this.empresas.set(lista);
        this.rascunhos.set(Object.fromEntries(lista.map((e) => [e.id, this.rascunhoDe(e)])));
        this.carregando.set(false);
      },
      error: (e) => {
        this.carregando.set(false);
        if (e?.status === 401 || e?.status === 403) {
          this.servico.encerrarLocal();
          this.erro.set('Sua sessão expirou. Entre de novo.');
          this.etapa.set('senha');
          return;
        }
        this.avisoPainel.set('Não foi possível carregar as contas.');
      },
    });
  }

  private rascunhoDe(e: EmpresaPlataforma): RascunhoEmpresa {
    return {
      plano: e.plano,
      status: e.assinaturaStatus,
      validade: e.assinaturaValidaAte ?? '',
      observacoes: e.observacoes,
    };
  }

  protected rascunho(e: EmpresaPlataforma): RascunhoEmpresa {
    return this.rascunhos()[e.id] ?? this.rascunhoDe(e);
  }

  protected alterar(e: EmpresaPlataforma, campo: keyof RascunhoEmpresa, valor: string): void {
    this.rascunhos.update((r) => ({ ...r, [e.id]: { ...this.rascunho(e), [campo]: valor } as RascunhoEmpresa }));
  }

  protected temAlteracao(e: EmpresaPlataforma): boolean {
    const r = this.rascunho(e);
    const o = this.rascunhoDe(e);
    return r.plano !== o.plano || r.status !== o.status || r.validade !== o.validade || r.observacoes !== o.observacoes;
  }

  protected bloqueia(status: StatusAssinatura): boolean {
    return status === 'suspensa' || status === 'cancelada';
  }

  protected salvar(e: EmpresaPlataforma): void {
    if (!this.temAlteracao(e) || this.salvandoId()) return;
    const r = this.rascunho(e);

    // Suspender/cancelar derruba o acesso de TODOS os usuários da empresa — confirma antes.
    if (this.bloqueia(r.status) && !this.bloqueia(e.assinaturaStatus)) {
      const ok = window.confirm(
        `Marcar "${e.nome}" como ${r.status === 'suspensa' ? 'SUSPENSA' : 'CANCELADA'}?\n\n` +
          `Nenhum dos ${e.usuarios} usuário(s) dessa empresa conseguirá entrar até você reativar.`,
      );
      if (!ok) return;
    }

    const dados: AlteracaoEmpresa = {
      plano: r.plano,
      assinatura_status: r.status,
      assinatura_valida_ate: r.validade || null,
      observacoes_plataforma: r.observacoes.trim() || null,
    };

    this.salvandoId.set(e.id);
    this.avisoPainel.set(null);

    this.servico.atualizarEmpresa(e.id, dados).subscribe({
      next: (salva) => {
        this.empresas.update((lista) => lista.map((x) => (x.id === salva.id ? salva : x)));
        this.rascunhos.update((rs) => ({ ...rs, [salva.id]: this.rascunhoDe(salva) }));
        this.salvandoId.set(null);
        this.avisoPainel.set(`"${salva.nome}" atualizada.`);
      },
      error: (falha) => {
        this.salvandoId.set(null);
        this.avisoPainel.set(this.mensagemDeErro(falha, 'Não foi possível salvar.'));
      },
    });
  }

  protected abrirNovaConta(): void {
    this.formNovaConta.reset({
      empresa: '',
      name: '',
      email: '',
      password: '',
      plano: 'trial',
      status: 'trial',
      validade: '',
      observacoes: '',
    });
    this.erroNovaConta.set(null);
    this.novaContaAberta.set(true);
  }

  protected fecharNovaConta(): void {
    this.novaContaAberta.set(false);
  }

  protected criarConta(): void {
    if (this.formNovaConta.invalid || this.enviando()) {
      this.formNovaConta.markAllAsTouched();
      return;
    }
    const v = this.formNovaConta.getRawValue();
    this.enviando.set(true);
    this.erroNovaConta.set(null);

    this.servico
      .criarConta({
        empresa: v.empresa.trim(),
        name: v.name.trim(),
        email: v.email.trim(),
        password: v.password,
        plano: v.plano,
        assinatura_status: v.status,
        assinatura_valida_ate: v.validade || null,
        observacoes_plataforma: v.observacoes.trim(),
      })
      .subscribe({
        next: (criada) => {
          this.enviando.set(false);
          this.empresas.update((lista) =>
            [...lista, criada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
          );
          this.rascunhos.update((rs) => ({ ...rs, [criada.id]: this.rascunhoDe(criada) }));
          this.novaContaAberta.set(false);
          this.avisoPainel.set(
            `Conta criada: ${criada.nome}. Passe o e-mail ${criada.principal?.email ?? ''} e a senha definida ao cliente — ` +
              'ele pode trocá-la em "Esqueci minha senha".',
          );
        },
        error: (falha) => {
          this.enviando.set(false);
          this.erroNovaConta.set(this.mensagemDeErro(falha, 'Não foi possível criar a conta.'));
        },
      });
  }

  // ------------------------------------------------------------------
  protected rotuloStatus(status: StatusAssinatura): string {
    return STATUS_ASSINATURA.find((s) => s.valor === status)?.rotulo ?? status;
  }

  /** `ABCD EFGH IJKL ...` — blocos de 4 facilitam digitar a chave no aplicativo. */
  private agruparSegredo(segredo: string): string {
    return segredo.replace(/(.{4})/g, '$1 ').trim();
  }

  protected copiar(texto: string): void {
    void navigator.clipboard?.writeText(texto.replace(/\s+/g, ''));
  }

  private mensagemDeErro(e: unknown, padrao: string): string {
    const corpo = (e as { error?: { message?: string; errors?: Record<string, string[]> } })?.error;
    const primeira = corpo?.errors ? Object.values(corpo.errors)[0]?.[0] : undefined;
    const status = (e as { status?: number })?.status;
    if (status === 429) return 'Muitas tentativas. Aguarde um minuto.';
    return primeira || corpo?.message || padrao;
  }
}
