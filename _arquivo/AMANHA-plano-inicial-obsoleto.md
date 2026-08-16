# Plano para amanhã — TrenaApp

Ordem cronológica. Cada etapa depende da anterior ter dado certo.

---

## Etapa 1 — Instalar as três ferramentas
**Você faz sozinha. ~30 minutos.**

Eu não consigo instalar programas: os instaladores pedem permissão de
administrador do Windows, e não tenho como responder a essas janelas.

Instruções completas em
`Aplicativo Lucas\laravel-backend\INSTALAR.md`. Resumo:

1. **PHP 8.2+** — https://windows.php.net/download (Thread Safe x64).
   É um zip: descompacte em `C:\php` e adicione ao PATH.
   Depois ative no `php.ini`: `pdo_pgsql`, `pgsql`, `mbstring`,
   `openssl`, `fileinfo`, `curl`.
2. **Composer** — https://getcomposer.org/download (o `Composer-Setup.exe`
   acha o PHP sozinho).
3. **PostgreSQL** — https://www.postgresql.org/download/windows.
   **Anote a senha do usuário `postgres`** — ela vai no `.env`.

---

## Etapa 2 — Rodar o diagnóstico
**Você clica, eu leio. ~2 minutos.**

Duplo clique em
`Aplicativo Lucas\laravel-backend\DIAGNOSTICO-BACKEND.bat`.

Ele grava um arquivo com as versões encontradas. Me avise que eu leio e
confirmo se está tudo no lugar antes de irmos adiante — é melhor
descobrir uma extensão faltando agora do que no meio da instalação.

---

## Etapa 3 — Criar o projeto Laravel
**Fazemos juntas. ~10 minutos.**

Rodamos `composer create-project laravel/laravel controle-obra-api`,
que baixa o framework, e copiamos por cima os arquivos que já existem em
`laravel-backend/` (models, controllers, migrations, rotas).

---

## Etapa 4 — O teste que importa: `php artisan migrate`
**Fazemos juntas. Tempo imprevisível — é aqui que pode dar trabalho.**

Criar o banco, configurar o `.env` com a senha do Postgres, gerar a
chave da aplicação e rodar as migrations.

**Por que esta etapa é o coração de tudo:** as migrations do Laravel
nunca foram executadas — foram escritas à mão, sem PHP disponível para
testar. Já validei que o SQL equivalente cria as 21 tabelas sem erro,
então o schema em si está correto. Falta provar que a *tradução* dele
para o construtor do Laravel está.

Se der erro aqui, corrigimos antes de qualquer outra coisa. Todo o
frontend assume esses contratos.

---

## Etapa 5 — Liberar o CORS
**Eu faço. ~5 minutos.**

Com o Angular na porta 4200 e a API na 8000, o navegador bloqueia as
chamadas por segurança. Ajusto o `config/cors.php`.

---

## Etapa 6 — Primeiro login de verdade
**Fazemos juntas. ~10 minutos.**

Subir a API (`php artisan serve`), rodar o seed que cria o usuário do
Lucas, e entrar no Angular pela tela de login real — não mais pelo botão
"Entrar sem servidor".

**Este é o momento que muda tudo.** Até agora todas as telas aparecem
vazias porque não há de onde ler. Depois daqui, o dashboard mostra
números, a lista de obras mostra obras, e o Diário salva de verdade.

---

## Etapa 7 — Conferir as telas com dados reais
**Fazemos juntas. ~20 minutos.**

Cadastrar uma obra, montar uma EAP pequena com dois ou três itens,
lançar um pagamento. Serve para achar as diferenças entre o que o
frontend espera e o que a API devolve — que é onde costumam aparecer os
problemas de integração.

---

## Etapa 8 — Voltar a portar telas
**Eu faço. Só depois de tudo acima funcionar.**

Na ordem: **Mapa de Fornecedores** (o maior que resta, ~3.000 linhas,
com a comparação de propostas) e depois **Empreita** (~1.300 linhas, com
as medições).

Para cada um, escrevo primeiro os casos de paridade em `verificacao/`,
como fiz com a EAP e Pagamentos — e só depois porto.

---

## Se der errado na Etapa 4

É o cenário mais provável de travamento. Alternativas, em ordem:

1. **Corrigir as migrations** — se o erro for pontual (um tipo de coluna,
   uma chave estrangeira fora de ordem), conserto na hora.
2. **Usar o SQL direto** — o `banco-de-dados/01-criar-tabelas.sql` já
   está validado. Dá para criar as tabelas por ele e dizer ao Laravel
   que as migrations já rodaram.
3. **Adiar o Laravel** — o `backend/storage.php` atual funciona e roda
   com o PHP embutido. Dá para apontar o Angular para ele e seguir
   portando telas enquanto o backend relacional espera.

Nenhuma dessas opções perde trabalho já feito.
