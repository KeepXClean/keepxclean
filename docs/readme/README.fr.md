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

**KeepXClean** filtre le spam, les bots de réponses, les usurpateurs d'identité, les pièges à engagement, les arnaques crypto et les publicités sponsorisées sur X (`x.com`) en moins d'**1 ms** directement dans votre navigateur — sans lire vos identifiants et en préservant un défilement fluide à 60/120 FPS.

<p align="center">
  <a href="https://keepxclean.com"><img src="../assets/keepxclean-demo.gif" width="800" alt="Démo KeepXClean : réponses indésirables sur X repliées et supprimées automatiquement" /></a>
</p>

## Points Forts

- **Moteur Déterministe Local (`< 1ms`)** : Analyse en mémoire les réponses GraphQL déjà transmises par X à votre navigateur. Aucun compte requis et aucun appel supplémentaire à l'API X.
- **Défense Anti-Bruit Complète** : Bloque les réponses courtes de bots certifiés, les usurpateurs de l'auteur original, les concours pièges, le flood massif, l'abus de hashtags, **24 règles publiques intégrées**, le filtrage par langue et les publicités.
- **Barre Repliée ou Masquage Silencieux + Pénétration des Citations** : Repliez les tweets interceptés en une barre inspectable d'une ligne ou masquez-les totalement ; lorsqu'un compte suivi cite du spam, l'action cible précisément le spammeur cité.
- **Annulation sous 4,5 s & Retour Transparent** : Blocage local instantané avec **4,5 secondes pour annuler**, suivi en option du blocage natif X et du vote communautaire anonyme `SHA-256` salé (`1 compte = 1 vote`, seuil `5×` pour les créateurs ≥50k abonnés).
- **10 Langues Natives** : Français, anglais, chinois (simplifié/traditionnel), japonais, coréen, espagnol, portugais, allemand et russe.

## Installation

### Option 1 : Chrome Web Store (Recommandé)

Installez en 1 clic depuis le [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatible Chrome, Edge, Brave, Arc et navigateurs Chromium de bureau).

### Option 2 : Chargement Manuel (`.zip`)

1. Téléchargez la dernière archive `keepxcleanextension-*-chrome.zip` depuis [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) et extrayez-la.
2. Ouvrez `chrome://extensions` et activez le **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier extrait.

## Confidentialité & Sécurité

- **Zéro Identifiant** : Ne lit jamais vos mots de passe, cookies, jetons d'authentification, e-mails ou messages privés (DMs).
- **Zéro Télémétrie** : Aucun SDK d'analyse tiers ni traceur publicitaire.
- Consultez la [**Politique de Confidentialité**](https://keepxclean.com/privacy/) complète.

## Structure du Dépôt & Développement

```text
packages/shared/   Moteur déterministe, parseur GraphQL X, 24 règles publiques & i18n
apps/extension/    Extension WXT (Manifest V3), interface Shadow DOM & tâches de fond
apps/server/       API Cloudflare Workers, agrégation D1 & cache R2
apps/web/          Site officiel & bac à sable navigateur interactif (keepxclean.com)
tests/e2e/         Suite de tests E2E et adversariaux à 5 niveaux
```

Prérequis : **Node.js ≥ 20** et **pnpm**

```bash
pnpm install
pnpm dev:ext      # Lancer l'extension en mode développement
pnpm typecheck    # Vérification des types TypeScript
pnpm test         # Tests unitaires et d'intégration
pnpm test:e2e     # Suite E2E à 5 niveaux
pnpm build        # Build de production
```

Pour l'auto-hébergement et le déploiement CI/CD, voir [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Auteur & Licence

- **Auteur** : X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licence** : Distribué sous [Licence MIT](../../LICENSE). Projet open source indépendant, non affilié à X Corp.
