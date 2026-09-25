/**
 * Regra centralizada de URLs do aplicativo.
 *
 * - Hosts em ALLOWED_HOSTS abrem DENTRO da WebView (são o ERP).
 * - Qualquer outro http(s) abre FORA: no app correspondente (WhatsApp,
 *   Instagram, YouTube…) quando instalado, ou no navegador do sistema.
 * - Esquemas especiais (tel:, mailto:, whatsapp:, …) vão sempre para o sistema.
 * - HTTP puro nunca é carregado na WebView.
 *
 * A mesma lista é entregue à camada nativa (Android/iOS) pelo
 * `capacitor.config.ts`, que também bloqueia navegações que escapem do
 * JavaScript (redirects do servidor, `location.href = …`, formulários).
 */

/** Origem do ERP. Sempre HTTPS. */
export const ERP_ORIGIN = 'https://erp.escalemais.com';

/** Tela aberta quando o app inicia. */
export const START_PATH = '/login';

export const START_URL = `${ERP_ORIGIN}${START_PATH}`;

/**
 * Domínios que podem ser navegados dentro da WebView.
 *
 * Adicione somente quando necessário e somente domínios controlados pela
 * Escale Mais. Páginas nesses domínios que não sejam `ERP_ORIGIN` NÃO recebem
 * `window.EscaleApp` (a bridge é injetada apenas na origem do ERP).
 */
export const ALLOWED_HOSTS: readonly string[] = ['erp.escalemais.com'];

/**
 * Telas "raiz": o botão voltar do Android não volta a partir delas (voltaria
 * para o /login, que redireciona de novo ao dashboard). Nelas, voltar pede
 * confirmação e o segundo toque fecha o app.
 */
export const ROOT_PATHS: readonly string[] = [
  '/',
  '/login',
  '/proprietario/dashboard',
  '/colaborador/dashboard',
  '/admin/dashboard',
];

/**
 * Rotas do ERP que talvez precisem de tratamento especial por política das
 * lojas (ex.: contratação/assinatura de planos — Apple 3.1.1 / Google Payments).
 *
 * Hoje ficam dentro do app normalmente. Para mudar o comportamento, troque a
 * `policy` da rota:
 *   - 'inApp'    → abre na WebView (padrão)
 *   - 'external' → abre no navegador do sistema
 *   - 'blocked'  → não abre e mostra aviso
 */
export type RoutePolicy = 'inApp' | 'external' | 'blocked';

export const RESTRICTED_ROUTES: ReadonlyArray<{ pattern: RegExp; policy: RoutePolicy; message?: string }> = [
  // Exemplos (desativados) — rotas de planos/assinatura existentes no ERP:
  // { pattern: /^\/planos(\/|$)/, policy: 'external' },
  // { pattern: /^\/proprietario\/(assinatura|subscription)(\/|$)/, policy: 'blocked',
  //   message: 'Gerencie sua assinatura pelo site erp.escalemais.com.' },
];

/** Esquemas entregues diretamente ao sistema operacional. */
export const SYSTEM_SCHEMES: readonly string[] = [
  'tel:',
  'mailto:',
  'sms:',
  'whatsapp:',
  'geo:',
  'maps:',
  'market:',
  'itms-apps:',
  'intent:',
];

/** Extensões tratadas como arquivo para download/visualização. */
export const DOWNLOAD_EXTENSIONS: readonly string[] = [
  'pdf', 'xml', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'txt', 'zip', 'rar',
  'ofx', 'rem', 'ret', 'json', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'pfx',
];

/**
 * Formulários POST que respondem com arquivo. No Android a WebView não
 * consegue repetir um POST ao detectar o download, então esses formulários
 * são enviados via fetch pela bridge. (No iOS o WKDownload já resolve.)
 * O ERP também pode marcar qualquer <form> com `data-escale-download`.
 */
export const POST_DOWNLOAD_PATHS: readonly RegExp[] = [
  /\/ferramentas\/buscar-nfe\/exportar$/,
  /\/backup\/download$/,
];

export type UrlKind =
  | 'internal'   // ERP → fica na WebView
  | 'external'   // outro site → app correspondente / navegador
  | 'system'     // tel:, mailto:, whatsapp:… → sistema operacional
  | 'insecure'   // http:// → bloqueado (ou promovido a https se for o ERP)
  | 'local'      // blob:, data:, about:, javascript:, # → deixa a página cuidar
  | 'invalid';

function parse(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

export function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => h === allowed);
}

/** Classifica uma URL (absoluta ou relativa à página atual). */
export function classifyUrl(url: string, base: string = ERP_ORIGIN): UrlKind {
  const raw = url.trim();
  if (!raw || raw.startsWith('#')) return 'local';

  const lower = raw.toLowerCase();
  if (SYSTEM_SCHEMES.some((scheme) => lower.startsWith(scheme))) return 'system';

  const parsed = parse(raw, base);
  if (!parsed) return 'invalid';

  switch (parsed.protocol) {
    case 'https:':
      return isAllowedHost(parsed.hostname) ? 'internal' : 'external';
    case 'http:':
      return 'insecure';
    case 'blob:':
    case 'data:':
    case 'about:':
    case 'javascript:':
      return 'local';
    default:
      // Esquemas desconhecidos de apps (ex.: instagram://, fb://)
      return 'system';
  }
}

export function isInternalUrl(url: string, base?: string): boolean {
  return classifyUrl(url, base) === 'internal';
}

/** `http://erp.escalemais.com/x` → `https://erp.escalemais.com/x`; outros hosts → null. */
export function upgradeToHttps(url: string): string | null {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== 'http:' || !isAllowedHost(parsed.hostname)) return null;
  parsed.protocol = 'https:';
  return parsed.toString();
}

export function routePolicyFor(url: string, base?: string): { policy: RoutePolicy; message?: string } {
  const parsed = parse(url, base);
  if (!parsed) return { policy: 'inApp' };
  const rule = RESTRICTED_ROUTES.find((r) => r.pattern.test(parsed.pathname));
  return rule ? { policy: rule.policy, message: rule.message } : { policy: 'inApp' };
}

/** Heurística por extensão — o servidor ainda pode indicar download via Content-Disposition. */
export function looksLikeDownload(url: string, base?: string): boolean {
  const parsed = parse(url, base);
  if (!parsed) return false;
  const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return !!match && DOWNLOAD_EXTENSIONS.includes(match[1]);
}

export function isRootPath(url: string): boolean {
  const parsed = parse(url);
  if (!parsed) return false;
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  return ROOT_PATHS.includes(path);
}

/** Converte um deep link (https://erp.escalemais.com/vendas/123) no caminho interno. */
export function deepLinkToInternalUrl(url: string): string | null {
  const parsed = parse(url);
  if (!parsed) return null;
  if (parsed.protocol === 'https:' && isAllowedHost(parsed.hostname)) return parsed.toString();
  // Esquema customizado: escalemais://vendas/123 → https://erp.escalemais.com/vendas/123
  if (parsed.protocol === 'escalemais:') {
    const path = `/${parsed.host}${parsed.pathname}`.replace(/\/{2,}/g, '/');
    return `${ERP_ORIGIN}${path}${parsed.search}${parsed.hash}`;
  }
  return null;
}
