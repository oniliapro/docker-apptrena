<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <title>Novo diário de obra disponível</title>
</head>
<body style="font-family: Arial, sans-serif; color: #1f2724; background: #f5f6f3; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #dadcd5; border-radius: 4px; padding: 24px;">
    <h1 style="font-size: 18px; color: #1b3a4b; margin-top: 0;">Novo diário de obra disponível</h1>

    <p>
      Um novo lançamento do diário da obra
      <strong>{{ $obra->obra_nome ?? 'sem nome' }}</strong>
      foi finalizado e já pode ser visualizado.
    </p>

    @if ($registro->data)
      <p>Data do lançamento: <strong>{{ \Illuminate\Support\Carbon::parse($registro->data)->format('d/m/Y') }}</strong></p>
    @endif

    <p style="margin: 24px 0;">
      <a href="{{ $linkPublico }}" style="background: #1b3a4b; color: #ffffff; padding: 10px 20px; border-radius: 3px; text-decoration: none;">
        Ver diário da obra
      </a>
    </p>

    <p style="font-size: 12px; color: #5b6560;">
      Este é um aviso automático do AppTrena. O acesso é somente leitura — não é necessário responder.
    </p>
  </div>
</body>
</html>
