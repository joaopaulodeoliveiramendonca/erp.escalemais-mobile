# Escale Mais — app mobile (Android e iOS)

App híbrido do **ERP Escale Mais** feito com **Capacitor 8**. A WebView carrega o ERP Laravel (`https://erp.escalemais.com/login`) e uma camada nativa cuida da parte do dispositivo: splash, status bar, safe area, botão voltar, teclado, conexão, downloads, compartilhamento, impressão, câmera, scanner e deep links.

O ERP **não foi reescrito**. Telas, regras de negócio, login e sessão continuam no Laravel. Uma alteração publicada no servidor aparece no app na próxima vez que a tela é aberta, sem nova versão nas lojas. Só a camada nativa é versionada com o app.

---

## Sumário

1. [Arquitetura](#1-arquitetura)
2. [Requisitos](#2-requisitos)
3. [Instalação e comandos](#3-instalação-e-comandos)
4. [Estrutura do projeto](#4-estrutura-do-projeto)
5. [Como cada item funciona](#5-como-cada-item-funciona)
6. [API JavaScript para o ERP (`window.EscaleApp`)](#6-api-javascript-para-o-erp-windowescaleapp)
7. [Desenvolvimento e depuração](#7-desenvolvimento-e-depuração)
8. [Android: configuração e build](#8-android-configuração-e-build)
9. [iOS: configuração e build](#9-ios-configuração-e-build)
10. [Deep links (Universal Links / App Links)](#10-deep-links-universal-links--app-links)
11. [Push notifications (preparado)](#11-push-notifications-preparado)
12. [Checklist antes de publicar nas lojas](#12-checklist-antes-de-publicar-nas-lojas)
13. [Limitações conhecidas e pendências](#13-limitações-conhecidas-e-pendências)

---

## 1. Arquitetura

```text
┌──────────────────────────── App (Capacitor 8) ─────────────────────────────┐
│                                                                            │
│  Camada nativa                                                             │
│  ├─ Plugins oficiais: App, SplashScreen, StatusBar, Keyboard, Network,     │
│  │  Share, Filesystem, FileViewer, ActionSheet, AppLauncher, Camera,       │
│  │  BarcodeScanner, Toast, ScreenOrientation (+ SystemBars do core)        │
│  └─ Plugin do projeto: EscaleNative (Java + Swift)                         │
│       • injeta a bridge JS só na origem do ERP                             │
│       • regra de navegação interna/externa (lista de domínios)             │
│       • tela "Sem conexão" em falha de rede                                │
│       • downloads (DownloadListener / WKDownload) • impressão nativa        │
│                                                                            │
│  WebView ── https://erp.escalemais.com/login  (server.url)                 │
│     │                                                                      │
│     └─ www/escale-bridge.js  ← src/ (TypeScript)                           │
│          window.EscaleApp  • eventos  • interceptação de links/downloads   │
└────────────────────────────────────────────────────────────────────────────┘
                 │ cookies/sessão do Laravel (nativos da WebView)
                 ▼
        Laravel (erp.escalemais.com): login, dashboard, PDV, fiscal…
```

### Decisões e por quê

| Decisão | Motivo |
|---|---|
| O ERP é o `server.url` do Capacitor, e não um `index.html` local que redireciona | No Android, o Capacitor 8 só injeta o bridge nativo (`window.Capacitor`) na origem do `server.url`. Com uma casca local, a página do ERP ficaria sem acesso aos plugins. |
| Bridge em TypeScript, injetada pelo nativo no início de cada página | O ERP não precisa carregar nada, e a API é igual no Android e no iOS. A injeção fica restrita à origem do ERP (Android: `addDocumentStartJavaScript` com origem permitida; iOS: `WKUserScript` com checagem de origem). |
| Sem `server.errorPath` | No Android, o `errorPath` também substitui respostas 404/419/500 do Laravel pela página de erro. Aqui a tela "Sem conexão" só aparece em **falha de rede**. |
| Cookies nativos da WebView (`CapacitorCookies`/`CapacitorHttp` desligados) | A sessão do Laravel (`laravel_session` + XSRF) funciona exatamente como no navegador. |
| Downloads baixados de novo pelo JS com `fetch` e credenciais | Usa a sessão da própria página e permite oferecer **Visualizar / Compartilhar / Salvar**. |

---

## 2. Requisitos

| Ferramenta | Versão |
|---|---|
| Node.js | 22 ou superior (testado com 24) |
| Android Studio | atual, Android SDK 36. **Gradle JDK = 21** (ver nota abaixo) |
| Xcode | 16 ou superior (iOS 15+ como mínimo). Aceite a licença: `sudo xcodebuild -license` |
| Conta Apple Developer | para rodar em aparelho físico com Associated Domains e publicar |
| Conta Google Play Console | para publicar |

O iOS usa **Swift Package Manager** (sem CocoaPods).

> **JDK do Gradle:** o template do Capacitor 8 usa Gradle 8.14, que roda até o Java 24. Versões recentes do Android Studio trazem o JBR 25, e o build falha com `Unsupported class file major version 69`. Em *Settings › Build, Execution, Deployment › Build Tools › Gradle › Gradle JDK*, escolha um **JDK 21** (ex.: Temurin 21). Na linha de comando: `export JAVA_HOME=<jdk-21>`.

---

## 3. Instalação e comandos

```bash
npm install
npm run build        # gera www/ (bridge + páginas locais)
npx cap sync         # copia www/ e a config para android/ e ios/

npx cap open android # Android Studio
npx cap open ios     # Xcode
```

| Script | O que faz |
|---|---|
| `npm run build` | Compila `src/` em `www/escale-bridge.js` (minificado) e copia `public/`. `npm run build -- --dev` gera com sourcemap. |
| `npm run sync` | `build` + `cap sync`. |
| `npm run typecheck` | Checagem de tipos do TypeScript. |
| `npm run assets` | Regera ícones e splash (Android e iOS) a partir de `resources/`. |
| `npm run open:android` / `open:ios` | Abre a IDE. |

> Rode `npm run sync` sempre que mudar algo em `src/`, `public/` ou `capacitor.config.ts`.

---

## 4. Estrutura do projeto

```text
erp.escalemais-mobile/
├── capacitor.config.ts          # config do Capacitor (lê src/config/*)
├── src/
│   ├── config/
│   │   ├── app.ts               # appId, nomes, cores, token de User-Agent
│   │   ├── urls.ts              # ★ regra central de URLs: domínios, rotas, downloads
│   │   └── platform.ts          # android | ios | web
│   ├── bridge/
│   │   ├── index.ts             # entrada: espera o Capacitor e inicializa
│   │   ├── main.ts              # instala window.EscaleApp e os módulos
│   │   └── globals.d.ts         # tipos de window.EscaleApp / isNativeApp / isOnline
│   ├── native/                  # um módulo por responsabilidade
│   │   ├── appBridge.ts         # ★ API pública window.EscaleApp
│   │   ├── escaleNative.ts      # interface do plugin nativo do projeto
│   │   ├── navigation.ts        # links, window.open, target=_blank, forms de download
│   │   ├── files.ts             # download → Visualizar / Compartilhar / Salvar
│   │   ├── share.ts             # compartilhamento nativo (+ polyfill navigator.share)
│   │   ├── print.ts             # window.print() → impressão nativa
│   │   ├── network.ts           # online/offline + evento networkStatusChanged
│   │   ├── statusBar.ts         # status bar seguindo o theme-color do ERP
│   │   ├── splash.ts            # esconde a splash quando o ERP pinta
│   │   ├── backButton.ts        # botão voltar do Android
│   │   ├── keyboard.ts          # teclado: campo focado sempre visível
│   │   ├── orientation.ts       # retrato / paisagem por tela
│   │   ├── gestures.ts          # overscroll, zoom por duplo toque, callouts
│   │   ├── deepLinks.ts         # links externos abrindo telas do app
│   │   ├── camera.ts            # câmera (preparado e funcional)
│   │   ├── scanner.ts           # código de barras (preparado e funcional)
│   │   └── push.ts              # push (API pronta, desativado)
│   └── utils/                   # result {success,data}, DOM, arquivos, logger
├── public/
│   ├── index.html               # casca exigida pelo Capacitor (não aparece)
│   └── offline.html             # tela "Sem conexão"
├── scripts/
│   ├── build.mjs                # esbuild → www/
│   └── generate-assets.mjs      # ícones e splash
├── resources/                   # arte-fonte (mesma do ERP)
├── well-known/                  # modelos de assetlinks.json e apple-app-site-association
├── android/                     # projeto Android Studio (versionar)
│   └── app/src/main/java/com/escalemais/erp/
│       ├── MainActivity.java
│       ├── EscaleNativePlugin.java
│       ├── EscaleWebViewClient.java
│       └── UrlPolicy.java
└── ios/                         # projeto Xcode (versionar)
    └── App/App/
        ├── MainViewController.swift
        ├── EscaleNativePlugin.swift
        ├── EscaleWebViewProxy.swift
        ├── App.entitlements
        └── Info.plist
```

---

## 5. Como cada item funciona

### Abertura, splash e loading
- A splash nativa (cinza `#f0f0f0` do ERP com as barras azuis da marca) aparece na abertura. A WebView também nasce com esse cinza, então não há tela branca. O ícone do app continua azul.
- A bridge esconde a splash **dois frames depois do DOM pronto**, quando o ERP já pintou. Se a rede cair, a página "Sem conexão" esconde a splash. Há duas redes de segurança: 8 s na bridge e 15 s no nativo.
- Nas trocas de página não há splash: os loaders são do próprio ERP.

### Navegação e links externos
Tudo parte de `src/config/urls.ts`. O `capacitor.config.ts` repassa a mesma lista ao nativo.

| URL | Destino |
|---|---|
| `https://erp.escalemais.com/*` | dentro da WebView |
| `https://wa.me`, `api.whatsapp.com`, `instagram.com`, `youtube.com`, qualquer outro domínio | app correspondente, se instalado, ou navegador |
| `tel:`, `mailto:`, `whatsapp:`, `intent:`… | sistema |
| `http://erp.escalemais.com/*` | promovido para `https://` |
| `http://outro-site` | nunca dentro do app (abre fora) |
| `target="_blank"` e `window.open()` do ERP | mesma WebView, com a mesma sessão (igual ao app desktop Tauri) |

Há duas camadas. O JS intercepta cliques e `window.open`. O nativo (`shouldOverrideLoad`) barra o que escapar, como redirects do servidor, `location.href` e formulários. No iOS o `EscaleWebViewProxy` também impede que `target="_blank"` do ERP vá para o Safari, que é o padrão do Capacitor e perderia a sessão.

**Rotas de assinatura/planos (política das lojas):** em `RESTRICTED_ROUTES` (`urls.ts`), cada rota pode ser `inApp`, `external` (navegador) ou `blocked` (com aviso). Já existem exemplos comentados para `/planos` e para as rotas de assinatura.

### Sessão e dados
- Cookies, `localStorage`, `sessionStorage`, IndexedDB e Service Worker são os da WebView e **persistem** entre aberturas. Nada é limpo ao fechar.
- Android: os cookies são gravados em disco ao pausar o app (`CookieManager.flush()`).
- **Backup na nuvem desligado no Android** (`allowBackup=false` + `data_extraction_rules.xml`), para os cookies de sessão não irem para outro aparelho.
- O app nunca guarda senha. No iOS, o Chaveiro do iCloud pode preencher o login (`webcredentials`).

### Tela "Sem conexão"
`public/offline.html` é carregada pelo nativo apenas quando o frame principal falha por **rede** (sem internet, DNS, timeout, SSL). Erros do Laravel (404, 419, 500) continuam aparecendo como o ERP os desenha. "Tentar novamente" reabre a URL que falhou, e a página volta sozinha quando a conexão retorna. O botão **"Continuar offline"** só aparece se `plugins.EscaleNative.offlineUrl` for configurado em `capacitor.config.ts`, para uso futuro com o modo offline do ERP.

### Status bar e safe area
- A cor segue o `<meta name="theme-color">` do ERP, que o layout do dashboard já mantém, nos temas claro e escuro. O contraste dos ícones é calculado automaticamente. Diferente do PWA, **a troca de tema é aplicada na hora**, sem recarregar a página.
- iOS: `contentInset: 'never'` + `viewport-fit=cover`, que o ERP já declara. O ERP usa `env(safe-area-inset-*)`, então notch, Dynamic Island e barra inferior são respeitados.
- Android: plugin `SystemBars` do core com `insetsHandling: 'css'`. No WebView 140 ou mais novo, `env(safe-area-inset-*)` funciona. Nos mais antigos, a WebView ganha padding e também existem as variáveis `--safe-area-inset-*`.

### Botão voltar (Android)
1. Dispara o evento `escale:backbutton` no `window`. Se o ERP chamar `preventDefault()` (para fechar um modal, por exemplo), o app não faz nada.
2. Com histórico e fora de uma tela raiz, volta uma página.
3. Na tela raiz (`/login`, `/`, `/proprietario/dashboard`, `/colaborador/dashboard`, `/admin/dashboard`), mostra "Pressione voltar novamente para sair". Um segundo toque em até 2 s fecha o app.

No iOS, o voltar é o **gesto da borda esquerda** (padrão do sistema). Ele só é acionado a partir da borda da tela e não conflita com swipes do conteúdo. Para desligar, use `plugins.EscaleNative.iosSwipeBack: false`.

### Downloads e arquivos
Downloads de PDF, XML, CSV, DANFE, orçamentos, comprovantes e `blob:` gerados no navegador passam pelo mesmo fluxo:

1. O arquivo é baixado **com a sessão** e gravado no cache do app.
2. Abre um menu nativo: **Visualizar** (QuickLook no iOS, app de PDF no Android), **Compartilhar** (WhatsApp, e-mail, Drive…) ou **Salvar** (Android: `Documentos/Escale Mais`; iOS: Arquivos › No meu iPhone › Escale Mais).

A detecção é feita em três lugares:
- links com extensão de arquivo, `download` ou `blob:`;
- `window.open(blob|pdf)`;
- respostas que a WebView não sabe mostrar (`Content-Disposition: attachment`, PDF). No Android via `DownloadListener`, no iOS via `WKDownload`, que também cobre POST.

**Downloads via POST no Android:** a WebView não repete o POST. Formulários que devolvem arquivo são enviados via `fetch` pela bridge quando a rota está em `POST_DOWNLOAD_PATHS` (`urls.ts`) ou o `<form>` tem o atributo `data-escale-download`.

### Impressão
`window.print()` não funciona em WebView. A bridge o substitui pelo **diálogo de impressão nativo** (impressoras, "Salvar como PDF", compartilhar), o que vale para DANFE, cupons, orçamentos, OS e etiquetas. `iframe.contentWindow.print()` também funciona (códigos 2FA, `print-frame.js`). Os eventos `beforeprint`/`afterprint` continuam sendo disparados.

### Teclado
Redimensionamento nativo (iOS `resize: native`, Android `adjustResize`). O campo focado é rolado para o centro se ficar escondido. Isso vale para inputs, textareas, selects, modais e a busca do PDV. O CSS do ERP pode usar a classe `escale-keyboard-open` e a variável `--escale-keyboard-height` no `<html>`.

### Gestos, zoom e pull-to-refresh
- **Pull-to-refresh: desligado** de propósito. A WebView não tem um nativo, e um refresh acidental em formulário longo perderia dados. O overscroll/bounce também está desligado.
- Duplo toque não dá zoom (`touch-action: manipulation`). O **zoom por pinça continua** como o viewport do ERP definir, por acessibilidade.
- Pressionar e segurar em link ou imagem não abre o menu do navegador. Textos e campos continuam selecionáveis.

### Orientação
Celular fica em retrato e tablet é livre. Uma tela do ERP pode liberar paisagem:

```html
<meta name="escale-orientation" content="any">        <!-- PDV, relatórios largos -->
```

Também dá para fazer em tempo de execução: `await EscaleApp.setOrientation('any')`. Cada página nova volta ao padrão.

### Permissões
Nenhuma permissão é pedida na abertura. A câmera é pedida só ao usar foto ou scanner. O armazenamento só no Android 10 ou anterior, ao "Salvar". Notificações, só quando o push for ativado e o usuário ligar o recurso. `<input type="file" accept="image/*">` do ERP funciona: câmera e galeria nativas.

### Segurança
- HTTPS obrigatório (`cleartext: false`, `usesCleartextTraffic=false`, `network_security_config.xml`, ATS padrão no iOS sem exceções).
- Validação SSL intacta: erro de certificado **nunca** prossegue e mostra a tela "Sem conexão".
- Só domínios de `ALLOWED_HOSTS` carregam na WebView. A bridge só existe na origem do ERP, e `window.EscaleApp` é imutável.
- Nenhum token, senha ou segredo no código. Os logs só existem em build de debug e nunca incluem query string.
- `intent:` do Android é sanitizado: só atividades públicas `BROWSABLE`.

---

## 6. API JavaScript para o ERP (`window.EscaleApp`)

Existe **somente dentro do app**. Todas as funções são assíncronas, **nunca rejeitam** e devolvem:

```js
{ success: true,  data: { ... } }
{ success: false, error: 'mensagem legível', code: 'cancelled' | 'permission_denied' | 'not_available' | 'not_configured' | 'invalid_argument' | 'network_error' | 'unknown' }
```

### Detectar o app

```js
if (window.EscaleApp?.native) {
  // comportamento específico do aplicativo
  document.body.classList.add('no-app');
}
window.EscaleApp.platform   // 'android' | 'ios'
window.isNativeApp          // true
window.isOnline             // true/false, sempre atualizado
```

No **servidor** (Blade/Controller), o User-Agent traz `EscaleMaisApp/<versão>`:

```php
$isApp = str_contains(request()->userAgent() ?? '', 'EscaleMaisApp');
```

O `<html>` recebe a classe `escale-native-app`, útil para CSS específico do app:

```css
.escale-native-app .banner-baixe-o-app { display: none; }
```

### Métodos

| Método | Retorno em `data` |
|---|---|
| `getPlatform()` | `{ platform, native }` |
| `getAppInfo()` | `{ name, version, build, platform, bridgeVersion }` |
| `getNetworkStatus()` | `{ connected, connectionType }` |
| `share({ title, text, url, files? })` | `{ activityType? }`. `files` aceita `File`, `Blob`, `{ name, base64, mimeType }` ou URL do ERP |
| `takePhoto({ source?, quality?, maxSize?, front?, input?, filename? })` | `{ file: File, dataUrl, mimeType, size }` |
| `camera(...)` | alias de `takePhoto` |
| `scanBarcode({ formats?, instructions?, front? })` | `{ value, format }` (e `value` também no topo) |
| `download(url, { filename?, action? })` | `{ name, mimeType, size }`. `action`: `'ask'` (padrão), `'view'`, `'share'` ou `'save'` |
| `openFile(blob, { filename?, action? })` | `{ name }` (mesmo menu para arquivos gerados no navegador) |
| `print()` | `{}` |
| `openExternal(url)` | `{}` |
| `setStatusBar({ color, style? } \| null)` | `{}`. `style` é o tom do fundo: `'dark'` = ícones claros |
| `setOrientation('portrait' \| 'landscape' \| 'any')` | `{}` |
| `registerPush()` | hoje sempre `code: 'not_configured'` (ver §11) |
| `hideSplash()` | `{}` |

### Exemplos

```js
// Compartilhar orçamento
await EscaleApp.share({ title: 'Orçamento', text: 'Segue o orçamento', url: 'https://erp.escalemais.com/...' });

// PDV: ler código de barras
const r = await EscaleApp.scanBarcode({ formats: ['EAN_13', 'EAN_8', 'CODE_128', 'QR_CODE'] });
if (r.success) buscarProduto(r.value);
else if (r.code !== 'cancelled') alert(r.error);

// Foto de produto direto num <input type="file"> já existente
await EscaleApp.takePhoto({ source: 'prompt', input: '#foto-produto' });

// Foto para upload manual
const foto = await EscaleApp.takePhoto();
if (foto.success) { const fd = new FormData(); fd.append('foto', foto.data.file); /* fetch… */ }

// Baixar e já abrir o compartilhamento
await EscaleApp.download('/proprietario/orcamentos/5/pdf', { action: 'share' });
```

### Eventos no `window`

| Evento | `detail` | Quando |
|---|---|---|
| `escaleAppReady` | `{ platform, bridgeVersion }` | bridge instalada na página |
| `networkStatusChanged` | `{ connected, connectionType }` | conexão mudou |
| `keyboardChanged` | `{ open, height }` | teclado abriu/fechou |
| `escale:backbutton` | `{ canGoBack }` | botão voltar (Android). `preventDefault()` assume o controle |
| `beforeprint` / `afterprint` | — | impressão nativa |

```js
window.addEventListener('networkStatusChanged', (e) => {
  if (!e.detail.connected) mostrarAvisoOffline();
});

// Fechar modal com o voltar do Android
window.addEventListener('escale:backbutton', (e) => {
  if (modalAberto) { e.preventDefault(); fecharModal(); }
});
```

### Evoluir a API
1. Crie ou edite o módulo em `src/native/`.
2. Exponha a função em `src/native/appBridge.ts` (interface `EscaleAppApi` + implementação com `attempt(...)`).
3. Se precisar de código nativo novo, prefira um plugin oficial. Se não houver, adicione um método ao `EscaleNative` nas duas plataformas e em `src/native/escaleNative.ts`.
4. `npm run sync`. Mudanças só no TS exigem nova versão do app, porque a bridge vai dentro do binário.

---

## 7. Desenvolvimento e depuração

- **Inspecionar a WebView**
  - Android: `chrome://inspect` no Chrome do computador, com o aparelho/emulador em debug.
  - iOS: Safari › Desenvolvedor › [aparelho] › Escale Mais (build de debug).
- **Logs da bridge** (`[EscaleApp]`) só aparecem em debug.
- **Apontar para outro servidor** (homologação): altere `ERP_ORIGIN` e `ALLOWED_HOSTS` em `src/config/urls.ts` e `@string/erp_host` em `android/app/src/main/res/values/strings.xml`, depois `npm run sync`. O servidor precisa de **HTTPS válido**; para Laravel local, use um túnel HTTPS (ngrok, Cloudflare Tunnel).
- **Bridge com sourcemap:** `npm run build -- --dev && npx cap sync`.

---

## 8. Android: configuração e build

Identificador: `com.escalemais.erp` · minSdk 26 (Android 8.0, exigido pelo leitor de código de barras) · target/compileSdk 36 · Java 21.

### Rodar
```bash
npm run sync
npx cap open android      # ▶ Run no Android Studio (emulador ou aparelho)
# ou: npx cap run android
```

### Build de release (AAB para a Play Store)
1. Crie a chave de upload (uma vez) e **guarde-a em local seguro**, fora do repositório:
   ```bash
   keytool -genkey -v -keystore escalemais-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias escalemais
   ```
2. Crie `android/keystore.properties` (já está no `.gitignore`):
   ```properties
   storeFile=/caminho/absoluto/escalemais-upload.jks
   storePassword=...
   keyAlias=escalemais
   keyPassword=...
   ```
3. Aumente `versionCode` (e ajuste `versionName`) em `android/app/build.gradle`.
4. Gere o bundle:
   ```bash
   npm run sync
   cd android && ./gradlew bundleRelease
   # saída: android/app/build/outputs/bundle/release/app-release.aab
   ```
   Pelo Android Studio: *Build › Generate Signed App Bundle*.
5. No Play Console, ative a **Assinatura de apps do Google Play**.

---

## 9. iOS: configuração e build

Bundle ID: `com.escalemais.erp` · iOS 15+ · iPhone e iPad · Swift Package Manager.

### Primeira configuração no Xcode
1. `npm run sync && npx cap open ios`
2. Target **App › Signing & Capabilities**: escolha o **Team** e mantenha *Automatically manage signing*.
3. A capability **Associated Domains** já está em `App.entitlements` (`applinks:` e `webcredentials:erp.escalemais.com`). Com assinatura automática, o Xcode registra a capability no App ID.
   > Com um *Personal Team* (conta gratuita), Associated Domains não é suportado. Para testar assim, remova temporariamente a capability.
4. Versão: *General › Identity* (`MARKETING_VERSION` 1.0.0 / `CURRENT_PROJECT_VERSION` 1). Aumente o *Build* a cada envio.

### Rodar
```bash
npx cap run ios          # ou ▶ no Xcode
```

### Build de release (App Store / TestFlight)
1. Selecione *Any iOS Device (arm64)*.
2. *Product › Archive* e depois *Distribute App › App Store Connect › Upload*.
3. Libere no TestFlight e, em seguida, envie para revisão.

`ITSAppUsesNonExemptEncryption = false` já está no `Info.plist`: o app só usa HTTPS padrão, então não há documentação de exportação a enviar.

---

## 10. Deep links (Universal Links / App Links)

A parte do app está pronta:
- **Android:** `intent-filter` com `autoVerify` para `https://erp.escalemais.com` (`/proprietario/`, `/colaborador/`, `/admin/`, `/login`).
- **iOS:** Associated Domains `applinks:erp.escalemais.com`.
- **Esquema próprio**, que funciona sem configurar o servidor: `escalemais://proprietario/vendas/123`.
- A bridge recebe o link (app aberto ou fechado) e navega até a tela. Sem login, o Laravel manda ao `/login` e depois à tela pretendida.

Falta **publicar dois arquivos no servidor do ERP**, sem redirect, com HTTPS e `Content-Type: application/json`:

| Arquivo (modelo em `well-known/`) | Publicar em | Preencher |
|---|---|---|
| `assetlinks.json` | `https://erp.escalemais.com/.well-known/assetlinks.json` | SHA-256 da chave de assinatura do **Google Play** (Play Console › Integridade do app) |
| `apple-app-site-association` (sem extensão) | `https://erp.escalemais.com/.well-known/apple-app-site-association` | `TEAMID` (Apple Developer › Membership) |

No Laravel, basta colocar os arquivos em `public/.well-known/`. Essa é uma mudança no ERP e por isso **não foi feita aqui**.

---

## 11. Push notifications (preparado)

A API `EscaleApp.registerPush()` já existe e responde `not_configured`. Para ativar:

1. `npm i @capacitor/push-notifications && npx cap sync`
2. **Android:** crie o app no Firebase e coloque `google-services.json` em `android/app/`. O `build.gradle` já aplica o plugin quando o arquivo existe.
3. **iOS:** no Xcode, adicione as capabilities **Push Notifications** e **Background Modes › Remote notifications**. Envie a chave APNs (.p8) ao Firebase ou ao seu servidor de push.
4. Implemente `registerForPush()` em `src/native/push.ts`: `PushNotifications.requestPermissions()` + `register()` + listener `registration`, e envie o token ao Laravel numa rota autenticada (a sessão já está no cookie).
5. Peça a permissão **só quando o usuário ativar notificações no ERP**.

Câmera e scanner já estão instalados e funcionais (`takePhoto`, `scanBarcode`). A integração com o PDV é só chamar a API.

---

## 12. Checklist antes de publicar nas lojas

**Identidade e contas**
- [ ] Confirmar o identificador `com.escalemais.erp`. Ele não pode mudar depois da publicação, e o formato é válido nas duas lojas.
- [ ] Contas: Apple Developer Program (organização, com D-U-N-S) e Google Play Console (organização).
- [ ] Nome na loja: "ERP Escale Mais" (loja) / "Escale Mais" (ícone).

**Revisão (Apple 4.2 / Google)**
- [ ] **Conta de demonstração** com dados de exemplo, informada **só nos painéis** (App Store Connect › App Review Information; Play Console › Acesso ao app). Nada fica no código.
- [ ] Nas notas de revisão, destacar os recursos nativos: impressão nativa, leitor de código de barras, câmera, compartilhamento/visualização de arquivos, status offline e deep links. Isso ajuda com a regra 4.2 (funcionalidade mínima).
- [ ] **Assinaturas (Apple 3.1.1 / Google Payments):** se o app permitir contratar ou alterar plano, decidir a política. Opções: esconder no app (`EscaleApp.native`), abrir fora ou bloquear (`RESTRICTED_ROUTES`). Não deve haver botão de compra digital fora do IAP no iOS.
- [ ] **Exclusão de conta (Apple 5.1.1(v)):** se for possível criar conta pelo app, o ERP precisa oferecer excluir a conta pelo app.

**Privacidade**
- [ ] URL da **Política de Privacidade** (obrigatória nas duas lojas).
- [ ] App Store: "Privacy Nutrition Labels". Google: formulário **Data safety** (o ERP coleta dados de clientes, vendas, etc.).
- [ ] iOS: avaliar um `PrivacyInfo.xcprivacy` do app. Os plugins já trazem os seus, e o código do app não usa APIs de "required reason".

**Técnico**
- [ ] Publicar `assetlinks.json` e `apple-app-site-association` (§10).
- [ ] Keystore Android e credenciais Apple guardadas com segurança.
- [ ] Testar em aparelhos reais: login persistente após fechar, DANFE (visualizar/compartilhar/salvar/imprimir), exportação de NF-e, foto de produto, scanner no PDV, modo avião (tela "Sem conexão" + volta automática), troca de tema, rotação, teclado no PDV.
- [ ] Screenshots (iPhone 6,9" e 6,5"; iPad 13"; Android telefone/tablet) e ícone 512×512 da Play Store (`resources/icon.png`).

---

## 13. Limitações conhecidas e pendências

- **O que já foi validado:**
  - **Android:** `assembleDebug` compilou e o app rodou no emulador (Android 16, WebView 133) contra o ERP real. Foram verificados: splash, login, `window.EscaleApp` ativo, User-Agent `EscaleMaisApp`, status bar com a cor do ERP, tela "Sem conexão" e volta automática ao reconectar, link externo abrindo fora do app, e voltar duplo para sair.
  - **Bridge:** 42 verificações automatizadas num DOM simulado (links, downloads, `window.open`, impressão, rede, voltar, scanner, formato de retorno, bloqueio em outros domínios).
- **O que ainda NÃO foi validado:**
  - **iOS:** não compilado (licença do Xcode não aceita na máquina de desenvolvimento). O Swift passou só na checagem de sintaxe. O primeiro build no Xcode e o teste em iPhone são pendência.
  - **Android, em aparelho físico:** downloads e "Salvar", impressão, câmera e scanner.
- Downloads por **POST no Android** só funcionam nas rotas de `POST_DOWNLOAD_PATHS` ou em formulários com `data-escale-download`.
- A impressão de `iframe` usa uma WebView separada, sem JavaScript: o conteúdo precisa estar pronto no HTML.
- `target="_blank"` de formulário POST no iOS abre na mesma WebView, mas o WebKit pode não reenviar o corpo do POST.
- "Continuar offline" depende de o ERP expor uma rota offline (`plugins.EscaleNative.offlineUrl`).
- `npm audit` aponta 3 alertas moderados no `@capacitor/cli` (dependência `uuid` do pacote `xcode`). É ferramenta de build e não vai para o app.
