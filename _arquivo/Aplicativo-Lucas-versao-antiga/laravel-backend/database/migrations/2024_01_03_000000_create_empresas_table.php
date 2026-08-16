<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Empresas = os clientes que compram/assinam o sistema (multiempresa).
 * Cada empresa tem os próprios usuários e os próprios dados (obras, EAP,
 * mapas, empreitas, pagamentos) — nunca visíveis para outra empresa.
 *
 * assinatura_status começa em "trial" (período de teste). Quando a
 * integração de pagamento existir, um webhook do gateway (Stripe/Mercado
 * Pago) atualiza esse campo pra "ativa"/"inadimplente"/"cancelada".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('empresas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nome');
            $table->string('cnpj', 20)->nullable();
            $table->string('plano', 40)->default('trial');
            $table->string('assinatura_status', 20)->default('trial');
            $table->timestamp('assinatura_valida_ate')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('empresas');
    }
};
