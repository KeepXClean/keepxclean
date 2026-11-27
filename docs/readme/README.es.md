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

**KeepXClean** filtra spam, bots de respuestas, suplantadores del autor original, sorteos engañosos, promoción cripto y anuncios patrocinados en X (`x.com`) en menos de **1 ms** directamente en tu navegador, con acciones opcionales en la cuenta X y manteniendo 60/120 FPS fluidos.

<div align="center">

<a href="https://keepxclean.com/?lang=es#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="Vista previa del video promocional de 30 segundos de KeepXClean" />
  </a>
  <p><a href="https://keepxclean.com/?lang=es#video"><strong>▶ Ver el video promocional de 30 segundos en keepxclean.com</strong></a></p>

</div>

## Características Principales

- **Motor Determinista Local (`< 1ms`) y Autodiagnóstico de Análisis**: Analiza en memoria las respuestas GraphQL que X ya envía a tu navegador con cero permisos nuevos (`storage` + `alarms`), sin inicio de sesión y con autodiagnóstico local del analizador GraphQL (copia de resumen sin datos sensibles, recuperación automática y cero telemetría).
- **Defensa Integral contra el Ruido**: Bloquea bots verificados de respuestas cortas, **respuestas repetidas en el mismo hilo** (mantiene la 1.ª copia), **protección oficial de `@grok` y filtro opcional de invocaciones cortas**, cuentas suplantadoras, cebos de interacción, inundación de publicaciones, **filtro estructurado de dominios externos**, **paquetes públicos en 10 idiomas (45 reglas integradas)**, **paquetes de reglas sin conexión `.kxc-pack.json`**, filtro por idioma y eliminación de anuncios.
- **Modos por Escena, Acceso Directo en Barra Plegada y Penetración de Citas**: Distingue **Para ti** y **Siguiendo** con modos por escena (`inherit` / `collapse` / `strip` / `bypass`), penetración de citas y botones en la barra expandida para ajustar la regla coincidente o desactivar el elemento en un clic.
- **Inicio Rápido, Estadísticas por Regla y Sincronización Opcional**: Tarjeta de inicio rápido no intrusiva, estadísticas por regla + tendencia de 7 días + **informe PNG local con Canvas 2D** (sin PII), **ventana de deshacer de 4,5 s** y **sincronización opcional `chrome.storage.sync`** (desactivada por defecto; listas negras y registros permanecen en el dispositivo).
- **10 Idiomas Nativos y Chrome / Firefox MV3**: Español, inglés, chino (simplificado/tradicional), japonés, coreano, portugués, francés, alemán y ruso.

## Instalación

### Opción 1: Chrome Web Store (Recomendado)

Instala en 1 clic desde [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (compatible con Chrome, Edge, Brave, Arc y navegadores Chromium de escritorio).

### Opción 2: Instalación Manual (`.zip`)

1. Descarga `keepxcleanextension-*-chrome.zip` desde [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) y descomprímelo.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Haz clic en **Cargar extensión descomprimida** y selecciona la carpeta.

## Privacidad y Seguridad

- KeepXClean no solicita contraseñas ni mensajes privados. Lee cookies de X localmente para identificar la cuenta y realizar operaciones solicitadas por el usuario. Las cookies de sesión y los valores de autorización se usan solo con X y nunca se envían a los servidores de KeepXClean. La política de privacidad detalla los informes comunitarios opcionales.
- **Valores Opt-In y Listas Locales**: En instalaciones nuevas, `syncNativeXBlock`, `enableCrowdReport` y la sincronización opcional (`chrome.storage.sync`) vienen **desactivados**; la sincronización excluye listas negras locales y registros, y el autodiagnóstico no envía telemetría ni PII.
- **Cero Telemetría**: Sin SDKs analíticos de terceros ni rastreadores publicitarios.
- Consulta la [**Política de Privacidad**](https://keepxclean.com/privacy/) oficial.

## Estructura y Desarrollo Local

```text
packages/shared/   Motor determinista, parser GraphQL de X, paquetes públicos en 10 idiomas (45 reglas), validador offline e i18n
apps/extension/    Extensión WXT (Manifest V3 — Chrome y Firefox), interfaz Shadow DOM, informe Canvas 2D y tareas en segundo plano
apps/server/       API en Cloudflare Workers, agregación D1, caché de instantáneas y CLI cloud-rules
apps/web/          Sitio oficial y simulador interactivo (keepxclean.com)
tests/e2e/         Suite de verificación E2E de 5 niveles
tests/browser-e2e/ Suite E2E real con extensión MV3 en Chromium
```

Requiere **Node.js ≥ 20** y **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Modo desarrollo de la extensión
pnpm lint         # Análisis ESLint en todo el workspace
pnpm typecheck    # Verificación de tipos TypeScript
pnpm test         # Pruebas unitarias e integración
pnpm test:e2e     # Pruebas E2E de 5 niveles
pnpm build        # Compilación de producción
pnpm test:browser # Pruebas E2E reales en Chromium MV3
```

Consulta el historial de versiones en [CHANGELOG.md](../../CHANGELOG.md). Para despliegue propio y CI/CD, consulta [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Autor y Licencia

- **Autor**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Licencia**: Publicado bajo la [Licencia MIT](../../LICENSE). Proyecto independiente de código abierto, no afiliado a X Corp.
