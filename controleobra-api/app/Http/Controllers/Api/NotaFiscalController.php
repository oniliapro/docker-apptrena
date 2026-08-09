<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

/**
 * Leitura de documentos por IA com visão (Anthropic Claude).
 *
 * Recebe uma imagem, manda pra API da Anthropic com um prompt pedindo os
 * dados estruturados de volta. Não grava nada sozinho — quem confirma e
 * salva é sempre o usuário, no formulário normal (o campo de inclusão
 * manual continua existindo, isto só agiliza o preenchimento).
 *
 * Requer ANTHROPIC_API_KEY configurada no .env. Sem isso, devolve uma
 * mensagem clara em vez de erro genérico.
 *
 * Dois usos hoje, cada um com seu prompt (mesma mecânica de chamada à IA,
 * fatorada em `chamarIA()`):
 * - `ler()` — pagamentos/ler-nota (nota fiscal/recibo de um pagamento).
 * - `lerFornecedor()` — fornecedores/ler-nota (nota fiscal do fornecedor,
 *   pra preencher o cadastro em vez de digitar à mão — pedido do Lucas,
 *   04/08/2026).
 */
class NotaFiscalController extends Controller
{
    public function ler(Request $request)
    {
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

        return $this->processar($request, $prompt, [
            'fornecedor', 'data', 'valor_total', 'descricao', 'numero_nota',
        ]);
    }

    /**
     * fornecedores/ler-nota — lê uma nota fiscal do PRÓPRIO fornecedor (não
     * de um pagamento) pra extrair os dados de cadastro dele: nome,
     * tipo de pessoa, documento, endereço e especialidade.
     */
    public function lerFornecedor(Request $request)
    {
        $prompt = <<<PROMPT
Você é um assistente que extrai dados de cadastro a partir de uma nota fiscal
ou documento emitido por um fornecedor de obra de construção civil (o
EMISSOR do documento, não quem comprou). Analise a imagem enviada e devolva
SOMENTE um JSON válido (sem texto antes ou depois, sem marcação markdown,
sem crases), com exatamente estes campos:

{
  "nome": string com a razão social ou nome do fornecedor emissor, ou null,
  "tipo": "PF" se o documento do emissor for CPF, "PJ" se for CNPJ, ou null,
  "documento": string só com os dígitos do CPF ou CNPJ do emissor, ou null,
  "endereco": string com o endereço completo do emissor, ou null,
  "especialidade": string curta com o ramo de atividade do fornecedor
    (ex.: "Material elétrico", "Mão de obra hidráulica"), ou null
}

Se não conseguir identificar algum campo com confiança, use null nele. Não
invente valores.
PROMPT;

        return $this->processar($request, $prompt, [
            'nome', 'tipo', 'documento', 'endereco', 'especialidade',
        ]);
    }

    /**
     * Validação + chamada à IA + parse da resposta — comum aos dois usos
     * acima. `$campos` é a lista de chaves esperadas no JSON de retorno
     * (o que a IA não devolver vira null, nunca quebra por chave ausente).
     */
    private function processar(Request $request, string $prompt, array $campos)
    {
        $request->validate([
            'imagem' => 'required|file|mimes:jpg,jpeg,png,webp|max:8192',
        ]);

        $apiKey = config('services.anthropic.key');
        if (!$apiKey) {
            return response()->json([
                'ok' => false,
                'message' => 'Leitura por IA ainda não configurada. Defina ANTHROPIC_API_KEY no .env do backend.',
            ], 422);
        }

        /** @var UploadedFile $arquivo */
        $arquivo = $request->file('imagem');
        $mime = $arquivo->getMimeType();
        $base64 = base64_encode(file_get_contents($arquivo->getRealPath()));

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

            $saida = [];
            foreach ($campos as $campo) {
                $saida[$campo] = $dados[$campo] ?? null;
            }

            return response()->json(['ok' => true, 'dados' => $saida]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => 'Erro ao chamar a IA: ' . $e->getMessage(),
            ], 500);
        }
    }
}
