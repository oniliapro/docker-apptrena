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
        'valor', 'modo_valor',
    ];

    protected $casts = ['valor' => 'float'];

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
}
