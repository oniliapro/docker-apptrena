<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Relação de precedência entre duas tarefas do Cronograma de obra (CPM,
 * 02/10/2026) — `tipo`: TI (término-início), II (início-início), TT
 * (término-término), IT (início-término). `latencia_dias` pode ser negativa
 * (antecipação/lead). Não usa `PertenceAEmpresa`: isolamento vem das
 * tarefas (predecessora/sucessora), sempre da mesma obra — ver
 * `CronogramaController::tarefaValida()`.
 */
class CronogramaDependencia extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'cronograma_dependencias';

    protected $fillable = ['id', 'predecessora_id', 'sucessora_id', 'tipo', 'latencia_dias'];

    protected $casts = [
        'latencia_dias' => 'integer',
    ];

    public function predecessora(): BelongsTo
    {
        return $this->belongsTo(CronogramaTarefa::class, 'predecessora_id');
    }

    public function sucessora(): BelongsTo
    {
        return $this->belongsTo(CronogramaTarefa::class, 'sucessora_id');
    }
}
