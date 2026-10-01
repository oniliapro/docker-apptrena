<?php

use App\Http\Controllers\Api\AgendaController;
use App\Http\Controllers\Api\AnexoController;
use App\Http\Controllers\Api\ArquivoController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CronogramaPdfController;
use App\Http\Controllers\Api\ContratoEquipamentoController;
use App\Http\Controllers\Api\ContratoEstiloController;
use App\Http\Controllers\Api\ContratoModeloController;
use App\Http\Controllers\Api\ContratoPdfController;
use App\Http\Controllers\Api\CronogramaPlanejamentoController;
use App\Http\Controllers\Api\DiariaController;
use App\Http\Controllers\Api\DiarioObraController;
use App\Http\Controllers\Api\EapPdfController;
use App\Http\Controllers\Api\EmpreitaController;
use App\Http\Controllers\Api\EmpreitaPdfController;
use App\Http\Controllers\Api\EmpresaPerfilController;
use App\Http\Controllers\Api\MapaController;
use App\Http\Controllers\Api\MapaPdfController;
use App\Http\Controllers\Api\MedicaoController;
use App\Http\Controllers\Api\MedicaoPdfController;
use App\Http\Controllers\Api\EquipamentoCatalogoController;
use App\Http\Controllers\Api\NotaFiscalController;
use App\Http\Controllers\Api\ObraContratanteLinkController;
use App\Http\Controllers\Api\ObraController;
use App\Http\Controllers\Api\PagamentoController;
use App\Http\Controllers\Api\PublicoDiarioController;
use App\Http\Controllers\Api\RecebimentoController;
use App\Http\Controllers\Api\PastaController;
use App\Http\Controllers\Api\RelatorioPdfController;
use App\Http\Controllers\Api\MaterialEquipamentoController;
use App\Http\Controllers\Api\StorageController;
use App\Http\Controllers\Api\TagController;
use App\Http\Controllers\Api\UsuarioController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API — Controle de Obra (App do Lucas)
|--------------------------------------------------------------------------
| Prefixo final: /api/... (Laravel já aplica o prefixo "api" a este arquivo
| via bootstrap/app.php).
|
| Login: POST /api/login (público) devolve um token Sanctum. O frontend
| guarda esse token e manda "Authorization: Bearer <token>" em toda
| chamada às rotas protegidas abaixo.
*/

// throttle: no máximo 5 tentativas de login por minuto por IP, pra dificultar
// ataque de força bruta na senha.
Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Cadastro público de uma nova empresa/cliente. Throttle mais generoso, mas
// ainda limitado, pra dificultar cadastro em massa automatizado.
Route::post('registrar', [AuthController::class, 'registrar'])->middleware('throttle:10,1');

// Streaming de arquivos/miniaturas via URL assinada (não autenticada por
// Sanctum, porque tags <img>/<video>/<audio>/<iframe> não mandam header
// Authorization no `src`). A checagem de privacidade acontece só em
// ArquivoController::previewUrl, que é quem assina o link — a assinatura
// HMAC em si é a autorização daqui pra baixo. Ver comentário em
// ArquivoController.
Route::get('arquivos/{arquivo}/stream', [ArquivoController::class, 'stream'])
    ->name('arquivos.stream')->middleware('signed');
Route::get('arquivos/{arquivo}/stream-thumb', [ArquivoController::class, 'streamThumb'])
    ->name('arquivos.streamThumb')->middleware('signed');

// Diário de Obra — acesso do contratante da obra (cliente final), sem
// login, autorizado só pelo token do link (08/09/2026, ver
// PublicoDiarioController). Somente leitura, de propósito: nenhuma
// dessas rotas grava nada. Throttle mais folgado que login (não é
// autenticação por senha), mas ainda limitado contra varredura de
// tokens.
Route::prefix('publico/diario/{token}')->middleware('throttle:60,1')->group(function () {
    Route::get('/', [PublicoDiarioController::class, 'obra']);
    Route::get('dia/{data}', [PublicoDiarioController::class, 'dia']);
    Route::get('lancamento/{registroId}', [PublicoDiarioController::class, 'lancamento']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);
    Route::get('me/permissoes', [AuthController::class, 'minhasPermissoes']);

    // Popup de Configurações — aba "Controle de permissões" (31/08/2026).
    Route::get('usuarios', [UsuarioController::class, 'index']);
    Route::post('usuarios', [UsuarioController::class, 'store']);
    Route::put('usuarios/{usuario}', [UsuarioController::class, 'update']);
    Route::get('usuarios/{usuario}/permissoes', [UsuarioController::class, 'listarPermissoes']);
    Route::put('usuarios/{usuario}/permissoes', [UsuarioController::class, 'salvarPermissoes']);

    // Popup de Configurações — aba "Dados da empresa" (26/08/2026).
    Route::get('empresa/perfil', [EmpresaPerfilController::class, 'mostrar']);
    Route::post('empresa/perfil', [EmpresaPerfilController::class, 'atualizar']);
    Route::get('empresa/representantes', [EmpresaPerfilController::class, 'listarRepresentantes']);
    Route::post('empresa/representantes', [EmpresaPerfilController::class, 'criarRepresentante']);
    Route::put('empresa/representantes/{representante}', [EmpresaPerfilController::class, 'atualizarRepresentante']);
    Route::delete('empresa/representantes/{representante}', [EmpresaPerfilController::class, 'excluirRepresentante']);

    // Popup de Configurações — aba "Tags" (06/09/2026, controle de notas
    // fiscais por anexo em Pagamentos/Recebimentos).
    Route::get('tags', [TagController::class, 'index']);
    Route::post('tags', [TagController::class, 'store']);
    Route::put('tags/{tag}', [TagController::class, 'update']);
    Route::delete('tags/{tag}', [TagController::class, 'destroy']);

    // Cadastro Materiais e equipamentos (22/09/2026, F6) — sem módulo de permissão próprio,
    // como os outros cadastros: basta estar logado (tudo filtrado pela empresa).
    Route::get('materiais-equipamentos', [MaterialEquipamentoController::class, 'index']);
    Route::post('materiais-equipamentos', [MaterialEquipamentoController::class, 'store']);
    Route::put('materiais-equipamentos/{materiaisEquipamento}', [MaterialEquipamentoController::class, 'update']);
    Route::delete('materiais-equipamentos/{materiaisEquipamento}', [MaterialEquipamentoController::class, 'destroy']);
    Route::post('materiais-equipamentos/{materiaisEquipamento}/foto', [MaterialEquipamentoController::class, 'salvarFoto']);
    Route::delete('materiais-equipamentos/{materiaisEquipamento}/foto', [MaterialEquipamentoController::class, 'removerFoto']);

    // 31/08/2026, "Controle de permissões" — achado testando o pedido do
    // Lucas de mexer no acesso por obra: `show`/`update`/`destroy` não
    // tinham NENHUMA checagem de obra no backend (só o guard do
    // frontend blindava a navegação) — um usuário com acesso negado
    // ainda conseguia buscar a obra via chamada direta à API.
    //
    // `show` leva SÓ `permissaoObra` (não `permissaoModulo:obras,usar`)
    // de propósito: abrir a obra é só a porta de entrada pras abas de
    // dentro (Mapas, Empreitas...) — cada aba já tem seu próprio módulo;
    // exigir o módulo "obras" aqui bloquearia por engano quem tem acesso
    // a um módulo interno mas não à listagem de obras em si. "obras"
    // como módulo governa CRIAR/EDITAR/EXCLUIR o registro da obra, não
    // abrir a página.
    Route::apiResource('obras', ObraController::class)
        ->middlewareFor('index', 'permissaoModulo:obras,usar')
        ->middlewareFor('store', 'permissaoModulo:obras,criar')
        ->middlewareFor('show', 'permissaoObra:ver')
        ->middlewareFor('update', ['permissaoModulo:obras,editar', 'permissaoObra:lancar'])
        ->middlewareFor('destroy', ['permissaoModulo:obras,excluir', 'permissaoObra:lancar']);

    // "Quem acessa esta obra" (31/08/2026, "Controle de permissões") —
    // editado na própria tela da obra, não na aba de Configurações.
    Route::get('obras/{obra}/acessos', [ObraController::class, 'listarAcessos']);
    Route::put('obras/{obra}/acessos', [ObraController::class, 'syncAcessos']);

    // EAP — exceção de "Controle de permissões" (31/08/2026): sempre
    // visível a quem tem acesso à obra (sem permissaoModulo:eap,usar —
    // só a checagem de obra), só a EDIÇÃO segue a regra normal de módulo.
    Route::get('obras/{obra}/eap', [ObraController::class, 'showEap'])
        ->middleware('permissaoObra:ver');
    Route::put('obras/{obra}/eap', [ObraController::class, 'syncEap'])
        ->middleware(['permissaoModulo:eap,editar', 'permissaoObra:lancar']);
    Route::get('obras/{obra}/eap/relatorio/pdf', [EapPdfController::class, 'relatorioEap'])
        ->middleware('permissaoObra:ver');
    Route::get('obras/{obra}/empreitas/resumo-profissional/pdf', [EmpreitaPdfController::class, 'resumoProfissional'])
        ->middleware(['permissaoModulo:empreitas,usar', 'permissaoObra:ver']);
    Route::get('obras/{obra}/desembolso/relatorio/pdf', [CronogramaPdfController::class, 'relatorioCronograma'])
        ->middleware(['permissaoModulo:desembolso,usar', 'permissaoObra:ver']);
    Route::get('obras/{obra}/contrato/pdf', [ContratoPdfController::class, 'obra'])
        ->middleware('permissaoObra:ver');
    Route::get('obras/{obra}/relatorio/pdf', [RelatorioPdfController::class, 'relatorioObra'])
        ->middleware(['permissaoModulo:relatorios,usar', 'permissaoObra:ver']);
    Route::get('obras/{obra}/cronograma/planejamentos', [CronogramaPlanejamentoController::class, 'index'])
        ->middleware(['permissaoModulo:cronograma,usar', 'permissaoObra:ver']);
    Route::put('obras/{obra}/cronograma/planejamentos', [CronogramaPlanejamentoController::class, 'store'])
        ->middleware(['permissaoModulo:cronograma,editar', 'permissaoObra:lancar']);
    Route::delete('obras/{obra}/cronograma/planejamentos', [CronogramaPlanejamentoController::class, 'destroy'])
        ->middleware(['permissaoModulo:cronograma,excluir', 'permissaoObra:lancar']);

    // Medições — `medicoes/{medicao}` não carrega `{obra}` na URL (só
    // `obras/{obra}/medicoes`), mas o `PermissaoObra` resolve pelo
    // `obra_id` do model já carregado (mesmo mecanismo de Mapas).
    Route::get('obras/{obra}/medicoes', [MedicaoController::class, 'index'])
        ->middleware(['permissaoModulo:medicoes,usar', 'permissaoObra:ver']);
    Route::post('obras/{obra}/medicoes', [MedicaoController::class, 'store'])
        ->middleware(['permissaoModulo:medicoes,criar', 'permissaoObra:lancar']);
    Route::get('medicoes/{medicao}', [MedicaoController::class, 'show'])
        ->middleware(['permissaoModulo:medicoes,usar', 'permissaoObra:ver']);
    Route::put('medicoes/{medicao}', [MedicaoController::class, 'update'])
        ->middleware(['permissaoModulo:medicoes,editar', 'permissaoObra:lancar']);
    // "aprovar" é o fecho/confirmação da medição (mesma família de
    // "confirmar/reabrir" do resto do app) — mapeia pra `editar` porque
    // não existe uma ação de reabrir medição aprovada (só excluir, se for
    // a mais recente).
    Route::post('medicoes/{medicao}/aprovar', [MedicaoController::class, 'aprovar'])
        ->middleware(['permissaoModulo:medicoes,editar', 'permissaoObra:lancar']);
    Route::delete('medicoes/{medicao}', [MedicaoController::class, 'destroy'])
        ->middleware(['permissaoModulo:medicoes,excluir', 'permissaoObra:lancar']);
    Route::get('medicoes/{medicao}/relatorio/pdf', [MedicaoPdfController::class, 'relatorioMedicao'])
        ->middleware(['permissaoModulo:medicoes,usar', 'permissaoObra:ver']);

    // Diárias (F7, 22/09/2026) — mesmo mecanismo de Medições: rota de obra
    // pra listar/criar; editar/excluir/fechar levam o id "solto" (o
    // obra_id do model já resolve o PermissaoObra). "fechar" vem antes de
    // '{diaria}' só por organização — os métodos HTTP não colidem.
    Route::get('obras/{obra}/diarias', [DiariaController::class, 'index'])
        ->middleware(['permissaoModulo:diarias,usar', 'permissaoObra:ver']);
    Route::post('obras/{obra}/diarias', [DiariaController::class, 'store'])
        ->middleware(['permissaoModulo:diarias,criar', 'permissaoObra:lancar']);
    Route::post('obras/{obra}/diarias/fechar', [DiariaController::class, 'fechar'])
        ->middleware(['permissaoModulo:diarias,editar', 'permissaoObra:lancar']);
    Route::put('obras/{obra}/diarias/{diaria}', [DiariaController::class, 'update'])
        ->middleware(['permissaoModulo:diarias,editar', 'permissaoObra:lancar']);
    Route::delete('obras/{obra}/diarias/{diaria}', [DiariaController::class, 'destroy'])
        ->middleware(['permissaoModulo:diarias,excluir', 'permissaoObra:lancar']);

    // Configurações — "Categorias de custo padrão" das diárias (vale pra empresa toda).
    Route::get('diarias/categorias', [DiariaController::class, 'categorias'])
        ->middleware('permissaoModulo:diarias,usar');
    Route::put('diarias/categorias', [DiariaController::class, 'salvarCategorias'])
        ->middleware('permissaoModulo:diarias,editar');

    // Controle de contrato de equipamentos (26/09/2026) — mesmo mecanismo de
    // Diárias: rota de obra pra listar/criar; editar/renovar/excluir levam o
    // id "solto" (o obra_id do model já resolve o PermissaoObra), mesmo
    // padrão do RDO (`{rdo}`, não `{id}`).
    Route::get('obras/{obra}/contratos-equipamentos', [ContratoEquipamentoController::class, 'index'])
        ->middleware(['permissaoModulo:contratos_equipamentos,usar', 'permissaoObra:ver']);
    // Página de controle geral (27/09/2026, pedido do Lucas) — cruza todas as obras, sem
    // `permissaoObra` na rota (mesmo motivo da Agenda geral: o filtro roda dentro do controller).
    Route::get('contratos-equipamentos', [ContratoEquipamentoController::class, 'indexGeral'])
        ->middleware('permissaoModulo:contratos_equipamentos,usar');
    Route::post('obras/{obra}/contratos-equipamentos', [ContratoEquipamentoController::class, 'store'])
        ->middleware(['permissaoModulo:contratos_equipamentos,criar', 'permissaoObra:lancar']);
    Route::get('contratos-equipamentos/{contratoEquipamento}', [ContratoEquipamentoController::class, 'show'])
        ->middleware(['permissaoModulo:contratos_equipamentos,usar', 'permissaoObra:ver']);
    Route::put('contratos-equipamentos/{contratoEquipamento}', [ContratoEquipamentoController::class, 'update'])
        ->middleware(['permissaoModulo:contratos_equipamentos,editar', 'permissaoObra:lancar']);
    Route::post('contratos-equipamentos/{contratoEquipamento}/renovar', [ContratoEquipamentoController::class, 'renovar'])
        ->middleware(['permissaoModulo:contratos_equipamentos,editar', 'permissaoObra:lancar']);
    Route::delete('contratos-equipamentos/{contratoEquipamento}', [ContratoEquipamentoController::class, 'destroy'])
        ->middleware(['permissaoModulo:contratos_equipamentos,excluir', 'permissaoObra:lancar']);

    // Agenda (26/09/2026) — compromissos com horário, gerais ou de uma obra, com participantes.
    // Sem `permissaoObra` na rota: a Agenda geral junta todas as obras, então o filtro/conferência
    // por obra roda dentro do controller (mesmo motivo do Diário de obra abaixo).
    Route::get('agenda', [AgendaController::class, 'index'])
        ->middleware('permissaoModulo:agenda,usar');
    Route::get('agenda/usuarios', [AgendaController::class, 'usuarios'])
        ->middleware('permissaoModulo:agenda,usar');
    Route::post('agenda', [AgendaController::class, 'store'])
        ->middleware('permissaoModulo:agenda,criar');
    Route::put('agenda/{evento}', [AgendaController::class, 'update'])
        ->middleware('permissaoModulo:agenda,editar');
    Route::delete('agenda/{evento}', [AgendaController::class, 'destroy'])
        ->middleware('permissaoModulo:agenda,excluir');

    // Diário de obra — `GET /diario` sem obra_id lista de TODAS as obras
    // (resumo do dashboard), então não leva `permissaoObra` na rota — o
    // filtro por obra roda dentro do controller (mesmo motivo de
    // Empreitas/Pagamentos/Mapas abaixo).
    Route::get('diario', [DiarioObraController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('diario', [DiarioObraController::class, 'store'])
        ->middleware(['permissaoModulo:diario_obra,criar', 'permissaoObra:lancar']);
    Route::delete('diario/{registro}', [DiarioObraController::class, 'destroy'])
        ->middleware(['permissaoModulo:diario_obra,excluir', 'permissaoObra:lancar']);

    // Diário de obra — extensões de 08/09/2026 (especificação completa).
    // "Finalizar" É a assinatura eletrônica automática do responsável
    // (ver DiarioObraController::finalizar) — não existe rota separada
    // de "assinar".
    Route::post('diario/{registro}/finalizar', [DiarioObraController::class, 'finalizar'])
        ->middleware(['permissaoModulo:diario_obra,editar', 'permissaoObra:lancar']);
    Route::get('diario/pendentes-assinatura', [DiarioObraController::class, 'pendentesAssinatura'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::get('diario/ultima-mao-de-obra', [DiarioObraController::class, 'ultimaMaoDeObra'])
        ->middleware('permissaoModulo:diario_obra,usar');

    // Catálogo de equipamentos — cadastro inicial reaproveitado nos
    // lançamentos do diário (item E da especificação).
    Route::get('equipamentos-catalogo', [EquipamentoCatalogoController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('equipamentos-catalogo', [EquipamentoCatalogoController::class, 'store'])
        ->middleware('permissaoModulo:diario_obra,criar');

    // Link de acesso do contratante da obra (cliente final) — quem
    // gera/revoga é sempre alguém do lado da contratada.
    Route::get('obras/{obra}/contratante-links', [ObraContratanteLinkController::class, 'index'])
        ->middleware('permissaoModulo:diario_obra,usar');
    Route::post('obras/{obra}/contratante-links', [ObraContratanteLinkController::class, 'store'])
        ->middleware('permissaoModulo:diario_obra,criar');
    Route::delete('contratante-links/{link}', [ObraContratanteLinkController::class, 'destroy'])
        ->middleware('permissaoModulo:diario_obra,excluir');

    // Mapas — módulo-prova do padrão de "Controle de permissões"
    // (31/08/2026): cobre lista geral (index, só permissaoModulo — cruza
    // várias obras, o filtro por obra roda dentro de
    // MapaController::index) + registro específico de uma obra (os
    // outros verbos, módulo + obra juntos).
    Route::apiResource('mapas', MapaController::class)
        ->middlewareFor('index', 'permissaoModulo:mapas,usar')
        ->middlewareFor('show', ['permissaoModulo:mapas,usar', 'permissaoObra:ver'])
        ->middlewareFor('store', ['permissaoModulo:mapas,criar', 'permissaoObra:lancar'])
        ->middlewareFor('update', ['permissaoModulo:mapas,editar', 'permissaoObra:lancar'])
        ->middlewareFor('destroy', ['permissaoModulo:mapas,excluir', 'permissaoObra:lancar']);
    Route::get('mapas/{mapa}/relatorio/pdf', [MapaPdfController::class, 'relatorioMapa'])
        ->middleware(['permissaoModulo:mapas,usar', 'permissaoObra:ver']);

    // Precisa vir ANTES do apiResource abaixo — senão o route-model-binding
    // de `{empreita}` tenta interpretar "resumo" como um id e nunca chega
    // no controller certo (25/08/2026, ver EmpreitaController::resumoObra).
    Route::get('empreitas/resumo', [EmpreitaController::class, 'resumoObra'])
        ->middleware(['permissaoModulo:empreitas,usar', 'permissaoObra:ver']);
    // `index` sem `permissaoObra` — cruza várias obras, filtro roda no
    // controller (mesmo motivo de Mapas/Pagamentos/Diário acima).
    Route::apiResource('empreitas', EmpreitaController::class)
        ->middlewareFor('index', 'permissaoModulo:empreitas,usar')
        ->middlewareFor('show', ['permissaoModulo:empreitas,usar', 'permissaoObra:ver'])
        ->middlewareFor('store', ['permissaoModulo:empreitas,criar', 'permissaoObra:lancar'])
        ->middlewareFor('update', ['permissaoModulo:empreitas,editar', 'permissaoObra:lancar'])
        ->middlewareFor('destroy', ['permissaoModulo:empreitas,excluir', 'permissaoObra:lancar']);
    Route::post('empreitas/{empreita}/registros', [EmpreitaController::class, 'registrarMedicao'])
        ->middleware(['permissaoModulo:empreitas,editar', 'permissaoObra:lancar']);
    Route::get('empreitas/{empreita}/relatorio/pdf', [EmpreitaPdfController::class, 'relatorioEmpreita'])
        ->middleware(['permissaoModulo:empreitas,usar', 'permissaoObra:ver']);
    // Anexos (27/09/2026, contrato assinado) — mesmo mecanismo de Pagamento/Recebimento, ver AnexoController.
    Route::get('empreitas/{empreita}/anexos', [AnexoController::class, 'indexEmpreita'])
        ->middleware(['permissaoModulo:empreitas,usar', 'permissaoObra:ver']);
    Route::post('empreitas/{empreita}/anexos', [AnexoController::class, 'storeEmpreita'])
        ->middleware(['permissaoModulo:empreitas,editar', 'permissaoObra:lancar']);
    Route::put('empreitas/{empreita}/contrato-assinado', [EmpreitaController::class, 'marcarContratoAssinado'])
        ->middleware(['permissaoModulo:empreitas,editar', 'permissaoObra:lancar']);

    // Modelos de contrato (28/09/2026, itens 8/9) — cadastro geral
    // (Configurações), sem `permissaoModulo` própria, mesmo padrão de
    // Materiais/Profissionais/Fornecedores (ver ContratoModeloController).
    Route::get('contrato-modelos', [ContratoModeloController::class, 'index']);
    Route::post('contrato-modelos', [ContratoModeloController::class, 'store']);
    Route::put('contrato-modelos/{contratoModelo}', [ContratoModeloController::class, 'update']);
    Route::delete('contrato-modelos/{contratoModelo}', [ContratoModeloController::class, 'destroy']);

    // Estilos de texto nomeados pelo usuário (29/09/2026, editor rico dos
    // modelos de contrato) — únicos por empresa, mesmo padrão acima.
    Route::get('contrato-estilos', [ContratoEstiloController::class, 'index']);
    Route::post('contrato-estilos', [ContratoEstiloController::class, 'store']);
    Route::put('contrato-estilos/{contratoEstilo}', [ContratoEstiloController::class, 'update']);
    Route::delete('contrato-estilos/{contratoEstilo}', [ContratoEstiloController::class, 'destroy']);

    Route::get('empreitas/{empreita}/contrato/pdf', [ContratoPdfController::class, 'empreita'])
        ->middleware(['permissaoModulo:empreitas,usar', 'permissaoObra:ver']);

    // Geração em massa + anexo automático (30/09/2026) — sem `{empreita}`
    // na URL (recebe uma lista no corpo), então a checagem de acesso por
    // obra é manual, dentro do controller (ver `gerarEAnexarEmLote`).
    Route::post('empreitas/contratos/gerar-em-lote', [ContratoPdfController::class, 'gerarEAnexarEmLote'])
        ->middleware('permissaoModulo:empreitas,usar');

    // `index` sem `permissaoObra` — cruza várias obras, filtro roda no
    // controller (`PagamentoController::index`).
    Route::apiResource('pagamentos', PagamentoController::class)
        ->middlewareFor('index', 'permissaoModulo:pagamentos,usar')
        ->middlewareFor('show', ['permissaoModulo:pagamentos,usar', 'permissaoObra:ver'])
        ->middlewareFor('store', ['permissaoModulo:pagamentos,criar', 'permissaoObra:lancar'])
        ->middlewareFor('update', ['permissaoModulo:pagamentos,editar', 'permissaoObra:lancar'])
        ->middlewareFor('destroy', ['permissaoModulo:pagamentos,excluir', 'permissaoObra:lancar']);
    Route::post('pagamentos/ler-nota', [NotaFiscalController::class, 'ler'])
        ->middleware('permissaoModulo:pagamentos,criar');
    // Anexos (06/09/2026, controle de notas fiscais) — ver AnexoController.
    Route::get('pagamentos/{pagamento}/anexos', [AnexoController::class, 'indexPagamento'])
        ->middleware(['permissaoModulo:pagamentos,usar', 'permissaoObra:ver']);
    Route::post('pagamentos/{pagamento}/anexos', [AnexoController::class, 'storePagamento'])
        ->middleware(['permissaoModulo:pagamentos,editar', 'permissaoObra:lancar']);
    // Alimenta o cadastro de Fornecedores (módulo ainda fora do "Controle
    // de permissões" — sem backend relacional próprio), não Pagamentos —
    // fica sem gate de propósito.
    Route::post('fornecedores/ler-nota', [NotaFiscalController::class, 'lerFornecedor']);

    // Recebimentos (01/09/2026, pedido do Lucas) — mirror exato do bloco
    // de Pagamentos acima, ver RecebimentoController.
    Route::apiResource('recebimentos', RecebimentoController::class)
        ->middlewareFor('index', 'permissaoModulo:recebimentos,usar')
        ->middlewareFor('show', ['permissaoModulo:recebimentos,usar', 'permissaoObra:ver'])
        ->middlewareFor('store', ['permissaoModulo:recebimentos,criar', 'permissaoObra:lancar'])
        ->middlewareFor('update', ['permissaoModulo:recebimentos,editar', 'permissaoObra:lancar'])
        ->middlewareFor('destroy', ['permissaoModulo:recebimentos,excluir', 'permissaoObra:lancar']);
    // Anexos (06/09/2026, controle de notas fiscais) — ver AnexoController.
    Route::get('recebimentos/{recebimento}/anexos', [AnexoController::class, 'indexRecebimento'])
        ->middleware(['permissaoModulo:recebimentos,usar', 'permissaoObra:ver']);
    Route::post('recebimentos/{recebimento}/anexos', [AnexoController::class, 'storeRecebimento'])
        ->middleware(['permissaoModulo:recebimentos,editar', 'permissaoObra:lancar']);

    Route::get('storage', [StorageController::class, 'get']);
    Route::post('storage', [StorageController::class, 'set']);
    Route::delete('storage', [StorageController::class, 'remove']);

    // Arquivos — `{arquivo}` não tem `obra_id` próprio (só via `Pasta`);
    // `Arquivo::getObraIdAttribute()` resolve isso pro `PermissaoObra`
    // achar do mesmo jeito que acha em qualquer outro model.
    Route::get('obras/{obra}/pastas/raizes', [PastaController::class, 'raizes'])
        ->middleware(['permissaoModulo:arquivos,usar', 'permissaoObra:ver']);
    Route::get('pastas/{pasta}', [PastaController::class, 'show'])
        ->middleware(['permissaoModulo:arquivos,usar', 'permissaoObra:ver']);
    Route::post('pastas/{pasta}/subpastas', [PastaController::class, 'store'])
        ->middleware(['permissaoModulo:arquivos,criar', 'permissaoObra:lancar']);
    Route::put('pastas/{pasta}', [PastaController::class, 'update'])
        ->middleware(['permissaoModulo:arquivos,editar', 'permissaoObra:lancar']);
    Route::delete('pastas/{pasta}', [PastaController::class, 'destroy'])
        ->middleware(['permissaoModulo:arquivos,excluir', 'permissaoObra:lancar']);

    Route::post('pastas/{pasta}/arquivos', [ArquivoController::class, 'store'])
        ->middleware(['permissaoModulo:arquivos,criar', 'permissaoObra:lancar']);
    Route::put('arquivos/{arquivo}', [ArquivoController::class, 'update'])
        ->middleware(['permissaoModulo:arquivos,editar', 'permissaoObra:lancar']);
    Route::delete('arquivos/{arquivo}', [ArquivoController::class, 'destroy'])
        ->middleware(['permissaoModulo:arquivos,excluir', 'permissaoObra:lancar']);
    Route::get('arquivos/{arquivo}/download', [ArquivoController::class, 'download'])
        ->middleware(['permissaoModulo:arquivos,usar', 'permissaoObra:ver']);
    Route::get('arquivos/{arquivo}/preview-url', [ArquivoController::class, 'previewUrl'])
        ->middleware(['permissaoModulo:arquivos,usar', 'permissaoObra:ver']);
});

/*
|--------------------------------------------------------------------------
| Relatório Diário de Obra (RDO) — 17/09/2026
|--------------------------------------------------------------------------
|
| As rotas do módulo vivem em routes/rdo.php, e não aqui, para que este
| arquivo compartilhado precise de uma linha só. Ver o cabeçalho daquele
| arquivo.
*/
require __DIR__.'/rdo.php';
