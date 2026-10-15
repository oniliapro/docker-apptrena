<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Códigos dos cadastros com 4 dígitos (15/10/2026, pedido do Lucas: "um zero a
 * esquerda de todos os identificadores") — e o cadastro de empreiteiros
 * (profissionais) troca o prefixo `EMP-` por `PRO-`, porque `EMP-` passou a
 * ser a numeração das empreitas (`EMP-0001`, por obra):
 *
 *   Clientes      CLI-014   → CLI-0014   (campo `identificacao`)
 *   Responsáveis  RESP-014  → RESP-0014  (campo `codigo`)
 *   Fornecedores  FORN-014  → FORN-0014  (campo `codigo`)
 *   Empreiteiros  EMP-014   → PRO-0014   (campo `codigo`)
 *
 * Os cadastros ainda moram em JSON na tabela `app_storage` (ponte
 * chave-valor, uma linha por empresa e por cadastro). A troca é feita no
 * TEXTO do JSON, só no valor do campo do código — o resto do registro não é
 * lido nem reescrito (decodificar e codificar de novo poderia trocar `{}` por
 * `[]` em campos que ninguém tocou). Idempotente: código já no formato novo
 * não é alterado. Sem volta automática — restaurar o backup.
 */
return new class extends Migration
{
    /** key_name => [campo do código, prefixo antigo, prefixo novo] */
    private const CADASTROS = [
        'controleObra.clientes.v1' => ['identificacao', 'CLI', 'CLI'],
        'controleObra.responsaveis.v1' => ['codigo', 'RESP', 'RESP'],
        'controleObra.fornecedores.v1' => ['codigo', 'FORN', 'FORN'],
        'controleObra.empreiteiros.v1' => ['codigo', 'EMP', 'PRO'],
    ];

    public function up(): void
    {
        DB::transaction(function () {
            foreach (self::CADASTROS as $chave => [$campo, $antigo, $novo]) {
                $padrao = '/("' . preg_quote($campo, '/') . '"\s*:\s*")' . preg_quote($antigo, '/') . '-(\d+)(")/';

                foreach (DB::table('app_storage')->where('key_name', $chave)->get(['empresa_id', 'value']) as $linha) {
                    $valor = (string) $linha->value;
                    $convertido = preg_replace_callback(
                        $padrao,
                        fn (array $m) => $m[1] . $novo . '-' . str_pad((string) ((int) $m[2]), 4, '0', STR_PAD_LEFT) . $m[3],
                        $valor,
                    );

                    if ($convertido !== null && $convertido !== $valor) {
                        DB::table('app_storage')
                            ->where('empresa_id', $linha->empresa_id)
                            ->where('key_name', $chave)
                            ->update(['value' => $convertido]);
                    }
                }
            }

            // `PRO-NNN` (3 dígitos, cadastro já criado com o prefixo novo antes desta migration)
            // também passa a 4 dígitos.
            $padraoPro = '/("codigo"\s*:\s*")PRO-(\d{1,3})(")/';
            foreach (DB::table('app_storage')->where('key_name', 'controleObra.empreiteiros.v1')->get(['empresa_id', 'value']) as $linha) {
                $valor = (string) $linha->value;
                $convertido = preg_replace_callback(
                    $padraoPro,
                    fn (array $m) => $m[1] . 'PRO-' . str_pad((string) ((int) $m[2]), 4, '0', STR_PAD_LEFT) . $m[3],
                    $valor,
                );
                if ($convertido !== null && $convertido !== $valor) {
                    DB::table('app_storage')
                        ->where('empresa_id', $linha->empresa_id)
                        ->where('key_name', 'controleObra.empreiteiros.v1')
                        ->update(['value' => $convertido]);
                }
            }
        });
    }

    public function down(): void
    {
        // Sem volta automática (ver comentário da classe) — restaurar o backup.
    }
};
