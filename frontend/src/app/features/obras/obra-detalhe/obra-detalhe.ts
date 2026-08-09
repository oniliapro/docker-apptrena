import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Obra, ObraPayload } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { ArmazenamentoService } from '../../../core/services/armazenamento.service';
import { Cliente, Responsavel } from '../../cadastros/cadastros.models';

const CHAVE_CLIENTES = 'controleObra.clientes.v1';
const CHAVE_RESPONSAVEIS = 'controleObra.responsaveis.v1';

/** Abas da obra, na ordem do protótipo (obracontrol.html). */
const ABAS = [
  { caminho: 'eap', rotulo: 'EAP' },
  { caminho: 'cronograma', rotulo: 'Cronograma' },
  { caminho: 'desembolso', rotulo: 'Cronograma de desembolso' },
  { caminho: 'medicoes', rotulo: 'Medições de Obra' },
  { caminho: 'empreitas', rotulo: 'Empreitas' },
  { caminho: 'mapas', rotulo: 'Mapas' },
  { caminho: 'compras', rotulo: 'Compras' },
  { caminho: 'pagamentos', rotulo: 'Pagamentos' },
  { caminho: 'diarios', rotulo: 'Diários de Obra' },
  { caminho: 'relatorios', rotulo: 'Relatórios' },
  { caminho: 'arquivos', rotulo: 'Arquivos Anexados' },
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
 * O cabeçalho (dados básicos da obra) virou editável aqui (04/08/2026,
 * pedido do Lucas) — antes só mostrava os valores da obra, e quem
 * editava "nome/cliente/responsável" era um formulário duplicado dentro
 * da própria aba EAP (`EapStore.cabecalho()`, salvo junto com o payload
 * da EAP). Esse formulário duplicado da EAP continua existindo por ora
 * (baixo risco de mexer nele agora, é usado pelo cálculo de BDI), mas o
 * cabeçalho aqui — visível em TODAS as abas — passa a ser a fonte de
 * verdade de "cadastro da obra": Cliente e Responsável viram dropdown
 * dos cadastros ativos (Clientes/Responsáveis), e ganha seu próprio
 * "Confirmar obra", usando os campos `is_confirmed`/`confirmed_at` que
 * já existiam na tabela `obras` mas não tinham UI própria — só eram
 * lidos pelo filtro da lista de Obras e por um rótulo (mal nomeado
 * "EAP: Confirmada") que nunca teve relação de verdade com a
 * confirmação da EAP em si (essa é outra flag, dentro do payload da
 * EAP — `EapStore.cabecalho().isConfirmed`).
 */
@Component({
  selector: 'app-obra-detalhe',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReactiveFormsModule],
  templateUrl: './obra-detalhe.html',
  styleUrl: './obra-detalhe.scss',
})
export class ObraDetalhe implements OnInit {
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly fb = inject(FormBuilder);

  /** Vem da rota via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly abas = ABAS;
  protected readonly obra = signal<Obra | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);

  protected readonly clientesAtivos = signal<Cliente[]>([]);
  protected readonly responsaveisAtivos = signal<Responsavel[]>([]);

  protected readonly formulario = this.fb.nonNullable.group({
    mapNumber: [''],
    obraNome: [''],
    cliente: [''],
    responsavel: [''],
    dataBase: [''],
    localObra: [''],
    periodo: [''],
    obs: [''],
  });

  protected readonly confirmada = computed(() => Boolean(this.obra()?.is_confirmed));

  /**
   * Verdadeiro quando o cliente/responsável gravado na obra não bate com
   * nenhum nome ativo no cadastro (ex.: foi desativado depois, ou foi
   * digitado antes de existir este dropdown) — nesses casos o select
   * ganha uma opção extra só pra não sumir o valor silenciosamente.
   */
  protected clienteNaoListado(): boolean {
    const nome = this.obra()?.cliente;
    return Boolean(nome) && !this.clientesAtivos().some((c) => c.nome === nome);
  }

  protected responsavelNaoListado(): boolean {
    const nome = this.obra()?.responsavel;
    return Boolean(nome) && !this.responsaveisAtivos().some((r) => r.nome === nome);
  }

  ngOnInit(): void {
    this.carregarObra();
    this.carregarClientesEResponsaveis();
  }

  private carregarObra(): void {
    this.api.obterObra(this.id()).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.aplicarNoFormulario(obra);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados da obra.');
        this.carregando.set(false);
      },
    });
  }

  private aplicarNoFormulario(obra: Obra): void {
    this.formulario.reset({
      mapNumber: obra.map_number ?? '',
      obraNome: obra.obra_nome ?? '',
      cliente: obra.cliente ?? '',
      responsavel: obra.responsavel ?? '',
      dataBase: obra.data_base ?? '',
      localObra: obra.local_obra ?? '',
      periodo: obra.periodo ?? '',
      obs: obra.obs ?? '',
    });
    if (obra.is_confirmed) this.formulario.disable();
    else this.formulario.enable();
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

  // ------------------------------------------------------------------
  protected editarCampo(
    campo: 'mapNumber' | 'obraNome' | 'cliente' | 'responsavel' | 'dataBase' | 'localObra' | 'periodo' | 'obs',
    evento: Event,
  ): void {
    const valor = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    this.formulario.patchValue({ [campo]: valor });
    this.salvar();
  }

  private salvar(): void {
    const obraAtual = this.obra();
    if (!obraAtual) return;

    const v = this.formulario.getRawValue();
    this.salvando.set(true);

    // Payload completo (não parcial) — o backend já teve um efeito
    // colateral em PUTs parciais que apagavam campos não enviados (ver
    // comentário em obras.ts#mudarStatusInline); manter essa defesa aqui.
    const payload: Partial<ObraPayload> = {
      map_number: v.mapNumber.trim() || null,
      obra_nome: v.obraNome.trim(),
      cliente: v.cliente.trim(),
      responsavel: v.responsavel.trim(),
      data_base: v.dataBase || null,
      local_obra: v.localObra.trim(),
      periodo: v.periodo.trim(),
      obs: v.obs.trim(),
      bdi_scope: obraAtual.bdi_scope ?? 'global',
      bdi_mode: obraAtual.bdi_mode ?? 'pct',
      bdi_percent: obraAtual.bdi_percent ?? 0,
      bdi_value: obraAtual.bdi_value ?? 0,
      is_confirmed: obraAtual.is_confirmed ?? false,
      confirmed_at: obraAtual.confirmed_at ?? null,
      status: obraAtual.status ?? 'a_iniciar',
    };

    this.api.atualizarObra(this.id(), payload).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.salvando.set(false);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível salvar os dados da obra.');
      },
    });
  }

  protected alternarConfirmacao(): void {
    const obraAtual = this.obra();
    if (!obraAtual) return;

    const vaiConfirmar = !obraAtual.is_confirmed;
    if (vaiConfirmar && !window.confirm('Confirmar os dados desta obra? Eles ficam travados pra edição até reabrir.')) {
      return;
    }

    const v = this.formulario.getRawValue();
    this.salvando.set(true);

    const payload: Partial<ObraPayload> = {
      map_number: v.mapNumber.trim() || null,
      obra_nome: v.obraNome.trim(),
      cliente: v.cliente.trim(),
      responsavel: v.responsavel.trim(),
      data_base: v.dataBase || null,
      local_obra: v.localObra.trim(),
      periodo: v.periodo.trim(),
      obs: v.obs.trim(),
      bdi_scope: obraAtual.bdi_scope ?? 'global',
      bdi_mode: obraAtual.bdi_mode ?? 'pct',
      bdi_percent: obraAtual.bdi_percent ?? 0,
      bdi_value: obraAtual.bdi_value ?? 0,
      is_confirmed: vaiConfirmar,
      confirmed_at: vaiConfirmar ? new Date().toISOString() : null,
      status: obraAtual.status ?? 'a_iniciar',
    };

    this.api.atualizarObra(this.id(), payload).subscribe({
      next: (obra) => {
        this.obra.set(obra);
        this.aplicarNoFormulario(obra);
        this.salvando.set(false);
      },
      error: () => {
        this.salvando.set(false);
        window.alert('Não foi possível atualizar a confirmação da obra.');
      },
    });
  }
}
