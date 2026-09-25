import { Keyboard } from '@capacitor/keyboard';

import { emit } from '../utils/dom';

/**
 * Teclado virtual.
 *
 * O redimensionamento é nativo (iOS: `Keyboard.resize = 'native'`; Android:
 * `adjustResize` + SystemBars), então a área visível já encolhe. Aqui:
 *   - garante que o campo focado fique visível (inputs, textareas, selects,
 *     campos dentro de modais e a busca do PDV);
 *   - expõe `--escale-keyboard-height` e a classe `escale-keyboard-open` no
 *     <html> para o CSS do ERP ajustar barras fixas, se quiser;
 *   - dispara `keyboardChanged` ({ open, height }) no window.
 */

const EDITABLE = 'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]';

function revealFocused(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.matches(EDITABLE)) return;

  const rect = el.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const margin = 24;
  if (rect.top >= margin && rect.bottom <= viewportHeight - margin) return;

  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function setState(open: boolean, height: number): void {
  const root = document.documentElement;
  root.classList.toggle('escale-keyboard-open', open);
  root.style.setProperty('--escale-keyboard-height', `${open ? height : 0}px`);
  emit('keyboardChanged', { open, height: open ? height : 0 });
}

export function setupKeyboard(): void {
  void Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => setState(true, keyboardHeight));
  void Keyboard.addListener('keyboardDidShow', () => requestAnimationFrame(revealFocused));
  void Keyboard.addListener('keyboardWillHide', () => setState(false, 0));

  // Foco trocado com o teclado já aberto (ex.: "próximo campo").
  document.addEventListener(
    'focusin',
    () => {
      if (document.documentElement.classList.contains('escale-keyboard-open')) {
        window.setTimeout(revealFocused, 50);
      }
    },
    true,
  );
}
