import { log } from '../utils/logger';
import { EscaleNative } from './escaleNative';

/**
 * `window.print()` não faz nada em WebView (Android e iOS). O ERP usa em
 * DANFE, cupons, orçamentos, OS, etiquetas, relatórios… — aqui ele passa a
 * abrir o diálogo de impressão nativo (impressoras, "Salvar como PDF",
 * compartilhar).
 *
 *  - `window.print()` da página → imprime a WebView inteira;
 *  - `iframe.contentWindow.print()` (2FA, offline/print-frame.js) → imprime o
 *    HTML do iframe numa WebView de impressão separada.
 *
 * Os eventos `beforeprint`/`afterprint` continuam sendo disparados.
 */

let printing = false;

async function runPrint(target: Window, job: () => Promise<void>): Promise<void> {
  if (printing) return;
  printing = true;
  target.dispatchEvent(new Event('beforeprint'));
  try {
    await job();
  } catch (err) {
    log.warn('print failed', err);
  } finally {
    printing = false;
    target.dispatchEvent(new Event('afterprint'));
  }
}

export function printPage(): Promise<void> {
  return runPrint(window, () => EscaleNative.print({ jobName: document.title || 'Escale Mais' }));
}

function printFrameDocument(frameWindow: Window): Promise<void> {
  return runPrint(frameWindow, async () => {
    const doc = frameWindow.document;
    const html = `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
    const baseUrl = doc.baseURI && doc.baseURI.startsWith('https:') ? doc.baseURI : location.href;
    await EscaleNative.print({ jobName: doc.title || document.title || 'Escale Mais', html, baseUrl });
  });
}

const PATCHED = Symbol.for('escale.print.patched');

function patchFramePrint(frameWindow: Window | null): void {
  if (!frameWindow) return;
  try {
    const w = frameWindow as Window & { [PATCHED]?: boolean };
    if (w[PATCHED]) return;
    w.print = () => void printFrameDocument(frameWindow);
    w[PATCHED] = true;
  } catch {
    // iframe de outra origem: não é nosso para imprimir.
  }
}

export function setupPrint(): void {
  window.print = () => void printPage();

  // Intercepta `iframe.contentWindow` para trocar o print() do iframe no
  // momento em que o ERP o acessa (funciona até com document.write).
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (descriptor?.get) {
    const original = descriptor.get;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      ...descriptor,
      get(this: HTMLIFrameElement) {
        const w = original.call(this) as Window | null;
        patchFramePrint(w);
        return w;
      },
    });
  }
}
