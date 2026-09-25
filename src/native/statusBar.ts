import { StatusBar, Style } from '@capacitor/status-bar';

import { BRAND_COLORS } from '../config/app';
import { isAndroid } from '../config/platform';
import { onDomReady } from '../utils/dom';
import { EscaleNative } from './escaleNative';

/**
 * Mantém a status bar (e o fundo nativo atrás da WebView) com a cor da tela
 * do ERP, nos temas claro e escuro.
 *
 * Fonte da cor, em ordem:
 *   1. <meta name="theme-color"> — o ERP já mantém uma única meta com a cor
 *      do tema escolhido (layouts/dashboard.blade.php, refreshStatusBarMeta);
 *   2. cor de fundo do <body>;
 *   3. cor padrão do tema (classe `dark` no <html>).
 *
 * No PWA do iOS a barra só pegava a cor nova recarregando a página; aqui a
 * troca de tema é aplicada na hora, via MutationObserver.
 */

type Rgb = [number, number, number];

let lastApplied = '';
let override: { color: string; style?: 'light' | 'dark' } | null = null;

function toRgb(color: string): Rgb | null {
  const probe = document.createElement('span');
  probe.style.color = color;
  if (!probe.style.color) return null;
  probe.style.display = 'none';
  document.documentElement.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const m = computed.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null; // transparente
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const toHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Luminância relativa (WCAG). */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function currentThemeMeta(): string | null {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  const match = metas.reverse().find((m) => !m.media || window.matchMedia(m.media).matches);
  return match?.content?.trim() || null;
}

function resolveColor(): Rgb {
  const candidates = [
    override?.color,
    currentThemeMeta(),
    document.body ? getComputedStyle(document.body).backgroundColor : null,
  ];
  for (const candidate of candidates) {
    const rgb = candidate ? toRgb(candidate) : null;
    if (rgb) return rgb;
  }
  const dark = document.documentElement.classList.contains('dark');
  return toRgb(dark ? BRAND_COLORS.surfaceDark : BRAND_COLORS.surfaceLight) ?? [240, 240, 240];
}

async function apply(): Promise<void> {
  const rgb = resolveColor();
  const hex = toHex(rgb);
  // Style.Dark = ícones claros (fundo escuro); Style.Light = ícones escuros.
  const style =
    override?.style === 'light' ? Style.Dark : override?.style === 'dark' ? Style.Light : luminance(rgb) < 0.4 ? Style.Dark : Style.Light;

  const key = `${hex}|${style}`;
  if (key === lastApplied) return;
  lastApplied = key;

  await Promise.allSettled([
    StatusBar.setStyle({ style }),
    // Android sem edge-to-edge (WebView < 140): pinta a própria barra.
    isAndroid() ? StatusBar.setBackgroundColor({ color: hex }) : Promise.resolve(),
    EscaleNative.setBackgroundColor({ color: hex }),
  ]);
}

let scheduled = false;
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void apply();
  });
}

/**
 * Força uma cor (ex.: tela do PDV em tela cheia). `null` volta ao automático.
 * `style` indica o tom do FUNDO: 'dark' → ícones claros.
 */
export function setStatusBarOverride(value: { color: string; style?: 'light' | 'dark' } | null): Promise<void> {
  override = value;
  lastApplied = '';
  return apply();
}

export function refreshStatusBar(): void {
  lastApplied = '';
  schedule();
}

export function setupStatusBar(): void {
  onDomReady(() => {
    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  });
}
