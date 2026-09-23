import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Obra, ObraPayload, rotuloStatusObra } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { ArmazenamentoService } from '../../../core/services/armazenamento.service';
import { PermissoesService } from '../../../core/services/permissoes.service';
import { Cliente, Responsavel } from '../../cadastros/cadastros.models';
import { CadastroObraModal, EventoSalvarObra } from '../cadastro-obra-modal/cadastro-obra-modal';

const CHAVE_CLIENTES = 'controleObra.clientes.v1';
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

/**
 * Abas da obra, na ordem do protótipo (obracontrol.html). `moduloChave`
 * ausente (só a EAP) = sempre visível — exceção de "Controle de
 * permissões" (31/08/2026): a EAP nunca some, mesmo sem `pode_usar`.
 */
const ABAS = [
  { caminho: 'eap', rotulo: 'EAP' },
  { caminho: 'cronograma', rotulo: 'Cronograma', moduloChave: 'cronograma' },
  { caminho: 'desembolso', rotulo: 'Cronograma de desembolso', moduloChave: 'desembolso' },
  { caminho: 'medicoes', rotulo: 'Medições de Obra', moduloChave: 'medicoes' },
  { caminho: 'empreitas', rotulo: 'Empreitas', moduloChave: 'empreitas' },
  { caminho: 'mapas', rotulo: 'Mapas', moduloChave: 'mapas' },
  { caminho: 'pagamentos', rotulo: 'Pagamentos', moduloChave: 'pagamentos' },
  { caminho: 'recebimentos', rotulo: 'Recebimentos', moduloChave: 'recebimentos' },
  { caminho: 'diarias', rotulo: 'Diárias', moduloChave: 'diarias' },
  { caminho: 'rdo', rotulo: 'RDO', moduloChave: 'diario_obra' },
  { caminho: 'relatorios', rotulo: 'Relatórios', moduloChave: 'relatorios' },
  { caminho: 'arquivos', rotulo: 'Arquivos Anexados', moduloChave: 'arquivos' },
] as const;

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CadastroObraModal],
  templateUrl: './obra-detalhe.html',
  styleUrl: './obra-detalhe.scss',
})
export class ObraDetalhe implements OnInit {
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  protected readonly permissoes = inject(PermissoesService);

  /** Vem da rota via withComponentInputBinding(). */
  readonly id = input.required<string>();

  /** "Controle de permissões" (31/08/2026) — some da navegação quem não tem `pode_usar`. */
  protected readonly abas = computed(() =>
    ABAS.filter((aba) => !('moduloChave' in aba) || this.permissoes.podeModulo(aba.moduloChave, 'usar')),
  );
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
  protected alternarConfirmacao(): void {
    const obraAtual = this.obra();
    if (!obraAtual) return;

    const vaiConfirmar = !obraAtual.is_confirmed;
    if (vaiConfirmar && !window.confirm('Confirmar os dados desta obra? Eles ficam travados pra edição até reabrir.')) {
      return;
    }

    const payload: Partial<ObraPayload> = {
      ...obraAtual,
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
