import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { Obra, ObraPayload, rotuloStatusObra } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { ArmazenamentoService } from '../../../core/services/armazenamento.service';
import { PermissoesService } from '../../../core/services/permissoes.service';
import { nomeArquivoPdf } from '../../../shared/pdf-nome-arquivo';
import { Cliente, Responsavel } from '../../cadastros/cadastros.models';
import { ContratoModelo } from '../../configuracoes/contrato-modelos/contrato-modelo.models';
import { CadastroObraModal, EventoSalvarObra } from '../cadastro-obra-modal/cadastro-obra-modal';
import { ABAS_OBRA } from './obra-abas';

const CHAVE_CLIENTES = 'controleObra.clientes.v1';
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

/**
 * Página de uma obra — estrutura vinda do protótipo do Lucas.
 *
 * Esta é a mudança de arquitetura mais relevante da migração: no app
 * vanilla, EAP, Mapa, Empreita e Pagamentos eram páginas soltas, sem
 * uma obra como contexto. Aqui a obra passa a ser a entidade central e
 * cada módulo vira uma aba dentro dela.
 *
 * As abas são rotas filhas, então cada uma tem URL própria
 * (/obras/:id/eap) — dá para favoritar e compartilhar.
 *
 * Cabeçalho simplificado (07/09/2026, pedido do Lucas): antes ficava
 * sempre visível/editável em campos soltos (Nº/Cliente/Responsável/Data
 * base/Local/Período/Status/Observações), com "Quem acessa esta obra" e
 * "Confirmar obra" ao lado. Virou só nome + status + um botão "Editar
 * obra", que abre o MESMO popup usado pra criar uma obra
 * (`CadastroObraModal`, `obra()` preenchido = modo edição) — inclusive
 * "Quem acessa esta obra" e "Confirmar/Reabrir obra" moraram pra dentro
 * dele, não ficam mais soltos aqui.
 */
@Component({
  selector: 'app-obra-detalhe',
  imports: [RouterOutlet, RouterLink, CadastroObraModal],
  templateUrl: './obra-detalhe.html',
  styleUrl: './obra-detalhe.scss',
})
export class ObraDetalhe implements OnInit {
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly router = inject(Router);
  protected readonly permissoes = inject(PermissoesService);

  /** Vem da rota via withComponentInputBinding(). */
  readonly id = input.required<string>();

  /** "Controle de permissões" (31/08/2026) — some da navegação quem não tem `pode_usar`. */
  protected readonly abas = computed(() =>
    ABAS_OBRA.filter((aba) => !aba.moduloChave || this.permissoes.podeModulo(aba.moduloChave, 'usar')),
  );

  /**
   * Dentro de uma aba (28/09/2026, item 16) — a tela de entrada da obra é
   * a grade de botões (`ObraInicio`, caminho vazio); qualquer outro
   * caminho filho é "dentro de uma aba", e ganha o botão "← Voltar" pra
   * grade. Comparado por segmento (não string inteira) pra não prender a
   * uma exatidão de barra final.
   */
  protected readonly dentroDeAba = toSignal(
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map(() => this.calcularDentroDeAba()),
    ),
    { initialValue: this.calcularDentroDeAba() },
  );

  private calcularDentroDeAba(): boolean {
    const segmentos = this.router.url.split('?')[0].split('/').filter(Boolean);
    // ['obras', ':id', ...resto] — "dentro de aba" quando sobra algo além do id.
    return segmentos.length > 2;
  }

  protected readonly obra = signal<Obra | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly rotuloStatusObra = rotuloStatusObra;

  protected readonly clientesAtivos = signal<Cliente[]>([]);
  protected readonly responsaveisAtivos = signal<Responsavel[]>([]);

  protected readonly confirmada = computed(() => Boolean(this.obra()?.is_confirmed));

  // ------------------------------------------------------------------
  // "Editar obra" (07/09/2026) — abre o mesmo popup de cadastro, com a
  // obra atual pré-carregada (ver `CadastroObraModal`).
  // ------------------------------------------------------------------
  protected readonly editarAberto = signal(false);

  protected abrirEditar(): void {
    this.editarAberto.set(true);
  }

  protected fecharEditar(): void {
    this.editarAberto.set(false);
  }

  // ------------------------------------------------------------------
  // "Gerar contrato" (28/09/2026, itens 8/9) — a partir de um modelo de
  // contrato de obra/proposta cadastrado em Configurações.
  // ------------------------------------------------------------------
  protected readonly mostrarContrato = signal(false);
  protected readonly modelosContrato = signal<ContratoModelo[]>([]);
  protected readonly modeloContratoId = signal('');
  protected readonly gerandoContrato = signal(false);
  protected readonly erroContrato = signal<string | null>(null);

  protected abrirContrato(): void {
    this.mostrarContrato.set(true);
    this.erroContrato.set(null);
    this.api.listarContratoModelos('obra').subscribe({
      next: (lista) => this.modelosContrato.set(lista),
      error: () => this.modelosContrato.set([]),
    });
  }

  protected fecharContrato(): void {
    if (this.gerandoContrato()) return;
    this.mostrarContrato.set(false);
  }

  protected mudarModeloContrato(evento: Event): void {
    this.modeloContratoId.set((evento.target as HTMLSelectElement).value);
  }

  protected gerarContrato(): void {
    const modeloId = this.modeloContratoId();
    if (!modeloId) {
      this.erroContrato.set('Escolha um modelo de contrato.');
      return;
    }

    this.erroContrato.set(null);
    this.gerandoContrato.set(true);
    this.api.baixarContratoObraPdf(this.id(), modeloId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivoPdf('Contrato', [this.obra()?.obra_nome], this.id());
        link.click();
        URL.revokeObjectURL(url);
        this.gerandoContrato.set(false);
        this.mostrarContrato.set(false);
      },
      error: () => {
        this.erroContrato.set('Não foi possível gerar o PDF. Tente novamente em alguns segundos.');
        this.gerandoContrato.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.carregarObra();
    this.carregarClientesEResponsaveis();
  }

  private carregarObra(): void {
    this.api.obterObra(this.id()).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados da obra.');
        this.carregando.set(false);
      },
    });
  }

  /**
   * Clientes/Responsáveis pro dropdown — mesma ponte chave-valor dos
   * cadastros (lida diretamente aqui, sem passar pelo `CadastroStore`,
   * porque ele só suporta uma instância por componente e aqui precisamos
   * de duas listas ao mesmo tempo). Só os ativos entram no select.
   */
  private carregarClientesEResponsaveis(): void {
    this.armazenamento.ler(CHAVE_CLIENTES).subscribe((bruto) => {
      this.clientesAtivos.set(
        this.interpretarLista<Cliente>(bruto).filter((c) => c.ativo !== false),
      );
    });

    this.armazenamento.ler(CHAVE_RESPONSAVEIS).subscribe((bruto) => {
      this.responsaveisAtivos.set(
        this.interpretarLista<Responsavel>(bruto).filter((r) => r.ativo !== false),
      );
    });
  }

  private interpretarLista<T>(bruto: string | null): T[] {
    if (!bruto) return [];
    try {
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? (dados as T[]) : [];
    } catch {
      return [];
    }
  }

  protected salvarEdicao(evento: EventoSalvarObra): void {
    this.salvando.set(true);
    this.api.atualizarObra(this.id(), evento.payload).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.salvando.set(false);
        this.fecharEditar();
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível salvar os dados da obra.');
      },
    });
  }

  /**
   * "Confirmar obra"/"Reabrir obra" — emitido pelo popup, mas NÃO fecha
   * ele (o usuário pode continuar revendo/editando; o popup recebe a
   * obra atualizada de volta via `[obra]` e se re-sincroniza sozinho).
   */
  protected alternarConfirmacao(editado: Partial<ObraPayload> | null = null): void {
    const obraAtual = this.obra();
    if (!obraAtual) return;

    const vaiConfirmar = !obraAtual.is_confirmed;
    if (vaiConfirmar && !window.confirm('Confirmar os dados desta obra? Eles ficam travados pra edição até reabrir.')) {
      return;
    }

    // Confirmar SALVA junto o que está digitado no popup (`editado`) — a obra grava com essas edições e só
    // então trava; sem isso o que não tinha sido salvo se perdia. Reabrir não traz edição (formulário travado).
    const payload: Partial<ObraPayload> = {
      ...obraAtual,
      ...(vaiConfirmar ? editado ?? {} : {}),
      is_confirmed: vaiConfirmar,
      confirmed_at: vaiConfirmar ? new Date().toISOString() : null,
    };

    this.salvando.set(true);
    this.api.atualizarObra(this.id(), payload).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.salvando.set(false);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível atualizar a confirmação da obra.');
      },
    });
  }
}
