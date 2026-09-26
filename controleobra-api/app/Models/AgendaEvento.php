<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** Um compromisso da Agenda (geral ou de uma obra). Ver a migration. */
class AgendaEvento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'agenda_eventos';

    protected $fillable = [
        'id', 'empresa_id', 'obra_id', 'criado_por_id', 'titulo', 'descricao', 'local',
        'dia_inteiro', 'inicio', 'fim',
    ];

    // `inicio`/`fim` ficam como texto de propósito: são horário de parede, sem fuso —
    // um cast `datetime` os devolveria com "Z" (UTC) e o navegador deslocaria as horas.
    protected $casts = [
        'dia_inteiro' => 'boolean',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }

    public function criadoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'criado_por_id');
    }

    public function participantes(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'agenda_evento_participantes', 'agenda_evento_id', 'user_id');
    }
}
