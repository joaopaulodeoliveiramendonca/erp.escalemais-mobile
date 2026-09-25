import { isAllowedHost } from '../config/urls';
import { createAppBridge } from '../native/appBridge';
import { setupBackButton } from '../native/backButton';
import { setupDeepLinks } from '../native/deepLinks';
import { setupFiles } from '../native/files';
import { setupGestures } from '../native/gestures';
import { setupKeyboard } from '../native/keyboard';
import { setupNavigation } from '../native/navigation';
import { setupNetwork } from '../native/network';
import { setupOrientation } from '../native/orientation';
import { setupPrint } from '../native/print';
import { setupSafeArea } from '../native/safeArea';
import { polyfillNavigatorShare } from '../native/share';
import { setupSplash } from '../native/splash';
import { setupStatusBar } from '../native/statusBar';
import { isAndroid } from '../config/platform';
import { log } from '../utils/logger';

/**
 * Inicializa a camada nativa na página atual do ERP. Roda a cada navegação
 * (cada página nova do Laravel recebe a bridge de novo, no document-start).
 */
export function start(): void {
  // Defesa extra: a injeção nativa já é restrita à origem do ERP.
  if (location.protocol !== 'https:' || !isAllowedHost(location.hostname)) return;

  const api = createAppBridge();
  Object.defineProperty(window, 'EscaleApp', { value: api, writable: false, configurable: false, enumerable: true });
  Object.defineProperty(window, 'isNativeApp', { value: true, writable: false, configurable: false, enumerable: true });

  const steps: Array<[string, () => void]> = [
    ['gestures', setupGestures],
    ['splash', setupSplash],
    ['network', setupNetwork],
    ['statusBar', setupStatusBar],
    ['navigation', setupNavigation],
    ['files', setupFiles],
    ['print', setupPrint],
    ['keyboard', setupKeyboard],
    ['orientation', setupOrientation],
    ['deepLinks', setupDeepLinks],
    // Só age se a WebView não tiver Web Share (Android): código do ERP com navigator.share funciona.
    ['share', polyfillNavigatorShare],
  ];
  if (isAndroid()) {
    steps.push(['backButton', setupBackButton]);
  } else {
    // Android já respeita o viewport-fit das páginas (SystemBars do Capacitor).
    steps.unshift(['safeArea', setupSafeArea]);
  }

  // Um módulo com problema não derruba os outros.
  for (const [name, setup] of steps) {
    try {
      setup();
    } catch (err) {
      log.warn(`setup ${name} failed`, err);
    }
  }

  window.dispatchEvent(new CustomEvent('escaleAppReady', { detail: { platform: api.platform, bridgeVersion: api.bridgeVersion } }));
}
