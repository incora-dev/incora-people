import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  announcementChatText,
  announcementTitleText,
  plainAnnouncementText,
  sanitizeAnnouncementHtml,
} from "../modules/announcements/content.ts";
import { buildEmployeeInvitationPayload } from "../modules/invitations/domain.ts";
import {
  buildAnnouncementEmailPayload,
  sendAnnouncementEmails,
} from "../modules/announcements/email.ts";
import {
  CLAIM_ANNOUNCEMENT_DELIVERY_SQL,
  ENQUEUE_ANNOUNCEMENT_DELIVERY_SQL,
} from "../modules/announcements/delivery-domain.ts";
import { postAnnouncementWebhook } from "../modules/announcements/webhook.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("website React preview displays ampersands, legacy entities, and Unicode as text", async () => {
  const input =
    "<p>Research &amp; Development — Україна 🚀</p><p>&lt;img src=x onerror=alert(1)&gt; &quot;Q&quot; &#39;A&#39;</p>";
  const expected =
    "Research & Development — Україна 🚀 <img src=x onerror=alert(1)> \"Q\" 'A'";
  assert.equal(plainAnnouncementText(input), expected);
  const preview = renderToStaticMarkup(
    createElement("p", null, plainAnnouncementText(input)),
  );
  assert.match(preview, /Research &amp; Development/);
  assert.doesNotMatch(preview, /&amp;amp;|<img/);
  assert.match(
    await source("app/page.tsx"),
    /\{plainAnnouncementText\(announcement.body\)\}/,
  );
  assert.equal(announcementTitleText("R&amp;D &lt;2026&gt;"), "R&D <2026>");
  assert.equal(announcementTitleText("R&amp;amp;D"), "R&amp;D");
  const rich = sanitizeAnnouncementHtml(input);
  assert.equal(sanitizeAnnouncementHtml(rich), rich);
  assert.equal(plainAnnouncementText(rich), expected);
  assert.equal(
    plainAnnouncementText("<p>Research & Development<br>Next</p>"),
    "Research & Development Next",
  );
  assert.equal(
    plainAnnouncementText("<script>unsafe()</script><p>ok</p>"),
    "ok",
  );
  assert.doesNotMatch(
    sanitizeAnnouncementHtml(
      '<a href="javascript:alert(1)" onclick="bad()">Link</a>',
    ),
    /javascript:|onclick/,
  );
  assert.match(
    announcementChatText(
      "R&amp;D",
      input,
      "https://example.test/announcements/1",
    ),
    /\*R&D\*\nResearch & Development/,
  );
});

test("announcement and invitation payloads share the branded sender and escape by context", () => {
  const url = "https://people.incora.software/announcements/42?a=1&b=2";
  const announcement = buildAnnouncementEmailPayload({
    from: "info@incorainc.com",
    recipient: { email: "reader@example.test", locale: "en" },
    title: "R&amp;D &lt;2026&gt;",
    body: "<p>Research &amp; Development &lt;script&gt; 🚀</p>",
    announcementUrl: url,
  });
  const invitation = buildEmployeeInvitationPayload({
    from: "Old Sender <info@incorainc.com>",
    firstName: "Test",
    email: "reader@example.test",
    locale: "en",
    publicOrigin: "https://people.incora.software",
  });
  assert.equal(announcement.from, "INCORA People <info@incorainc.com>");
  assert.equal(invitation.from, announcement.from);
  assert.equal(announcement.subject, "R&D <2026>");
  assert.match(announcement.text, /Research & Development <script> 🚀/);
  assert.ok(announcement.text.includes(url));
  assert.match(
    announcement.html,
    /Research &amp; Development &lt;script&gt; 🚀/,
  );
  assert.doesNotMatch(announcement.html, /<script>|&amp;amp;/);
  assert.match(announcement.html, /max-width:620px/);
  assert.match(announcement.html, /\[if mso\]/);
  assert.match(announcement.html, /a=1&amp;b=2/);
  assert.match(announcement.html, /incora-google-chat-avatar\.png/);
  assert.match(announcement.html, /Automated notification from INCORA People/);
});

test("announcement email templates are localized, safe, and link to the canonical page", () => {
  const input = {
    from: "INCORA People <info@incorainc.com>",
    title: "Оновлення <script>alert(1)</script>",
    body: "<p>Новина <strong>для команди</strong></p><script>secret()</script>",
    announcementUrl: "https://people.incora.software/announcements/42",
  };
  const ukrainian = buildAnnouncementEmailPayload({
    ...input,
    recipient: { email: " Team.Member@incorainc.com ", locale: "uk" },
  });
  assert.equal(ukrainian.from, input.from);
  assert.deepEqual(ukrainian.to, ["team.member@incorainc.com"]);
  assert.match(ukrainian.html, /lang="uk"/);
  assert.match(ukrainian.html, /Переглянути оголошення/);
  assert.match(
    ukrainian.html,
    /https:\/\/people\.incora\.software\/announcements\/42/,
  );
  assert.doesNotMatch(ukrainian.html, /<script>/);
  assert.match(ukrainian.text, /Новина для команди/);

  const english = buildAnnouncementEmailPayload({
    ...input,
    recipient: { email: "member@example.test", locale: "en" },
  });
  assert.match(english.html, /lang="en"/);
  assert.match(english.html, /View announcement/);
});

test("Resend sends individual recipient messages in idempotent batches", async () => {
  const payloads = Array.from({ length: 101 }, (_, index) =>
    buildAnnouncementEmailPayload({
      from: "INCORA People <info@incorainc.com>",
      recipient: {
        email: `person${index}@example.test`,
        locale: index % 2 ? "en" : "uk",
      },
      title: "Synthetic announcement",
      body: "<p>Test only</p>",
      announcementUrl: "https://people.incora.software/announcements/123",
    }),
  );
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return new Response(
      JSON.stringify({
        data: body.map((_, index) => ({ id: `email-${index}` })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const result = await sendAnnouncementEmails({
    announcementId: 123,
    deliveryId: 456,
    payloads,
    apiKey: "synthetic-only-key",
    fetcher,
  });
  assert.deepEqual(result, { kind: "accepted" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.resend.com/emails/batch");
  assert.equal(calls[0].body.length, 100);
  assert.equal(calls[1].body.length, 1);
  assert.equal(calls[0].body[0].to.length, 1);
  assert.equal(
    calls[0].init.headers.authorization,
    "Bearer synthetic-only-key",
  );
  assert.notEqual(
    calls[0].init.headers["idempotency-key"],
    calls[1].init.headers["idempotency-key"],
  );

  const retryCalls = [];
  await sendAnnouncementEmails({
    announcementId: 123,
    deliveryId: 456,
    payloads,
    apiKey: "synthetic-only-key",
    fetcher: async (_url, init) => {
      retryCalls.push(init.headers["idempotency-key"]);
      return new Response(
        JSON.stringify({
          data: JSON.parse(init.body).map(() => ({ id: "same" })),
        }),
        { status: 200 },
      );
    },
  });
  assert.deepEqual(
    retryCalls,
    calls.map((call) => call.init.headers["idempotency-key"]),
  );
});

test("Resend errors distinguish permanent rejection from retryable uncertainty", async () => {
  const input = {
    announcementId: 1,
    deliveryId: 2,
    payloads: [
      {
        from: "INCORA People <info@incorainc.com>",
        to: ["recipient@example.test"],
        subject: "test",
        html: "<p>test</p>",
        text: "test",
      },
    ],
    apiKey: "synthetic-only-key",
  };
  for (const [status, result] of [
    [403, { kind: "rejected", failureCode: "resend_authentication" }],
    [429, { kind: "uncertain", failureCode: "resend_rate_limit" }],
    [503, { kind: "uncertain", failureCode: "resend_temporary_error" }],
  ]) {
    assert.deepEqual(
      await sendAnnouncementEmails({
        ...input,
        fetcher: async () => new Response("safe", { status }),
      }),
      result,
    );
  }
});

test("partial or ambiguous Resend batches are not automatically retried", async () => {
  const payload = (email) => ({
    from: "INCORA People <info@incorainc.com>",
    to: [email],
    subject: "test",
    html: "<p>test</p>",
    text: "test",
  });
  const payloads = Array.from({ length: 101 }, (_, index) =>
    payload(`person${index}@example.test`),
  );
  let calls = 0;
  const result = await sendAnnouncementEmails({
    announcementId: 7,
    deliveryId: 8,
    payloads,
    apiKey: "synthetic-only-key",
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? new Response(
            JSON.stringify({
              data: Array.from({ length: 100 }, () => ({ id: "accepted" })),
            }),
            { status: 200 },
          )
        : new Response("provider outcome unavailable", { status: 503 });
    },
  });
  assert.deepEqual(result, {
    kind: "uncertain",
    failureCode: "resend_partial_batch_uncertain",
  });
  assert.equal(calls, 2);
});

test("queue re-enqueue preserves sent and uncertain deliveries and atomically claims one worker", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE announcement_deliveries (
      id INTEGER PRIMARY KEY,
      announcement_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      sent_at TEXT,
      UNIQUE(announcement_id, channel)
    )
  `);
  const enqueue = db.prepare(ENQUEUE_ANNOUNCEMENT_DELIVERY_SQL);
  enqueue.run(5, "email", "2026-11-17T10:00:00.000Z");
  const claim = db.prepare(CLAIM_ANNOUNCEMENT_DELIVERY_SQL);
  assert.equal(claim.run(1, 0).changes, 1);
  assert.equal(
    claim.run(1, 0).changes,
    0,
    "a concurrent worker cannot claim twice",
  );
  db.prepare(
    "UPDATE announcement_deliveries SET status='sent', sent_at=? WHERE id=1",
  ).run("2026-11-17T10:01:00.000Z");
  enqueue.run(5, "email", "2026-11-17T11:00:00.000Z");
  const sentRow = db
    .prepare(
      "SELECT status, attempts, sent_at, scheduled_for FROM announcement_deliveries",
    )
    .get();
  assert.equal(sentRow.status, "sent");
  assert.equal(sentRow.attempts, 1);
  assert.equal(sentRow.sent_at, "2026-11-17T10:01:00.000Z");
  assert.equal(sentRow.scheduled_for, "2026-11-17T10:00:00.000Z");
  db.prepare(
    "UPDATE announcement_deliveries SET status='failed', last_error='retry'",
  ).run();
  enqueue.run(5, "email", "2026-11-17T12:00:00.000Z");
  const retriedRow = db
    .prepare("SELECT status, attempts, last_error FROM announcement_deliveries")
    .get();
  assert.equal(retriedRow.status, "pending");
  assert.equal(retriedRow.attempts, 0);
  assert.equal(retriedRow.last_error, "");
  db.prepare(
    "UPDATE announcement_deliveries SET status='uncertain', attempts=1, last_error='reconcile first' WHERE id=1",
  ).run();
  enqueue.run(5, "email", "2026-11-17T13:00:00.000Z");
  const uncertainRow = db
    .prepare("SELECT status, attempts, last_error FROM announcement_deliveries")
    .get();
  assert.equal(uncertainRow.status, "uncertain");
  assert.equal(uncertainRow.attempts, 1);
  assert.equal(uncertainRow.last_error, "reconcile first");
  assert.equal(claim.run(1, 1).changes, 0);
  db.close();
});

test("Google Chat/webhook sends can be verified with a fake endpoint only", async () => {
  const calls = [];
  const response = await postAnnouncementWebhook(
    "https://chat.example.test/fake-webhook",
    {
      text: "📣 Synthetic announcement\nhttps://people.incora.software/announcements/1",
    },
    {
      secret: "synthetic-secret",
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return new Response("ok", { status: 200 });
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].init.headers["x-incora-webhook-secret"],
    "synthetic-secret",
  );
  assert.match(JSON.parse(calls[0].init.body).text, /announcements\/1/);
  await assert.rejects(
    postAnnouncementWebhook(
      "https://chat.example.test/fake-webhook",
      { text: "synthetic" },
      { fetcher: async () => new Response("", { status: 503 }) },
    ),
    /Webhook returned 503/,
  );
});

test("announcement flow filters recipients, respects archive/expiry, and prefers Resend", async () => {
  const [delivery, runtime, adminRetry] = await Promise.all([
    source("modules/announcements/delivery.ts"),
    source("lib/runtime-config.ts"),
    source("app/api/admin/home/announcements/[id]/deliveries/route.ts"),
  ]);
  const adminSettings = await source(
    "components/admin/HomeContentSettings.tsx",
  );
  assert.match(delivery, /employedInvitedEmployeeCondition\(\)/);
  assert.match(delivery, /eq\(users\.enabled, true\)/);
  assert.match(
    delivery,
    /lower\(trim\(\$\{users\.email\}\)\).*employees\.email/s,
  );
  assert.match(delivery, /config\.resendApiKey/);
  assert.match(delivery, /sendAnnouncementEmails/);
  assert.match(delivery, /config\.emailWebhookUrl/);
  assert.match(delivery, /eq\(announcementDeliveries\.attempts, 0\)/);
  assert.match(delivery, /"uncertain"/);
  const active = await source("modules/people/active.ts");
  assert.match(
    active,
    /and\(eq\(employees\.status, "active"\), employeeInvitedCondition\(\)\)/,
    "announcements go only to employees who were invited",
  );
  assert.match(
    active,
    /inArray\(employees\.status, \["active", "on_leave"\]\),\s*employeeInvitedCondition\(\)/,
    "employees on leave still receive announcements",
  );
  assert.match(delivery, /eq\(announcements\.active, true\)/);
  assert.match(delivery, /announcements\.expiresAt/);
  assert.match(runtime, /RESEND_API_KEY/);
  assert.match(runtime, /INVITATION_FROM_EMAIL/);
  assert.match(
    adminRetry,
    /Archived or expired announcements cannot be delivered/,
  );
  assert.match(adminSettings, /delivery\.status === "uncertain"/);
  assert.match(adminSettings, /item\.retryable === true/);
});
