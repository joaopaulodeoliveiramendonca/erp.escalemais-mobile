import { SplashScreen } from '@capacitor/splash-screen';

import { onDomReady } from '../utils/dom';

/**
 * A splash nativa só aparece na abertura do app e só sai quando o ERP já
 * pintou a primeira tela — nunca aparece tela branca.
 *
 * Nas navegações seguintes (troca de página no ERP) esta função roda de novo,
 * mas `hide()` com a splash já fechada não faz nada: o ERP controla os
 * próprios loaders (item 23).
 */

/** Tempo máximo, depois do início do documento, para esconder a splash mesmo sem o ERP pronto. */
const FAILSAFE_MS = 8000;

let hidden = false;

export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
}

export function setupSplash(): void {
  // Dois frames após o DOM pronto = o navegador já pintou o conteúdo.
  onDomReady(() => requestAnimationFrame(() => requestAnimationFrame(hideSplash)));
  window.setTimeout(hideSplash, FAILSAFE_MS);
}
