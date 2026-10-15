<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Cada cliente que assina o sistema é uma Empresa. Todo dado do app
 * (obras, EAP, mapas, empreitas, pagamentos, preferências) é isolado por
 * empresa_id — nenhum usuário de uma empresa enxerga dado de outra.
 */
class Empresa extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'empresas';

    protected $fillable = [
        'nome',
        'razao_social',
        'cnpj',
        'inscricao_estadual',
        'endereco',
        'telefone',
        'email_contato',
        'cor_primaria',
        'cor_secundaria',
        'fonte',
        'logo_path',
        'papel_timbrado_path',
        'plano',
        'assinatura_status',
        'assinatura_valida_ate',
        'fuso_horario',
        'observacoes_plataforma',
    ];

    protected $appends = ['logo_url', 'papel_timbrado_url'];

    protected function casts(): array
    {
        return [
            'assinatura_valida_ate' => 'datetime',
        ];
    }

    public function usuarios()
    {
        return $this->hasMany(User::class);
    }

    public function representantes(): HasMany
    {
        return $this->hasMany(EmpresaRepresentante::class);
    }

    /**
     * Caminho RELATIVO (não absoluto) de propósito — 28/08/2026, bug achado
     * ao aplicar a logo nos PDFs: uma URL absoluta (`Storage::url()`, que
     * usa `APP_URL`) só funciona do ponto de vista do navegador do
     * usuário. O Chromium headless que gera o PDF roda *dentro* do
     * container phpfpm, onde esse host não existe — mesmo problema que
     * `ApiService.definirBaseParaImpressao` já resolve pras chamadas de
     * API, trocando a base por `http://nginx/api` só na renderização do
     * PDF. Devolvendo só `/storage/...` aqui, o frontend (`ApiService`)
     * monta a URL final com a MESMA base já resolvida pro contexto atual
     * (navegador normal ou impressão) — não precisa de um mecanismo novo.
     */
    public function getLogoUrlAttribute(): ?string
    {
        return $this->logo_path ? '/storage/'.$this->logo_path : null;
    }

    public function getPapelTimbradoUrlAttribute(): ?string
    {
        return $this->papel_timbrado_path ? '/storage/'.$this->papel_timbrado_path : null;
    }
}
