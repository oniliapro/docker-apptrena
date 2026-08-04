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
  eap: string;
  desc: string;
  qtde: number;
  unid: string;
  unit: Partial<Record<ChaveTipoCusto, number>>;
  bdiMode?: ModoBdi;
  bdiPercent?: number;
  bdiValue?: number;
  [extra: string]: unknown;
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

export interface FotoDiario {
  id?: string;
  url: string;
}

export interface RegistroDiario {
  id: string;
  obra_id?: string | null;
  data?: string | null;
  clima?: string | null;
  autor?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  fotos?: FotoDiario[];
  /** Presente quando o backend faz eager-load da obra (usado no dashboard). */
  obra?: { obra_nome?: string | null } | null;
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

/** Dados de assinatura exibidos no KPI do dashboard. */
export interface Empresa {
  id?: number | string;
  nome?: string | null;
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
