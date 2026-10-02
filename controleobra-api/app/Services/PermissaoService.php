<?php

namespace App\Services;

use App\Models\ModuloPermissao;
use App\Models\ObraAcesso;
use App\Models\User;

/**
 * Única fonte de verdade das duas camadas de permissão (31/08/2026,
 * pedido do Lucas, "Controle de permissões") — usada tanto pelos
 * middlewares (`PermissaoModulo`/`PermissaoObra`) quanto por qualquer
 * checagem pontual em controller (ex.: a exceção da EAP, ou a
 * filtragem manual nos `index()` que cruzam várias obras — Mapas,
 * Empreitas, Pagamentos, Diário de obra). Um usuário `admin` (dono da
 * empresa) sempre passa em tudo — as tabelas `modulo_permissoes`/
 * `obra_acessos` só existem pra usuários `'secundario'`.
 *
 * Todos os módulos de `MODULOS` estão protegidos de verdade nas rotas
 * (31/08/2026) — começou só com `mapas`/`eap` como prova de padrão,
 * depois estendido pros demais assim que o padrão (middleware por
 * módulo + middleware por obra, compostos na mesma rota) provou
 * funcionar. Clientes/Responsáveis/Empreiteiros/Fornecedores
 * continuam de fora — sem backend relacional próprio ainda.
 */
class PermissaoService
{
    public const ACOES = ['usar', 'criar', 'editar', 'excluir', 'reabrir'];

    /**
     * Lista completa de módulos que aparecem na matriz de permissão da
     * aba "Controle de permissões" — Clientes/Responsáveis/
     * Empreiteiros/Fornecedores ficam de fora por enquanto (ainda não
     * têm rota relacional própria, gravam pela ponte chave-valor
     * genérica `/api/storage`; dá pra incluir aqui quando/se ganharem
     * backend de verdade).
     */
    public const MODULOS = [
        'obras', 'eap', 'cronograma', 'desembolso', 'fluxo_caixa', 'medicoes',
        'mapas', 'empreitas', 'pagamentos', 'recebimentos', 'diarias', 'agenda', 'diario_obra', 'relatorios', 'arquivos',
        'contratos_equipamentos',
    ];

    /** Único módulo que ignora `pode_usar` — a EAP é sempre visível a quem tem acesso à obra. */
    public function ehExcecaoEap(string $modulo): bool
    {
        return $modulo === 'eap';
    }

    /**
     * `$acao` em `usar|criar|editar|excluir|reabrir`. `usar` checa só a
     * visibilidade; as outras ações exigem `pode_usar` E a flag
     * específica — um módulo que o usuário não pode nem ver não deveria
     * deixá-lo mutar via chamada direta à API. Exceção: pra `eap`, a
     * visibilidade conta como sempre concedida (não é lida da linha),
     * senão a exceção "EAP sempre visível" bloquearia até a EDIÇÃO dela
     * — a intenção é só pular a checagem de VISIBILIDADE, as ações finas
     * continuam exigindo a flag específica normalmente.
     */
    public function podeModulo(User $user, string $modulo, string $acao): bool
    {
        if ($user->ehAdmin()) return true;
        if (!$user->ativo) return false;

        $permissao = ModuloPermissao::where('user_id', $user->id)
            ->where('modulo', $modulo)
            ->first();

        $podeUsar = $this->ehExcecaoEap($modulo) ? true : (bool) ($permissao->pode_usar ?? false);

        if ($acao === 'usar') return $podeUsar;
        if (!$podeUsar || !$permissao) return false;

        return match ($acao) {
            'criar' => $permissao->pode_criar,
            'editar' => $permissao->pode_editar,
            'excluir' => $permissao->pode_excluir,
            'reabrir' => $permissao->pode_reabrir,
            default => false,
        };
    }

    /**
     * `$tipo` em `ver|lancar`. 31/08/2026, pedido do Lucas: o padrão
     * mudou pra "aberto por exceção" — sem linha em `obra_acessos`, o
     * usuário TEM acesso (todas as obras liberadas por padrão); só uma
     * linha explícita com a flag em `false` restringe. Antes disso era
     * o oposto (fail-closed) e causava o efeito confuso de "dei
     * permissão no módulo mas o usuário continua sem entrar na obra" —
     * agora só existe UM lugar a menos pra configurar quando não precisa
     * restringir nada.
     */
    public function podeObra(User $user, string $obraId, string $tipo): bool
    {
        if ($user->ehAdmin()) return true;
        if (!$user->ativo) return false;

        $acesso = ObraAcesso::where('user_id', $user->id)
            ->where('obra_id', $obraId)
            ->first();

        if (!$acesso) return true;

        return $tipo === 'lancar' ? $acesso->pode_lancar : $acesso->pode_ver;
    }
}
