// Gera ícones e splash screens de Android e iOS a partir de resources/.
//
//   resources/icon.png       ícone quadrado cheio (fundo azul + barras), ≥ 1024 px
//   resources/logo-mark.png       barras creme, fundo transparente (adaptive icon)
//   resources/logo-mark-blue.png  barras azuis, fundo transparente (splash)
//
// Uso: npm run assets   (depois: npx cap sync)
//
// Mesma arte do ERP (public/images/pwa-icons/pwa-icon.png e images/erp-bage.png).

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const BRAND = '#004cff';
// Splash: cinza padrão do ERP com as barras azuis (o ícone do app segue azul).
const SPLASH_BG = '#f0f0f0';
const ICON = `${root}resources/icon.png`;
const MARK = `${root}resources/logo-mark.png`;
const MARK_SPLASH = `${root}resources/logo-mark-blue.png`;

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

const circleMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

// ------------------------------------------------------------------- iOS
// App Store: 1024×1024 sem transparência.
await save(`${iosAssets}/AppIcon.appiconset/AppIcon-512@2x.png`, sharp(ICON).resize(1024, 1024).flatten({ background: BRAND }).removeAlpha());

// LaunchScreen.storyboard usa a imagem "Splash" com aspect fill.
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await save(`${iosAssets}/Splash.imageset/${name}`, (await markOn(2732, 2732, 0.2, SPLASH_BG, MARK_SPLASH)).flatten({ background: SPLASH_BG }).removeAlpha());
}

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
  await save(`${androidRes}/drawable-port-${density}/splash.png`, await markOn(pw, ph, 0.3, SPLASH_BG, MARK_SPLASH));
  await save(`${androidRes}/drawable-land-${density}/splash.png`, await markOn(ph, pw, 0.3, SPLASH_BG, MARK_SPLASH));

  // Splash do Android 12+: ícone sem fundo, 288dp com o conteúdo dentro do círculo de 192dp.
  const splashIcon = Math.round(288 * scale);
  await save(`${androidRes}/drawable-${density}/splash_icon.png`, await markOn(splashIcon, splashIcon, 0.42, { r: 0, g: 0, b: 0, alpha: 0 }, MARK_SPLASH));
}
await save(`${androidRes}/drawable/splash.png`, await markOn(480, 320, 0.3, SPLASH_BG, MARK_SPLASH));

console.log('\nPronto. Rode `npx cap sync` se ainda não rodou.');
