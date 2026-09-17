<?php

/**
 * Configuração do gerador de PDF de relatórios (RelatorioPdfController),
 * criada em 22/08/2026 — ver docs/GERAR-PDF.md para o desenho completo.
 */

return [
    /**
     * Base URL do Angular que o Chromium headless (via Browsershot) acessa
     * para renderizar a tela de impressão do relatório
     * (`/imprimir/obras/{id}/relatorios`).
     *
     * Dev (Docker local): o container phpfpm fala com o container do
     * Angular pela rede interna do compose, usando o NOME do serviço
     * ("angular") e a porta INTERNA do container (4200) — não a porta do
     * host (4201, remapeada por causa do projeto ImigraParaguai, ver
     * frontend/src/environments/environment.ts). Por isso o padrão abaixo
     * não é "localhost".
     *
     * Produção: o Angular não roda mais como container lá (é build
     * estático servido pelo nginx do sistema) — trocar via PDF_FRONTEND_URL
     * no .env de produção para "https://trenadigital.com.br".
     */
    'frontend_url' => env('PDF_FRONTEND_URL', 'http://angular:4200'),

    /**
     * Base da API que o Angular, já carregado dentro do Chromium
     * headless, deve chamar pra buscar os dados do relatório —
     * `RelatoriosImprimir` aplica isto via `?apiUrl=` na URL (mesmo
     * mecanismo do token de impressão). Precisa ser diferente de
     * `frontend_url`: o Chromium está na rede interna do container
     * `phpfpm`, onde `localhost:8088` (o endereço que o navegador do
     * usuário usa) não existe — mas o serviço `nginx` do compose, sim
     * (descoberto 22/08/2026, PDF vinha em branco com "Não foi possível
     * carregar os dados" até essa troca).
     *
     * Produção: o Angular é build estático servido pelo mesmo domínio da
     * API (ver docs/DEPLOY-PRODUCAO.md) — trocar via PDF_API_URL no .env
     * de produção para "https://trenadigital.com.br/api".
     */
    'api_url' => env('PDF_API_URL', 'http://nginx/api'),

    /**
     * Caminho do binário do Chromium instalado no container (ver
     * Dockerfile_php — apt install chromium, que fica em /usr/bin/chromium
     * no Debian). Sem isso, o Browsershot tentaria baixar/usar o Chromium
     * embutido do pacote npm "puppeteer" em vez do "puppeteer-core" leve
     * que instalamos — mais lento e redundante com o apt.
     */
    'chrome_path' => env('PDF_CHROME_PATH', '/usr/bin/chromium'),
];
