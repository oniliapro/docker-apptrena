<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiarioOcorrencia extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_ocorrencias';

    /** 'nao_conformidade' | 'mudanca_projeto' | 'interferencia' | 'interrupcao' */
    public const TIPOS = ['nao_conformidade', 'mudanca_projeto', 'interferencia', 'interrupcao'];

    protected $fillable = ['id', 'registro_id', 'tipo', 'descricao', 'responsavel', 'motivo', 'danos_materiais'];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }
}
