import { Component, OnDestroy, OnInit, ViewEncapsulation, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { EapPayload, Empreita, Obra, PerfilEmpresa } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { formatarDocumento } from '../../core/utils/documento';
import { formatarData, formatarMoeda } from '../../core/utils/formato';
import { gerarCssEstilos } from '../../shared/contrato-estilo-css';
import {
  VariaveisModelo,
  VariavelHtml,
  VariavelNumerica,
  preencherModeloContrato,
} from '../../shared/contrato-modelo-render';
import {
  CategoriaProposta,
  ConfigProposta,
  LinhaPropostaEap,
  montarTabelaPropostaEap,
  normalizarConfigProposta,
  variaveisPropostaEap,
} from '../../shared/proposta-eap';
import { CHAVE_EMPREITEIROS } from '../cadastros/empreiteiros/empreiteiros';
import { ContratoModelo } from '../configuracoes/contrato-modelos/contrato-modelo.models';
import { ResumoContratoEmpreita } from '../empreita/empreita.models';
import { ChaveTipo, TIPOS_CUSTO } from '../eap/eap.models';
import { EapStore } from '../eap/eap.store';

/**
 * Versão "para imprimir" do contrato de uma Empreita ou de uma Obra/
 * proposta (28/09/2026, itens 8/9) — usada só pelo PDF gerado no backend
 * (`ContratoPdfController`, via Browsershot). Mesmo mecanismo das outras
 * telas (ver docs/GERAR-PDF.md), com uma diferença: É ESTA TELA que busca
 * o modelo escolhido e os dados, e substitui as variáveis
 * (`preencherModeloContrato`) — o backend só orquestra o Chromium.
 *
 * `tipo` vem do `data` da rota (`app.routes.ts`): 'empreita' exige
 * `empreitaId`; 'obra' usa só `obraId` (`:id`, herdado da rota avó).
 */
@Component({
  selector: 'app-contrato-imprimir',
  templateUrl: './contrato-imprimir.html',
  styleUrl: './contrato-imprimir.scss',
  // Só a proposta lê a EAP (tabela em `{{tabela_eap}}`) — contrato de
  // empreita/obra nunca chama `carregar()` nele.
  providers: [EapStore],
  // O Angular só anexa o atributo `_ngcontent-*` (que o CSS com escopo do
  // componente depende pra casar os seletores) em elementos que ELE MESMO
  // compilou do template — conteúdo inserido via `[innerHTML]` fica de
  // fora, então NADA do `.corpo-contrato` em `contrato-imprimir.scss`
  // (títulos, citação, lista de cláusulas, colunas…) estava realmente
  // sendo aplicado (só coincidia, por acaso, com o padrão do navegador
  // pra `h2`/`ul`/negrito — ficou óbvio só na lista de cláusulas, que
  // depende 100% do CSS custom). `None` é seguro aqui: esta tela só
  // existe pra virar PDF via Browsershot, nunca é composta com o resto
  // do app (29/09/2026).
  encapsulation: ViewEncapsulation.None,
})
export class ContratoImprimir implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  readonly obraId = input.required<string>({ alias: 'id' });
  readonly empreitaId = input<string>('');
  readonly tipo = input.required<'empreita' | 'obra' | 'proposta'>();

  private readonly eap = inject(EapStore);

  /**
   * Proposta (14/10/2026): o corpo só fica pronto quando o modelo/dados
   * (`contextoProposta`) E a EAP (`EapStore`, carregada à parte) chegaram —
   * por isso um `effect`, não um `forkJoin`: a EAP vive num store de
   * signals, não num Observable.
   */
  private readonly contextoProposta = signal<{
    modelo: ContratoModelo;
    variaveis: VariaveisModelo;
    config: ConfigProposta;
  } | null>(null);

  private readonly montarProposta = effect(() => {
    const contexto = this.contextoProposta();
    if (!contexto || this.eap.carregando()) return;

    const erroEap = this.eap.erro();
    const cache = this.eap.cache();

    // Colunas de valor = as categorias marcadas na EAP (14/10/2026, pedido do
    // Lucas: "a tabela deve aparecer as mesmas categorias marcadas") — o
    // estado da tela da EAP (`ui`) é gravado junto com ela.
    const categorias: CategoriaProposta[] = this.eap.mostrarColunasTipo()
      ? this.eap.tiposVisiveis().map((t) => ({ chave: t.chave, rotulo: t.rotulo }))
      : [];
    const totalPorCategoria: Partial<Record<ChaveTipo, number>> = {};
    for (const tipo of TIPOS_CUSTO) {
      totalPorCategoria[tipo.chave] = (cache.totalsDirectByType[tipo.chave] ?? 0) + (cache.totalsBdiByType[tipo.chave] ?? 0);
    }

    const tabela = erroEap
      ? '<p><em>Não foi possível carregar a EAP desta obra.</em></p>'
      : contexto.config.incluir_tabela
        ? montarTabelaPropostaEap(this.linhasDaEap(), contexto.config, categorias, {
            porCategoria: totalPorCategoria,
            total: cache.totalsWithBdi,
          })
        : '';

    // Totais/BDI por categoria (14/10/2026) — numéricos, entram em fórmula `{{=...}}`.
    const variaveis: VariaveisModelo = { ...contexto.variaveis, ...(erroEap ? {} : variaveisPropostaEap(cache)) };
    const corpo = preencherModeloContrato(contexto.modelo.conteudo, variaveis);

    // O editor grava a tabela como um parágrafo só com o marcador
    // (`<p>{{tabela_eap}}</p>`) — o parágrafo INTEIRO vira a tabela: tabela
    // dentro de `<p>` não é HTML válido, o navegador fecharia o `<p>` e
    // sobraria um parágrafo vazio a mais (com margem) que o editor não mostra.
    const marcador = () => /<p\b[^>]*>\s*\{\{\s*tabela_eap\s*\}\}\s*<\/p>|\{\{\s*tabela_eap\s*\}\}/g;
    const html = marcador().test(corpo)
      ? corpo.replace(marcador(), () => tabela)
      : corpo + tabela; // modelo sem `{{tabela_eap}}`: a tabela vai no fim do documento

    this.conteudoPreenchido.set(this.sanitizer.bypassSecurityTrustHtml(html));
    this.carregando.set(false);
  });

  /** Uma linha por item da EAP (aberta), com valores JÁ com BDI — o que o cliente vê numa proposta — no total e por categoria. */
  private linhasDaEap(): LinhaPropostaEap[] {
    const itens = this.eap.itens();
    const cache = this.eap.cache();

    return itens.map((item, i) => {
      const grupo = item.isGroup ? this.eap.totaisDoGrupo(i) : null;
      const qtde = Number(item.qtde) || 0;
      const total = grupo ? grupo.totalWithBdi : (cache.totalWithBdi[i] ?? 0);

      const unitarioPorCategoria: Partial<Record<ChaveTipo, number>> = {};
      const totalPorCategoria: Partial<Record<ChaveTipo, number>> = {};
      for (const tipo of TIPOS_CUSTO) {
        const direto = grupo ? grupo.directByType[tipo.chave] : cache.directByType[i]?.[tipo.chave];
        const bdi = grupo ? grupo.bdiByType[tipo.chave] : cache.bdiByType[i]?.[tipo.chave];
        const totalTipo = (direto ?? 0) + (bdi ?? 0);
        totalPorCategoria[tipo.chave] = totalTipo;
        if (!grupo && qtde > 0) unitarioPorCategoria[tipo.chave] = totalTipo / qtde;
      }

      return {
        nivel: item.nivel,
        isGroup: item.isGroup,
        eap: item.eap,
        desc: item.desc,
        qtde,
        unid: item.unid ?? '',
        unitarioPorCategoria,
        totalPorCategoria,
        unitario: !grupo && qtde > 0 ? total / qtde : 0,
        total,
      };
    });
  }

  protected readonly geradoEm = new Date().toISOString();
  protected readonly perfilEmpresa = signal<PerfilEmpresa | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);

  /**
   * CSS de todos os estilos da empresa (30/09/2026) — MESMA função
   * (`gerarCssEstilos`) que o editor usa, garantindo que o PDF sai
   * formatado exatamente igual ao que foi editado (a peça que resolve
   * "se eu alterar o formato do título 1 o texto não atualiza": o estilo
   * é um vínculo por classe, não mais uma cópia de valores).
   *
   * `<style>` criada via DOM puro, NÃO declarada no template — o
   * compilador do Angular trata qualquer `<style>` literal no HTML de um
   * componente de forma especial (extrai o conteúdo em tempo de
   * compilação pro `<head>`, junto com o CSS normal do componente), então
   * uma tag dessas no template nunca chega a existir como nó de DOM de
   * verdade pra atualizar depois — bug real achado testando (o CSS gerado
   * nunca era aplicado, apesar do `[textContent]` parecer certo).
   */
  private readonly folhaEstilos = document.createElement('style');

  /**
   * HTML do modelo já com as variáveis substituídas (29/09/2026: o editor
   * virou rico/visual — `conteudo` já vem como HTML de verdade, com
   * `<p>`/`<h2>`/`<ul>` etc. do `contenteditable`, não mais texto puro
   * pra dividir em parágrafos). Renderizado via `[innerHTML]` no template —
   * confiável porque só quem edita modelos (usuário logado da empresa)
   * escreve esse HTML, e cada VALOR de variável é escapado em
   * `preencherModeloContrato` antes de entrar nele.
   *
   * `bypassSecurityTrustHtml`: o sanitizador padrão do Angular remove o
   * atributo `style` de conteúdo passado a `[innerHTML]` — sem isso, os
   * botões de alinhamento (centralizar/direita/justificado) do editor
   * ficavam sem efeito nenhum no PDF (achado testando o PDF de verdade,
   * 29/09/2026).
   */
  protected readonly conteudoPreenchido = signal<SafeHtml>(this.sanitizer.bypassSecurityTrustHtml(''));

  /**
   * Papel timbrado como FUNDO DE PÁGINA, sempre centralizado (30/09/2026,
   * redesenho — pedido do Lucas: "tire a opção de papel timbrado em
   * faixa no topo, coloque a opção de centralizar a imagem na folha e
   * coloque uma opção de aplicar transparência... e redimensionar o
   * tamanho da imagem (mantendo ou não a proporção)"). A imagem em si é
   * única por empresa (`perfilEmpresa().papelTimbradoUrl`); tamanho/
   * opacidade vêm do MODELO. `position: fixed` repete sozinho em toda
   * página impressa no Chromium (mesmo truque já usado noutros PDFs do
   * sistema pra marca d'água/fundo repetido).
   */
  protected readonly modeloAtual = signal<ContratoModelo | null>(null);

  protected readonly timbradoFundoUrl = computed(() => {
    const url = this.perfilEmpresa()?.papelTimbradoUrl;
    return url ? this.api.baseStorage() + url : null;
  });

  /** `X% auto` mantém a proporção natural da imagem (o próprio CSS calcula a altura); sem manter, os dois eixos vêm explícitos (pode esticar/achatar). */
  protected readonly timbradoFundoTamanho = computed(() => {
    const modelo = this.modeloAtual();
    const largura = modelo?.timbrado_largura_pct ?? 100;
    if (modelo?.timbrado_manter_proporcao ?? true) return `${largura}% auto`;
    return `${largura}% ${modelo?.timbrado_altura_pct ?? largura}%`;
  });

  protected readonly timbradoFundoOpacidade = computed(() => (this.modeloAtual()?.timbrado_opacidade ?? 100) / 100);

  constructor() {
    // Ver AuthService.definirTokenParaImpressao / ApiService.definirBaseParaImpressao
    // — precisa acontecer antes de qualquer chamada à API.
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.auth.definirTokenParaImpressao(token);

    const apiUrl = this.route.snapshot.queryParamMap.get('apiUrl');
    if (apiUrl) this.api.definirBaseParaImpressao(apiUrl);
  }

  ngOnInit(): void {
    document.head.appendChild(this.folhaEstilos);

    const modeloId = this.route.snapshot.queryParamMap.get('modeloId') ?? '';

    if (this.tipo() === 'empreita') {
      this.carregarEmpreita(modeloId);
    } else if (this.tipo() === 'proposta') {
      this.carregarProposta(modeloId);
    } else {
      this.carregarObra(modeloId);
    }
  }

  private carregarProposta(modeloId: string): void {
    forkJoin({
      perfil: this.api.obterPerfilEmpresa(),
      obra: this.api.obterObra(this.obraId()),
      clientes: this.lerCadastro('controleObra.clientes.v1'),
      modelos: this.api.listarContratoModelos('proposta'),
      estilos: this.api.listarContratoEstilos(),
    }).subscribe({
      next: ({ perfil, obra, clientes, modelos, estilos }) => {
        this.perfilEmpresa.set(perfil);
        this.folhaEstilos.textContent = gerarCssEstilos(estilos);

        const modelo = modelos.find((m) => m.id === modeloId);
        if (!modelo) {
          this.erro.set('Modelo de proposta não encontrado.');
          this.carregando.set(false);
          return;
        }

        const variaveis = this.variaveisComuns(obra);
        variaveis['responsavel'] = String(obra.responsavel ?? '');
        Object.assign(variaveis, this.variaveisPessoa('cliente', obra.cliente, clientes));

        // Ajuste desta geração (`?config=` JSON, vindo do modal "Gerar
        // proposta") sobrepõe o padrão do modelo; sem ele vale o do modelo.
        let bruto: unknown = modelo.config_proposta;
        const ajuste = this.route.snapshot.queryParamMap.get('config');
        if (ajuste) {
          try {
            bruto = JSON.parse(ajuste);
          } catch {
            /* config ilegível: fica o padrão do modelo */
          }
        }

        this.modeloAtual.set(modelo);
        // Estilos PRÓPRIOS do modelo (15/10/2026); modelo antigo ainda sem cópia usa os da empresa.
        this.folhaEstilos.textContent = gerarCssEstilos(modelo.estilos?.length ? modelo.estilos : estilos);
        this.eap.carregar(this.obraId());
        this.contextoProposta.set({ modelo, variaveis, config: normalizarConfigProposta(bruto) });
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados da proposta.');
        this.carregando.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.folhaEstilos.remove();
  }

  private carregarEmpreita(modeloId: string): void {
    forkJoin({
      perfil: this.api.obterPerfilEmpresa(),
      obra: this.api.obterObra(this.obraId()),
      empreita: this.api.obterEmpreita(this.empreitaId()),
      resumo: this.api.obterResumoContratoEmpreitas(this.obraId()),
      // Precisa do "adicional" de cada etapa (15/10/2026) pras listas de serviços previstos x adicionais.
      eap: this.api.obterEap(this.obraId()),
      clientes: this.lerCadastro('controleObra.clientes.v1'),
      empreiteiros: this.lerCadastro(CHAVE_EMPREITEIROS),
      modelos: this.api.listarContratoModelos('empreita'),
      estilos: this.api.listarContratoEstilos(),
    }).subscribe({
      next: ({ perfil, obra, empreita, resumo, eap, clientes, empreiteiros, modelos, estilos }) => {
        this.perfilEmpresa.set(perfil);
        this.folhaEstilos.textContent = gerarCssEstilos(estilos);

        const modelo = modelos.find((m) => m.id === modeloId);
        if (!modelo) {
          this.erro.set('Modelo de contrato não encontrado.');
          this.carregando.set(false);
          return;
        }

        const valor = this.valorContratoEmpreita(empreita.id, resumo);
        const variaveis = this.variaveisComuns(obra);
        variaveis['empreiteiro'] = String(empreita['empreiteiro'] ?? '');
        variaveis['descricao_empreita'] = String(empreita['descricao_empreita'] ?? '');
        variaveis['numero_empreita'] = String(empreita['numero_empreita'] ?? '');
        // Numérica (14/10/2026): aparece igual (R$ …) e entra em fórmula — `{{=TEXTO(valor)}}` é o valor por extenso.
        variaveis['valor'] = { numero: valor, formato: 'moeda' };
        Object.assign(variaveis, this.variaveisServicosEmpreita(empreita, eap));
        Object.assign(
          variaveis,
          this.variaveisPessoa('cliente', obra.cliente, clientes),
          this.variaveisPessoa('empreiteiro', empreita['empreiteiro'], empreiteiros),
        );
        // `AAAA-MM-DD` (sem hora) → dd/mm/aaaa; vazio quando a empreita não tem previsão.
        variaveis['previsao_conclusao'] = formatarData(String(empreita['previsao_conclusao'] ?? '').slice(0, 10));

        this.modeloAtual.set(modelo);
        // Estilos PRÓPRIOS do modelo (15/10/2026); modelo antigo ainda sem cópia usa os da empresa.
        this.folhaEstilos.textContent = gerarCssEstilos(modelo.estilos?.length ? modelo.estilos : estilos);
        this.conteudoPreenchido.set(
          this.sanitizer.bypassSecurityTrustHtml(preencherModeloContrato(modelo.conteudo, variaveis)),
        );
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados do contrato.');
        this.carregando.set(false);
      },
    });
  }

  private carregarObra(modeloId: string): void {
    forkJoin({
      perfil: this.api.obterPerfilEmpresa(),
      obra: this.api.obterObra(this.obraId()),
      clientes: this.lerCadastro('controleObra.clientes.v1'),
      modelos: this.api.listarContratoModelos('obra'),
      estilos: this.api.listarContratoEstilos(),
    }).subscribe({
      next: ({ perfil, obra, clientes, modelos, estilos }) => {
        this.perfilEmpresa.set(perfil);
        this.folhaEstilos.textContent = gerarCssEstilos(estilos);

        const modelo = modelos.find((m) => m.id === modeloId);
        if (!modelo) {
          this.erro.set('Modelo de contrato não encontrado.');
          this.carregando.set(false);
          return;
        }

        const variaveis = this.variaveisComuns(obra);
        variaveis['responsavel'] = String(obra.responsavel ?? '');
        variaveis['local_obra'] = String(obra.local_obra ?? '');
        Object.assign(variaveis, this.variaveisPessoa('cliente', obra.cliente, clientes));

        this.modeloAtual.set(modelo);
        // Estilos PRÓPRIOS do modelo (15/10/2026); modelo antigo ainda sem cópia usa os da empresa.
        this.folhaEstilos.textContent = gerarCssEstilos(modelo.estilos?.length ? modelo.estilos : estilos);
        this.conteudoPreenchido.set(
          this.sanitizer.bypassSecurityTrustHtml(preencherModeloContrato(modelo.conteudo, variaveis)),
        );
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Não foi possível carregar os dados do contrato.');
        this.carregando.set(false);
      },
    });
  }

  // ---- Cliente e empreiteiro (15/10/2026, pedido do Lucas) -----------------
  // Tipo (pessoa física/jurídica), CPF/CNPJ e endereço vêm dos CADASTROS, que
  // ainda moram na ponte chave-valor (`/api/storage`, ver `CadastroStore`) e
  // se ligam à obra/empreita só pelo NOME (`Obra.cliente`, `Empreita.
  // empreiteiro` são texto). Por isso o casamento é por nome, sem diferenciar
  // maiúscula/acento; sem cadastro com esse nome, as três variáveis saem vazias.

  /** Lista de um cadastro; falha de leitura vira lista vazia (o contrato sai, só sem esses dados). */
  private lerCadastro(chave: string): Observable<Array<Record<string, unknown>>> {
    return this.api.lerChave(chave).pipe(
      map(({ value }) => {
        try {
          const dados: unknown = value ? JSON.parse(value) : [];
          return Array.isArray(dados) ? (dados as Array<Record<string, unknown>>) : [];
        } catch {
          return [];
        }
      }),
      catchError(() => of([] as Array<Record<string, unknown>>)),
    );
  }

  private nomeParaComparar(nome: unknown): string {
    return String(nome ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private variaveisPessoa(papel: 'cliente' | 'empreiteiro', nome: unknown, cadastro: Array<Record<string, unknown>>): VariaveisModelo {
    const alvo = this.nomeParaComparar(nome);
    const registro = alvo ? cadastro.find((r) => this.nomeParaComparar(r['nome']) === alvo) : undefined;
    const tipo = String(registro?.['tipo'] ?? '').toUpperCase();

    return {
      [`tipo_${papel}`]: registro ? (tipo === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física') : '',
      [`cpf_cnpj_${papel}`]: registro ? formatarDocumento(registro['documento']) : '',
      [`endereco_${papel}`]: String(registro?.['endereco'] ?? ''),
    };
  }

  /**
   * Serviços da empreita separados em PREVISTOS x ADICIONAIS (15/10/2026,
   * pedido do Lucas: "listar somente os itens que não são adicionais, ou
   * somente os adicionais... e obter o total dos itens filtrados" — dá pra
   * escrever o contrato do empreiteiro e também um aditivo). "Adicional" é a
   * marca da etapa da EAP (`ItemEap.adicional`); serviço sem etapa vinculada
   * conta como adicional, igual à mensagem de solicitação de pagamento
   * ("Serviços não previstos"). Valor do serviço = Empreiteiro + Reserva, a
   * mesma conta da variável `valor` — a soma dos três totais fecha com ela.
   */
  private variaveisServicosEmpreita(empreita: Empreita, eap: EapPayload): VariaveisModelo {
    const adicionalPorEtapa = new Map<string, boolean>();
    for (const item of (eap.eapItems ?? []) as Array<Record<string, unknown>>) {
      adicionalPorEtapa.set(String(item['id']), item['adicional'] === true);
    }

    const itens = (Array.isArray(empreita['itens']) ? empreita['itens'] : []) as Array<Record<string, unknown>>;
    const servicos = itens.map((item) => {
      const etapa = item['eap_item_id'] ? String(item['eap_item_id']) : '';
      return {
        desc: String(item['descricao'] ?? '').trim(),
        valor: (Number(item['contrato_emp']) || 0) + (Number(item['contrato_reserva']) || 0),
        adicional: etapa ? (adicionalPorEtapa.get(etapa) ?? false) : true,
      };
    });

    const escapar = (texto: string) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lista = (linhas: typeof servicos, rotulo: string): VariavelHtml => ({
      html: linhas.map((s, i) => `${rotulo} ${i + 1} | ${escapar(s.desc || '—')} | ${formatarMoeda(s.valor)}`).join('<br>'),
    });
    const total = (linhas: typeof servicos): VariavelNumerica => ({
      numero: linhas.reduce((soma, s) => soma + s.valor, 0),
      formato: 'moeda',
    });

    const previstos = servicos.filter((s) => !s.adicional);
    const adicionais = servicos.filter((s) => s.adicional);

    return {
      servicos_previstos: lista(previstos, 'Serviço'),
      servicos_adicionais: lista(adicionais, 'Aditivo'),
      servicos_todos: lista(servicos, 'Serviço'),
      total_servicos_previstos: total(previstos),
      total_servicos_adicionais: total(adicionais),
      total_servicos: total(servicos),
    };
  }

  /** Soma Empreiteiro + Reserva de todos os itens desta empreita, no mesmo `resumo` já usado pela aba/lista de Empreitas. */
  private valorContratoEmpreita(empreitaId: string, resumo: ResumoContratoEmpreita[]): number {
    const linha = resumo.find((r) => r.id === empreitaId);
    if (!linha) return 0;
    return linha.itens.reduce((soma, item) => soma + (item.contratoEmp || 0) + (item.contratoReserva || 0), 0);
  }

  /**
   * 30/09/2026: ganhou os campos que faltavam (`numero_contrato`,
   * `local_obra`, `periodo`, `prazo_meses`, `data_base`,
   * `responsavel_tecnico`, `crea`, `art`, `empresa_endereco`,
   * `empresa_telefone`, `empresa_email`, `empresa_inscricao_estadual`) —
   * a lista de variáveis DISPONÍVEIS no editor (`VARIAVEIS_POR_OBJETO`) já
   * tinha esses campos desde 29/09, mas essa função (que de fato SUBSTITUI
   * os valores no corpo do contrato) tinha ficado pra trás: usar essas
   * variáveis no corpo aparecia como `{{numero_contrato}}` literal no
   * PDF em vez do valor de verdade. Espelha
   * `ContratoPdfController::variaveisComuns` (PHP, usada só no cabeçalho/
   * rodapé) — mantidas em sincronia manualmente, cada uma resolve num
   * contexto diferente (TS aqui no corpo; PHP lá no cabeçalho/rodapé,
   * fora do DOM da página).
   */
  private variaveisComuns(obra: Obra): VariaveisModelo {
    const perfil = this.perfilEmpresa();
    return {
      empresa_nome: perfil?.razaoSocial || perfil?.nome || '',
      empresa_cnpj: perfil?.cnpj || '',
      empresa_endereco: perfil?.endereco || '',
      empresa_telefone: perfil?.telefone || '',
      empresa_email: perfil?.emailContato || '',
      empresa_inscricao_estadual: perfil?.inscricaoEstadual || '',
      obra_nome: obra.obra_nome || '',
      numero_contrato: obra.numero_contrato || '',
      local_obra: obra.local_obra || '',
      periodo: obra.periodo || '',
      // numérico quando preenchido — também entra em fórmula (14/10/2026)
      prazo_meses:
        obra.prazo_meses !== null && obra.prazo_meses !== undefined && Number.isFinite(Number(obra.prazo_meses))
          ? { numero: Number(obra.prazo_meses), formato: 'numero' }
          : '',
      data_base: obra.data_base ? formatarData(obra.data_base) : '',
      responsavel_tecnico: obra.responsavel_tecnico || '',
      crea: obra.crea || '',
      art: obra.art || '',
      cliente: obra.cliente || '',
      data: formatarData(this.geradoEm),
    };
  }
}
