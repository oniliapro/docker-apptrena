<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mirror de `PagamentoItem.php`, mais simples: não existe a distinção
 * Empreiteiro/Reserva aqui (isso é específico do contrato de empreitada),
 * então não replica `parcela_empreita`/`empreita_item_id`/`valor_referencia`.
 */
class RecebimentoItem extends Model
{
    protected $table = 'recebimento_itens';

    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id', 'recebimento_id', 'ordem', 'descricao', 'tipo_custo_id', 'eap_item_id',
        'valor', 'modo_valor',
    ];

    protected $casts = ['valor' => 'float'];

    public function recebimento(): BelongsTo
    {
        return $this->belongsTo(Recebimento::class);
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
