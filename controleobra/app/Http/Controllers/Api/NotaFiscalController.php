<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Leitura de nota fiscal / recibo via IA com visão (Anthropic Claude).
 *
 * Recebe uma imagem, manda pra API da Anthropic com um prompt pedindo os
 * dados estruturados de volta, e devolve isso pronto pro front preencher o
 * formulário de pagamento. Não grava nada sozinho — quem confirma e salva é
 * sempre o usuário, no modal normal de pagamento.
 *
 * Requer ANTHROPIC_API_KEY configurada no .env. Sem isso, devolve uma
 * mensagem clara em vez de erro genérico.
 */
class NotaFiscalController extends Controller
{
    public function ler(Request $request)
    {
        $request->validate([
            'imagem' => 'required|file|mimes:jpg,jpeg,png,webp|max:8192',
        ]);

        $apiKey = config('services.anthropic.key');
        if (!$apiKey) {
            return response()->json([
                'ok' => false,
                'message' => 'Leitura de nota fiscal por IA ainda não configurada. Defina ANTHROPIC_API_KEY no .env do backend.',
            ], 422);
        }

        $arquivo = $request->file('imagem');
        $mime = $arquivo->getMimeType();
        $base64 = base64_encode(file_get_contents($arquivo->getRealPath()));

        $prompt = <<<PROMPT
Você é um assistente que extrai dados de notas fiscais e recibos de obras de
construção civil. Analise a imagem enviada e devolva SOMENTE um JSON válido
(sem texto antes ou depois, sem marcação markdown, sem crases), com
exatamente estes campos:

{
  "fornecedor": string ou null,
  "data": string no formato YYYY-MM-DD (data de emissão) ou null,
  "valor_total": número decimal (ex.: 1234.56) ou null,
  "descricao": string curta resumindo o que foi comprado ou o serviço prestado,
  "numero_nota": string com o número do documento fiscal, ou null se não houver
}

Se não conseguir identificar algum campo com confiança, use null nele. Não
invente valores.
PROMPT;

        try {
            $resposta = Http::withHeaders([
                'x-api-key' => $apiKey,
                'anthropic-version' => '2023-06-01',
                'content-type' => 'application/json',
            ])->timeout(45)->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model', 'claude-sonnet-4-5'),
                'max_tokens' => 1024,
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'image',
                            'source' => [
                                'type' => 'base64',
                                'media_type' => $mime,
                                'data' => $base64,
                            ],
                        ],
                        [
                            'type' => 'text',
                            'text' => $prompt,
                        ],
                    ],
                ]],
            ]);

            if ($resposta->failed()) {
                return response()->json([
                    'ok' => false,
                    'message' => 'Falha ao consultar a IA (HTTP ' . $resposta->status() . ').',
                ], 502);
            }

            $texto = trim((string) $resposta->json('content.0.text', ''));
            // remove eventuais cercas de código, caso o modelo devolva ```json ... ```
            $texto = preg_replace('/^```(json)?/i', '', $texto);
            $texto = preg_replace('/```$/', '', $texto);
            $texto = trim($texto);

            $dados = json_decode($texto, true);
            if (!is_array($dados)) {
                return response()->json([
                    'ok' => false,
                    'message' => 'Não foi possível interpretar a resposta da IA.',
                ], 502);
            }

            return response()->json([
                'ok' => true,
                'dados' => [
                    'fornecedor' => $dados['fornecedor'] ?? null,
                    'data' => $dados['data'] ?? null,
                    'valor_total' => $dados['valor_total'] ?? null,
                    'descricao' => $dados['descricao'] ?? null,
                    'numero_nota' => $dados['numero_nota'] ?? null,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => 'Erro ao chamar a IA: ' . $e->getMessage(),
            ], 500);
        }
    }
}
