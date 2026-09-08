<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiarioEquipamentoUso extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'diario_equipamentos_uso';

    protected $fillable = ['id', 'registro_id', 'equipamento_id', 'quantidade'];

    public function registro(): BelongsTo
    {
        return $this->belongsTo(DiarioRegistro::class, 'registro_id');
    }

    public function equipamento(): BelongsTo
    {
        return $this->belongsTo(EquipamentoCatalogo::class, 'equipamento_id');
    }
}
