<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

/**
 * Isolamento multiempresa "à prova de esquecimento": qualquer consulta
 * feita através do Eloquent (index, show via route-model-binding, update,
 * delete) só enxerga registros da empresa do usuário autenticado — mesmo
 * que um controller novo esqueça de filtrar manualmente por empresa_id.
 *
 * Ao criar um registro sem empresa_id explícito, preenche automaticamente
 * com a empresa do usuário logado.
 *
 * Fora de um request autenticado (seeders, comandos artisan, testes), o
 * escopo não é aplicado — nesses contextos não existe "usuário logado" pra
 * filtrar por ele.
 */
trait PertenceAEmpresa
{
    protected static function bootPertenceAEmpresa(): void
    {
        static::addGlobalScope('empresa', function (Builder $builder) {
            if (auth()->check() && auth()->user()->empresa_id) {
                $builder->where($builder->getModel()->getTable().'.empresa_id', auth()->user()->empresa_id);
            }
        });

        static::creating(function ($model) {
            if (empty($model->empresa_id) && auth()->check() && auth()->user()->empresa_id) {
                $model->empresa_id = auth()->user()->empresa_id;
            }
        });
    }
}
