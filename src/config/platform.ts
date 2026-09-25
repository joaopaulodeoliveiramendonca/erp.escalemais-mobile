import { Capacitor } from '@capacitor/core';

export type Platform = 'android' | 'ios' | 'web';

export function getPlatform(): Platform {
  return Capacitor.getPlatform() as Platform;
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export const isAndroid = (): boolean => getPlatform() === 'android';
export const isIOS = (): boolean => getPlatform() === 'ios';

/** Plugin nativo disponível nesta plataforma (evita chamar algo que não foi instalado). */
export function hasPlugin(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}
