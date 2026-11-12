<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Local-First Browser-Erweiterung für eine saubere High-Signal-Timeline &amp; Antworten auf X (Twitter)</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Hinzufügen-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=de"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
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
    <a href="./README.pt.md">Português</a> ·
    <a href="./README.fr.md">Français</a> ·
    <strong>Deutsch</strong> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** filtert Spam, Antwort-Bots, Nachahmer-Konten, Engagement-Köder, Krypto-Shilling und gesponserte Anzeigen auf X (`x.com`) in unter **1 ms** direkt lokal im Browser — ohne Kontozugriff und bei flüssigen 60/120 FPS.

<div align="center">

https://github.com/user-attachments/assets/744a6b36-b6b5-4933-b22a-6471c5741ea7

</div>

## Highlights

- **Local-First & `< 1ms` Deterministische Engine**: Wertet die von X bereits gesendeten GraphQL-Antworten direkt im Arbeitsspeicher aus — kein Login und keine zusätzlichen X-API-Abfragen.
- **Mehrstufiger Spamschutz**: Erkennt verifizierte Kurzantwort-Bots, OP-Nachahmer, Gewinnspiel-Köder, Massen-Poster, Hashtag-Überladung, **24 integrierte öffentliche Keyword-Regeln**, Sprachfilter und gesponserte Werbung.
- **Eingeklappte Leiste oder Stilles Ausblenden + Zitat-Durchdringung**: Gefilterte Beiträge als prüfbare Einzeiler-Leiste einklappen oder komplett entfernen; bei Zitaten durch gefolgte Konten wird gezielt der zitierte Spammer erfasst.
- **4,5 s Rückgängig-Fenster & Ehrliches 3-Phasen-Feedback**: Sofortige lokale Sperre mit **4,5 Sekunden Rückgängig-Option**, optional gefolgt von nativer X-Blockierung und anonymer gesalzener `SHA-256`-Community-Meldung (`1 Konto = 1 Stimme`, `5×` Schutzschwelle ab 50.000 Followern).
- **10 Native Oberflächensprachen**: Deutsch, Englisch, Chinesisch (Vereinfacht/Traditionell), Japanisch, Koreanisch, Spanisch, Portugiesisch, Französisch und Russisch.

## Installation

### Option 1: Chrome Web Store (Empfohlen)

Mit 1 Klick über den [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) installieren (kompatibel mit Chrome, Edge, Brave, Arc und weiteren Chromium-Desktop-Browsern).

### Option 2: Manuelles Laden (`.zip`)

1. Neueste `keepxcleanextension-*-chrome.zip` von [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) herunterladen und entpacken.
2. `chrome://extensions` öffnen und oben rechts den **Entwicklermodus** aktivieren.
3. Auf **Entpackte Erweiterung laden** klicken und den entpackten Ordner auswählen.

## Datenschutz & Sicherheit

- **Null Zugangsdaten**: Kein Zugriff auf Passwörter, Cookies, Auth-Tokens, E-Mails oder Direktnachrichten (DMs).
- **Null Telemetrie**: Keine Drittanbieter-Analyse-SDKs oder Werbe-Tracker.
- Vollständige [**Datenschutzerklärung**](https://keepxclean.com/privacy/).

## Projektstruktur & Entwicklung

```text
packages/shared/   Deterministische Regel-Engine, X-GraphQL-Parser, 24 Regeln & i18n
apps/extension/    WXT (Manifest V3) Browser-Erweiterung & Hintergrund-Jobs
apps/server/       Cloudflare Workers API, D1-Aggregation & R2-Snapshot-Cache
apps/web/          Offizielle Webseite & interaktive Browser-Sandbox (keepxclean.com)
tests/e2e/         5-stufige End-to-End- & Adversarial-Testsuite
```

Voraussetzungen: **Node.js ≥ 20** und **pnpm**

```bash
pnpm install
pnpm dev:ext      # Erweiterung im Entwicklungsmodus starten
pnpm typecheck    # TypeScript-Typprüfung
pnpm test         # Unit- und Integrationstests ausführen
pnpm test:e2e     # 5-stufige E2E-Testsuite ausführen
pnpm build        # Produktions-Build erstellen
```

Informationen zu Self-Hosting und CI/CD finden Sie unter [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor & Lizenz

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Lizenz**: Veröffentlicht unter der [MIT-Lizenz](../../LICENSE). Unabhängiges Open-Source-Projekt ohne Verbindung zu X Corp.
