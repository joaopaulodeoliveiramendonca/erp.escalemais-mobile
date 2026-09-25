Quero que você desenvolva um aplicativo mobile para **Android e iOS** do ERP Escale Mais, utilizando **Capacitor** como container nativo e carregando inicialmente o sistema web existente:

**URL de login:**
https://erp.escalemais.com/login

O ERP já possui uma interface responsiva específica para mobile. Portanto, **não quero reconstruir o ERP em Flutter, React Native ou criar uma nova interface do zero**.

O objetivo é criar um aplicativo híbrido profissional, utilizando o sistema web existente dentro de uma WebView, mas adicionando uma camada nativa para que a experiência seja semelhante à de um aplicativo nativo e esteja preparada para publicação na **Google Play Store e Apple App Store**.

## Objetivo da arquitetura

A estrutura deve ser aproximadamente:

```text
Aplicativo Capacitor
│
├── Splash Screen nativa
├── Status Bar
├── Safe Area iOS
├── Controle do botão voltar Android
├── Controle de teclado
├── Detecção de conexão
├── Compartilhamento nativo
├── Downloads/arquivos
├── Deep Links
├── Push Notifications futuramente
├── Scanner de código de barras futuramente
│
└── WebView
     │
     └── https://erp.escalemais.com/login
```

O sistema Laravel continuará sendo responsável por:

```text
Login
Dashboard
PDV
Produtos
Clientes
Vendas
Orçamentos
Ordens de Serviço
Financeiro
Estoque
Fiscal
Relatórios
Configurações
e demais módulos
```

Não quero duplicar regras de negócio no aplicativo.

---

# 1. TECNOLOGIAS

Utilize:

* Capacitor na versão estável mais atual
* TypeScript
* Android Studio para Android
* Xcode para iOS
* WebView do Capacitor
* Plugins oficiais do Capacitor sempre que possível

Estruture o projeto de maneira organizada e preparada para manutenção.

---

# 2. URL PRINCIPAL

Quando o aplicativo for aberto, deverá carregar:

```text
https://erp.escalemais.com/login
```

Depois que o usuário fizer login, toda a navegação dentro de:

```text
https://erp.escalemais.com/
```

deve continuar dentro do aplicativo.

Não abrir páginas internas do ERP no navegador externo.

---

# 3. LINKS EXTERNOS

Links externos devem ser tratados corretamente.

Por exemplo:

```text
https://erp.escalemais.com/*
```

deve permanecer dentro do aplicativo.

Mas links externos como:

```text
https://youtube.com
https://wa.me
https://api.whatsapp.com
https://instagram.com
```

podem ser abertos no aplicativo correspondente ou navegador externo.

Criar uma regra centralizada para identificar URLs internas e externas.

---

# 4. EXPERIÊNCIA NATIVA

Embora o conteúdo principal seja WebView, quero que o aplicativo tenha comportamento nativo.

Implementar:

### Splash Screen

Criar splash screen utilizando a identidade do Escale Mais.

Enquanto a aplicação estiver carregando, não mostrar tela branca.

A splash só deverá desaparecer quando a WebView estiver pronta.

---

### Status Bar

Configurar corretamente:

* Android
* iOS
* tema claro
* tema escuro

A status bar deve combinar com a interface do ERP.

---

### Safe Area no iOS

Garantir compatibilidade com:

* notch
* Dynamic Island
* barra inferior do iPhone

Nenhum botão do ERP poderá ficar escondido atrás dessas áreas.

Adicionar tratamento de:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
env(safe-area-inset-left)
env(safe-area-inset-right)
```

caso necessário.

---

# 5. BOTÃO VOLTAR DO ANDROID

Implementar comportamento correto para o botão físico/gesto de voltar.

Regra:

```text
Se existir histórico dentro da WebView:
    voltar para a página anterior.

Se estiver na primeira página:
    não fechar imediatamente.

Se o usuário pressionar voltar novamente:
    permitir sair do aplicativo.
```

Evitar comportamento onde o botão voltar fecha o app inesperadamente.

---

# 6. LOGIN E SESSÃO

A sessão do Laravel deve permanecer salva.

O usuário não deve precisar fazer login toda vez que abrir o aplicativo.

Cookies, sessão e armazenamento local devem continuar funcionando normalmente.

Dar suporte a:

```text
cookies
localStorage
sessionStorage
IndexedDB
```

Não limpar dados da WebView ao fechar o aplicativo.

---

# 7. OFFLINE

O ERP possui funcionalidades que futuramente poderão operar offline.

Preparar o aplicativo para detectar:

```text
ONLINE
OFFLINE
```

Quando ficar offline, disponibilizar essa informação para o JavaScript da aplicação web.

Por exemplo:

```javascript
window.isNativeApp
window.isOnline
```

ou através de uma bridge própria.

Também quero que seja possível disparar eventos:

```javascript
window.dispatchEvent(
    new CustomEvent('networkStatusChanged', {
        detail: {
            connected: true
        }
    })
);
```

Assim o Laravel/JavaScript do ERP poderá reagir à mudança de conexão.

---

# 8. IDENTIFICAÇÃO DO APP

Quero que a aplicação web consiga detectar quando está sendo executada dentro do aplicativo.

Criar uma forma segura de identificar:

```javascript
window.EscaleApp = {
    native: true,
    platform: 'android'
}
```

ou:

```javascript
window.EscaleApp = {
    native: true,
    platform: 'ios'
}
```

Isso será usado para alterar partes da interface.

Exemplo:

```javascript
if (window.EscaleApp?.native) {
    // comportamento específico do aplicativo
}
```

---

# 9. DOWNLOAD DE ARQUIVOS

O ERP gera arquivos como:

```text
PDF
XML
CSV
relatórios
DANFE
orçamentos
comprovantes
```

Garantir que downloads funcionem corretamente dentro do aplicativo.

Ao clicar em um PDF, por exemplo, permitir:

```text
Visualizar
Compartilhar
Salvar
```

utilizando recursos nativos quando apropriado.

Não deixar o download simplesmente desaparecer dentro da WebView.

---

# 10. COMPARTILHAMENTO NATIVO

Criar uma bridge para que a aplicação web possa executar algo parecido com:

```javascript
window.EscaleApp.share({
    title: 'Orçamento',
    text: 'Segue o orçamento',
    url: 'https://...'
});
```

E o Capacitor deverá abrir o compartilhamento nativo do Android/iOS.

Isso poderá ser usado para:

```text
WhatsApp
E-mail
Telegram
Drive
etc.
```

---

# 11. CÂMERA

Preparar integração nativa de câmera.

A aplicação web deverá futuramente poder solicitar:

```javascript
window.EscaleApp.camera();
```

Isso será usado, por exemplo, para:

```text
foto de produto
anexo de ordem de serviço
documentos
comprovantes
```

Caso algum `<input type="file" accept="image/*">` já exista no ERP, garantir que funcione corretamente.

---

# 12. LEITOR DE CÓDIGO DE BARRAS

Preparar arquitetura para scanner nativo de:

```text
EAN-8
EAN-13
Code 128
QR Code
```

A ideia futura é o PDV poder chamar:

```javascript
window.EscaleApp.scanBarcode();
```

e receber:

```javascript
{
    success: true,
    value: "7891234567890"
}
```

Não é necessário construir toda a integração do PDV agora se isso aumentar muito a complexidade, mas deixar a arquitetura preparada.

---

# 13. PERMISSÕES

Gerenciar permissões corretamente.

Não solicitar todas as permissões na inicialização.

Solicitar apenas quando o usuário utilizar determinada funcionalidade.

Exemplo:

```text
Câmera
→ solicitar somente quando scanner ou câmera forem utilizados.

Notificações
→ solicitar quando o recurso for ativado.
```

---

# 14. TECLADO MOBILE

O teclado não deve quebrar layouts, modais ou campos.

Tratar corretamente:

```text
inputs
textareas
selects
modais
PDV
busca de produtos
```

Ao abrir o teclado:

* não esconder o campo selecionado;
* não deixar botões importantes inacessíveis;
* permitir scroll correto.

---

# 15. PULL TO REFRESH

Não quero o comportamento padrão de puxar a tela e atualizar acidentalmente caso isso prejudique o ERP.

Avaliar e, se necessário, desabilitar pull-to-refresh globalmente.

Se for implementado, deve funcionar somente onde fizer sentido.

---

# 16. GESTOS

Evitar gestos que possam conflitar com o ERP.

Principalmente:

```text
swipe lateral
zoom acidental
overscroll
seleção de texto desnecessária
```

Não bloquear recursos de acessibilidade.

---

# 17. DEEP LINKS

Preparar suporte para links como:

```text
https://erp.escalemais.com/vendas/123
https://erp.escalemais.com/orcamentos/50
https://erp.escalemais.com/produtos/20
```

Se o usuário clicar nesses links fora do aplicativo e tiver o app instalado, futuramente queremos conseguir abrir diretamente a tela correspondente no aplicativo.

Deixar Universal Links/App Links preparados estruturalmente.

---

# 18. SEGURANÇA

A aplicação é um ERP empresarial.

Implementar boas práticas:

* HTTPS obrigatório;
* não permitir carregamento HTTP;
* não desabilitar validação SSL;
* não permitir navegação para domínios desconhecidos dentro da WebView;
* impedir execução arbitrária de JavaScript externo;
* não armazenar senha manualmente;
* utilizar sessão/cookies do Laravel;
* não colocar tokens ou secrets dentro do código do aplicativo;
* evitar logs contendo informações sensíveis.

Criar lista permitida de domínios.

Inicialmente:

```text
erp.escalemais.com
```

Adicionar outros somente quando necessário.

---

# 19. ORIENTAÇÃO DA TELA

O aplicativo será utilizado principalmente na vertical.

Configurar preferência por:

```text
portrait
```

Porém avaliar se determinadas telas como PDV ou relatórios podem funcionar em landscape.

Não quebrar caso o dispositivo seja rotacionado.

---

# 20. NAVEGAÇÃO

A navegação mobile do próprio ERP já é responsável pelos módulos.

Portanto, não quero duplicar menu nativo no Capacitor inicialmente.

A WebView continuará mostrando a interface responsiva existente.

O Capacitor ficará responsável principalmente pela camada do dispositivo.

---

# 21. ATUALIZAÇÕES DO ERP

Uma das vantagens que quero preservar é que alterações realizadas no Laravel sejam imediatamente refletidas no aplicativo.

Portanto:

```text
Laravel atualizado
↓
usuário abre novamente a tela
↓
nova interface disponível
```

Não quero precisar publicar uma atualização na Play Store/App Store a cada pequena alteração de interface ou regra do ERP.

As funcionalidades nativas, porém, continuarão sendo versionadas pelo aplicativo.

---

# 22. ERROS DE CONEXÃO

Não mostrar página padrão feia de erro do WebView.

Se:

```text
erp.escalemais.com
```

não puder ser carregado, mostrar uma tela amigável do aplicativo:

```text
Sem conexão

Não foi possível conectar ao Escale Mais.

Verifique sua conexão com a internet.

[Tentar novamente]
```

Se houver funcionalidades offline disponíveis futuramente:

```text
[Continuar offline]
```

---

# 23. LOADING ENTRE NAVEGAÇÕES

Não mostrar splash toda vez que trocar de página.

A splash é somente para abertura inicial.

Durante navegações normais, deixar o próprio ERP controlar seus loaders.

---

# 24. APP STORE / PLAY STORE

Quero que o projeto seja construído considerando publicação nas duas lojas.

Não tratar o projeto como simplesmente:

```text
WebView apontando para um site.
```

Apesar da WebView ser o núcleo do ERP, o app deve possuir camada nativa real e arquitetura preparada para funcionalidades nativas.

Evitar qualquer implementação conhecida por causar problemas de aprovação.

---

# 25. ASSINATURAS

Neste primeiro momento, o aplicativo será principalmente para usuários que já possuem conta.

Evitar adicionar pagamentos ou contratação de planos diretamente pela camada nativa.

O usuário deverá principalmente:

```text
abrir app
↓
fazer login
↓
usar ERP
```

Caso existam páginas de assinatura no sistema web, estruturar o projeto de forma que posteriormente possamos decidir como tratar essas rotas dependendo das políticas da Apple e Google.

---

# 26. CONTA DE DEMONSTRAÇÃO

O projeto deve estar preparado para enviarmos para as lojas uma conta de demonstração para revisão.

Não criar credenciais fixas dentro do código.

Apenas considerar que a equipe da Apple/Google poderá receber:

```text
E-mail de demonstração
Senha de demonstração
```

através do painel das lojas.

---

# 27. IDENTIDADE DO APP

Nome:

```text
Escale Mais
```

Nome completo quando necessário:

```text
ERP Escale Mais
```

Bundle/package sugerido:

```text
com.escalemais.erp
```

Antes de utilizar definitivamente, confirme se a nomenclatura está correta para Android e iOS.

---

# 28. ESTRUTURA DO CÓDIGO

Quero algo organizado aproximadamente assim:

```text
escalemais-mobile/

android/

ios/

src/
    native/
        appBridge.ts
        network.ts
        share.ts
        files.ts
        camera.ts
        scanner.ts

    config/
        urls.ts
        platform.ts

    utils/

capacitor.config.ts
package.json
README.md
```

Não precisa seguir exatamente essa estrutura se houver uma arquitetura melhor, mas quero separação clara das responsabilidades.

---

# 29. BRIDGE JAVASCRIPT

Criar uma API simples entre o site e a aplicação.

Quero conseguir evoluir para chamadas como:

```javascript
await window.EscaleApp.share(...);

await window.EscaleApp.scanBarcode();

await window.EscaleApp.takePhoto();

await window.EscaleApp.getNetworkStatus();

await window.EscaleApp.getPlatform();
```

Padronizar retornos:

```javascript
{
    success: true,
    data: {}
}
```

ou:

```javascript
{
    success: false,
    error: "..."
}
```

Não espalhar integrações diretamente pelo código.

Criar uma bridge centralizada.

---

# 30. DESENVOLVIMENTO

Quero que você:

1. Analise o melhor formato de criar esse projeto.
2. Crie a estrutura completa.
3. Instale/configure as dependências necessárias.
4. Configure Capacitor.
5. Configure Android.
6. Configure iOS.
7. Implemente a WebView apontando para o ERP.
8. Implemente tratamento de navegação.
9. Implemente links externos.
10. Implemente botão voltar Android.
11. Implemente safe area.
12. Implemente detecção de conexão.
13. Implemente tratamento amigável de erro.
14. Implemente compartilhamento.
15. Implemente downloads/arquivos.
16. Implemente a bridge JavaScript.
17. Deixe scanner/câmera/push preparados para evolução.
18. Documente como rodar.
19. Documente como gerar build Android.
20. Documente como gerar build iOS.

Não quero somente uma explicação teórica.

Quero que você efetivamente crie os arquivos e código necessários.

---

# 31. IMPORTANTE

Antes de alterar qualquer arquivo existente:

* analise o projeto atual;
* verifique versões instaladas;
* não remova funcionalidades existentes;
* não altere o ERP Laravel;
* faça mudanças somente no projeto mobile;
* utilize APIs oficiais e atuais;
* evite plugins abandonados;
* prefira plugins oficiais do Capacitor.

Se alguma implementação for diferente entre Android e iOS, crie abstração para manter a mesma API JavaScript.

---

# 32. RESULTADO ESPERADO

Ao final quero conseguir executar:

```bash
npm install
npm run build
npx cap sync
```

e depois:

```bash
npx cap open android
```

para abrir no Android Studio.

E:

```bash
npx cap open ios
```

para abrir no Xcode.

O aplicativo deverá abrir o ERP Escale Mais diretamente em:

```text
https://erp.escalemais.com/login
```

com aparência e comportamento de aplicativo mobile, mantendo o sistema Laravel como núcleo da aplicação.

Também crie um `README.md` explicando toda a arquitetura, instalação, desenvolvimento, configuração do Android, configuração do iOS, geração das builds e os pontos que ainda precisam ser configurados antes da publicação nas lojas.
