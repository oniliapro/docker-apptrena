/* ===== DADOS FIXOS (EAP) ===== */
const dados = {
  categorias: [
    { key: "material", label: "Material" },
    { key: "maoDeObra", label: "Mão de obra" },
    { key: "equipamento", label: "Equipamento" },
    { key: "outros", label: "Outros" },
    { key: "administracao", label: "Administração" },
  ],
  exemploEap: [
    { isGroup: true, eap: "1", desc: "SERVIÇOS PRELIMINARES" },
    {
      isGroup: false, eap: "1.1", desc: "Mobilização / canteiro",
      qtde: 1, unid: "vb",
      unit: { material: 0, maoDeObra: 1500, equipamento: 800, outros: 200, administracao: 100 }
    },
    {
      isGroup: false, eap: "1.2", desc: "Limpeza / demolição",
      qtde: 50, unid: "m²",
      unit: { material: 5, maoDeObra: 28, equipamento: 12, outros: 2, administracao: 3 }
    },
    { isGroup: true, eap: "2", desc: "ESTRUTURA" },
    {
      isGroup: false, eap: "2.1", desc: "Fundações",
      qtde: 10, unid: "m³",
      unit: { material: 420, maoDeObra: 220, equipamento: 80, outros: 25, administracao: 40 }
    },
    {
      isGroup: false, eap: "2.2", desc: "Concreto / armação",
      qtde: 12, unid: "m³",
      unit: { material: 520, maoDeObra: 260, equipamento: 90, outros: 30, administracao: 45 }
    },
  ],
};
