> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Промпт для нового Codex

Скопіюй увесь текст нижче як перше повідомлення в новому Codex-акаунті.

---

Продовжуй розробку INCORA People з наявного репозиторію. Спочатку повністю
прочитай `HANDOFF-UA.md`, `docs/architecture.md`,
`docs/mvp-definition-of-done.md` і
`outputs/incora-people-screenshot-gap-audit-ua.md`. Не починай дослідження
PeopleForce заново й не використовуй його сайт для scope MVP 2: джерело MVP 2
— тільки зафіксовані 33 скриншоти.

Поточний стан: MVP 1 = 100%, MVP 2 = 24%. Останній робочий commit на момент
handoff — `78ff4a7`. Production version 21:
https://incora-people.incora-people.workers.dev

Продовжуй MVP 2 з такого порядку:

1. Profile photos і covers через R2 із серверною авторизацією.
2. Home: personal tasks, planned events, announcements, company links.
3. Time Advanced: weekly/list views, project time, autofill і
   missing-clock-out flow.
4. Assets.
5. Document folders.
6. Knowledge Base.

Працюй короткими завершеними vertical slices, але не створюй декоративні
макети без backend persistence. Зберігай наявну модульну архітектуру:
D1/Drizzle для даних, R2 для файлів, Zod для API, серверні permissions,
audit events, українська локалізація. Не віддавай чутливі HR-дані у frontend
без permission check.

Перед кожною зміною перевір `git status`. Не перезаписуй чужі зміни. Для
schema changes створюй **лише** нову immutable-міграцію в `migrations/`:
це єдина production-історія Wrangler/D1. `drizzle/` можна використати тільки
як локальний чернетковий output `drizzle-kit generate`, але не як другу
історію, не для deploy і не для ручного дублювання SQL. Після кожного
інкременту запускай форматування, typecheck, усі тести та build.

У репозиторії є `.openai/hosting.json`, тому використовуй Sites skill і
наявний project ID, якщо цей акаунт має до нього доступ. Не викликай
`create_site`, коли доступ до чинного проєкту працює. Якщо доступу немає,
спочатку повідом про це: не створюй новий проєкт мовчки, бо це втратить
чинні D1/R2 та URL.

Я дозволяю публікувати кожний перевірений інкремент у production без
повторного підтвердження. Після деплою коротко напиши, що зроблено, новий
відсоток MVP 2 і production URL. Економ токени: не повторюй великий аналіз і
не переказуй увесь roadmap у кожній відповіді.

Починай із перевірки поточного стану й реалізації profile photos/covers.

---
