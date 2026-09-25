import { registerPlugin } from '@capacitor/core';

/**
 * Leitor de código de barras nativo (plugin oficial @capacitor/barcode-scanner:
 * ML Kit/ZXing no Android, Vision no iOS).
 *
 *   const r = await EscaleApp.scanBarcode();
 *   // { success: true, value: '7891234567890', data: { value, format: 'EAN_13' } }
 *
 *   await EscaleApp.scanBarcode({ formats: ['EAN_13', 'EAN_8'] });
 *
 * A permissão de câmera é pedida pelo próprio scanner, só nesta hora.
 *
 * O plugin é registrado direto (sem o wrapper do pacote) para não embutir na
 * bridge a implementação web (html5-qrcode), que o app nunca usa.
 */

/** Valores numéricos do enum `CapacitorBarcodeScannerTypeHint` do plugin. */
const FORMAT_HINT = {
  QR_CODE: 0,
  AZTEC: 1,
  CODABAR: 2,
  CODE_39: 3,
  CODE_93: 4,
  CODE_128: 5,
  DATA_MATRIX: 6,
  MAXICODE: 7,
  ITF: 8,
  EAN_13: 9,
  EAN_8: 10,
  PDF_417: 11,
  RSS_14: 12,
  RSS_EXPANDED: 13,
  UPC_A: 14,
  UPC_E: 15,
  UPC_EAN_EXTENSION: 16,
  ALL: 17,
} as const;

export type BarcodeFormat = Exclude<keyof typeof FORMAT_HINT, 'ALL'>;

/** Formatos usados no PDV (EAN-8, EAN-13, Code 128, QR Code). */
export const PDV_FORMATS: BarcodeFormat[] = ['EAN_13', 'EAN_8', 'CODE_128', 'QR_CODE'];

const FORMAT_NAME = Object.fromEntries(
  Object.entries(FORMAT_HINT).map(([name, value]) => [value, name]),
) as Record<number, BarcodeFormat | undefined>;

interface NativeScanner {
  scanBarcode(options: {
    hint: number;
    scanInstructions: string;
    scanButton: boolean;
    scanText: string;
    cameraDirection: 1 | 2;
    scanOrientation: 1 | 2 | 3;
    cancelButtonAccessibilityLabel?: string;
    torchButtonOnAccessibilityLabel?: string;
    torchButtonOffAccessibilityLabel?: string;
    android?: { scanningLibrary?: 'zxing' | 'mlkit' };
  }): Promise<{ ScanResult: string; format: number }>;
}

const NativeBarcodeScanner = registerPlugin<NativeScanner>('CapacitorBarcodeScanner');

export interface ScanInput {
  /** Um formato restringe a leitura; vários (ou nenhum) = todos. */
  formats?: BarcodeFormat[];
  instructions?: string;
  front?: boolean;
}

export interface ScanData {
  value: string;
  format: BarcodeFormat | 'UNKNOWN';
}

export async function scanBarcode(input: ScanInput = {}): Promise<ScanData> {
  // O plugin aceita um único "hint"; com mais de um formato lemos todos e filtramos depois.
  const formats = input.formats?.length ? input.formats : null;
  const hint = formats?.length === 1 ? FORMAT_HINT[formats[0]] : FORMAT_HINT.ALL;

  const result = await NativeBarcodeScanner.scanBarcode({
    hint,
    scanInstructions: input.instructions ?? 'Aponte a câmera para o código',
    scanButton: false,
    scanText: ' ',
    cameraDirection: input.front ? 2 : 1,
    scanOrientation: 3,
    cancelButtonAccessibilityLabel: 'Cancelar leitura',
    torchButtonOnAccessibilityLabel: 'Desligar lanterna',
    torchButtonOffAccessibilityLabel: 'Ligar lanterna',
    android: { scanningLibrary: 'mlkit' },
  });

  const value = result?.ScanResult ?? '';
  if (!value) throw new Error('cancelled');

  const format = FORMAT_NAME[result.format] ?? 'UNKNOWN';
  if (formats && format !== 'UNKNOWN' && !formats.includes(format)) {
    throw new Error(`Formato não aceito: ${format}`);
  }
  return { value, format };
}
