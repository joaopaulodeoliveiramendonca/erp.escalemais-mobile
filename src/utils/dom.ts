/** Executa quando o DOM estiver pronto (ou imediatamente, se já estiver). */
export function onDomReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/**
 * Executa assim que existir `document.documentElement`.
 *
 * A bridge roda no INÍCIO do documento (document-start), quando no WebKit o
 * <html> ainda pode não ter sido criado.
 */
export function onRootReady(fn: (root: HTMLElement) => void): void {
  if (document.documentElement) {
    fn(document.documentElement);
    return;
  }
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    fn(document.documentElement);
  });
  observer.observe(document, { childList: true });
}

/** Injeta CSS o mais cedo possível (antes da primeira pintura). */
export function injectStyle(id: string, css: string): void {
  onRootReady((root) => {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    (document.head ?? root).appendChild(style);
  });
}

/** Dispara um evento no `window` para o JavaScript do ERP reagir. */
export function emit<T>(name: string, detail: T): void {
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

/** Dispara um evento cancelável; retorna `true` se algum listener chamou `preventDefault()`. */
export function emitCancelable<T>(name: string, detail: T): boolean {
  const event = new CustomEvent<T>(name, { detail, cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
