<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 27/09/2026, pedido do Lucas — status de contrato na Empreita: assinar o
 * contrato é marcado manualmente (`contrato_assinado`/`contrato_assinado_em`);
 * o arquivo do contrato assinado em si é anexado pelo mecanismo genérico já
 * existente de Pagamento/Recebimento (`Arquivo` com `origem_tipo='empreita'`,
 * ver `AnexoController`), sem precisar de coluna própria pra isso.
 *
 * `contrato_agenda_evento_id` guarda o lembrete de "assinatura pendente" —
 * criado quando o primeiro contrato é anexado e apagado quando marcado
 * assinado (mesmo padrão de lembrete de `ContratoEquipamento`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->boolean('contrato_assinado')->default(false)->after('medicao_habilitada');
            $table->dateTime('contrato_assinado_em')->nullable()->after('contrato_assinado');
            $table->string('contrato_agenda_evento_id', 36)->nullable()->after('contrato_assinado_em');

            $table->foreign('contrato_agenda_evento_id')->references('id')->on('agenda_eventos')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('empreitas', function (Blueprint $table) {
            $table->dropForeign(['contrato_agenda_evento_id']);
            $table->dropColumn(['contrato_assinado', 'contrato_assinado_em', 'contrato_agenda_evento_id']);
        });
    }
};
