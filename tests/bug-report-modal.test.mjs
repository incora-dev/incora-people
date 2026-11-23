import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_BUG_SCREENSHOT_SIZE,
  validateBugScreenshot,
} from "../modules/bugs/client-validation.ts";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("bug report screenshot validation matches the upload contract", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) {
    assert.equal(validateBugScreenshot({ type, size: 1 }), null);
    assert.equal(
      validateBugScreenshot({ type, size: MAX_BUG_SCREENSHOT_SIZE }),
      null,
    );
  }
  assert.equal(validateBugScreenshot(null), "Choose an image file.");
  assert.equal(
    validateBugScreenshot({ type: "image/png", size: 0 }),
    "Choose an image file.",
  );
  assert.equal(
    validateBugScreenshot({ type: "application/pdf", size: 1 }),
    "Upload a JPEG, PNG or WebP image.",
  );
  assert.equal(
    validateBugScreenshot({
      type: "image/png",
      size: MAX_BUG_SCREENSHOT_SIZE + 1,
    }),
    "The maximum file size is 10 MB.",
  );
});

test("bug report uses the shared dialog shell and scoped, recoverable form behavior", async () => {
  const [component, css, route] = await Promise.all([
    source("components/BugReportDialog.tsx"),
    source("app/globals.css"),
    source("app/api/bug-reports/route.ts"),
  ]);

  assert.match(component, /className="dialog bug-report-dialog"/);
  assert.match(component, /className="dialog-header"/);
  assert.doesNotMatch(component, /dialog-card|dialog-heading/);
  assert.match(component, /validateBugScreenshot/);
  assert.match(component, /submissionRef\.current/);
  assert.match(component, /finally\s*\{/);
  assert.match(component, /removeScreenshot/);
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(component, /\/api\/bug-reports/);
  assert.match(route, /validatePrivateImage/);
  assert.match(route, /storePrivateFile/);
  assert.match(css, /\.dialog\.bug-report-dialog\s*\{/);
  assert.match(css, /\.bug-report-dialog textarea\s*\{/);
  assert.match(css, /\.bug-report-dialog \.bug-upload\s*\{/);
  assert.match(css, /\.bug-report-dialog \.dialog-actions\s*\{/);
});
