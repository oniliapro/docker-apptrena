<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Contrato de equipamento alugado (26/09/2026) — ver a migration pra
 * entender o ciclo completo (entrega → vencimento → renovações parciais).
 */
class ContratoEquipamento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'contratos_equipamentos';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'numero', 'nome_contrato', 'fornecedor',
        'frete', 'lancar_frete_como_item', 'frete_etapa_id',
        'data_entrega', 'periodo_quantidade', 'periodo_unidade', 'data_vencimento',
        'encerrado_em', 'pagamento_inicial_id', 'agenda_evento_id',
    ];

    protected $casts = [
        'numero' => 'integer',
        'periodo_quantidade' => 'integer',
        'frete' => 'float',
        'lancar_frete_como_item' => 'boolean',
        'data_entrega' => 'date',
        'data_vencimento' => 'date',
        'encerrado_em' => 'datetime',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function itens(): HasMany
    {
        return $this->hasMany(ContratoEquipamentoItem::class, 'contrato_id')->orderBy('ordem');
    }

    public function renovacoes(): HasMany
    {
        return $this->hasMany(ContratoEquipamentoRenovacao::class, 'contrato_id')->orderBy('data_renovacao');
    }
}
