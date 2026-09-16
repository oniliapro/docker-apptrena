/**
 * Tipos do domínio, espelhando as tabelas/validações do laravel-backend.
 * Fonte: laravel-backend/app/Http/Controllers/Api/*.php e as migrations em
 * laravel-backend/database/migrations/.
 */

/**
 * Categorias de custo fixas — seeder TiposCustoSeeder (`database/seeders/
 * TiposCustoSeeder.php`). As chaves aqui tinham nomes curtos (`mao`,
 * `equip`, `admin`) que não batiam com o seeder real — corrigido em
 * 28/07/2026 pra usar as mesmas chaves de `ChaveTipo` em
 * `features/eap/eap.models.ts`, que é o que o backend de fato grava e
 * devolve.
 */
export type ChaveTipoCusto = 'material' | 'maoDeObra' | 'equipamento' | 'outros' | 'administracao';

export const TIPOS_CUSTO: ReadonlyArray<{ chave: ChaveTipoCusto; rotulo: string }> = [
  { chave: 'material', rotulo: 'Material' },
  { chave: 'maoDeObra', rotulo: 'Mão de obra' },
  { chave: 'equipamento', rotulo: 'Equipamento' },
  { chave: 'outros', rotulo: 'Outros' },
  { chave: 'administracao', rotulo: 'Administração' },
];

/** Onde o BDI é aplicado — coluna obras.bdi_scope. */
export type EscopoBdi = 'global' | 'category' | 'item';
/** Se o BDI é percentual ou valor absoluto — coluna obras.bdi_mode. */
export type ModoBdi = 'pct' | 'value';

/**
 * Status comercial/operacional da obra — coluna obras.status (03/08/2026).
 * Independente de `is_confirmed`, que é só sobre a EAP/orçamento estar
 * travado — uma obra pode estar "em andamento" com a EAP ainda aberta,
 * ou com a EAP confirmada e a obra nem ter começado.
 */
export type ChaveStatusObra =
  | 'orcamento'
  | 'proposta_enviada'
  | 'cancelada'
  | 'a_iniciar'
  | 'em_andamento'
  | 'finalizada';

export const STATUS_OBRA: ReadonlyArray<{ chave: ChaveStatusObra; rotulo: string }> = [
  { chave: 'orcamento', rotulo: 'Orçamento' },
  { chave: 'proposta_enviada', rotulo: 'Proposta enviada' },
  { chave: 'cancelada', rotulo: 'Cancelada' },
  { chave: 'a_iniciar', rotulo: 'A iniciar' },
  { chave: 'em_andamento', rotulo: 'Em andamento' },
  { chave: 'finalizada', rotulo: 'Finalizada' },
];

export function rotuloStatusObra(chave: string | null | undefined): string {
  return STATUS_OBRA.find((s) => s.chave === chave)?.rotulo ?? '—';
}

export interface Obra {
  id: string;
  map_number?: string | null;
  obra_nome?: string | null;
  cliente?: string | null;
  data_base?: string | null;
  /** Prazo da obra em meses (24/08/2026) — usado pelo Cronograma de Desembolso pra limitar até quando gerar períodos. */
  prazo_meses?: number | null;
  responsavel?: string | null;
  local_obra?: string | null;
  periodo?: string | null;
  obs?: string | null;
  bdi_scope?: EscopoBdi | null;
  bdi_mode?: ModoBdi | null;
  bdi_percent?: number | null;
  bdi_value?: number | null;
  is_confirmed?: boolean | null;
  confirmed_at?: string | null;
  status?: ChaveStatusObra | null;
}

/** Payload de criação/edição — o `id` é gerado pelo backend. */
export type ObraPayload = Omit<Obra, 'id'>;

/**
 * Formato { header, ui, eapItems } devolvido por GET /api/obras/{id}/eap.
 * É o mesmo dialeto que o app vanilla grava em controleObra.eap.v2
 * (ver js/eap/02-state-utils.js), o que permite migrar tela a tela.
 */
export interface EapPayload {
  header: Record<string, unknown>;
  ui: Record<string, unknown>;
  eapItems: EapItem[];
}

/**
 * Item da EAP como `ObraController::showEap()`/`syncEap()` realmente
 * devolvem e esperam — mesmos nomes de campo que `ItemEap` (em
 * `features/eap/eap.models.ts`), porque o backend foi desenhado pra
 * aceitar exatamente o payload que a tela já produzia com a ponte
 * chave-valor.
 */
export interface EapItem {
  id?: string;
  isGroup: boolean;
  /** Nível hierárquico (1-4) escolhido pelo usuário — ver `ItemEap.nivel`. */
  nivel?: number;
  /** Serviço adicional (fora do escopo original), marcado em cascata — ver `ItemEap.adicional`. */
  adicional?: boolean;
  eap: string;
  desc: string;
  qtde: number;
  unid: string;
  unit: Partial<Record<ChaveTipoCusto, number>>;
  bdiMode?: ModoBdi;
  bdiPercent?: number;
  bdiValue?: number;
  /** Snapshot do Orçado por categoria, gravado na confirmação — ver `ItemEap.orcadoCongelado`. */
  orcadoCongelado?: Partial<Record<ChaveTipoCusto, number>> | null;
  [extra: string]: unknown;
}

/**
 * Resumo de uma medição — devolvido por `GET obras/{id}/medicoes` (lista,
 * sem os itens) e como o "topo" do payload de `GET/PUT medicoes/{id}` e
 * `POST medicoes/{id}/aprovar` (23/08/2026, ver `MedicaoController`).
 */
export interface MedicaoResumo {
  id: string;
  obraId: string;
  sequencia: number;
  dataMedicao: string | null;
  status: 'rascunho' | 'aprovada';
  aprovadoEm: string | null;
}

export interface ValorMedicaoItemTipo {
  valor: number;
  manual: boolean;
}

export interface MedicaoItemPayload {
  eapItemId: string;
  ordem: number;
  valores: Partial<Record<ChaveTipoCusto, ValorMedicaoItemTipo>>;
}

/** Payload completo — `GET medicoes/{id}` e resposta de `PUT`/`aprovar`. */
export interface MedicaoPayload extends MedicaoResumo {
  itens: MedicaoItemPayload[];
  /** Valores da última medição aprovada anterior — chave é o `eapItemId`. */
  acumuladoAnterior: Record<string, Partial<Record<ChaveTipoCusto, number>>>;
}

/** Corpo de `PUT medicoes/{id}` e `POST medicoes/{id}/aprovar`. */
export interface MedicaoSalvarPayload {
  itens: Array<{
    eapItemId: string;
    valores: Partial<Record<ChaveTipoCusto, { valor: number; manual: boolean }>>;
  }>;
}

/** Valor planejado de desembolso, discriminado por categoria — Cronograma de Desembolso (24/08/2026). */
export interface PlanejamentoCronograma {
  eapItemId: string;
  /** Data de início do período em que foi planejado (ISO "AAAA-MM-DD"). */
  periodoInicio: string;
  tipo: ChaveTipoCusto;
  valor: number;
}

export interface Mapa {
  id: string;
  [campo: string]: unknown;
}

export interface Empreita {
  id: string;
  [campo: string]: unknown;
}

export interface Pagamento {
  id: string;
  [campo: string]: unknown;
}

export interface Recebimento {
  id: string;
  [campo: string]: unknown;
}

export interface FotoDiario {
  id?: string;
  url: string;
  /** Croqui (16/09/2026, item 9) — marcação opcional de local na foto: coordenadas relativas (0 a 1). */
  marcador_x?: number | null;
  marcador_y?: number | null;
  marcador_nota?: string | null;
}

/** 'rascunho' (editável, ainda sem assinatura) | 'finalizado' (assinado automaticamente por quem finalizou). */
export type StatusRegistroDiario = 'rascunho' | 'finalizado';

export interface DiarioResponsavelPresente {
  id?: string;
  registro_id?: string;
  nome: string;
  empresa?: string | null;
  funcao?: string | null;
  /** Referência ao contrato/empreita, pra amarrar quem estava presente ao vínculo contratual (item A da especificação). */
  contrato_referencia?: string | null;
  presente?: boolean;
}

/** Cadastro simples da empresa (08/09/2026) — reutilizado entre obras e lançamentos. GET/POST /equipamentos-catalogo. */
export interface EquipamentoCatalogoItem {
  id: string;
  nome: string;
  tipo?: string | null;
}

export interface DiarioEquipamentoUso {
  id?: string;
  registro_id?: string;
  equipamento_id: string;
  quantidade?: number;
  /** Presente quando o backend faz eager-load (`equipamentosUso.equipamento`). */
  equipamento?: EquipamentoCatalogoItem | null;
}

export type TipoOcorrenciaDiario = 'nao_conformidade' | 'mudanca_projeto' | 'interferencia' | 'interrupcao';

export const TIPOS_OCORRENCIA_DIARIO: ReadonlyArray<{ chave: TipoOcorrenciaDiario; rotulo: string }> = [
  { chave: 'nao_conformidade', rotulo: 'Não conformidade' },
  { chave: 'mudanca_projeto', rotulo: 'Mudança de projeto' },
  { chave: 'interferencia', rotulo: 'Interferência' },
  { chave: 'interrupcao', rotulo: 'Interrupção' },
];

export interface DiarioOcorrencia {
  id?: string;
  registro_id?: string;
  tipo: TipoOcorrenciaDiario;
  descricao: string;
  responsavel?: string | null;
  motivo?: string | null;
  danos_materiais?: string | null;
}

/**
* Item do checklist de etapas de um registro (16/09/2026, item 6/16 dos
* pedidos de ajuste). Sem enum fixo: `nome` é texto livre, selecionado/
* editado pelo usuário — o front-end só sugere a partir das etapas ainda
* não concluídas do lançamento anterior (`obterUltimasEtapas`).
*/
export interface DiarioEtapa {
  id?: string;
  registro_id?: string;
  nome: string;
  concluida?: boolean;
}

export type StatusPendenciaDiario = 'aberta' | 'concluida';

export interface DiarioPendencia {
  id?: string;
  registro_id?: string;
  descricao: string;
  responsavel?: string | null;
  /** ISO "AAAA-MM-DD". */
  prazo?: string | null;
  status?: StatusPendenciaDiario;
}

/**
 * Observação da contratada sobre o lançamento — por padrão NÃO visível
 * ao contratante da obra (`visivel_contratante = false`). Ver
 * `DiarioComentarioInterno` no backend.
 */
export interface DiarioComentarioInterno {
  id?: string;
  registro_id?: string;
  autor_user_id?: number | string | null;
  texto: string;
  visivel_contratante?: boolean;
  created_at?: string;
}

export interface RegistroDiario {
  id: string;
  obra_id?: string | null;
  data?: string | null;
  clima?: string | null;
  autor?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  impacto_cronograma?: string | null;
  quantidade_operarios?: number | null;
  status?: StatusRegistroDiario;
  assinado_em?: string | null;
  assinado_por_user_id?: number | string | null;
  /** Presente quando o backend faz eager-load (`assinadoPor:id,name`). */
  assinadoPor?: { id: number | string; name?: string } | null;
  fotos?: FotoDiario[];
  responsaveisPresentes?: DiarioResponsavelPresente[];
  equipamentosUso?: DiarioEquipamentoUso[];
  ocorrencias?: DiarioOcorrencia[];
  pendencias?: DiarioPendencia[];
  comentariosInternos?: DiarioComentarioInterno[];
  etapas?: DiarioEtapa[];
  /** Presente quando o backend faz eager-load da obra (usado no dashboard). */
  obra?: { obra_nome?: string | null } | null;
}

/**
 * Link de acesso somente-leitura do contratante da obra (cliente final)
 * ao Diário — sem login, autorizado só pelo token (08/09/2026). Quem
 * gera/revoga é sempre alguém do lado da contratada — ver
 * `ObraContratanteLinkController`.
 */
export interface ObraContratanteLink {
  id: string;
  obra_id: string;
  token: string;
  nome_contato?: string | null;
  telefone_whatsapp?: string | null;
  /** Quem recebe o aviso de novo diário (16/09/2026, item 12: canal trocado de WhatsApp para e-mail). */
  email?: string | null;
  expira_em?: string | null;
  revogado_em?: string | null;
  criado_por_user_id?: number | string | null;
  created_at?: string;
}

// ---------------- Acesso público do contratante (sem login) ----------------
/** GET /publico/diario/{token} — dados da obra + datas com lançamento finalizado (calendário). */
export interface PublicoObraResumo {
  obra: { nome?: string | null; cliente?: string | null; local?: string | null };
  datas_com_lancamento: string[];
}

/** GET /publico/diario/{token}/dia/{data} — um item da lista do dia. */
export interface PublicoLancamentoResumo {
  id: string;
  data: string;
  titulo?: string | null;
  clima?: string | null;
  assinado_em?: string | null;
  assinado_por_user_id?: number | string | null;
  assinadoPor?: { id: number | string; name?: string } | null;
  created_at?: string;
}

/** GET /publico/diario/{token}/lancamento/{registroId} — detalhe completo, só o que é permitido ao contratante ver. */
export interface PublicoLancamentoDetalhe {
  registro: RegistroDiario;
  comentarios: Array<{ id: string; texto: string; created_at?: string }>;
}

/** Resposta de POST /api/login — token Sanctum. */
export interface RespostaLogin {
  token: string;
  user: UsuarioAutenticado;
}

export interface UsuarioAutenticado {
  id: number | string;
  name?: string;
  email?: string;
  empresa_id?: number | string | null;
  /** 'admin' (dono da empresa) ou 'secundario' — ver "Controle de permissões" (31/08/2026). */
  papel?: string;
  /** Só é relevante pra papel 'secundario' — ver PermissoesService. */
  podeGerenciarPermissoes?: boolean;

  /**
   * Vem em dois formatos, dependendo do endpoint:
   *
   *  - `POST /login` e `POST /registrar` devolvem só o **nome** da
   *    empresa, como texto;
   *  - `GET /me` devolve o **objeto completo**, com os dados de
   *    assinatura.
   *
   * O dashboard usa o segundo. Use `dadosDaEmpresa()` para ler com
   * segurança em qualquer um dos casos.
   */
  empresa?: Empresa | string | null;
}

/**
 * "Controle de permissões" (31/08/2026, pedido do Lucas) — ver
 * `PermissoesService` (fonte única consultada por `app-shell` e pelos
 * guards de rota) e `UsuarioController`/`AuthController::minhasPermissoes`
 * no backend.
 */
export interface PermissaoModulo {
  modulo: string;
  podeUsar: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeReabrir: boolean;
}

export interface UsuarioSecundario {
  id: number;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  podeGerenciarPermissoes: boolean;
}

export interface AcessoObraUsuario {
  userId: number;
  nome: string;
  email: string;
  podeVer: boolean;
  podeLancar: boolean;
}

/** GET /me/permissoes. */
export interface MinhasPermissoes {
  ehAdmin: boolean;
  podeGerenciarPermissoes: boolean;
  modulos: Record<string, Omit<PermissaoModulo, 'modulo'>>;
  obras: Record<string, { podeVer: boolean; podeLancar: boolean }>;
}

/** Extrai o objeto da empresa, ignorando quando vier só o nome. */
export function dadosDaEmpresa(usuario: UsuarioAutenticado | null | undefined): Empresa | null {
  const empresa = usuario?.empresa;
  return empresa && typeof empresa === 'object' ? empresa : null;
}

/** Nome da empresa, venha ela como texto ou objeto. */
export function nomeDaEmpresa(usuario: UsuarioAutenticado | null | undefined): string {
  const empresa = usuario?.empresa;
  if (!empresa) return '';
  return typeof empresa === 'string' ? empresa : (empresa.nome ?? '');
}

/** Dados de assinatura exibidos no KPI do dashboard e na aba "Plano" das Configurações. */
export interface Empresa {
  id?: number | string;
  nome?: string | null;
  plano?: string | null;
  assinatura_status?: string | null;
  assinatura_valida_ate?: string | null;
}

/** Resposta de GET /api/me. */
export interface RespostaMe {
  user: UsuarioAutenticado;
}

/**
 * Resposta de POST /api/pagamentos/ler-nota — dados extraídos de uma
 * foto de nota fiscal. Todos os campos são opcionais: a leitura é
 * automática e pode não reconhecer tudo, então o que vier preenche o
 * formulário e o resto fica para o usuário completar.
 */
export interface RespostaLeituraNota {
  ok: boolean;
  message?: string;
  dados?: {
    fornecedor?: string | null;
    descricao?: string | null;
    numero_nota?: string | null;
    data?: string | null;
    valor_total?: number | null;
  };
}

/**
 * Resposta de POST /api/fornecedores/ler-nota — dados de CADASTRO extraídos
 * de uma nota fiscal do próprio fornecedor (04/08/2026, pedido do Lucas:
 * agiliza o cadastro e evita erro de digitação). Mesma ideia de
 * `RespostaLeituraNota`, mas os campos são os do formulário de Fornecedor.
 */
export interface RespostaLeituraFornecedor {
  ok: boolean;
  message?: string;
  dados?: {
    nome?: string | null;
    tipo?: 'PF' | 'PJ' | null;
    documento?: string | null;
    endereco?: string | null;
    especialidade?: string | null;
  };
}

/**
 * Aba "Dados da empresa" do popup de Configurações (26/08/2026) —
 * `GET/POST /api/empresa/perfil`.
 */
export interface RepresentanteLegal {
  id: string;
  nome: string;
  cargo: string;
  cpf: string;
  email: string;
  telefone: string;
  ativo: boolean;
}

export interface PerfilEmpresa {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  telefone: string;
  emailContato: string;
  corPrimaria: string;
  corSecundaria: string;
  fonte: string;
  logoUrl: string | null;
  papelTimbradoUrl: string | null;
  representantes: RepresentanteLegal[];
}
