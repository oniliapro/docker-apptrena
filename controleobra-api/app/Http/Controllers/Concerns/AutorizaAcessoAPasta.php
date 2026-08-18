<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Pasta;

/**
 * Checagem de privacidade de "Arquivos próprios" — a única garantia de
 * acesso que o global scope de empresa (PertenceAEmpresa) NÃO cobre
 * sozinho: uma pasta com owner_user_id preenchido só pode ser acessada
 * pelo próprio dono, mesmo sendo da mesma empresa. Regras `exists:`
 * de validação não passam pelo global scope, então todo controller que
 * recebe um pasta_id/arquivo_id de fora precisa revalidar a posse aqui.
 */
trait AutorizaAcessoAPasta
{
    protected function autorizarPasta(Pasta $pasta): void
    {
        if ($pasta->owner_user_id !== null && $pasta->owner_user_id !== auth()->id()) {
            abort(403, 'Você não tem acesso a esta pasta.');
        }
    }

    /**
     * Busca uma pasta respeitando o escopo de empresa (Pasta::find já
     * aplica o global scope) e, em seguida, a privacidade por usuário.
     */
    protected function encontrarPastaAutorizada(string $id): Pasta
    {
        $pasta = Pasta::find($id);
        if (!$pasta) {
            abort(404, 'Pasta não encontrada.');
        }

        $this->autorizarPasta($pasta);

        return $pasta;
    }
}
