/**
 * Ficha de Verificação de Serviço (F10, 25/09/2026) — ver o plano ("D4") e
 * `docs/CONTEXTO.md`. Três peças:
 *  - `FvsModelo`: cadastro reaproveitável (Configurações).
 *  - `FvsVinculo`: liga um modelo a um item da EAP de uma obra.
 *  - `FvsPreenchimento`/`FvsPreenchimentoItem`/`FvsFoto`: a ficha preenchida
 *    de fato, pendurada num RDO — nasce e é copiada sozinha pelo backend
 *    (ver `RdoController`), o frontend só lê e salva as respostas.
 */

export interface FvsItemModelo {
  descricao: string;
}

export interface FvsModelo {
  id: string;
  nome: string;
  itens: FvsItemModelo[];
  ativo: boolean;
}

export interface FvsVinculo {
  id: string;
  eap_item_id: string;
  fvs_modelo_id: string;
  modelo: FvsModelo;
}

export type ResultadoFvs = 'conforme' | 'nao_conforme' | 'nao_se_aplica';

export interface FvsFoto {
  id: string;
  url: string;
}

export interface FvsPreenchimentoItem {
  id: string;
  ordem: number;
  descricao: string;
  resultado: ResultadoFvs | null;
  observacao: string | null;
  fotos: FvsFoto[];
}

export type StatusFvs = 'pendente' | 'aprovada' | 'reprovada';

export interface FvsPreenchimento {
  id: string;
  obra_id: string;
  eap_item_id: string | null;
  fvs_modelo_id: string | null;
  modelo_nome_snapshot: string;
  rdo_id: string;
  numero: number;
  revisao: number;
  codigo: string; // "FVS-0001-REV000", calculado no backend
  status: StatusFvs;
  observacao_geral: string | null;
  origem_preenchimento_id: string | null;
  pendencia_id: string | null;
  preenchido_em: string | null;
  itens: FvsPreenchimentoItem[];
  eap_item?: { id: string; codigo_eap: string; descricao: string } | null;
  rdo?: { id: string; numero: number; data: string } | null;
}
