<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Foto do RDO.
 *
 * `tarefa_id` nulo  = foto geral do dia (galeria do RDO).
 * `tarefa_id` preenchido = evidência daquela tarefa: aparece como miniatura
 * embaixo dela, com `legenda` como descrição curta. Vincular é opcional —
 * quem está em campo sobe a foto e segue; classificar é um toque a mais.
 *
 * `marcador_x`/`marcador_y` são o croqui: ponto marcado sobre a própria foto,
 * em coordenadas relativas (0 a 1) para independer do tamanho de exibição.
 */
class RdoFoto extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_fotos';

    protected $fillable = [
        'id', 'rdo_id', 'tarefa_id', 'caminho', 'legenda', 'ordem',
        'marcador_x', 'marcador_y', 'marcador_nota',
    ];

    protected $casts = [
        'marcador_x' => 'float',
        'marcador_y' => 'float',
        'ordem' => 'integer',
    ];

    protected $appends = ['url'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    public function tarefa(): BelongsTo
    {
        return $this->belongsTo(RdoTarefa::class, 'tarefa_id');
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->caminho);
    }
}
