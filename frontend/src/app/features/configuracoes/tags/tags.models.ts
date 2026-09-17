/**
 * Tag (06/09/2026) — cadastrada aqui, usada pra organizar anexos de
 * Pagamento/Recebimento (controle de notas fiscais). Ver
 * `shared/anexos-lancamento` pra como um arquivo vira "anexo" com uma tag,
 * e `TagController` (backend) pra como a tag cria/renomeia a pasta
 * correspondente em cada obra.
 */
export interface Tag {
  id: string;
  nome: string;
  ativo: boolean;
}
