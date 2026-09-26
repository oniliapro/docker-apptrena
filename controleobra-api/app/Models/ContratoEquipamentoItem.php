<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Um item (equipamento) de um contrato. `devolvido_em` nulo = ainda com o
 * cliente ("equipamentos atuais" na lista de contratos). O valor unitário é
 * sempre o ATUAL/negociado — o histórico de valores fica congelado nos itens
 * do Pagamento gerado em cada renovação, não aqui.
 *
 * Não usa PertenceAEmpresa: o isolamento multiempresa vem do
 * ContratoEquipamento pai (cascade delete + sempre acessado através dele).
 */
class ContratoEquipamentoItem extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'contrato_equipamento_itens';

    protected $fillable = ['id', 'contrato_id', 'descricao', 'eap_item_id', 'quantidade', 'valor_unitario', 'devolvido_em', 'ordem'];

    protected $casts = [
        'quantidade' => 'integer',
        'valor_unitario' => 'float',
        'devolvido_em' => 'date',
        'ordem' => 'integer',
    ];

    public function contrato(): BelongsTo
    {
        return $this->belongsTo(ContratoEquipamento::class, 'contrato_id');
    }
}
