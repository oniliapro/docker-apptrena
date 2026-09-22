<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Uma etapa da EAP de uma diária, com o percentual de divisão (F7). Ver a migration. */
class DiariaEtapa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $table = 'diaria_etapas';

    protected $fillable = ['id', 'diaria_id', 'eap_item_id', 'percentual'];

    protected $casts = ['percentual' => 'float'];

    public function diaria(): BelongsTo
    {
        return $this->belongsTo(Diaria::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class, 'eap_item_id');
    }
}
