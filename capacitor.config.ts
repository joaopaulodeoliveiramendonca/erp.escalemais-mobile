import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { APP_ID, APP_NAME, BRAND_COLORS, USER_AGENT_TOKEN } from './src/config/app';
import { ALLOWED_HOSTS, ERP_ORIGIN, START_URL } from './src/config/urls';

const { version } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string };

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: APP_NAME,

  // Só a "casca" local: página de erro amigável, a bridge (escale-bridge.js)
  // e um index.html de fallback. O ERP em si vem sempre do servidor.
  webDir: 'www',

  server: {
    // O ERP Laravel é o conteúdo do app. Atualizações no servidor aparecem
    // no app sem nova publicação nas lojas.
    url: START_URL,
    // HTTPS obrigatório: nada de tráfego em texto puro.
    cleartext: false,
    androidScheme: 'https',
    // Única lista de domínios navegáveis na WebView (src/config/urls.ts).
    allowNavigation: [...ALLOWED_HOSTS],
    // `errorPath` NÃO é usado de propósito: no Android ele troca também
    // respostas 4xx/5xx (404, 419 de CSRF, 500) pela página de erro. A página
    // "Sem conexão" é exibida pelo plugin EscaleNative só em falha de rede.
  },

  // Permite ao Laravel identificar o app pelo servidor.
  appendUserAgent: `${USER_AGENT_TOKEN}/${version}`,

  // Cor da WebView antes da primeira pintura: o cinza da splash (sem flash branco).
  backgroundColor: BRAND_COLORS.surfaceLight,

  // Logs do bridge só em builds de debug.
  loggingBehavior: 'debug',

  android: {
    allowMixedContent: false,
    captureInput: false,
    // `webContentsDebuggingEnabled` omitido: o Capacitor liga só em debug.
  },

  ios: {
    // A página controla a safe area via env(safe-area-inset-*) (viewport-fit=cover no ERP).
    contentInset: 'never',
    preferredContentMode: 'mobile',
    // Sem "peek" de links ao pressionar e segurar (não faz sentido num ERP).
    allowsLinkPreview: false,
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      // A bridge esconde a splash assim que o ERP pinta (ou a página de erro
      // aparece). O auto-hide é só uma rede de segurança.
      launchAutoHide: true,
      launchShowDuration: 15000,
      launchFadeOutDuration: 250,
      backgroundColor: BRAND_COLORS.surfaceLight,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },

    StatusBar: {
      // Cor inicial = splash. Depois a bridge sincroniza com o `theme-color` do ERP.
      backgroundColor: BRAND_COLORS.surfaceLight,
      // Fundo claro → ícones escuros.
      style: 'LIGHT',
      overlaysWebView: true,
    },

    SystemBars: {
      // Android edge-to-edge: env(safe-area-inset-*) funcionando e variáveis
      // --safe-area-inset-* injetadas para WebViews antigas.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },

    Keyboard: {
      // iOS: redimensiona a WebView inteira; o campo focado continua visível.
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },

    // Cookies e requisições continuam nativos da WebView: a sessão do Laravel
    // (cookie `laravel_session` + XSRF) funciona como no navegador.
    CapacitorCookies: { enabled: false },
    CapacitorHttp: { enabled: false },

    // Plugin nativo do projeto (android/app/.../EscaleNativePlugin.java e
    // ios/App/App/EscaleNativePlugin.swift).
    EscaleNative: {
      erpOrigin: ERP_ORIGIN,
      allowedHosts: [...ALLOWED_HOSTS],
      bridgeScript: 'escale-bridge.js',
      offlinePage: 'offline.html',
      // Rota do ERP que funciona sem internet. Vazio = botão "Continuar offline" oculto.
      offlineUrl: '',
      // iOS: voltar com o gesto da borda esquerda (não há botão físico).
      iosSwipeBack: true,
    },
  },
};

export default config;
