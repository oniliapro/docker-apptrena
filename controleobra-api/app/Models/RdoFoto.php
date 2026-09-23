<?php

namespace App\Models;

use App\Models\Concerns\HasUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Foto (ou vídeo, F8 22/09/2026) do RDO.
 *
 * `tipo`: 'foto' ou 'video' — os dois vivem na mesma tabela e na mesma
 * galeria/ordem (mp4/mov/webm até 100 MB); o nome da classe/tabela ficou
 * "foto" por história, mas hoje é "mídia do RDO".
 * `tarefa_id` nulo  = mídia geral do dia (galeria do RDO).
 * `tarefa_id` preenchido = evidência daquela tarefa: aparece como miniatura
 * embaixo dela, com `legenda` como descrição curta. Vincular é opcional —
 * quem está em campo sobe a mídia e segue; classificar é um toque a mais.
 *
 * `marcador_x`/`marcador_y` são o croqui: ponto marcado sobre a própria
 * FOTO, em coordenadas relativas (0 a 1) para independer do tamanho de
 * exibição — exclusivo de foto, sempre nulo em vídeo.
 */
class RdoFoto extends Model
{
    use HasUuidPrimaryKey;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $table = 'rdo_fotos';

    protected $fillable = [
        'id', 'rdo_id', 'tarefa_id', 'tipo', 'caminho', 'legenda', 'ordem',
        'marcador_x', 'marcador_y', 'marcador_nota',
    ];

    protected $casts = [
        'marcador_x' => 'float',
        'marcador_y' => 'float',
        'ordem' => 'integer',
    ];

    protected $appends = ['url'];

    public function rdo(): BelongsTo
    {
        return $this->belongsTo(RdoRegistro::class, 'rdo_id');
    }

    public function tarefa(): BelongsTo
    {
        return $this->belongsTo(RdoTarefa::class, 'tarefa_id');
    }

    /**
     * Caminho RELATIVO (não absoluto) de propósito — achado em 23/09/2026:
     * nenhuma foto/vídeo aparecia no PDF do RDO (nem em nenhum outro módulo
     * com foto), porque `Storage::url()` monta a URL com `APP_URL`, que só
     * existe do ponto de vista do navegador do usuário — o Chromium
     * headless que gera o PDF roda *dentro* do container `phpfpm`, onde
     * esse host não existe. Mesmo bug (e mesma correção) já resolvidos pra
     * logo da empresa em 28/08/2026, ver `Empresa::getLogoUrlAttribute()`.
     * O frontend monta a URL final com `ApiService.baseStorage() + url`,
     * que já resolve pro host certo em qualquer contexto (navegador normal,
     * impressão ou o link público do contratante).
     */
    public function getUrlAttribute(): string
    {
        return '/storage/'.$this->caminho;
    }
}
