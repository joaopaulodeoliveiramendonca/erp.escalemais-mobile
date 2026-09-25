import { hasPlugin } from '../config/platform';

/**
 * Push notifications — PREPARADO, ainda não ativado.
 *
 * A API JavaScript já existe para o ERP evoluir sem esperar nova versão da
 * bridge; hoje ela responde `not_configured`. Para ativar (ver README,
 * seção "Push notifications"):
 *
 *   1. npm i @capacitor/push-notifications && npx cap sync
 *   2. Android: google-services.json do Firebase em android/app/
 *   3. iOS: capability Push Notifications + chave APNs no Firebase/servidor
 *   4. Implementar `registerForPush` abaixo com PushNotifications.requestPermissions()
 *      + register(), e enviar o token ao Laravel por uma rota autenticada
 *      (a sessão já está no cookie — não guardar tokens no app).
 *
 * A permissão de notificação deve ser pedida SÓ quando o usuário ativar o
 * recurso no ERP (item 13), nunca na abertura.
 */

export interface PushRegistration {
  token: string;
  platform: 'android' | 'ios';
}

export function isPushConfigured(): boolean {
  return hasPlugin('PushNotifications');
}

export async function registerForPush(): Promise<PushRegistration> {
  if (!isPushConfigured()) {
    throw Object.assign(new Error('Notificações push ainda não estão configuradas neste app.'), { code: 'not_configured' });
  }
  throw Object.assign(new Error('Registro de push ainda não implementado.'), { code: 'not_configured' });
}
