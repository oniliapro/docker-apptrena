<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Pagamentos PENDENTES gerados antes da correção de centavos (21/10/2026): o total e cada item
 * eram arredondados separadamente pelo banco e a soma dos itens ficava alguns centavos diferente
 * do total, o que impedia confirmar. Aqui o total volta a ser a soma exata dos itens — só quando
 * todos os itens são em reais e a diferença é ruído de arredondamento (no máximo meio centavo por
 * item). Pagamentos já confirmados NÃO são tocados.
 */
return new class extends Migration
{
    public function up(): void
    {
        $pendentes = DB::table('pagamentos')->where('status', 'pendente')->get(['id', 'valor_total']);

        foreach ($pendentes as $pagamento) {
            $itens = DB::table('pagamento_itens')->where('pagamento_id', $pagamento->id)->get(['valor', 'modo_valor']);

            if ($itens->isEmpty() || $itens->contains(fn ($i) => $i->modo_valor !== 'valor')) {
                continue;
            }

            $soma = round((float) $itens->sum('valor'), 2);
            $diferenca = abs($soma - (float) $pagamento->valor_total);
            $limite = 0.005 * ($itens->count() + 1) + 0.001;

            if ($diferenca > 0.0001 && $diferenca <= $limite) {
                DB::table('pagamentos')->where('id', $pagamento->id)->update(['valor_total' => $soma]);
            }
        }
    }

    public function down(): void
    {
        // Sem reversão: o total antigo (com a diferença de centavos) não é guardado.
    }
};
