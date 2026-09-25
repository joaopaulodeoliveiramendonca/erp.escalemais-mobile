import { AppLauncher } from '@capacitor/app-launcher';
import { Toast } from '@capacitor/toast';

import { isAndroid } from '../config/platform';
import {
  POST_DOWNLOAD_PATHS,
  classifyUrl,
  looksLikeDownload,
  routePolicyFor,
  upgradeToHttps,
} from '../config/urls';
import { filenameFromContentDisposition } from '../utils/files';
import { log, safeUrl } from '../utils/logger';
import { handleDownload, presentFile, saveBlobToCache } from './files';

/**
 * Navegação dentro/fora do app — aplica a regra de `config/urls.ts` aos:
 *   - cliques em <a> (inclusive target="_blank" e `download`);
 *   - `window.open(...)`;
 *   - formulários POST que devolvem arquivo (Android).
 *
 * O que escapar daqui (redirect do servidor, `location.href = …`) é barrado
 * pela camada nativa (`shouldOverrideLoad` no EscaleNativePlugin), que usa a
 * mesma lista de domínios.
 */

/** Abre fora do app: no aplicativo correspondente, se instalado, ou no navegador. */
export async function openExternal(url: string): Promise<void> {
  log.debug('external', safeUrl(url));
  const { completed } = await AppLauncher.openUrl({ url });
  if (!completed) {
    await Toast.show({ text: 'Nenhum aplicativo disponível para abrir este link.' });
  }
}

/**
 * Decide o destino de uma URL. Retorna `true` se tratou (o chamador deve
 * cancelar a ação padrão) ou `false` para deixar a WebView seguir.
 */
export function routeUrl(url: string, opts: { newWindow?: boolean; download?: string | null }): boolean {
  const kind = classifyUrl(url, location.href);
  const absolute = (() => {
    try {
      return new URL(url, location.href).toString();
    } catch {
      return url;
    }
  })();

  switch (kind) {
    case 'system':
    case 'external':
      void openExternal(absolute);
      return true;

    case 'insecure': {
      const upgraded = upgradeToHttps(absolute);
      if (upgraded) location.assign(upgraded);
      else void openExternal(absolute); // site externo em http: fora do app
      return true;
    }

    case 'local':
      // blob:/data: aberto em nova janela ou com `download` → arquivo.
      if (/^(blob|data):/i.test(absolute) && (opts.download != null || opts.newWindow)) {
        void handleDownload(absolute, { filename: opts.download || undefined });
        return true;
      }
      return false;

    case 'internal': {
      const { policy, message } = routePolicyFor(absolute);
      if (policy === 'external') {
        void openExternal(absolute);
        return true;
      }
      if (policy === 'blocked') {
        void Toast.show({ text: message ?? 'Esta área não está disponível no aplicativo.', duration: 'long' });
        return true;
      }
      if (opts.download != null || looksLikeDownload(absolute)) {
        void handleDownload(absolute, { filename: opts.download || undefined });
        return true;
      }
      if (opts.newWindow) {
        // Mesmo comportamento do app desktop (Tauri): mesma WebView, mesma sessão.
        location.assign(absolute);
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

function onClick(event: MouseEvent): void {
  // Corre por último (bubble no window): se o ERP já tratou o clique, respeita.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute('data-escale-ignore')) return;

  const href = anchor.getAttribute('href') ?? '';
  const target = (anchor.getAttribute('target') ?? '').toLowerCase();
  const handled = routeUrl(href, {
    newWindow: target === '_blank' || target === '_new',
    download: anchor.hasAttribute('download') ? anchor.getAttribute('download') : null,
  });
  if (handled) event.preventDefault();
}

/**
 * Objeto devolvido por `window.open`: o ERP costuma abrir uma janela vazia e
 * depois definir `janela.location = url` (ex.: depósitos, busca de NF-e).
 */
function createWindowStub(): Window {
  const go = (url: string | URL): void => void routeUrl(String(url), { newWindow: true });
  const locationStub = {
    assign: go,
    replace: go,
    reload: () => undefined,
    toString: () => 'about:blank',
    set href(url: string) {
      go(url);
    },
    get href() {
      return 'about:blank';
    },
  };
  const stub = {
    closed: false,
    opener: null,
    close: () => undefined,
    focus: () => undefined,
    blur: () => undefined,
    postMessage: () => undefined,
  };
  // `janela.location = url` e `janela.location.href = url`.
  Object.defineProperty(stub, 'location', { get: () => locationStub, set: go, enumerable: true });
  return stub as unknown as Window;
}

function patchWindowOpen(): void {
  window.open = (url?: string | URL, target?: string): Window | null => {
    const href = url ? String(url) : '';
    if (href && href !== 'about:blank') {
      const sameWindow = target === '_self' || target === '_top' || target === '_parent';
      const handled = routeUrl(href, { newWindow: !sameWindow });
      if (!handled) location.assign(new URL(href, location.href).toString());
    }
    return createWindowStub();
  };
}

/** Android: envia via fetch os formulários POST que devolvem arquivo. */
async function submitDownloadForm(form: HTMLFormElement, submitter: HTMLElement | null): Promise<void> {
  const body = new FormData(form, submitter as HTMLButtonElement | null);
  const response = await fetch(form.action, { method: 'POST', body, credentials: 'include' });
  const disposition = response.headers.get('content-disposition');
  const type = response.headers.get('content-type')?.split(';')[0] ?? '';

  if (response.ok && (disposition?.includes('attachment') || (type && type !== 'text/html'))) {
    const blob = await response.blob();
    const name = filenameFromContentDisposition(disposition) ?? 'arquivo';
    await presentFile(await saveBlobToCache(blob, name, type));
    return;
  }

  // Não era arquivo (ex.: erro de validação): mostra a página devolvida.
  const html = await response.text();
  document.open();
  document.write(html);
  document.close();
}

function onSubmit(event: SubmitEvent): void {
  if (event.defaultPrevented) return;
  const form = event.target as HTMLFormElement;
  if ((form.method || '').toLowerCase() !== 'post') return;

  const action = new URL(form.action, location.href);
  if (classifyUrl(action.toString()) !== 'internal') return;
  const isDownload = form.hasAttribute('data-escale-download') || POST_DOWNLOAD_PATHS.some((re) => re.test(action.pathname));
  if (!isDownload) return;

  event.preventDefault();
  void Toast.show({ text: 'Gerando arquivo…', duration: 'short' });
  submitDownloadForm(form, event.submitter).catch((err) => {
    log.warn('form download failed', err);
    void Toast.show({ text: 'Não foi possível gerar o arquivo.', duration: 'long' });
  });
}

export function setupNavigation(): void {
  window.addEventListener('click', onClick);
  patchWindowOpen();
  if (isAndroid()) window.addEventListener('submit', onSubmit);
}
