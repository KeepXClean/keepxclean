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

**KeepXClean** фильтрует спам, ботов в комментариях, фейковые аккаунты-двойники, байты на активность, крипто-спам и рекламные посты в X (`x.com`) быстрее чем за **1 мс** прямо в вашем браузере — без чтения учетных данных и с плавной прокруткой 60/120 FPS.

<div align="center">

https://github.com/user-attachments/assets/744a6b36-b6b5-4933-b22a-6471c5741ea7

</div>

## Ключевые возможности

- **Локальный детерминированный движок (`< 1 мс`)**: Анализирует в памяти ответы GraphQL, которые X уже передал браузеру — без входа в аккаунт и лишних запросов к API X.
- **Многоуровневая защита от шума**: Перехватывает короткие ответы ботов с синей галочкой, имитаторов автора треда, фейковые розыгрыши, высокочастотный флуд, злоупотребление хэштегами, **24 встроенных публичных правила**, нежелательные языки и рекламу.
- **Свернутая плашка или полное скрытие + проверка цитат**: Сворачивайте шум в компактную строку с причиной срабатывания или скрывайте полностью; при ретвите/цитировании спама блокируется именно первоисточник спама.
- **4,5 секунды на отмену и честная обратная связь**: Мгновенная локальная блокировка с **окном отмены 4,5 с**, после чего по настройке выполняются нативный блок в X и анонимный голос `SHA-256` с солью (`1 аккаунт = 1 голос`, порог `5×` для авторов с ≥50 тыс. подписчиков).
- **10 языков интерфейса**: Русский, английский, китайский (упр./трад.), японский, корейский, испанский, португальский, французский и немецкий.

## Установка

### Вариант 1: Chrome Web Store (Рекомендуется)

Установите в 1 клик из [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) (поддерживаются Chrome, Edge, Brave, Arc и другие настольные браузеры на Chromium).

### Вариант 2: Ручная установка (`.zip`)

1. Скачайте свежий архив `keepxcleanextension-*-chrome.zip` из [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) и распакуйте его.
2. Откройте `chrome://extensions` и включите **Режим разработчика**.
3. Нажмите **Загрузить распакованное расширение** и выберите папку.

## Конфиденциальность и безопасность

- **Ноль учетных данных**: Расширение никогда не читает пароли, cookie, токены авторизации, почту или личные сообщения (DM).
- **Ноль телеметрии**: Никаких сторонних аналитических SDK и рекламных трекеров.
- Подробнее в официальной [**Политике конфиденциальности**](https://keepxclean.com/privacy/).

## Структура репозитория и разработка

```text
packages/shared/   Детерминированный движок правил, парсер GraphQL X, 24 правила и i18n
apps/extension/    Браузерное расширение WXT (Manifest V3) и фоновые задачи
apps/server/       API на Cloudflare Workers, агрегация D1 и кэш снимков R2
apps/web/          Официальный сайт и интерактивная песочница (keepxclean.com)
tests/e2e/         5-уровневый набор E2E и нагрузочных тестов
```

Требуются **Node.js ≥ 20** и **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Запуск расширения в режиме разработки
pnpm typecheck    # Проверка типов TypeScript
pnpm test         # Запуск модульных и интеграционных тестов
pnpm test:e2e     # Запуск 5-уровневых E2E-тестов
pnpm build        # Сборка для продакшена
```

Инструкции по самостоятельному развертыванию и CI/CD вынесены в [docs/DEPLOYMENT.md](../DEPLOYMENT.md).

## Автор и лицензия

- **Автор**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **Лицензия**: Распространяется по [лицензии MIT](../../LICENSE). Независимый проект с открытым исходным кодом, не связанный с X Corp.
