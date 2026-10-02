<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Tarefa do Cronograma de obra (CPM, 02/10/2026) — ver a migration pro
 * contexto completo. Datas de início/fim NÃO são gravadas aqui: são sempre
 * calculadas ao vivo no frontend a partir de `data_inicio_manual` (só usada
 * quando a tarefa não tem predecessora) + as dependências.
 */
class CronogramaTarefa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'cronograma_tarefas';

    protected $fillable = [
        'id', 'obra_id', 'eap_item_id', 'ordem', 'nome', 'tipo', 'duracao_dias', 'data_inicio_manual',
    ];

    protected $casts = [
        'ordem' => 'integer',
        'duracao_dias' => 'integer',
        'data_inicio_manual' => 'date',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class, 'eap_item_id');
    }

    public function predecessoras(): HasMany
    {
        return $this->hasMany(CronogramaDependencia::class, 'sucessora_id');
    }

    public function sucessoras(): HasMany
    {
        return $this->hasMany(CronogramaDependencia::class, 'predecessora_id');
    }
}
