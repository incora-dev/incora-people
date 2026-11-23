> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Деплой INCORA People у Cloudflare

Ця інструкція публікує поточну версію Worker, застосовує production-міграції D1
та залишає вхід захищеним Google SSO. Виконуйте її з кореня репозиторію.

> Не запускайте `db:seed:remote` для робочої бази: це демо-дані.

## 1. Підготувати доступи та конфігурацію

1. Увійдіть у Cloudflare під обліковим записом, який має доступ до Worker і D1:

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

2. Переконайтеся, що `.env` містить лише несекретну конфігурацію та ID саме
   робочої D1-бази:

   ```dotenv
   CLOUDFLARE_D1_DATABASE_ID=<id бази incora-people>
   APP_MODE=protected
   AUTH_PROVIDER=google
   ALLOWED_EMAIL_DOMAIN=*
   GOOGLE_CLIENT_ID=<OAuth client ID>
   ```

   Не додавайте `GOOGLE_CLIENT_SECRET` або `AUTH_SECRET` у `.env` під час
   production-збірки: Vite формує конфігурацію Worker з цього файлу. Для
   локального Google SSO використовуйте ігнорований `.dev.vars`, а не `.env`.

   `ALLOWED_EMAIL_DOMAIN=*` дозволяє увійти через Google-акаунт з будь-яким
   доменом, але не надає роль. Роль визначається лише записом у базі.

3. У Google Cloud Console має бути дозволений callback поточного домену:

   ```text
   https://<ваш-домен>/api/auth/callback/google
   ```

   Додайте також сам origin `https://<ваш-домен>` у **Authorized JavaScript
   origins**.

## 2. Зробити резервну копію D1

Перед будь-якою новою міграцією створіть SQL-експорт. Каталог `backups/` не
потрібно комітити. Повний процес для D1 та R2 описаний у
[інструкції з резервного копіювання](./backup-recovery-ua.md).

```bash
mkdir -p backups
npx wrangler d1 export incora-people --remote \
  --output="backups/incora-people-$(date +%F-%H%M).sql"
```

## 3. Перевірити стан міграцій

```bash
npm run quality
npm run build
npx wrangler d1 migrations list incora-people --remote -c dist/server/wrangler.json
```

Поточна поставка містить нові production-міграції `0013`–`0019`: Assets,
Documents, time codes, історію активів і структурований Knowledge base з
путівником та обмеження ролей Knowledge base.

Якщо команда застосування міграцій повідомляє, що таблиця вже існує, **не
повторюйте команду і не видаляйте таблиці**. Це означає, що схему раніше
створили поза журналом Wrangler; збережіть точний текст помилки для узгодження
історії міграцій.

## 4. Додати production secrets

Після `npm run build` Worker-конфігурація вже існує у `dist/server/`. Задайте
секрети один раз через Cloudflare — вони не потрапляють у репозиторій або
клієнтський бандл:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET -c dist/server/wrangler.json
npx wrangler secret put AUTH_SECRET -c dist/server/wrangler.json
```

## 5. Задеплоїти

Рекомендована одна команда:

```bash
npm run deploy:cloudflare
```

Вона послідовно запускає перевірки, збірку, `db:migrate:remote` і публікацію
Worker. Якщо міграція не пройшла, деплой Worker не виконується.

Для контрольованого ручного запуску використовуйте:

```bash
npm run db:migrate:remote
wrangler deploy -c dist/server/wrangler.json
```

## 6. Перевірка після публікації

1. Відкрийте `https://<ваш-домен>/knowledge` і переконайтеся, що відображається
   31 інструкція у 8 розділах.
2. Перевірте Google-вхід трьома типами обліковок:
   - суперадміністратор;
   - звичайний заздалегідь створений працівник;
   - новий Google-акаунт з іншим доменом.
3. Під суперадміном відкрийте Knowledge base і додайте актуальні PNG/JPG
   скріншоти до відповідних статей через «Прикріпити файл».
4. Перевірте рольову видимість: працівник бачить розділи 1–6, менеджер —
   додаткові інструкції погодження в розділах 3–4, HR — розділ 7, суперадмін —
   розділ 8.

## Швидкий відкат

Worker можна повернути на попередню версію в Cloudflare Dashboard → Workers &
Pages → Deployments. Дані D1 не відкочуйте без перевіреної резервної копії та
окремого плану міграції.
