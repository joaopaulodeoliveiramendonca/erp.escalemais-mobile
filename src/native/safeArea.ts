import { onDomReady } from '../utils/dom';
import { EscaleNative } from './escaleNative';

/**
 * Área segura no iOS (notch, Dynamic Island, barra inferior).
 *
 * Páginas do ERP com `<meta name="viewport" content="…viewport-fit=cover">`
 * (o dashboard) já tratam as áreas seguras com env(safe-area-inset-*). As que
 * não declaram (login antigo, erros, impressões, convites…) não conhecem a área
 * segura e ficariam atrás do relógio. Para essas, o iOS passa a reservar o
 * espaço — mesmo comportamento do Safari e do SystemBars do Capacitor no Android.
 *
 * Decide assim que o <meta viewport> aparece (antes da primeira pintura, na
 * maioria das páginas) e confirma no DOMContentLoaded.
 */

let applied: boolean | null = null;

function wantsCover(): boolean | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return null;
  return /viewport-fit\s*=\s*cover/i.test(meta.content);
}

function apply(cover: boolean): void {
  if (applied === cover) return;
  applied = cover;
  void EscaleNative.setSafeAreaMode({ cover }).catch(() => undefined);
}

export function setupSafeArea(): void {
  const observer = new MutationObserver(() => {
    const cover = wantsCover();
    if (cover === null) return;
    observer.disconnect();
    apply(cover);
  });
  observer.observe(document, { childList: true, subtree: true });

  onDomReady(() => {
    observer.disconnect();
    // Sem meta viewport: a página não sabe da área segura.
    apply(wantsCover() ?? false);
  });
}
