<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Obra;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF do relatório "Orçado x Realizado" de uma obra — mesmo
 * conteúdo da tela Relatórios (features/relatorios/relatorios.ts no
 * Angular). Criado em 22/08/2026, ver docs/GERAR-PDF.md.
 *
 * DECISÃO DE ARQUITETURA: em vez de recalcular orçado/realizado/BDI aqui
 * em PHP — o que duplicaria a engine que já existe em TypeScript
 * (eap-engine.ts, pagamentos-calc.ts) e arriscaria os dois lados
 * divergirem com o tempo, um risco sério num relatório financeiro — este
 * endpoint abre a própria tela de impressão do Angular
 * (`/imprimir/obras/{id}/relatorios`, ver `relatorios-imprimir.ts`) dentro
 * de um Chromium headless (Browsershot) e imprime exatamente o que ela
 * renderiza. O PDF sempre bate com o que a tela mostraria, porque é
 * literalmente a mesma tela, só sem o menu/cabeçalho da aplicação.
 *
 * Isso também é o que resolve o problema de "PDF feio": em vez de tirar um
 * retrato da tela normal (ou depender de window.print(), como o botão
 * "Gerar PDF" do Mapa hoje — ver mapa.ts:gerarPdf()), a tela de impressão
 * tem seu próprio layout, pensado pra papel (tamanho A4, margens,
 * cabeçalho do relatório, quebras de página) — e quem desenha o PDF é um
 * Chromium de verdade, não a caixa de diálogo de impressão do navegador
 * do usuário.
 *
 * AUTENTICAÇÃO: o Chromium headless não tem localStorage de uma sessão de
 * verdade, então geramos um token Sanctum de vida curta (2 minutos) só
 * para esta renderização, mandado na URL como query string — a tela de
 * impressão sabe lê-lo (ver `AuthService.definirTokenParaImpressao` no
 * Angular). O token é revogado assim que o PDF termina de ser gerado
 * (sucesso ou erro), sem esperar a expiração.
 */
class RelatorioPdfController extends Controller
{
    public function relatorioObra(Request $request, Obra $obra)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-' . $obra->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$obra->id}/relatorios"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox() // necessário: sem isso o Chromium recusa abrir dentro do container
                // O PHP-FPM roda como www-data, cujo $HOME (/var/www) não é
                // gravável por ele (só root tem escrita ali) — sem isso, o
                // crashpad_handler do Chrome falha ao abrir com "--database
                // is required" / "recvmsg: Connection reset by peer", porque
                // não consegue criar o banco de relatório de erros dentro de
                // $HOME. /tmp é gravável por qualquer usuário no container
                // (descoberto 22/08/2026, reproduzido rodando o Browsershot
                // como www-data via `docker exec -u www-data`).
                ->setNodeEnv(['HOME' => '/tmp'])
                ->waitUntilNetworkIdle()
                ->format('A4')
                ->margins(12, 10, 16, 10)
                ->showBackground() // preserva as cores de fundo dos cartões/destaques
                ->timeout(30)
                ->pdf();
        } finally {
            // Revoga o token assim que terminar (sucesso ou erro) — não
            // precisa esperar os 2 minutos de expiração.
            $tokenTemporario->accessToken->delete();
        }

        $nomeArquivo = str($obra->obra_nome ?: 'obra')->slug() . '-relatorio.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
