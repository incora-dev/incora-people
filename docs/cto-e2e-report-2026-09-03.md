> Historical source note. Start with [START_HERE](../START_HERE.md) for verified handoff instructions. Treat commands and release claims below as historical.

# Локальний авторизований E2E-прогін

Дата: 3 вересня 2026 року  
Середовище: локальний Cloudflare Worker, D1/R2 local bindings, `APP_MODE=demo`  
Дані: лише synthetic/demo account, production Cloudflare і реальні персональні
дані не використовувалися.

## Результат

- 16 web-маршрутів (сторінки та `/api/me`) — HTTP 200;
- unauthenticated Mobile API request — HTTP 401;
- PKCE `authorize` — HTTP 302 із валідними `state` і одноразовим code;
- PKCE `token` exchange — HTTP 200;
- 13 Mobile API маршрутів з bearer token — HTTP 200;
- `/api/v1/admin/overview` для demo super-admin — HTTP 200;
- перше використання refresh token — HTTP 200;
- повторне використання refresh token — HTTP 401, token family revoked.

Прогін відтворюється командою:

```bash
npm run start -- --port 3100
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:local
```

Тест не друкує access/refresh tokens, cookies або персональні дані.

## Межі прогону

Це локальний authenticated API smoke/E2E, а не production penetration test.
Google OAuth, Cloudflare Access, реальний push, R2 malware scanner, фізичні
Android/iOS builds і browser UI automation потребують окремих тестових
облікових записів та production-like інфраструктури.
