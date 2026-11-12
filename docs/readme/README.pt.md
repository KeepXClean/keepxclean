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

**KeepXClean** filtra spam, bots de respostas, perfis falsos que imitam o autor, iscas de engajamento, golpes cripto e anúncios promovidos no X (`x.com`) em menos de **1 ms** diretamente no navegador, sem acessar credenciais e mantendo rolagem fluida a 60/120 FPS.

<div align="center">

https://github.com/user-attachments/assets/744a6b36-b6b5-4933-b22a-6471c5741ea7

</div>

## Destaques

- **Motor Determinístico Local (`< 1ms`)**: Avalia em memória as respostas GraphQL já entregues pelo X ao navegador — zero login e zero chamadas extras à API do X.
- **Defesa Multidimensional**: Bloqueia bots verificados de respostas curtas, imitadores do autor, sorteios falsos, postagens em massa, excesso de hashtags, **24 regras públicas integradas**, filtro de idiomas e remoção de anúncios.
- **Barra Recolhida ou Ocultação Silenciosa + Penetração em Citações**: Recolha posts interceptados em uma barra inspecionável de linha única ou oculte-os totalmente; citações feitas por contas seguidas apontam com precisão para o spammer citado.
- **Janela de Desfazer de 4,5 s e Feedback Transparente**: Bloqueio local imediato com **4,5 segundos para desfazer**, seguido opcionalmente de bloqueio nativo no X e voto comunitário anônimo `SHA-256` com sal (`1 conta = 1 voto`, proteção `5×` para perfis ≥50 mil seguidores).
- **10 Idiomas Nativos**: Português, inglês, chinês (simplificado/tradicional), japonês, coreano, espanhol, francês, alemão e russo.

## Instalação

### Opção 1: Chrome Web Store (Recomendado)

Instale em 1 clique pela [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatível com Chrome, Edge, Brave, Arc e navegadores Chromium desktop).

### Opção 2: Instalação Manual (`.zip`)

1. Baixe o arquivo `keepxcleanextension-*-chrome.zip` mais recente em [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) e descompacte-o.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída.

## Privacidade e Segurança

- **Zero Credenciais**: Nunca lê senhas, cookies, tokens de autenticação, e-mails ou mensagens diretas (DMs).
- **Zero Telemetria**: Sem SDKs de análise de terceiros ou rastreadores de anúncios.
- Leia a [**Política de Privacidade**](https://keepxclean.com/privacy/) completa.

## Estrutura do Repositório e Desenvolvimento

```text
packages/shared/   Motor determinístico, parser GraphQL do X, 24 regras públicas e i18n
apps/extension/    Extensão WXT (Manifest V3), interface Shadow DOM e tarefas de fundo
apps/server/       API Cloudflare Workers, agregação D1 e cache R2
apps/web/          Site oficial e simulador interativo (keepxclean.com)
tests/e2e/         Suíte de testes E2E e adversariais em 5 camadas
```

Requer **Node.js ≥ 20** e **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Iniciar extensão em modo de desenvolvimento
pnpm typecheck    # Verificação de tipos TypeScript
pnpm test         # Executar testes unitários e de integração
pnpm test:e2e     # Executar suíte E2E de 5 camadas
pnpm build        # Build de produção
```

Para auto-hospedagem e CI/CD, consulte [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor e Licença

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licença**: Distribuído sob a [Licença MIT](../../LICENSE). Projeto independente de código aberto, sem vínculo com a X Corp.
