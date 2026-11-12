<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Extensión local-first de alto valor para filtrar el timeline y las respuestas en X (Twitter)</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Añadir_a_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=es"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
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
    <strong>Español</strong> ·
    <a href="./README.pt.md">Português</a> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** filtra spam, bots de respuestas, suplantadores del autor original, sorteos engañosos, promoción cripto y anuncios patrocinados en X (`x.com`) en menos de **1 ms** directamente en tu navegador, sin leer credenciales y manteniendo 60/120 FPS fluidos.

## Características Principales

- **Motor Determinista Local (`< 1ms`)**: Analiza en memoria las respuestas GraphQL que X ya envía a tu navegador. Sin inicio de sesión ni peticiones adicionales a la API de X.
- **Defensa Integral contra el Ruido**: Bloquea bots verificados de respuestas cortas, cuentas suplantadoras, cebos de interacción, inundación de publicaciones, exceso de hashtags, **24 reglas públicas integradas**, filtro por idioma y eliminación de anuncios.
- **Barra Plegada o Eliminación Silenciosa + Penetración de Citas**: Colapsa el ruido en una barra inspeccionable de una línea o elimínalo por completo; si alguien a quien sigues cita spam, las acciones apuntan al spammer citado.
- **Ventana de Deshacer de 4,5 s y Reporte Honesto**: Bloqueo local instantáneo con **4,5 segundos para deshacer**, seguido opcionalmente de bloqueo nativo en X y voto comunitario anónimo `SHA-256` con sal (`1 cuenta = 1 voto`, protección `5×` para creadores ≥50k seguidores).
- **10 Idiomas Nativos**: Español, inglés, chino (simplificado/tradicional), japonés, coreano, portugués, francés, alemán y ruso.

## Instalación

### Opción 1: Chrome Web Store (Recomendado)

Instala en 1 clic desde [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatible con Chrome, Edge, Brave, Arc y navegadores Chromium de escritorio).

### Opción 2: Instalación Manual (`.zip`)

1. Descarga `keepxcleanextension-*-chrome.zip` desde [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) y descomprímelo.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Haz clic en **Cargar extensión descomprimida** y selecciona la carpeta.

## Privacidad y Seguridad

- **Cero Credenciales**: Nunca accede a contraseñas, cookies, tokens, correos ni mensajes directos (DMs).
- **Cero Telemetría**: Sin SDKs analíticos de terceros ni rastreadores publicitarios.
- Consulta la [**Política de Privacidad**](https://keepxclean.com/privacy/) oficial.

## Estructura y Desarrollo Local

```text
packages/shared/   Motor determinista, parser GraphQL de X, 24 reglas públicas e i18n
apps/extension/    Extensión WXT (Manifest V3), interfaz Shadow DOM y tareas en segundo plano
apps/server/       API en Cloudflare Workers, agregación D1 y caché R2
apps/web/          Sitio oficial y simulador interactivo (keepxclean.com)
tests/e2e/         Suite de verificación E2E de 5 niveles
```

Requiere **Node.js ≥ 20** y **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Modo desarrollo de la extensión
pnpm typecheck    # Verificación de tipos TypeScript
pnpm test         # Pruebas unitarias e integración
pnpm test:e2e     # Pruebas E2E de 5 niveles
pnpm build        # Compilación de producción
```

Para despliegue propio y CI/CD, consulta [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor y Licencia

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licencia**: Publicado bajo la [Licencia MIT](../../LICENSE). Proyecto independiente de código abierto, no afiliado a X Corp.
