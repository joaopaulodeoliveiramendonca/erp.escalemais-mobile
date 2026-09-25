import { Camera, CameraDirection, EncodingType } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';

import { base64ToBlob } from '../utils/files';

/**
 * Câmera nativa (foto de produto, anexo de OS, documentos, comprovantes).
 *
 *   const r = await EscaleApp.takePhoto({ source: 'camera' });
 *   if (r.success) upload(r.data.file);          // File pronto para FormData
 *
 *   // ou preenchendo direto um <input type="file"> existente:
 *   await EscaleApp.takePhoto({ input: '#foto-produto' });
 *
 * A permissão é pedida só nesta hora (não na abertura do app).
 *
 * `<input type="file" accept="image/*">` do ERP continua funcionando sem
 * mudanças: o Capacitor (Android) e o WKWebView (iOS) abrem câmera/galeria.
 */

export interface TakePhotoInput {
  /** 'camera' (padrão), 'gallery' ou 'prompt' (pergunta ao usuário). */
  source?: 'camera' | 'gallery' | 'prompt';
  /** 1–100. Padrão 80 — suficiente para produto/documento e leve para upload. */
  quality?: number;
  /** Lado maior em px. Padrão 1920. */
  maxSize?: number;
  /** Câmera frontal. */
  front?: boolean;
  /** Seletor de um <input type="file"> que receberá a foto (dispara `change`). */
  input?: string;
  /** Nome do arquivo. Padrão foto-<data>.jpg */
  filename?: string;
}

export interface PhotoData {
  file: File;
  /** data:image/jpeg;base64,... — útil para pré-visualização. */
  dataUrl: string;
  mimeType: string;
  size: number;
}

async function pickSource(source: TakePhotoInput['source']): Promise<'camera' | 'gallery'> {
  if (source === 'camera' || source === 'gallery') return source;
  const { ActionSheet, ActionSheetButtonStyle } = await import('@capacitor/action-sheet');
  const { index } = await ActionSheet.showActions({
    title: 'Adicionar foto',
    options: [{ title: 'Tirar foto' }, { title: 'Escolher da galeria' }, { title: 'Cancelar', style: ActionSheetButtonStyle.Cancel }],
  });
  if (index === 0) return 'camera';
  if (index === 1) return 'gallery';
  throw new Error('cancelled');
}

function fillInput(selector: string, file: File): void {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input || input.type !== 'file') throw new Error(`Input de arquivo não encontrado: ${selector}`);
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function takePhoto(options: TakePhotoInput = {}): Promise<PhotoData> {
  const source = await pickSource(options.source ?? 'camera');
  const common = {
    quality: options.quality ?? 80,
    targetWidth: options.maxSize ?? 1920,
    targetHeight: options.maxSize ?? 1920,
    correctOrientation: true,
  };

  const result =
    source === 'camera'
      ? await Camera.takePhoto({
          ...common,
          encodingType: EncodingType.JPEG,
          saveToGallery: false,
          cameraDirection: options.front ? CameraDirection.Front : CameraDirection.Rear,
        })
      : (await Camera.chooseFromGallery({ ...common, allowMultipleSelection: false })).results[0];

  if (!result?.uri) throw new Error('cancelled');

  // Lê pelo Filesystem: funciona em qualquer origem (a WebView está em https://erp…).
  const { data } = await Filesystem.readFile({ path: result.uri });
  const base64 = typeof data === 'string' ? data : '';
  const mimeType = /\.png$/i.test(result.uri) ? 'image/png' : 'image/jpeg';
  const blob = base64 ? base64ToBlob(base64, mimeType) : (data as Blob);
  const name = options.filename ?? `foto-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
  const file = new File([blob], name, { type: mimeType, lastModified: Date.now() });

  if (options.input) fillInput(options.input, file);

  return {
    file,
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    size: file.size,
  };
}
