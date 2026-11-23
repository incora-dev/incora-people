> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Клієнтські застосунки INCORA People

## 1. Архітектурне рішення

INCORA People розвивається як одна серверна платформа з трьома клієнтами:

1. чинна вебверсія;
2. Chrome extension лише для входу, перегляду стану та запуску/зупинки таймера;
3. повноцінний мобільний застосунок для Android та iOS з усіма функціями,
   доступними користувачеві у вебверсії.

Для мобільного клієнта рекомендовано **React Native + Expo**. Він дає один
TypeScript/React-код для Android та iOS, рендерить нативні елементи інтерфейсу
і дозволяє підключати нативні можливості: захищене сховище, біометрію, push,
камеру, вибір файлів та deep links. Дві окремі реалізації на SwiftUI і Kotlin
Compose на цьому етапі подвоять обсяг роботи та ризик розходження функцій.

PWA доцільно додати як швидкий проміжний спосіб встановлення вебверсії на
iPhone та Android. Воно не замінює запланований нативний застосунок.

## 2. Цільова схема

```text
Chrome extension ─┐
React Native app ──┼─ HTTPS / API v1 ─ Cloudflare Worker ─ D1
Web application ───┘                         └────────────── R2
                           │
                           ├─ Google OAuth + PKCE
                           ├─ server-side roles and access policies
                           └─ audit, idempotency and device sessions
```

Уся бізнес-логіка, права, погодження, баланси та інваріанти залишаються на
сервері. Клієнти показують дозволені дані й надсилають команди, але не
вирішують самостійно, хто що може бачити або змінювати.

## 3. Структура репозиторію

Вебзастосунок поки не переноситься з кореня: це створило б великий технічний
шум без користі. Нові клієнти додаються поруч:

```text
app/, components/, modules/       чинна вебверсія і backend
apps/mobile/                      Expo / React Native
apps/chrome-extension/            Manifest V3 extension
packages/api-contracts/           DTO, Zod-схеми та версії API
packages/api-client/              типізований HTTP-клієнт
packages/design-tokens/           кольори, типографіка, відступи, іконки
packages/i18n-shared/             спільні українські й англійські терміни
```

На першому інкременті можна залишити один npm lockfile та додати npm
workspaces. Серверні модулі не імпортуються в мобільний або extension bundle;
спільними є лише безпечні контракти, дизайн-токени та переклади.

## 4. Спільний API

### 4.1 Підготовка backend

Поточні вебмаршрути значною мірою вже працюють як API, але авторизація
орієнтована на browser cookie. Перед клієнтами потрібен стабільний
версійований шар `/api/v1`:

- один формат успішної відповіді й помилки;
- Bearer-авторизація для extension і mobile;
- збереження чинної cookie-авторизації для вебверсії;
- DTO без зайвих або чутливих полів;
- pagination, filtering та predictable date/time format;
- idempotency key для повторюваних мобільних команд;
- `clientType`, `deviceId` та request ID в аудиті.
- server capabilities і `minimumClientVersion`, щоб старий APK/IPA отримував
  зрозуміле повідомлення про обов'язкове оновлення, а не ламався після deploy.

`getCurrentUser` потрібно перетворити на спільний resolver identity, який
підтримує browser session, Cloudflare Access та Bearer session, але завжди
повертає ту саму серверну модель ролей і доступів.

### 4.2 Авторизація клієнтів

Для mobile та extension використовується Google OAuth Authorization Code з
PKCE через системний браузер. Client secret ніколи не вбудовується в APK, IPA
або extension.

У Google Cloud потрібні окремі OAuth client IDs для web, Android, iOS і Chrome
extension. Це дозволяє окремо відкликати скомпрометований клієнт і правильно
перевіряти package/bundle/extension identity.

Заплановані endpoints:

- `GET /api/v1/auth/authorize` — початок Google-входу;
- `POST /api/v1/auth/token` — обмін code або ротація сесії через `grantType`;
- `POST /api/v1/auth/revoke` — вихід і відкликання пристрою;
- `GET /api/v1/me` — поточний профіль, роль, permissions та locale.

Access token живе 10–15 хвилин. Refresh token зберігається на сервері лише у
вигляді hash, обертається після використання й має абсолютний строк сесії 8
годин відповідно до чинної політики INCORA People. У mobile токени зберігаються
в iOS Keychain / Android Keystore через SecureStore. Extension тримає access
token у `chrome.storage.session`, а opaque refresh token — у
`chrome.storage.local`, щоб відновити сесію після перезапуску Chrome. Вихід
відкликає серверну сесію й очищає обидва сховища.

Нові таблиці:

- `client_sessions`: користувач, hash refresh token, client type, device,
  created/last used/expires/revoked;
- `oauth_authorization_codes`: одноразовий code, PKCE challenge, redirect URI,
  короткий TTL і використання;
- за потреби пізніше `push_devices`: platform, push token, locale, status.

## 5. Chrome extension: тільки таймер

### 5.1 Технологія

- Chrome Manifest V3;
- маленький popup без content scripts;
- background service worker лише для auth/status/badge;
- дозволи: `identity`, `storage`, `alarms` і точний production host;
- жодного доступу до історії браузера або вмісту сторінок.

### 5.2 Інтерфейс

Popup має лише такі стани:

1. не авторизовано — «Увійти через Google»;
2. таймер зупинено — ім’я та «Почати роботу»;
3. таймер працює — час старту, поточна тривалість і «Завершити роботу»;
4. помилка мережі / сесії — зрозуміле повідомлення та повтор.

Badge показує активність, а тривалість обчислюється локально від серверного
`startedAt`. Extension не надсилає запит щосекунди. Service worker може
засинати, тому стан завжди відновлюється з API, а періодичні дії виконуються
через `chrome.alarms`.

### 5.3 Безпечні time endpoints

Замість повторного використання toggle-команди потрібні явні операції:

- `GET /api/v1/time/status`;
- `POST /api/v1/time/clock-in`;
- `POST /api/v1/time/clock-out`.

Поточна альфа має семантичну ідемпотентність: повторний `clock-in` повертає
вже запущений запис, а повторний `clock-out` — уже зупинений стан. У наступному
інкременті кожна команда також отримає збережений `idempotency key` для
безпечного повтору після обриву мережі. Сервер повертає авторитетний стан і час
початку.

### 5.4 Стан реалізації

Вже реалізовано: Manifest V3 popup, Google sign-in через системне OAuth-вікно,
PKCE, окремі bearer-сесії на 8 годин з ротацією refresh token, явні API-команди
таймера та badge активного таймера. Alpha ZIP встановлюється через `Load
unpacked` без ручного налаштування ID: сервер приймає лише стандартний Chrome
redirect, а PKCE прив’язує код входу до конкретного розширення.

### 5.5 Розповсюдження extension

- під час альфа-тесту: trusted unpacked extension через Developer mode;
- для звичайних працівників: **Private** Chrome Web Store listing для
  корпоративного домену або **Unlisted** listing за прямим посиланням;
- якщо браузери керуються Google Admin / Chrome Enterprise: автоматичне
  встановлення та pin через enterprise policy.

Самостійно розміщений CRX не є зручним загальним каналом: Chrome на Windows і
macOS дозволяє таке встановлення лише через enterprise policies. Тому production
план не повинен залежати від ручного CRX-файлу.

## 6. Повноцінний mobile app

### 6.1 Навігація

Нижні вкладки:

- Головна;
- Люди;
- Відсутності;
- Час;
- Меню.

«Меню» відкриває решту доступних модулів. Екрани та розділи формуються за
permissions із `/api/v1/me`, але кожний API endpoint повторно перевіряє доступ
на сервері.

### 6.2 Функціональне покриття

Мобільна версія повинна включити:

- Home, announcements, notifications, tasks та work mode;
- People directory, profiles, org chart і доступні HR-записи;
- Leave, balances, calendar, requests та approvals;
- Time tracker, breaks, entries, corrections, projects і team views;
- reimbursements у профілі;
- assets, documents і Knowledge base;
- bug reporting з камерою/галереєю;
- personal settings, language і logout;
- admin settings, access, audit і ticket management для відповідних ролей.

Великі desktop-таблиці не переносяться піксель у піксель. На телефоні вони
стають картками, списками, фільтрами та detail screens, зберігаючи ту саму
дію й інформацію.

### 6.3 Файли та пристрій

- фотографування або вибір скриншота для баг-репорту;
- вибір PDF/JPEG/PNG/WebP для документів і чеків;
- завантаження через чинний R2-backed API;
- secure download із тимчасовою локальною копією;
- біометричне розблокування збереженої сесії — після базового релізу;
- push notifications через FCM/APNs — окремий інкремент після outbox.

### 6.4 Offline-поведінка

Перший реліз є online-first. Дозволено кешувати списки та незавершений текст
форми, але права, баланси й заявки не вважаються актуальними без сервера.
Clock-in/clock-out успішні тільки після підтвердження backend. Пізніше можна
додати offline queue лише для команд з idempotency key та явним статусом
синхронізації.

## 7. Встановлення й оновлення

### 7.1 Android

Для пілота формується підписаний release APK. Він розміщується на захищеній
сторінці INCORA з QR-кодом і checksum. Користувач один раз дозволяє встановлення
з цього джерела. Усі наступні APK мають бути підписані тим самим ключем, інакше
Android не встановить їх як оновлення.

Пізніше можна перейти на private/internal Google Play distribution без зміни
React Native-коду.

### 7.2 iOS

Рекомендована послідовність:

1. **PWA як негайний місток.** Safari → Поділитися → «На початковий екран».
   Потрібні web app manifest, icons, standalone metadata та service worker.
2. **Ad Hoc / EAS Internal Distribution для першої нативної альфи.** Людина
   реєструє iPhone за посиланням/QR, після чого отримує install link. Недолік:
   UDID кожного пристрою входить у provisioning profile, а нові пристрої
   вимагають re-sign або новий build.
3. **TestFlight для ширшого пілота.** Застосунок не публікується у відкритому
   App Store. Для зовнішніх тестувальників перший build проходить beta review;
   TestFlight build доступний 90 днів, тому це не постійний production-канал.
4. **Apple Business Manager Custom App + MDM** — рекомендований сталий приватний
   канал, якщо INCORA вже використовує керування корпоративними пристроями.

Apple Developer Enterprise Program не слід планувати як базовий шлях: він має
окремі критерії придатності та орієнтований на великі організації з внутрішнім
MDM-розповсюдженням.

Чинна вебверсія адаптивна, але ще не має повного installable PWA package. Тому
«додати на початковий екран» потрібно реалізувати й перевірити окремим коротким
інкрементом.

## 8. План реалізації

### Етап A — Client API foundation

- зафіксувати OpenAPI/типізовані DTO для `/api/v1`;
- додати PKCE client sessions, revoke та device list;
- створити explicit idempotent time commands;
- адаптувати `getCurrentUser` до cookie/Access/Bearer;
- додати rate limits, CORS allowlist і security tests.

Результат: backend готовий для будь-якого клієнта без копіювання бізнес-логіки.

### Етап B — Chrome extension alpha

- Manifest V3 skeleton;
- Google login через `chrome.identity.launchWebAuthFlow`;
- status/start/stop popup;
- badge, session expiry, logout та retry states;
- unpacked installation guide та пакет для Private/Unlisted Chrome Web Store.

Результат: працівник керує робочим таймером у два кліки з Chrome.

### Етап C — Mobile foundation

- Expo app, navigation, INCORA design tokens та i18n;
- Google OAuth PKCE, SecureStore та `/me`;
- typed API client, global errors, loading/empty/offline states;
- Home, notifications, work mode та global time tracker;
- Android APK і iOS Ad Hoc pilot builds.

### Етап D — Повний функціональний паритет

Розробляти vertical slices у такому порядку:

1. People + profiles + org;
2. Leave + calendar + approvals;
3. Time + corrections + team views;
4. tasks + announcements;
5. documents + Knowledge + assets;
6. reimbursements;
7. role-scoped admin settings, audit і bug tickets.

Кожний slice включає API, mobile UI, permissions, українську/англійську мови,
тести та перевірку Android/iOS.

### Етап E — Production hardening

- crash/error monitoring без персональних даних;
- push delivery через transactional outbox;
- accessibility, performance і tablet layouts;
- mobile E2E для employee, manager, HR та super admin;
- session/device revocation і lost-device procedure;
- Android update page та обраний приватний iOS distribution channel.

## 9. Орієнтовна послідовність спринтів

За умови одного основного потоку розробки й тижневих спринтів:

| Спринт | Результат                                                        |
| ------ | ---------------------------------------------------------------- |
| 1      | API v1 foundation, bearer sessions, PKCE, explicit time commands |
| 2      | Chrome extension alpha та installable PWA bridge                 |
| 3      | Mobile shell, Google login, secure storage, Home і global timer  |
| 4      | People, profiles, organization                                   |
| 5      | Leave, calendar, approvals                                       |
| 6      | Time, projects, corrections, manager views                       |
| 7      | Tasks, announcements, documents, Knowledge, assets               |
| 8      | Reimbursements, admin modules, audit, bug tickets                |
| 9      | Android/iOS E2E, accessibility, release hardening і distribution |

Extension можна віддати на внутрішню альфу після другого спринту. Повний
мобільний паритет — після восьмого; дев'ятий спринт не додає великих функцій,
а робить реліз придатним для щоденного використання.

## 10. Критерії готовності

Chrome extension готовий, коли start/stop є ідемпотентними, стан відновлюється
після перезапуску Chrome, прострочена сесія безпечно веде на login, а extension
не має зайвих browser permissions.

Mobile v1 готовий, коли всі дозволені вебмодулі доступні відповідній ролі,
файли працюють через R2, auth tokens зберігаються у системному secure storage,
критичні сценарії перевірені на реальних Android та iPhone, а жодне право не
довіряється клієнтському UI.

## 11. Офіційні технічні джерела

- Chrome Identity API:
  <https://developer.chrome.com/docs/extensions/reference/api/identity>
- Chrome extension distribution:
  <https://developer.chrome.com/docs/extensions/how-to/distribute>
- Chrome Manifest V3 service workers:
  <https://developer.chrome.com/docs/extensions/develop/concepts/service-workers>
- Android APK distribution:
  <https://developer.android.com/studio/publish/>
- Apple TestFlight:
  <https://developer.apple.com/testflight/>
- Apple Enterprise distribution:
  <https://developer.apple.com/programs/enterprise/>
- Expo OAuth/PKCE:
  <https://docs.expo.dev/guides/authentication/>
- Expo internal distribution:
  <https://docs.expo.dev/build/internal-distribution/>
