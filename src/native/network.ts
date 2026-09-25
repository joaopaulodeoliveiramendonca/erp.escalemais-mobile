import { Network, type ConnectionStatus } from '@capacitor/network';

import { emit, onRootReady } from '../utils/dom';
import { log } from '../utils/logger';

/**
 * Detecção de conexão ONLINE/OFFLINE, exposta ao ERP como:
 *
 *   window.isOnline                         → boolean sempre atualizado
 *   await EscaleApp.getNetworkStatus()      → { success, data: { connected, connectionType } }
 *   window.addEventListener('networkStatusChanged', e => e.detail.connected)
 *
 * Também alterna a classe `escale-offline` no <html>, útil para CSS.
 */

export interface NetworkState {
  connected: boolean;
  connectionType: ConnectionStatus['connectionType'];
}

let state: NetworkState = {
  connected: navigator.onLine,
  connectionType: 'unknown',
};

function update(next: ConnectionStatus, notify: boolean): void {
  const changed = next.connected !== state.connected || next.connectionType !== state.connectionType;
  state = { connected: next.connected, connectionType: next.connectionType };

  window.isOnline = state.connected;
  onRootReady((root) => root.classList.toggle('escale-offline', !state.connected));

  if (changed && notify) {
    log.debug('network', state);
    emit<NetworkState>('networkStatusChanged', { ...state });
  }
}

export function getNetworkState(): NetworkState {
  return { ...state };
}

export async function fetchNetworkState(): Promise<NetworkState> {
  update(await Network.getStatus(), true);
  return getNetworkState();
}

export function setupNetwork(): void {
  window.isOnline = state.connected;
  // Primeira leitura: sincroniza sem disparar evento (não houve "mudança" para o ERP).
  void Network.getStatus()
    .then((s) => update(s, false))
    .catch(() => undefined);
  void Network.addListener('networkStatusChange', (s) => update(s, true));
}
