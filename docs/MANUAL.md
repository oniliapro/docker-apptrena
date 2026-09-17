# Manual do AppTrena

Instruções operacionais do dia a dia. Para o estado do desenvolvimento, ver
`AppTrena-Angular/ESTADO.md` e `AppTrena-Angular/INTEGRACAO.md`. Para subir
o sistema, ver `AppTrena-Angular/BACKEND.md`.

---

## Trocar o modelo de IA (leitura de nota fiscal)

O único ponto do sistema que chama uma IA é a **leitura de nota fiscal por
foto** (módulo Pagamentos), em
`backend-docker/controleobra/app/Http/Controllers/Api/NotaFiscalController.php`.
Ele manda a foto para a API da Anthropic e recebe de volta fornecedor, data,
valor e descrição já estruturados.

O modelo usado é configurável, **não fixo no código**. Para trocar:

1. Abra `backend-docker/controleobra/.env`.
2. Ache a linha `ANTHROPIC_MODEL=claude-sonnet-4-5` (hoje é esse o padrão).
3. Troque para o modelo que quiser, por exemplo:
   ```
   ANTHROPIC_MODEL=claude-opus-5
   ```
4. Reinicie o container do backend para a mudança valer:
   ```bash
   cd /mnt/c/Users/Onilia/Desktop/Claude/Projetos/AppTrena/backend-docker
   docker compose --project-name controleobra restart phpfpm
   ```
   (ou reinicie tudo com `docker compose --project-name controleobra restart`).

Não precisa mexer em nenhum código — é só essa variável.

**Sobre custo/velocidade:** Opus é o modelo mais capaz da linha Claude, mas
também o mais caro e mais lento por chamada. Para uma tarefa simples como
ler uma nota fiscal, o Sonnet (padrão atual) costuma já ser suficiente;
vale trocar para Opus se notar erros de leitura em notas mais bagunçadas ou
manuscritas, e voltar para Sonnet depois se quiser economizar.

Também é preciso ter `ANTHROPIC_API_KEY` preenchida no mesmo `.env` — sem
ela, o endpoint responde com uma mensagem clara em vez de tentar chamar a
API (não trava o sistema).

---

## Trocar o modelo de IA (Claude fazendo as correções no app)

Isso é diferente do item acima — aqui é sobre o modelo que o **Claude usa
para trabalhar no código** do AppTrena (corrigir bugs, criar telas, etc.),
não o modelo que o app chama para ler nota fiscal.

Não dá para trocar por arquivo de configuração: é uma opção nas
configurações do Cowork/Claude (fora desta conversa, na tela onde se escolhe
o modelo — Sonnet, Opus etc.).

Para correções mais complexas ou delicadas no AppTrena, vale trocar pro
**Opus** nas configurações do Cowork antes de pedir a tarefa — ele é mais
cuidadoso em tarefas difíceis, ao custo de ser mais lento e mais caro. Para
correções simples do dia a dia, o Sonnet (padrão) já dá conta.

---

## Outras trocas de configuração comuns

| O que | Onde | Variável |
|---|---|---|
| Modelo de IA da leitura de nota | `backend-docker/controleobra/.env` | `ANTHROPIC_MODEL` |
| Chave da API Anthropic | `backend-docker/controleobra/.env` | `ANTHROPIC_API_KEY` |
| Domínios liberados (CORS) | `backend-docker/controleobra/.env` | `CORS_ALLOWED_ORIGINS` |
| Endereço da API que o Angular chama (dev) | `AppTrena-Angular/src/environments/environment.ts` | `apiUrl` |
| Endereço da API que o Angular chama (produção) | `AppTrena-Angular/src/environments/environment.prod.ts` | `apiUrl` |
