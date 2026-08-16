<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Modelos do app do Lucas usam id VARCHAR(36) gerado como UUID,
 * igual ao que o frontend já faz com crypto.randomUUID().
 * Este trait gera o UUID automaticamente se o id não vier preenchido
 * (ex.: quando o registro é criado a partir do próprio frontend, que já manda o id).
 *
 * IMPORTANTE: $incrementing e $keyType NÃO ficam declarados aqui dentro da
 * trait — declarar propriedade em trait com valor diferente do que a classe
 * base (Illuminate\Database\Eloquent\Model) já declara causa um Fatal error
 * de composição no PHP ("defined the same property... but with incompatible
 * value"). Por isso, cada model que usa esta trait declara
 * `public $incrementing = false;` e `protected $keyType = 'string';`
 * diretamente no próprio corpo da classe.
 */
trait HasUuidPrimaryKey
{
    protected static function bootHasUuidPrimaryKey(): void
    {
        static::creating(function ($model) {
            if (empty($model->{$model->getKeyName()})) {
                $model->{$model->getKeyName()} = (string) Str::uuid();
            }
        });
    }
}
