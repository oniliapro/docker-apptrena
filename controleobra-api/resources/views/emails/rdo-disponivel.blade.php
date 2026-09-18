<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Novo relatório diário disponível</title></head>
<body style="margin:0;padding:24px;background:#f5f6f3;font-family:Arial,Helvetica,sans-serif;color:#1f2724;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dadcd5;border-radius:4px;padding:28px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5b6560;">AppTrena</p>
    <h1 style="margin:0 0 18px;font-size:20px;color:#1b3a4b;">
      Relatório Diário de Obra nº {{ $rdo->numero }}
    </h1>

    <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
      Há um novo relatório disponível para acompanhamento
      @if($rdo->obra)da obra <strong>{{ $rdo->obra->obra_nome }}</strong>@endif,
      referente a {{ $rdo->data?->format('d/m/Y') }}.
    </p>

    <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
      É só abrir o link abaixo — não precisa de senha nem de cadastro.
    </p>

    <p style="margin:0 0 24px;">
      <a href="{{ $linkPublico }}"
         style="display:inline-block;background:#1b3a4b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:3px;font-size:15px;">
        Ver o relatório
      </a>
    </p>

    <p style="margin:0;font-size:12px;line-height:1.5;color:#5b6560;border-top:1px solid #dadcd5;padding-top:16px;">
      Se o botão não funcionar, copie este endereço no navegador:<br>
      <span style="word-break:break-all;">{{ $linkPublico }}</span>
    </p>
  </div>
</body>
</html>
