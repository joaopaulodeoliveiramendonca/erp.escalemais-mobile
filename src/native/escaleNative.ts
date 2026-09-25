import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Plugin nativo do próprio projeto. Implementações:
 *   Android → android/app/src/main/java/com/escalemais/erp/EscaleNativePlugin.java
 *   iOS     → ios/App/App/EscaleNativePlugin.swift
 *
 * Cuida do que só o nativo consegue fazer: injetar esta bridge, decidir a
 * navegação, mostrar a página de erro de rede, capturar downloads que a
 * WebView não sabe exibir e imprimir.
 */

/** Android: a WebView pediu um download (Content-Disposition, PDF, blob:, …). O JS baixa com a sessão. */
export interface DownloadRequestedEvent {
  url: string;
  filename?: string;
  mimeType?: string;
  contentDisposition?: string;
}

/** iOS: o WKDownload já salvou o arquivo (funciona inclusive para POST). */
export interface DownloadCompletedEvent {
  /** file:// no diretório de cache do app. */
  path: string;
  filename: string;
  mimeType: string;
}

export interface DownloadFailedEvent {
  error: string;
}

export interface EscaleNativePlugin {
  /**
   * Abre o diálogo de impressão nativo (window.print() não funciona em WebView).
   * Sem `html`: imprime a WebView atual. Com `html`: imprime esse documento
   * (usado para iframes), resolvendo recursos relativos a `baseUrl`.
   */
  print(options?: { jobName?: string; html?: string; baseUrl?: string }): Promise<void>;

  /** Cor de fundo nativa atrás da WebView (status bar/áreas seguras no Android sem edge-to-edge, bounce no iOS). */
  setBackgroundColor(options: { color: string }): Promise<void>;

  /**
   * iOS: `cover: true` → a página desenha sob o notch (usa env(safe-area-inset-*));
   * `cover: false` → o sistema reserva as áreas seguras. Android faz isso sozinho (SystemBars).
   */
  setSafeAreaMode(options: { cover: boolean }): Promise<void>;

  addListener(event: 'downloadRequested', fn: (e: DownloadRequestedEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'downloadCompleted', fn: (e: DownloadCompletedEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'downloadFailed', fn: (e: DownloadFailedEvent) => void): Promise<PluginListenerHandle>;
}

export const EscaleNative = registerPlugin<EscaleNativePlugin>('EscaleNative');
