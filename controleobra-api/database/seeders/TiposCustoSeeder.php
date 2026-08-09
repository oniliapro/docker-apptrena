<?php

namespace Database\Seeders;

use App\Models\TipoCusto;
use Illuminate\Database\Seeder;

/**
 * Traduzido de banco-de-dados/02-seed-tipos-custo.sql
 * Mantém os mesmos IDs/chaves que o frontend já usa (unit.material, unit.maoDeObra, ...).
 */
class TiposCustoSeeder extends Seeder
{
    public function run(): void
    {
        $tipos = [
            ['id' => 1, 'chave' => 'material', 'rotulo' => 'Material', 'ordem' => 1],
            ['id' => 2, 'chave' => 'maoDeObra', 'rotulo' => 'Mao de obra', 'ordem' => 2],
            ['id' => 3, 'chave' => 'equipamento', 'rotulo' => 'Equipamento', 'ordem' => 3],
            ['id' => 4, 'chave' => 'outros', 'rotulo' => 'Outros', 'ordem' => 4],
            ['id' => 5, 'chave' => 'administracao', 'rotulo' => 'Administracao', 'ordem' => 5],
        ];

        foreach ($tipos as $tipo) {
            TipoCusto::updateOrCreate(['id' => $tipo['id']], $tipo);
        }
    }
}
