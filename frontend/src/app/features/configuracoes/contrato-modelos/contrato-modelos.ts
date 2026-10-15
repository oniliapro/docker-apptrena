import { Component, OnInit, inject, signal } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { ContratoModelo, ROTULOS_TIPO_CONTRATO_MODELO, TipoContratoModelo } from './contrato-modelo.models';

const TIPOS: readonly TipoContratoModelo[] = ['empreita', 'obra', 'proposta', 'fvs'];

/**
 * Aba "Modelos de documentos" do popup de Configurações (28/09/2026, itens
 * 8/9; renomeada de "Modelos de contrato" em 14/10/2026, quando ganhou o
 * tipo Proposta) — lista dos modelos reaproveitáveis de contrato de
 * Empreita, contrato de Obra e Proposta (gerada da EAP), mesmo espírito de
 * Materiais/Profissionais/Modelos de FVS.
 *
 * 29/09/2026, pedido do Lucas ("a edição ficou muito simples, quero algo
 * mais parecido com o Word, numa janela própria"): editar/criar não é
 * mais um formulário inline aqui — abre `ContratoModeloEditor` numa aba
 * nova (`window.open`), com barra de formatação de verdade. Como a edição
 * acontece em outra aba (sem sincronizar sozinha), tem um botão
 * "Atualizar" pra recarregar a lista depois de salvar.
 */
@Component({
  selector: 'app-contrato-modelos',
  templateUrl: './contrato-modelos.html',
  styleUrl: './contrato-modelos.scss',
})
export class ContratoModelosConfig implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly tipos = TIPOS;
  protected readonly rotulosTipo = ROTULOS_TIPO_CONTRATO_MODELO;

  protected readonly modelos = signal<ContratoModelo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  protected modelosPorTipo(tipo: TipoContratoModelo): ContratoModelo[] {
    return this.modelos().filter((m) => m.tipo === tipo);
  }

  ngOnInit(): void {
    this.carregar();
  }

  protected carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.api.listarContratoModelos().subscribe({
      next: (lista) => {
        this.modelos.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os modelos.');
        this.carregando.set(false);
      },
    });
  }

  // Caminho SEM barra inicial de propósito: resolve contra `<base href>`
  // (`/` no dev, `/app/` em produção) em vez da raiz do domínio — com
  // barra inicial, abriria fora da pasta certa em produção.
  protected novo(tipo: TipoContratoModelo): void {
    window.open(`contrato-modelos/novo?tipo=${tipo}`, '_blank');
  }

  protected editar(modelo: ContratoModelo): void {
    window.open(`contrato-modelos/${modelo.id}`, '_blank');
  }

  protected excluir(modelo: ContratoModelo): void {
    if (!confirm(`Excluir o modelo "${modelo.nome}"? Contratos já gerados com ele não são afetados.`)) return;
    this.api.excluirContratoModelo(modelo.id).subscribe({
      next: () => this.modelos.update((lista) => lista.filter((m) => m.id !== modelo.id)),
      error: () => this.erro.set('Não foi possível excluir este modelo.'),
    });
  }
}
