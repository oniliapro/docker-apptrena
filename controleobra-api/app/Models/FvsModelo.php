<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Modelo (cadastro reaproveitável, F10) de Ficha de Verificação de Serviço —
 * criado em Configurações, vinculado a itens da EAP de qualquer obra
 * (`FvsVinculo`). `itens` é só `[{descricao}]`, em JSON: cada um vira uma
 * linha Conforme/Não conforme/Não se aplica na hora de preencher — sem
 * relacionamento próprio, mesmo raciocínio de `marcas` em
 * `MaterialEquipamento`.
 */
class FvsModelo extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'fvs_modelos';

    protected $fillable = ['id', 'empresa_id', 'nome', 'itens', 'ativo'];

    protected $casts = [
        'itens' => 'array',
        'ativo' => 'boolean',
    ];

    public function vinculos(): HasMany
    {
        return $this->hasMany(FvsVinculo::class);
    }
}
