/**
 * Modelos do minissistema de arquivos ("Arquivos Anexados" de uma obra).
 * Espelha `Pasta`/`Arquivo` em controleobra-api/app/Models — snake_case
 * porque vem direto da API, igual RegistroDiario/FotoDiario.
 */

import { Tag } from '../configuracoes/tags/tags.models';

export type TipoRaizPasta = 'propria' | 'compartilhada';

export interface Pasta {
  id: string;
  empresa_id?: string;
  obra_id: string;
  parent_id: string | null;
  owner_user_id: number | string | null;
  tipo_raiz: TipoRaizPasta | null;
  nome: string;
  created_at?: string;
  updated_at?: string;
}

export type CategoriaArquivo =
  | 'imagem'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'cad_bim'
  | 'documento'
  | 'compactado'
  | 'outro';

export type StatusThumbnail = 'nao_aplicavel' | 'pendente' | 'pronto' | 'falhou';

export interface Arquivo {
  id: string;
  pasta_id: string;
  nome_original: string;
  caminho: string;
  extensao: string;
  mime: string | null;
  tamanho_bytes: number;
  categoria: CategoriaArquivo;
  caminho_thumbnail: string | null;
  thumbnail_status: StatusThumbnail;
  thumbnail_url: string | null;
  enviado_por_user_id?: number | string | null;
  created_at?: string;
  updated_at?: string;
  /**
   * Preenchidos só quando este Arquivo é um "anexo" de Pagamento/
   * Recebimento (06/09/2026, controle de notas fiscais) — ver
   * `shared/anexos-lancamento`. `null`/ausente = arquivo comum da aba
   * Arquivos, sem tag nem lançamento associado.
   */
  tag_id?: string | null;
  origem_tipo?: 'pagamento' | 'recebimento' | null;
  origem_id?: string | null;
  /** Preenchida quando o backend faz `with('tag')` (ex.: `AnexoController::indexPagamento`) — evita cruzar com `listarTags()` só pra saber o nome. */
  tag?: Tag | null;
}

export interface RaizesPastas {
  propria: Pasta;
  compartilhada: Pasta;
}

export interface ConteudoPasta {
  pasta: Pasta;
  breadcrumb: Pasta[];
  subpastas: Pasta[];
  arquivos: Arquivo[];
}

export type ModoExibicao =
  | 'detalhes'
  | 'lista'
  | 'icones-extra-grandes'
  | 'icones-grandes'
  | 'icones-medios'
  | 'icones-pequenos';

export const MODOS_EXIBICAO: ReadonlyArray<{ chave: ModoExibicao; rotulo: string }> = [
  { chave: 'detalhes', rotulo: 'Detalhes' },
  { chave: 'lista', rotulo: 'Lista' },
  { chave: 'icones-extra-grandes', rotulo: 'Ícones extra grandes' },
  { chave: 'icones-grandes', rotulo: 'Ícones grandes' },
  { chave: 'icones-medios', rotulo: 'Ícones médios' },
  { chave: 'icones-pequenos', rotulo: 'Ícones pequenos' },
];

export const MODOS_ICONE: ReadonlySet<ModoExibicao> = new Set([
  'icones-extra-grandes',
  'icones-grandes',
  'icones-medios',
  'icones-pequenos',
]);

/** Categorias que ganham miniatura de verdade (não ícone genérico) nos modos de ícone. */
export const CATEGORIAS_COM_MINIATURA: ReadonlySet<CategoriaArquivo> = new Set([
  'video',
  'audio',
  'pdf',
]);

/** Item unificado (pasta OU arquivo) pra renderização em grade/lista/detalhes. */
export interface ItemPastaOuArquivo {
  tipo: 'pasta' | 'arquivo';
  id: string;
  nome: string;
  pasta?: Pasta;
  arquivo?: Arquivo;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes / 1024;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  return `${valor.toFixed(valor < 10 ? 1 : 0)} ${unidades[indice]}`;
}
