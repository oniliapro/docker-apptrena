<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Nova numeração de obras e empreitas (15/10/2026, pedido do Lucas).
 *
 * - Obra: `OBR-011` → `OBR-0011` (um zero a mais à esquerda, 4 dígitos).
 * - Empreita: `OBR-OBR-011-EMP-001` (o prefixo da obra entrava duas vezes,
 *   porque `map_number` já traz "OBR-") → `EMP-0001`, com a sequência POR
 *   OBRA — cada obra tem a sua EMP-0001. O número que a empreita já tinha na
 *   sequência da obra é mantido; só se houver repetido dentro da mesma obra
 *   (acontecia quando uma empreita era excluída — o contador era
 *   `count()+1`) ela recebe o próximo livre.
 * - Tudo que guarda cópia do código da obra acompanha: `obra_number` das
 *   tabelas que têm (empreitas, pagamentos, recebimentos…) e o `codigo` dos
 *   mapas ("MAPA-OBR-011-02" → "MAPA-OBR-0011-02").
 *
 * É uma migration de DADOS e não tem volta automática: se algo der errado,
 * restaurar o backup que se faz antes da publicação.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            $this->renumerarObras();
            $this->renumerarEmpreitas();
        });
    }

    public function down(): void
    {
        // Sem volta automática (ver comentário da classe) — restaurar o backup.
    }

    private function renumerarObras(): void
    {
        $obras = DB::table('obras')->select('id', 'empresa_id', 'map_number')->get();

        // (empresa, código) já em uso — a unicidade da coluna é por empresa.
        $emUso = [];
        foreach ($obras as $obra) {
            $emUso[$obra->empresa_id . '|' . $obra->map_number] = true;
        }

        $tabelasComObraNumber = array_values(array_filter(
            array_map(fn ($t) => $t['name'], Schema::getTables()),
            fn (string $tabela) => Schema::hasColumns($tabela, ['obra_number', 'obra_id']),
        ));
        $temMapas = Schema::hasTable('mapas') && Schema::hasColumns('mapas', ['codigo', 'obra_id']);

        foreach ($obras as $obra) {
            $antigo = trim((string) $obra->map_number);
            if (!preg_match('/^OBR-(\d+)$/', $antigo, $m)) {
                continue;
            }

            $novo = 'OBR-' . str_pad((string) ((int) $m[1]), 4, '0', STR_PAD_LEFT);
            if ($novo === $antigo || isset($emUso[$obra->empresa_id . '|' . $novo])) {
                continue; // já está no formato novo, ou o código novo já existe (não força)
            }

            DB::table('obras')->where('id', $obra->id)->update(['map_number' => $novo]);
            $emUso[$obra->empresa_id . '|' . $novo] = true;

            foreach ($tabelasComObraNumber as $tabela) {
                DB::table($tabela)
                    ->where('obra_id', $obra->id)
                    ->where('obra_number', $obra->map_number)
                    ->update(['obra_number' => $novo]);
            }

            if ($temMapas) {
                $prefixoAntigo = 'MAPA-' . $antigo . '-';
                foreach (DB::table('mapas')->where('obra_id', $obra->id)->where('codigo', 'like', $prefixoAntigo . '%')->get(['id', 'codigo']) as $mapa) {
                    DB::table('mapas')->where('id', $mapa->id)->update([
                        'codigo' => 'MAPA-' . $novo . '-' . substr($mapa->codigo, strlen($prefixoAntigo)),
                    ]);
                }
            }
        }
    }

    private function renumerarEmpreitas(): void
    {
        $empreitas = DB::table('empreitas')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'obra_id', 'numero_empreita']);

        $porObra = [];
        foreach ($empreitas as $empreita) {
            $porObra[(string) $empreita->obra_id][] = $empreita;
        }

        foreach ($porObra as $lista) {
            // Passo 1: quem tem um número de sequência próprio e único na obra fica com ele.
            $usados = [];
            $definitivo = [];
            foreach ($lista as $empreita) {
                $sequencia = preg_match('/(\d+)\s*$/', (string) $empreita->numero_empreita, $m) ? (int) $m[1] : 0;
                if ($sequencia > 0 && !isset($usados[$sequencia])) {
                    $usados[$sequencia] = true;
                    $definitivo[$empreita->id] = $sequencia;
                }
            }

            // Passo 2: sem número aproveitável (ou repetido) → próximo livre, em ordem de criação.
            $proximo = $usados ? max(array_keys($usados)) : 0;
            foreach ($lista as $empreita) {
                if (!isset($definitivo[$empreita->id])) {
                    $proximo++;
                    $definitivo[$empreita->id] = $proximo;
                }
            }

            foreach ($lista as $empreita) {
                DB::table('empreitas')->where('id', $empreita->id)->update([
                    'numero_empreita' => 'EMP-' . str_pad((string) $definitivo[$empreita->id], 4, '0', STR_PAD_LEFT),
                ]);
            }
        }
    }
};
