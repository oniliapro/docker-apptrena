<?php

namespace App\Services\WhatsApp;

use App\Models\DiarioRegistro;
use App\Models\DiarioWhatsAppNotificacao;
use App\Models\Obra;
use App\Models\ObraContratanteLink;
use Illuminate\Support\Facades\Log;

/**
 * Implementação padrão de `WhatsAppNotifier` (08/09/2026) — NÃO envia
 * mensagem de verdade (nenhum provedor foi decidido ainda). Só grava a
 * intenção em log + na tabela `diario_whatsapp_notificacoes`, uma linha
 * por link de contratante ativo da obra, com status `pendente`.
 *
 * Trocar de provedor no futuro (WhatsApp Business API oficial,
 * Twilio, Z-API etc.) é só criar outra classe implementando
 * `WhatsAppNotifier` e trocar o binding em `AppServiceProvider` — o
 * resto do sistema (o `finalizar()` do `DiarioObraController`) não
 * muda.
 */
class LogWhatsAppNotifier implements WhatsAppNotifier
{
    public function notificarNovoDiario(Obra $obra, DiarioRegistro $registro, string $linkPublico): void
    {
        $links = ObraContratanteLink::where('obra_id', $obra->id)->get()
            ->filter(fn (ObraContratanteLink $link) => $link->estaValido());

        if ($links->isEmpty()) {
            Log::info('[WhatsApp/DiarioObra] Nenhum link de contratante ativo para notificar.', [
                'obra_id' => $obra->id,
                'registro_id' => $registro->id,
            ]);

            return;
        }

        foreach ($links as $link) {
            Log::info('[WhatsApp/DiarioObra] Notificação pendente de provedor real.', [
                'obra_id' => $obra->id,
                'registro_id' => $registro->id,
                'telefone' => $link->telefone_whatsapp,
                'link' => $linkPublico,
            ]);

            DiarioWhatsAppNotificacao::create([
                'registro_id' => $registro->id,
                'obra_contratante_link_id' => $link->id,
                'telefone' => $link->telefone_whatsapp,
                'status' => 'pendente',
            ]);
        }
    }
}
