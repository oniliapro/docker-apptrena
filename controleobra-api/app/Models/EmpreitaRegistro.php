<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmpreitaRegistro extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    const UPDATED_AT = null; // tabela só tem created_at

    protected $fillable = [
        'id', 'empreita_id', 'data_medicao', 'competencia', 'obs',
        'total_pagar_emp', 'total_reservar_pgto', 'total_periodo',
    ];

    protected $casts = [
        'data_medicao' => 'date',
        'total_pagar_emp' => 'float',
        'total_reservar_pgto' => 'float',
        'total_periodo' => 'float',
    ];

    public function empreita(): BelongsTo
    {
        return $this->belongsTo(Empreita::class);
    }

    public function linhas(): HasMany
    {
        return $this->hasMany(EmpreitaRegistroLinha::class)->orderBy('ordem');
    }
}
