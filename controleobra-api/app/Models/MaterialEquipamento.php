<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use App\Models\Concerns\PertenceAEmpresa;
use Illuminate\Database\Eloquent\Model;

/** Cadastro de materiais e equipamentos da empresa (F6). Ver a migration. */
class MaterialEquipamento extends Model
{
    use HasUuidPrimaryKey, PertenceAEmpresa;

    public const TIPOS = ['material', 'equipamento'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'materiais_equipamentos';

    protected $fillable = [
        'id', 'empresa_id', 'tipo', 'nome', 'unidade', 'valor_unitario', 'marcas', 'foto_path', 'ativo',
    ];

    protected $casts = [
        'valor_unitario' => 'float',
        'marcas' => 'array',
        'ativo' => 'boolean',
    ];

    protected $appends = ['foto_url'];

    /**
     * Caminho RELATIVO (não absoluto) de propósito — mesmo bug já achado e
     * corrigido em `Empresa::getLogoUrlAttribute()` (28/08/2026, ver o
     * comentário lá): uma URL absoluta (`Storage::url()`, que usa
     * `APP_URL`) só funciona do ponto de vista do navegador do usuário; um
     * Chromium headless gerando PDF (`ApiService.definirBaseParaImpressao`)
     * ou qualquer outro consumidor fora do navegador do usuário não
     * alcança esse host. O frontend monta a URL final com
     * `ApiService.baseStorage() + fotoUrl`.
     */
    public function getFotoUrlAttribute(): ?string
    {
        return $this->foto_path ? '/storage/'.$this->foto_path : null;
    }
}
