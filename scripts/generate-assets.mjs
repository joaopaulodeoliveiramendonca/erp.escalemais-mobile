// Gera ícones e splash screens de Android e iOS a partir de resources/.
//
//   resources/icon.png       ícone quadrado cheio (fundo azul + barras), ≥ 1024 px
//   resources/logo-mark.png       barras creme, fundo transparente (adaptive icon)
//   resources/logo-mark-blue.png  barras azuis, fundo transparente (splash)
//   resources/icone-azul.svg      ícone da Escale Mais (site), no "from Escale Mais" da splash
//   resources/fonts/              Poppins (OFL), a fonte do nome no site
//
// Uso: npm run assets   (depois: npx cap sync)
//
// Mesma arte do ERP (public/images/pwa-icons/pwa-icon.png e images/erp-bage.png).

import opentype from 'opentype.js';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const BRAND = '#004cff';
// Splash: cinza padrão do ERP com as barras azuis (o ícone do app segue azul).
const SPLASH_BG = '#f0f0f0';
// Tamanho das barras na splash: ~20% da largura do celular (~80pt/dp).
// iOS: a imagem quadrada de 2732px é esticada para preencher a altura da tela,
// por isso a proporção é bem menor que a do Android.
const SPLASH_RATIO_IOS = 0.09;
const SPLASH_RATIO = 0.2;
const ICON = `${root}resources/icon.png`;
const MARK = `${root}resources/logo-mark.png`;
const MARK_SPLASH = `${root}resources/logo-mark-blue.png`;

// Assinatura no rodapé da splash, como o "from Meta" do WhatsApp, com o lockup
// do site (escalemais/public: icone-azul.svg + "Escale Mais" / "Tecnologia & Software" em Poppins).
// Quadro de 200×80dp: o tamanho do `windowSplashScreenBrandingImage` do Android 12+.
// Tudo num tom só e suave (azul-marinho translúcido), para não competir com as barras do centro.
const BRANDING = {
  width: 200,
  height: 80,
  from: 'from',
  name: 'Escale Mais',
  tagline: 'Tecnologia & Software',
  ink: '#00002d',
  fromOpacity: 0.4,
  lockupOpacity: 0.55,
  taglineOpacity: 0.85,
};
const loadFont = async (file) => {
  const data = await readFile(`${root}resources/fonts/${file}`);
  return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
};
const fontRegular = await loadFont('Poppins-Regular.ttf');
const fontSemiBold = await loadFont('Poppins-SemiBold.ttf');
const fontLight = await loadFont('Poppins-Light.ttf');
// Sem width/height na raiz: o tamanho vem do <svg> aninhado em branding().
const ICON_SVG = (await readFile(`${root}resources/icone-azul.svg`, 'utf8'))
  .replace(/^<\?xml[^>]*>\s*/, '')
  .replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, ''));
// No Android 12+ as barras da splash têm 80dp (288dp × 0.28); a assinatura acompanha essa proporção.
const SPLASH_MARK_DP = 80;

const androidRes = `${root}android/app/src/main/res`;
const iosAssets = `${root}ios/App/App/Assets.xcassets`;

async function save(path, pipeline) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await pipeline.png({ compressionLevel: 9 }).toBuffer());
  console.log('✔', path.replace(root, ''));
}

/** Barras centralizadas num quadro `w×h`, ocupando `ratio` do menor lado. */
async function markOn(w, h, ratio, background, source = MARK) {
  const size = Math.round(Math.min(w, h) * ratio);
  const mark = await sharp(source).trim().resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background } }).composite([{ input: mark, gravity: 'centre' }]);
}

/** Texto em curvas (sem depender das fontes instaladas na máquina): `<path>` + largura, em dp. */
function textPath(font, content, size, x, baseline, letterSpacing = 0) {
  const options = { letterSpacing };
  // Desenhado na origem e movido com translate: o opentype.js 2.0 gera coordenadas NaN
  // quando combina letterSpacing com x diferente de zero.
  const d = font.getPath(content, 0, 0, size, options).toPathData(3);
  if (d.includes('NaN')) throw new Error(`Caminho inválido para "${content}"`);
  return { d, transform: `translate(${x} ${baseline})`, width: font.getAdvanceWidth(content, size, options) };
}

/** Altura das maiúsculas da fonte em `size` dp (para alinhar texto pelo topo visível). */
const capHeight = (font, size) => (font.tables.os2.sCapHeight / font.unitsPerEm) * size;

/**
 * "from" + lockup do site (icone-azul + "Escale Mais" em Poppins SemiBold e
 * "Tecnologia & Software" em Poppins Light), fundo transparente, em `scale` px por dp.
 */
async function branding(scale) {
  const { width: w, height: h } = BRANDING;
  const fromSize = 12;
  const fromText = textPath(fontRegular, BRANDING.from, fromSize, 0, 0);

  // Proporções do .brand-lockup do site: tagline com metade do tamanho do nome.
  const nameSize = 18;
  const taglineSize = 9;
  const iconSize = 30;
  const gap = 7;
  const name = { width: textPath(fontSemiBold, BRANDING.name, nameSize, 0, 0, -0.01).width };
  const tagline = { width: textPath(fontLight, BRANDING.tagline, taglineSize, 0, 0, 0.02).width };
  const left = (w - (iconSize + gap + Math.max(name.width, tagline.width))) / 2;
  const textLeft = left + iconSize + gap;

  // Bloco de texto (topo do "E" até a base do "Tecnologia"), centralizado com o ícone.
  const textTop = 39;
  const nameBaseline = textTop + capHeight(fontSemiBold, nameSize);
  const taglineBaseline = nameBaseline + 4 + capHeight(fontLight, taglineSize);
  const iconTop = (textTop + taglineBaseline) / 2 - iconSize / 2;

  const fromPath = textPath(fontRegular, BRANDING.from, fromSize, (w - fromText.width) / 2, 25);
  const namePath = textPath(fontSemiBold, BRANDING.name, nameSize, textLeft, nameBaseline, -0.01);
  const taglinePath = textPath(fontLight, BRANDING.tagline, taglineSize, textLeft, taglineBaseline, 0.02);

  // Ícone na cor do texto (não no azul da marca), como o "from Meta" do WhatsApp.
  const icon = ICON_SVG.replace('<svg ', `<svg x="${left}" y="${iconTop}" width="${iconSize}" height="${iconSize}" `).replaceAll(
    'fill="#004cff"',
    `fill="${BRANDING.ink}"`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}">
  <path d="${fromPath.d}" transform="${fromPath.transform}" fill="${BRANDING.ink}" fill-opacity="${BRANDING.fromOpacity}"/>
  <g opacity="${BRANDING.lockupOpacity}">
    ${icon}
    <path d="${namePath.d}" transform="${namePath.transform}" fill="${BRANDING.ink}"/>
    <path d="${taglinePath.d}" transform="${taglinePath.transform}" fill="${BRANDING.ink}" fill-opacity="${BRANDING.taglineOpacity}"/>
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Splash do Android < 12 (imagem única): barras no centro e assinatura no rodapé.
 * No iOS a assinatura é uma imagem à parte (a splash quadrada é cortada em cima e embaixo).
 */
async function splashImage(w, h, ratio) {
  const markPx = Math.round(Math.min(w, h) * ratio);
  const scale = markPx / SPLASH_MARK_DP;
  const sign = await branding(scale);
  const signHeight = Math.round(BRANDING.height * scale);
  return sharp(await (await markOn(w, h, ratio, SPLASH_BG, MARK_SPLASH)).png().toBuffer()).composite([
    { input: sign, top: h - signHeight - Math.round(24 * scale), left: Math.round((w - BRANDING.width * scale) / 2) },
  ]);
}

const circleMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

// ------------------------------------------------------------------- iOS
// App Store: 1024×1024 sem transparência.
await save(`${iosAssets}/AppIcon.appiconset/AppIcon-512@2x.png`, sharp(ICON).resize(1024, 1024).flatten({ background: BRAND }).removeAlpha());

// LaunchScreen.storyboard usa a imagem "Splash" com aspect fill.
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await save(`${iosAssets}/Splash.imageset/${name}`, (await markOn(2732, 2732, SPLASH_RATIO_IOS, SPLASH_BG, MARK_SPLASH)).flatten({ background: SPLASH_BG }).removeAlpha());
}

// "from Escale Mais": UIImageView de 200×80pt preso ao rodapé no LaunchScreen.storyboard.
for (const scale of [1, 2, 3]) {
  await save(`${iosAssets}/SplashBranding.imageset/splash-branding@${scale}x.png`, sharp(await branding(scale)));
}
await writeFile(
  `${iosAssets}/SplashBranding.imageset/Contents.json`,
  JSON.stringify(
    {
      images: [1, 2, 3].map((scale) => ({ idiom: 'universal', filename: `splash-branding@${scale}x.png`, scale: `${scale}x` })),
      info: { version: 1, author: 'xcode' },
    },
    null,
    2,
  ) + '\n',
);

// --------------------------------------------------------------- Android
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// Tamanhos (retrato) do template do Capacitor.
const splashSizes = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };

for (const [density, scale] of Object.entries(densities)) {
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);

  await save(`${androidRes}/mipmap-${density}/ic_launcher.png`, sharp(ICON).resize(legacy, legacy));
  await save(
    `${androidRes}/mipmap-${density}/ic_launcher_round.png`,
    sharp(ICON).resize(legacy, legacy).composite([{ input: circleMask(legacy), blend: 'dest-in' }]),
  );
  // Adaptive icon: a zona segura é o círculo central de 66/108; as barras ficam dentro dela.
  await save(`${androidRes}/mipmap-${density}/ic_launcher_foreground.png`, await markOn(adaptive, adaptive, 0.42, { r: 0, g: 0, b: 0, alpha: 0 }));

  // Splash legado (Android < 12). No 12+ o sistema usa cor + ícone (styles.xml).
  const [pw, ph] = splashSizes[density];
  await save(`${androidRes}/drawable-port-${density}/splash.png`, await splashImage(pw, ph, SPLASH_RATIO));
  await save(`${androidRes}/drawable-land-${density}/splash.png`, await splashImage(ph, pw, SPLASH_RATIO));

  // Splash do Android 12+: ícone sem fundo, 288dp com o conteúdo dentro do círculo de 192dp.
  const splashIcon = Math.round(288 * scale);
  await save(`${androidRes}/drawable-${density}/splash_icon.png`, await markOn(splashIcon, splashIcon, 0.28, { r: 0, g: 0, b: 0, alpha: 0 }, MARK_SPLASH));
  // "from Escale Mais" no rodapé (values-v31/styles.xml).
  await save(`${androidRes}/drawable-${density}/splash_branding.png`, sharp(await branding(scale)));
}
await save(`${androidRes}/drawable/splash.png`, await splashImage(480, 320, SPLASH_RATIO));

console.log('\nPronto. Rode `npx cap sync` se ainda não rodou.');
