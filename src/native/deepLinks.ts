import { App } from '@capacitor/app';

import { deepLinkToInternalUrl } from '../config/urls';
import { log, safeUrl } from '../utils/logger';

/**
 * Deep links (Universal Links no iOS / App Links no Android):
 *
 *   https://erp.escalemais.com/proprietario/vendas/123  → abre essa tela no app
 *   escalemais://proprietario/vendas/123                → idem (esquema próprio)
 *
 * A parte nativa já está declarada (AndroidManifest intent-filter com
 * autoVerify e Associated Domains no iOS). Para os links https abrirem o app
 * é preciso publicar no servidor os arquivos de `well-known/` (ver README).
 *
 * Se o usuário não estiver logado, o próprio Laravel redireciona ao /login e,
 * após o login, para a URL pretendida (`redirect()->intended()`).
 */

const LAUNCH_HANDLED_KEY = 'escale:launch-url-handled';

function open(url: string): void {
  const target = deepLinkToInternalUrl(url);
  if (!target) return;
  if (target === location.href) return;
  log.debug('deep link', safeUrl(target));
  location.assign(target);
}

export function setupDeepLinks(): void {
  // App já aberto (ou em segundo plano) recebendo um link.
  void App.addListener('appUrlOpen', ({ url }) => open(url));

  // App aberto do zero por um link: a WebView iniciou em /login, então
  // navegamos uma única vez para o destino.
  if (!sessionStorage.getItem(LAUNCH_HANDLED_KEY)) {
    sessionStorage.setItem(LAUNCH_HANDLED_KEY, '1');
    void App.getLaunchUrl()
      .then((launch) => launch?.url && open(launch.url))
      .catch(() => undefined);
  }
}
