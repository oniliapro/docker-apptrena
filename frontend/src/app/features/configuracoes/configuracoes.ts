import { Component, inject, output, signal } from '@angular/core';

import { PermissoesService } from '../../core/services/permissoes.service';
import { CategoriasDiariaConfig } from './categorias-diaria/categorias-diaria';
import { ContratoModelosConfig } from './contrato-modelos/contrato-modelos';
import { ControlePermissoes } from './controle-permissoes/controle-permissoes';
import { DadosEmpresa } from './dados-empresa/dados-empresa';
import { FvsModelosConfig } from './fvs-modelos/fvs-modelos';
import { Plano } from './plano/plano';
import { Tags } from './tags/tags';

type AbaConfiguracao = 'empresa' | 'plano' | 'permissoes' | 'tags' | 'diarias' | 'fvs' | 'contratos';

/**
 * Popup de Configurações (26/08/2026, pedido do Lucas) — aba lateral que
 * cresce conforme novas seções entram. Quatro abas de verdade agora:
 * "Dados da empresa", "Plano" (28/08/2026), "Controle de permissões"
 * (31/08/2026) — essa última só aparece pra quem administra a empresa ou
 * tem `pode_gerenciar_permissoes` (um usuário comum nem vê a aba na
 * lista; o backend também recusa, isso aqui é só não mostrar o que ia
 * dar 403 mesmo) — e "Tags" (06/09/2026, controle de notas fiscais por
 * anexo em Pagamentos/Recebimentos).
 *
 * Estrutura copiada do padrão `.modal`/`.modal-fundo`/`.modal-cartao` já
 * usado no resto do app (ver `PreviewModal`, primeiro modal reutilizável
 * do projeto) — aqui só o `.modal-cartao` fica mais largo e o corpo vira
 * `flex-row` com uma aba lateral, porque nenhum modal existente tinha
 * esse layout ainda.
 */
@Component({
  selector: 'app-configuracoes',
  imports: [DadosEmpresa, Plano, ControlePermissoes, Tags, CategoriasDiariaConfig, FvsModelosConfig, ContratoModelosConfig],
  templateUrl: './configuracoes.html',
  styleUrl: './configuracoes.scss',
})
export class Configuracoes {
  private readonly permissoesService = inject(PermissoesService);

  readonly fechar = output<void>();

  protected readonly abaAtiva = signal<AbaConfiguracao>('empresa');

  protected readonly podeVerControlePermissoes = () =>
    this.permissoesService.ehAdmin() || this.permissoesService.podeGerenciarPermissoes();

  protected selecionarAba(aba: AbaConfiguracao): void {
    this.abaAtiva.set(aba);
  }
}
