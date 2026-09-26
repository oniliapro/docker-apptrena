<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Histórico de uma renovação de contrato de equipamento — sempre a partir do
 * vencimento anterior (`data_renovacao`), nunca da data de entrega original.
 *
 * Não usa PertenceAEmpresa: o isolamento multiempresa vem do
 * ContratoEquipamento pai (cascade delete + sempre acessado através dele).
 */
class ContratoEquipamentoRenovacao extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'contrato_equipamento_renovacoes';

    protected $fillable = [
        'id', 'contrato_id', 'data_renovacao', 'periodo_quantidade', 'periodo_unidade',
        'data_vencimento_nova', 'valor_total', 'pagamento_id',
    ];

    protected $casts = [
        'data_renovacao' => 'date',
        'periodo_quantidade' => 'integer',
        'data_vencimento_nova' => 'date',
        'valor_total' => 'float',
    ];

    public function contrato(): BelongsTo
    {
        return $this->belongsTo(ContratoEquipamento::class, 'contrato_id');
    }

    public function pagamento(): BelongsTo
    {
        return $this->belongsTo(Pagamento::class);
    }
}
