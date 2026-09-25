/**
 * Ponto de entrada de `www/escale-bridge.js`.
 *
 * Este script é injetado pela camada nativa (EscaleNativePlugin) no INÍCIO de
 * cada documento da origem do ERP, logo depois do bridge do Capacitor. Ele
 * não roda em nenhum outro domínio.
 *
 * `main` é carregado sob demanda porque importa `@capacitor/core`, que lê
 * `window.Capacitor` ao ser avaliado — isso precisa acontecer depois do
 * bridge nativo do Capacitor existir.
 */

type CapacitorGlobal = { isNativePlatform?: () => boolean };

const MAX_WAIT_MS = 3000;

function capacitorReady(): boolean {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

function boot(startedAt: number): void {
  if ((window as { __escaleBridgeBooted?: boolean }).__escaleBridgeBooted) return;

  if (!capacitorReady()) {
    if (Date.now() - startedAt < MAX_WAIT_MS) setTimeout(() => boot(startedAt), 10);
    return; // fora do app (ou bridge do Capacitor ausente): não faz nada
  }

  (window as { __escaleBridgeBooted?: boolean }).__escaleBridgeBooted = true;
  void import('./main').then((m) => m.start());
}

boot(Date.now());
