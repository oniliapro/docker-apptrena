import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  EquipamentoCatalogoItem,
  Obra,
  ObraContratanteLink,
  RegistroDiario,
  TIPOS_OCORRENCIA_DIARIO,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { formatarData, hojeIso } from '../../core/utils/formato';

const CHAVE_OBRA_ATIVA = 'trenaapp.obraAtiva.v1';

/**
 * Diário de Obra — portado de js/diario-obra/01-app.js, e estendido em
 * 08/09/2026 (especificação consolidada com a Onilia e o Lucas) para
 * cobrir o checklist completo: responsáveis presentes, mão de obra,
 * equipamentos, ocorrências, pendências, comentário interno ocultável
 * do contratante, finalizar-e-assinar, e o link de acesso somente-
 * leitura do contratante da obra (cliente final).
 *
 * Mantém o fluxo original: escolher a obra ativa (lembrada entre
 * visitas), registrar o dia com fotos opcionais, e listar/excluir os
 * registros daquela obra. O modal de "nova obra" também veio junto,
 * porque sem ele um usuário novo fica travado — não há obra para
 * selecionar.
 */
@Component({
  selector: 'app-diario-obra',
  imports: [ReactiveFormsModule],
  templateUrl: './diario-obra.html',
  styleUrl: './diario-obra.scss',
})
export class DiarioObra implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly obras = signal<Obra[]>([]);
  protected readonly obraAtiva = signal<string>('');
  protected readonly registros = signal<RegistroDiario[]>([]);
  protected readonly equipamentosCatalogo = signal<EquipamentoCatalogoItem[]>([]);
  protected readonly contratanteLinks = signal<ObraContratanteLink[]>([]);

  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly status = signal<string>('');
  protected readonly erro = signal<string | null>(null);

  protected readonly modalAberto = signal(false);
  protected readonly criandoObra = signal(false);

  protected readonly painelLinkAberto = signal(false);
  protected readonly gerandoLink = signal(false);

  protected readonly finalizandoId = signal<string | null>(null);

  /** Arquivos escolhidos no <input type="file"> — fora do form reativo. */
  private fotos: File[] = [];

  protected readonly formatarData = formatarData;
  protected readonly tiposOcorrencia = TIPOS_OCORRENCIA_DIARIO;

  protected readonly formulario = this.fb.nonNullable.group({
    data: [hojeIso(), [Validators.required]],
    clima: [''],
    autor: [''],
    titulo: [''],
    descricao: [''],
    impacto_cronograma: [''],
    quantidade_operarios: this.fb.control<number | null>(null),
    finalizar: [false],
    responsaveisPresentes: this.fb.array<FormGroup>([]),
    equipamentos: this.fb.array<FormGroup>([]),
    ocorrencias: this.fb.array<FormGroup>([]),
    pendencias: this.fb.array<FormGroup>([]),
    comentariosInternos: this.fb.array<FormGroup>([]),
  });

  protected readonly formNovaObra = this.fb.nonNullable.group({
    nome: ['', [Validators.required]],
    cliente: [''],
  });

  protected readonly formNovoLink = this.fb.nonNullable.group({
    nome_contato: [''],
    telefone_whatsapp: [''],
  });

  ngOnInit(): void {
    this.carregarObras();
    this.api.listarEquipamentosCatalogo().subscribe({
      next: (lista) => this.equipamentosCatalogo.set(lista),
      error: () => {
        // Catálogo vazio não impede o resto da tela — só o seletor de
        // equipamentos fica sem opções até alguém cadastrar um.
      },
    });
  }

  // ------------------------------------------------------------------
  // Obras
  // ------------------------------------------------------------------
  private carregarObras(): void {
    this.api.listarObras().subscribe({
      next: (obras) => {
        this.obras.set(obras);

        const salva = this.lerObraSalva();
        const escolhida = salva && obras.some((o) => o.id === salva) ? salva : (obras[0]?.id ?? '');

        this.obraAtiva.set(escolhida);
        if (escolhida) {
          this.carregarRegistros();
          this.prePreencherMaoDeObra();
          this.carregarLinksContratante();
        }
      },
      error: () => this.erro.set('Não foi possível carregar as obras.'),
    });
  }

  protected trocarObra(evento: Event): void {
    const id = (evento.target as HTMLSelectElement).value;
    this.obraAtiva.set(id);
    this.salvarObraAtiva(id);
    this.carregarRegistros();
    this.prePreencherMaoDeObra();
    this.carregarLinksContratante();
  }

  protected abrirModalNovaObra(): void {
    this.formNovaObra.reset({ nome: '', cliente: '' });
    this.modalAberto.set(true);
  }

  protected fecharModalNovaObra(): void {
    this.modalAberto.set(false);
  }

  protected criarObra(): void {
    if (this.formNovaObra.invalid || this.criandoObra()) return;

    this.criandoObra.set(true);
    const { nome, cliente } = this.formNovaObra.getRawValue();

    this.api.criarObra({ obra_nome: nome.trim(), cliente: cliente.trim() }).subscribe({
      next: (nova) => {
        this.criandoObra.set(false);
        this.fecharModalNovaObra();
        this.obras.update((lista) => [...lista, nova]);
        this.obraAtiva.set(nova.id);
        this.salvarObraAtiva(nova.id);
        this.carregarRegistros();
        this.carregarLinksContratante();
      },
      error: () => {
        this.criandoObra.set(false);
        window.alert('Não foi possível criar a obra.');
      },
    });
  }

  // ------------------------------------------------------------------
  // Registros
  // ------------------------------------------------------------------
  private carregarRegistros(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      this.registros.set([]);
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);

    this.api.listarDiario({ obraId }).subscribe({
      next: (registros) => {
        this.registros.set(registros);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Erro ao carregar os registros.');
        this.carregando.set(false);
      },
    });
  }

  /** Pré-preenche "Mão de obra" com o valor do lançamento anterior (item D da especificação) — só sugestão, dá pra ajustar. */
  private prePreencherMaoDeObra(): void {
    const obraId = this.obraAtiva();
    if (!obraId) return;

    this.api.obterUltimaMaoDeObra(obraId).subscribe({
      next: ({ quantidade_operarios }) => {
        if (quantidade_operarios !== null && quantidade_operarios !== undefined) {
          this.formulario.controls.quantidade_operarios.setValue(quantidade_operarios);
        }
      },
      error: () => {
        // Sem sugestão — o campo fica em branco, o usuário digita na mão.
      },
    });
  }

  protected selecionarFotos(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.fotos = Array.from(input.files ?? []);
  }

  // ---- Responsáveis presentes ----
  protected get responsaveisPresentes(): FormArray<FormGroup> {
    return this.formulario.controls.responsaveisPresentes;
  }

  protected adicionarResponsavel(): void {
    this.responsaveisPresentes.push(
      this.fb.nonNullable.group({
        nome: ['', [Validators.required]],
        empresa: [''],
        funcao: [''],
        contrato_referencia: [''],
        presente: [true],
      }),
    );
  }

  protected removerResponsavel(indice: number): void {
    this.responsaveisPresentes.removeAt(indice);
  }

  // ---- Equipamentos ----
  protected get equipamentos(): FormArray<FormGroup> {
    return this.formulario.controls.equipamentos;
  }

  protected adicionarEquipamento(): void {
    this.equipamentos.push(
      this.fb.nonNullable.group({
        equipamento_id: ['', [Validators.required]],
        quantidade: [1],
      }),
    );
  }

  protected removerEquipamento(indice: number): void {
    this.equipamentos.removeAt(indice);
  }

  protected cadastrarEquipamentoRapido(): void {
    const nome = window.prompt('Nome do equipamento a cadastrar no catálogo:');
    if (!nome?.trim()) return;

    this.api.criarEquipamentoCatalogo({ nome: nome.trim() }).subscribe({
      next: (novo) => this.equipamentosCatalogo.update((lista) => [...lista, novo]),
      error: () => window.alert('Não foi possível cadastrar o equipamento.'),
    });
  }

  // ---- Ocorrências ----
  protected get ocorrencias(): FormArray<FormGroup> {
    return this.formulario.controls.ocorrencias;
  }

  protected adicionarOcorrencia(): void {
    this.ocorrencias.push(
      this.fb.nonNullable.group({
        tipo: ['nao_conformidade', [Validators.required]],
        descricao: ['', [Validators.required]],
        responsavel: [''],
        motivo: [''],
        danos_materiais: [''],
      }),
    );
  }

  protected removerOcorrencia(indice: number): void {
    this.ocorrencias.removeAt(indice);
  }

  // ---- Pendências ----
  protected get pendencias(): FormArray<FormGroup> {
    return this.formulario.controls.pendencias;
  }

  protected adicionarPendencia(): void {
    this.pendencias.push(
      this.fb.nonNullable.group({
        descricao: ['', [Validators.required]],
        responsavel: [''],
        prazo: [''],
        status: ['aberta'],
      }),
    );
  }

  protected removerPendencia(indice: number): void {
    this.pendencias.removeAt(indice);
  }

  // ---- Comentário interno (ocultável do contratante) ----
  protected get comentariosInternos(): FormArray<FormGroup> {
    return this.formulario.controls.comentariosInternos;
  }

  protected adicionarComentarioInterno(): void {
    this.comentariosInternos.push(
      this.fb.nonNullable.group({
        texto: ['', [Validators.required]],
        visivel_contratante: [false],
      }),
    );
  }

  protected removerComentarioInterno(indice: number): void {
    this.comentariosInternos.removeAt(indice);
  }

  protected salvar(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      window.alert('Escolha ou crie uma obra primeiro.');
      return;
    }
    if (this.formulario.invalid || this.salvando()) return;

    this.salvando.set(true);
    this.status.set('Salvando…');

    const valores = this.formulario.getRawValue();
    const dados = new FormData();
    dados.append('obra_id', obraId);
    dados.append('data', valores.data);
    dados.append('clima', valores.clima);
    dados.append('autor', valores.autor);
    dados.append('titulo', valores.titulo);
    dados.append('descricao', valores.descricao);
    if (valores.impacto_cronograma) dados.append('impacto_cronograma', valores.impacto_cronograma);
    if (valores.quantidade_operarios !== null && valores.quantidade_operarios !== undefined) {
      dados.append('quantidade_operarios', String(valores.quantidade_operarios));
    }
    if (valores.finalizar) dados.append('finalizar', '1');
    this.fotos.forEach((foto) => dados.append('fotos[]', foto));

    this.anexarLista(dados, 'responsaveis_presentes', valores.responsaveisPresentes, (item) =>
      !!String(item['nome'] ?? '').trim(),
    );
    this.anexarLista(dados, 'equipamentos', valores.equipamentos, (item) => !!item['equipamento_id']);
    this.anexarLista(dados, 'ocorrencias', valores.ocorrencias, (item) =>
      !!String(item['descricao'] ?? '').trim(),
    );
    this.anexarLista(dados, 'pendencias', valores.pendencias, (item) =>
      !!String(item['descricao'] ?? '').trim(),
    );
    this.anexarLista(dados, 'comentarios_internos', valores.comentariosInternos, (item) =>
      !!String(item['texto'] ?? '').trim(),
    );

    const eraFinalizar = valores.finalizar;

    this.api.criarRegistroDiario(dados).subscribe({
      next: () => {
        this.salvando.set(false);
        this.status.set(eraFinalizar ? 'Registro salvo e assinado.' : 'Registro salvo como rascunho.');
        this.resetarFormulario();
        this.fotos = [];
        this.carregarRegistros();
      },
      error: () => {
        this.salvando.set(false);
        this.status.set('');
        window.alert('Não foi possível salvar o registro.');
      },
    });
  }

  private resetarFormulario(): void {
    this.formulario.reset({
      data: hojeIso(),
      clima: '',
      autor: '',
      titulo: '',
      descricao: '',
      impacto_cronograma: '',
      quantidade_operarios: null,
      finalizar: false,
    });
    this.responsaveisPresentes.clear();
    this.equipamentos.clear();
    this.ocorrencias.clear();
    this.pendencias.clear();
    this.comentariosInternos.clear();
    this.prePreencherMaoDeObra();
  }

  /** Serializa um FormArray de grupos no formato `chave[i][campo]` que o Laravel espera, pulando linhas em branco. */
  private anexarLista(
    dados: FormData,
    chave: string,
    itens: ReadonlyArray<Record<string, unknown>>,
    valida: (item: Record<string, unknown>) => boolean,
  ): void {
    let indice = 0;
    for (const item of itens) {
      if (!valida(item)) continue;
      for (const [campo, valor] of Object.entries(item)) {
        if (valor === null || valor === undefined || valor === '') continue;
        const valorTexto = typeof valor === 'boolean' ? (valor ? '1' : '0') : String(valor);
        dados.append(`${chave}[${indice}][${campo}]`, valorTexto);
      }
      indice += 1;
    }
  }

  protected remover(registro: RegistroDiario): void {
    if (!window.confirm('Excluir este registro do diário?')) return;

    this.api.excluirRegistroDiario(registro.id).subscribe({
      next: () => this.carregarRegistros(),
      error: () => window.alert('Não foi possível excluir.'),
    });
  }

  /**
   * Finaliza (= assina) um rascunho existente. Não existe ação de
   * "assinar" separada — finalizar é assinar (decisão de 08/09/2026).
   */
  protected finalizar(registro: RegistroDiario): void {
    if (!window.confirm('Finalizar este registro? Depois de finalizado ele é assinado automaticamente e o contratante passa a poder vê-lo.')) {
      return;
    }

    this.finalizandoId.set(registro.id);
    this.api.finalizarRegistroDiario(registro.id).subscribe({
      next: () => {
        this.finalizandoId.set(null);
        this.carregarRegistros();
      },
      error: () => {
        this.finalizandoId.set(null);
        window.alert('Não foi possível finalizar este registro.');
      },
    });
  }

  protected abrirFoto(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  protected nomeEquipamento(id: string): string {
    return this.equipamentosCatalogo().find((e) => e.id === id)?.nome ?? '';
  }

  protected rotuloOcorrencia(tipo: string): string {
    return this.tiposOcorrencia.find((t) => t.chave === tipo)?.rotulo ?? tipo;
  }

  // ------------------------------------------------------------------
  // Link do contratante da obra (cliente final) — só leitura, sem login
  // ------------------------------------------------------------------
  private carregarLinksContratante(): void {
    const obraId = this.obraAtiva();
    if (!obraId) {
      this.contratanteLinks.set([]);
      return;
    }
    this.api.listarContratanteLinks(obraId).subscribe({
      next: (links) => this.contratanteLinks.set(links),
      error: () => this.contratanteLinks.set([]),
    });
  }

  protected togglePainelLink(): void {
    this.painelLinkAberto.update((aberto) => !aberto);
  }

  protected gerarLinkContratante(): void {
    const obraId = this.obraAtiva();
    if (!obraId || this.gerandoLink()) return;

    this.gerandoLink.set(true);
    const { nome_contato, telefone_whatsapp } = this.formNovoLink.getRawValue();

    this.api
      .criarContratanteLink(obraId, {
        nome_contato: nome_contato.trim() || undefined,
        telefone_whatsapp: telefone_whatsapp.trim() || undefined,
      })
      .subscribe({
        next: (novo) => {
          this.gerandoLink.set(false);
          this.contratanteLinks.update((lista) => [novo, ...lista]);
          this.formNovoLink.reset({ nome_contato: '', telefone_whatsapp: '' });
        },
        error: () => {
          this.gerandoLink.set(false);
          window.alert('Não foi possível gerar o link.');
        },
      });
  }

  protected revogarLink(link: ObraContratanteLink): void {
    if (!window.confirm('Revogar este link? Quem o tiver deixa de conseguir acessar o diário por ele.')) return;

    this.api.revogarContratanteLink(link.id).subscribe({
      next: () => this.carregarLinksContratante(),
      error: () => window.alert('Não foi possível revogar o link.'),
    });
  }

  protected urlPublicaLink(link: ObraContratanteLink): string {
    return `${window.location.origin}/publico/diario/${link.token}`;
  }

  protected copiarLink(link: ObraContratanteLink): void {
    const url = this.urlPublicaLink(link);
    navigator.clipboard
      ?.writeText(url)
      .then(() => this.status.set('Link copiado.'))
      .catch(() => window.prompt('Copie o link:', url));
  }

  protected linkEstaAtivo(link: ObraContratanteLink): boolean {
    if (link.revogado_em) return false;
    if (link.expira_em && new Date(link.expira_em).getTime() < Date.now()) return false;
    return true;
  }

  // ------------------------------------------------------------------
  // Preferência de obra ativa
  // ------------------------------------------------------------------
  private lerObraSalva(): string {
    try {
      return localStorage.getItem(CHAVE_OBRA_ATIVA) ?? '';
    } catch {
      return '';
    }
  }

  private salvarObraAtiva(id: string): void {
    try {
      localStorage.setItem(CHAVE_OBRA_ATIVA, id);
    } catch {
      // sem persistência: a escolha vale só para esta sessão.
    }
  }
}
