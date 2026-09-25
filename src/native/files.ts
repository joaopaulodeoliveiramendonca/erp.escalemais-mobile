import { ActionSheet, ActionSheetButtonStyle } from '@capacitor/action-sheet';
import { FileViewer } from '@capacitor/file-viewer';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';

import { APP_NAME } from '../config/app';
import { isAndroid } from '../config/platform';
import { classifyUrl } from '../config/urls';
import {
  blobToBase64,
  filenameFromContentDisposition,
  filenameFromUrl,
  mimeForFilename,
  sanitizeFilename,
} from '../utils/files';
import { log, safeUrl } from '../utils/logger';
import { EscaleNative } from './escaleNative';

/**
 * Downloads e arquivos (PDF, XML, CSV, DANFE, orçamentos, comprovantes…).
 *
 * Fluxo: o arquivo é baixado COM a sessão do Laravel (fetch com cookies da
 * própria página), gravado no cache do app e o usuário escolhe:
 *
 *   Visualizar   → visualizador nativo (QuickLook no iOS, app de PDF no Android)
 *   Compartilhar → folha de compartilhamento (WhatsApp, e-mail, Drive…)
 *   Salvar       → Documentos/Escale Mais (Android) ou Arquivos › Escale Mais (iOS)
 *
 * Entradas:
 *   - cliques em links de arquivo / `download` / blob: (navigation.ts);
 *   - `window.open(blob|pdf)` (navigation.ts);
 *   - downloads que a WebView detecta sozinha (Content-Disposition, PDF),
 *     avisados pelo plugin nativo (eventos abaixo);
 *   - chamada direta: `EscaleApp.download(url)`.
 */

export interface LocalFile {
  /** file:// no dispositivo. */
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export type FileAction = 'view' | 'share' | 'save' | 'ask';

const CACHE_FOLDER = 'downloads';
const SAVE_FOLDER = APP_NAME;

function localPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

/** Grava um Blob no cache do app. */
export async function saveBlobToCache(blob: Blob, name: string, mimeType?: string): Promise<LocalFile> {
  const type = mimeType || blob.type || mimeForFilename(name);
  const filename = sanitizeFilename(name, type);
  const { uri } = await Filesystem.writeFile({
    path: `${CACHE_FOLDER}/${filename}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  return { uri, name: filename, mimeType: type, size: blob.size };
}

/** Baixa uma URL do ERP (ou blob:/data:) com a sessão atual e grava no cache. */
export async function downloadToCache(url: string, hints: { filename?: string; mimeType?: string } = {}): Promise<LocalFile> {
  const kind = classifyUrl(url, location.href);
  if (kind !== 'internal' && kind !== 'local') {
    throw new Error('Somente arquivos do ERP podem ser baixados pelo app.');
  }

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Falha no download (HTTP ${response.status}).`);

  const blob = await response.blob();
  const mimeType = hints.mimeType || response.headers.get('content-type')?.split(';')[0] || blob.type;
  const name =
    hints.filename ||
    filenameFromContentDisposition(response.headers.get('content-disposition')) ||
    (kind === 'internal' ? filenameFromUrl(url) : null) ||
    'arquivo';

  return saveBlobToCache(blob, name, mimeType);
}

export async function viewFile(file: LocalFile): Promise<void> {
  const path = localPath(file.uri);
  if (file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/')) {
    await FileViewer.previewMediaContentFromLocalPath({ path });
  } else {
    await FileViewer.openDocumentFromLocalPath({ path });
  }
}

export async function shareFile(file: LocalFile, text?: string): Promise<void> {
  await Share.share({ title: file.name, text, files: [file.uri], dialogTitle: 'Compartilhar arquivo' });
}

async function ensureStoragePermission(): Promise<void> {
  // Só Android ≤ 10 exige permissão para gravar em Documentos.
  if (!isAndroid()) return;
  const status = await Filesystem.checkPermissions();
  if (status.publicStorage === 'granted') return;
  const requested = await Filesystem.requestPermissions();
  if (requested.publicStorage !== 'granted') throw new Error('Permissão de armazenamento negada.');
}

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Documents });
    return true;
  } catch {
    return false;
  }
}

/** Copia para uma pasta visível ao usuário. Retorna o nome final (sem sobrescrever). */
export async function saveFile(file: LocalFile): Promise<string> {
  await ensureStoragePermission();

  const dot = file.name.lastIndexOf('.');
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const ext = dot > 0 ? file.name.slice(dot) : '';
  await Filesystem.mkdir({ path: SAVE_FOLDER, directory: Directory.Documents, recursive: true }).catch(() => undefined);
  let target = `${SAVE_FOLDER}/${file.name}`;
  for (let i = 1; (await exists(target)) && i < 100; i++) target = `${SAVE_FOLDER}/${base} (${i})${ext}`;

  await Filesystem.copy({
    from: `${CACHE_FOLDER}/${file.name}`,
    directory: Directory.Cache,
    to: target,
    toDirectory: Directory.Documents,
  });
  return target;
}

async function saveWithFeedback(file: LocalFile): Promise<void> {
  try {
    const target = await saveFile(file);
    const where = isAndroid() ? `Documentos/${target}` : `Arquivos › No meu iPhone › ${target}`;
    await Toast.show({ text: `Salvo em ${where}`, duration: 'long' });
  } catch (err) {
    log.warn('save failed, falling back to share sheet', err);
    // Plano B: a folha de compartilhamento tem "Salvar em Arquivos"/"Salvar no Drive".
    await shareFile(file);
  }
}

/** Mostra Visualizar / Compartilhar / Salvar para um arquivo local. */
export async function presentFile(file: LocalFile, action: FileAction = 'ask'): Promise<FileAction | 'cancel'> {
  let chosen: FileAction | 'cancel' = action;

  if (action === 'ask') {
    const { index } = await ActionSheet.showActions({
      title: file.name,
      options: [
        { title: 'Visualizar' },
        { title: 'Compartilhar' },
        { title: 'Salvar' },
        { title: 'Cancelar', style: ActionSheetButtonStyle.Cancel },
      ],
    });
    chosen = (['view', 'share', 'save'] as const)[index] ?? 'cancel';
  }

  switch (chosen) {
    case 'view':
      await viewFile(file);
      break;
    case 'share':
      await shareFile(file);
      break;
    case 'save':
      await saveWithFeedback(file);
      break;
  }
  return chosen;
}

let busy = false;

/** Fluxo completo: baixa e oferece as ações. Usado pelos interceptadores. */
export async function handleDownload(
  url: string,
  hints: { filename?: string; mimeType?: string; action?: FileAction } = {},
): Promise<LocalFile | null> {
  if (busy) return null; // evita duplo toque abrindo dois menus
  busy = true;
  try {
    log.debug('download', safeUrl(url));
    void Toast.show({ text: 'Baixando arquivo…', duration: 'short' });
    const file = await downloadToCache(url, hints);
    await presentFile(file, hints.action ?? 'ask');
    return file;
  } catch (err) {
    log.warn('download failed', err);
    await Toast.show({ text: 'Não foi possível baixar o arquivo.', duration: 'long' });
    return null;
  } finally {
    busy = false;
  }
}

/** Limpa arquivos temporários de aberturas anteriores do app. */
async function cleanCacheOncePerLaunch(): Promise<void> {
  const key = 'escale:downloads-cleaned';
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  await Filesystem.rmdir({ path: CACHE_FOLDER, directory: Directory.Cache, recursive: true }).catch(() => undefined);
}

export function setupFiles(): void {
  // Android: a WebView detectou um download (GET). Baixamos pelo JS para usar a sessão.
  void EscaleNative.addListener('downloadRequested', (e) => {
    void handleDownload(e.url, { filename: e.filename, mimeType: e.mimeType });
  });

  // iOS: o WKDownload já salvou o arquivo (inclui downloads via POST).
  void EscaleNative.addListener('downloadCompleted', (e) => {
    void presentFile({ uri: e.path, name: e.filename, mimeType: e.mimeType, size: 0 }).catch((err) =>
      log.warn('present failed', err),
    );
  });

  void EscaleNative.addListener('downloadFailed', () => {
    void Toast.show({ text: 'Não foi possível baixar o arquivo.', duration: 'long' });
  });

  window.setTimeout(() => void cleanCacheOncePerLaunch(), 3000);
}
