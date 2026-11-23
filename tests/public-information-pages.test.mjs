import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPublicInformationPath } from "../modules/shared/public-information.ts";

test("only the three informational pages bypass application sign-in", () => {
  for (const path of ["/about", "/privacy", "/terms", "/about/", "/privacy/"]) {
    assert.equal(
      isPublicInformationPath(path),
      true,
      `${path} should be public`,
    );
  }
  for (const path of [
    "/",
    "/login",
    "/employees",
    "/about/extra",
    "/terms-else",
  ]) {
    assert.equal(
      isPublicInformationPath(path),
      false,
      `${path} is not a public info page`,
    );
  }
});

test("OAuth information pages disclose verified product and sign-in details", async () => {
  const [about, privacy, terms, auth, worker, shell] = await Promise.all([
    readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/terms/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/auth/google/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(about, /INCORA People/);
  assert.match(about, /employee management platform/);
  assert.match(about, /href="\/login"/);
  assert.match(privacy, /openid/);
  assert.match(privacy, /email/);
  assert.match(privacy, /profile/);
  assert.match(privacy, /Cloudflare D1/);
  assert.match(privacy, /info@incorainc\.com/);
  assert.match(terms, /Authorized access/);
  assert.match(auth, /scope: "openid email profile"/);
  assert.match(worker, /isPublicInformationPath\(url\.pathname\)/);
  assert.match(shell, /pathname === "\/login" \|\| isPublicInformationPage/);
  assert.match(shell, /if \(isPublicInformationPage\) return;/);
});
