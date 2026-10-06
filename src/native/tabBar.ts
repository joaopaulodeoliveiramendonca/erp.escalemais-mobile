import { injectStyle, onDomReady } from '../utils/dom';
import { log } from '../utils/logger';
import { EscaleNative, type NativeTabItem } from './escaleNative';

/**
 * Tab bar nativa do iPhone (AppRootViewController no iOS): o visual do sistema,
 * com Liquid Glass no iOS 26+, no lugar da cápsula em HTML do ERP.
 *
 * O ERP continua sendo a fonte dos itens: a barra dele
 * (layouts/partials/mobile-bottom-nav.blade.php) é renderizada como sempre,
 * escondida, e daqui sai só a lista — título, ícone e qual está ativo. O toque
 * no item nativo clica o link correspondente da página; "Mais" abre a folha do
 * menu como antes.
 *
 * Telas sem a barra do ERP (login, erros, offline) escondem a nativa.
 */

const NAV_ID = 'mobile-bottom-nav';

/** z-index da barra do ERP: o que fica acima dela no rodapé é modal e cobriria a nativa. */
const WEB_TABBAR_Z = 45;

/** Ícone do ERP (Lucide, `data-icon`) → SF Symbol. */
const SYMBOLS: Record<string, string> = {
  dashboard: 'square.grid.2x2',
  basket: 'basket',
  monitor: 'display',
  users: 'person.2',
  kanban: 'rectangle.split.3x1',
  'badge-check': 'checkmark.seal',
  'trending-down': 'chart.line.downtrend.xyaxis',
  'trending-up': 'chart.line.uptrend.xyaxis',
  wallet: 'wallet.bifold',
  menu: 'line.3.horizontal',
};

/** Reserva para versões do ERP sem `data-icon`: os rótulos da barra são fixos. */
const ICON_BY_LABEL: Record<string, string> = {
  Dashboard: 'dashboard',
  Vendas: 'basket',
  PDV: 'monitor',
  Clientes: 'users',
  'Usuários': 'users',
  CRM: 'kanban',
  Assinaturas: 'badge-check',
  'Contas a pagar': 'trending-down',
  'Contas a receber': 'trending-up',
  Carteira: 'wallet',
  Mais: 'menu',
};

let elements: HTMLElement[] = [];
let lastSent = '';
let height = 0;
let covered = false;

/** Cor do texto do elemento em #RRGGBB (a do item ativo vem da cor de destaque da empresa). */
function hexColor(el: HTMLElement): string | undefined {
  const m = getComputedStyle(el).color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return undefined;
  return `#${m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

function readItems(): { items: NativeTabItem[]; selected?: number; tint?: string } {
  const nav = document.getElementById(NAV_ID);
  elements = nav ? Array.from(nav.querySelectorAll<HTMLElement>('.erp-tabbar__item')) : [];

  const items = elements.map((el) => {
    const title = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim();
    const icon = el.dataset.icon || ICON_BY_LABEL[title] || '';
    return { title, symbol: SYMBOLS[icon] ?? 'circle' };
  });

  // Com a folha aberta, "Mais" é o ativo (o ERP marca is-active nele também).
  const index = elements.findIndex((el) => el.classList.contains('is-active') && el.id === `${NAV_ID}-more`);
  const selected = index >= 0 ? index : elements.findIndex((el) => el.classList.contains('is-active'));
  // A cor de destaque está nos itens ativos do ERP (classe na marcação, inclusive no "Mais").
  const accent = elements[selected] ?? document.getElementById(`${NAV_ID}-more`);
  let tint: string | undefined;
  if (accent && !accent.classList.contains('is-active')) {
    // "Mais" fechado: veste por um instante as classes de ativo para ler a cor.
    const on = (accent.dataset.activeClass || '').split(' ').filter(Boolean);
    const off = (accent.dataset.idleClass || '').split(' ').filter(Boolean).filter((c) => accent.classList.contains(c));
    accent.classList.remove(...off);
    accent.classList.add(...on);
    tint = hexColor(accent);
    accent.classList.remove(...on);
    accent.classList.add(...off);
  } else if (accent) {
    tint = hexColor(accent);
  }
  return { items, selected: selected >= 0 ? selected : undefined, tint };
}

function applyHeight(value: number): void {
  if (value === height) return;
  height = value;
  document.documentElement.style.setProperty('--native-tabbar-h', `${value}px`);
  // O ERP mede a própria barra (--mobile-nav-h) no resize; a reserva mudou sem a janela mudar.
  window.dispatchEvent(new Event('resize'));
  scheduleCoverCheck();
}

function sync(): void {
  const state = readItems();
  const key = JSON.stringify(state);
  if (key === lastSent) return;
  lastSent = key;
  EscaleNative.setTabBar(state)
    .then((result) => applyHeight(result.visible ? result.height : 0))
    .catch((err) => log.warn('tab bar', err));
}

/**
 * Modal do ERP sobre o rodapé (z-index acima da barra web): a nativa sairia por
 * cima dele e esconderia os botões de baixo. Amostra três pontos da faixa da barra.
 */
function isCovered(): boolean {
  if (!height || !elements.length) return false;
  const y = window.innerHeight - Math.min(height, 60) / 2;
  return [0.2, 0.5, 0.8].some((fx) => {
    let el = document.elementFromPoint(window.innerWidth * fx, y);
    while (el && el !== document.body) {
      if (el.id === NAV_ID) return false;
      const style = getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') && Number(style.zIndex) > WEB_TABBAR_Z) return true;
      el = el.parentElement;
    }
    return false;
  });
}

let coverTimer: number | undefined;

function scheduleCoverCheck(): void {
  window.clearTimeout(coverTimer);
  coverTimer = window.setTimeout(() => {
    const now = isCovered();
    if (now === covered) return;
    covered = now;
    void EscaleNative.setTabBarCovered({ covered }).catch(() => undefined);
  }, 80);
}

export function setupTabBar(): void {
  if (!window.__escaleNativeTabBar) return;

  // Antes da primeira pintura: a cápsula do ERP nunca aparece. O invólucro fica
  // (o selo de offline mora nele) e passa a reservar a altura da barra nativa —
  // o script do ERP mede o invólucro e repassa a medida para --mobile-nav-h.
  injectStyle(
    'escale-native-tabbar',
    `#${NAV_ID} .erp-tabbar__bar { display: none !important; }
     #${NAV_ID} { padding-bottom: calc(var(--native-tabbar-h, calc(49px + env(safe-area-inset-bottom, 0px))) + 8px) !important; }`,
  );

  void EscaleNative.addListener('tabBarSelect', ({ index }) => {
    elements[index]?.click();
  });
  void EscaleNative.addListener('tabBarHeight', ({ height: value }) => {
    if (height) applyHeight(value);
  });

  onDomReady(() => {
    sync();
    // "Mais" abre e fecha a folha sem trocar de página.
    window.addEventListener('erp-sidebar-state', () => window.setTimeout(sync, 0));

    new MutationObserver(scheduleCoverCheck).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
    document.addEventListener('transitionend', scheduleCoverCheck, true);
    document.addEventListener('animationend', scheduleCoverCheck, true);
  });

  // Voltar com o gesto pode restaurar a página do cache (bfcache), sem DOMContentLoaded.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    lastSent = '';
    sync();
  });
}
