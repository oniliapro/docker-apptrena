<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MapaItem extends Model
{
    protected $table = 'mapa_itens';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'mapa_id', 'ordem', 'descricao', 'tipo_custo_id', 'quantidade',
        'unidade', 'etapa', 'eap_item_id', 'modo_etapa', 'escolha_fornecedor_id',
    ];

    protected $casts = ['quantidade' => 'float'];

    public function mapa(): BelongsTo
    {
        return $this->belongsTo(Mapa::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function fornecedorEscolhido(): BelongsTo
    {
        return $this->belongsTo(MapaFornecedor::class, 'escolha_fornecedor_id');
    }

    public function precos(): HasMany
    {
        return $this->hasMany(MapaItemPreco::class);
    }

    public function etapas(): HasMany
    {
        return $this->hasMany(MapaItemEtapa::class)->orderBy('ordem');
    }
}
