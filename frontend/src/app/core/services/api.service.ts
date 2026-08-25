import { HttpClient, HttpContext, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Arquivo, ConteudoPasta, Pasta, RaizesPastas } from '../../features/arquivos/arquivos.models';
import { ResumoContratoEmpreita } from '../../features/empreita/empreita.models';
import { environment } from '../../../environments/environment';
import { SEM_TIMEOUT_LONGO } from '../interceptors/auth.interceptor';
import {
  EapPayload,
  Empreita,
  Mapa,
  MedicaoPayload,
  MedicaoResumo,
  MedicaoSalvarPayload,
  Obra,
  ObraPayload,
  Pagamento,
  PlanejamentoCronograma,
  RegistroDiario,
  RespostaLeituraFornecedor,
  RespostaLeituraNota,
  RespostaMe,
} from '../models/api.models';

/**
 * Camada única de acesso à API Laravel (laravel-backend).
 * O token Sanctum é anexado pelo authInterceptor — este serviço não
 * conhece autenticação, só as rotas.
 *
 * Rotas espelhadas de laravel-backend/routes/api.php.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * Só para a rota de impressão do PDF (22/08/2026, ver docs/GERAR-PDF.md
   * e RelatoriosImprimir): `environment.apiUrl` do dev é um host absoluto
   * (`http://localhost:8088`), que só existe do ponto de vista do
   * navegador do usuário — o Chromium headless que renderiza o PDF roda
   * *dentro* do container `phpfpm`, na rede interna do compose, onde
   * `localhost` não chega no `nginx`. `RelatoriosImprimir` chama isto no
   * construtor, com o valor que veio de `?apiUrl=` na URL (montada por
   * `RelatorioPdfController`), antes de qualquer chamada à API —mesmo
   * padrão do token de impressão (`definirTokenParaImpressao`).
   */
  definirBaseParaImpressao(apiUrl: string): void {
    this.base = apiUrl;
  }

  // ---------------- Sessão ----------------
  /** GET /me — traz o usuário e a empresa (com dados de assinatura). */
  obterUsuarioAtual(): Observable<RespostaMe> {
    return this.http.get<RespostaMe>(`${this.base}/me`);
  }

  // ---------------- Obras ----------------
  listarObras(): Observable<Obra[]> {
    return this.http.get<Obra[]>(`${this.base}/obras`);
  }

  obterObra(id: string): Observable<Obra> {
    return this.http.get<Obra>(`${this.base}/obras/${id}`);
  }

  criarObra(dados: ObraPayload): Observable<Obra> {
    return this.http.post<Obra>(`${this.base}/obras`, dados);
  }

  atualizarObra(id: string, dados: Partial<ObraPayload>): Observable<Obra> {
    return this.http.put<Obra>(`${this.base}/obras/${id}`, dados);
  }

  excluirObra(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obras/${id}`);
  }

  // ---------------- EAP ----------------
  /** Mesmo formato que o app vanilla lia de controleObra.eap.v2. */
  obterEap(obraId: string): Observable<EapPayload> {
    return this.http.get<EapPayload>(`${this.base}/obras/${obraId}/eap`);
  }

  salvarEap(obraId: string, payload: EapPayload): Observable<EapPayload> {
    return this.http.put<EapPayload>(`${this.base}/obras/${obraId}/eap`, payload);
  }

  // ---------------- Medições ----------------
  listarMedicoes(obraId: string): Observable<MedicaoResumo[]> {
    return this.http.get<MedicaoResumo[]>(`${this.base}/obras/${obraId}/medicoes`);
  }

  criarMedicao(obraId: string, dataMedicao?: string): Observable<MedicaoPayload> {
    return this.http.post<MedicaoPayload>(`${this.base}/obras/${obraId}/medicoes`, {
      dataMedicao: dataMedicao ?? null,
    });
  }

  obterMedicao(medicaoId: string): Observable<MedicaoPayload> {
    return this.http.get<MedicaoPayload>(`${this.base}/medicoes/${medicaoId}`);
  }

  salvarMedicao(medicaoId: string, payload: MedicaoSalvarPayload): Observable<MedicaoPayload> {
    return this.http.put<MedicaoPayload>(`${this.base}/medicoes/${medicaoId}`, payload);
  }

  aprovarMedicao(medicaoId: string, payload: MedicaoSalvarPayload): Observable<MedicaoPayload> {
    return this.http.post<MedicaoPayload>(`${this.base}/medicoes/${medicaoId}/aprovar`, payload);
  }

  excluirMedicao(medicaoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/medicoes/${medicaoId}`);
  }

  /**
   * GET /medicoes/{id}/relatorio/pdf — mesmo mecanismo de `baixarMapaPdf`
   * (24/08/2026, ver MedicaoPdfController).
   */
  baixarMedicaoPdf(medicaoId: string): Observable<Blob> {
    return this.http.get(`${this.base}/medicoes/${medicaoId}/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  // ---------------- Mapas ----------------
  /** GET /mapas — aceita `obraId` para trazer só os mapas de uma obra. */
  listarMapas(obraId?: string): Observable<Mapa[]> {
    let params = new HttpParams();
    if (obraId) params = params.set('obra_id', obraId);
    return this.http.get<Mapa[]>(`${this.base}/mapas`, { params });
  }

  obterMapa(id: string): Observable<Mapa> {
    return this.http.get<Mapa>(`${this.base}/mapas/${id}`);
  }

  criarMapa(dados: Partial<Mapa>): Observable<Mapa> {
    return this.http.post<Mapa>(`${this.base}/mapas`, dados);
  }

  atualizarMapa(id: string, dados: Partial<Mapa>): Observable<Mapa> {
    return this.http.put<Mapa>(`${this.base}/mapas/${id}`, dados);
  }

  excluirMapa(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/mapas/${id}`);
  }

  // ---------------- Empreitas ----------------
  /** GET /empreitas — aceita `obraId` para trazer só as empreitas de uma obra. */
  listarEmpreitas(obraId?: string): Observable<Empreita[]> {
    let params = new HttpParams();
    if (obraId) params = params.set('obra_id', obraId);
    return this.http.get<Empreita[]>(`${this.base}/empreitas`, { params });
  }

  obterEmpreita(id: string): Observable<Empreita> {
    return this.http.get<Empreita>(`${this.base}/empreitas/${id}`);
  }

  criarEmpreita(dados: Partial<Empreita>): Observable<Empreita> {
    return this.http.post<Empreita>(`${this.base}/empreitas`, dados);
  }

  atualizarEmpreita(id: string, dados: Partial<Empreita>): Observable<Empreita> {
    return this.http.put<Empreita>(`${this.base}/empreitas/${id}`, dados);
  }

  excluirEmpreita(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/empreitas/${id}`);
  }

  /**
   * GET /empreitas/resumo?obra_id= — contrato de toda empreita da obra
   * (25/08/2026, redesign da tela: usado só pra calcular o "Saldo disp."
   * entre empreitas — ver `EmpreitaController::resumoObra` e
   * `calcularSaldoDisponivelPorEap` em `empreita-engine.ts`).
   */
  obterResumoContratoEmpreitas(obraId: string): Observable<ResumoContratoEmpreita[]> {
    const params = new HttpParams().set('obra_id', obraId);
    return this.http.get<ResumoContratoEmpreita[]>(`${this.base}/empreitas/resumo`, { params });
  }

  /** POST /empreitas/{id}/registros — registra uma medição. */
  registrarMedicao(empreitaId: string, dados: unknown): Observable<unknown> {
    return this.http.post(`${this.base}/empreitas/${empreitaId}/registros`, dados);
  }

  // ---------------- Pagamentos ----------------
  /**
   * GET /pagamentos — aceita `obraId` (todos os pagamentos de uma obra),
   * e opcionalmente `origemTipo`/`origemRefId` (ex.: só os gerados por
   * um mapa específico). A resposta já vem no formato camelCase que o
   * front usa — ver `PagamentoController::paraFrontend()`.
   */
  listarPagamentos(filtros?: {
    obraId?: string;
    origemTipo?: string;
    origemRefId?: string;
  }): Observable<Pagamento[]> {
    let params = new HttpParams();
    if (filtros?.obraId) params = params.set('obra_id', filtros.obraId);
    if (filtros?.origemTipo) params = params.set('origem_tipo', filtros.origemTipo);
    if (filtros?.origemRefId) params = params.set('origem_ref_id', filtros.origemRefId);
    return this.http.get<Pagamento[]>(`${this.base}/pagamentos`, { params });
  }

  criarPagamento(dados: Partial<Pagamento>): Observable<Pagamento> {
    return this.http.post<Pagamento>(`${this.base}/pagamentos`, dados);
  }

  atualizarPagamento(id: string, dados: Partial<Pagamento>): Observable<Pagamento> {
    return this.http.put<Pagamento>(`${this.base}/pagamentos/${id}`, dados);
  }

  excluirPagamento(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pagamentos/${id}`);
  }

  /**
   * POST /pagamentos/ler-nota — extrai os dados de uma foto de nota
   * fiscal ou recibo. Recebe FormData porque envia a imagem.
   */
  lerNotaFiscal(imagem: File): Observable<RespostaLeituraNota> {
    const dados = new FormData();
    dados.append('imagem', imagem);
    return this.http.post<RespostaLeituraNota>(`${this.base}/pagamentos/ler-nota`, dados);
  }

  /**
   * POST /fornecedores/ler-nota — lê a nota fiscal do PRÓPRIO fornecedor
   * pra extrair os dados de cadastro (nome, tipo, documento, endereço,
   * especialidade). 04/08/2026, pedido do Lucas.
   */
  lerNotaFornecedor(imagem: File): Observable<RespostaLeituraFornecedor> {
    const dados = new FormData();
    dados.append('imagem', imagem);
    return this.http.post<RespostaLeituraFornecedor>(`${this.base}/fornecedores/ler-nota`, dados);
  }

  // ---------------- Diário de obra ----------------
  /**
   * GET /diario — aceita `obra_id` para filtrar por obra e `limite` para
   * os "registros recentes" do dashboard.
   */
  listarDiario(filtros?: { obraId?: string; limite?: number }): Observable<RegistroDiario[]> {
    let params = new HttpParams();
    if (filtros?.obraId) params = params.set('obra_id', filtros.obraId);
    if (filtros?.limite) params = params.set('limite', String(filtros.limite));
    return this.http.get<RegistroDiario[]>(`${this.base}/diario`, { params });
  }

  /**
   * POST /diario — recebe FormData porque o registro pode vir com fotos
   * anexadas (campo `fotos[]`), igual ao formulário do app vanilla.
   */
  criarRegistroDiario(dados: FormData): Observable<RegistroDiario> {
    return this.http.post<RegistroDiario>(`${this.base}/diario`, dados);
  }

  excluirRegistroDiario(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/diario/${id}`);
  }

  // ---------------- Relatórios ----------------
  /**
   * GET /obras/{id}/relatorio/pdf — gera o PDF do relatório Orçado x
   * Realizado no backend (Chromium headless via Browsershot, ver
   * RelatorioPdfController). Pode demorar alguns segundos (o Chromium
   * precisa abrir a tela de impressão e esperar os dados carregarem) —
   * por isso o timeout longo, igual ao usado em upload/download de
   * arquivos.
   */
  baixarRelatorioPdf(obraId: string): Observable<Blob> {
    return this.http.get(`${this.base}/obras/${obraId}/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  /**
   * GET /mapas/{id}/relatorio/pdf — mesmo mecanismo acima, aplicado ao
   * Mapa de Fornecedores (22/08/2026, ver MapaPdfController).
   */
  baixarMapaPdf(mapaId: string): Observable<Blob> {
    return this.http.get(`${this.base}/mapas/${mapaId}/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  /**
   * GET /obras/{id}/eap/relatorio/pdf — mesmo mecanismo acima, aplicado à
   * EAP (23/08/2026, ver EapPdfController).
   */
  baixarEapPdf(obraId: string): Observable<Blob> {
    return this.http.get(`${this.base}/obras/${obraId}/eap/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  /**
   * GET /empreitas/{id}/relatorio/pdf — mesmo mecanismo acima, aplicado à
   * Empreita (23/08/2026, ver EmpreitaPdfController).
   */
  baixarEmpreitaPdf(empreitaId: string): Observable<Blob> {
    return this.http.get(`${this.base}/empreitas/${empreitaId}/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  /**
   * GET /obras/{id}/desembolso/relatorio/pdf — mesmo mecanismo acima,
   * aplicado ao Cronograma de Desembolso (23/08/2026, ver
   * CronogramaPdfController).
   */
  baixarCronogramaPdf(obraId: string): Observable<Blob> {
    return this.http.get(`${this.base}/obras/${obraId}/desembolso/relatorio/pdf`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  /** GET /obras/{id}/cronograma/planejamentos — valores planejados de desembolso (24/08/2026). */
  listarPlanejamentosCronograma(obraId: string): Observable<PlanejamentoCronograma[]> {
    return this.http.get<PlanejamentoCronograma[]>(`${this.base}/obras/${obraId}/cronograma/planejamentos`);
  }

  /** PUT /obras/{id}/cronograma/planejamentos — upsert de um valor planejado. */
  salvarPlanejamentoCronograma(
    obraId: string,
    payload: PlanejamentoCronograma,
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/obras/${obraId}/cronograma/planejamentos`, payload);
  }

  /** DELETE /obras/{id}/cronograma/planejamentos — zera todo o planejamento da obra (24/08/2026). */
  zerarPlanejamentosCronograma(obraId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obras/${obraId}/cronograma/planejamentos`);
  }

  // ---------------- Storage genérico (ponte com o formato antigo) ----------------
  /**
   * Espelha o storage.php do app vanilla: chave -> valor. Útil durante a
   * transição, para telas ainda não migradas para o modelo relacional.
   */
  lerChave(chave: string): Observable<{ ok: boolean; value: string | null }> {
    const params = new HttpParams().set('key', chave);
    return this.http.get<{ ok: boolean; value: string | null }>(`${this.base}/storage`, { params });
  }

  gravarChave(chave: string, valor: string): Observable<unknown> {
    return this.http.post(`${this.base}/storage`, { key: chave, value: valor });
  }

  removerChave(chave: string): Observable<unknown> {
    const params = new HttpParams().set('key', chave);
    return this.http.delete(`${this.base}/storage`, { params });
  }

  // ---------------- Arquivos anexados (pastas + arquivos) ----------------
  obterPastasRaizes(obraId: string): Observable<RaizesPastas> {
    return this.http.get<RaizesPastas>(`${this.base}/obras/${obraId}/pastas/raizes`);
  }

  obterPasta(pastaId: string): Observable<ConteudoPasta> {
    return this.http.get<ConteudoPasta>(`${this.base}/pastas/${pastaId}`);
  }

  criarSubpasta(pastaId: string, nome: string): Observable<Pasta> {
    return this.http.post<Pasta>(`${this.base}/pastas/${pastaId}/subpastas`, { nome });
  }

  atualizarPasta(
    pastaId: string,
    dados: Partial<{ nome: string; parent_id: string }>,
  ): Observable<Pasta> {
    return this.http.put<Pasta>(`${this.base}/pastas/${pastaId}`, dados);
  }

  excluirPasta(pastaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas/${pastaId}`);
  }

  /**
   * POST /pastas/{id}/arquivos — upload até 100MB, então usa
   * `reportProgress` (a store expõe o progresso) e escapa do timeout
   * padrão de 15s do interceptor via o contexto SEM_TIMEOUT_LONGO.
   */
  enviarArquivo(pastaId: string, arquivo: File): Observable<HttpEvent<Arquivo>> {
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    return this.http.post<Arquivo>(`${this.base}/pastas/${pastaId}/arquivos`, dados, {
      reportProgress: true,
      observe: 'events',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }

  atualizarArquivo(
    arquivoId: string,
    dados: Partial<{ nome_original: string; pasta_id: string }>,
  ): Observable<Arquivo> {
    return this.http.put<Arquivo>(`${this.base}/arquivos/${arquivoId}`, dados);
  }

  excluirArquivo(arquivoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/arquivos/${arquivoId}`);
  }

  obterUrlPreviewArquivo(arquivoId: string): Observable<{ url: string; expira_em: string }> {
    return this.http.get<{ url: string; expira_em: string }>(
      `${this.base}/arquivos/${arquivoId}/preview-url`,
    );
  }

  baixarArquivo(arquivoId: string): Observable<Blob> {
    return this.http.get(`${this.base}/arquivos/${arquivoId}/download`, {
      responseType: 'blob',
      context: new HttpContext().set(SEM_TIMEOUT_LONGO, true),
    });
  }
}
