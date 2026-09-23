import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { hojeIso } from '../../core/utils/formato';
import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { Empreiteiro } from '../cadastros/cadastros.models';
import { CHAVE_EMPREITEIROS, normalizarEmpreiteiro } from '../cadastros/empreiteiros/empreiteiros';
import { FvsPreenchimento, ResultadoFvs } from '../fvs/fvs.models';
import { FvsService } from '../fvs/fvs.service';
import {
  CLIMAS,
  FotoSelecionada,
  RdoFoto,
  RdoObraDados,
  RdoPreparo,
  RdoRegistro,
  TAMANHO_MAXIMO_VIDEO,
  TIPOS_OCORRENCIA,
  VideoSelecionado,
} from './rdo.models';
import { RdoService } from './rdo.service';

/**
 * Relatório Diário de Obra (RDO) — módulo reconstruído em 17/09/2026.
 *
 * Este componente é só o EDITOR de UM RDO (criar ou editar) — a lista, o
 * calendário e o link de acompanhamento do contratante moraram pra
 * `rdo-lista.ts` em 22/09/2026 (F8, pedido do Lucas: "a página RDO vai ser
 * somente a lista... o calendário não fica dentro do diário, fica fora, na
 * lista"). Sempre dentro de uma obra (`/obras/:id/rdo/novo` ou
 * `/obras/:id/rdo/:rdoId`) — o RDO nunca existe fora de uma obra.
 *
 * As três diferenças que motivaram refazer o Diário antigo, e que moldam
 * esta tela:
 *  1. TAREFAS são entidades numeradas, não um campo de texto do dia. É delas
 *     que as fotos/vídeos penduram — cada tarefa mostra suas evidências como
 *     miniaturas com legenda, e clicar abre a foto/vídeo grande.
 *  2. MÃO DE OBRA é função + quantidade, em duas categorias (indireta e
 *     direta), várias linhas — não um número só. Vem pré-preenchida com a do
 *     RDO anterior, porque na prática a equipe muda pouco de um dia pro outro.
 *  3. O RDO tem NÚMERO sequencial e cabeçalho técnico (contrato, CREA, ART),
 *     porque é um documento que se imprime e se assina.
 *
 * Só a contratada assina (decisão de 08/09/2026, reconfirmada em 17/09/2026):
 * finalizar É assinar, e o contratante da obra nunca assina nem escreve — ele
 * só acompanha pelo link somente-leitura.
 */
@Component({
  selector: 'app-rdo',
  imports: [ReactiveFormsModule, Autocomplete],
  templateUrl: './rdo.html',
  styleUrl: './rdo.scss',
})
export class Rdo implements OnInit {
  private readonly rdoApi = inject(RdoService);
  private readonly fvsApi = inject(FvsService);
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  /** Vêm da rota via withComponentInputBinding(): `/obras/:id/rdo/:rdoId`. */
  readonly obraId = input.required<string>({ alias: 'id' });
  /** Literal `'novo'` = criando; qualquer outro valor = o id do RDO a editar. */
  readonly rdoId = input.required<string>();

  protected readonly climas = CLIMAS;
  protected readonly tiposOcorrencia = TIPOS_OCORRENCIA;

  // F9 (24/09/2026): mão de obra por profissional do cadastro (Empreiteiros/
  // "Profissionais", F6 — ainda na ponte de storage, ver `Empreiteiro`) e
  // etapas ligadas a um item de verdade da EAP — mesmo jeito que
  // `DiariasStore` já lê as duas fontes.
  protected readonly profissionais = signal<Empreiteiro[]>([]);
  protected readonly itensEap = signal<ItemEapResumo[]>([]);

  /** Só os ativos, por vínculo — cada coluna da mão de obra busca só na sua lista. */
  protected opcoesProfissional(vinculo: 'interno' | 'externo'): OpcaoAutocomplete[] {
    return this.profissionais()
      .filter((p) => p.ativo !== false && p.vinculo === vinculo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => ({ id: p.id, rotulo: p.especialidade ? `${p.nome} — ${p.especialidade}` : p.nome }));
  }

  /** Etapas-folha da EAP (grupo não recebe lançamento direto) — pro seletor de etapa. */
  protected readonly opcoesEtapaEap = computed<OpcaoAutocomplete[]>(() =>
    this.itensEap()
      .filter((i) => !i.isGroup)
      .map((i) => ({ id: i.id, rotulo: this.rotuloEap(i) })),
  );

  private rotuloEap(item: ItemEapResumo): string {
    const eap = String(item.eap ?? '').trim();
    const desc = String(item.desc ?? '').trim();
    if (eap && desc) return `${eap} - ${desc}`;
    return eap || desc || '—';
  }

  private carregarProfissionaisEEap(): void {
    this.armazenamento.ler(CHAVE_EMPREITEIROS).subscribe({
      next: (bruto) => {
        if (!bruto) return;
        try {
          const dados = JSON.parse(bruto);
          if (Array.isArray(dados)) this.profissionais.set(dados.map((d) => normalizarEmpreiteiro(d)));
        } catch {
          // cadastro fica vazio, o seletor só mostra "(nenhum)"
        }
      },
      error: () => this.profissionais.set([]),
    });

    this.api.obterEap(this.obraId()).subscribe({
      next: (payload) => this.itensEap.set(extrairItensEapResumo(payload.eapItems)),
      error: () => this.itensEap.set([]),
    });
  }

  protected readonly preparo = signal<RdoPreparo | null>(null);
  /** RDO carregado, só em modo edição — fonte das fotos/vídeos JÁ salvos. */
  protected readonly registroAtual = signal<RdoRegistro | null>(null);

  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly fotosSelecionadas = signal<FotoSelecionada[]>([]);
  /** Vídeos escolhidos, ainda não salvos (F8, 22/09/2026) — mesma ideia de `fotosSelecionadas`. */
  protected readonly videosSelecionados = signal<VideoSelecionado[]>([]);
  /** Foto (ou vídeo) já salva, aberta em tamanho grande no popup. */
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

  /**
   * Fichas de verificação de serviço (F10) — nascem/são copiadas sozinhas
   * pelo backend ao salvar o RDO (ver `RdoController`); esta tela só
   * exibe/edita as respostas. Fica FORA de `formulario` de propósito: cada
   * ficha se salva com um PUT próprio (`FvsService.salvar`), independente
   * do resto do RDO — não precisa salvar o RDO inteiro de novo só pra
   * marcar um item como conforme.
   */
  protected readonly formularioFvs: FormArray = this.fb.array([]);
  protected readonly salvandoFvs = signal<Set<string>>(new Set());
  protected readonly erroFvs = signal<string | null>(null);

  private montarFormularioFvs(fichas: FvsPreenchimento[]): void {
    this.formularioFvs.clear();
    fichas.forEach((ficha) => {
      this.formularioFvs.push(
        this.fb.group({
          id: [ficha.id],
          observacao_geral: [ficha.observacao_geral ?? ''],
          itens: this.fb.array(
            ficha.itens.map((item) =>
              this.fb.group({
                id: [item.id],
                descricao: [item.descricao],
                resultado: [item.resultado],
                observacao: [item.observacao ?? ''],
              }),
            ),
          ),
        }),
      );
    });
  }

  protected fichaGrupo(i: number): FormGroup {
    return this.formularioFvs.at(i) as FormGroup;
  }

  protected itensFicha(i: number): FormArray {
    return this.fichaGrupo(i).get('itens') as FormArray;
  }

  protected escolherResultado(fichaIndice: number, itemIndice: number, resultado: ResultadoFvs): void {
    (this.itensFicha(fichaIndice).at(itemIndice) as FormGroup).patchValue({ resultado });
  }

  /** Metadados só de leitura (código, status, item da EAP, RDO de origem) — vêm do `registroAtual()`, não do form. */
  protected metaFicha(fichaId: string): FvsPreenchimento | undefined {
    return this.registroAtual()?.fvs_preenchimentos.find((f) => f.id === fichaId);
  }

  protected salvarFicha(i: number): void {
    const grupo = this.fichaGrupo(i);
    const fichaId = grupo.get('id')?.value as string;

    this.salvandoFvs.update((s) => new Set(s).add(fichaId));
    this.erroFvs.set(null);

    const itens = (grupo.get('itens') as FormArray).controls.map((c) => ({
      id: c.get('id')?.value,
      resultado: c.get('resultado')?.value || null,
      observacao: c.get('observacao')?.value || null,
    }));

    this.fvsApi.salvar(fichaId, { observacao_geral: grupo.get('observacao_geral')?.value || null, itens }).subscribe({
      next: (fichaAtualizada) => {
        this.salvandoFvs.update((s) => {
          const novo = new Set(s);
          novo.delete(fichaId);
          return novo;
        });
        const registro = this.registroAtual();
        if (registro) {
          this.registroAtual.set({
            ...registro,
            fvs_preenchimentos: registro.fvs_preenchimentos.map((f) => (f.id === fichaId ? fichaAtualizada : f)),
          });
        }
        this.aviso.set('Ficha salva.');
      },
      error: () => {
        this.salvandoFvs.update((s) => {
          const novo = new Set(s);
          novo.delete(fichaId);
          return novo;
        });
        this.erroFvs.set('Não foi possível salvar esta ficha.');
      },
    });
  }

  protected enviarFotoFicha(itemId: string, arquivo: File | null): void {
    if (!arquivo) return;
    this.fvsApi.enviarFoto(itemId, arquivo).subscribe({
      next: (foto) => {
        const registro = this.registroAtual();
        if (!registro) return;
        this.registroAtual.set({
          ...registro,
          fvs_preenchimentos: registro.fvs_preenchimentos.map((ficha) => ({
            ...ficha,
            itens: ficha.itens.map((item) => (item.id === itemId ? { ...item, fotos: [...item.fotos, foto] } : item)),
          })),
        });
      },
      error: () => this.erroFvs.set('Não foi possível enviar a foto.'),
    });
  }

  protected removerFotoFicha(itemId: string, fotoId: string): void {
    if (!confirm('Remover esta foto?')) return;
    this.fvsApi.removerFoto(fotoId).subscribe({
      next: () => {
        const registro = this.registroAtual();
        if (!registro) return;
        this.registroAtual.set({
          ...registro,
          fvs_preenchimentos: registro.fvs_preenchimentos.map((ficha) => ({
            ...ficha,
            itens: ficha.itens.map((item) =>
              item.id === itemId ? { ...item, fotos: item.fotos.filter((f) => f.id !== fotoId) } : item,
            ),
          })),
        });
      },
      error: () => this.erroFvs.set('Não foi possível remover a foto.'),
    });
  }

  protected readonly ehNovo = computed(() => this.rdoId() === 'novo');
  protected readonly numeroPrevisto = computed(() => this.preparo()?.proximo_numero ?? 1);

  ngOnInit(): void {
    this.carregando.set(true);
    this.carregarProfissionaisEEap();

    // O cabeçalho técnico é por OBRA (não por RDO) — sempre carrega, criando
    // ou editando; é dele também que vêm as sugestões pro RDO novo.
    this.rdoApi.preparar(this.obraId()).subscribe({
      next: (preparo) => {
        this.preparo.set(preparo);
        this.aplicarCabecalho(preparo.cabecalho);
        if (this.ehNovo()) {
          this.novoRegistro();
          this.carregando.set(false);
        }
      },
      error: () => {
        this.erro.set('Não foi possível preparar o RDO desta obra.');
        this.carregando.set(false);
      },
    });

    if (!this.ehNovo()) {
      this.rdoApi.obter(this.rdoId()).subscribe({
        next: (registro) => {
          this.aplicarRegistro(registro);
          this.carregando.set(false);
        },
        error: () => {
          this.erro.set('Não foi possível carregar este relatório.');
          this.carregando.set(false);
        },
      });
    }
  }

  /**
   * Prepara o formulário para um RDO novo: limpa tudo e traz o
   * pré-preenchimento do lançamento anterior (etapas não concluídas e a mão
   * de obra de ontem).
   */
  private novoRegistro(): void {
    this.formulario.reset({
      data: hojeIso(),
      clima_manha: 'claro',
      clima_tarde: 'claro',
      clima_noite: 'claro',
      impacto_cronograma: '',
      observacoes: '',
    });

    this.limparArrays();
    this.formularioFvs.clear();

    const preparo = this.preparo();
    preparo?.etapas_sugeridas.forEach((e) => this.adicionarEtapa(null, e.nome, false));
    preparo?.mao_de_obra_sugerida.forEach((m) =>
      this.adicionarMaoDeObra(m.categoria, m.profissional_id, m.profissional_nome, m.funcao, m.quantidade),
    );

    if (this.arr('tarefas').length === 0) {
      this.adicionarTarefa();
    }
  }

  /** Carrega um RDO já salvo no formulário. Editar é permitido mesmo depois de assinado. */
  private aplicarRegistro(registro: RdoRegistro): void {
    this.registroAtual.set(registro);
    this.fotosSelecionadas.set([]);
    this.videosSelecionados.set([]);
    this.limparArrays();

    this.formulario.patchValue({
      data: registro.data?.substring(0, 10) ?? hojeIso(),
      clima_manha: registro.clima_manha ?? 'claro',
      clima_tarde: registro.clima_tarde ?? 'claro',
      clima_noite: registro.clima_noite ?? 'claro',
      impacto_cronograma: registro.impacto_cronograma ?? '',
      observacoes: registro.observacoes ?? '',
    });

    registro.etapas?.forEach((e) => this.adicionarEtapa(e.eap_item_id, e.nome, e.concluida));
    registro.mao_de_obra?.forEach((m) =>
      this.adicionarMaoDeObra(m.categoria, m.profissional_id, m.profissional_nome, m.funcao, m.quantidade),
    );
    registro.equipamentos?.forEach((e) => this.adicionarEquipamento(e.descricao, e.quantidade));
    registro.tarefas?.forEach((t) => this.adicionarTarefa(t.descricao, t.id));
    registro.ocorrencias?.forEach((o) => this.adicionarOcorrencia(o));
    registro.pendencias?.forEach((p) => this.adicionarPendencia(p));
    registro.responsaveis_presentes?.forEach((r) => this.adicionarResponsavel(r));
    this.montarFormularioFvs(registro.fvs_preenchimentos ?? []);
    registro.comentarios_internos?.forEach((c) =>
      this.adicionarComentario(c.texto, c.visivel_contratante),
    );

    if (this.arr('tarefas').length === 0) {
      this.adicionarTarefa();
    }
  }

  protected voltarParaLista(): void {
    void this.router.navigate(['/obras', this.obraId(), 'rdo']);
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

  /** Mão de obra de uma categoria (interno/externo), com o índice real no FormArray. */
  protected maoDeObraDe(categoria: 'interno' | 'externo'): Array<{ indice: number; grupo: FormGroup }> {
    return this.arr('mao_de_obra').controls
      .map((controle, indice) => ({ indice, grupo: controle as FormGroup }))
      .filter((linha) => linha.grupo.get('categoria')?.value === categoria);
  }

  /**
   * Esvazia os 8 FormArrays antes de `novoRegistro()`/`aplicarRegistro()` reconstruí-los.
   *
   * Bug corrigido em 22/09/2026 (F8, achado ao fazer o calendário — hoje na
   * lista — chamar isto repetidas vezes): os `@for` destes arrays no template
   * tinham `track $index`. Como o índice de uma linha não muda entre um
   * "limpar e recriar" (só o CONTEÚDO muda), o Angular reaproveitava o
   * elemento do DOM e nunca reconectava `[formGroupName]`/`[formArrayName]`
   * ao FormGroup NOVO — ficava preso no antigo, já removido do array, e a
   * seção ficava "ng-invalid" para sempre mesmo com o campo preenchido
   * corretamente. Corrigido trocando o `track` de cada um deles para a
   * própria linha/control (`track tarefa`, `track linha.grupo` etc.) — objeto
   * novo, DOM recriado, liga certo. Vale pra qualquer FormArray novo que este
   * módulo ganhar: nunca usar `track $index` aqui.
   */
  private limparArrays(): void {
    ['etapas', 'mao_de_obra', 'equipamentos', 'tarefas', 'ocorrencias', 'pendencias', 'responsaveis', 'comentarios']
      .forEach((nome) => this.arr(nome).clear());
  }

  protected adicionarEtapa(eapItemId: string | null = null, nome = '', concluida = false): void {
    this.arr('etapas').push(
      this.fb.group({
        eap_item_id: [eapItemId],
        nome: [nome, Validators.required],
        concluida: [concluida],
      }),
    );
  }

  /** Etapa nova a partir da EAP: id fica no formulário, nome vem como rótulo (ainda editável depois). */
  protected escolherEtapaEap(indice: number, opcao: OpcaoAutocomplete | null): void {
    const grupo = this.grupo('etapas', indice);
    grupo.patchValue({ eap_item_id: opcao?.id ?? null, nome: opcao?.rotulo ?? grupo.get('nome')?.value });
  }

  protected adicionarMaoDeObra(
    categoria: 'interno' | 'externo',
    profissionalId: string | null = null,
    profissionalNome: string | null = null,
    funcao = '',
    quantidade = 1,
  ): void {
    this.arr('mao_de_obra').push(
      this.fb.group({
        categoria: [categoria],
        profissional_id: [profissionalId],
        profissional_nome: [profissionalNome],
        funcao: [funcao, Validators.required],
        quantidade: [quantidade, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  /** Campo de busca de profissional por coluna (`[(valor)]` do autocomplete) — some depois de escolher. */
  protected readonly buscaProfissionalInterno = signal('');
  protected readonly buscaProfissionalExterno = signal('');

  /**
   * Adiciona uma linha de mão de obra a partir de um profissional escolhido
   * no autocomplete (F9) — categoria/função vêm do próprio cadastro, cada
   * escolha é uma pessoa (`quantidade` sempre 1). Limpa o campo de busca
   * depois, pra poder buscar o próximo sem apagar na mão.
   */
  protected adicionarProfissionalPresente(opcao: OpcaoAutocomplete | null): void {
    if (!opcao) return;
    const profissional = this.profissionais().find((p) => p.id === opcao.id);
    if (!profissional) return;

    this.adicionarMaoDeObra(
      profissional.vinculo,
      profissional.id,
      profissional.nome,
      profissional.especialidade || 'Sem função definida',
    );
    this.buscaProfissionalInterno.set('');
    this.buscaProfissionalExterno.set('');
  }

  /** Linha manual (sem profissional do cadastro) — função/quantidade digitadas, como era antes da F9. */
  protected adicionarMaoDeObraManual(categoria: 'interno' | 'externo'): void {
    this.adicionarMaoDeObra(categoria, null, null, '', 1);
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
   * Ao remover uma tarefa, as fotos/vídeos que apontavam para ela viram
   * fotos/vídeos do dia em vez de sumirem — o mesmo que o backend faz
   * (nullOnDelete).
   */
  protected removerTarefa(i: number): void {
    const id = this.grupo('tarefas', i).get('id')?.value as string;
    this.fotosSelecionadas.update((fotos) =>
      fotos.map((f) => (f.tarefaRef === id ? { ...f, tarefaRef: null } : f)),
    );
    this.videosSelecionados.update((videos) =>
      videos.map((v) => (v.tarefaRef === id ? { ...v, tarefaRef: null } : v)),
    );
    this.arr('tarefas').removeAt(i);
  }

  // ------------------------------------------------------------------
  // Fotos e vídeos — ainda não salvos (escolhidos agora)
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

  protected escolherVideos(evento: Event, tarefaRef: string | null): void {
    const input = evento.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';

    const grandeDemais = arquivos.filter((a) => a.size > TAMANHO_MAXIMO_VIDEO);
    if (grandeDemais.length) {
      this.erro.set(
        `${grandeDemais.map((a) => a.name).join(', ')}: vídeo maior que 100 MB — comprima ou grave em qualidade menor.`,
      );
    }

    const novos = arquivos
      .filter((a) => a.size <= TAMANHO_MAXIMO_VIDEO)
      .map((arquivo) => ({ arquivo, previewUrl: URL.createObjectURL(arquivo), tarefaRef, legenda: '' }));

    this.videosSelecionados.update((atual) => [...atual, ...novos]);
  }

  protected videosDaTarefa(tarefaRef: string | null): VideoSelecionado[] {
    return this.videosSelecionados().filter((v) => v.tarefaRef === tarefaRef);
  }

  protected indiceDoVideo(video: VideoSelecionado): number {
    return this.videosSelecionados().indexOf(video);
  }

  protected atualizarLegendaVideo(indice: number, valor: string): void {
    this.videosSelecionados.update((videos) =>
      videos.map((v, i) => (i === indice ? { ...v, legenda: valor } : v)),
    );
  }

  protected descartarVideo(indice: number): void {
    const video = this.videosSelecionados()[indice];
    if (video) {
      URL.revokeObjectURL(video.previewUrl);
    }
    this.videosSelecionados.update((videos) => videos.filter((_, i) => i !== indice));
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

  // ------------------------------------------------------------------
  // Fotos e vídeos JÁ SALVOS (só existem em modo edição) — mostrados junto
  // dos recém-escolhidos, na mesma tarefa/dia, pra dar pra ver o que já tem
  // sem precisar sair da edição (22/09/2026, F8: antes só dava pra ver pela
  // lista separada que virou `rdo-lista.ts`).
  // ------------------------------------------------------------------

  protected fotosSalvasDaTarefa(tarefaId: string): RdoFoto[] {
    return (this.registroAtual()?.fotos ?? []).filter((f) => f.tarefa_id === tarefaId);
  }

  protected fotosSalvasDoDia(): RdoFoto[] {
    return (this.registroAtual()?.fotos ?? []).filter((f) => !f.tarefa_id);
  }

  /**
   * `foto.url` vem relativo (`/storage/...`) — achado em 23/09/2026:
   * nenhuma foto/vídeo aparecia no PDF de nenhum módulo porque a API
   * devolvia URL absoluta (`APP_URL`), que só existe do ponto de vista do
   * navegador do usuário. Mesmo mecanismo já usado pra logo da empresa
   * (`ApiService.baseStorage()`), agora também pras mídias do RDO.
   */
  protected urlMidia(foto: RdoFoto): string {
    return this.api.baseStorage() + foto.url;
  }

  /** Mesma ideia de `urlMidia()`, pras fotos de evidência das fichas de verificação (F10). */
  protected urlFotoFvs(url: string): string {
    return this.api.baseStorage() + url;
  }

  protected ampliar(foto: RdoFoto): void {
    this.fotoAmpliada.set(foto);
  }

  protected fecharAmpliada(): void {
    this.fotoAmpliada.set(null);
  }

  protected removerFotoSalva(foto: RdoFoto): void {
    const rotulo = foto.tipo === 'video' ? 'este vídeo' : 'esta foto';
    if (!confirm(`Remover ${rotulo}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    const registro = this.registroAtual();
    if (!registro) {
      return;
    }
    this.rdoApi.removerFoto(registro.id, foto.id).subscribe({
      next: () => {
        this.registroAtual.set({ ...registro, fotos: registro.fotos.filter((f) => f.id !== foto.id) });
        if (this.fotoAmpliada()?.id === foto.id) {
          this.fecharAmpliada();
        }
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
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

    this.salvando.set(true);
    this.erro.set(null);

    const bruto = this.formulario.getRawValue();
    const payload: Record<string, unknown> = {
      ...bruto,
      // Tarefa sem descrição é linha em branco que o usuário deixou passar —
      // não vira registro.
      tarefas: (bruto.tarefas as Array<{ descricao: string }>).filter((t) => t.descricao?.trim()),
    };

    const fotos = this.fotosSelecionadas();
    const videos = this.videosSelecionados();
    const ehNovo = this.ehNovo();
    const requisicao = ehNovo
      ? this.rdoApi.criar({ ...payload, obra_id: this.obraId() }, fotos, videos)
      : this.rdoApi.atualizar(this.rdoId(), payload, fotos, videos);

    requisicao.subscribe({
      next: (registro) => {
        this.salvando.set(false);
        this.aviso.set(ehNovo ? 'Relatório salvo como rascunho.' : 'Relatório atualizado.');
        if (ehNovo) {
          // Troca pra URL de edição de verdade — salvar de novo já vira update,
          // e recarregar a página continua funcionando.
          void this.router.navigate(['/obras', this.obraId(), 'rdo', registro.id]);
        } else {
          this.aplicarRegistro(registro);
        }
      },
      error: (e) => {
        this.salvando.set(false);
        this.erro.set(this.mensagemDeErro(e));
      },
    });
  }

  /** Finalizar É assinar — e é o que dispara o aviso por e-mail ao contratante. */
  protected finalizar(): void {
    const registro = this.registroAtual();
    if (!registro) {
      return;
    }
    if (!confirm(`Finalizar e assinar o RDO nº ${registro.numero}? O contratante será avisado por e-mail.`)) {
      return;
    }

    this.rdoApi.finalizar(registro.id).subscribe({
      next: (atualizado) => {
        this.aviso.set('Relatório finalizado e assinado.');
        this.aplicarRegistro(atualizado);
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  /**
   * Baixa o RDO em PDF. O arquivo chega como blob (a rota exige o token
   * Sanctum no cabeçalho), então o download é disparado por uma URL temporária
   * de objeto, revogada logo em seguida para não vazar memória.
   */
  protected baixarPdf(): void {
    const registro = this.registroAtual();
    if (!registro) {
      return;
    }
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

  protected excluir(): void {
    const registro = this.registroAtual();
    if (!registro) {
      return;
    }
    if (!confirm(`Excluir o RDO nº ${registro.numero}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    this.rdoApi.excluir(registro.id).subscribe({
      next: () => this.voltarParaLista(),
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
  }

  protected salvarCabecalho(): void {
    this.rdoApi.salvarCabecalho(this.obraId(), this.cabecalho.getRawValue() as RdoObraDados).subscribe({
      next: () => {
        this.aviso.set('Cabeçalho da obra salvo.');
        this.mostrarCabecalho.set(false);
      },
      error: (e) => this.erro.set(this.mensagemDeErro(e)),
    });
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

  private mensagemDeErro(e: unknown): string {
    const erro = e as { error?: { message?: string; mensagem?: string } };

    return erro?.error?.mensagem ?? erro?.error?.message ?? 'Não foi possível concluir a operação.';
  }
}
