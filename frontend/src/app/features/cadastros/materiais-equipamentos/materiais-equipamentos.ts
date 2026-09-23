import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { of } from 'rxjs';

import { ApiService } from '../../../core/services/api.service';
import { formatarMoeda } from '../../../core/utils/formato';
import { BarraSelecao, AcaoLista } from '../../../shared/barra-selecao/barra-selecao';
import { valoresDistintos } from '../../../shared/filtros/filtros';
import {
  EstadoOrdenacao,
  alternarOrdenacao,
  ordenarPor,
  setaOrdenacao,
} from '../../../shared/ordenacao/ordenacao';
import { RedimensionarColunas } from '../../../shared/redimensionar-colunas/redimensionar-colunas';
import {
  SelecaoMultipla,
  avisarFalhasDeExclusao,
  confirmarExclusaoEmLote,
  excluirEmLote,
} from '../../../shared/selecao-lista/selecao-lista';
import { parsearBR } from '../../pagamentos/pagamentos-calc';
import {
  MaterialEquipamento,
  ROTULO_TIPO_MATERIAL_EQUIPAMENTO,
  TipoMaterialEquipamento,
} from './materiais-equipamentos.models';

type ColunaOrdenavel = 'tipo' | 'nome' | 'unidade' | 'valor_unitario';

/**
 * Cadastro "Materiais e equipamentos" (F6, 22/09/2026) — um só cadastro, com o
 * campo Tipo separando material de equipamento: nome, foto, valor unitário,
 * unidade e lista de marcas. Os equipamentos que já existiam nos catálogos do
 * Diário antigo e do RDO entram aqui pelo comando `cadastros:migrar-equipamentos`.
 *
 * Diferente dos outros cadastros (ponte chave-valor), este vem da API porque
 * guarda arquivo (a foto) e é consultado pelo RDO e pelos lançamentos.
 */
@Component({
  selector: 'app-materiais-equipamentos',
  imports: [RedimensionarColunas, BarraSelecao],
  templateUrl: './materiais-equipamentos.html',
  styleUrl: './materiais-equipamentos.scss',
})
export class MateriaisEquipamentos implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly registros = signal<MaterialEquipamento[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly rotuloTipo = ROTULO_TIPO_MATERIAL_EQUIPAMENTO;
  protected readonly formatarMoeda = formatarMoeda;
  protected readonly setaOrdenacao = setaOrdenacao;

  // ---- Filtros e ordenação ----
  protected readonly busca = signal('');
  protected readonly filtroTipo = signal<TipoMaterialEquipamento | ''>('');
  protected readonly filtroSituacao = signal<'todos' | 'ativos' | 'inativos'>('todos');
  protected readonly filtroMarca = signal('');
  protected readonly ordenacao = signal<EstadoOrdenacao<ColunaOrdenavel> | null>(null);

  protected alternarOrdenacaoColuna(coluna: ColunaOrdenavel): void {
    this.ordenacao.update((atual) => alternarOrdenacao(atual, coluna));
  }

  protected readonly marcasDisponiveis = computed(() =>
    valoresDistintos(this.registros().flatMap((r) => (r.marcas ?? []).map((marca) => ({ marca }))), (r) => r.marca),
  );

  protected readonly lista = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const tipo = this.filtroTipo();
    const situacao = this.filtroSituacao();
    const marca = this.filtroMarca();

    const filtrada = this.registros().filter((r) => {
      if (tipo && r.tipo !== tipo) return false;
      if (situacao === 'ativos' && !r.ativo) return false;
      if (situacao === 'inativos' && r.ativo) return false;
      if (marca && !(r.marcas ?? []).includes(marca)) return false;
      if (!termo) return true;
      return [r.nome, r.unidade ?? '', ...(r.marcas ?? [])].some((campo) => campo.toLowerCase().includes(termo));
    });
    return ordenarPor(filtrada, this.ordenacao(), (r, coluna) => r[coluna]);
  });

  // ---- Seleção múltipla (mesmo modelo dos demais cadastros) ----
  protected readonly selecao = new SelecaoMultipla<MaterialEquipamento>((r) => r.id);
  protected readonly selecionados = computed(() => this.selecao.selecionados(this.lista()));
  protected readonly acoesLista: AcaoLista[] = [{ chave: 'excluir', rotulo: 'Excluir', perigo: true }];

  protected editarSelecionado(): void {
    const [primeiro] = this.selecionados();
    if (primeiro) this.editar(primeiro);
  }

  protected removerUm(registro: MaterialEquipamento): void {
    if (!window.confirm(`Excluir ${registro.nome} definitivamente?\n\nPrefira desativar se ele já foi usado em algum lançamento.`)) return;
    this.executarExclusao([registro]);
  }

  protected aoAcaoLista(chave: string): void {
    if (chave !== 'excluir') return;
    const alvos = this.selecionados();
    if (!alvos.length) return;
    if (!confirmarExclusaoEmLote(alvos.length, 'item', 'itens', '', alvos.map((r) => r.nome))) return;
    this.executarExclusao(alvos);
  }

  private executarExclusao(alvos: MaterialEquipamento[]): void {
    excluirEmLote(alvos, (r) => this.api.excluirMaterialEquipamento(r.id)).subscribe(({ excluidos, falhas }) => {
      const ids = new Set(excluidos.map((r) => r.id));
      this.registros.update((lista) => lista.filter((r) => !ids.has(r.id)));
      this.selecao.limpar();
      avisarFalhasDeExclusao(falhas, 'item(ns)', (r) => r.nome);
    });
  }

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.api.listarMateriaisEquipamentos().subscribe({
      next: (lista) => {
        this.registros.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar o cadastro.');
        this.carregando.set(false);
      },
    });
  }

  protected alternarAtivo(registro: MaterialEquipamento): void {
    const ativo = !registro.ativo;
    this.api.atualizarMaterialEquipamento(registro.id, this.paraDados(registro, { ativo })).subscribe({
      next: (atualizado) => this.substituir(atualizado),
      error: () => window.alert('Não foi possível alterar a situação.'),
    });
  }

  private paraDados(r: MaterialEquipamento, mudanca: Partial<{ ativo: boolean }> = {}) {
    return {
      tipo: r.tipo,
      nome: r.nome,
      unidade: r.unidade ?? '',
      valor_unitario: r.valor_unitario,
      marcas: r.marcas ?? [],
      ativo: mudanca.ativo ?? r.ativo,
    };
  }

  private substituir(atualizado: MaterialEquipamento): void {
    this.registros.update((lista) => lista.map((r) => (r.id === atualizado.id ? atualizado : r)));
  }

  // ------------------------------------------------------------------
  // Formulário (popup)
  // ------------------------------------------------------------------
  protected readonly formularioAberto = signal(false);
  protected readonly editandoId = signal<string | null>(null);
  protected readonly erroFormulario = signal<string | null>(null);

  protected readonly fTipo = signal<TipoMaterialEquipamento>('material');
  protected readonly fNome = signal('');
  protected readonly fUnidade = signal('');
  protected readonly fValor = signal('');
  protected readonly fMarcas = signal<string[]>([]);
  protected readonly fNovaMarca = signal('');
  protected readonly fAtivo = signal(true);
  /** Foto já gravada (URL) e a nova escolhida ainda não enviada. */
  protected readonly fFotoAtual = signal<string | null>(null);
  protected readonly fFotoNova = signal<File | null>(null);
  protected readonly fFotoNovaUrl = signal<string | null>(null);
  protected readonly fRemoverFoto = signal(false);
  protected readonly nomeVazio = signal(false);

  protected readonly fotoMostrada = computed(() =>
    this.fFotoNovaUrl() ?? (this.fRemoverFoto() ? null : this.fFotoAtual()),
  );

  /**
   * `foto_url` vem relativo (`/storage/...`) — mesmo motivo de `logoUrl`
   * em `Empresa::getLogoUrlAttribute()` (achado em 23/09/2026: nenhuma
   * foto aparecia nos PDFs porque a URL absoluta só existe do ponto de
   * vista do navegador do usuário).
   */
  protected urlFoto(caminho: string): string {
    return this.api.baseStorage() + caminho;
  }

  protected novo(): void {
    this.abrir(null);
  }

  protected editar(registro: MaterialEquipamento): void {
    this.abrir(registro);
  }

  private abrir(registro: MaterialEquipamento | null): void {
    this.limparFotoNova();
    this.editandoId.set(registro?.id ?? null);
    this.erroFormulario.set(null);
    this.nomeVazio.set(false);
    this.fTipo.set(registro?.tipo ?? (this.filtroTipo() || 'material'));
    this.fNome.set(registro?.nome ?? '');
    this.fUnidade.set(registro?.unidade ?? '');
    this.fValor.set(registro?.valor_unitario ? formatarMoeda(registro.valor_unitario) : '');
    this.fMarcas.set([...(registro?.marcas ?? [])]);
    this.fNovaMarca.set('');
    this.fAtivo.set(registro?.ativo ?? true);
    this.fFotoAtual.set(registro?.foto_url ? this.urlFoto(registro.foto_url) : null);
    this.fRemoverFoto.set(false);
    this.formularioAberto.set(true);
  }

  protected fechar(): void {
    this.limparFotoNova();
    this.formularioAberto.set(false);
    this.editandoId.set(null);
  }

  protected texto(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  /** Valor unitário: aceita `=conta` (o campo já resolveu a conta antes deste `change`) e mostra como moeda. */
  protected aoMudarValor(evento: Event): void {
    const alvo = evento.target as HTMLInputElement;
    const numero = parsearBR(alvo.value);
    const texto = numero ? formatarMoeda(numero) : '';
    alvo.value = texto;
    this.fValor.set(texto);
  }

  // ---- Marcas ----
  protected teclaMarca(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' || evento.key === ',') {
      evento.preventDefault();
      this.confirmarMarca(evento.target as HTMLInputElement);
    }
  }

  /** Confirma a marca digitada e esvazia o campo (o binding de valor sozinho não devolvia o campo ao vazio). */
  protected confirmarMarca(campo: HTMLInputElement): void {
    this.adicionarMarca();
    campo.value = '';
  }

  protected adicionarMarca(): void {
    const marca = this.fNovaMarca().trim();
    if (!marca) return;
    if (!this.fMarcas().some((m) => m.toLowerCase() === marca.toLowerCase())) {
      this.fMarcas.update((lista) => [...lista, marca]);
    }
    this.fNovaMarca.set('');
  }

  protected removerMarca(marca: string): void {
    this.fMarcas.update((lista) => lista.filter((m) => m !== marca));
  }

  // ---- Foto ----
  protected escolherFoto(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const arquivo = entrada.files?.[0] ?? null;
    entrada.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      this.erroFormulario.set('Escolha um arquivo de imagem.');
      return;
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      this.erroFormulario.set('A foto pode ter no máximo 8 MB.');
      return;
    }
    this.erroFormulario.set(null);
    this.limparFotoNova();
    this.fFotoNova.set(arquivo);
    this.fFotoNovaUrl.set(URL.createObjectURL(arquivo));
    this.fRemoverFoto.set(false);
  }

  protected removerFotoDoFormulario(): void {
    this.limparFotoNova();
    if (this.fFotoAtual()) this.fRemoverFoto.set(true);
  }

  private limparFotoNova(): void {
    const url = this.fFotoNovaUrl();
    if (url) URL.revokeObjectURL(url);
    this.fFotoNova.set(null);
    this.fFotoNovaUrl.set(null);
  }

  // ---- Salvar ----
  protected salvar(): void {
    const nome = this.fNome().trim();
    if (!nome) {
      this.nomeVazio.set(true);
      return;
    }
    // Marca digitada e ainda não confirmada com Enter também entra.
    this.adicionarMarca();

    const dados = {
      tipo: this.fTipo(),
      nome,
      unidade: this.fUnidade().trim(),
      valor_unitario: parsearBR(this.fValor()),
      marcas: this.fMarcas(),
      ativo: this.fAtivo(),
    };
    const id = this.editandoId();
    const foto = this.fFotoNova();
    const removerFoto = this.fRemoverFoto() && !foto;

    this.salvando.set(true);
    this.erroFormulario.set(null);

    const gravar$ = id ? this.api.atualizarMaterialEquipamento(id, dados) : this.api.criarMaterialEquipamento(dados);
    gravar$.subscribe({
      next: (gravado) => {
        const foto$ = foto
          ? this.api.enviarFotoMaterialEquipamento(gravado.id, foto)
          : removerFoto && gravado.foto_url
            ? this.api.removerFotoMaterialEquipamento(gravado.id)
            : of(gravado);

        foto$.subscribe({
          next: (final) => this.aoGravar(final, !id),
          // O cadastro foi gravado; só a foto falhou.
          error: () => {
            this.aoGravar(gravado, !id);
            window.alert('O cadastro foi salvo, mas não foi possível enviar a foto.');
          },
        });
      },
      error: (erro: HttpErrorResponse) => {
        this.salvando.set(false);
        this.erroFormulario.set(erro.error?.errors?.nome?.[0] ?? erro.error?.message ?? 'Não foi possível salvar.');
      },
    });
  }

  private aoGravar(registro: MaterialEquipamento, ehNovo: boolean): void {
    this.salvando.set(false);
    if (ehNovo) this.registros.update((lista) => [...lista, registro]);
    else this.substituir(registro);
    this.fechar();
  }
}

