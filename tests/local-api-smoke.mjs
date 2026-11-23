import assert from "node:assert/strict";
import crypto from "node:crypto";

const origin = (process.env.BASE_URL || "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const deviceId = `local-e2e-${Date.now()}`;

const webRoutes = [
  "/",
  "/login",
  "/employees",
  "/leave",
  "/time",
  "/expenses",
  "/tasks",
  "/calendar",
  "/knowledge",
  "/settings",
  "/inventory",
  "/one-on-one",
  "/documents",
  "/projects",
  "/org",
  "/api/me",
];

const clientRoutes = [
  "/api/v1/me",
  "/api/v1/home",
  "/api/v1/people",
  "/api/v1/leave",
  "/api/v1/time/status",
  "/api/v1/time/overview",
  "/api/v1/expenses",
  "/api/v1/tasks",
  "/api/v1/knowledge",
  "/api/v1/resources",
  "/api/v1/notifications",
  "/api/v1/organization",
  "/api/v1/admin/overview",
];

for (const route of webRoutes) {
  const response = await fetch(`${origin}${route}`);
  assert.equal(
    response.status,
    200,
    `${route} returned ${response.status}; is the local Worker running in demo mode?`,
  );
}

const unauthenticated = await fetch(`${origin}/api/v1/home`);
assert.equal(unauthenticated.status, 401);

const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto
  .createHash("sha256")
  .update(verifier)
  .digest("base64url");
const state = `state-${Date.now()}`;
const authorizeUrl = new URL("/api/v1/auth/authorize", origin);
authorizeUrl.search = new URLSearchParams({
  client: "mobile",
  redirect_uri: "incora-people://auth/callback",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
});
const authorize = await fetch(authorizeUrl, { redirect: "manual" });
assert.equal(authorize.status, 302);
const location = authorize.headers.get("location");
assert.ok(location);
const callback = new URL(location);
assert.equal(callback.searchParams.get("state"), state);
const code = callback.searchParams.get("code");
assert.ok(code);

const tokenResponse = await fetch(`${origin}/api/v1/auth/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    grantType: "authorization_code",
    code,
    codeVerifier: verifier,
    deviceId,
  }),
});
assert.equal(tokenResponse.status, 200);
const tokenSet = await tokenResponse.json();
assert.ok(tokenSet.accessToken);
assert.ok(tokenSet.refreshToken);

const headers = { authorization: `Bearer ${tokenSet.accessToken}` };
for (const route of clientRoutes) {
  const response = await fetch(`${origin}${route}`, { headers });
  assert.equal(response.status, 200, `${route} returned ${response.status}`);
}

const refreshResponse = await fetch(`${origin}/api/v1/auth/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    grantType: "refresh_token",
    refreshToken: tokenSet.refreshToken,
    deviceId,
  }),
});
assert.equal(refreshResponse.status, 200);

const replayResponse = await fetch(`${origin}/api/v1/auth/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    grantType: "refresh_token",
    refreshToken: tokenSet.refreshToken,
    deviceId,
  }),
});
assert.equal(replayResponse.status, 401);

console.log(
  JSON.stringify({
    origin,
    webRoutes: webRoutes.length,
    clientRoutes: clientRoutes.length,
    authorization: authorize.status,
    token: tokenResponse.status,
    refresh: refreshResponse.status,
    replay: replayResponse.status,
  }),
);
