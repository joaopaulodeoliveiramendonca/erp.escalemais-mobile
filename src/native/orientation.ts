import { ScreenOrientation, type OrientationLockType } from '@capacitor/screen-orientation';

import { onDomReady } from '../utils/dom';

/**
 * Orientação da tela (item 19).
 *
 * - Celular: retrato por padrão.
 * - Tablet: livre.
 * - Uma tela do ERP pode pedir outra orientação de forma declarativa, sem JS:
 *     <meta name="escale-orientation" content="any">        (PDV, relatórios largos)
 *     <meta name="escale-orientation" content="landscape">
 *   ou em tempo de execução: `await EscaleApp.setOrientation('any')`.
 *
 * Cada página nova volta ao padrão, então liberar paisagem numa tela não
 * "vaza" para as outras. Girar o aparelho nunca quebra o layout: o que muda é
 * só se o sistema acompanha a rotação.
 */

export type Orientation = 'portrait' | 'landscape' | 'any';

const isTablet = (): boolean => Math.min(window.screen.width, window.screen.height) >= 600;

function requestedByPage(): Orientation | null {
  const value = document.querySelector<HTMLMetaElement>('meta[name="escale-orientation"]')?.content?.trim().toLowerCase();
  return value === 'portrait' || value === 'landscape' || value === 'any' ? value : null;
}

export async function setOrientation(orientation: Orientation): Promise<void> {
  if (orientation === 'any') {
    await ScreenOrientation.unlock();
  } else {
    await ScreenOrientation.lock({ orientation: orientation as OrientationLockType });
  }
}

export function setupOrientation(): void {
  onDomReady(() => {
    const target = requestedByPage() ?? (isTablet() ? 'any' : 'portrait');
    void setOrientation(target).catch(() => undefined);
  });
}
