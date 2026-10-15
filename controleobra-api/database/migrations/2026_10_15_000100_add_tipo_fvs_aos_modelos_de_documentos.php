<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ficha de Verificação de Serviço como DOCUMENTO (15/10/2026, pedido do
 * Lucas: "a ficha vai ser um documento e não apenas um checklist").
 *
 *  - `contrato_modelos.tipo` ganha `fvs`: o modelo de documento da ficha,
 *    escrito no mesmo editor visual dos contratos (cabeçalho, rodapé, papel
 *    timbrado, estilos) com as variáveis da ficha e a tabela de verificação;
 *  - `fvs_modelos.contrato_modelo_id`: qual documento formata a ficha desse
 *    modelo de checklist (o checklist continua definindo QUAIS itens são
 *    verificados; o documento define COMO a ficha é impressa).
 *
 * Sem chave estrangeira de propósito: apagar o modelo de documento não pode
 * ser bloqueado por um checklist apontando pra ele — a ficha cai no primeiro
 * modelo `fvs` ativo (ver `ContratoPdfController::fvs`).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE contrato_modelos MODIFY tipo ENUM('empreita','obra','proposta','fvs') NOT NULL");

        Schema::table('fvs_modelos', function (Blueprint $table) {
            $table->string('contrato_modelo_id', 36)->nullable()->after('itens');
        });
    }

    public function down(): void
    {
        Schema::table('fvs_modelos', function (Blueprint $table) {
            $table->dropColumn('contrato_modelo_id');
        });

        DB::table('contrato_modelos')->where('tipo', 'fvs')->delete();
        DB::statement("ALTER TABLE contrato_modelos MODIFY tipo ENUM('empreita','obra','proposta') NOT NULL");
    }
};
