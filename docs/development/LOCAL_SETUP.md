# Local setup (no cloud credentials required)

Tested target: Linux, Node.js 22.22.2, npm 10.9.7, Bash and an npm registry connection. macOS/WSL may work with those tools; their runtime was not tested. Use an extracted private directory and the root npm lockfile.

```bash
node --version
npm --version
npm ci
cp .env.example .env
npm run build
npm run db:migrate:local:built
npx wrangler d1 execute incora-people --local --persist-to "$PWD/.wrangler/state" \
  --file db/demo-seed.sql -c dist/server/wrangler.json
npm start -- --local --ip 127.0.0.1 --port 8787
```

Open `http://127.0.0.1:8787`. The sanitized example selects an isolated demo identity listed in the sanitized seed. D1/R2 emulation persists under `.wrangler/state`. A blank database ID uses a placeholder for local only; keep remote credentials out of this checkout. R2 emulation accepts synthetic fixtures; never import production R2 or an employee backup. `npm run dev` is the Vite alternative; separate preview state/ports can differ from built Wrangler preview. Use the built flow above for parity.

In a second shell, run `npm run quality` and `npm run build` when the preview is stopped (build regenerates dist). With the built demo running, optionally run `BASE_URL=http://127.0.0.1:8787 npm run test:e2e:local`; the suite exercises versioned client auth locally, not a shipping mobile/extension release. `npm test` includes isolated SQLite simulations. Avoid `npm audit fix` and unconstrained installs during handoff.

For legitimate protected-mode tests, use a separate owner-approved dev OAuth client/config and actual dev callback as allowed by Google, provision synthetic users in isolated local D1, set `APP_MODE=protected`, `AUTH_PROVIDER=google`, `GOOGLE_CLIENT_ID`, local `PUBLIC_APP_URL` as appropriate, and put the client secret/auth signing secret in ignored `.dev.vars`. Verify actual host, cookie and callback behavior; the email origin validator does not permit a loopback production URL. Do not reuse production OAuth secrets or create an authentication backdoor. For demo/UI checks the existing app mode is enough.

Troubleshooting: use Node 22 if node:sqlite or strip-types fails. Rebuild after env edits. If a preview has no records confirm the same directory for `--persist-to` and check local migrations. For a clean test use a new temporary persistence directory, not a reset of an existing DB. For empty permissions use test fixtures and actual role admission. Never “fix” local failures by adding `--remote`.
