import type { EscaleAppApi } from '../native/appBridge';

declare global {
  interface Window {
    /** API da camada nativa. Só existe dentro do aplicativo. */
    EscaleApp?: EscaleAppApi;
    /** `true` quando a página roda dentro do aplicativo. */
    isNativeApp?: boolean;
    /** Estado atual da conexão (atualizado em tempo real). */
    isOnline?: boolean;
  }
}

export {};
