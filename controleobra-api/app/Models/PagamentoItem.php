<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PagamentoItem extends Model
{
    protected $table = 'pagamento_itens';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'pagamento_id', 'ordem', 'descricao', 'tipo_custo_id', 'eap_item_id',
        'valor', 'modo_valor', 'parcela_empreita', 'empreita_item_id', 'valor_referencia', 'diaria_id',
    ];

    protected $casts = ['valor' => 'float', 'valor_referencia' => 'float'];

    public function pagamento(): BelongsTo
    {
        return $this->belongsTo(Pagamento::class);
    }

    public function tipoCusto(): BelongsTo
    {
        return $this->belongsTo(TipoCusto::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class);
    }

    public function empreitaItem(): BelongsTo
    {
        return $this->belongsTo(EmpreitaItem::class);
    }

    public function diaria(): BelongsTo
    {
        return $this->belongsTo(Diaria::class);
    }
}
