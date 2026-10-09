const sharp = require('sharp');
const fs = require('fs');
const [V, OUT] = process.argv.slice(2);
const AZUL = '#1B3A4B';

// Desenho do símbolo (aparelho de trena a laser) no padrão do ícone "principal"
// do manual — coordenadas originais 24.75 x 70.52.
const simbolo = `<defs><linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E8A33D" stop-opacity="1"/><stop offset="1" stop-color="#E8A33D" stop-opacity="0"/></linearGradient><clipPath id="clip"><rect x="4.9" y="25.98" width="14.95" height="9.24" rx="1.46"/></clipPath></defs><rect x="10.185" y="0" width="4.38" height="18.88" rx="2.19" fill="url(#ray)"/><rect x="0" y="21.08" width="24.75" height="49.44" rx="4.46" fill="#DDE7EA"/><rect x="2.2" y="23.28" width="20.35" height="16.64" rx="2.92" fill="${AZUL}"/><rect x="4.9" y="25.98" width="14.95" height="9.24" rx="1.46" fill="#DDE7EA"/><g clip-path="url(#clip)"><polygon points="9.4,25.98 12.6,25.98 10.1,35.22 6.9,35.22" fill="${AZUL}" opacity="0.35"/></g><rect x="7.65" y="47.17" width="9.45" height="9.45" rx="1.8" fill="#E8A33D"/><polygon points="12.375,48.17 15.96,54.33 8.79,54.33" fill="#DDE7EA"/><rect x="2.2" y="63.86" width="20.35" height="4.46" rx="2.23" fill="${AZUL}"/>`;

// Ícone adaptável do Android: mesma posição e tamanho do símbolo no ícone "principal" do manual
// (o @capacitor/assets encaixa esta imagem na área visível do ícone, então ela
// fica igual ao principal e cabe inteira em qualquer formato de ícone).

const escala = 10.74532, altura = 70.52 * escala, largura = 24.75 * escala;
const x = (1024 - largura) / 2, y = (1024 - altura) / 2;
const frente = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(${x} ${y}) scale(${escala})">${simbolo}</g></svg>`;

(async () => {
  await sharp(Buffer.from(frente)).png().toFile(`${OUT}/icon-foreground.png`);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: AZUL } }).png().toFile(`${OUT}/icon-background.png`);
  // Ícone "inteiro" (aparelhos antigos, Android 7): o ícone principal do manual, sem alteração.
  await sharp(fs.readFileSync(`${V}/05_Icones_app/comtrena-app-icon-principal-1024.svg`)).resize(1024, 1024).png().toFile(`${OUT}/icon-only.png`);
  // Tela de abertura: logomarca horizontal para fundo primário, centralizada.
  const logo = await sharp(`${V}/01_Logomarca_horizontal/comtrena-logomarca-para-fundo-primaria-1B3A4B.png`).resize({ width: 800 }).png().toBuffer();
  for (const nome of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: AZUL } })
      .composite([{ input: logo, gravity: 'center' }]).png().toFile(`${OUT}/${nome}`);
  }
  console.log('ok', Math.round(largura), altura);
})();
