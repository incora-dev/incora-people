> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Production readiness runbook

Цей документ описує контрольований шлях від перевіреного коду до production.
Він не містить секретів і не замінює Cloudflare access policy або внутрішні
процедури компанії.

## 1. Release gate

1. Працювати з конкретним commit у `main`; незакомічені зміни не публікувати.
2. У чистому checkout виконати `npm ci`, `npm run quality`, `npm run build` і
   `npm audit --omit=dev --audit-level=high`.
3. Окремо виконати `npm ci` і `npm run typecheck` у `apps/mobile` та перевірити
   `npx expo-doctor`.
4. Перепакувати extension через `npm run package:extension` і перевірити, що в
   ZIP немає ключів, `.env`, локальних баз або build artifacts.
5. Зберегти результати quality gate разом із commit SHA та номером міграції.

CI повторює ці перевірки для кожного push і pull request. Локальна зелена
збірка не є дозволом на deploy, доки не пройдено backup і migration review.

## 2. D1 backup та міграції

Перед міграцією:

- експортувати повний JSON backup через super-admin endpoint і зафіксувати
  `version`, `exportedAt` та SHA файлу у захищеному сховищі;
- окремо скопіювати всі R2 object keys у versioned backup bucket (D1 backup
  містить метадані, але не байти файлів);
- перевірити останній застосований migration journal у remote D1 і порівняти
  його з `migrations/` та `drizzle/`; повторно існуючу міграцію не запускати;
- застосовувати тільки pending міграції командою
  `npm run db:migrate:remote:built` після успішного build.

`db:seed:remote` ніколи не запускається на production. Для відновлення спочатку
розгорнути тимчасову D1, застосувати повну історію міграцій, імпортувати backup,
перевірити foreign-key/integrity checks і лише після цього планувати cutover.

## 3. R2 uploads і відновлення

Файли зберігаються приватно; клієнт отримує їх тільки через авторизований API.
Для production потрібно:

- залишити allowlist content types і ліміт 10 MB;
- підключити окремий scanner Worker або Cloudflare security pipeline до
  `POST /api/internal/file-scan` з bearer-секретом `FILE_SCAN_WEBHOOK_SECRET`;
  callback приймає тільки `clean`, `quarantined` або `failed`, пише audit і
  робить рішення атомарно зі статусом файлу;
- увімкнути `FILES_REQUIRE_SCAN=true` лише після первинного сканування всіх
  наявних об'єктів; у protected-режимі preview/download для `unscanned`,
  `quarantined` і `failed` тоді блокується;
- увімкнути versioning/retention для backup bucket і щоквартально виконувати
  restore drill на копії D1 + R2;
- перевіряти orphan metadata (рядок D1 без R2 object) та orphan objects
  (object без рядка D1) окремою reconciliation-задачею.

До появи реального scanner integration статус файлу вважається **unscanned**,
а не довіреним. Callback і quarantine вже є в коді, але підключення сканера,
первинне сканування та production-secret залишаються operational gate перед
go-live.

## 4. Спостережуваність та реагування

Налаштувати алерти на:

- сплески `401/403/429`, відхилені OAuth callback і refresh-token reuse;
- помилки notification outbox, записи зі статусом `failed` та зростання черги;
- D1 constraint/integrity errors, невдалі міграції та R2 upload/download errors;
- довгі запити й перевищення Worker CPU/subrequest limits.

У логах не зберігати access/refresh tokens, OAuth codes, повні персональні дані
або вміст документів. Для кожної інцидентної події достатньо request id, типу
операції, actor user id і технічного статусу.

## 5. Післярелізна перевірка

Тестовий список має містити щонайменше ролі super-admin, HR, manager, employee,
unknown, disabled і terminated: вхід, directory scope, leave approval,
expense approval, time, files, notifications та logout/relogin. Окремо пройти
Google callback, mobile deep link, extension timer, push, slow/offline network,
повторний create з тим самим `Idempotency-Key`, half-day leave і часову межу
Europe/Kyiv.

Після релізу перевірити health endpoint, одну тестову публікацію оголошення,
один push/outbox цикл і відсутність нових integrity errors. Якщо будь-який P0
або P1 сценарій не проходить, release повертається у dev і не маскується ручною
правкою даних.
