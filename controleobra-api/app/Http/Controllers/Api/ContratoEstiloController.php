<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContratoEstilo;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Estilos de texto nomeados pelo usuário (29/09/2026), usados no editor
 * de modelos de contrato (`ContratoModeloEditor`) — únicos por empresa,
 * reaproveitáveis em qualquer modelo.
 *
 * 30/09/2026: os estilos "padrão" (Normal/Título 1-7/Citação) deixaram de
 * ser um conjunto fixo só aplicado via `execCommand('formatBlock')` — o
 * Lucas pediu pra poder EDITAR a formatação deles também, não só criar
 * estilos novos. Viraram `ContratoEstilo` de verdade (`padrao = true`),
 * semeados na primeira vez que a empresa pede a lista (sem migration de
 * dados: cada empresa ganha os dela na hora, isolado pelo escopo global
 * de `PertenceAEmpresa`). No mesmo dia, ganharam numeração automática de
 * dois tipos (ver `nivel_titulo`/`eh_lista` na migration) — qualquer
 * estilo, não só os títulos, pode ser uma lista ordenada avulsa.
 */
class ContratoEstiloController extends Controller
{
    public function index()
    {
        if (ContratoEstilo::count() === 0) {
            $this->semearPadroes();
        }

        return ContratoEstilo::orderBy('padrao', 'desc')->orderBy('nivel_titulo')->orderBy('nome')->get();
    }

    public function store(Request $request)
    {
        return response()->json(ContratoEstilo::create($this->validar($request)), 201);
    }

    public function update(Request $request, ContratoEstilo $contratoEstilo)
    {
        $contratoEstilo->update($this->validar($request));

        return $contratoEstilo->fresh();
    }

    public function destroy(ContratoEstilo $contratoEstilo)
    {
        $contratoEstilo->delete();

        return response()->noContent();
    }

    /**
     * `eh_lista`/`nivel_titulo` são mutuamente exclusivos (lista ordenada
     * avulsa OU título numerado hierárquico), mas `Rule::prohibitedIf` não
     * dá pra usar aqui: o Laravel só considera um valor "vazio" (satisfaz
     * `prohibited`) se for `null`/string vazia — um `false` booleano NÃO
     * conta como vazio, então mandar `eh_lista: false` (o valor natural
     * pra "desligado") sempre que `nivel_titulo` estivesse preenchido
     * derrubava QUALQUER salvamento de título numerado com 422 (bug real
     * achado testando de verdade). Checagem manual em vez da regra pronta.
     */
    private function validar(Request $request): array
    {
        $ehLista = $request->boolean('eh_lista');
        $temNivelTitulo = $request->filled('nivel_titulo');

        if ($ehLista && $temNivelTitulo) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'eh_lista' => 'Um estilo não pode ser lista avulsa e título numerado ao mesmo tempo.',
            ]);
        }

        $numerado = $ehLista || $temNivelTitulo;

        return $request->validate([
            'nome' => 'required|string|max:60',
            'tag_html' => ['required', Rule::in(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])],
            'fonte' => 'nullable|string|max:60',
            'tamanho_pt' => 'nullable|integer|min:1|max:200',
            'cor' => 'nullable|regex:/^#[0-9a-fA-F]{6}$/',
            'negrito' => 'nullable|boolean',
            'italico' => 'nullable|boolean',
            'sublinhado' => 'nullable|boolean',
            'alinhamento' => ['required', Rule::in(['esquerda', 'centro', 'direita', 'justificado'])],
            'caixa_texto' => ['nullable', Rule::in(['nenhuma', 'maiuscula', 'primeira_maiuscula', 'cada_palavra'])],
            'eh_lista' => 'nullable|boolean',
            'lista_formato' => $ehLista
                ? ['required', Rule::in(['numero', 'romano_minusculo', 'romano_maiusculo', 'letra_minuscula', 'letra_maiuscula'])]
                : 'prohibited',
            'nivel_titulo' => ['nullable', 'integer', 'min:1', 'max:7'],
            'lista_prefixo' => $numerado ? 'nullable|string|max:40' : 'prohibited',
            'lista_sufixo' => $numerado ? 'nullable|string|max:10' : 'prohibited',
        ]);
    }

    private function semearPadroes(): void
    {
        $padroes = [
            ['nome' => 'Normal', 'tag_html' => 'p'],
            ['nome' => 'Título 1', 'tag_html' => 'h1', 'tamanho_pt' => 22, 'negrito' => true],
            ['nome' => 'Título 2', 'tag_html' => 'h2', 'tamanho_pt' => 19, 'negrito' => true],
            ['nome' => 'Título 3', 'tag_html' => 'h3', 'tamanho_pt' => 16, 'negrito' => true],
            ['nome' => 'Título 4', 'tag_html' => 'h4', 'tamanho_pt' => 14, 'negrito' => true],
            ['nome' => 'Título 5', 'tag_html' => 'h5', 'tamanho_pt' => 13, 'negrito' => true],
            ['nome' => 'Título 6', 'tag_html' => 'h6', 'tamanho_pt' => 12, 'negrito' => true],
            ['nome' => 'Título 7', 'tag_html' => 'h6', 'tamanho_pt' => 11, 'negrito' => true, 'italico' => true],
            ['nome' => 'Citação', 'tag_html' => 'blockquote', 'italico' => true, 'cor' => '#666666'],
        ];

        foreach ($padroes as $dados) {
            ContratoEstilo::create($dados + ['padrao' => true, 'alinhamento' => 'esquerda', 'lista_formato' => 'numero']);
        }
    }
}
