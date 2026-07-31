<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mapa extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'numero_mapa', 'descricao', 'cliente', 'responsavel_mapa',
        'responsavel_obra', 'data_finalizacao', 'data_necessidade', 'frete_particular',
        'modo_manual', 'is_confirmed', 'confirmed_at', 'total_mapa',
    ];

    protected $casts = [
        'data_finalizacao' => 'date',
        'data_necessidade' => 'date',
        'frete_particular' => 'float',
        'modo_manual' => 'boolean',
        'is_confirmed' => 'boolean',
        'confirmed_at' => 'date',
        'total_mapa' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function fornecedores(): HasMany
    {
        return $this->hasMany(MapaFornecedor::class)->orderBy('ordem');
    }

    public function itens(): HasMany
    {
        return $this->hasMany(MapaItem::class)->orderBy('ordem');
    }

    public function pagamentos(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }
}
