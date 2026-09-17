/**
 * Testes de CPF e CNPJ.
 *
 * Diferente das outras suítes, aqui não há app original para comparar —
 * o cadastro de clientes é tela nova. Então os casos verificam as regras
 * públicas dos documentos: dígitos verificadores corretos, rejeição de
 * sequências repetidas e de tamanhos inválidos.
 *
 * Os números usados são válidos pelo algoritmo mas não pertencem a
 * ninguém: foram gerados para teste.
 */
const doc = require('./portado-documento.js');

let falhas = 0;
const verificar = (descricao, obtido, esperado) => {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHA'} | ${descricao}` + (ok ? '' : `\n        obtido: ${JSON.stringify(obtido)} / esperado: ${JSON.stringify(esperado)}`));
};

console.log('--- CPF ---');
verificar('CPF valido', doc.validarCpf('529.982.247-25'), true);
verificar('CPF valido sem pontuacao', doc.validarCpf('52998224725'), true);
verificar('CPF com digito verificador errado', doc.validarCpf('529.982.247-26'), false);
verificar('CPF com todos digitos iguais', doc.validarCpf('111.111.111-11'), false);
verificar('CPF curto demais', doc.validarCpf('5299822472'), false);
verificar('CPF vazio', doc.validarCpf(''), false);
verificar('CPF com letras', doc.validarCpf('abc'), false);

console.log('\n--- CNPJ ---');
verificar('CNPJ valido', doc.validarCnpj('11.222.333/0001-81'), true);
verificar('CNPJ valido sem pontuacao', doc.validarCnpj('11222333000181'), true);
verificar('CNPJ com digito errado', doc.validarCnpj('11.222.333/0001-82'), false);
verificar('CNPJ com todos digitos iguais', doc.validarCnpj('11.111.111/1111-11'), false);
verificar('CNPJ curto demais', doc.validarCnpj('1122233300018'), false);

console.log('\n--- deteccao de tipo ---');
verificar('11 digitos = cpf', doc.tipoDoDocumento('52998224725'), 'cpf');
verificar('14 digitos = cnpj', doc.tipoDoDocumento('11222333000181'), 'cnpj');
verificar('outro tamanho = indefinido', doc.tipoDoDocumento('123'), 'indefinido');

console.log('\n--- validacao generica ---');
verificar('aceita CPF valido', doc.validarDocumento('529.982.247-25'), true);
verificar('aceita CNPJ valido', doc.validarDocumento('11.222.333/0001-81'), true);
verificar('rejeita tamanho invalido', doc.validarDocumento('12345'), false);

console.log('\n--- formatacao ---');
verificar('CPF completo', doc.formatarDocumento('52998224725'), '529.982.247-25');
verificar('CNPJ completo', doc.formatarDocumento('11222333000181'), '11.222.333/0001-81');
verificar('CPF parcial', doc.formatarDocumento('529982'), '529.982');
verificar('vazio', doc.formatarDocumento(''), '');
verificar('telefone celular', doc.formatarTelefone('61987654321'), '(61) 98765-4321');
verificar('telefone fixo', doc.formatarTelefone('6133334444'), '(61) 3333-4444');
verificar('CEP', doc.formatarCep('71680000'), '71680-000');

console.log(`\n${falhas === 0 ? '✔ Validação de CPF e CNPJ correta.' : '✖ ' + falhas + ' caso(s) com problema.'}`);
process.exit(falhas ? 1 : 0);
