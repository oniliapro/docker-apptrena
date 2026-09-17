<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Observação da contratada sobre o lançamento — por padrão NÃO visível
 * ao contratante da obra (`visivel_contratante = false`). Usado para
 * registrar combinados/prazos internos que servem de prova/lembrete
 * pra contratada, sem expor ao cliente final (ver especificação,
 * 08/09/2026, relato do Lucas).
 */
class DiarioComentarioInterno extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_comentarios_internos';

    protected $fillable = ['id', 'registro_id', 'autor_user_id', 'texto', 'visivel_contratante'];

    protected $casts = ['visivel_contratante' => 'boolean'];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'autor_user_id');
    }
}
