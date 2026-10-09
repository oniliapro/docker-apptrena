import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom } from 'rxjs';

import { LOJA_FILA_RDO, bancoLocal } from '../../core/offline/banco-local';
import { ApiService } from '../../core/services/api.service';
import { ArmazenamentoService } from '../../core/services/armazenamento.service';
import { AuthService } from '../../core/services/auth.service';
import { CHAVE_EMPREITEIROS } from '../cadastros/empreiteiros/empreiteiros';
import { FotoSelecionada, VideoSelecionado } from './rdo.models';
import { RdoService } from './rdo.service';

/** Foto ou vídeo guardado no celular, esperando para subir. */
export interface ArquivoGuardado {
  idLocal: string;
  arquivo: Blob;
  nome: string;
  tipo: string;
  tarefaRef: string | null;
  legenda: string;
  /** Só foto (croqui). */
  marcador?: { x: number; y: number } | null;
  nota?: string;
}

/**
 * Um RDO lançado no app que ainda não chegou (inteiro) ao servidor.
 *
 * `id` é o id DEFINITIVO do RDO — gerado no celular e aceito pela API
 * (`RdoController::store`), por isso a URL do RDO não muda depois do envio.
 */
export interface RdoPendenteEnvio {
  id: string;
  obraId: string;
  obraNome: string | null;
  usuarioId: number | string;
  /** O mesmo corpo que o formulário manda à API (`Rdo.salvar`). */
  payload: Record<string, unknown>;
  fotos: ArquivoGuardado[];
  videos: ArquivoGuardado[];
  criadoEm: string;
  atualizadoEm: string;
  /** Sobe a cada vez que a pessoa salva de novo no celular. */
  versao: number;
  /** Já foi criado no servidor — o próximo envio é uma atualização. */
  existeNoServidor: boolean;
  /** Fotos/vídeos (idLocal) que já subiram. */
  arquivosEnviados: string[];
  /** Fotos/vídeos que estavam na última tentativa (resultado ainda desconhecido). */
  arquivosNaUltimaTentativa: string[];
  tentativas: number;
  ultimoErro: string | null;
  /** 'erro' = o servidor RECUSOU (ex.: campo inválido): só sai da fila depois que a pessoa corrigir e salvar de novo. */
  estado: 'pendente' | 'erro';
}

type ResultadoEnvio = 'ok' | 'sem-rede' | 'sem-login' | 'recusado' | 'falhou';

/**
 * Fila de envio dos RDOs lançados no app — 09/10/2026 (decisões do Lucas:
 * RDO NOVO pode ser feito sem internet, com fotos e vídeos; o envio é
 * automático com o app aberto).
 *
 * Como funciona:
 * 1. Salvar um RDO novo no app grava PRIMEIRO aqui (IndexedDB, com os
 *    arquivos) — nada do que foi digitado se perde se a rede cair no meio.
 * 2. `enviarTudo()` tenta subir cada item: ao abrir o app, quando a internet
 *    volta, quando o app volta para a frente e a cada minuto enquanto houver
 *    fila. Sucesso = o item sai da fila.
 * 3. Envio que caiu sem resposta: na próxima tentativa, primeiro confere no
 *    servidor se o RDO chegou (`existeNoServidor`); se chegou, só manda o
 *    que mudou depois. O servidor nunca cria dois RDOs com o mesmo id.
 *
 * Finalizar/assinar e as fichas de verificação (FVS) continuam só com
 * internet — quem faz isso é o servidor.
 */
@Injectable({ providedIn: 'root' })
export class RdoFilaService {
  private readonly rdoApi = inject(RdoService);
  private readonly api = inject(ApiService);
  private readonly armazenamento = inject(ArmazenamentoService);
  private readonly auth = inject(AuthService);

  private readonly _itens = signal<RdoPendenteEnvio[]>([]);
  readonly itens = this._itens.asReadonly();
  readonly enviando = signal(false);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly pendentes = computed(() => this._itens().length);
  readonly comErro = computed(() => this._itens().filter((i) => i.estado === 'erro').length);

  private iniciada = false;
  private readonly obrasPreparadas = new Set<string>();

  /** Chamado uma vez pela casca do app (`AppMovel`). */
  iniciar(): void {
    if (this.iniciada) return;
    this.iniciada = true;

    window.addEventListener('online', () => {
      this.online.set(true);
      void this.enviarTudo();
    });
    window.addEventListener('offline', () => this.online.set(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.enviarTudo();
    });
    setInterval(() => {
      if (this._itens().some((i) => i.estado === 'pendente')) void this.enviarTudo();
    }, 60_000);

    void this.recarregar().then(() => this.enviarTudo());
  }

  async recarregar(): Promise<void> {
    const todos = await bancoLocal.listar<RdoPendenteEnvio>(LOJA_FILA_RDO).catch(() => [] as RdoPendenteEnvio[]);
    const usuario = this.auth.usuario()?.id;
    this._itens.set(
      todos.filter((i) => String(i.usuarioId) === String(usuario)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    );
  }

  obter(id: string): Promise<RdoPendenteEnvio | undefined> {
    return bancoLocal.ler<RdoPendenteEnvio>(LOJA_FILA_RDO, id).catch(() => undefined);
  }

  /** Grava (ou regrava) o RDO no celular. O envio acontece depois, em `enviarTudo()`. */
  async guardar(dados: {
    id: string;
    obraId: string;
    obraNome: string | null;
    payload: Record<string, unknown>;
    fotos: FotoSelecionada[];
    videos: VideoSelecionado[];
  }): Promise<void> {
    const usuarioId = this.auth.usuario()?.id;
    if (usuarioId === undefined || usuarioId === null) {
      throw new Error('Sessão expirada — entre de novo para salvar.');
    }

    const anterior = await this.obter(dados.id);
    const agora = new Date().toISOString();

    const item: RdoPendenteEnvio = {
      id: dados.id,
      obraId: dados.obraId,
      obraNome: dados.obraNome,
      usuarioId,
      payload: JSON.parse(JSON.stringify(dados.payload)) as Record<string, unknown>,
      fotos: dados.fotos.map((f) => ({
        idLocal: f.idLocal ?? crypto.randomUUID(),
        arquivo: f.arquivo,
        nome: f.arquivo.name,
        tipo: f.arquivo.type,
        tarefaRef: f.tarefaRef,
        legenda: f.legenda,
        marcador: f.marcador,
        nota: f.nota,
      })),
      videos: dados.videos.map((v) => ({
        idLocal: v.idLocal ?? crypto.randomUUID(),
        arquivo: v.arquivo,
        nome: v.arquivo.name,
        tipo: v.arquivo.type,
        tarefaRef: v.tarefaRef,
        legenda: v.legenda,
      })),
      criadoEm: anterior?.criadoEm ?? agora,
      atualizadoEm: agora,
      versao: (anterior?.versao ?? 0) + 1,
      existeNoServidor: anterior?.existeNoServidor ?? false,
      arquivosEnviados: anterior?.arquivosEnviados ?? [],
      arquivosNaUltimaTentativa: anterior?.arquivosNaUltimaTentativa ?? [],
      tentativas: anterior?.tentativas ?? 0,
      ultimoErro: null,
      estado: 'pendente',
    };

    await bancoLocal.gravar(LOJA_FILA_RDO, item);
    await this.recarregar();
  }

  async remover(id: string): Promise<void> {
    await bancoLocal.apagar(LOJA_FILA_RDO, id).catch(() => undefined);
    await this.recarregar();
  }

  /** Fotos e vídeos do item, no formato que o formulário do RDO usa (para continuar editando). */
  paraFormulario(item: RdoPendenteEnvio): { fotos: FotoSelecionada[]; videos: VideoSelecionado[] } {
    const comoArquivo = (g: ArquivoGuardado): File =>
      g.arquivo instanceof File ? g.arquivo : new File([g.arquivo], g.nome, { type: g.tipo });

    return {
      fotos: item.fotos.map((g) => {
        const arquivo = comoArquivo(g);
        return {
          idLocal: g.idLocal,
          arquivo,
          previewUrl: URL.createObjectURL(arquivo),
          tarefaRef: g.tarefaRef,
          legenda: g.legenda ?? '',
          marcador: g.marcador ?? null,
          nota: g.nota ?? '',
        };
      }),
      videos: item.videos.map((g) => {
        const arquivo = comoArquivo(g);
        return {
          idLocal: g.idLocal,
          arquivo,
          previewUrl: URL.createObjectURL(arquivo),
          tarefaRef: g.tarefaRef,
          legenda: g.legenda ?? '',
        };
      }),
    };
  }

  /** Botão "Tentar de novo" de um item que o servidor recusou. */
  async tentarDeNovo(id: string): Promise<void> {
    const item = await this.obter(id);
    if (item) {
      item.estado = 'pendente';
      await bancoLocal.gravar(LOJA_FILA_RDO, item);
    }
    await this.enviarTudo();
  }

  async enviarTudo(): Promise<void> {
    if (this.enviando() || !this.auth.autenticado() || navigator.onLine === false) return;

    this.enviando.set(true);
    try {
      await this.recarregar();
      for (const item of this._itens()) {
        if (item.estado === 'erro') continue;
        const resultado = await this.enviarUm(item);
        if (resultado === 'sem-rede' || resultado === 'sem-login') break;
      }
    } finally {
      this.enviando.set(false);
      await this.recarregar();
    }
  }

  /**
   * Deixa no celular o que o RDO precisa para ser lançado sem internet: o
   * preparo de cada obra (sugestões, catálogo, contratos), a EAP, a lista de
   * RDOs e o cadastro de profissionais. As respostas ficam guardadas pelo
   * `cacheOfflineInterceptor` — aqui só se faz as consultas. Uma vez por
   * obra a cada abertura do app.
   */
  async prepararParaUsoSemInternet(obraIds: string[]): Promise<void> {
    if (navigator.onLine === false) return;

    const novas = obraIds.filter((id) => id && !this.obrasPreparadas.has(id));
    if (!novas.length) return;
    novas.forEach((id) => this.obrasPreparadas.add(id));

    await firstValueFrom(this.armazenamento.ler(CHAVE_EMPREITEIROS)).catch(() => undefined);
    for (const obraId of novas) {
      await firstValueFrom(this.rdoApi.preparar(obraId)).catch(() => undefined);
      await firstValueFrom(this.api.obterEap(obraId)).catch(() => undefined);
      await firstValueFrom(this.rdoApi.listar(obraId, 100)).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------

  private async enviarUm(item: RdoPendenteEnvio): Promise<ResultadoEnvio> {
    const versaoEnviada = item.versao;

    try {
      // A tentativa anterior caiu sem resposta: o RDO pode ter chegado.
      if (!item.existeNoServidor && item.tentativas > 0) {
        if (await firstValueFrom(this.rdoApi.existeNoServidor(item.id))) {
          item.existeNoServidor = true;
          item.arquivosEnviados = [...item.arquivosEnviados, ...item.arquivosNaUltimaTentativa];
        }
      }

      const naoEnviado = (g: ArquivoGuardado) => !item.arquivosEnviados.includes(g.idLocal);
      const aEnviar: RdoPendenteEnvio = { ...item, fotos: item.fotos.filter(naoEnviado), videos: item.videos.filter(naoEnviado) };
      const { fotos, videos } = this.paraFormulario(aEnviar);

      item.tentativas += 1;
      item.arquivosNaUltimaTentativa = [...aEnviar.fotos, ...aEnviar.videos].map((g) => g.idLocal);
      await bancoLocal.gravar(LOJA_FILA_RDO, item);

      try {
        await firstValueFrom(
          item.existeNoServidor
            ? this.rdoApi.atualizar(item.id, item.payload, fotos, videos)
            : this.rdoApi.criar({ ...item.payload, id: item.id, obra_id: item.obraId }, fotos, videos),
        );
      } finally {
        [...fotos, ...videos].forEach((a) => URL.revokeObjectURL(a.previewUrl));
      }

      // Chegou. Se a pessoa salvou de novo enquanto subia, o item fica para
      // mandar só a diferença na próxima volta; senão, sai da fila.
      const atual = await this.obter(item.id);
      if (!atual || atual.versao === versaoEnviada) {
        await bancoLocal.apagar(LOJA_FILA_RDO, item.id);
      } else {
        atual.existeNoServidor = true;
        atual.arquivosEnviados = [...item.arquivosEnviados, ...item.arquivosNaUltimaTentativa];
        atual.arquivosNaUltimaTentativa = [];
        atual.tentativas = 0;
        await bancoLocal.gravar(LOJA_FILA_RDO, atual);
      }

      return 'ok';
    } catch (erro) {
      return this.registrarFalha(item, erro);
    }
  }

  private async registrarFalha(item: RdoPendenteEnvio, erro: unknown): Promise<ResultadoEnvio> {
    let resultado: ResultadoEnvio;

    if (erro instanceof TimeoutError || (erro instanceof HttpErrorResponse && erro.status === 0)) {
      resultado = 'sem-rede';
      item.ultimoErro = 'Sem conexão com o servidor — vai tentar de novo sozinho.';
    } else if (erro instanceof HttpErrorResponse && erro.status === 401) {
      resultado = 'sem-login';
      item.ultimoErro = 'Sessão expirada — entre de novo no app para enviar.';
    } else if (erro instanceof HttpErrorResponse && [403, 404, 413, 422].includes(erro.status)) {
      resultado = 'recusado';
      item.estado = 'erro';
      item.ultimoErro =
        erro.status === 413
          ? 'Fotos/vídeos grandes demais para enviar de uma vez. Abra o RDO e tire algum vídeo.'
          : erro.status === 403
            ? 'Seu usuário não tem permissão para lançar RDO nesta obra.'
            : erro.status === 404 && item.existeNoServidor
              ? 'Este RDO foi excluído no sistema.'
              : mensagemDoServidor(erro);
    } else {
      // Erro inesperado do servidor: continua na fila e tenta de novo depois.
      resultado = 'falhou';
      item.ultimoErro = erro instanceof HttpErrorResponse ? mensagemDoServidor(erro) : 'Falha ao enviar — vai tentar de novo.';
    }

    // Grava sobre a versão mais nova (a pessoa pode ter salvo de novo enquanto subia).
    const atual = (await this.obter(item.id)) ?? item;
    atual.tentativas = item.tentativas;
    atual.arquivosNaUltimaTentativa = item.arquivosNaUltimaTentativa;
    atual.existeNoServidor = item.existeNoServidor;
    atual.arquivosEnviados = item.arquivosEnviados;
    atual.ultimoErro = item.ultimoErro;
    if (atual.versao === item.versao) atual.estado = item.estado;
    await bancoLocal.gravar(LOJA_FILA_RDO, atual).catch(() => undefined);

    return resultado;
  }
}

function mensagemDoServidor(erro: HttpErrorResponse): string {
  const corpo = erro.error as { message?: string; mensagem?: string; errors?: Record<string, string[]> } | null;
  const primeiraDeCampo = corpo?.errors ? Object.values(corpo.errors)[0]?.[0] : undefined;
  return primeiraDeCampo ?? corpo?.mensagem ?? corpo?.message ?? `O servidor recusou o envio (erro ${erro.status}).`;
}
