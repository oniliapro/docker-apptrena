<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmpreitaItemContratoTipo extends Model
{
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null; // chave composta (empreita_item_id, tipo_custo_id)
    protected $table = 'empreita_item_contrato_tipo';

    protected $fillable = ['empreita_item_id', 'tipo_custo_id', 'contrato_emp', 'contrato_reserva'];

    protected $casts = [
        'contrato_emp' => 'float',
        'contrato_reserva' => 'float',
    ];

    /**
     * Mesmo bug do EapItemCusto (corrigido 31/07/2026): sem isso, o
     * Eloquent monta a query de UPDATE como `WHERE null = ...` (porque
     * $primaryKey é null) e o valor lançado nunca é regravado depois da
     * primeira vez — fica preso no valor da criação.
     */
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
