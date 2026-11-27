<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Extensão local-first de alto sinal para filtrar timeline e respostas no X (Twitter)</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Adicionar_ao_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=pt"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <a href="../../README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.ja.md">日本語</a> ·
    <a href="./README.ko.md">한국어</a> ·
    <a href="./README.es.md">Español</a> ·
    <strong>Português</strong> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** filtra spam, bots de respostas, perfis falsos que imitam o autor, iscas de engajamento, golpes cripto e anúncios promovidos no X (`x.com`) em menos de **1 ms** diretamente no navegador, com operações opcionais na conta X e mantendo rolagem fluida a 60/120 FPS.

<div align="center">

<a href="https://keepxclean.com/?lang=pt#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="Prévia do vídeo promocional de 30 segundos do KeepXClean" />
  </a>
  <p><a href="https://keepxclean.com/?lang=pt#video"><strong>▶ Assistir ao vídeo promocional de 30 segundos em keepxclean.com</strong></a></p>

</div>

## Destaques

- **Motor Determinístico Local (`< 1ms`) e Autoverificação de Análise**: Avalia em memória as respostas GraphQL já entregues pelo X ao navegador com zero novas permissões (`storage` + `alarms`), zero login e autoverificação local de saúde GraphQL (resumo diagnóstico sem dados sensíveis, recuperação automática e zero telemetria).
- **Defesa Multidimensional**: Bloqueia bots verificados de respostas curtas, **respostas duplicadas no mesmo tópico** (mantém a 1.ª cópia), **proteção oficial do `@grok` e filtro opcional de invocações curtas**, imitadores do autor, sorteios falsos, postagens em massa, **filtro estruturado de domínios externos**, **pacotes públicos em 10 idiomas (45 regras integradas)**, **pacotes de regras offline `.kxc-pack.json`**, filtro de idiomas e remoção de anúncios.
- **Modos por Cena, Atalhos na Barra Recolhida e Penetração em Citações**: Distingue **Para você** e **Seguindo** com modos por cena (`inherit` / `collapse` / `strip` / `bypass`), penetração em citações e botões na barra expandida para ajustar a regra acionada ou desativar o item em um clique.
- **Início Rápido, Estatísticas por Regra e Sincronização Opcional**: Cartão de início rápido não intrusivo, estatísticas por regra + tendência de 7 dias + **relatório PNG local via Canvas 2D** (zero PII), **janela de desfazer de 4,5 s** e **sincronização opcional `chrome.storage.sync`** (desativada por padrão; listas de bloqueio locais e registros permanecem no dispositivo).
- **10 Idiomas Nativos e Chrome / Firefox MV3**: Português, inglês, chinês (simplificado/tradicional), japonês, coreano, espanhol, francês, alemão e russo.

## Instalação

### Opção 1: Chrome Web Store (Recomendado)

Instale em 1 clique pela [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatível com Chrome, Edge, Brave, Arc e navegadores Chromium desktop).

### Opção 2: Instalação Manual (`.zip`)

1. Baixe o arquivo `keepxcleanextension-*-chrome.zip` mais recente em [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) e descompacte-o.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída.

## Privacidade e Segurança

- O KeepXClean não solicita senhas nem mensagens privadas. Lê cookies do X localmente para identificar a conta e executar operações solicitadas pelo usuário. Cookies de sessão e valores de autorização são usados apenas com o X, nunca enviados aos servidores do KeepXClean. Consulte a política de privacidade sobre denúncias comunitárias opcionais.
- **Padrões Opt-In e Listas Locais**: Em instalações novas, `syncNativeXBlock`, `enableCrowdReport` e a sincronização opcional (`chrome.storage.sync`) começam **desativados**; a sincronização exclui listas locais de bloqueio e registros, e o autodiagnóstico não envia telemetria nem PII.
- **Zero Telemetria**: Sem SDKs de análise de terceiros ou rastreadores de anúncios.
- Leia a [**Política de Privacidade**](https://keepxclean.com/privacy/) completa.

## Estrutura do Repositório e Desenvolvimento

```text
packages/shared/   Motor determinístico, parser GraphQL do X, pacotes públicos em 10 idiomas (45 regras), validador offline e i18n
apps/extension/    Extensão WXT (Manifest V3 — Chrome e Firefox), interface Shadow DOM, relatório Canvas 2D e tarefas de fundo
apps/server/       API Cloudflare Workers, agregação D1, cache de snapshot e CLI cloud-rules
apps/web/          Site oficial e simulador interativo (keepxclean.com)
tests/e2e/         Suíte de testes E2E e adversariais em 5 camadas
tests/browser-e2e/ Suíte E2E real da extensão MV3 no Chromium
```

Requer **Node.js ≥ 20** e **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Iniciar extensão em modo de desenvolvimento
pnpm lint         # Executar ESLint em todo o workspace
pnpm typecheck    # Verificação de tipos TypeScript
pnpm test         # Executar testes unitários e de integração
pnpm test:e2e     # Executar suíte E2E de 5 camadas
pnpm build        # Build de produção
pnpm test:browser # Executar testes E2E reais no Chromium MV3
```

Consulte o histórico de versões em [CHANGELOG.md](../../CHANGELOG.md). Para auto-hospedagem e CI/CD, consulte [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor e Licença

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licença**: Distribuído sob a [Licença MIT](../../LICENSE). Projeto independente de código aberto, sem vínculo com a X Corp.
