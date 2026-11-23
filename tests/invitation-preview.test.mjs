import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildEmployeeInvitationPayload } from "../modules/invitations/domain.ts";
import { sendEmployeeInvitationPreview } from "../modules/invitations/preview.ts";

const publicOrigin = "https://incora-people.incora-people.workers.dev";

test("Employee invitation preview uses the real localized template and sends only to the fixed owner", async () => {
  for (const [locale, name, subject, button] of [
    ["uk", "Данило", "Запрошення до INCORA People", "Увійти в INCORA People"],
    [
      "en",
      "Danylo",
      "You're invited to INCORA People",
      "Sign in to INCORA People",
    ],
  ]) {
    let calls = 0;
    const result = await sendEmployeeInvitationPreview({
      from: "info@incorainc.com",
      publicOrigin,
      locale,
      requestId: "preview-fixture",
      email: "other@example.test",
      apiKey: "mock-only",
      fetcher: async (url, init) => {
        calls++;
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(
          init.headers["idempotency-key"],
          "invitation-preview/preview-fixture",
        );
        const payload = JSON.parse(init.body);
        assert.deepEqual(Object.keys(payload).sort(), [
          "from",
          "html",
          "subject",
          "text",
          "to",
        ]);
        assert.deepEqual(payload.to, ["danylo.karpa@incorainc.com"]);
        assert.equal(payload.from, "INCORA People <info@incorainc.com>");
        assert.equal(payload.subject, "[TEST] " + subject);
        const notice =
          locale === "en"
            ? "TEST — This is a test email. No changes were made to your account."
            : "TEST — Це тестовий лист. Жодних змін в обліковому записі не внесено.";
        assert.ok(payload.html.includes(notice));
        assert.ok(payload.text.startsWith(notice + "\n\n"));
        const regular = buildEmployeeInvitationPayload({
          from: "info@incorainc.com",
          firstName: name,
          email: payload.to[0],
          locale,
          publicOrigin,
        });
        assert.equal(regular.subject, subject);
        assert.equal(
          payload.html.replace(/<p[^>]*>TEST — [^<]*<\/p>/, ""),
          regular.html,
        );
        assert.equal(
          payload.text.split("\n").slice(2).join("\n"),
          regular.text,
        );
        assert.ok(payload.html.includes(`<html lang="${locale}">`));
        assert.ok(payload.html.includes('name="viewport"'));
        assert.ok(
          payload.html.includes(
            publicOrigin + "/assets/incora-google-chat-avatar.png",
          ),
        );
        assert.ok(
          payload.html.includes(button) && payload.text.includes(button),
        );
        const link = new URL(
          payload.html.match(/<a\b[^>]*\bhref="([^"]+)"/)[1],
        );
        assert.equal(link.origin, publicOrigin);
        assert.equal(link.pathname, "/api/auth/google");
        assert.deepEqual([...link.searchParams.entries()], [["returnTo", "/"]]);
        return Response.json({ id: "mock-message-id" });
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      kind: "accepted",
      messageId: "mock-message-id",
    });
  }
});

test("existing invitation renderer escapes names for HTML without double-encoding plain text", () => {
  const result = buildEmployeeInvitationPayload({
    from: "info@incorainc.com",
    firstName: "Данило & <test> ✅",
    email: "fixture@example.test",
    locale: "uk",
    publicOrigin,
  });
  assert.ok(result.html.includes("Данило &amp; &lt;test&gt; ✅"));
  assert.ok(!result.html.includes("<test>"));
  assert.ok(result.text.includes("Данило & <test> ✅"));
  assert.ok(!result.text.includes("[TEST]"));
});

test("invitation route uses the shared guard and never imports real workflow or queue commands", async () => {
  const root = new URL("../", import.meta.url);
  const source = (file) => readFile(new URL(file, root), "utf8");
  const [invitationRoute, announcementRoute, preview, handler, view] =
    await Promise.all([
      source("app/api/admin/home/invitation-email-preview/route.ts"),
      source("app/api/admin/home/announcement-email-preview/route.ts"),
      source("modules/invitations/preview.ts"),
      source("modules/notifications/admin-email-preview.ts"),
      source("components/admin/AnnouncementEmailPreview.tsx"),
    ]);
  assert.match(
    invitationRoute,
    /handleAdminEmailPreview\(request, "invitation"/,
  );
  assert.match(
    announcementRoute,
    /handleAdminEmailPreview\(request, "announcement"/,
  );
  assert.match(invitationRoute, /getEmployeeInvitationConfig\(\)/);
  assert.match(invitationRoute, /sendEmployeeInvitationPreview\(/);
  assert.match(preview, /buildEmployeeInvitationPayload\(/);
  assert.match(view, /sendPreview\(previewActions\.invitation\)/);
  assert.doesNotMatch(
    invitationRoute + preview + handler,
    /invitations\/commands|invitation_attempts|employeeInvitations|enqueue|postAnnouncementWebhook|processAnnouncementDeliveries|request\.json/,
  );
});
