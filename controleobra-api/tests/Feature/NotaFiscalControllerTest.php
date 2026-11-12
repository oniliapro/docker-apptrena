<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Leitura de nota fiscal por foto (`NotaFiscalController`). A IA é sempre
 * simulada com `Http::fake()` — nada sai pra API da Anthropic. Os
 * middlewares (login, permissão) ficam desligados: o que se testa aqui é
 * o controller e as mensagens que o frontend mostra pro usuário.
 */
class NotaFiscalControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware();
        config(['services.anthropic.key' => 'chave-de-teste']);
    }

    private function respostaDaIa(string $texto): array
    {
        return ['content' => [['type' => 'text', 'text' => $texto]]];
    }

    public function test_le_a_nota_e_devolve_os_campos(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response($this->respostaDaIa(
                '```json' . "\n" . '{"fornecedor":"Casa do Construtor","data":"2026-11-10","valor_total":1234.5,"descricao":"Cimento","numero_nota":"4512"}' . "\n```"
            )),
        ]);

        $this->post('/api/pagamentos/ler-nota', ['imagem' => UploadedFile::fake()->image('nota.jpg')])
            ->assertOk()
            ->assertExactJson([
                'ok' => true,
                'dados' => [
                    'fornecedor' => 'Casa do Construtor',
                    'data' => '2026-11-10',
                    'valor_total' => 1234.5,
                    'descricao' => 'Cimento',
                    'numero_nota' => '4512',
                ],
            ]);
    }

    public function test_formato_nao_suportado_tem_mensagem_em_portugues(): void
    {
        Http::fake();

        $this->postJson('/api/pagamentos/ler-nota', [
            'imagem' => UploadedFile::fake()->create('nota.heic', 100, 'image/heic'),
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.imagem.0', 'Formato de foto não suportado. Use JPG, PNG ou WEBP.');

        Http::assertNothingSent();
    }

    public function test_foto_grande_demais_tem_mensagem_em_portugues(): void
    {
        Http::fake();

        $this->postJson('/api/pagamentos/ler-nota', [
            'imagem' => UploadedFile::fake()->image('nota.jpg')->size(7500),
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.imagem.0', 'A foto passa de 7 MB. Use uma foto menor.');

        Http::assertNothingSent();
    }

    public function test_sem_foto_tem_mensagem_em_portugues(): void
    {
        $this->postJson('/api/pagamentos/ler-nota', [])
            ->assertStatus(422)
            ->assertJsonPath('errors.imagem.0', 'Selecione a foto da nota fiscal.');
    }

    public function test_ia_sobrecarregada(): void
    {
        Http::fake(['api.anthropic.com/*' => Http::response(['type' => 'error'], 529)]);

        $this->post('/api/pagamentos/ler-nota', ['imagem' => UploadedFile::fake()->image('nota.jpg')])
            ->assertStatus(502)
            ->assertJson([
                'ok' => false,
                'message' => 'A IA está sobrecarregada no momento. Tente de novo em instantes.',
            ]);
    }

    public function test_outro_erro_da_ia_mostra_o_codigo(): void
    {
        Http::fake(['api.anthropic.com/*' => Http::response(['type' => 'error'], 400)]);

        $this->post('/api/pagamentos/ler-nota', ['imagem' => UploadedFile::fake()->image('nota.jpg')])
            ->assertStatus(502)
            ->assertJson(['ok' => false, 'message' => 'Falha ao consultar a IA (HTTP 400).']);
    }

    public function test_ia_sem_resposta_a_tempo(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Operation timed out'));

        $this->post('/api/pagamentos/ler-nota', ['imagem' => UploadedFile::fake()->image('nota.jpg')])
            ->assertStatus(504)
            ->assertJson(['ok' => false, 'message' => 'A IA não respondeu a tempo. Tente de novo em instantes.']);
    }

    public function test_leitura_do_fornecedor_usa_as_mesmas_regras(): void
    {
        Http::fake();

        $this->postJson('/api/fornecedores/ler-nota', [
            'imagem' => UploadedFile::fake()->create('nota.heic', 100, 'image/heic'),
        ])
            ->assertStatus(422)
            ->assertJsonPath('errors.imagem.0', 'Formato de foto não suportado. Use JPG, PNG ou WEBP.');
    }
}
