import { Capacitor } from '@capacitor/core';

/**
 * Logs só aparecem em builds de debug (o native-bridge do Capacitor expõe
 * `Capacitor.DEBUG`). Nunca registre URLs com query string, cookies, tokens
 * ou conteúdo de formulários — use `safeUrl()`.
 */
const enabled = (): boolean => (Capacitor as unknown as { DEBUG?: boolean }).DEBUG === true;

export const log = {
  debug: (...args: unknown[]): void => {
    if (enabled()) console.debug('[EscaleApp]', ...args);
  },
  warn: (...args: unknown[]): void => {
    if (enabled()) console.warn('[EscaleApp]', ...args);
  },
};

/** Remove query string e fragmento (podem conter tokens, CPF, etc.). */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url, location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[url inválida]';
  }
}
