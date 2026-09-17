<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MedicaoItem extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'medicao_itens';

    protected $fillable = ['id', 'medicao_id', 'eap_item_id', 'ordem'];

    protected $casts = ['ordem' => 'integer'];

    public function medicao(): BelongsTo
    {
        return $this->belongsTo(Medicao::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function valoresPorTipo(): HasMany
    {
        return $this->hasMany(MedicaoItemTipo::class);
    }
}
