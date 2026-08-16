<?php

namespace Database\Seeders;

use App\Models\Empresa;
use App\Models\User;
use Illuminate\Database\Seeder;

class UsuarioLucasSeeder extends Seeder
{
    public function run(): void
    {
        $empresa = Empresa::firstOrCreate(
            ['nome' => 'Empresa Lucas (teste)'],
            [
                'plano' => 'trial',
                'assinatura_status' => 'ativa',
                'assinatura_valida_ate' => now()->addYears(5),
            ]
        );

        // O model User já tem 'password' => 'hashed' no cast, então basta
        // passar o texto puro aqui — o Eloquent cuida do hash sozinho.
        User::updateOrCreate(
            ['email' => 'lucas@controleobra.local'],
            [
                'empresa_id' => $empresa->id,
                'papel' => 'admin',
                'name' => 'Lucas',
                'password' => '12345678',
                'email_verified_at' => now(),
            ]
        );
    }
}
