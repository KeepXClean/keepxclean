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

**KeepXClean** filtert Spam, Antwort-Bots, Nachahmer-Konten, Engagement-Köder, Krypto-Shilling und gesponserte Anzeigen auf X (`x.com`) in unter **1 ms** direkt lokal im Browser — mit optionalen X-Kontoaktionen und bei flüssigen 60/120 FPS.

<div align="center">

<a href="https://keepxclean.com/?lang=de#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="Vorschau des 30-sekündigen KeepXClean-Promovideos" />
  </a>
  <p><a href="https://keepxclean.com/?lang=de#video"><strong>▶ 30-Sekunden-Promovideo auf keepxclean.com ansehen</strong></a></p>

</div>

## Highlights

- **Local-First, `< 1ms` Engine & Parse-Gesundheitscheck**: Wertet bereits empfangene X-GraphQL-Antworten ohne neue Berechtigungen (`storage` + `alarms`), ohne Login und mit lokalem GraphQL-Selbstcheck (redigierte Diagnose-Zusammenfassung, automatische Erholung, null Telemetrie) aus.
- **Mehrstufiger Spamschutz**: Erkennt verifizierte Kurzantwort-Bots, **kopierte Antwort-Duplikate im selben Thread** (behält die 1. Antwort), **offiziellen `@grok`-Schutz & optionalen Kurzaufruf-Filter**, OP-Nachahmer, Gewinnspiel-Köder, Massen-Poster, **strukturierten Filter für externe Domains**, **öffentliche 10-Sprachen-Keyword-Pakete (45 Regeln)**, **offline teilbare `.kxc-pack.json`-Regelpakete**, Sprachfilter und Werbung.
- **Szenenmodi, Direktlinks in der Klappleiste & Zitat-Durchdringung**: Unterscheidet **Für dich** und **Folge ich** (`inherit` / `collapse` / `strip` / `bypass`), durchdringt Zitate und erlaubt direkt aus der aufgeklappten Leiste das Anpassen der Regel oder Ein-Klick-Deaktivieren einzelner Treffer.
- **Schnellstart, Regel-Statistiken & Optionale Synchronisierung**: Unaufdringliche Schnellstart-Karte, Regel-Statistiken + 7-Tage-Trend + **lokaler Canvas-2D-PNG-Bericht** (null PII), **4,5 s Rückgängig-Fenster** und **optionale `chrome.storage.sync`-Synchronisierung** (standardmäßig AUS; lokale Sperrlisten und Protokolle bleiben auf dem Gerät).
- **10 Native Oberflächensprachen & Chrome / Firefox MV3**: Deutsch, Englisch, Chinesisch (Vereinfacht/Traditionell), Japanisch, Koreanisch, Spanisch, Portugiesisch, Französisch und Russisch.

## Installation

### Option 1: Chrome Web Store (Empfohlen)

Mit 1 Klick über den [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) installieren (kompatibel mit Chrome, Edge, Brave, Arc und weiteren Chromium-Desktop-Browsern).

### Option 2: Manuelles Laden (`.zip`)

1. Neueste `keepxcleanextension-*-chrome.zip` von [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) herunterladen und entpacken.
2. `chrome://extensions` öffnen und oben rechts den **Entwicklermodus** aktivieren.
3. Auf **Entpackte Erweiterung laden** klicken und den entpackten Ordner auswählen.

## Datenschutz & Sicherheit

- KeepXClean fordert keine Passwörter oder Direktnachrichten an. X-Cookies werden lokal zur Kontoerkennung und für vom Nutzer ausgelöste X-Aktionen gelesen. Sitzungscookies und Autorisierungswerte werden nur gegenüber X verwendet und nie an KeepXClean-Server gesendet. Optionale Community-Meldungen sind in der Datenschutzerklärung beschrieben.
- **Opt-In-Standards & Geräte-lokale Listen**: Bei Neuinstallationen sind `syncNativeXBlock`, `enableCrowdReport` und optionale Synchronisierung (`chrome.storage.sync`) standardmäßig **AUS**; große lokale Sperrlisten und Protokolle werden nicht synchronisiert, und Parse-Diagnosen senden null Telemetrie oder PII.
- **Null Telemetrie**: Keine Drittanbieter-Analyse-SDKs oder Werbe-Tracker.
- Vollständige [**Datenschutzerklärung**](https://keepxclean.com/privacy/).

## Projektstruktur & Entwicklung

```text
packages/shared/   Deterministische Regel-Engine, X-GraphQL-Parser, 10-Sprachen-Keyword-Pakete (45 Regeln), Offline-Pack-Validator & i18n
apps/extension/    WXT (Manifest V3 — Chrome & Firefox) Erweiterung, Shadow DOM UI, Canvas-2D-Bericht & Hintergrund-Jobs
apps/server/       Cloudflare Workers API, D1-Aggregation, Snapshot-Cache & Maintainer-CLI cloud-rules
apps/web/          Offizielle Webseite & interaktive Browser-Sandbox (keepxclean.com)
tests/e2e/         5-stufige End-to-End- & Adversarial-Testsuite
tests/browser-e2e/ Echte Chromium-MV3-Erweiterungs-E2E-Testsuite
```

Voraussetzungen: **Node.js ≥ 20** und **pnpm**

```bash
pnpm install
pnpm dev:ext      # Erweiterung im Entwicklungsmodus starten
pnpm lint         # ESLint im gesamten Workspace ausführen
pnpm typecheck    # TypeScript-Typprüfung
pnpm test         # Unit- und Integrationstests ausführen
pnpm test:e2e     # 5-stufige E2E-Testsuite ausführen
pnpm build        # Produktions-Build erstellen
pnpm test:browser # Echte Chromium-MV3-E2E-Tests ausführen
```

Release-Hinweise finden Sie in [CHANGELOG.md](../../CHANGELOG.md). Informationen zu Self-Hosting und CI/CD finden Sie unter [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor & Lizenz

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Lizenz**: Veröffentlicht unter der [MIT-Lizenz](../../LICENSE). Unabhängiges Open-Source-Projekt ohne Verbindung zu X Corp.
