<?php

namespace App\Services\Notificacao;

use App\Mail\NovoDiarioDisponivel;
use App\Models\DiarioRegistro;
use App\Models\Obra;
use App\Models\ObraContratanteLink;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Implementação padrão de `ContratanteNotifier` (16/09/2026) — envia um
 * e-mail ("tem diário novo disponível") pra cada link de contratante
 * ativo da obra que tiver e-mail cadastrado. Sem provedor SMTP
 * configurado em produção, `MAIL_MAILER` cai no padrão `log` do
 * Laravel (ver `config/mail.php`), então o e-mail só é gravado no log
 * até o Lucas configurar as credenciais — mesmo efeito prático do
 * antigo `LogWhatsAppNotifier` enquanto não havia provedor decidido.
 */
class EmailContratanteNotifier implements ContratanteNotifier
{
    public function notificarNovoDiario(Obra $obra, DiarioRegistro $registro, string $linkPublico): void
    {
        $links = ObraContratanteLink::where('obra_id', $obra->id)->get()
            ->filter(fn (ObraContratanteLink $link) => $link->estaValido());

        if ($links->isEmpty()) {
            Log::info('[E-mail/DiarioObra] Nenhum link de contratante ativo para notificar.', [
                'obra_id' => $obra->id,
                'registro_id' => $registro->id,
            ]);

            return;
        }

        foreach ($links as $link) {
            if (empty($link->email)) {
                Log::info('[E-mail/DiarioObra] Link de contratante sem e-mail cadastrado — aviso não enviado.', [
                    'obra_id' => $obra->id,
                    'registro_id' => $registro->id,
                    'obra_contratante_link_id' => $link->id,
                ]);

                continue;
            }

            Mail::to($link->email)->send(new NovoDiarioDisponivel($obra, $registro, $linkPublico));
        }
    }
}
