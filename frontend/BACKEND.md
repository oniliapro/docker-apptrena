# Backend — como o Angular conversa com a API

O backend já existe e está pronto: é o projeto Docker em
`Projetos\AppTrena\backend-docker` (antes ficava em
`D:\projetos\docker-crtlobras`; foi trazido para dentro do AppTrena em
27/07/2026 para facilitar acompanhamento e backup — o `vendor/` do
Laravel não veio na mudança, é só rodar `composer install` dentro de
`backend-docker\controleobra` na primeira vez).

---

## Para rodar tudo

Duplo clique em **`INICIAR-COM-BACKEND.bat`**. Ele sobe o Docker pelo WSL,
confere se a API respondeu e depois sobe o Angular.

Se preferir na mão, no WSL:

```bash
cd /mnt/c/Users/Onilia/Desktop/Claude/Projetos/AppTrena/backend-docker
docker compose --project-name controleobra up -d
```

E depois o `INICIAR.bat` de sempre para o frontend.

---

## Como está montado

| Serviço | Endereço | O que é |
|---|---|---|
| API (nginx + php-fpm) | `127.0.0.1:8088` | O Laravel — é para cá que o Angular fala |
| MySQL 5.7 | `127.0.0.1:3306` | Banco `dbcontroleobra` |
| phpMyAdmin | `127.0.0.1:8084` | Para olhar o banco pelo navegador |
| App antigo | `127.0.0.1:8080` | O vanilla, servido em paralelo |
| Angular | `localhost:4200` | O novo frontend |

Todos presos a `127.0.0.1` de propósito: só alcançáveis da própria
máquina, nunca da internet.

---

## O que precisei ajustar

**CORS.** O `.env` do Laravel só liberava `trenadigital.com.br`. Adicionei
`http://localhost:4200`, senão o navegador bloquearia toda chamada do
Angular durante o desenvolvimento. Liberar localhost não abre risco — só
alcança quem já está na máquina.

**Endereço da API.** `environment.ts` aponta para `localhost:8088/api`
(a mesma porta que o app vanilla já usava). Em produção,
`environment.prod.ts` usa o caminho relativo `/api`, porque lá o nginx do
servidor repassa para o container — assim funciona igual em http e https,
sem CORS.

**Tipo do usuário.** `/login` devolve `user.empresa` como **texto** (só o
nome), enquanto `/me` devolve o **objeto completo**, com os dados de
assinatura. Criei `dadosDaEmpresa()` e `nomeDaEmpresa()` para ler os dois
formatos sem quebrar.

---

## Se a API não estiver no ar

O app continua funcionando: grava no próprio navegador e mostra um selo
âmbar no canto avisando "Salvando neste navegador". Assim que a API
responder, ele passa a usá-la sozinho.

Isso é o mesmo comportamento do app vanilla, cujo `backend-storage.js`
também cai para `localStorage` quando o PHP não está de pé.

---

## Uma diferença de modelo que vale acompanhar

O `EmpreitaController` do backend evoluiu além do que o app vanilla
fazia: ele aceita **contrato discriminado por categoria de custo**
(`contratoEmpPorTipo` e `contratoReservaPorTipo`), enquanto o frontend —
tanto o antigo quanto o meu port — trabalha com um valor único de
empreita e um de reserva, distribuídos depois pela proporção do orçado.

O backend mantém `valor_emp` e `valor_reserva` como soma das categorias,
então o que existe hoje funciona. **Decidido (28/07/2026):** o
lançamento por categoria vai ser digitado pelo usuário, não
calculado/distribuído pelo sistema — isso é o que a "task #45" mencionada
no controller estava propondo. Fica como próximo passo de UI na tela da
Empreita (ver `INTEGRACAO.md`).

---

## Primeiro acesso

Se o banco estiver vazio, use **Criar conta** na tela de login: o
cadastro cria a empresa junto com o usuário, com 14 dias de teste, e já
entra direto.

Para conferir o que está gravado, o phpMyAdmin fica em
`http://localhost:8084`.
