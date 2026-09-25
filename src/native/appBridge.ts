import { App } from '@capacitor/app';

import { APP_FULL_NAME } from '../config/app';
import { getPlatform, isNative, type Platform } from '../config/platform';
import { attempt, fail, type BridgeResult } from '../utils/result';
import { takePhoto, type PhotoData, type TakePhotoInput } from './camera';
import { handleDownload, presentFile, saveBlobToCache, type FileAction } from './files';
import { fetchNetworkState, type NetworkState } from './network';
import { openExternal } from './navigation';
import { setOrientation, type Orientation } from './orientation';
import { printPage } from './print';
import { registerForPush, type PushRegistration } from './push';
import { scanBarcode, type ScanData, type ScanInput } from './scanner';
import { share, type ShareInput } from './share';
import { hideSplash } from './splash';
import { setStatusBarOverride } from './statusBar';

/**
 * API pública `window.EscaleApp` — o ÚNICO ponto de contato entre o ERP e a
 * camada nativa. Todas as funções:
 *   - são assíncronas;
 *   - nunca rejeitam;
 *   - devolvem { success: true, data } ou { success: false, error, code }.
 *
 * Detecção no ERP:
 *   if (window.EscaleApp?.native) { ... }
 *   window.EscaleApp.platform  // 'android' | 'ios'
 *
 * Novas funções entram aqui, delegando a um módulo em src/native/.
 */

export const BRIDGE_VERSION = 1;

export interface EscaleAppInfo {
  name: string;
  version: string;
  build: string;
  platform: Platform;
  bridgeVersion: number;
}

export interface EscaleAppApi {
  readonly native: true;
  readonly platform: Platform;
  readonly bridgeVersion: number;

  getPlatform(): Promise<BridgeResult<{ platform: Platform; native: boolean }>>;
  getAppInfo(): Promise<BridgeResult<EscaleAppInfo>>;
  getNetworkStatus(): Promise<BridgeResult<NetworkState>>;

  share(input: ShareInput): Promise<BridgeResult<{ activityType?: string }>>;

  takePhoto(input?: TakePhotoInput): Promise<BridgeResult<PhotoData>>;
  /** Alias de takePhoto (nome usado no planejamento do ERP). */
  camera(input?: TakePhotoInput): Promise<BridgeResult<PhotoData>>;

  /** Retorno inclui `value` no topo para uso direto no PDV. */
  scanBarcode(input?: ScanInput): Promise<(BridgeResult<ScanData> & { value?: string })>;

  /** Baixa (com a sessão) e oferece Visualizar/Compartilhar/Salvar. */
  download(url: string, options?: { filename?: string; action?: FileAction }): Promise<BridgeResult<{ name: string; mimeType: string; size: number }>>;
  /** Mesmo fluxo para um arquivo gerado no navegador (Blob/File). */
  openFile(file: Blob, options?: { filename?: string; action?: FileAction }): Promise<BridgeResult<{ name: string }>>;

  print(): Promise<BridgeResult<Record<string, never>>>;
  openExternal(url: string): Promise<BridgeResult<Record<string, never>>>;

  /** Força a cor da status bar; `null` volta a seguir o theme-color do ERP. */
  setStatusBar(options: { color: string; style?: 'light' | 'dark' } | null): Promise<BridgeResult<Record<string, never>>>;

  /** 'portrait' | 'landscape' | 'any'. Vale até a próxima página (ver orientation.ts). */
  setOrientation(orientation: Orientation): Promise<BridgeResult<Record<string, never>>>;

  /** Preparado: responde `not_configured` até o push ser ativado (README). */
  registerPush(): Promise<BridgeResult<PushRegistration>>;

  /** Esconde a splash (o app já faz sozinho; útil para telas pesadas). */
  hideSplash(): Promise<BridgeResult<Record<string, never>>>;
}

const empty = (): Record<string, never> => ({});

export function createAppBridge(): EscaleAppApi {
  const platform = getPlatform();

  const api: EscaleAppApi = {
    native: true,
    platform,
    bridgeVersion: BRIDGE_VERSION,

    getPlatform: () => attempt(async () => ({ platform, native: isNative() })),

    getAppInfo: () =>
      attempt(async () => {
        const info = await App.getInfo();
        return { name: info.name || APP_FULL_NAME, version: info.version, build: info.build, platform, bridgeVersion: BRIDGE_VERSION };
      }),

    getNetworkStatus: () => attempt(fetchNetworkState),

    share: (input) => attempt(() => share(input)),

    takePhoto: (input) => attempt(() => takePhoto(input)),
    camera: (input) => attempt(() => takePhoto(input)),

    scanBarcode: async (input) => {
      const result = await attempt(() => scanBarcode(input));
      return result.success ? { ...result, value: result.data.value } : result;
    },

    download: async (url, options = {}) => {
      if (typeof url !== 'string' || !url) return fail('Informe a URL do arquivo.', 'invalid_argument');
      const file = await handleDownload(url, options);
      return file ? { success: true, data: { name: file.name, mimeType: file.mimeType, size: file.size } } : fail('Não foi possível baixar o arquivo.', 'network_error');
    },

    openFile: (blob, options = {}) =>
      attempt(async () => {
        if (!(blob instanceof Blob)) throw new Error('Informe um Blob ou File.');
        const name = options.filename ?? (blob instanceof File ? blob.name : 'arquivo');
        const file = await saveBlobToCache(blob, name, blob.type);
        await presentFile(file, options.action ?? 'ask');
        return { name: file.name };
      }),

    print: () => attempt(async () => (await printPage(), empty())),

    openExternal: (url) => attempt(async () => (await openExternal(url), empty())),

    setStatusBar: (options) => attempt(async () => (await setStatusBarOverride(options), empty())),

    setOrientation: (orientation) =>
      ['portrait', 'landscape', 'any'].includes(orientation)
        ? attempt(async () => (await setOrientation(orientation), empty()))
        : Promise.resolve(fail("Use 'portrait', 'landscape' ou 'any'.", 'invalid_argument')),

    registerPush: () => attempt(registerForPush),

    hideSplash: () => attempt(async () => (hideSplash(), empty())),
  };

  return Object.freeze(api);
}
