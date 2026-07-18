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
}
