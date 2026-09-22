/**
 * Material ou equipamento do cadastro da empresa (F6, 22/09/2026). Um cadastro
 * só, com `tipo` separando os dois; vem da API (tabela `materiais_equipamentos`),
 * diferente dos outros cadastros que ainda usam a ponte chave-valor.
 */
export type TipoMaterialEquipamento = 'material' | 'equipamento';

export interface MaterialEquipamento {
  id: string;
  tipo: TipoMaterialEquipamento;
  nome: string;
  unidade: string | null;
  valor_unitario: number;
  marcas: string[] | null;
  foto_url: string | null;
  ativo: boolean;
}

export interface DadosMaterialEquipamento {
  tipo: TipoMaterialEquipamento;
  nome: string;
  unidade: string;
  valor_unitario: number;
  marcas: string[];
  ativo: boolean;
}

export const ROTULO_TIPO_MATERIAL_EQUIPAMENTO: Record<TipoMaterialEquipamento, string> = {
  material: 'Material',
  equipamento: 'Equipamento',
};
