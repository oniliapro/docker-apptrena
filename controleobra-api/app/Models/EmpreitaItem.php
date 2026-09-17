<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmpreitaItem extends Model
{
    protected $table = 'empreita_itens';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'empreita_id', 'ordem', 'eap_item_id', 'tipo_custo_id', 'qtde_contratada', 'descricao',
        'contrato_emp', 'contrato_reserva', 'medicao_acum', 'medicao_atual',
        'pagamento_emp', 'pagamento_reserva',
    ];

    protected $casts = [
        'qtde_contratada' => 'float',
        'contrato_emp' => 'float',
        'contrato_reserva' => 'float',
        'medicao_acum' => 'float',
        'medicao_atual' => 'float',
        'pagamento_emp' => 'float',
        'pagamento_reserva' => 'float',
    ];

    public function empreita(): BelongsTo
    {
        return $this->belongsTo(Empreita::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }
}
