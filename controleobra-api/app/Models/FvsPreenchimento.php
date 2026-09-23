<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Ficha de Verificação de Serviço PREENCHIDA (F10), pendurada num RDO —
 * "FVS-0001-REV000". Ver a migration pra numeração/revisão e
 * `RdoController`/`FvsController` para o ciclo de vida completo:
 *
 * 1. Nasce PENDENTE quando uma etapa do RDO ligada a um item da EAP com
 *    ficha vinculada entra no RDO do dia.
 * 2. Vira APROVADA ou REPROVADA sozinha ao salvar, conforme os itens
 *    (qualquer item "não conforme" = reprovada).
 * 3. Reprovada gera uma pendência do RDO (`pendencia_id`) e, no PRÓXIMO RDO
 *    da obra, uma cópia em branco (revisão seguinte, mesma `numero`,
 *    `origem_preenchimento_id` apontando pra esta) — sem apagar a anterior.
 *
 * Opcional: não preencher nenhuma ficha não impede finalizar o RDO.
 */
class FvsPreenchimento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public const STATUS_OPCOES = ['pendente', 'aprovada', 'reprovada'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'fvs_preenchimentos';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'eap_item_id', 'fvs_modelo_id', 'modelo_nome_snapshot',
        'rdo_id', 'numero', 'revisao', 'status', 'observacao_geral',
        'origem_preenchimento_id', 'pendencia_id', 'preenchido_em',
    ];

    protected $casts = [
        'numero' => 'integer',
        'revisao' => 'integer',
        'preenchido_em' => 'datetime',
    ];

    public function itens(): HasMany
    {
        return $this->hasMany(FvsPreenchimentoItem::class)->orderBy('ordem');
    }

    public function eapItem(): BelongsTo
    {
        return $this->belongsTo(EapItem::class, 'eap_item_id');
    }

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    public function origem(): BelongsTo
    {
        return $this->belongsTo(self::class, 'origem_preenchimento_id');
    }

    /** A revisão seguinte que copiou esta ficha (existe só quando ESTA reprovou e já foi copiada). */
    public function origemDe(): HasMany
    {
        return $this->hasMany(self::class, 'origem_preenchimento_id');
    }

    public function pendencia(): BelongsTo
    {
        return $this->belongsTo(RdoPendencia::class, 'pendencia_id');
    }

    /** `FVS-0001-REV000`, `FVS-0002-REV001`… — como aparece na tela e no PDF. */
    public function getCodigoAttribute(): string
    {
        return sprintf('FVS-%04d-REV%03d', $this->numero, $this->revisao);
    }

    protected $appends = ['codigo'];
}
