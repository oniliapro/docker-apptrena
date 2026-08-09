<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmpreitaRegistroLinha extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'empreita_registro_id', 'ordem', 'empreita_item_id', 'eap_item_id',
        'descricao', 'total_pagar_emp', 'total_reservar_pgto', 'total_periodo',
    ];

    protected $casts = [
        'total_pagar_emp' => 'float',
        'total_reservar_pgto' => 'float',
        'total_periodo' => 'float',
    ];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(EmpreitaRegistro::class, 'empreita_registro_id');
    }

    public function empreitaItem(): BelongsTo
    {
        return $this->belongsTo(EmpreitaItem::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipos(): HasMany
    {
        return $this->hasMany(EmpreitaRegistroLinhaTipo::class);
    }
}
