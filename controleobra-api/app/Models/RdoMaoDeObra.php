<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Uma linha de mao de obra: funcao + quantidade, na categoria 'interno' ou
 * 'externo' (vinculo com a empresa — antes 'indireta'/'direta', tipo de
 * trabalho; trocado na F9, 24/09/2026, ver a migration de dados).
 *
 * `profissional_id`/`profissional_nome` (F9) sao opcionais: uma linha SEM
 * profissional vinculado continua valendo como lancamento manual (ex.:
 * "Ajudante avulso x3", com `quantidade` > 1) — so as linhas COM
 * profissional geram diaria automatica ao finalizar o RDO (uma pessoa por
 * linha, `quantidade` sempre 1 nesse caso), ver
 * `RdoController::gerarDiariasAutomaticas`.
 *
 * Nao usa PertenceAEmpresa: o isolamento multiempresa vem do RdoRegistro pai
 * (cascade delete + sempre acessado atraves dele).
 */
class RdoMaoDeObra extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_mao_de_obra';

    protected $fillable = ['id','rdo_id','categoria','profissional_id','profissional_nome','funcao','quantidade','ordem'];

    protected $casts = ['quantidade'=>'integer','ordem'=>'integer'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }
}
