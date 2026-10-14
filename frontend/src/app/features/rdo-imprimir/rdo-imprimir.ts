import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CabecalhoImpressao } from '../../shared/cabecalho-impressao/cabecalho-impressao';
import { extrairItensEapResumo, ItemEapResumo } from '../../shared/eap-snapshot';
import {
  CLIMAS,
  CONDICOES_TRABALHO,
  RdoEquipamento,
  RdoFoto,
  RdoObraDados,
  RdoOcorrencia,
  RdoPendencia,
  RdoRegistro,
  TIPOS_OCORRENCIA,
} from '../rdo/rdo.models';
import { RdoService } from '../rdo/rdo.service';

/**
 * Versão "para imprimir" do RDO — é esta tela que o Chromium headless abre
 * para gerar o PDF (ver `RdoPdfController` e docs/GERAR-PDF.md). Fica fora do
 * AppShell: sem menu lateral, sem cabeçalho da aplicação, só o documento.
 *
 * O layout traz todos os campos da planilha-modelo de RDO que o mercado usa
 * (cabeçalho com contrato/CREA/ART, nº do relatório, clima por turno, mão de
 * obra interna e externa, equipamentos, tarefas numeradas, ocorrências e o
 * bloco de assinaturas), mas na identidade visual do ComTrena — foi a escolha
 * da Onilia em 17/09/2026: mesmos campos, layout próprio.
 *
 * 14/10/2026, reformulação a pedido do Lucas: cabeçalho próprio (que
 * duplicava nome/endereço da empresa, ocupando espaço demais) trocado pelo
 * `CabecalhoImpressao` compartilhado, mesmo padrão dos outros PDFs. Cada
 * tarefa passou a trazer junto, na ordem, a Etapa vinculada (via
 * `eap_item_id` da `RdoEtapa` correspondente — ver `rotuloEtapaDaTarefa`),
 * a descrição, as ocorrências e pendências DELA (antes eram seções soltas
 * no fim do documento, sem ligação visual com a tarefa que gerou), e as
 * fotos — vídeo não aparece mais inline (o PDF é estático, não toca vídeo),
 * só um aviso único no fim do documento se houver algum.
 *
 * O bloco de assinaturas traz três linhas, como o documento do mercado, mas só
 * a da contratada vem preenchida pelo sistema: o contratante não assina
 * digitalmente (decisão de 08/09/2026), então a linha dele fica em branco para
 * assinatura à mão, se as partes quiserem.
 */
@Component({
  selector: 'app-rdo-imprimir',
  imports: [DatePipe, CabecalhoImpressao],
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
  protected readonly itensEap = signal<ItemEapResumo[]>([]);
  protected readonly geradoEm = new Date().toISOString();

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
      this.api.obterEap(registro.obra_id).subscribe({
        next: (payload) => this.itensEap.set(extrairItensEapResumo(payload.eapItems)),
        error: () => this.itensEap.set([]),
      });
    });

    this.api.obterPerfilEmpresa().subscribe({
      next: (perfil) => this.empresa.set(perfil),
      error: () => void 0,
    });
  }

  protected maoDeObraDe(categoria: 'interno' | 'externo') {
    return (this.rdo()?.mao_de_obra ?? []).filter((m) => m.categoria === categoria);
  }

  protected equipamentosDe(categoria: RdoEquipamento['categoria']): RdoEquipamento[] {
    return (this.rdo()?.equipamentos ?? []).filter((e) => e.categoria === categoria);
  }

  /** Só fotos de verdade — vídeo nunca aparece inline no PDF, ver `temVideo()`. */
  protected fotosDaTarefa(tarefaId: string): RdoFoto[] {
    return (this.rdo()?.fotos ?? []).filter((f) => f.tarefa_id === tarefaId && f.tipo === 'foto');
  }

  protected fotosDoDia(): RdoFoto[] {
    return (this.rdo()?.fotos ?? []).filter((f) => !f.tarefa_id && f.tipo === 'foto');
  }

  /**
   * (14/10/2026) O PDF é estático — nunca tocou vídeo, só mostrava uma
   * caixa "Vídeo anexado" no lugar de cada um. Virou um único aviso no fim
   * do documento (pedido do Lucas), então as mídias de vídeo não entram
   * mais em `fotosDaTarefa`/`fotosDoDia` — só precisamos saber SE existe
   * pelo menos um, pra decidir se mostra o aviso.
   */
  protected temVideo(): boolean {
    return (this.rdo()?.fotos ?? []).some((f) => f.tipo === 'video');
  }

  protected ocorrenciasDaTarefa(tarefaId: string): RdoOcorrencia[] {
    return (this.rdo()?.ocorrencias ?? []).filter((o) => o.tarefa_id === tarefaId);
  }

  protected pendenciasDaTarefa(tarefaId: string): RdoPendencia[] {
    return (this.rdo()?.pendencias ?? []).filter((p) => p.tarefa_id === tarefaId);
  }

  /** Registros de antes de 26/09/2026 (ocorrência/pendência ainda não vinculada a uma tarefa). */
  protected ocorrenciasOrfas(): RdoOcorrencia[] {
    return (this.rdo()?.ocorrencias ?? []).filter((o) => !o.tarefa_id);
  }

  protected pendenciasOrfas(): RdoPendencia[] {
    return (this.rdo()?.pendencias ?? []).filter((p) => !p.tarefa_id);
  }

  /**
   * "Etapa" da tarefa `indice` (14/10/2026, pedido do Lucas: mostrar a
   * etapa antes da descrição, não só a descrição sozinha). `RdoTarefa` não
   * guarda `eap_item_id` — só `RdoEtapa` guarda — mas as duas listas nascem
   * do MESMO formulário, na MESMA ordem (`desmembrarTarefas`/`rdo.ts`, e
   * `RdoController::sincronizarFilhos`, que grava as duas com `ordem`
   * sincronizado: `tarefa.ordem = $i+1`, `etapa.ordem = $i`), então a
   * etapa da tarefa `r.tarefas[i]` é sempre `r.etapas[i]`.
   */
  protected rotuloEtapaDaTarefa(indice: number): string | null {
    const etapaId = this.rdo()?.etapas?.[indice]?.eap_item_id;
    if (!etapaId) return null;
    const item = this.itensEap().find((i) => i.id === etapaId);
    if (!item) return null;
    const eap = item.eap.trim();
    const desc = item.desc.trim();
    return eap && desc ? `${eap} - ${desc}` : eap || desc || null;
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

  /** Mesma ideia de `urlMidia()`, pras fotos de evidência das fichas de verificação (F10). */
  protected urlFotoFvs(url: string): string {
    return this.api.baseStorage() + url;
  }

  protected rotuloClima(valor: string | null | undefined): string {
    return CLIMAS.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloCondicao(valor: string | null | undefined): string {
    return CONDICOES_TRABALHO.find((c) => c.valor === valor)?.rotulo ?? '—';
  }

  protected rotuloOcorrencia(valor: string): string {
    return TIPOS_OCORRENCIA.find((t) => t.valor === valor)?.rotulo ?? valor;
  }

  /** Nº do RDO com três dígitos, como no documento impresso (001, 002…). */
  protected numeroFormatado(): string {
    return String(this.rdo()?.numero ?? 0).padStart(3, '0');
  }
}
