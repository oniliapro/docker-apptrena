import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TimeoutError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { entregarArquivo } from '../../core/utils/entregar-arquivo';
import { hojeIso } from '../../core/utils/formato';
import { Autocomplete, OpcaoAutocomplete } from '../../shared/autocomplete/autocomplete';
import { ItemEapResumo, extrairItensEapResumo } from '../../shared/eap-snapshot';
import { NavegacaoTabela } from '../../shared/navegacao-tabela/navegacao-tabela';
import { Empreiteiro } from '../cadastros/cadastros.models';
import { CHAVE_EMPREITEIROS, normalizarEmpreiteiro } from '../cadastros/empreiteiros/empreiteiros';
import { FvsPreenchimento, ResultadoFvs } from '../fvs/fvs.models';
import { FvsService } from '../fvs/fvs.service';
import {
  CategoriaEquipamento,
  CLIMAS,
  CONDICOES_TRABALHO,
  FotoSelecionada,
  RdoFoto,
  RdoPreparo,
  RdoRegistro,
  TAMANHO_MAXIMO_FOTO,
  TAMANHO_MAXIMO_VIDEO,
  TIPOS_OCORRENCIA,
  TURNOS_CLIMA,
  VideoSelecionado,
} from './rdo.models';
import { RdoFilaService, RdoPendenteEnvio } from './rdo-fila.service';
import { RdoService } from './rdo.service';

/** Valor bruto de uma pendência/ocorrência dentro de uma linha de tarefa — ver `desmembrarTarefas`. */
interface PendenciaBruta {
  descricao: string;
  responsavel: string;
  prazo: string;
  status: string;
}
interface OcorrenciaBruta {
  tipo: string;
  descricao: string;
  responsavel: string;
  motivo: string;
  danos_materiais: string;
}

/** Valor bruto (`getRawValue()`) de uma linha de "Tarefas realizadas" — ver `desmembrarTarefas`. */
interface LinhaTarefaBruta {
  id: string;
  descricao: string;
  eap_item_id: string | null;
  concluida: boolean;
  observacoes: string;
  pendencias: PendenciaBruta[];
  ocorrencias: OcorrenciaBruta[];
}

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
  imports: [ReactiveFormsModule, Autocomplete, NavegacaoTabela],
  templateUrl: './rdo.html',
  styleUrl: './rdo.scss',
})
export class Rdo implements OnInit {
  private readonly rdoApi = inject(RdoService);
  private readonly fila = inject(RdoFilaService);
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
  protected readonly condicoesTrabalho = CONDICOES_TRABALHO;
  protected readonly turnosClima = TURNOS_CLIMA;
  protected readonly tiposOcorrencia = TIPOS_OCORRENCIA;

  /**
   * "S/ expediente" (14/10/2026, pedido do Lucas — corrigido no mesmo dia:
   * a 1ª versão era uma caixa só pro dia inteiro; o pedido de verdade era
   * POR TURNO, já que cada turno tem sua própria caixa na tabela de clima)
   * — marcar um turno deixa o CLIMA e a CONDIÇÃO DE TRABALHO daquele turno
   * em branco (`null`, já um valor válido no backend — só o formulário
   * nunca oferecia um jeito de chegar nele) e desabilita o rádio de clima
   * + o select de condição daquele turno. Não é salvo como campo à parte —
   * reabrir um RDO salvo com os dois campos de um turno em branco já volta
   * com a caixa daquele turno marcada sozinha (ver `aplicarRegistro`).
   */
  protected readonly semExpedientePorTurno = signal<Record<string, boolean>>({});

  protected turnoSemExpediente(chaveTurno: string): boolean {
    return !!this.semExpedientePorTurno()[chaveTurno];
  }

  protected alternarSemExpedienteTurno(turno: (typeof TURNOS_CLIMA)[number], marcado: boolean): void {
    this.semExpedientePorTurno.update((atual) => ({ ...atual, [turno.chave]: marcado }));
    const climaControle = this.formulario.get(turno.controlClima);
    const condicaoControle = this.formulario.get(turno.controlCondicao);
    if (marcado) {
      climaControle?.setValue(null);
      climaControle?.disable();
      condicaoControle?.setValue(null);
      condicaoControle?.disable();
    } else {
      climaControle?.enable();
      climaControle?.setValue('claro');
      condicaoControle?.enable();
      condicaoControle?.setValue('praticavel');
    }
  }

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
    // "Impraticável" saiu do clima e virou uma condição de trabalho à parte, por turno (26/09/2026).
    condicao_manha: ['praticavel'],
    condicao_tarde: ['praticavel'],
    condicao_noite: ['praticavel'],
    observacoes: [''],
    mao_de_obra: this.fb.array([]),
    equipamentos: this.fb.array([]),
    tarefas: this.fb.array([]),
    // Pendências/ocorrências GERAIS do dia (26/09/2026) — sem tarefa, moram na
    // seção "Fotos e vídeos do dia" junto das mídias sem vínculo com tarefa.
    pendencias_gerais: this.fb.array([]),
    ocorrencias_gerais: this.fb.array([]),
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

  /** Fichas cujo PDF está sendo gerado (o Chromium do servidor leva alguns segundos). */
  protected readonly gerandoPdfFvs = signal<ReadonlySet<string>>(new Set());

  /**
   * Imprime a ficha como DOCUMENTO (15/10/2026) — usa o modelo do tipo "Ficha de
   * verificação de serviço" de Modelos de documentos. Imprime o que está GRAVADO:
   * se a ficha tem alteração ainda não salva, pede para salvar antes.
   */
  protected imprimirFicha(i: number): void {
    const grupo = this.fichaGrupo(i);
    const fichaId = grupo.get('id')?.value as string;

    if (grupo.dirty) {
      this.erroFvs.set('Salve a ficha antes de imprimir — o documento usa o que está gravado.');
      return;
    }

    this.gerandoPdfFvs.update((s) => new Set(s).add(fichaId));
    this.erroFvs.set(null);

    const terminar = () =>
      this.gerandoPdfFvs.update((s) => {
        const novo = new Set(s);
        novo.delete(fichaId);
        return novo;
      });

    this.api.baixarFvsPdf(fichaId).subscribe({
      next: (blob) => {
        terminar();
        void entregarArquivo(blob, `${this.metaFicha(fichaId)?.codigo ?? 'ficha-de-verificacao'}.pdf`).catch(() =>
          this.erroFvs.set('Não foi possível salvar o documento da ficha neste aparelho.'),
        );
      },
      error: async (falha) => {
        terminar();
        // Erro de PDF volta como Blob (`responseType: 'blob'`) — lê a mensagem do servidor, se houver.
        let mensagem = 'Não foi possível gerar o documento da ficha. Tente novamente em alguns segundos.';
        try {
          const corpo = falha?.error instanceof Blob ? JSON.parse(await falha.error.text()) : falha?.error;
          if (typeof corpo?.message === 'string') mensagem = corpo.message;
        } catch {
          // mantém a mensagem padrão
        }
        this.erroFvs.set(mensagem);
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

  /** App ComTrena (09/10/2026) — no site é sempre `false`. */
  protected readonly ehApp = environment.app;
  /**
   * Id do RDO novo, gerado aqui. A API aceita e usa como id definitivo
   * (`RdoController::store`) — no app, é o que permite guardar o RDO no
   * celular e mandar depois sem risco de duplicar.
   */
  private readonly idNovo = crypto.randomUUID();
  /** App: RDO lançado no celular que ainda está na fila de envio (`RdoFilaService`). */
  protected readonly rascunhoLocal = signal<RdoPendenteEnvio | null>(null);
  private rascunhoVistoNaFila = false;

  constructor() {
    // App: quando o RDO aberto sai da fila (chegou ao servidor), troca a
    // versão do celular pela do servidor — com número, fotos salvas e FVS.
    effect(() => {
      const local = this.rascunhoLocal();
      const naFila = !!local && this.fila.itens().some((i) => i.id === local.id);
      const enviando = this.fila.enviando();
      if (!local) return;
      if (naFila) {
        this.rascunhoVistoNaFila = true;
      } else if (this.rascunhoVistoNaFila && !enviando) {
        untracked(() => this.trocarPeloEnviado(local.id));
      }
    });
  }
  protected readonly numeroPrevisto = computed(() => this.preparo()?.proximo_numero ?? 1);

  ngOnInit(): void {
    this.carregando.set(true);
    this.carregarProfissionaisEEap();

    // O cabeçalho técnico é por OBRA (não por RDO) — sempre carrega, criando
    // ou editando; é dele também que vêm as sugestões pro RDO novo.
    this.rdoApi.preparar(this.obraId()).subscribe({
      next: (preparo) => {
        this.preparo.set(preparo);
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
      if (this.ehApp) {
        // App: o RDO pode estar só no celular, esperando para ser enviado.
        void this.fila
          .obter(this.rdoId())
          .then((local) => (local ? this.aplicarRascunhoLocal(local) : this.carregarDoServidor()));
      } else {
        this.carregarDoServidor();
      }
    }
  }

  private carregarDoServidor(): void {
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

  /**
   * App: abre no formulário um RDO que está na fila do celular. O corpo
   * guardado tem o mesmo formato do que a API devolve (tarefas, etapas,
   * pendências, mão de obra...), então reaproveita `aplicarRegistro`; as
   * fotos e os vídeos voltam como "selecionados, ainda não enviados".
   */
  private aplicarRascunhoLocal(item: RdoPendenteEnvio): void {
    const p = item.payload as Record<string, unknown>;
    const lista = (chave: string) => (Array.isArray(p[chave]) ? (p[chave] as Array<Record<string, unknown>>) : []);
    const texto = (chave: string) => (typeof p[chave] === 'string' ? (p[chave] as string) : null);

    const registro = {
      id: item.id,
      empresa_id: '',
      obra_id: item.obraId,
      numero: null,
      data: texto('data') ?? hojeIso(),
      clima_manha: texto('clima_manha'),
      clima_tarde: texto('clima_tarde'),
      clima_noite: texto('clima_noite'),
      condicao_manha: texto('condicao_manha'),
      condicao_tarde: texto('condicao_tarde'),
      condicao_noite: texto('condicao_noite'),
      impacto_cronograma: texto('impacto_cronograma'),
      observacoes: texto('observacoes'),
      status: 'rascunho',
      assinado_em: null,
      assinante_nome: null,
      assinante_crea: null,
      tarefas: lista('tarefas').map((t, i) => ({ ...t, ordem: i })),
      etapas: lista('etapas').map((e, i) => ({ id: `${item.id}-etapa-${i}`, ...e })),
      pendencias: lista('pendencias').map((x, i) => ({ id: `${item.id}-pendencia-${i}`, tarefa_id: null, ...x })),
      ocorrencias: lista('ocorrencias').map((x, i) => ({ id: `${item.id}-ocorrencia-${i}`, tarefa_id: null, ...x })),
      mao_de_obra: lista('mao_de_obra'),
      equipamentos: lista('equipamentos'),
      fotos: [],
      responsaveis_presentes: [],
      comentarios_internos: [],
      fvs_preenchimentos: [],
    } as unknown as RdoRegistro;

    this.aplicarRegistro(registro);
    this.rascunhoLocal.set(item);
    const { fotos, videos } = this.fila.paraFormulario(item);
    this.fotosSelecionadas.set(fotos);
    this.videosSelecionados.set(videos);
    this.carregando.set(false);
  }

  /** App: o RDO que estava aberto chegou ao servidor — passa a mostrar a versão de lá. */
  private trocarPeloEnviado(id: string): void {
    this.rascunhoLocal.set(null);
    this.rascunhoVistoNaFila = false;
    this.rdoApi.obter(id).subscribe({
      next: (registro) => {
        this.aplicarRegistro(registro);
        this.erro.set(null);
        this.aviso.set(`RDO enviado ao servidor — nº ${registro.numero}.`);
      },
      error: () => this.aviso.set('RDO enviado ao servidor.'),
    });
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
      condicao_manha: 'praticavel',
      condicao_tarde: 'praticavel',
      condicao_noite: 'praticavel',
      observacoes: '',
    });
    // `reset()` não reabilita sozinho um controle desabilitado à mão (ex.:
    // "S/ expediente" marcado no RDO editado antes de criar este novo) —
    // reforça aqui pra um "S/ expediente" de um RDO anterior não vazar pro
    // próximo.
    TURNOS_CLIMA.forEach((t) => {
      this.formulario.get(t.controlClima)?.enable();
      this.formulario.get(t.controlCondicao)?.enable();
    });
    this.semExpedientePorTurno.set({});

    this.limparArrays();
    this.formularioFvs.clear();

    const preparo = this.preparo();
    // "Etapas não concluídas do RDO anterior" (26/09/2026: cada etapa virou uma
    // linha de "Tarefas realizadas", com o nome sugerido como descrição inicial).
    preparo?.etapas_sugeridas.forEach((e) =>
      this.adicionarTarefa(e.nome, undefined, e.eap_item_id, e.concluida),
    );
    preparo?.mao_de_obra_sugerida.forEach((m) =>
      this.adicionarMaoDeObra(m.categoria, m.profissional_id, m.profissional_nome, m.funcao, m.quantidade),
    );
    // Equipamentos alugados (26/09/2026): nascem sozinhos a partir dos itens
    // ainda ativos de contratos não encerrados — só falta marcar se cada um
    // está presente na obra hoje. Só dá pra ADICIONAR manualmente equipamento
    // SEM contrato (botão "+ Equipamento alugado (sem contrato)").
    preparo?.contratos_equipamentos_ativos.forEach((c) =>
      c.itens.forEach((item) =>
        this.adicionarEquipamento('alugado', item.descricao, item.quantidade, item.id, `Nº ${c.numero} — ${c.nome_contrato}`, true),
      ),
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
      observacoes: registro.observacoes ?? '',
    });

    // "S/ expediente" POR TURNO (14/10/2026): o formulário sempre grava um
    // clima — clima vazio só acontece quando o turno foi marcado assim (ver
    // `alternarSemExpedienteTurno`). Basta o clima (não exige a condição
    // vazia também): RDOs salvos enquanto o bug do FormData existia ficaram
    // com o clima vazio mas a condição "praticável", e precisam voltar
    // marcados.
    const semExpedientePorTurno: Record<string, boolean> = {};
    const registroComoMapa = registro as unknown as Record<string, string | null>;
    TURNOS_CLIMA.forEach((t) => {
      const semExpedienteDoTurno = !registroComoMapa[t.controlClima];
      semExpedientePorTurno[t.chave] = semExpedienteDoTurno;

      const climaControle = this.formulario.get(t.controlClima);
      const condicaoControle = this.formulario.get(t.controlCondicao);
      if (semExpedienteDoTurno) {
        climaControle?.setValue(null);
        climaControle?.disable();
        condicaoControle?.setValue(null);
        condicaoControle?.disable();
      } else {
        climaControle?.setValue(registroComoMapa[t.controlClima] ?? 'claro');
        climaControle?.enable();
        condicaoControle?.setValue(registroComoMapa[t.controlCondicao] ?? 'praticavel');
        condicaoControle?.enable();
      }
    });
    this.semExpedientePorTurno.set(semExpedientePorTurno);

    this.mesclarTarefasComEtapasEPendencias(registro);
    registro.mao_de_obra?.forEach((m) =>
      this.adicionarMaoDeObra(m.categoria, m.profissional_id, m.profissional_nome, m.funcao, m.quantidade),
    );
    registro.equipamentos?.forEach((e) =>
      this.adicionarEquipamento(e.categoria, e.descricao, e.quantidade, e.contrato_equipamento_item_id, e.contrato_referencia, e.presente),
    );
    this.montarFormularioFvs(registro.fvs_preenchimentos ?? []);

    if (this.arr('tarefas').length === 0) {
      this.adicionarTarefa();
    }
  }

  /**
   * Reconstrói "Tarefas realizadas" juntando Tarefa+Etapa (mesma posição —
   * são gravadas juntas desde 26/09/2026) com as Pendências/Ocorrências
   * daquela tarefa (por `tarefa_id`, vínculo exato). Pendências/Ocorrências
   * SEM tarefa (`tarefa_id` nulo) são GERAIS do dia (26/09/2026, pedido do
   * Lucas) — não pertencem a nenhuma tarefa, vão para os arrays
   * `pendencias_gerais`/`ocorrencias_gerais`, mostrados na seção "Fotos e
   * vídeos do dia".
   */
  private mesclarTarefasComEtapasEPendencias(registro: RdoRegistro): void {
    const tarefas = registro.tarefas ?? [];
    const etapas = registro.etapas ?? [];

    const agruparPorTarefa = <T extends { tarefa_id: string | null }>(itens: T[]): Map<string, T[]> => {
      const mapa = new Map<string, T[]>();
      itens.forEach((item) => {
        if (item.tarefa_id) mapa.set(item.tarefa_id, [...(mapa.get(item.tarefa_id) ?? []), item]);
      });
      return mapa;
    };

    const pendenciasPorTarefa = agruparPorTarefa(registro.pendencias ?? []);
    const ocorrenciasPorTarefa = agruparPorTarefa(registro.ocorrencias ?? []);

    const total = Math.max(tarefas.length, etapas.length);
    for (let i = 0; i < total; i++) {
      const tarefa = tarefas[i];
      const etapa = etapas[i];
      if (!tarefa && !etapa) continue;

      this.adicionarTarefa(
        tarefa?.descricao ?? etapa?.nome ?? '',
        tarefa?.id,
        etapa?.eap_item_id ?? null,
        etapa?.concluida ?? false,
        tarefa?.observacoes ?? null,
        tarefa ? (pendenciasPorTarefa.get(tarefa.id) ?? []) : [],
        tarefa ? (ocorrenciasPorTarefa.get(tarefa.id) ?? []) : [],
      );
    }

    (registro.pendencias ?? []).filter((p) => !p.tarefa_id).forEach((p) => this.pendenciasGerais().push(this.grupoPendencia(p)));
    (registro.ocorrencias ?? []).filter((o) => !o.tarefa_id).forEach((o) => this.ocorrenciasGerais().push(this.grupoOcorrencia(o)));
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
    ['mao_de_obra', 'equipamentos', 'tarefas', 'pendencias_gerais', 'ocorrencias_gerais']
      .forEach((nome) => this.arr(nome).clear());
  }

  /**
   * Vincula a tarefa `indice` a um item da EAP (26/09/2026: era da Etapa,
   * agora mora dentro da tarefa) — só preenche a Descrição do serviço
   * sozinho se ela ainda estiver vazia, pra não apagar o que a pessoa já
   * tinha escrito.
   */
  protected escolherEtapaEap(indice: number, opcao: OpcaoAutocomplete | null): void {
    const grupo = this.grupo('tarefas', indice);
    const descricaoAtual = String(grupo.get('descricao')?.value ?? '').trim();
    grupo.patchValue({
      eap_item_id: opcao?.id ?? null,
      descricao: descricaoAtual || opcao?.rotulo || descricaoAtual,
    });
  }

  /**
   * `origem` distingue a UI da linha: "cadastro" mostra um `<select>` que
   * busca no cadastro de Profissionais; "manual" mostra função/quantidade
   * digitadas à mão. Default: deduzido de `profissionalId` (uma linha que já
   * vem com profissional vinculado é sempre "cadastro").
   *
   * 26/09/2026, pedido do Lucas: antes havia um campo de busca ÚNICO acima da
   * lista, que escolhia o profissional e depois era limpo pelo botão
   * "Adicionar" — "tire esse [campo] que ficava sendo resetado". Agora o
   * botão cria a linha (com o `<select>` já dentro dela) direto.
   */
  protected adicionarMaoDeObra(
    categoria: 'interno' | 'externo',
    profissionalId: string | null = null,
    profissionalNome: string | null = null,
    funcao = '',
    quantidade = 1,
    origem: 'cadastro' | 'manual' = profissionalId ? 'cadastro' : 'manual',
  ): void {
    this.arr('mao_de_obra').push(
      this.fb.group({
        categoria: [categoria],
        origem: [origem],
        profissional_id: [profissionalId],
        profissional_nome: [profissionalNome],
        funcao: [funcao, Validators.required],
        quantidade: [quantidade, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  /** "+ Adicionar profissional": cria a linha já com o `<select>` do cadastro, ainda sem ninguém escolhido. */
  protected adicionarLinhaCadastro(categoria: 'interno' | 'externo'): void {
    this.adicionarMaoDeObra(categoria, null, null, '', 1, 'cadastro');
  }

  /** Linha manual (sem profissional do cadastro) — função/quantidade digitadas, como era antes da F9. */
  protected adicionarMaoDeObraManual(categoria: 'interno' | 'externo'): void {
    this.adicionarMaoDeObra(categoria, null, null, '', 1, 'manual');
  }

  /** Escolha feita no `<select>` da própria linha — preenche nome/função a partir do cadastro. */
  protected escolherProfissionalNaLinha(indice: number, profissionalId: string): void {
    const profissional = this.profissionais().find((p) => p.id === profissionalId);
    if (!profissional) return;

    this.grupo('mao_de_obra', indice).patchValue({
      profissional_id: profissional.id,
      profissional_nome: profissional.nome,
      funcao: profissional.especialidade || 'Sem função definida',
    });
  }

  /**
   * 26/09/2026, pedido do Lucas: "Equipamentos" virou duas colunas — próprios
   * (nome + quantidade) e alugados (contrato, nome, quantidade + "está na
   * obra?"). Um alugado vinculado a um contrato NASCE sozinho (ver
   * `novoRegistro`/`aplicarRegistro`) — o usuário só pode ADICIONAR manualmente
   * equipamento SEM contrato; nesse caso "contrato" fica vazio.
   */
  protected adicionarEquipamento(
    categoria: CategoriaEquipamento = 'proprio',
    descricao = '',
    quantidade = 0,
    contratoEquipamentoItemId: string | null = null,
    contratoReferencia: string | null = null,
    presente = true,
  ): void {
    this.arr('equipamentos').push(
      this.fb.group({
        categoria: [categoria],
        contrato_equipamento_item_id: [contratoEquipamentoItemId],
        contrato_referencia: [contratoReferencia],
        presente: [presente],
        descricao: [descricao, Validators.required],
        quantidade: [quantidade, [Validators.required, Validators.min(0)]],
      }),
    );
  }

  /** Equipamentos de uma categoria (próprio/alugado), com o índice real no FormArray — mesma ideia de `maoDeObraDe`. */
  protected equipamentosDe(categoria: CategoriaEquipamento): Array<{ indice: number; grupo: FormGroup }> {
    return this.arr('equipamentos').controls
      .map((controle, indice) => ({ indice, grupo: controle as FormGroup }))
      .filter((linha) => linha.grupo.get('categoria')?.value === categoria);
  }

  /** "+ Equipamento alugado (sem contrato)" — único jeito de ADICIONAR um alugado manualmente; contrato fica vazio. */
  protected adicionarEquipamentoAlugadoManual(): void {
    this.adicionarEquipamento('alugado');
  }

  /**
   * O id é gerado aqui no cliente (o backend aceita e reaproveita, ver o trait
   * HasUuidPrimaryKey) porque a foto precisa referenciar a tarefa ANTES de o
   * RDO ser salvo — é assim que `fotos_meta[i][tarefa_id]` sabe onde pendurar.
   *
   * 26/09/2026, pedido do Lucas: cada "Tarefa realizada" passou a carregar
   * também o que antes eram a Etapa (vínculo com a EAP + concluída) e listas
   * de Pendências e Ocorrências geradas por ela ("uma tarefa pode gerar mais
   * de uma pendência... o campo de ocorrências vai ficar dentro das
   * tarefas") — as quatro seções separadas viraram uma só.
   */
  protected adicionarTarefa(
    descricao = '',
    id?: string,
    eapItemId: string | null = null,
    concluida = false,
    observacoes: string | null = null,
    pendencias: Array<Partial<{ descricao: string | null; responsavel: string | null; prazo: string | null; status: string | null }>> = [],
    ocorrencias: Array<Partial<{ tipo: string | null; descricao: string | null; responsavel: string | null; motivo: string | null; danos_materiais: string | null }>> = [],
  ): void {
    this.arr('tarefas').push(
      this.fb.group({
        id: [id ?? crypto.randomUUID()],
        descricao: [descricao, Validators.required],
        eap_item_id: [eapItemId],
        concluida: [concluida],
        observacoes: [observacoes ?? ''],
        pendencias: this.fb.array(pendencias.map((p) => this.grupoPendencia(p))),
        ocorrencias: this.fb.array(ocorrencias.map((o) => this.grupoOcorrencia(o))),
      }),
    );
  }

  private grupoPendencia(
    p?: Partial<{ descricao: string | null; responsavel: string | null; prazo: string | null; status: string | null }>,
  ): FormGroup {
    return this.fb.group({
      descricao: [p?.descricao ?? '', Validators.required],
      responsavel: [p?.responsavel ?? ''],
      prazo: [p?.prazo?.substring(0, 10) ?? ''],
      status: [p?.status ?? 'aberta'],
    });
  }

  private grupoOcorrencia(
    o?: Partial<{ tipo: string | null; descricao: string | null; responsavel: string | null; motivo: string | null; danos_materiais: string | null }>,
  ): FormGroup {
    return this.fb.group({
      tipo: [o?.tipo ?? 'outra'],
      descricao: [o?.descricao ?? '', Validators.required],
      responsavel: [o?.responsavel ?? ''],
      motivo: [o?.motivo ?? ''],
      danos_materiais: [o?.danos_materiais ?? ''],
    });
  }

  protected pendenciasDaTarefa(i: number): FormArray {
    return this.grupo('tarefas', i).get('pendencias') as FormArray;
  }

  protected adicionarPendenciaNaTarefa(i: number): void {
    this.pendenciasDaTarefa(i).push(this.grupoPendencia());
  }

  protected removerPendenciaDaTarefa(i: number, j: number): void {
    this.pendenciasDaTarefa(i).removeAt(j);
  }

  /** Igual ao "+" do Mapa/EAP (14/10/2026) — insere logo abaixo da linha `j` (-1 = no final). */
  protected inserirPendenciaNaTarefaAbaixo(i: number, j: number): void {
    const array = this.pendenciasDaTarefa(i);
    array.insert(j < 0 ? array.length : j + 1, this.grupoPendencia());
  }

  protected moverPendenciaNaTarefa(i: number, j: number, delta: number): void {
    this.moverControleEmArray(this.pendenciasDaTarefa(i), j, delta);
  }

  protected ocorrenciasDaTarefa(i: number): FormArray {
    return this.grupo('tarefas', i).get('ocorrencias') as FormArray;
  }

  protected adicionarOcorrenciaNaTarefa(i: number): void {
    this.ocorrenciasDaTarefa(i).push(this.grupoOcorrencia());
  }

  protected removerOcorrenciaDaTarefa(i: number, j: number): void {
    this.ocorrenciasDaTarefa(i).removeAt(j);
  }

  protected inserirOcorrenciaNaTarefaAbaixo(i: number, j: number): void {
    const array = this.ocorrenciasDaTarefa(i);
    array.insert(j < 0 ? array.length : j + 1, this.grupoOcorrencia());
  }

  protected moverOcorrenciaNaTarefa(i: number, j: number, delta: number): void {
    this.moverControleEmArray(this.ocorrenciasDaTarefa(i), j, delta);
  }

  /** Pendências/ocorrências GERAIS do dia (26/09/2026) — sem tarefa, mostradas em "Fotos e vídeos do dia". */
  protected pendenciasGerais(): FormArray {
    return this.arr('pendencias_gerais');
  }

  protected adicionarPendenciaGeral(): void {
    this.pendenciasGerais().push(this.grupoPendencia());
  }

  protected removerPendenciaGeral(i: number): void {
    this.pendenciasGerais().removeAt(i);
  }

  protected inserirPendenciaGeralAbaixo(i: number): void {
    const array = this.pendenciasGerais();
    array.insert(i < 0 ? array.length : i + 1, this.grupoPendencia());
  }

  protected moverPendenciaGeral(i: number, delta: number): void {
    this.moverControleEmArray(this.pendenciasGerais(), i, delta);
  }

  protected ocorrenciasGerais(): FormArray {
    return this.arr('ocorrencias_gerais');
  }

  protected adicionarOcorrenciaGeral(): void {
    this.ocorrenciasGerais().push(this.grupoOcorrencia());
  }

  protected removerOcorrenciaGeral(i: number): void {
    this.ocorrenciasGerais().removeAt(i);
  }

  protected inserirOcorrenciaGeralAbaixo(i: number): void {
    const array = this.ocorrenciasGerais();
    array.insert(i < 0 ? array.length : i + 1, this.grupoOcorrencia());
  }

  protected moverOcorrenciaGeral(i: number, delta: number): void {
    this.moverControleEmArray(this.ocorrenciasGerais(), i, delta);
  }

  /** Reordena um controle dentro do FormArray — mesma ideia de `EapStore.moverItem` (14/10/2026). */
  private moverControleEmArray(array: FormArray, indice: number, delta: number): void {
    const novoIndice = indice + delta;
    if (novoIndice < 0 || novoIndice >= array.length) return;
    const controle = array.at(indice);
    array.removeAt(indice);
    array.insert(novoIndice, controle);
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

  /**
   * 30/09/2026: ganhou a mesma pré-checagem de tamanho que `escolherVideos`
   * já tinha — antes, uma foto grande (celular moderno, 12MP+ passa fácil
   * de alguns MB) só era rejeitada no Salvar, com a requisição INTEIRA
   * voltando com erro (nada do dia salvava).
   */
  protected escolherFotos(evento: Event, tarefaRef: string | null): void {
    const input = evento.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';

    const grandeDemais = arquivos.filter((a) => a.size > TAMANHO_MAXIMO_FOTO);
    if (grandeDemais.length) {
      this.erro.set(
        `${grandeDemais.map((a) => a.name).join(', ')}: foto maior que 25 MB — reduza a resolução antes de anexar.`,
      );
    }

    const novas = arquivos
      .filter((a) => a.size <= TAMANHO_MAXIMO_FOTO)
      .map((arquivo) => ({
        arquivo,
        previewUrl: URL.createObjectURL(arquivo),
        tarefaRef,
        legenda: '',
        marcador: null,
        nota: '',
      }));

    this.fotosSelecionadas.update((atual) => [...atual, ...novas]);
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

  /**
   * "Tarefas realizadas" (o formulário) vira TRÊS listas pro backend, que
   * ainda guarda Tarefa/Etapa/Pendência como registros separados (26/09/2026
   * — a junção em uma seção só foi só na tela, ver comentário de
   * `adicionarTarefa`): a tarefa em si (id + descrição), a etapa (mesma
   * descrição como "nome", + o vínculo com a EAP e o concluída — é o que
   * mantém a Ficha de Verificação de Serviço funcionando) e, só pra quem
   * marcou "Gerou pendência", a pendência (com a própria descrição, ou a da
   * tarefa se a pessoa deixou em branco). Linha sem descrição é lixo de
   * formulário (linha em branco deixada passar) e não vira nada.
   */
  private desmembrarTarefas(linhas: LinhaTarefaBruta[]): {
    tarefas: Array<{ id: string; descricao: string; observacoes: string | null }>;
    etapas: Array<{ eap_item_id: string | null; nome: string; concluida: boolean }>;
    pendencias: Array<{ tarefa_id: string; descricao: string; responsavel: string | null; prazo: string | null; status: string }>;
    ocorrencias: Array<{ tarefa_id: string; tipo: string; descricao: string; responsavel: string | null; motivo: string | null; danos_materiais: string | null }>;
  } {
    const validas = linhas.filter((t) => t.descricao?.trim());

    return {
      tarefas: validas.map((t) => ({ id: t.id, descricao: t.descricao, observacoes: t.observacoes?.trim() || null })),
      etapas: validas.map((t) => ({
        eap_item_id: t.eap_item_id || null,
        nome: t.descricao,
        concluida: !!t.concluida,
      })),
      pendencias: validas.flatMap((t) =>
        (t.pendencias ?? [])
          .filter((p) => p.descricao?.trim())
          .map((p) => ({
            tarefa_id: t.id,
            descricao: p.descricao.trim(),
            responsavel: p.responsavel || null,
            prazo: p.prazo || null,
            status: p.status || 'aberta',
          })),
      ),
      ocorrencias: validas.flatMap((t) =>
        (t.ocorrencias ?? [])
          .filter((o) => o.descricao?.trim())
          .map((o) => ({
            tarefa_id: t.id,
            tipo: o.tipo || 'outra',
            descricao: o.descricao.trim(),
            responsavel: o.responsavel || null,
            motivo: o.motivo || null,
            danos_materiais: o.danos_materiais || null,
          })),
      ),
    };
  }

  protected salvar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      this.erro.set('Confira os campos destacados antes de salvar.');

      return;
    }

    this.salvando.set(true);
    this.erro.set(null);

    const bruto = this.formulario.getRawValue();
    const desmembrado = this.desmembrarTarefas(bruto.tarefas as LinhaTarefaBruta[]);

    // Pendências/ocorrências GERAIS do dia (26/09/2026) — sem tarefa_id, entram
    // na mesma lista que o backend já espera, junto das que vieram de alguma tarefa.
    const pendenciasGeraisPayload = (bruto.pendencias_gerais as PendenciaBruta[])
      .filter((p) => p.descricao?.trim())
      .map((p) => ({ descricao: p.descricao.trim(), responsavel: p.responsavel || null, prazo: p.prazo || null, status: p.status || 'aberta' }));
    const ocorrenciasGeraisPayload = (bruto.ocorrencias_gerais as OcorrenciaBruta[])
      .filter((o) => o.descricao?.trim())
      .map((o) => ({
        tipo: o.tipo || 'outra',
        descricao: o.descricao.trim(),
        responsavel: o.responsavel || null,
        motivo: o.motivo || null,
        danos_materiais: o.danos_materiais || null,
      }));

    const payload: Record<string, unknown> = {
      ...bruto,
      ...desmembrado,
      pendencias: [...desmembrado.pendencias, ...pendenciasGeraisPayload],
      ocorrencias: [...desmembrado.ocorrencias, ...ocorrenciasGeraisPayload],
    };

    const fotos = this.fotosSelecionadas();
    const videos = this.videosSelecionados();
    const ehNovo = this.ehNovo();

    // App (09/10/2026): RDO novo — ou um que ainda está na fila do celular —
    // é guardado primeiro no aparelho e a fila envia (com ou sem internet).
    if (this.ehApp && (ehNovo || this.rascunhoLocal())) {
      void this.guardarNoCelular(ehNovo ? this.idNovo : this.rdoId(), payload, fotos, videos);
      return;
    }

    const requisicao = ehNovo
      ? this.rdoApi.criar({ ...payload, id: this.idNovo, obra_id: this.obraId() }, fotos, videos)
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

  /**
   * App: grava o RDO na fila do celular e já tenta enviar. Sem internet, ele
   * fica guardado e a fila manda sozinha quando o sinal voltar.
   */
  private async guardarNoCelular(
    id: string,
    payload: Record<string, unknown>,
    fotos: FotoSelecionada[],
    videos: VideoSelecionado[],
  ): Promise<void> {
    try {
      await this.fila.guardar({
        id,
        obraId: this.obraId(),
        obraNome: this.preparo()?.obra?.obra_nome ?? null,
        payload,
        fotos,
        videos,
      });
    } catch (e) {
      this.salvando.set(false);
      this.erro.set(e instanceof Error && e.message ? e.message : 'Não foi possível guardar o relatório no celular.');
      return;
    }

    this.salvando.set(false);
    this.aviso.set(
      navigator.onLine
        ? 'Relatório salvo no celular — enviando ao servidor…'
        : 'Sem internet: o relatório ficou guardado no celular e vai ser enviado sozinho quando a internet voltar.',
    );
    void this.fila.enviarTudo();

    if (this.ehNovo()) {
      void this.router.navigate(['/obras', this.obraId(), 'rdo', id]);
      return;
    }

    // Recarrega as fotos/vídeos com a identidade da fila (evita subir duas vezes o que já foi).
    const item = await this.fila.obter(id);
    if (item) {
      this.rascunhoLocal.set(item);
      const selecionados = this.fila.paraFormulario(item);
      this.fotosSelecionadas.set(selecionados.fotos);
      this.videosSelecionados.set(selecionados.videos);
    }
  }

  /** App: apaga do celular um RDO que ainda não foi enviado. */
  protected async excluirRascunhoLocal(): Promise<void> {
    const local = this.rascunhoLocal();
    if (!local) return;
    const aviso = local.existeNoServidor
      ? 'Tirar este RDO do celular? A parte que já chegou ao servidor continua lá.'
      : 'Excluir este RDO do celular? Ele ainda não foi enviado ao servidor e vai ser perdido.';
    if (!confirm(aviso)) return;

    await this.fila.remover(local.id);
    this.rascunhoLocal.set(null);
    this.voltarParaLista();
  }

  /** App: "Tentar enviar de novo" de um RDO que o servidor recusou. */
  protected tentarEnviarDeNovo(): void {
    const local = this.rascunhoLocal();
    if (local) void this.fila.tentarDeNovo(local.id);
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
        this.aviso.set(null);
        void entregarArquivo(blob, `RDO-${String(registro.numero ?? 0).padStart(3, '0')}.pdf`).catch(() =>
          this.erro.set('Não foi possível salvar o PDF neste aparelho.'),
        );
      },
      error: () => {
        this.aviso.set(null);
        this.erro.set(
          this.ehApp && !navigator.onLine
            ? 'Sem internet — o PDF é gerado no servidor. Tente de novo quando a conexão voltar.'
            : 'Não foi possível gerar o PDF.',
        );
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

  protected alternarSecao(secao: string): void {
    this.secaoAberta.set(this.secaoAberta() === secao ? '' : secao);
  }

  /** `data_inicio` do cabeçalho vem como data/hora ISO (cast `date` da Obra) — só interessa o dia, em pt-BR. */
  protected formatarData(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [ano, mes, dia] = iso.substring(0, 10).split('-');
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : '—';
  }

  protected rotuloClima(valor: string | null): string {
    return CLIMAS.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloOcorrencia(valor: string): string {
    return TIPOS_OCORRENCIA.find((t) => t.valor === valor)?.rotulo ?? valor;
  }

  /**
   * 30/09/2026: passou a ler `errors` (por campo) antes do `message`
   * genérico — o `message` de topo de um 422 de validação do Laravel é
   * sempre a frase fixa em inglês "The given data was invalid.", mesmo
   * com `lang/pt_BR/validation.php` publicado (esse arquivo só traduz as
   * mensagens DENTRO de `errors`, por campo). Sem isso, um upload de foto
   * rejeitado (tamanho/formato) aparecia como "The given data was
   * invalid." em vez de dizer qual foto e por quê.
   */
  private mensagemDeErro(e: unknown): string {
    if (e instanceof TimeoutError || (e instanceof HttpErrorResponse && e.status === 0)) {
      return this.ehApp
        ? 'Sem conexão com o servidor. RDO já enviado só pode ser alterado com internet.'
        : 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    }

    const erro = e as { error?: { message?: string; mensagem?: string; errors?: Record<string, string[]> } };

    const primeiraMensagemDeCampo = erro?.error?.errors ? Object.values(erro.error.errors)[0]?.[0] : undefined;

    return primeiraMensagemDeCampo ?? erro?.error?.mensagem ?? erro?.error?.message ?? 'Não foi possível concluir a operação.';
  }
}
