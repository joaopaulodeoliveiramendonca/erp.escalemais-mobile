import { injectStyle, onRootReady } from '../utils/dom';

/**
 * Ajustes de toque para o ERP se comportar como app, sem bloquear
 * acessibilidade (o zoom por pinça continua como o ERP definir no viewport).
 *
 * - overscroll/bounce e "puxar para atualizar": desligados. A WebView não tem
 *   pull-to-refresh nativo e o ERP tem formulários longos em que um refresh
 *   acidental perderia dados (item 15).
 * - duplo toque não dá zoom (`touch-action: manipulation`), pinça continua.
 * - pressionar e segurar em links/imagens não abre o menu do navegador.
 * - sem destaque cinza ao tocar; seleção de texto desligada só em botões,
 *   links e ícones — textos e campos continuam selecionáveis.
 */
const CSS = `
html, body {
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
html { touch-action: manipulation; }
a, img, button, [role="button"] {
  -webkit-touch-callout: none;
}
button, [role="button"], nav a, label, svg {
  -webkit-user-select: none;
  user-select: none;
}
input, textarea, select, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
`;

export function setupGestures(): void {
  injectStyle('escale-app-gestures', CSS);
  onRootReady((root) => root.classList.add('escale-native-app'));
}
