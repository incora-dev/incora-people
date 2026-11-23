import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { sendAnnouncementEmailPreview } from "../modules/announcements/email.ts";
import {
  canSendAnnouncementPreview,
  EMAIL_PREVIEW_AUDIT,
  hasEmptyAnnouncementPreviewBody,
  isSameOriginAnnouncementPreview,
  matchesEmailPreviewIntent,
  RESERVE_ANNOUNCEMENT_PREVIEW_SQL,
  safePreviewMessageId,
} from "../modules/announcements/preview-policy.ts";

test("preview posts exactly one fixed recipient through the real template and mock Resend adapter", async () => {
  let calls = 0;
  const result = await sendAnnouncementEmailPreview({
    from: "info@incorainc.com",
    publicOrigin: "https://people.example.test",
    requestId: "fake-request",
    apiKey: "fake-api-key",
    // Extra input is ignored; the renderer is not a general mail endpoint.
    recipient: "unapproved@example.test",
    fetcher: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://api.resend.com/emails/batch");
      assert.equal(
        init.headers["idempotency-key"],
        "announcement-preview/fake-request/batch/0",
      );
      const batch = JSON.parse(init.body);
      assert.equal(batch.length, 1);
      const [mail] = batch;
      assert.deepEqual(Object.keys(mail).sort(), [
        "from",
        "html",
        "subject",
        "text",
        "to",
      ]);
      assert.deepEqual(mail.to, ["danylo.karpa@incorainc.com"]);
      assert.equal(mail.from, "INCORA People <info@incorainc.com>");
      assert.match(
        mail.subject,
        /^\[TEST\] Research & Development — INCORA People$/,
      );
      assert.match(mail.html, /Research &amp; Development/);
      assert.match(
        mail.html,
        /R&amp;D, &lt;test&gt;, український текст та emoji ✅/,
      );
      assert.match(mail.html, /bgcolor="#f4c400"/);
      assert.match(
        mail.html,
        /href="https:\/\/people\.example\.test\/announcements"/,
      );
      assert.doesNotMatch(mail.html, /<test>|&amp;amp;/);
      assert.match(mail.text, /R&D, <test>, український текст та emoji ✅/);
      return Response.json({ data: [{ id: "fake-message-id" }] });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { kind: "accepted", messageId: "fake-message-id" });
  assert.equal(safePreviewMessageId(result.messageId), "fake-message-id");
  assert.equal(safePreviewMessageId("<unsafe>"), undefined);
});

test("uncertain provider outcome is not retried or redirected to a fallback", async () => {
  let calls = 0;
  const result = await sendAnnouncementEmailPreview({
    from: "info@incorainc.com",
    publicOrigin: "https://people.example.test",
    requestId: "fake-request",
    apiKey: "fake-api-key",
    fetcher: async () => {
      calls += 1;
      throw new Error("Mocked network failure");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.kind, "uncertain");
});

test("preview only accepts matching browser and request origins on either production hostname", () => {
  const origins = [
    "https://people.incora.software",
    "https://incora-people.incora-people.workers.dev",
  ];
  for (const [index, origin] of origins.entries()) {
    const otherOrigin = origins[1 - index];
    const make = (headers) =>
      new Request(origin + "/api/admin/home/announcement-email-preview", {
        method: "POST",
        headers,
      });
    const headers = {
      origin,
      "x-incora-email-preview": "announcement",
      "sec-fetch-site": "same-origin",
    };
    assert(isSameOriginAnnouncementPreview(make(headers)));
    assert(!matchesEmailPreviewIntent(make({ origin }), "announcement"));
    assert(
      !isSameOriginAnnouncementPreview(make({ ...headers, origin: "null" })),
    );
    assert(
      !isSameOriginAnnouncementPreview(
        make({ ...headers, "sec-fetch-site": "cross-site" }),
      ),
    );
    assert(
      !isSameOriginAnnouncementPreview(
        make({
          ...headers,
          origin: otherOrigin,
          "x-forwarded-host": new URL(otherOrigin).host,
          referer: otherOrigin + "/settings",
        }),
      ),
    );
  }
});

test("preview intent must match its route; obsolete clients must refresh", () => {
  for (const kind of ["announcement", "invitation"]) {
    for (const intent of ["announcement", "invitation", "1", ""]) {
      const request = new Request(
        `https://people.incora.software/api/admin/home/${kind}-email-preview`,
        { method: "POST", headers: { "x-incora-email-preview": intent } },
      );
      assert.equal(matchesEmailPreviewIntent(request, kind), intent === kind);
    }
  }
});

test("zero-byte Worker stream passes, but actual payload bytes are rejected", async () => {
  const make = (body) =>
    new Request(
      "https://people.incora.software/api/admin/home/announcement-email-preview",
      {
        method: "POST",
        headers: { "content-length": "0" },
        body,
        duplex: "half",
      },
    );
  assert(await hasEmptyAnnouncementPreviewBody(make(null)));
  const emptyStream = make(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  );
  assert(emptyStream.body, "reproduce the Worker exposing an empty stream");
  assert(await hasEmptyAnnouncementPreviewBody(emptyStream));
  assert(
    !(await hasEmptyAnnouncementPreviewBody(
      make('{"to":"other@example.test"}'),
    )),
  );
});

test("privilege requires a persisted Super Admin and no active employee preview", () => {
  assert(canSendAnnouncementPreview({ role: "super_admin", userId: 1 }));
  assert(!canSendAnnouncementPreview({ role: "hr_admin", userId: 2 }));
  assert(
    !canSendAnnouncementPreview({
      role: "super_admin",
      userId: 1,
      isPreview: true,
    }),
  );
  assert(!canSendAnnouncementPreview({ role: "super_admin", userId: null }));
});

test("audit reservation is one atomic global cooldown shared across administrators", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE audit_events (actor_email TEXT, action TEXT, entity_type TEXT, entity_id TEXT, details TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);",
    );
    const reserve = db.prepare(RESERVE_ANNOUNCEMENT_PREVIEW_SQL);
    assert.equal(
      reserve.run(
        "admin1@example.test",
        ...EMAIL_PREVIEW_AUDIT.announcement,
        "attempt-1",
      ).changes,
      1,
    );
    assert.equal(
      reserve.run(
        "admin2@example.test",
        ...EMAIL_PREVIEW_AUDIT.invitation,
        "attempt-2",
      ).changes,
      0,
    );
    const entry = db
      .prepare("SELECT actor_email, action, details FROM audit_events")
      .get();
    assert.equal(entry.actor_email, "admin1@example.test");
    assert.equal(entry.action, "announcement.email_preview_attempted");
    assert.equal(entry.details, "");
    db.exec("UPDATE audit_events SET created_at=datetime('now','-16 minutes')");
    assert.equal(
      reserve.run(
        "admin2@example.test",
        ...EMAIL_PREVIEW_AUDIT.invitation,
        "attempt-3",
      ).changes,
      1,
    );
    assert.equal(
      reserve.run(
        "admin1@example.test",
        ...EMAIL_PREVIEW_AUDIT.announcement,
        "attempt-4",
      ).changes,
      0,
    );
    assert.equal(
      db
        .prepare("SELECT action FROM audit_events ORDER BY rowid DESC LIMIT 1")
        .get().action,
      "employee_invitation.email_preview_attempted",
    );
  } finally {
    db.close();
  }
});

test("route reserves before sending and is isolated from announcement and notification writes", async () => {
  const route = await readFile(
    new URL("../modules/notifications/admin-email-preview.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /getCurrentUser\(\)[\s\S]*canSendAnnouncementPreview\(actor\)/,
  );
  assert.match(
    route,
    /isSameOriginAnnouncementPreview\(request\)[\s\S]*status: 403[\s\S]*getCurrentUser\(\)[\s\S]*AuthenticationRequiredError[\s\S]*status: 401[\s\S]*canSendAnnouncementPreview\(actor\)[\s\S]*status: 403[\s\S]*hasEmptyAnnouncementPreviewBody\(request\)[\s\S]*status: 400[\s\S]*\.prepare\(RESERVE_ANNOUNCEMENT_PREVIEW_SQL\)/,
  );
  assert.match(route, /reservation.meta.changes !== 1[\s\S]*status: 429/);
  assert.match(
    route,
    /!matchesEmailPreviewIntent\(request, kind\)[\s\S]*status: 400[\s\S]*\.prepare\(RESERVE_ANNOUNCEMENT_PREVIEW_SQL\)/,
  );
  assert.match(
    route,
    /\.prepare\(RESERVE_ANNOUNCEMENT_PREVIEW_SQL\)[\s\S]*reservation.meta.changes !== 1[\s\S]*await transport.send\(/,
  );
  assert.doesNotMatch(
    route,
    /publish|enqueue|processAnnouncementDeliveries|postAnnouncementWebhook|request\.json\(/,
  );
});
