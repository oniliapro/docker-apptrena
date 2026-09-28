/**
 * Abas de uma obra, na ordem do protótipo (obracontrol.html) — extraído de
 * `obra-detalhe.ts` (28/09/2026, item 16 do lote de melhorias: tela de
 * entrada da obra virou uma GRADE de botões pra escolher a aba, em vez de
 * abrir a EAP direto e depender só da faixa horizontal de abas — ficaram
 * muitas e difíceis de navegar). Lista única, reaproveitada tanto pela
 * grade de entrada (`ObraInicio`) quanto pelo filtro de permissão que já
 * existia em `ObraDetalhe`.
 *
 * `moduloChave` ausente (só a EAP) = sempre visível — exceção de
 * "Controle de permissões" (31/08/2026): a EAP nunca some, mesmo sem
 * `pode_usar`.
 */
export interface AbaObra {
  readonly caminho: string;
  readonly rotulo: string;
  readonly moduloChave?: string;
}

export const ABAS_OBRA: readonly AbaObra[] = [
  { caminho: 'eap', rotulo: 'EAP' },
  { caminho: 'cronograma', rotulo: 'Cronograma', moduloChave: 'cronograma' },
  { caminho: 'desembolso', rotulo: 'Cronograma de desembolso', moduloChave: 'desembolso' },
  { caminho: 'medicoes', rotulo: 'Medições de Obra', moduloChave: 'medicoes' },
  { caminho: 'empreitas', rotulo: 'Empreitas', moduloChave: 'empreitas' },
  { caminho: 'mapas', rotulo: 'Mapas', moduloChave: 'mapas' },
  { caminho: 'pagamentos', rotulo: 'Pagamentos', moduloChave: 'pagamentos' },
  { caminho: 'recebimentos', rotulo: 'Recebimentos', moduloChave: 'recebimentos' },
  { caminho: 'diarias', rotulo: 'Diárias', moduloChave: 'diarias' },
  { caminho: 'agenda', rotulo: 'Agenda', moduloChave: 'agenda' },
  { caminho: 'rdo', rotulo: 'RDO', moduloChave: 'diario_obra' },
  { caminho: 'contratos-equipamentos', rotulo: 'Contratos de equipamentos', moduloChave: 'contratos_equipamentos' },
  { caminho: 'relatorios', rotulo: 'Relatórios', moduloChave: 'relatorios' },
  { caminho: 'arquivos', rotulo: 'Arquivos Anexados', moduloChave: 'arquivos' },
] as const;
