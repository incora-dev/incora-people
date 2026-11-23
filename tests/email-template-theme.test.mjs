import assert from "node:assert/strict";
import test from "node:test";
import { buildAnnouncementEmailPayload } from "../modules/announcements/email.ts";
import { buildEmployeeInvitationPayload } from "../modules/invitations/domain.ts";
import { EMAIL_PALETTE as palette } from "../modules/notifications/email-theme.ts";

function luminance(hex) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/../g)
    .map((part) => {
      const value = Number.parseInt(part, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

test("both email templates retain high contrast and explicit branded CTA colors", () => {
  const from = "info@incorainc.com";
  const email = "person@example.test";
  const origin = "https://people.example.test";
  const rendered = [
    buildAnnouncementEmailPayload({
      from,
      recipient: { email, locale: "uk" },
      title: "R&D",
      body: "Новина",
      announcementUrl: origin + "/announcements/12",
    }),
    buildEmployeeInvitationPayload({
      from,
      firstName: "Данило",
      email,
      locale: "uk",
      publicOrigin: origin,
    }),
  ];
  for (const { html } of rendered) {
    assert.match(html, /<meta name="color-scheme" content="light only">/);
    assert.match(html, /@media \(prefers-color-scheme: dark\)/);
    assert.match(
      html,
      /<a class="incora-email-cta"[^>]+background-color:#f4c400[^>]+color:#20231f/,
    );
    assert.match(html, /class="incora-email-secondary"[^>]+color:#454b43/);
    assert.match(
      html,
      /class="incora-email-logo"[^>]+incora-google-chat-avatar\.png/,
    );
  }
  for (const [foreground, background] of [
    [palette.ink, palette.card],
    [palette.secondary, palette.card],
    [palette.darkInk, palette.darkCard],
    [palette.darkSecondary, palette.darkCard],
    [palette.ctaInk, palette.ctaBackground],
  ]) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} on ${background}`,
    );
  }
});
