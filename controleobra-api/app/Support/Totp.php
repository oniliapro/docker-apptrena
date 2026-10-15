<?php

namespace App\Support;

/**
 * Senha de uso único baseada em tempo (TOTP, RFC 6238) — o "código de 6
 * dígitos" do Google Authenticator, Microsoft Authenticator, Authy etc.
 *
 * Implementado aqui (poucas linhas, só `hash_hmac`) em vez de puxar um pacote:
 * o algoritmo é fixo e pequeno, e uma dependência a menos num ponto de
 * segurança é uma superfície a menos para vigiar.
 *
 * Parâmetros padrão do protocolo, que os aplicativos assumem: SHA-1, 30
 * segundos, 6 dígitos.
 */
class Totp
{
    private const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    private const PASSO = 30;
    private const DIGITOS = 6;

    /** Segredo novo, 160 bits, em base32 (o formato que os aplicativos pedem). */
    public static function gerarSegredo(): string
    {
        return self::base32Codificar(random_bytes(20));
    }

    /** URI `otpauth://` — é o que vira QR code; também serve para digitar a chave à mão. */
    public static function uriDeProvisionamento(string $segredo, string $conta, string $emissor = 'ComTrena'): string
    {
        $rotulo = rawurlencode($emissor.':'.$conta);

        return "otpauth://totp/{$rotulo}?secret={$segredo}&issuer=".rawurlencode($emissor)
            .'&algorithm=SHA1&digits='.self::DIGITOS.'&period='.self::PASSO;
    }

    /**
     * Confere o código aceitando 1 intervalo para trás e 1 para frente (relógio do celular
     * levemente fora). Devolve o intervalo que bateu, ou null se nenhum.
     */
    public static function verificar(string $segredo, string $codigo, ?int $ultimoIntervalo = null, ?int $agora = null): ?int
    {
        $codigo = preg_replace('/\s+/', '', $codigo) ?? '';
        if (!preg_match('/^\d{'.self::DIGITOS.'}$/', $codigo)) {
            return null;
        }

        $intervaloAtual = intdiv($agora ?? time(), self::PASSO);

        for ($desvio = -1; $desvio <= 1; $desvio++) {
            $intervalo = $intervaloAtual + $desvio;

            // Mesmo código não vale duas vezes (quem espiou por cima do ombro não reaproveita).
            if ($ultimoIntervalo !== null && $intervalo <= $ultimoIntervalo) {
                continue;
            }

            if (hash_equals(self::codigoDoIntervalo($segredo, $intervalo), $codigo)) {
                return $intervalo;
            }
        }

        return null;
    }

    public static function codigoDoIntervalo(string $segredo, int $intervalo): string
    {
        $chave = self::base32Decodificar($segredo);
        // Contador de 64 bits big-endian.
        $contador = pack('N2', $intervalo >> 32, $intervalo & 0xFFFFFFFF);
        $hash = hash_hmac('sha1', $contador, $chave, true);

        $deslocamento = ord($hash[19]) & 0x0F;
        $binario = ((ord($hash[$deslocamento]) & 0x7F) << 24)
            | ((ord($hash[$deslocamento + 1]) & 0xFF) << 16)
            | ((ord($hash[$deslocamento + 2]) & 0xFF) << 8)
            | (ord($hash[$deslocamento + 3]) & 0xFF);

        return str_pad((string) ($binario % (10 ** self::DIGITOS)), self::DIGITOS, '0', STR_PAD_LEFT);
    }

    private static function base32Codificar(string $binario): string
    {
        $bits = '';
        foreach (str_split($binario) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $saida = '';
        foreach (str_split($bits, 5) as $grupo) {
            $saida .= self::ALFABETO[bindec(str_pad($grupo, 5, '0', STR_PAD_RIGHT))];
        }

        return $saida;
    }

    private static function base32Decodificar(string $texto): string
    {
        $texto = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $texto) ?? '');

        $bits = '';
        foreach (str_split($texto) as $caractere) {
            $bits .= str_pad(decbin((int) strpos(self::ALFABETO, $caractere)), 5, '0', STR_PAD_LEFT);
        }

        $saida = '';
        foreach (str_split($bits, 8) as $grupo) {
            if (strlen($grupo) === 8) {
                $saida .= chr(bindec($grupo));
            }
        }

        return $saida;
    }
}
