<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Obra extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'empresa_id', 'map_number', 'obra_nome', 'cliente', 'data_base', 'responsavel',
        'local_obra', 'periodo', 'obs', 'bdi_scope', 'bdi_mode', 'bdi_percent',
        'bdi_value', 'is_confirmed', 'confirmed_at',
    ];

    protected $casts = [
        'data_base' => 'date',
        'confirmed_at' => 'date',
        'is_confirmed' => 'boolean',
        'bdi_percent' => 'float',
        'bdi_value' => 'float',
    ];

    public function eapItens(): HasMany
    {
        return $this->hasMany(EapItem::class)->orderBy('ordem');
    }

    public function bdiPorTipo(): HasMany
    {
        return $this->hasMany(ObraBdiTipo::class);
    }

    public function uiConfig(): HasOne
    {
        return $this->hasOne(ObraUiConfig::class);
    }

    public function tiposVisiveis(): HasMany
    {
        return $this->hasMany(ObraUiTipoVisivel::class);
    }

    public function mapas(): HasMany
    {
        return $this->hasMany(Mapa::class);
    }

    public function empreitas(): HasMany
    {
        return $this->hasMany(Empreita::class);
    }

    public function pagamentos(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }
}
