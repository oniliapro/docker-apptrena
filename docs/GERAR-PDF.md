# Gerar PDF de relatórios

Criado em 22/08/2026. Primeira implementação: PDF do relatório "Orçado x
Realizado" (`/obras/{id}/relatorios`), pelo botão **Baixar PDF** na tela.

## O problema que isso resolve

Exportar telas bonitas do Angular como PDF ficava feio porque não existia
um caminho pensado pra isso — a única forma de PDF que já existia no
sistema é o botão "Gerar PDF" do Mapa (`mapa.ts:gerarPdf()`), que só chama
`window.print()`: abre a caixa de diálogo de impressão do navegador do
usuário e depende de ele escolher "Salvar como PDF" por conta própria. O
resultado varia por navegador, não vira um arquivo automático, e o CSS de
impressão (`@media print` em `_base.scss`) só esconde o menu — não foi
desenhado como um relatório de papel de verdade.

## Como funciona agora

1. O Angular ganhou uma rota de impressão dedicada,
   `/imprimir/obras/:id/relatorios` (`relatorios-imprimir.ts`) — uma
   versão do relatório **sem** o menu lateral/cabeçalho da aplicação, com
   CSS pensado para A4 (`relatorios-imprimir.scss`: `@page`, margens em
   mm, quebra de página controlada). Ela reaproveita as mesmas funções de
   cálculo da tela normal (`eap-engine.ts`, `pagamentos-calc.ts`), então
   os números do PDF nunca podem divergir dos números da tela — é
   literalmente a mesma conta.
2. O backend (`RelatorioPdfController::relatorioObra`, rota
   `GET /api/obras/{obra}/relatorio/pdf`) abre essa rota de impressão
   dentro de um **Chromium headless**, via
   [Browsershot](https://github.com/spatie/browsershot) (que por baixo
   usa Puppeteer), e converte o que ele renderiza em PDF. Como é um
   navegador de verdade renderizando, o CSS moderno (grid, `@page`,
   fontes web) é respeitado igual ao que aparece na tela — diferente de
   bibliotecas tipo DomPDF/mPDF, que têm suporte bem mais limitado a CSS.
3. Autenticação: o Chromium headless não tem sessão/localStorage nenhum.
   O controller gera um token Sanctum de **vida curta (2 minutos)**, só
   para aquela renderização, e manda na URL
   (`?token=...`). A tela de impressão lê esse token e o aplica via
   `AuthService.definirTokenParaImpressao()` — sem gravar no
   `localStorage`. O token é revogado assim que o PDF termina de ser
   gerado.
4. O frontend baixa o PDF com `ApiService.baixarRelatorioPdf()` (um GET
   comum, autenticado do jeito normal) e dispara o download no navegador
   do usuário — sem depender de caixa de diálogo de impressão nenhuma.

```
[Botão "Baixar PDF"] → GET /api/obras/{id}/relatorio/pdf (autenticado)
                            │
                            ├─ cria token Sanctum de 2 min
                            ├─ Browsershot abre, no Chromium headless,
                            │  http://angular:4200/imprimir/obras/{id}/relatorios?token=...
                            ├─ Chromium espera a página carregar (waitUntilNetworkIdle)
                            ├─ Chromium exporta o PDF (A4, com fundo colorido preservado)
                            ├─ revoga o token
                            └─ devolve o PDF como download
```

## Preparação necessária (rodar uma vez, local)

Os arquivos de código já estão prontos. Falta instalar as dependências
novas dentro dos containers — **elas não vêm no `git pull`/build da
imagem porque `vendor/` e `node_modules/` são bind mounts, não fazem
parte da imagem** (mesmo motivo do `composer install` no README).

Com os containers no ar (`docker-compose --project-name controleobra up -d`):

```bash
# 1. Rebuildar o container do PHP — ele ganhou o pacote "chromium" do
#    sistema (apt), usado para renderizar o PDF.
docker-compose --project-name controleobra build phpfpm
docker-compose --project-name controleobra up -d phpfpm

# 2. Instalar o Browsershot (PHP) — atualiza composer.json E composer.lock
#    corretamente, ao contrário de editar os dois na mão.
docker exec controleobra-phpfpm composer require spatie/browsershot

# 3. Instalar o puppeteer (Node) — é o "controle remoto" que o
#    Browsershot usa para falar com o Chromium instalado via apt.
#    NÃO dá pra usar só o puppeteer-core: o script que o Browsershot
#    roda por baixo (vendor/spatie/browsershot/bin/browser.cjs) tem
#    `require('puppeteer')` fixo no código — sem fallback pra
#    puppeteer-core. PUPPETEER_SKIP_DOWNLOAD evita baixar um segundo
#    Chromium (o pacote completo baixaria um por padrão) — seguimos
#    usando o do apt via PDF_CHROME_PATH.
docker exec -e PUPPETEER_SKIP_DOWNLOAD=true controleobra-phpfpm bash -c "cd /usr/share/nginx/controleobra-api && npm install puppeteer"
```

Nada a mudar no `.env` para rodar local — `config/pdf.php` já tem os
defaults certos para o Docker Compose deste projeto (`PDF_FRONTEND_URL`
aponta pro serviço `angular` na rede interna do compose,
`PDF_CHROME_PATH` aponta pro Chromium instalado no passo 1,
`PDF_API_URL` aponta pro serviço `nginx` — ver "Duas pegadinhas reais"
abaixo pra entender por quê essa última existe).

Duas coisas a mais que **não** têm a ver com dependência, mas que
travam a geração do PDF se faltarem:

- **`allowedHosts` do Angular**: o Chromium headless carrega a tela de
  impressão via `http://angular:4200` (nome do serviço no compose, não
  `localhost:4201`) — e por padrão o dev-server (Vite por baixo)
  recusa esse Host com 403 ("Blocked request. This host ('angular') is
  not allowed."). Precisa de `"allowedHosts": ["angular"]` em
  `serve.options` no `frontend/angular.json` (reiniciar o container do
  Angular depois de mudar `angular.json` — não é hot-reload).
- **`PDF_API_URL`**: a tela de impressão, já carregada dentro do
  Chromium, também precisa falar com a API — mas `environment.ts` (dev)
  tem um host absoluto (`http://localhost:8088/api`), que não existe
  de dentro da rede interna do container (`localhost`, ali dentro, é o
  próprio container `phpfpm`, não a máquina do usuário). Sem isso, o
  Chromium carrega a página certinho mas ela mostra "Não foi possível
  carregar os dados." — o PDF sai vazio só com o cabeçalho.
  `RelatorioPdfController` manda um `?apiUrl=...` (junto do `?token=`)
  na URL de impressão; `RelatoriosImprimir` lê e aplica via
  `ApiService.definirBaseParaImpressao()`, só nessa instância isolada
  do Chromium — não afeta a sessão normal do usuário no navegador.

## Como testar

1. Confirme que os 5 containers estão de pé (`docker ps`) e que o
   Angular está acessível em `http://localhost:4201` (porta remapeada
   neste PC, ver `environment.ts`).
2. Abra uma obra que já tenha EAP e pagamentos lançados (senão o
   relatório mostra "ainda não há o que comparar" — o botão só aparece
   quando há dados).
3. Vá em **Relatórios** (aba da obra) e clique em **Baixar PDF**. A
   primeira geração pode levar alguns segundos (o Chromium precisa abrir
   a página do zero) — o botão mostra "Gerando PDF…" enquanto isso.
4. Confira o PDF baixado: cabeçalho com nome/cliente/responsável da obra,
   os três cartões (Orçado/Realizado/Saldo) e a tabela por categoria,
   sem menu lateral, em A4.

### Se der erro

- **"Não foi possível gerar o PDF"** no frontend → veja o log do Laravel:
  `docker exec controleobra-phpfpm tail -n 50 storage/logs/laravel.log`.
  As causas mais prováveis são as do passo de preparação não ter sido
  feito (Chromium não instalado, `spatie/browsershot` ou `puppeteer`
  faltando) ou o Chromium não achar o binário certo — confirme rodando
  `docker exec controleobra-phpfpm chromium --version` (deve responder
  uma versão, não "command not found").
- **`Error: Cannot find module 'puppeteer'`** no log → foi instalado
  `puppeteer-core` em vez de `puppeteer` completo (ver "Duas pegadinhas
  reais" acima — o script do Browsershot não aceita puppeteer-core
  sozinho). `npm uninstall puppeteer-core && PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer`
  dentro de `controleobra-api/`.
- **`chrome_crashpad_handler: --database is required` / `Failed to
  launch the browser process`** no log → o PHP-FPM roda como `www-data`,
  cujo `$HOME` (`/var/www`) não é gravável por ele (só root tem escrita
  ali); o Chrome tenta criar o banco de relatório de erros dentro de
  `$HOME` e falha ao abrir. Reproduz fora do Laravel com
  `docker exec -u www-data controleobra-phpfpm chromium --headless --no-sandbox --disable-gpu --dump-dom http://angular:4200/`
  (funciona) vs. rodando o Browsershot de verdade como esse mesmo
  usuário (falha) — a correção já está em `RelatorioPdfController`
  (`->setNodeEnv(['HOME' => '/tmp'])`, um diretório gravável por
  qualquer usuário no container); se voltar a acontecer depois de uma
  mudança no Dockerfile, é sinal de que essa linha sumiu do controller.
- **PDF gera mas sai só com o cabeçalho, "Não foi possível carregar os
  dados."** → `PDF_API_URL` não está configurado/chegando —
  ver "Duas pegadinhas reais" acima.
- **403 "Blocked request. This host ('angular') is not allowed."** (no
  log, dentro da mensagem de exceção do Browsershot) → falta
  `allowedHosts` em `frontend/angular.json` — ver "Duas pegadinhas
  reais" acima.
- **Erro de rede/timeout do Browsershot tentando abrir a URL** → confirme
  que o container `angular` está de pé (`docker ps`) e que
  `docker exec controleobra-phpfpm curl -s http://angular:4200` responde
  alguma coisa (o HTML do Angular). Se este projeto estiver com os
  serviços renomeados/portas diferentes das descritas aqui, ajuste
  `PDF_FRONTEND_URL`/`PDF_API_URL` no `controleobra-api/.env`.

## Em produção

No VPS, o Angular **não roda como container** (é build estático servido
pelo nginx do sistema, ver `docs/DEPLOY-PRODUCAO.md`) — então
`PDF_FRONTEND_URL` no `.env` de produção precisa apontar para
`https://trenadigital.com.br` (não `http://angular:4200`, que só existe
no compose local), e `PDF_API_URL` para
`https://trenadigital.com.br/api` (`environment.prod.ts` já usa um
caminho relativo `/api`, então tecnicamente não precisaria do override
— mas `RelatorioPdfController` sempre manda `?apiUrl=`, então deixar
configurado evita qualquer ambiguidade). O `allowedHosts` do
`angular.json` é uma pegadinha só do dev-server local — não existe
equivalente em produção, porque lá não tem dev-server nenhum rodando.

O container `phpfpm` de produção também precisa do mesmo preparo
(`composer require`/`npm install` já ficam registrados no
`composer.lock`/`package-lock.json` depois do passo local, então em
produção basta `composer install`/`npm install` normal — e a imagem
precisa ser rebuildada com o `chromium` do `Dockerfile_php`). As duas
pegadinhas de runtime (puppeteer completo, não puppeteer-core; `$HOME`
gravável) valem lá também, porque é o mesmo Dockerfile/mesmo usuário
`www-data` — já resolvidas no código (`RelatorioPdfController`) e no
`package.json`, não é algo que precisa reconfigurar por ambiente.

## Próximos passos possíveis

- Trocar o botão "Gerar PDF" do Mapa (`window.print()`, resultado
  dependente do navegador) pelo mesmo mecanismo — criar uma
  `/imprimir/obras/:id/mapas/:mapaId` e apontar o botão pra um endpoint
  parecido com o `RelatorioPdfController`.
- Cache curto (alguns minutos) do PDF gerado, se relatórios muito grandes
  tornarem a espera perceptível.
- Logo/identidade visual mais elaborada no cabeçalho do relatório, se o
  Lucas quiser algo além do texto "AppTrena".
