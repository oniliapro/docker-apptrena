<?php

namespace App\Providers;

use App\Services\WhatsApp\LogWhatsAppNotifier;
use App\Services\WhatsApp\WhatsAppNotifier;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Diário de Obra (08/09/2026) — provedor de WhatsApp ainda não
        // decidido, ver App\Services\WhatsApp\WhatsAppNotifier.
        $this->app->bind(WhatsAppNotifier::class, LogWhatsAppNotifier::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
