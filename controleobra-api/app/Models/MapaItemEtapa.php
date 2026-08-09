<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MapaItemEtapa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = ['id', 'mapa_item_id', 'ordem', 'eap_item_id', 'valor'];

    protected $casts = ['valor' => 'float'];

    public function mapaItem(): BelongsTo
    {
        return $this->belongsTo(MapaItem::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }
}
