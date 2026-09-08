<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diário de Obra — módulo completo (08/09/2026, especificação
 * consolidada com a Onilia e o Lucas). Estende o v0 existente
 * (`diario_registros`/`diario_fotos`, migration de 2024) em vez de
 * substituí-lo.
 *
 * `autor_user_id` é adicional ao `autor` (string livre) que já existia —
 * mantido por compatibilidade/exibição, mas a partir de agora todo
 * registro novo grava o usuário autenticado de verdade em
 * `autor_user_id`, o que permite a assinatura automática (ver
 * `status`/`assinado_em`/`assinado_por_user_id`).
 *
 * `status`: 'rascunho' (ainda editável, aparece no relatório de
 * pendências de assinatura) ou 'finalizado' (assinado automaticamente
 * pelo usuário que criou/finalizou — é o responsável pela obra do lado
 * da contratada, nunca o contratante final).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('diario_registros', function (Blueprint $table) {
            $table->foreignId('autor_user_id')->nullable()->after('autor')
                ->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('finalizado')->after('descricao');
            $table->timestamp('assinado_em')->nullable()->after('status');
            $table->foreignId('assinado_por_user_id')->nullable()->after('assinado_em')
                ->constrained('users')->nullOnDelete();
            $table->integer('quantidade_operarios')->nullable()->after('clima');
            $table->text('impacto_cronograma')->nullable()->after('clima');
        });
    }

    public function down(): void
    {
        Schema::table('diario_registros', function (Blueprint $table) {
            $table->dropConstrainedForeignId('autor_user_id');
            $table->dropConstrainedForeignId('assinado_por_user_id');
            $table->dropColumn(['status', 'assinado_em', 'quantidade_operarios', 'impacto_cronograma']);
        });
    }
};
