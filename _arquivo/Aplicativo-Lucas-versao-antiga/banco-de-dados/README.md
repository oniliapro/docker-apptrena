# Banco de dados (inicial)

Arquivos desta pasta:

- `01-criar-tabelas.sql`: cria as tabelas principais do sistema.
- `02-seed-tipos-custo.sql`: popula os tipos de custo padrao.
- `03-migracao-localstorage.sql`: migra os dados exportados do localStorage para as tabelas SQL.

Ordem sugerida de execucao:

1. `01-criar-tabelas.sql`
2. `02-seed-tipos-custo.sql`
3. carregar os JSONs no `import_localstorage` (tabela temporaria criada pelo script 03)
4. `03-migracao-localstorage.sql`

Exemplo de carga antes do script 03:

```sql
INSERT INTO import_localstorage (chave, valor) VALUES
  ('controleObra.eap.v2', '<JSON_AQUI>'::jsonb),
  ('controleObra.mapas.v1', '<JSON_AQUI>'::jsonb),
  ('controleObra.empreitas.v1', '<JSON_AQUI>'::jsonb),
  ('controleObra.empreita.v1', '<JSON_AQUI>'::jsonb),
  ('controleObra.pagamentos.v1', '<JSON_AQUI>'::jsonb);
```

Observacao:

- Script pensado para PostgreSQL.
- IDs estao como `VARCHAR(36)` para compatibilidade com UUID gerado no frontend.
- O script 03 e idempotente para os principais registros (usa `upsert` e recria itens filhos por registro importado).
