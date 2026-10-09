# Ícone e tela de abertura do app (09/10/2026)

Imagens-fonte do ícone e da tela de abertura do app ComTrena, feitas a partir
do manual de identidade (`ComTrena_Identidade_Visual/`):

- `icon-only.png` — ícone "principal" do manual (aparelhos antigos);
- `icon-foreground.png` + `icon-background.png` — ícone adaptável do Android
  (símbolo na mesma posição do ícone principal, fundo azul `#1B3A4B`);
- `splash.png` / `splash-dark.png` — logomarca horizontal no fundo azul.

Para refazer depois de mudar o manual (na pasta `frontend/`):

```
node assets/gerar-icones.js ../ComTrena_Identidade_Visual assets
npx @capacitor/assets generate --android --iconBackgroundColor '#1B3A4B' --iconBackgroundColorDark '#1B3A4B' --splashBackgroundColor '#1B3A4B' --splashBackgroundColorDark '#1B3A4B'
```

O `gerar-icones.js` usa o pacote `sharp` (instale com `npm i -D sharp` ou rode
onde o `@capacitor/assets` estiver instalado). Depois de gerar, confira que o
`android/app/src/main/AndroidManifest.xml` não foi reformatado à toa.
