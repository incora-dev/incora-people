import { formatIncoraEmailSender } from "../notifications/email-sender.ts";
import {
  EMAIL_PALETTE as palette,
  EMAIL_THEME_HEAD,
} from "../notifications/email-theme.ts";

export { isValidInvitationSender } from "../notifications/email-sender.ts";

export type InvitationAccount = {
  id: number;
  email: string;
  role: string;
  enabled: boolean;
  employeeId: number | null;
  protectedAdmin: boolean;
};

export type InvitationEmployee = {
  id: number;
  firstName: string;
  email: string;
  status: string;
};

export type InvitationEligibilityCode =
  | "employee_missing"
  | "account_missing"
  | "identity_ambiguous"
  | "email_mismatch"
  | "invalid_email"
  | "account_disabled"
  | "employee_terminated"
  | "system_account";

export function invitationEligibilityCode(input: {
  employee: InvitationEmployee | null;
  accounts: InvitationAccount[];
}): InvitationEligibilityCode | null {
  const { employee, accounts } = input;
  if (!employee) return "employee_missing";
  if (accounts.length === 0) return "account_missing";
  if (accounts.length !== 1) return "identity_ambiguous";

  const account = accounts[0];
  const employeeEmail = normalizeInvitationEmail(employee.email);
  const accountEmail = normalizeInvitationEmail(account.email);
  if (account.employeeId !== employee.id || employeeEmail !== accountEmail) {
    return "email_mismatch";
  }
  if (!isValidWorkEmail(employeeEmail)) return "invalid_email";
  // HR admins and managers can also be real employees with a linked account.
  // Do not send to Super Admin or any role outside the employee-facing roles.
  if (
    account.protectedAdmin ||
    !["employee", "manager", "hr_admin"].includes(account.role)
  ) {
    return "system_account";
  }
  if (employee.status === "inactive") return "employee_terminated";
  if (!account.enabled) return "account_disabled";
  return null;
}

export function normalizeInvitationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidWorkEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parseInvitationPublicOrigin(
  configuredUrl: string,
  appMode: string,
) {
  try {
    const url = new URL(configuredUrl.trim());
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const reservedHost =
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".invalid") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname.startsWith("[");
    const isDemo = appMode === "demo";
    const validProtocol =
      url.protocol === "https:" || (isDemo && url.protocol === "http:");
    if (
      !validProtocol ||
      (!isDemo && reservedHost) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "") ||
      (url.port && !isDemo)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function getInvitationLoginActivity(input: {
  lastLoginAt: string | null;
  accountCreatedAt: string | null;
}): "logged_in" | "not_logged_in" | "unknown" {
  if (input.lastLoginAt) return "logged_in";
  if (input.accountCreatedAt) return "not_logged_in";
  return "unknown";
}

export type InvitationEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export function buildEmployeeInvitationPayload(input: {
  from: string;
  firstName: string;
  email: string;
  locale: string;
  publicOrigin: string;
  preview?: boolean;
}): InvitationEmailPayload {
  const english = input.locale === "en";
  const loginUrl = new URL("/api/auth/google", input.publicOrigin);
  loginUrl.searchParams.set("returnTo", "/");
  const logoUrl = new URL(
    "/assets/incora-google-chat-avatar.png",
    input.publicOrigin,
  ).toString();
  const previewNotice = input.preview
    ? english
      ? "TEST — This is a test email. No changes were made to your account."
      : "TEST — Це тестовий лист. Жодних змін в обліковому записі не внесено."
    : "";
  const safeName = escapeHtml(input.firstName);
  const subject = english
    ? "You're invited to INCORA People"
    : "Запрошення до INCORA People";
  const greeting = english ? `Hi, ${safeName}!` : `Привіт, ${safeName}!`;
  const plainGreeting = english
    ? `Hi, ${input.firstName}!`
    : `Привіт, ${input.firstName}!`;
  const explanation = english
    ? "You’ve been invited to INCORA People, INCORA’s internal HR system."
    : "Тебе запрошено до INCORA People — внутрішньої HR-системи INCORA.";
  const loginInstruction = english
    ? "To get started, select the button below and sign in with the Google account that received this email."
    : "Щоб почати, натисни кнопку нижче та увійди через Google з акаунта, на який отримав цей лист.";
  const support = english
    ? "If you have any questions about access, contact HR."
    : "Якщо виникнуть питання з доступом, звернися до HR.";
  const button = english
    ? "Sign in to INCORA People"
    : "Увійти в INCORA People";
  const text = [
    ...(previewNotice ? [previewNotice, ""] : []),
    plainGreeting,
    "",
    explanation,
    "",
    loginInstruction,
    "",
    `${button}: ${loginUrl.toString()}`,
    "",
    support,
  ].join("\n");
  const html = `<!doctype html>
<html lang="${english ? "en" : "uk"}"><head>${EMAIL_THEME_HEAD}</head>
<body class="incora-email-bg incora-email-ink" style="margin:0;background-color:${palette.background};font-family:Arial,sans-serif;color:${palette.ink}">
<table class="incora-email-bg" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.background}"><tr><td align="center" style="padding:20px 12px">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0"><tr><td><![endif]-->
<table class="incora-email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${palette.card}" style="max-width:560px;background-color:${palette.card};border:1px solid ${palette.border};border-radius:12px">
<tr><td align="left" style="padding:24px">
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:18px"><tr>
    <td><img class="incora-email-logo" src="${escapeHtml(logoUrl)}" width="32" height="32" alt="" style="display:block;border:0;border-radius:4px;background-color:${palette.card}"></td>
    <td class="incora-email-ink" style="padding-left:10px;color:${palette.ink};font-size:13px;font-weight:700;letter-spacing:.04em">INCORA PEOPLE</td>
  </tr></table>
  ${previewNotice ? `<p class="incora-email-secondary" style="margin:0 0 14px;color:${palette.secondary};font-size:13px;line-height:1.5">${escapeHtml(previewNotice)}</p>` : ""}
  <h1 class="incora-email-ink" style="margin:0 0 16px;color:${palette.ink};font-size:22px;line-height:1.3">${greeting}</h1>
  <p class="incora-email-ink" style="margin:0 0 14px;color:${palette.ink};font-size:15px;line-height:1.6">${escapeHtml(explanation)}</p>
  <p class="incora-email-ink" style="margin:0 0 24px;color:${palette.ink};font-size:14px;line-height:1.6">${escapeHtml(loginInstruction)}</p>
  <p style="margin:0 0 24px"><a class="incora-email-cta" href="${escapeHtml(loginUrl.toString())}" style="display:inline-block;padding:12px 20px;border-radius:8px;background-color:${palette.ctaBackground};color:${palette.ctaInk};font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(button)}</a></p>
  <p class="incora-email-secondary" style="margin:0;color:${palette.secondary};font-size:13px;line-height:1.5">${escapeHtml(support)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    from: formatIncoraEmailSender(input.from),
    to: [input.email],
    subject: input.preview ? `[TEST] ${subject}` : subject,
    html,
    text,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
