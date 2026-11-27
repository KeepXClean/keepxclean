<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Extension local-first à haute valeur pour filtrer le fil et les réponses sur X (Twitter)</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Ajouter_à_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=fr"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
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
    <strong>Français</strong> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** filtre le spam, les bots de réponses, les usurpateurs d'identité, les pièges à engagement, les arnaques crypto et les publicités sponsorisées sur X (`x.com`) en moins d'**1 ms** directement dans votre navigateur — avec des actions facultatives sur le compte X et en préservant un défilement fluide à 60/120 FPS.

<div align="center">

<a href="https://keepxclean.com/?lang=fr#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="Aperçu de la vidéo promotionnelle de 30 secondes KeepXClean" />
  </a>
  <p><a href="https://keepxclean.com/?lang=fr#video"><strong>▶ Regarder la vidéo promotionnelle de 30 secondes sur keepxclean.com</strong></a></p>

</div>

## Points Forts

- **Moteur Déterministe Local (`< 1ms`) & Autodiagnostic GraphQL** : Analyse en mémoire les réponses GraphQL déjà transmises par X sans aucune nouvelle permission (`storage` + `alarms`), sans connexion et avec autodiagnostic local de l'analyseur (résumé anonymisé, récupération automatique, zéro télémétrie).
- **Défense Anti-Bruit Complète** : Bloque les réponses courtes de bots certifiés, **les réponses dupliquées dans un même fil** (conserve la 1re occurrence), **la protection officielle de `@grok` et le filtrage optionnel des invocations courtes**, les usurpateurs, les concours pièges, le flood, **le filtrage structuré des domaines externes**, **les packs publics en 10 langues (45 règles intégrées)**, **les packs hors ligne `.kxc-pack.json`**, le filtrage par langue et les publicités.
- **Modes par Scène, Liens Directs & Pénétration des Citations** : Distingue **Pour vous** et **Abonnements** (`inherit` / `collapse` / `strip` / `bypass`), applique la pénétration des citations et propose depuis la barre dépliée d'ajuster directement la règle déclenchée ou de désactiver l'élément en un clic.
- **Démarrage Rapide, Statistiques par Règle & Synchronisation Facultative** : Carte de prise en main non intrusive, statistiques par règle + tendance sur 7 jours + **rapport PNG local Canvas 2D** (zéro PII), **annulation sous 4,5 s** et **synchronisation facultative `chrome.storage.sync`** (désactivée par défaut ; listes locales et journaux restent sur l'appareil).
- **10 Langues Natives & Chrome / Firefox MV3** : Français, anglais, chinois (simplifié/traditionnel), japonais, coréen, espagnol, portugais, allemand et russe.

## Installation

### Option 1 : Chrome Web Store (Recommandé)

Installez en 1 clic depuis le [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatible Chrome, Edge, Brave, Arc et navigateurs Chromium de bureau).

### Option 2 : Chargement Manuel (`.zip`)

1. Téléchargez la dernière archive `keepxcleanextension-*-chrome.zip` depuis [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) et extrayez-la.
2. Ouvrez `chrome://extensions` et activez le **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier extrait.

## Confidentialité & Sécurité

- KeepXClean ne demande ni mots de passe ni messages privés. Il lit localement les cookies de X pour identifier le compte et effectuer les opérations demandées par l’utilisateur. Les cookies de session et valeurs d’autorisation servent uniquement aux échanges avec X, jamais avec les serveurs KeepXClean. Consultez la politique de confidentialité pour les signalements communautaires facultatifs.
- **Options Opt-In & Listes Locales** : Lors d'une nouvelle installation, `syncNativeXBlock`, `enableCrowdReport` et la synchronisation facultative (`chrome.storage.sync`) sont tous **désactivés** ; la synchronisation exclut les listes locales de blocage et journaux, et l'autodiagnostic ne transmet aucune télémétrie ni PII.
- **Zéro Télémétrie** : Aucun SDK d'analyse tiers ni traceur publicitaire.
- Consultez la [**Politique de Confidentialité**](https://keepxclean.com/privacy/) complète.

## Structure du Dépôt & Développement

```text
packages/shared/   Moteur déterministe, parseur GraphQL X, packs publics en 10 langues (45 règles), validateur hors ligne & i18n
apps/extension/    Extension WXT (Manifest V3 — Chrome & Firefox), interface Shadow DOM, rapport Canvas 2D & tâches de fond
apps/server/       API Cloudflare Workers, agrégation D1, cache de snapshot & CLI cloud-rules
apps/web/          Site officiel & bac à sable navigateur interactif (keepxclean.com)
tests/e2e/         Suite de tests E2E et adversariaux à 5 niveaux
tests/browser-e2e/ Suite E2E réelle d'extension MV3 dans Chromium
```

Prérequis : **Node.js ≥ 20** et **pnpm**

```bash
pnpm install
pnpm dev:ext      # Lancer l'extension en mode développement
pnpm lint         # Exécuter ESLint sur tout le workspace
pnpm typecheck    # Vérification des types TypeScript
pnpm test         # Tests unitaires et d'intégration
pnpm test:e2e     # Suite E2E à 5 niveaux
pnpm build        # Build de production
pnpm test:browser # Exécuter la suite E2E réelle Chromium MV3
```

Consultez l'historique des versions dans [CHANGELOG.md](../../CHANGELOG.md). Pour l'auto-hébergement et le déploiement CI/CD, voir [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Auteur & Licence

- **Auteur** : X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licence** : Distribué sous [Licence MIT](../../LICENSE). Projet open source indépendant, non affilié à X Corp.
