// Gera a pasta `www/` (webDir do Capacitor):
//   www/escale-bridge.js  ← src/bridge/index.ts (injetado no ERP pela camada nativa)
//   www/index.html        ← public/ (casca local exigida pelo Capacitor)
//   www/offline.html      ← public/ (tela "Sem conexão")
//
// Uso: npm run build            (produção: minificado, sem sourcemap)
//      npm run build -- --dev   (sourcemap inline para depurar no Safari/Chrome)

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dev = process.argv.includes('--dev');
const outdir = `${root}www`;

const { version } = JSON.parse(await readFile(`${root}package.json`, 'utf8'));

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(`${root}public`, outdir, { recursive: true });

await build({
  entryPoints: [`${root}src/bridge/index.ts`],
  outfile: `${outdir}/escale-bridge.js`,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  // Android WebView (Chromium) e WKWebView do iOS 15+ (mínimo do Capacitor 8).
  target: ['chrome90', 'safari15'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  charset: 'utf8',
  banner: { js: `/* Escale Mais — bridge nativa v${version} */` },
  logLevel: 'info',
});
