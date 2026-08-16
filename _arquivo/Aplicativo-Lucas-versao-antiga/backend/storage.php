<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const STORAGE_DIR = __DIR__ . DIRECTORY_SEPARATOR . 'data';
const STORAGE_FILE = STORAGE_DIR . DIRECTORY_SEPARATOR . 'storage.json';
const ALLOWED_KEY_PREFIX = 'controleObra.';
const MAX_KEY_LENGTH = 120;
const MAX_VALUE_LENGTH = 5000000;

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensureStorageReady(): void
{
    if (!is_dir(STORAGE_DIR) && !mkdir(STORAGE_DIR, 0775, true) && !is_dir(STORAGE_DIR)) {
        respond(500, ['ok' => false, 'error' => 'Falha ao criar diretório de dados.']);
    }

    if (!file_exists(STORAGE_FILE)) {
        $initial = json_encode(['items' => new stdClass()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($initial === false || file_put_contents(STORAGE_FILE, $initial, LOCK_EX) === false) {
            respond(500, ['ok' => false, 'error' => 'Falha ao inicializar armazenamento.']);
        }
    }
}

function startsWith(string $text, string $prefix): bool
{
    if ($prefix === '') {
        return true;
    }
    return strpos($text, $prefix) === 0;
}

function openStorageHandle()
{
    ensureStorageReady();
    $handle = fopen(STORAGE_FILE, 'c+');
    if ($handle === false) {
        respond(500, ['ok' => false, 'error' => 'Falha ao abrir armazenamento.']);
    }
    return $handle;
}

function readItemsFromHandle($handle): array
{
    rewind($handle);
    $raw = stream_get_contents($handle);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
        return [];
    }

    $items = $parsed['items'] ?? [];
    if (!is_array($items)) {
        return [];
    }

    $normalized = [];
    foreach ($items as $key => $value) {
        if (!is_string($key)) {
            continue;
        }
        if (!is_string($value)) {
            continue;
        }
        $normalized[$key] = $value;
    }

    return $normalized;
}

function writeItemsToHandle($handle, array $items): void
{
    $payload = json_encode(['items' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        respond(500, ['ok' => false, 'error' => 'Falha ao serializar armazenamento.']);
    }

    rewind($handle);
    ftruncate($handle, 0);
    if (fwrite($handle, $payload) === false) {
        respond(500, ['ok' => false, 'error' => 'Falha ao persistir dados.']);
    }
    fflush($handle);
}

function normalizeKey($rawKey): string
{
    if (!is_string($rawKey)) {
        respond(400, ['ok' => false, 'error' => 'Parâmetro key inválido.']);
    }

    $key = trim($rawKey);
    if ($key === '' || strlen($key) > MAX_KEY_LENGTH) {
        respond(400, ['ok' => false, 'error' => 'Parâmetro key inválido.']);
    }

    if (!startsWith($key, ALLOWED_KEY_PREFIX)) {
        respond(403, ['ok' => false, 'error' => 'Chave não permitida.']);
    }

    if (!preg_match('/^[a-zA-Z0-9._-]+$/', $key)) {
        respond(400, ['ok' => false, 'error' => 'Formato de key inválido.']);
    }

    return $key;
}

function normalizePrefix($rawPrefix): string
{
    if ($rawPrefix === null || $rawPrefix === '') {
        return ALLOWED_KEY_PREFIX;
    }

    if (!is_string($rawPrefix)) {
        respond(400, ['ok' => false, 'error' => 'Parâmetro prefix inválido.']);
    }

    $prefix = trim($rawPrefix);
    if ($prefix === '') {
        return ALLOWED_KEY_PREFIX;
    }

    if (!startsWith($prefix, ALLOWED_KEY_PREFIX)) {
        respond(403, ['ok' => false, 'error' => 'Prefixo não permitido.']);
    }

    return $prefix;
}

function normalizeValue($rawValue): string
{
    if (!is_string($rawValue)) {
        respond(400, ['ok' => false, 'error' => 'Parâmetro value inválido.']);
    }

    if (strlen($rawValue) > MAX_VALUE_LENGTH) {
        respond(413, ['ok' => false, 'error' => 'Payload muito grande.']);
    }

    return $rawValue;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
        respond(400, ['ok' => false, 'error' => 'JSON inválido no corpo da requisição.']);
    }

    return $parsed;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') {
    respond(200, ['ok' => true]);
}

if ($method === 'GET') {
    $key = normalizeKey($_GET['key'] ?? null);

    $handle = openStorageHandle();
    if (!flock($handle, LOCK_SH)) {
        fclose($handle);
        respond(500, ['ok' => false, 'error' => 'Falha ao bloquear armazenamento.']);
    }

    $items = readItemsFromHandle($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    respond(200, ['ok' => true, 'value' => $items[$key] ?? null]);
}

if ($method === 'DELETE') {
    $key = normalizeKey($_GET['key'] ?? null);

    $handle = openStorageHandle();
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(500, ['ok' => false, 'error' => 'Falha ao bloquear armazenamento.']);
    }

    $items = readItemsFromHandle($handle);
    unset($items[$key]);
    writeItemsToHandle($handle, $items);

    flock($handle, LOCK_UN);
    fclose($handle);

    respond(200, ['ok' => true]);
}

if ($method === 'POST') {
    $body = readJsonBody();
    $action = strtolower(trim((string)($body['action'] ?? 'set')));

    if ($action === 'clear-prefix') {
        $prefix = normalizePrefix($body['prefix'] ?? ALLOWED_KEY_PREFIX);

        $handle = openStorageHandle();
        if (!flock($handle, LOCK_EX)) {
            fclose($handle);
            respond(500, ['ok' => false, 'error' => 'Falha ao bloquear armazenamento.']);
        }

        $items = readItemsFromHandle($handle);
        $kept = [];
        foreach ($items as $storedKey => $storedValue) {
            if (!startsWith($storedKey, $prefix)) {
                $kept[$storedKey] = $storedValue;
            }
        }
        writeItemsToHandle($handle, $kept);

        flock($handle, LOCK_UN);
        fclose($handle);

        respond(200, ['ok' => true]);
    }

    $key = normalizeKey($body['key'] ?? null);
    $value = normalizeValue($body['value'] ?? null);

    $handle = openStorageHandle();
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(500, ['ok' => false, 'error' => 'Falha ao bloquear armazenamento.']);
    }

    $items = readItemsFromHandle($handle);
    $items[$key] = $value;
    writeItemsToHandle($handle, $items);

    flock($handle, LOCK_UN);
    fclose($handle);

    respond(200, ['ok' => true]);
}

respond(405, ['ok' => false, 'error' => 'Método não suportado.']);
