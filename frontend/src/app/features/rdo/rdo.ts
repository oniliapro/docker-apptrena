import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Obra } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { hojeIso } from '../../core/utils/formato';
import {
  CLIMAS,
  FotoSelecionada,
  RdoContratanteLink,
  RdoFoto,
  RdoObraDados,
  RdoPreparo,
  RdoRegistro,
  TIPOS_OCORRENCIA,
} from './rdo.models';
import { RdoService } from './rdo.service';

const CHAVE_OBRA_ATIVA = 'trenaapp.obraAtiva.v1';

/**
 * Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026.
 *
 * Substitui o Diário de Obra anterior, que não dava conta do RDO clássico
 * (planilha-modelo enviada pela Onilia). As três diferenças que motivaram
 * refazer, e que moldam esta tela:
 *
 *  1. TAREFAS são entidades numeradas, não um campo de texto do dia. É delas
 *     que as fotos penduram — cada tarefa mostra suas evidências como
 *     miniaturas com legenda, e clicar abre a foto grande.
 *  2. MÃO DE OBRA é função + quantidade, em duas categorias (indireta e
 *     direta), várias linhas — não um número só. Vem pré-preenchida com a do
 *     RDO anterior, porque na prática a equipe muda pouco de um dia pro outro.
 *  3. O RDO tem NÚMERO sequencial e cabeçalho técnico (contrato, CREA, ART),
 *     porque é um documento que se imprime e se assina.
 *
 * Só a contratada assina (decisão de 08/09/2026, reconfirmada em 17/09/2026):
 * finalizar É assinar, e o contratante da obra nunca assina nem escreve — ele
 * só acompanha pelo link somente-leitura.
 *
 * Este módulo não altera nada fora do próprio escopo: usa serviço próprio
 * (`RdoService`), tipos próprios (`rdo.models.ts`) e tabelas `rdo_*`. Do que é
 * compartilhado, só LÊ — `ApiService.listarObras()` para preencher o seletor
 * de obra.
 */
@Component({
  selector: 'app-rdo',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './rdo.html',
  styleUrl: './rdo.scss',
})
export class Rdo implements OnInit {
  private readonly api = inject(ApiService);
  private readonly rdoApi = inject(RdoService);
  private readonly fb = inject(FormBuilder);

  protected readonly climas = CLIMAS;
  protected readonly tiposOcorrencia = TIPOS_OCORRENCIA;

  protected readonly obras = signal<Obra[]>([]);
  protected readonly obraAtiva = signal<string>('');
  protected readonly preparo = signal<RdoPreparo | null>(null);
  protected readonly registros = signal<RdoRegistro[]>([]);
  protected readonly links = signal<RdoContratanteLink[]>([]);

  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  /** Id do RDO em edição; null = criando um novo. */
  protected readonly editandoId = signal<string | null>(null);
  protected readonly fotosSelecionadas = signal<FotoSelecionada[]>([]);
  /** Foto aberta em tamanho grande no popup. */
  protected readonly fotoAmpliada = signal<RdoFoto | null>(null);
  /** Qual seção está aberta no layout de celular (uma por vez). */
  protected readonly secaoAberta = signal<string>('identificacao');
  protected readonly mostrarCabecalho = signal(false);

  protected readonly formulario: FormGroup = this.fb.group({
    data: [hojeIso(), Validators.required],
    clima_manha: ['claro'],
    clima_tarde: ['claro'],
    clima_noite: ['claro'],
    impacto_cronograma: [''],
    observacoes: [''],
    etapas: this.fb.array([]),
    mao_de_obra: this.fb.array([]),
    equipamentos: this.fb.array([]),
    tarefas: this.fb.array([]),
    ocorrencias: this.fb.array([]),
    pendencias: this.fb.array([]),
    responsaveis: this.fb.array([]),
    comentarios: this.fb.array([]),
  });

  protected readonly cabecalho: FormGroup = this.fb.group({
    numero_contrato: [''],
    responsavel_tecnico: [''],
    crea: [''],
    art: [''],
    data_inicio: [''],
    prazo: [''],
    contratante_nome: [''],
  });

  protected readonly numeroPrevisto = computed(() => this.preparo()?.proximo_numero ?? 1);

  protected readonly obraSelecionada = computed(
    () => this.obras().find((o) => o.id === this.obraAtiva()) ?? null,
  );

  ngOnInit(): void {
    this.carregando.set(true);
    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);
        const lembrada = localStorage.getItem(CHAVE_OBRA_ATIVA);
        const escolhida = obras.find((o) => o.id === lembrada)?.id ?? obras[0]?.id ?? '';
        if (escolhida) {
          this.selecionarObra(escolhida);
        } else {
          this.carregando.set(false);
        }
      },
      error: () => {
        this.erro.set('Não foi possível carregar as obras.');
        this.carregando.set(false);
      },
    });
  }

  // ------------------------------------------------------------------
  // Obra e carregamento
  // ------------------------------------------------------------------

  protected selecionarObra(obraId: string): void {
    this.obraAtiva.set(obraId);
    localStorage.setItem(CHAVE_OBRA_ATIVA, obraId);
    this.carregando.set(true);
    this.erro.set(null);

    this.rdoApi.preparar(obraId).subscribe({
      next: (preparo) => {
        this.preparo.set(preparo);
        this.aplicarCabecalho(preparo.cabecalho);
        this.novoRegistro();
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível preparar o RDO desta obra.');
        this.carregando.set(false);
      },
    });

    this.rdoApi.listar(obraId).subscribe({
      next: (registros) => this.registros.set(registros),
      error: () => this.erro.set('Não foi possível carregar os relatórios.'),
    });

    this.rdoApi.listarLinks(obraId).subscribe({
      next: (links) => this.links.set(links),
      error: () => void 0,
    });
  }

  /**
   * Prepara o formulário para um RDO novo: limpa tudo e traz o
   * pré-preenchimento do lançamento anterior (etapas não concluídas e a mão
   * de obra de ontem).
   */
  protected novoRegistro(): void {
    this.editandoId.set(null);
    this.fotosSelecionadas.set([]);
    this.formulario.reset({
      data: hojeIso(),
      clima_manha: 'claro',
      clima_tarde: 'claro',
      clima_noite: 'claro',
      impacto_cronograma: '',
      observacoes: '',
    });

    this.limparArrays();

    const preparo = this.preparo();
    preparo?.etapas_sugeridas.forEach((e) => this.adicionarEtapa(e.nome, false));
    preparo?.mao_de_obra_sugerida.forEach((m) =>
      this.adicionarMaoDeObra(m.categoria, m.funcao, m.quantidade),
    );

    if (this.arr('tarefas').length === 0) {
      this.adicionarTarefa();
    }
  }

  /** Abre um RDO já salvo para edição. Permitido mesmo depois de assinado. */
  protected editar(registro: RdoRegistro): void {
    this.editandoId.set(registro.id);
    this.fotosSelecionadas.set([]);
    this.limparArrays();

    this.formulario.patchValue({
      data: registro.data?.substring(0, 10) ?? hojeIso(),
      clima_manha: registro.clima_manha ?? 'claro',
      clima_tarde: registro.clima_tarde ?? 'claro',
      clima_noite: registro.clima_noite ?? 'claro',
      impacto_cronograma: registro.impacto_cronograma ?? '',
      observacoes: registro.observacoes ?? '',
    });

    registro.etapas?.forEach((e) => this.adicionarEtapa(e.nome, e.concluida));
    registro.mao_de_obra?.forEach((m) => this.adicionarMaoDeObra(m.categoria, m.funcao, m.quantidade));
    registro.equipamentos?.forEach((e) => this.adicionarEquipamento(e.descricao, e.quantidade));
    registro.tarefas?.forEach((t) => this.adicionarTarefa(t.descricao, t.id));
    registro.ocorrencias?.forEach((o) => this.adicionarOcorrencia(o));
    registro.pendencias?.forEach((p) => this.adicionarPendencia(p));
    registro.responsaveis_presentes?.forEach((r) => this.adicionarResponsavel(r));
    registro.comentarios_internos?.forEach((c) =>
      this.adicionarComentario(c.texto, c.visivel_contratante),
    );

    if (this.arr('tarefas').length === 0) {
      this.adicionarTarefa();
    }

    this.secaoAberta.set('identificacao');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ------------------------------------------------------------------
  // FormArrays
  // ------------------------------------------------------------------

  protected arr(nome: string): FormArray {
    return this.formulario.get(nome) as FormArray;
  }

  protected grupo(nome: string, i: number): FormGroup {
    return this.arr(nome).at(i) as FormGroup;
  }

  /** Mão de obra de uma categoria, com o índice real no FormArray. */
  protected maoDeObraDe(categoria: 'indireta' | 'direta'): Array<{ indice: number; grupo: FormGroup }> {
    return this.arr('mao_de_obra').controls
      .map((controle, indice) => ({ indice, grupo: controle as FormGroup }))
      .filter((linha) => linha.grupo.get('categoria')?.value === categoria);
  }

  private limparArrays(): void {
    ['etapas', 'mao_de_obra', 'equipamentos', 'tarefas', 'ocorrencias', 'pendencias', 'responsaveis', 'comentarios']
      .forEach((nome) => this.arr(nome).clear());
  }

  protected adicionarEtapa(nome = '', concluida = false): void {
    this.arr('etapas').push(this.fb.group({ nome: [nome, Validators.required], concluida: [concluida] }));
  }

  protected adicionarMaoDeObra(categoria: 'indireta' | 'direta', funcao = '', quantidade = 0): void {
    this.arr('mao_de_obra').push(
      this.fb.group({
        categoria: [categoria],
        funcao: [funcao, Validators.required],
        quantidade: [quantidade, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  protected adicionarEquipamento(descricao = '', quantidade = 0): void {
    this.arr('equipamentos').push(
      this.fb.group({
        descricao: [descricao, Validators.required],
        quantidade: [quantidade, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  /**
   * O id é gerado aqui no cliente (o backend aceita e reaproveita, ver o trait
   * HasUuidPrimaryKey) porque a foto precisa referenciar a tarefa ANTES de o
   * RDO ser salvo — é assim que `fotos_meta[i][tarefa_id]` sabe onde pendurar.
   */
  protected adicionarTarefa(descricao = '', id?: string): void {
    this.arr('tarefas').push(
      this.fb.group({
        id: [id ?? crypto.randomUUID()],
        descricao: [descricao, Validators.required],
      }),
    );
  }

  protected adicionarOcorrencia(valores?: Partial<{ tipo: string; descricao: string; responsavel: string | null; motivo: string | null; danos_materiais: string | null }>): void {
    this.arr('ocorrencias').push(
      this.fb.group({
        tipo: [valores?.tipo ?? 'outra'],
        descricao: [valores?.descricao ?? '', Validators.required],
        responsavel: [valores?.responsavel ?? ''],
        motivo: [valores?.motivo ?? ''],
        danos_materiais: [valores?.danos_materiais ?? ''],
      }),
    );
  }

  protected adicionarPendencia(valores?: Partial<{ descricao: string; responsavel: string | null; prazo: string | null; status: string }>): void {
    this.arr('pendencias').push(
      this.fb.group({
        descricao: [valores?.descricao ?? '', Validators.required],
        responsavel: [valores?.responsavel ?? ''],
        prazo: [valores?.prazo?.substring(0, 10) ?? ''],
        status: [valores?.status ?? 'aberta'],
      }),
    );
  }

  protected adicionarResponsavel(valores?: Partial<{ nome: string; empresa: string | null; funcao: string | null; contrato_referencia: string | null }>): void {
    this.arr('responsaveis').push(
      this.fb.group({
        nome: [valores?.nome ?? '', Validators.required],
        empresa: [valores?.empresa ?? ''],
        funcao: [valores?.funcao ?? ''],
        contrato_referencia: [valores?.contrato_referencia ?? ''],
      }),
    );
  }

  protected adicionarComentario(texto = '', visivel = false): void {
    this.arr('comentarios').push(
      this.fb.group({ texto: [texto, Validators.required], visivel_contratante: [visivel] }),
    );
  }

  protected remover(nome: string, i: number): void {
    this.arr(nome).removeAt(i);
  }

  /**
   * Ao remover uma tarefa, as fotos que apontavam para ela viram fotos do dia
   * em vez de sumirem — o mesmo que o backend faz (nullOnDelete).
   */
  protected removerTarefa(i: number): void {
    const id = this.grupo('tarefas', i).get('id')?.value as string;
    this.fotosSelecionadas.update((fotos) =>
      fotos.map((f) => (f.tarefaRef === id ? { ...f, tarefaRef: null } : f)),
    );
    this.arr('tarefas').removeAt(i);
  }

  // ------------------------------------------------------------------
  // Fotos
  // ------------------------------------------------------------------

  protected escolherFotos(evento: Event, tarefaRef: string | null): void {
    const input = evento.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);

    const novas = arquivos.map((arquivo) => ({
      arquivo,
      previewUrl: URL.createObjectURL(arquivo),
      tarefaRef,
      legenda: '',
      marcador: null,
      nota: '',
    }));

    this.fotosSelecionadas.update((atual) => [...atual, ...novas]);
    input.value = '';
  }

  protected fotosDaTarefa(tarefaRef: string | null): FotoSelecionada[] {
    return this.fotosSelecionadas().filter((f) => f.tarefaRef === tarefaRef);
  }

  protected indiceDaFoto(foto: FotoSelecionada): number {
    return this.fotosSelecionadas().indexOf(foto);
  }

  /**
   * Croqui: clicar na prévia marca o ponto; clicar de novo move. As
   * coordenadas são relativas (0 a 1) para não depender do tamanho em que a
   * foto está sendo exibida.
   */
  protected marcarCroqui(evento: MouseEvent, indice: number): void {
    const alvo = evento.currentTarget as HTMLElement;
    const caixa = alvo.getBoundingClientRect();
    const x = Math.min(Math.max((evento.clientX - caixa.left) / caixa.width, 0), 1);
    const y = Math.min(Math.max((evento.clientY - caixa.top) / caixa.height, 0), 1);

    this.fotosSelecionadas.update((fotos) =>
      fotos.map((f, i) => (i === indice ? { ...f, marcador: { x, y } } : f)),
    );
  }

  protected atualizarLegenda(indice: number, valor: string): void {
    this.fotosSelecionadas.update((fotos) =>
      fotos.map((f, i) => (i === indice ? { ...f, legenda: valor } : f)),
    );
  }

  protected atualizarNota(indice: number, valor: string): void {
    this.fotosSelecionadas.update((fotos) =>
      fotos.map((f, i) => (i === indice ? { ...f, nota: valor } : f)),
    );
  }

  protected descartarFoto(indice: number): void {
    const foto = this.fotosSelecionadas()[indice];
    if (foto) {
      URL.revokeObjectURL(foto.previewUrl);
    }
    this.fotosSelecionadas.update((fotos) => fotos.filter((_, i) => i !== indice));
  }

  /** Fotos já salvas de uma tarefa, para exibir no card do registro. */
  protected fotosSalvasDaTarefa(registro: RdoRegistro, tarefaId: string): RdoFoto[] {
    return (registro.fotos ?? []).filter((f) => f.tarefa_id === tarefaId);
  }

  protected fotosSalvasDoDia(registro: RdoRegistro): RdoFoto[] {
    return (registro.fotos ?? []).filter((f) => !f.tarefa_id);
  }

  protected ampliar(foto: RdoFoto): void {
    this.fotoAmpliada.set(foto);
  }

  protected fecharAmpliada(): void {
    this.fotoAmpliada.set(null);
  }

  // ------------------------------------------------------------------
  // Salvar / finalizar
  // ------------------------------------------------------------------

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.erro.set('Confira os campos destacados antes de salvar.');

      return;
    }

    const obraId = this.obraAtiva();
    if (!obraId) {
      this.erro.set('Escolha uma obra antes de salvar.');

      return;
    }

    this.salvando.set(true);
    this.erro.set(null);

    const bruto = this.formulario.getRawValue();
    const payload: Record<string, unknown> = {
      ...bruto,
      // Tarefa sem descrição é linha em branco que o usuário deixou passar —
      // não vira registro.
      tarefas: (bruto.tarefas as Array<{ descricao: string }>).filter((t) => t.descricao?.trim()),
    };

    const id = this.editandoId();
    const fotos = this.fotosSelecionadas();
    const requisicao = id
      ? this.rdoApi.atualizar(id, payload, fotos)
      : this.rdoApi.criar({ ...payload, obra_id: obraId }, fotos);

    requisicao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.aviso.set(id ? 'Relatório atualizado.' : 'Relatório salvo como rascunho.');
        this.recarregarLista();
        this.recarregarPreparo();
        this.novoRegistro();
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(this.mensagemDeErro(e));
      },
    });
  }

  /** Finalizar É assinar — e é o que dispara o aviso por e-mail ao contratante. */
  protected finalizar(registro: RdoRegistro): void {
    if (!confirm(`Finalizar e assinar o RDO nº ${registro.numero}? O contratante será avisado por e-mail.`)) {
      return;
    }

    this.rdoApi.finalizar(registro.id).subscribe({
      next: () => {
        this.aviso.set('Relatório finalizado e assinado.');
        this.recarregarLista();
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  /**
   * Baixa o RDO em PDF. O arquivo chega como blob (a rota exige o token
   * Sanctum no cabeçalho), então o download é disparado por uma URL temporária
   * de objeto, revogada logo em seguida para não vazar memória.
   */
  protected baixarPdf(registro: RdoRegistro): void {
    this.aviso.set('Gerando o PDF…');

    this.rdoApi.baixarPdf(registro.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const ancora = document.createElement('a');
        ancora.href = url;
        ancora.download = `RDO-${String(registro.numero ?? 0).padStart(3, '0')}.pdf`;
        ancora.click();
        URL.revokeObjectURL(url);
        this.aviso.set(null);
      },
      error: () => {
        this.aviso.set(null);
        this.erro.set('Não foi possível gerar o PDF.');
      },
    });
  }

  protected excluir(registro: RdoRegistro): void {
    if (!confirm(`Excluir o RDO nº ${registro.numero}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    this.rdoApi.excluir(registro.id).subscribe({
      next: () => {
        this.aviso.set('Relatório excluído.');
        this.recarregarLista();
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  protected salvarCabecalho(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      return;
    }

    this.rdoApi.salvarCabecalho(obraId, this.cabecalho.getRawValue() as RdoObraDados).subscribe({
      next: () => {
        this.aviso.set('Cabeçalho da obra salvo.');
        this.mostrarCabecalho.set(false);
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  protected gerarLink(email: string): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      return;
    }

    this.rdoApi.criarLink(obraId, email || null).subscribe({
      next: () => {
        this.aviso.set('Link de acompanhamento gerado.');
        this.rdoApi.listarLinks(obraId).subscribe((links) => this.links.set(links));
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  protected revogarLink(link: RdoContratanteLink): void {
    this.rdoApi.revogarLink(link.id).subscribe({
      next: () => {
        this.aviso.set('Link revogado.');
        const obraId = this.obraAtiva();
        if (obraId) {
          this.rdoApi.listarLinks(obraId).subscribe((links) => this.links.set(links));
        }
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  protected urlPublica(link: RdoContratanteLink): string {
    return `${window.location.origin}/publico/rdo/${link.token}`;
  }

  protected copiarLink(link: RdoContratanteLink): void {
    navigator.clipboard?.writeText(this.urlPublica(link));
    this.aviso.set('Link copiado.');
  }

  protected alternarSecao(secao: string): void {
    this.secaoAberta.set(this.secaoAberta() === secao ? '' : secao);
  }

  protected rotuloClima(valor: string | null): string {
    return CLIMAS.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloOcorrencia(valor: string): string {
    return TIPOS_OCORRENCIA.find((t) => t.valor === valor)?.rotulo ?? valor;
  }

  private aplicarCabecalho(dados: RdoObraDados | null): void {
    this.cabecalho.reset({
      numero_contrato: dados?.numero_contrato ?? '',
      responsavel_tecnico: dados?.responsavel_tecnico ?? '',
      crea: dados?.crea ?? '',
      art: dados?.art ?? '',
      data_inicio: dados?.data_inicio?.substring(0, 10) ?? '',
      prazo: dados?.prazo ?? '',
      contratante_nome: dados?.contratante_nome ?? '',
    });
  }

  private recarregarLista(): void {
    const obraId = this.obraAtiva();
    if (obraId) {
      this.rdoApi.listar(obraId).subscribe((registros) => this.registros.set(registros));
    }
  }

  private recarregarPreparo(): void {
    const obraId = this.obraAtiva();
    if (obraId) {
      this.rdoApi.preparar(obraId).subscribe((preparo) => this.preparo.set(preparo));
    }
  }

  private mensagemDeErro(e: unknown): string {
    const erro = e as { error?: { message?: string; mensagem?: string } };

    return erro?.error?.mensagem ?? erro?.error?.message ?? 'Não foi possível concluir a operação.';
  }
}
