<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ObraUiConfig extends Model
{
    protected $table = 'obra_ui_config';

    public $timestamps = false;
    public $incrementing = false;
    protected $keyType = 'string';
    protected $primaryKey = 'obra_id';

    protected $fillable = [
        'obra_id', 'show_unit', 'show_total', 'show_bdi', 'show_types', 'orc_real_mode', 'modo_totais',
    ];

    protected $casts = [
        'show_unit' => 'boolean',
        'show_total' => 'boolean',
        'show_bdi' => 'boolean',
        'show_types' => 'boolean',
    ];

    public function obra(): BelongsTo
    {
        return $this->belongsTo(Obra::class);
    }
}
