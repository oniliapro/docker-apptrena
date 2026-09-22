<?php

namespace App\Console\Commands;

use App\Models\MaterialEquipamento;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Copia os nomes dos catálogos de equipamento antigos (Diário antigo e RDO)
 * para o cadastro "Materiais e equipamentos" (F6, 22/09/2026).
 *
 * Idempotente: só cria o que ainda não existe (mesmo nome no mesmo tipo e
 * empresa) e nunca altera ou apaga as tabelas antigas. `--dry-run` só mostra
 * o que faria.
 */
class MigrarEquipamentosParaCadastro extends Command
{
    protected $signature = 'cadastros:migrar-equipamentos {--dry-run : Só mostra o que seria criado}';

    protected $description = 'Copia os equipamentos dos catálogos do Diário antigo e do RDO para Materiais e equipamentos';

    public function handle(): int
    {
        $seco = (bool) $this->option('dry-run');
        $origens = [
            'equipamentos_catalogo' => 'Diário antigo',
            'rdo_equipamentos_catalogo' => 'RDO',
        ];

        $criados = 0;
        $jaExistiam = 0;

        foreach ($origens as $tabela => $rotulo) {
            $linhas = DB::table($tabela)->select('empresa_id', 'nome')->orderBy('nome')->get();

            foreach ($linhas as $linha) {
                $nome = trim((string) $linha->nome);
                if ($nome === '') {
                    continue;
                }

                // A comparação usa a collation do MySQL (sem distinção de maiúsculas/acentos).
                $existe = MaterialEquipamento::withoutGlobalScopes()
                    ->where('empresa_id', $linha->empresa_id)
                    ->where('tipo', 'equipamento')
                    ->where('nome', $nome)
                    ->exists();

                if ($existe) {
                    $jaExistiam++;
                    continue;
                }

                $this->line(($seco ? '[simulação] ' : '').$rotulo.': "'.$nome.'" (empresa '.$linha->empresa_id.')');
                if (!$seco) {
                    MaterialEquipamento::withoutGlobalScopes()->create([
                        'id' => (string) Str::uuid(),
                        'empresa_id' => $linha->empresa_id,
                        'tipo' => 'equipamento',
                        'nome' => $nome,
                    ]);
                }
                $criados++;
            }
        }

        $this->info(($seco ? 'Simulação: ' : '').$criados.' cadastro(s) '.($seco ? 'seriam criados' : 'criados').'; '.$jaExistiam.' já existiam.');

        return self::SUCCESS;
    }
}
