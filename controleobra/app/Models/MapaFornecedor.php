<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MapaFornecedor extends Model
{
    protected $table = 'mapa_fornecedores';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'mapa_id', 'ordem', 'fornecedor', 'contato', 'imposto_percent',
        'frete', 'desconto', 'desconto_parcial', 'ativo',
    ];

    protected $casts = [
        'imposto_percent' => 'float',
        'frete' => 'float',
        'desconto' => 'float',
        'desconto_parcial' => 'float',
        'ativo' => 'boolean',
    ];

    public function mapa(): BelongsTo
    {
        return $this->belongsTo(Mapa::class);
    }

    public function precos(): HasMany
    {
        return $this->hasMany(MapaItemPreco::class, 'fornecedor_id');
    }
}
