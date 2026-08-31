<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\URL;

/**
 * Não usa PertenceAEmpresa — o escopo multiempresa e a privacidade vêm da
 * Pasta pai (mesmo padrão de DiarioFoto/DiarioRegistro). Toda ação de
 * controller precisa reverificar a posse da pasta manualmente, já que
 * regras de validação `exists:` não passam pelo global scope.
 */
class Arquivo extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'pasta_id', 'nome_original', 'caminho', 'extensao', 'mime',
        'tamanho_bytes', 'categoria', 'caminho_thumbnail', 'thumbnail_status',
        'enviado_por_user_id',
    ];

    protected $casts = [
        'tamanho_bytes' => 'integer',
    ];

    protected $appends = ['thumbnail_url'];

    public function pasta(): BelongsTo
    {
        return $this->belongsTo(Pasta::class);
    }

    /**
     * 31/08/2026, "Controle de permissões" — `Arquivo` não tem `obra_id`
     * próprio (só via `Pasta`), mas o middleware `PermissaoObra` procura
     * essa propriedade em qualquer model vinculado à rota; este acessor
     * faz isso "só funcionar" sem precisar de um caso especial lá.
     */
    public function getObraIdAttribute(): ?string
    {
        return $this->pasta?->obra_id;
    }

    /**
     * URL assinada de curta duração (~10min) — só existe quando a miniatura
     * já foi gerada com sucesso. Assinar aqui, e não só no endpoint
     * previewUrl(), evita 1 requisição extra por tile visível na grade.
     */
    public function getThumbnailUrlAttribute(): ?string
    {
        if ($this->thumbnail_status !== 'pronto' || !$this->caminho_thumbnail) {
            return null;
        }

        return URL::temporarySignedRoute('arquivos.streamThumb', now()->addMinutes(10), ['arquivo' => $this->id]);
    }
}
