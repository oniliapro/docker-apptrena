<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppStorageItem;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Mesmo "idioma" chave/valor do backend/storage.php original (GET ?key=,
 * POST {key,value} ou {action:'clear-prefix', prefix}, DELETE ?key=), só
 * que gravando na tabela app_storage (MySQL) em vez de um arquivo JSON.
 *
 * Objetivo: js/shared/backend-storage.js troca só a URL do endpoint e todo
 * o frontend (EAP, Mapa, Empreita, Pagamentos, preferências de UI) passa a
 * gravar no banco de verdade, sem precisar reescrever cada módulo.
 */
class StorageController extends Controller
{
    private const ALLOWED_KEY_PREFIX = 'controleObra.';
    private const MAX_KEY_LENGTH = 120;
    private const MAX_VALUE_LENGTH = 5000000;

    public function get(Request $request)
    {
        $key = $this->normalizeKey($request->query('key'));
        $empresaId = $this->empresaIdDoUsuario($request);

        $item = AppStorageItem::where('empresa_id', $empresaId)
            ->where('key_name', $key)
            ->first();

        return response()->json(['ok' => true, 'value' => $item?->value]);
    }

    public function set(Request $request)
    {
        $empresaId = $this->empresaIdDoUsuario($request);
        $action = strtolower(trim((string) $request->input('action', 'set')));

        if ($action === 'clear-prefix') {
            $prefix = $this->normalizePrefix($request->input('prefix'));
            AppStorageItem::where('empresa_id', $empresaId)
                ->where('key_name', 'like', $this->likeEscape($prefix).'%')
                ->delete();
            return response()->json(['ok' => true]);
        }

        $key = $this->normalizeKey($request->input('key'));
        $value = $this->normalizeValue($request->input('value'));

        // Não usar Eloquent::updateOrCreate()/save() aqui: a tabela app_storage
        // tem chave primária composta (empresa_id + key_name) e NÃO tem coluna
        // "id". O save() do Eloquent, ao atualizar um registro já existente,
        // monta a query usando a primary key padrão do model ("id"), que não
        // existe nessa tabela — resultando em "where `id` is null" e erro SQL
        // 42S22 (Unknown column 'id'). Por isso a atualização é feita direto
        // pelo query builder, com o where explícito nas duas colunas certas.
        $atualizado = AppStorageItem::where('empresa_id', $empresaId)
            ->where('key_name', $key)
            ->update(['value' => $value]);

        if (!$atualizado) {
            AppStorageItem::create([
                'empresa_id' => $empresaId,
                'key_name' => $key,
                'value' => $value,
            ]);
        }

        return response()->json(['ok' => true]);
    }

    public function remove(Request $request)
    {
        $key = $this->normalizeKey($request->query('key'));
        $empresaId = $this->empresaIdDoUsuario($request);

        AppStorageItem::where('empresa_id', $empresaId)
            ->where('key_name', $key)
            ->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Toda leitura/escrita é isolada pela empresa do usuário autenticado —
     * nunca pelo que vier no corpo da requisição, pra um cliente jamais
     * conseguir ler/gravar dado de outra empresa nem manipulando o request.
     */
    private function empresaIdDoUsuario(Request $request): string
    {
        $empresaId = $request->user()?->empresa_id;
        if (!$empresaId) {
            abort(403, 'Usuário sem empresa associada.');
        }
        return $empresaId;
    }

    private function normalizeKey($raw): string
    {
        if (!is_string($raw)) {
            throw ValidationException::withMessages(['key' => ['Parâmetro key inválido.']]);
        }

        $key = trim($raw);
        if ($key === '' || strlen($key) > self::MAX_KEY_LENGTH) {
            throw ValidationException::withMessages(['key' => ['Parâmetro key inválido.']]);
        }

        if (!str_starts_with($key, self::ALLOWED_KEY_PREFIX)) {
            abort(403, 'Chave não permitida.');
        }

        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $key)) {
            throw ValidationException::withMessages(['key' => ['Formato de key inválido.']]);
        }

        return $key;
    }

    private function normalizePrefix($raw): string
    {
        if ($raw === null || $raw === '') {
            return self::ALLOWED_KEY_PREFIX;
        }

        if (!is_string($raw)) {
            throw ValidationException::withMessages(['prefix' => ['Parâmetro prefix inválido.']]);
        }

        $prefix = trim($raw);
        if ($prefix === '') {
            return self::ALLOWED_KEY_PREFIX;
        }

        if (!str_starts_with($prefix, self::ALLOWED_KEY_PREFIX)) {
            abort(403, 'Prefixo não permitido.');
        }

        return $prefix;
    }

    private function normalizeValue($raw): string
    {
        if (!is_string($raw)) {
            throw ValidationException::withMessages(['value' => ['Parâmetro value inválido.']]);
        }

        if (strlen($raw) > self::MAX_VALUE_LENGTH) {
            abort(413, 'Payload muito grande.');
        }

        return $raw;
    }

    private function likeEscape(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
