<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmpreitaItemMedicaoTipo extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (empreita_item_id, tipo_custo_id)
    protected $table = 'empreita_item_medicoes_tipo';

    protected $fillable = ['empreita_item_id', 'tipo_custo_id', 'medicao_acum', 'medicao_atual'];

    protected $casts = [
        'medicao_acum' => 'float',
        'medicao_atual' => 'float',
    ];

    /** Mesmo bug do EapItemCusto (corrigido 31/07/2026) — ver aquele model. */
    protected function setKeysForSaveQuery($query)
    {
        return $query
            ->where('empreita_item_id', '=', $this->getAttribute('empreita_item_id'))
            ->where('tipo_custo_id', '=', $this->getAttribute('tipo_custo_id'));
    }

    protected function setKeysForSelectQuery($query)
    {
        return $this->setKeysForSaveQuery($query);
    }
}
