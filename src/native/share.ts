import { Share } from '@capacitor/share';

import { base64ToBlob } from '../utils/files';
import { downloadToCache, saveBlobToCache } from './files';

/**
 * Compartilhamento nativo (WhatsApp, e-mail, Telegram, Drive…).
 *
 *   await EscaleApp.share({ title: 'Orçamento', text: 'Segue o orçamento', url: 'https://...' })
 *
 * Arquivos também podem ser compartilhados:
 *   files: [File | Blob | { name, base64, mimeType } | 'https://erp.escalemais.com/...pdf']
 *
 * No Android, `navigator.share` (inexistente na WebView) passa a usar este
 * mesmo caminho — código do ERP que já usa Web Share funciona sem mudança.
 */

export type ShareFileInput = File | Blob | { name: string; base64: string; mimeType?: string } | string;

export interface ShareInput {
  title?: string;
  text?: string;
  url?: string;
  files?: ShareFileInput[];
  dialogTitle?: string;
}

async function toLocalUri(input: ShareFileInput, index: number): Promise<string> {
  if (typeof input === 'string') {
    // URL de arquivo do ERP: baixa com a sessão primeiro.
    return (await downloadToCache(input)).uri;
  }
  if (input instanceof Blob) {
    const name = input instanceof File ? input.name : `arquivo-${index + 1}`;
    return (await saveBlobToCache(input, name, input.type)).uri;
  }
  const type = input.mimeType ?? 'application/octet-stream';
  return (await saveBlobToCache(base64ToBlob(input.base64, type), input.name, type)).uri;
}

export async function share(input: ShareInput): Promise<{ activityType?: string }> {
  if (!input || (!input.title && !input.text && !input.url && !input.files?.length)) {
    throw new Error('Informe ao menos title, text, url ou files.');
  }
  const files = input.files?.length ? await Promise.all(input.files.map(toLocalUri)) : undefined;
  return Share.share({
    title: input.title,
    text: input.text,
    url: input.url,
    files,
    dialogTitle: input.dialogTitle ?? input.title ?? 'Compartilhar',
  });
}

export async function canShare(): Promise<boolean> {
  return (await Share.canShare()).value;
}

/** Faz o Web Share API do navegador usar o compartilhamento nativo quando faltar. */
export function polyfillNavigatorShare(): void {
  if (typeof navigator.share === 'function') return;
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data: ShareData = {}) => {
      await share({ title: data.title, text: data.text, url: data.url, files: data.files ? Array.from(data.files) : undefined });
    },
  });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
}
