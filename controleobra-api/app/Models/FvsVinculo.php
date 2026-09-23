<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Vínculo entre um modelo de FVS e um item de verdade da EAP (F10) — "qualquer
 * linha da EAP pode ter uma ou mais fichas": um item pode ter vários modelos
 * vinculados, e o mesmo modelo pode valer pra vários itens.
 *
 * Não usa PertenceAEmpresa: o isolamento vem do `eap_item_id` (a EAP já é
 * por obra/empresa) — mesma lógica de `DiariaEtapa`.
 */
class FvsVinculo extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'fvs_vinculos';

    protected $fillable = ['id', 'eap_item_id', 'fvs_modelo_id'];

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class, 'eap_item_id');
    }

    public function modelo(): BelongsTo
    {
        return $this->belongsTo(FvsModelo::class, 'fvs_modelo_id');
    }
}
