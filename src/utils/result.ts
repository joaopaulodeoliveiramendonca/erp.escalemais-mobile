/**
 * Formato padrão de retorno de TODA chamada da bridge `window.EscaleApp`.
 *
 *   { success: true,  data: {...} }
 *   { success: false, error: 'mensagem legível', code: 'codigo_estavel' }
 *
 * As funções da bridge nunca rejeitam a Promise: o ERP só precisa checar `success`.
 */
export type BridgeSuccess<T> = { success: true; data: T };
export type BridgeFailure = { success: false; error: string; code: ErrorCode };
export type BridgeResult<T = Record<string, unknown>> = BridgeSuccess<T> | BridgeFailure;

export type ErrorCode =
  | 'cancelled'
  | 'permission_denied'
  | 'not_available'
  | 'not_configured'
  | 'invalid_argument'
  | 'network_error'
  | 'unknown';

export const ok = <T>(data: T): BridgeSuccess<T> => ({ success: true, data });

export const fail = (error: string, code: ErrorCode = 'unknown'): BridgeFailure => ({ success: false, error, code });

const KNOWN_CODES: readonly ErrorCode[] = [
  'cancelled',
  'permission_denied',
  'not_available',
  'not_configured',
  'invalid_argument',
  'network_error',
];

/** Converte exceções dos plugins em `fail(...)` com um código estável. */
export function toFailure(err: unknown): BridgeFailure {
  const message = err instanceof Error ? err.message : String(err ?? 'Erro desconhecido');
  const lower = message.toLowerCase();

  // Código explícito (dos módulos da bridge ou dos plugins do Capacitor).
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    if ((KNOWN_CODES as readonly string[]).includes(code)) return fail(message, code as ErrorCode);
    if (code === 'UNIMPLEMENTED' || code === 'UNAVAILABLE') return fail('Recurso indisponível neste dispositivo.', 'not_available');
  }

  if (/cancel|canceled|cancelled|user denied|dismiss/.test(lower)) return fail('Operação cancelada pelo usuário.', 'cancelled');
  if (/permission|not authorized|denied|access/.test(lower)) return fail('Permissão negada.', 'permission_denied');
  if (/not implemented|unimplemented|not available/.test(lower)) return fail('Recurso indisponível neste dispositivo.', 'not_available');
  return fail(message, 'unknown');
}

/** Executa `fn` e garante o formato padrão, sem nunca lançar. */
export async function attempt<T>(fn: () => Promise<T>): Promise<BridgeResult<T>> {
  try {
    return ok(await fn());
  } catch (err) {
    return toFailure(err);
  }
}
