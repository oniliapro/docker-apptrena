<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EmpreitaItem extends Model
{
    protected $table = 'empreita_itens';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'empreita_id', 'ordem', 'eap_item_id', 'descricao', 'valor_emp',
        'valor_reserva', 'medicao_acum_legacy', 'medicao_atual_legacy',
    ];

    protected $casts = [
        'valor_emp' => 'float',
        'valor_reserva' => 'float',
        'medicao_acum_legacy' => 'float',
        'medicao_atual_legacy' => 'float',
    ];

    public function empreita(): BelongsTo
    {
        return $this->belongsTo(Empreita::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function medicoesPorTipo(): HasMany
    {
        return $this->hasMany(EmpreitaItemMedicaoTipo::class);
    }

    public function contratoPorTipo(): HasMany
    {
        return $this->hasMany(EmpreitaItemContratoTipo::class);
    }
}
