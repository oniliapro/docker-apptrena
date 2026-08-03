<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pagamento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    /** 'pendente' (gerado automático, ainda não conferido) | 'confirmado'. */
    public const STATUS_OPCOES = ['pendente', 'confirmado'];

    protected $fillable = [
        'id', 'empresa_id', 'numero_pagamento', 'obra_id', 'obra_number', 'data_solicitacao',
        'data_pagamento', 'fornecedor', 'descricao', 'valor_total', 'origem_tipo',
        'origem_ref_id', 'mapa_id', 'empreita_id', 'status',
    ];

    protected $casts = [
        'data_solicitacao' => 'date',
        'data_pagamento' => 'date',
        'valor_total' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function mapa(): BelongsTo
    {
        return $this->belongsTo(Mapa::class);
    }

    public function empreita(): BelongsTo
    {
        return $this->belongsTo(Empreita::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(PagamentoItem::class)->orderBy('ordem');
    }
}
