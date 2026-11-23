# Current status — 2026-11-20

- **Deployed baseline:** Worker `1bc89de0-6e7b-4670-95ec-8227b448f510` (2026-11-19), binding independent endpoint/intent for admin announcement and invitation previews. Previous version `2a4450b2-10e3-43c2-9f9c-7c1cd949a145`. Session release report recorded 253 passing tests for the deployed baseline; this is not the handoff snapshot's test count.
- **Local source:** dirty branch `main`, base `f7119f7f5a84402f1efbaf99791900fe4b739946`. The copied working tree is newer than Git HEAD and production. See `SOURCE-SNAPSHOT.json` for scoped changes and share-safe substitutions. Do not assume HEAD is deployable as-is or that deployed source was reproduced byte-for-byte.
- **Unreleased:** simplified Ukrainian/English invitation text, preview-only test notice and shared light/dark contrast improvements in invitation/announcement email markup. Handoff does not authorize deployment or sending email.
- **Live verified here:** strict unauthenticated web checks and DNS/gateway routing. Provider secret binding names exist; values and delivery were not tested. Production migration list showed no pending changes. Mobile/extension excluded from active scope.
- **Verified historically, not re-run live here:** Google sign-in, limited notification trials, previous release checks, and safe local deletion tests. Never translate “provider accepted” into “delivered to inbox.”
- See [module status and limits](../product/MODULES.md), [known issues](KNOWN_ISSUES.md), and the handoff verification report.
