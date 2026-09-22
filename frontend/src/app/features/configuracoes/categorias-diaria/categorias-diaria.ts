import { Component, OnInit, inject, signal } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import {
  CATEGORIAS_DIARIA_PADRAO,
  CAMPOS_DIARIA,
  CategoriasDiaria,
  ROTULO_CAMPO_DIARIA,
} from '../../diarias/diarias.models';
import { normalizarCategorias } from '../../diarias/diarias-normalize';
import { ChaveTipo, TIPOS_CUSTO } from '../../eap/eap.models';

/**
 * Aba "Diárias" do popup de Configurações (F7, 22/09/2026) — "categorias
 * de custo padrão": em qual categoria de custo (as mesmas da EAP/
 * Pagamento) cada um dos 5 tipos de lançamento de diária entra quando o
 * fechamento gera o Pagamento. Vale pra empresa toda — não se escolhe por
 * diária. Ver `DiariaController::categorias`/`salvarCategorias`.
 */
@Component({
  selector: 'app-categorias-diaria',
  templateUrl: './categorias-diaria.html',
  styleUrl: './categorias-diaria.scss',
})
export class CategoriasDiariaConfig implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly campos = CAMPOS_DIARIA;
  protected readonly rotulo = ROTULO_CAMPO_DIARIA;
  protected readonly tiposCusto = TIPOS_CUSTO;

  protected readonly categorias = signal<CategoriasDiaria>(CATEGORIAS_DIARIA_PADRAO);
  protected readonly carregando = signal(true);
  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    this.api.obterCategoriasDiaria().subscribe({
      next: (bruto) => {
        this.categorias.set(normalizarCategorias(bruto, CATEGORIAS_DIARIA_PADRAO));
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar.');
        this.carregando.set(false);
      },
    });
  }

  protected mudarCategoria(campo: keyof CategoriasDiaria, evento: Event): void {
    const chave = (evento.target as HTMLSelectElement).value as ChaveTipo;
    this.categorias.update((atual) => ({ ...atual, [campo]: chave }));
    this.salvo.set(false);
  }

  protected salvar(): void {
    this.salvando.set(true);
    this.erro.set(null);
    this.api.salvarCategoriasDiaria(this.categorias()).subscribe({
      next: (bruto) => {
        this.categorias.set(normalizarCategorias(bruto, CATEGORIAS_DIARIA_PADRAO));
        this.salvando.set(false);
        this.salvo.set(true);
      },
      error: () => {
        this.salvando.set(false);
        this.erro.set('Não foi possível salvar.');
      },
    });
  }
}
