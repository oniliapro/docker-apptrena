<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Empreita extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'obra_number', 'numero_empreita', 'empreiteiro',
        'descricao_empreita', 'medicao_date', 'competencia', 'obs', 'total_empreita',
        'total_pago', 'atualizado_em',
    ];

    protected $casts = [
        'medicao_date' => 'date',
        'atualizado_em' => 'datetime',
        'total_empreita' => 'float',
        'total_pago' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function tiposIncluidos(): HasMany
    {
        return $this->hasMany(EmpreitaTipoIncluido::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(EmpreitaItem::class)->orderBy('ordem');
    }

    public function registros(): HasMany
    {
        return $this->hasMany(EmpreitaRegistro::class);
    }

    public function pagamentos(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }
}
