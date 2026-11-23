# INCORA People: start here

INCORA People is INCORA's internal employee management platform. This handoff is for the web application. Deferred mobile and browser-extension sources are included for reference, not release.

1. Keep the two ZIPs and SHA256SUMS together. Verify them with `sha256sum -c SHA256SUMS` on Linux or `shasum -a 256 -c SHA256SUMS` on macOS.
2. Extract the source ZIP into a new directory you own. Extract the conversation ZIP alongside it. The source ZIP is a sanitized working-tree snapshot, not a replacement for the company's private Git history.
3. Install Node.js 22.22.2 and npm 10.9.7 (verified). Then follow [local setup](docs/development/LOCAL_SETUP.md). The minimum in package.json is Node 22.13; use the verified version first.
4. Read the [architecture](docs/architecture/OVERVIEW.md), [feature map](docs/product/MODULES.md), [current state](docs/project/CURRENT_STATUS.md), and [production map](docs/infrastructure/PRODUCTION.md).
5. To continue in Codex, open the extracted `incora-people` directory, start a new chat, and paste the prompt from `conversation-handoff/START_NEW_CODEX_SESSION.md`. See that archive's `SESSION_INDEX.md` and `RESUME_INSTRUCTIONS.md`; no native session import is required.
6. Request least-privilege private Git access, owner-approved development OAuth credentials if needed, and separately authorized production Cloudflare/Google Console/Route 53/Resend/Chat access only for responsibilities assigned to you. Use the organization's secret manager; do not ask for the previous developer's session or tokens.

Never deploy, restore, migrate, seed, change worker secrets, change DNS/OAuth, or trigger real delivery without explicit production authorization. Do not point a demo or test at remote D1/R2. For a future authorized release use the [deployment](docs/deployment/DEPLOYMENT.md) and [rollback](docs/deployment/ROLLBACK.md) runbooks. Read [archive limitations](docs/project/DOCUMENTATION_AUDIT.md) before publishing or regenerating migrations.

The original workstation path is recorded historically in the conversation index. No setup step depends on it. `SOURCE-SNAPSHOT.json` records the base commit, included dirty paths and sanitization differences.
