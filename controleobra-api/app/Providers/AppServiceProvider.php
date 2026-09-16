<?php

namespace App\Providers;

use App\Services\Notificacao\ContratanteNotifier;
use App\Services\Notificacao\EmailContratanteNotifier;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Diário de Obra — aviso ao contratante da obra por e-mail
        // (16/09/2026, item 12 dos pedidos de ajuste: decisão de trocar o
        // canal de WhatsApp — ainda sem provedor decidido — para e-mail).
        $this->app->bind(ContratanteNotifier::class, EmailContratanteNotifier::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
