# INCORA People handoff conventions

Read START_HERE.md, docs/architecture/OVERVIEW.md and docs/project/CURRENT_STATUS.md first. Use npm lockfile and Node 22; run npm run quality and npm run build. Keep all worktree changes. Put UI and HTTP adapters in app/ and components/, domain work in modules/, common runtime concerns in lib/. Preserve scope checks in both APIs and server data exports; do not leak private data into DTOs.

Use isolated local D1/R2 and synthetic fixtures. Do not deploy or modify remote data, DNS, Google OAuth, storage, secrets or notification providers without explicit approval. The handoff's legacy migration samples contain anonymized literals; compare against the authorized historical originals before proposing any migration or deployment. Respect the deferred client scope.
