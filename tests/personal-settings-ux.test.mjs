import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("account and personal settings stay compact without removing core actions", async () => {
  const [shell, settings, page, timer, css] = await Promise.all([
    source("components/AppShell.tsx"),
    source("components/PersonalSettings.tsx"),
    source("app/profile/settings/page.tsx"),
    source("components/GlobalTimeControl.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(shell, /session\?\.access\.manageSettings &&/);
  assert.match(shell, /aria-controls="sidebar-user-menu"/);
  assert.match(shell, /useDismissibleLayer\(userOpen, userLayerRef/);
  assert.match(shell, /window\.innerWidth - menuWidth - 12/);
  assert.match(shell, /window\.innerHeight - bounds\.top \+ 8/);
  assert.doesNotMatch(shell, /UserRoundCog/);
  assert.doesNotMatch(shell, /<Bug size=\{14\} \/> \{t\("Report a bug"\)\}/);
  assert.match(shell, /onReportBug=\{\(\) =>/);
  assert.match(shell, /className="app-footer-actions"/);

  assert.match(settings, /\/api\/preferences/);
  assert.match(settings, /name="locale"/);
  assert.match(settings, /Your bug reports/);
  assert.match(settings, /reports\.map/);
  assert.match(settings, /No bug reports yet\./);
  assert.match(settings, /status-badge/);
  assert.doesNotMatch(
    settings,
    /Reimbursements|Default work mode|\/api\/work-mode/,
  );
  assert.match(page, /select\(\{ locale: users\.locale \}\)/);
  assert.doesNotMatch(page, /defaultWorkMode|leftJoin\(employees/);

  assert.match(timer, /selectedMode/);
  assert.match(timer, /Where are you working\?/);
  assert.match(timer, /Choose where you are working before starting\./);
  assert.match(css, /\.sidebar-user-menu\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.sidebar-user-menu > a\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.personal-settings-page\s*\{[^}]*840px/s);
  assert.match(css, /\.personal-bug-reports-heading/);
  assert.match(css, /\.personal-bug-report-empty/);
});
