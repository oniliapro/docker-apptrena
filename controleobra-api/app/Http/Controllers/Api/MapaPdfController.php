<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Mapa;
use Illuminate\Http\Request;
use Spatie\Browsershot\Browsershot;

/**
 * Gera o PDF do Mapa de Fornecedores — mesmo mecanismo do
 * RelatorioPdfController (ver docs/GERAR-PDF.md), aplicado à segunda tela
 * que tinha um botão de PDF (22/08/2026, pedido do Lucas: "todas as
 * páginas que tem a função pdf tem que gerar um pdf dessa forma").
 * Substitui o antigo `gerarPdf()` do mapa.ts, que só chamava
 * `window.print()` — dependia do usuário escolher "Salvar como PDF" na
 * caixa de diálogo do navegador, sem arquivo automático nem CSS pensado
 * pra papel.
 *
 * Mesma arquitetura da EAP/Relatórios: em vez de recalcular a comparação
 * de fornecedores aqui em PHP (duplicando mapa-engine.ts, arriscando os
 * dois lados divergirem), abre a própria tela de impressão do Angular
 * (`/imprimir/obras/{obraId}/mapas/{mapaId}`, `MapaImprimir`) num
 * Chromium headless e imprime exatamente o que ela renderiza — inclusive
 * reaproveitando `MapaStore`, o mesmo store da tela normal.
 *
 * `->landscape()`: a tabela de comparação (preço por fornecedor, várias
 * colunas) fica larga demais para A4 retrato com mais de 2-3
 * fornecedores.
 */
class MapaPdfController extends Controller
{
    public function relatorioMapa(Request $request, Mapa $mapa)
    {
        $user = $request->user();

        $tokenTemporario = $user->createToken(
            'impressao-pdf-mapa-' . $mapa->id,
            ['*'],
            now()->addMinutes(2),
        );

        $baseFrontend = rtrim((string) config('pdf.frontend_url'), '/');
        $baseApi = (string) config('pdf.api_url');
        $url = "{$baseFrontend}/imprimir/obras/{$mapa->obra_id}/mapas/{$mapa->id}"
            . '?token=' . urlencode($tokenTemporario->plainTextToken)
            . '&apiUrl=' . urlencode($baseApi);

        try {
            $pdf = Browsershot::url($url)
                ->setChromePath((string) config('pdf.chrome_path'))
                ->noSandbox() // necessário: sem isso o Chromium recusa abrir dentro do container
                ->setNodeEnv(['HOME' => '/tmp']) // ver RelatorioPdfController — mesma correção do crashpad
                ->waitUntilNetworkIdle()
                ->format('A4')
                ->landscape()
                ->margins(10, 8, 14, 8)
                ->showBackground()
                ->timeout(30)
                ->pdf();
        } finally {
            $tokenTemporario->accessToken->delete();
        }

        $nomeArquivo = str('mapa-' . ($mapa->numero_mapa ?: $mapa->id))->slug() . '.pdf';

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$nomeArquivo}\"",
        ]);
    }
}
