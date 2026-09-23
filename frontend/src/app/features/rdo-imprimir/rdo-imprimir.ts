import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CLIMAS, RdoFoto, RdoObraDados, RdoRegistro, TIPOS_OCORRENCIA } from '../rdo/rdo.models';
import { RdoService } from '../rdo/rdo.service';

/**
 * Versão "para imprimir" do RDO — é esta tela que o Chromium headless abre
 * para gerar o PDF (ver `RdoPdfController` e docs/GERAR-PDF.md). Fica fora do
 * AppShell: sem menu lateral, sem cabeçalho da aplicação, só o documento.
 *
 * O layout traz todos os campos da planilha-modelo de RDO que o mercado usa
 * (cabeçalho com contrato/CREA/ART, nº do relatório, clima por turno, mão de
 * obra indireta e direta, equipamentos, tarefas numeradas, ocorrências e o
 * bloco de assinaturas), mas na identidade visual do AppTrena — foi a escolha
 * da Onilia em 17/09/2026: mesmos campos, layout próprio.
 *
 * O bloco de assinaturas traz três linhas, como o documento do mercado, mas só
 * a da contratada vem preenchida pelo sistema: o contratante não assina
 * digitalmente (decisão de 08/09/2026), então a linha dele fica em branco para
 * assinatura à mão, se as partes quiserem.
 */
@Component({
  selector: 'app-rdo-imprimir',
  imports: [DatePipe],
  templateUrl: './rdo-imprimir.html',
  styleUrl: './rdo-imprimir.scss',
})
export class RdoImprimir implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly rdoApi = inject(RdoService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  protected readonly rdo = signal<RdoRegistro | null>(null);
  protected readonly cabecalho = signal<RdoObraDados | null>(null);
  protected readonly empresa = signal<PerfilEmpresa | null>(null);

  constructor() {
    // Precisa acontecer ANTES de qualquer chamada à API, e o construtor roda
    // antes do ngOnInit. Mesmo padrão das outras telas de impressão.
    const token = this.rota.snapshot.queryParamMap.get('token');
    if (token) {
      this.auth.definirTokenParaImpressao(token);
    }

    const apiUrl = this.rota.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) {
      this.api.definirBaseParaImpressao(apiUrl);
      this.rdoApi.definirBaseParaImpressao(apiUrl);
    }
  }

  ngOnInit(): void {
    const id = this.rota.snapshot.paramMap.get('id') ?? '';

    this.rdoApi.obter(id).subscribe((registro) => {
      this.rdo.set(registro);
      this.rdoApi.obterCabecalho(registro.obra_id).subscribe({
        next: (dados) => this.cabecalho.set(dados),
        error: () => void 0,
      });
    });

    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.empresa.set(perfil),
      error: () => void 0,
    });
  }

  protected maoDeObraDe(categoria: 'indireta' | 'direta') {
    return (this.rdo()?.mao_de_obra ?? []).filter((m) => m.categoria === categoria);
  }

  protected fotosDaTarefa(tarefaId: string): RdoFoto[] {
    return (this.rdo()?.fotos ?? []).filter((f) => f.tarefa_id === tarefaId);
  }

  protected fotosDoDia(): RdoFoto[] {
    return (this.rdo()?.fotos ?? []).filter((f) => !f.tarefa_id);
  }

  /**
   * `foto.url`/`logoUrl` vêm relativos (`/storage/...`) — achado em
   * 23/09/2026: nenhuma foto aparecia no PDF de nenhum módulo porque o
   * Chromium headless que renderiza esta tela roda *dentro* do container
   * `phpfpm`, onde a URL absoluta que a API montava (`APP_URL`) não existe.
   * `ApiService.baseStorage()` já resolve pro host certo neste contexto de
   * impressão (mesmo mecanismo da logo da empresa, ver
   * `Empresa::getLogoUrlAttribute()`) — faltava aplicar nas mídias do RDO
   * (e, por um descuido à parte, na própria logo aqui nesta tela).
   */
  protected urlMidia(foto: RdoFoto): string {
    return this.api.baseStorage() + foto.url;
  }

  protected urlLogo(): string | null {
    const caminho = this.empresa()?.logoUrl;
    return caminho ? this.api.baseStorage() + caminho : null;
  }

  protected rotuloClima(valor: string | null | undefined): string {
    return CLIMAS.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloOcorrencia(valor: string): string {
    return TIPOS_OCORRENCIA.find((t) => t.valor === valor)?.rotulo ?? valor;
  }

  /** Nº do RDO com três dígitos, como no documento impresso (001, 002…). */
  protected numeroFormatado(): string {
    return String(this.rdo()?.numero ?? 0).padStart(3, '0');
  }

  /** Linhas em branco para a tabela não ficar "curta" demais no papel. */
  protected preenchimento(quantidade: number, minimo: number): number[] {
    return Array.from({ length: Math.max(0, minimo - quantidade) }, (_, i) => i);
  }
}
