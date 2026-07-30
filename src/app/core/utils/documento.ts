/**
 * CPF e CNPJ: validação, formatação e leitura.
 *
 * A validação confere os **dígitos verificadores**, não só a quantidade
 * de números. Isso importa num cadastro de clientes: um CPF com 11
 * dígitos aleatórios passaria por qualquer checagem de tamanho, mas
 * seria rejeitado na emissão de nota fiscal — e o erro só apareceria
 * meses depois, na hora de faturar.
 */

/** Só os dígitos, descartando pontos, barras e traços. */
export function apenasDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

export type TipoDocumento = 'cpf' | 'cnpj' | 'indefinido';

/** Deduz o tipo pela quantidade de dígitos. */
export function tipoDoDocumento(valor: unknown): TipoDocumento {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return 'cpf';
  if (digitos.length === 14) return 'cnpj';
  return 'indefinido';
}

/**
 * Valida um CPF pelos dois dígitos verificadores.
 *
 * Sequências repetidas (111.111.111-11 e afins) são rejeitadas: elas
 * passam no cálculo dos dígitos por coincidência matemática, mas não são
 * CPFs válidos.
 */
export function validarCpf(valor: unknown): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcularDigito = (quantidade: number): number => {
    let soma = 0;
    for (let i = 0; i < quantidade; i++) {
      soma += Number(cpf[i]) * (quantidade + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

/**
 * Valida um CNPJ pelos dois dígitos verificadores.
 *
 * Os pesos não são sequenciais como no CPF: começam em 5 (ou 6, para o
 * segundo dígito) e voltam a 9 depois de chegar a 2.
 */
export function validarCnpj(valor: unknown): boolean {
  const cnpj = apenasDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (quantidade: number): number => {
    let peso = quantidade - 7;
    let soma = 0;

    for (let i = 0; i < quantidade; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calcularDigito(12) === Number(cnpj[12]) && calcularDigito(13) === Number(cnpj[13]);
}

/** Valida CPF ou CNPJ, conforme o tamanho. */
export function validarDocumento(valor: unknown): boolean {
  const tipo = tipoDoDocumento(valor);
  if (tipo === 'cpf') return validarCpf(valor);
  if (tipo === 'cnpj') return validarCnpj(valor);
  return false;
}

/**
 * Formata para exibição: 000.000.000-00 ou 00.000.000/0000-00.
 * Documento incompleto é formatado parcialmente, para o campo poder
 * mostrar a máscara enquanto o usuário digita.
 */
export function formatarDocumento(valor: unknown): string {
  const digitos = apenasDigitos(valor);
  if (!digitos) return '';

  // Até 11 dígitos trata como CPF; acima disso, como CNPJ.
  if (digitos.length <= 11) {
    return digitos
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  return digitos
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Formata telefone: (00) 0000-0000 ou (00) 00000-0000. */
export function formatarTelefone(valor: unknown): string {
  const digitos = apenasDigitos(valor).slice(0, 11);
  if (!digitos) return '';

  if (digitos.length <= 10) {
    return digitos.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }

  return digitos.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

/** Formata CEP: 00000-000. */
export function formatarCep(valor: unknown): string {
  const digitos = apenasDigitos(valor).slice(0, 8);
  return digitos.replace(/^(\d{5})(\d{1,3})$/, '$1-$2');
}
