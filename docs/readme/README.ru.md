<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Локальное расширение для очистки ленты и ответов в X (Twitter) от спама и информационного шума</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Установить-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=ru"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
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
    <a href="./README.de.md">Deutsch</a> ·
    <strong>Русский</strong>
  </p>
</div>

---

**KeepXClean** фильтрует спам, ботов в комментариях, фейковые аккаунты-двойники, байты на активность, крипто-спам и рекламные посты в X (`x.com`) быстрее чем за **1 мс** прямо в вашем браузере — с локальной фильтрацией, опциональными действиями с аккаунтом X и плавной прокруткой 60/120 FPS.

<div align="center">

<a href="https://keepxclean.com/?lang=ru#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="Превью 30-секундного промо-видео KeepXClean" />
  </a>
  <p><a href="https://keepxclean.com/?lang=ru#video"><strong>▶ Смотреть 30-секундное промо-видео на keepxclean.com</strong></a></p>

</div>

## Ключевые возможности

- **Локальный движок (`< 1 мс`) и самодиагностика парсинга**: Анализирует в памяти ответы GraphQL от X без единого нового разрешения (`storage` + `alarms`), без входа в аккаунт и с локальной самодиагностикой GraphQL (обезличенная диагностическая сводка, автовосстановление, ноль телеметрии).
- **Многоуровневая защита от шума**: Перехватывает короткие ответы ботов, **повторяющиеся копипаст-ответы в одной ветке** (сохраняет 1-ю копию), **защищает официальный `@grok` и опционально фильтрует короткие призывы `@grok`**, фейков, розыгрыши, флуд, **внешние домены по корневому домену и поддоменам**, **публичные пакеты ключевых слов на 10 языках (45 правил)**, **офлайн-пакеты правил `.kxc-pack.json`**, языки и рекламу.
- **Режимы разделов, переходы из плашки и проверка цитат**: Различает ленты **Для вас** и **Вы читаете** (`inherit` / `collapse` / `strip` / `bypass`), проверяет цитаты и позволяет прямо из раскрытой плашки перейти к правилу или отключить сработавший пункт в один клик.
- **Быстрый старт, аналитика по правилам и опциональная синхронизация**: Ненавязчивая карточка быстрого старта, статистика по правилам + тренд за 7 дней + **локальный PNG-отчёт на Canvas 2D** (без PII), **окно отмены 4,5 с** и **необязательная синхронизация `chrome.storage.sync`** (выключена по умолчанию; локальные чёрные списки и логи остаются на устройстве).
- **10 языков интерфейса и Chrome / Firefox MV3**: Русский, английский, китайский (упр./трад.), японский, корейский, испанский, португальский, французский и немецкий.

## Установка

### Вариант 1: Chrome Web Store (Рекомендуется)

Установите в 1 клик из [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (поддерживаются Chrome, Edge, Brave, Arc и другие настольные браузеры на Chromium).

### Вариант 2: Ручная установка (`.zip`)

1. Скачайте свежий архив `keepxcleanextension-*-chrome.zip` из [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) и распакуйте его.
2. Откройте `chrome://extensions` и включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите папку.

## Конфиденциальность и безопасность

- KeepXClean не запрашивает пароли и личные сообщения. Cookie X читаются локально для определения аккаунта и выполнения действий, запрошенных пользователем. Cookie сеанса и значения авторизации используются только для запросов к X и не отправляются на серверы KeepXClean. Необязательные отчёты сообщества описаны в политике конфиденциальности.
- **Opt-In по умолчанию и локальные списки**: При чистой установке `syncNativeXBlock`, `enableCrowdReport` и опциональная синхронизация (`chrome.storage.sync`) **выключены**; локальные чёрные списки и журналы не синхронизируются, а самодиагностика парсинга работает строго локально без PII и телеметрии.
- **Ноль телеметрии**: Никаких сторонних аналитических SDK и рекламных трекеров.
- Подробнее в официальной [**Политике конфиденциальности**](https://keepxclean.com/privacy/).

## Структура репозитория и разработка

```text
packages/shared/   Детерминированный движок правил, парсер GraphQL X, пакеты на 10 языках (45 правил), валидатор офлайн-пакетов и i18n
apps/extension/    Браузерное расширение WXT (Manifest V3 — Chrome и Firefox), интерфейс Shadow DOM, PNG-отчёт Canvas 2D и фоновые задачи
apps/server/       API на Cloudflare Workers, агрегация D1, кэш снимков и CLI cloud-rules
apps/web/          Официальный сайт и интерактивная песочница (keepxclean.com)
tests/e2e/         5-уровневый набор E2E и нагрузочных тестов
tests/browser-e2e/ Реальный E2E-набор расширения MV3 в Chromium
```

Требуются **Node.js ≥ 20** и **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Запуск расширения в режиме разработки
pnpm lint         # Проверка ESLint по всему рабочему пространству
pnpm typecheck    # Проверка типов TypeScript
pnpm test         # Запуск модульных и интеграционных тестов
pnpm test:e2e     # Запуск 5-уровневых E2E-тестов
pnpm build        # Сборка для продакшена
pnpm test:browser # Запуск реальных E2E-тестов в Chromium MV3
```

История релизов — в [CHANGELOG.md](../../CHANGELOG.md). Инструкции по самостоятельному развертыванию и CI/CD вынесены в [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Автор и лицензия

- **Автор**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Лицензия**: Распространяется по [лицензии MIT](../../LICENSE). Независимый проект с открытым исходным кодом, не связанный с X Corp.
