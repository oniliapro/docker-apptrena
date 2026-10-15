<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Código do mapa por obra (15/10/2026, pedido do Lucas): "quero tirar a
 * identificação da obra, mas cada obra deve ter sua própria numeração, ou
 * seja o MAPA-0001 pode existir em mais de uma obra".
 *
 * - `codigo`: `MAPA-OBR-0011-02` → `MAPA-0002`.
 * - `numero_mapa`: `02` → `0002` (4 dígitos, igual aos demais códigos).
 * - A unicidade de `codigo` deixa de ser global e passa a ser POR OBRA
 *   (`obra_id` + `codigo`).
 *
 * O número que cada mapa já tinha na obra é mantido; só se houver repetido
 * dentro da mesma obra (ou número ilegível/vazio) ele recebe o próximo livre.
 * Mapas sem obra ficam num grupo à parte. Idempotente; sem volta automática
 * (restaurar o backup).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mapas', function (Blueprint $table) {
            $table->dropUnique('mapas_codigo_unique');
        });

        DB::transaction(function () {
            $porObra = [];
            foreach (DB::table('mapas')->orderBy('created_at')->orderBy('id')->get(['id', 'obra_id', 'numero_mapa']) as $mapa) {
                $porObra[(string) $mapa->obra_id][] = $mapa;
            }

            foreach ($porObra as $lista) {
                $usados = [];
                $definitivo = [];
                foreach ($lista as $mapa) {
                    $numero = preg_match('/^\s*(\d+)\s*$/', (string) $mapa->numero_mapa, $m) ? (int) $m[1] : 0;
                    if ($numero > 0 && !isset($usados[$numero])) {
                        $usados[$numero] = true;
                        $definitivo[$mapa->id] = $numero;
                    }
                }

                $proximo = $usados ? max(array_keys($usados)) : 0;
                foreach ($lista as $mapa) {
                    if (!isset($definitivo[$mapa->id])) {
                        $proximo++;
                        $definitivo[$mapa->id] = $proximo;
                    }
                }

                foreach ($lista as $mapa) {
                    $numero = str_pad((string) $definitivo[$mapa->id], 4, '0', STR_PAD_LEFT);
                    DB::table('mapas')->where('id', $mapa->id)->update([
                        'numero_mapa' => $numero,
                        'codigo' => 'MAPA-' . $numero,
                    ]);
                }
            }
        });

        Schema::table('mapas', function (Blueprint $table) {
            $table->unique(['obra_id', 'codigo'], 'mapas_obra_id_codigo_unique');
        });
    }

    public function down(): void
    {
        // Sem volta automática (ver comentário da classe) — restaurar o backup.
    }
};
