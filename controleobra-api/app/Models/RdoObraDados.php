<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Cabeçalho técnico do RDO por obra: contrato, responsável técnico, CREA e
 * ART. Vive aqui, e não em `obras`, de propósito — a tabela `obras` é
 * compartilhada com EAP, Mapa, Empreita e Pagamentos, e este módulo não
 * altera nada fora do próprio escopo.
 */
class RdoObraDados extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_obra_dados';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'numero_contrato', 'responsavel_tecnico',
        'crea', 'art', 'data_inicio', 'prazo', 'contratante_nome',
    ];

    protected $casts = ['data_inicio' => 'date'];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }
}
