import assert from "node:assert/strict";
import test from "node:test";

const local = {};
const session = {};
let lockQueue = Promise.resolve();
let tokenRequests = 0;
let revokeRequests = 0;

function storageArea(bucket) {
  return {
    get(key, callback) {
      callback({ [key]: bucket[key] });
    },
    set(values, callback) {
      Object.assign(bucket, values);
      callback();
    },
  };
}

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    locks: {
      request(_name, callback) {
        const result = lockQueue.then(callback);
        lockQueue = result.catch(() => undefined);
        return result;
      },
    },
  },
});

globalThis.chrome = {
  identity: {
    getRedirectURL: () =>
      "https://cgffleilghhdejlgfkfboeplimlmflmn.chromiumapp.org/oauth2",
    async launchWebAuthFlow({ url }) {
      const authorization = new URL(url);
      const callback = new URL(chrome.identity.getRedirectURL());
      callback.searchParams.set(
        "state",
        authorization.searchParams.get("state"),
      );
      callback.searchParams.set("code", "authorization-code-for-tests");
      return callback.toString();
    },
  },
  runtime: { lastError: null },
  storage: {
    local: storageArea(local),
    session: storageArea(session),
  },
};

globalThis.fetch = async (url, init) => {
  if (url.endsWith("/api/v1/auth/revoke")) {
    revokeRequests += 1;
    return Response.json({ revoked: true });
  }
  if (!url.endsWith("/api/v1/auth/token")) {
    throw new Error(`Unexpected URL: ${url}`);
  }
  tokenRequests += 1;
  const body = JSON.parse(init.body);
  return Response.json({
    accessToken: `access-${tokenRequests}`,
    refreshToken: `refresh-${tokenRequests}-${body.grantType}`,
    expiresIn: 900,
    sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });
};

const auth = await import(
  new URL("../apps/chrome-extension/auth.js", import.meta.url)
);

test("keeps access tokens in session storage and revokes logout", async () => {
  await auth.signIn();

  assert.equal(tokenRequests, 1);
  assert.match(JSON.stringify(session), /access-1/);
  assert.doesNotMatch(JSON.stringify(local), /access-1/);
  assert.match(JSON.stringify(local), /refresh-1-authorization_code/);
  assert.equal(await auth.getAccessToken(), "access-1");

  await auth.signOut();
  assert.equal(revokeRequests, 1);
  assert.equal(await auth.getSession(), null);
});

test("restores from a refresh-only session with one concurrent rotation", async () => {
  local.incoraClientRefreshSession = {
    refreshToken: "refresh-after-browser-restart",
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  session.incoraClientAccessSession = null;
  const before = tokenRequests;

  const tokens = await Promise.all([
    auth.getAccessToken(),
    auth.getAccessToken(),
    auth.getAccessToken(),
  ]);

  assert.equal(tokenRequests, before + 1);
  assert.deepEqual(tokens, [
    `access-${before + 1}`,
    `access-${before + 1}`,
    `access-${before + 1}`,
  ]);
});
