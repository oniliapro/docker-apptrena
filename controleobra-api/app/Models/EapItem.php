<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EapItem extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'eap_itens';

    protected $fillable = [
        'id', 'obra_id', 'ordem', 'is_group', 'nivel', 'codigo_eap', 'descricao',
        'quantidade', 'unidade', 'bdi_mode', 'bdi_percent', 'bdi_value',
    ];

    protected $casts = [
        'is_group' => 'boolean',
        'nivel' => 'integer',
        'quantidade' => 'float',
        'bdi_percent' => 'float',
        'bdi_value' => 'float',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function custosPorTipo(): HasMany
    {
        return $this->hasMany(EapItemCusto::class);
    }

    public function orcadosCongelados(): HasMany
    {
        return $this->hasMany(EapItemOrcadoCongelado::class);
    }
}
