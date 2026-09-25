/**
 * Identidade do aplicativo.
 *
 * Importado tanto pelo `capacitor.config.ts` (tempo de build/sync) quanto pela
 * bridge injetada no ERP (tempo de execução). Não coloque aqui nada secreto:
 * tudo que está neste arquivo acaba dentro do binário e do JavaScript.
 */

/** Bundle ID (iOS) / applicationId (Android). Não pode mudar depois de publicado. */
export const APP_ID = 'com.escalemais.erp';

/** Nome curto exibido abaixo do ícone. */
export const APP_NAME = 'Escale Mais';

/** Nome completo, usado nas lojas e em textos longos. */
export const APP_FULL_NAME = 'ERP Escale Mais';

/**
 * Identificador anexado ao User-Agent da WebView.
 *
 * O Laravel pode detectar o app pelo servidor com
 * `str_contains($request->userAgent(), 'EscaleMaisApp')`.
 */
export const USER_AGENT_TOKEN = 'EscaleMaisApp';

/** Cores da marca (mesmas do ERP: login, manifest.json e layouts). */
export const BRAND_COLORS = {
  primary: '#004cff',
  navy: '#00002d',
  /** `theme-color` do dashboard no tema claro. */
  surfaceLight: '#f0f0f0',
  /** `theme-color` do dashboard no tema escuro. */
  surfaceDark: '#1c1c21',
} as const;
