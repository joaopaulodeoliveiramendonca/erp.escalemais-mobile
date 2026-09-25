import { App } from '@capacitor/app';
import { Toast } from '@capacitor/toast';

import { isRootPath } from '../config/urls';
import { emitCancelable } from '../utils/dom';

/**
 * Botão/gesto voltar do Android.
 *
 *   1. O ERP pode tratar primeiro: escute `escale:backbutton` e chame
 *      `event.preventDefault()` (ex.: para fechar um modal aberto).
 *   2. Com histórico e fora de uma tela raiz → volta uma página.
 *   3. Na tela raiz (login/dashboard) ou sem histórico → avisa; um segundo
 *      toque em até 2 s fecha o app.
 *
 * O "armado" fica no sessionStorage porque cada navegação recria esta bridge.
 */

const EXIT_WINDOW_MS = 2000;
const ARMED_KEY = 'escale:back-armed-at';

function armedRecently(): boolean {
  const at = Number(sessionStorage.getItem(ARMED_KEY) ?? 0);
  return Date.now() - at < EXIT_WINDOW_MS;
}

export function setupBackButton(): void {
  // Registrar o listener desativa o comportamento padrão do Capacitor.
  void App.addListener('backButton', ({ canGoBack }) => {
    if (emitCancelable('escale:backbutton', { canGoBack })) return;

    if (canGoBack && !isRootPath(location.href)) {
      sessionStorage.removeItem(ARMED_KEY);
      history.back();
      return;
    }

    if (armedRecently()) {
      sessionStorage.removeItem(ARMED_KEY);
      void App.exitApp();
      return;
    }

    sessionStorage.setItem(ARMED_KEY, String(Date.now()));
    void Toast.show({ text: 'Pressione voltar novamente para sair', duration: 'short', position: 'bottom' });
  });
}
