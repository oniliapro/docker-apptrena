# Backend PHP (persistência)

Este backend expõe um endpoint simples para persistir as chaves `controleObra.*` usadas no front-end.

## Endpoint

- `backend/storage.php`

## Operações

- `GET ?key=controleObra...` -> retorna `{ ok, value }`
- `POST` com `{ "key": "...", "value": "..." }` -> grava/atualiza
- `DELETE ?key=controleObra...` -> remove chave
- `POST` com `{ "action": "clear-prefix", "prefix": "controleObra." }` -> remove lote por prefixo

## Como rodar localmente

No diretório `Nova pasta`:

```bash
php -S localhost:8000
```

Depois acesse:

- `http://localhost:8000/html/index.html`

O front usa `../backend/storage.php` e, se o PHP não estiver disponível, cai automaticamente para `localStorage`.
