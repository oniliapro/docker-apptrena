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
}
