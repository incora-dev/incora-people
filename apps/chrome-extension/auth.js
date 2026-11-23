import { API_ORIGIN } from "./config.js";

const ACCESS_SESSION_KEY = "incoraClientAccessSession";
const REFRESH_SESSION_KEY = "incoraClientRefreshSession";
const DEVICE_KEY = "incoraDeviceId";
const REFRESH_LOCK = "incora-client-token-refresh";

function storage(area, values) {
  return new Promise((resolve, reject) =>
    chrome.storage[area].set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    }),
  );
}

function readStorage(area, key) {
  return new Promise((resolve, reject) =>
    chrome.storage[area].get(key, (value) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    }),
  );
}

function randomString(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64url(value);
}

function base64url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Base64url(value) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}

export async function getDeviceId() {
  const stored = await readStorage("local", DEVICE_KEY);
  if (stored[DEVICE_KEY]) return stored[DEVICE_KEY];
  const deviceId = crypto.randomUUID();
  await storage("local", { [DEVICE_KEY]: deviceId });
  return deviceId;
}

export async function getSession() {
  const [access, refresh] = await Promise.all([
    readStorage("session", ACCESS_SESSION_KEY),
    readStorage("local", REFRESH_SESSION_KEY),
  ]);
  const accessSession = access[ACCESS_SESSION_KEY];
  const refreshSession = refresh[REFRESH_SESSION_KEY];
  if (!refreshSession) return null;
  return {
    ...refreshSession,
    accessToken: accessSession?.accessToken ?? null,
    accessExpiresAt: accessSession?.accessExpiresAt ?? 0,
  };
}

async function saveSession(tokenSet) {
  await Promise.all([
    storage("session", {
      [ACCESS_SESSION_KEY]: {
        accessToken: tokenSet.accessToken,
        accessExpiresAt: Date.now() + tokenSet.expiresIn * 1000,
      },
    }),
    storage("local", {
      [REFRESH_SESSION_KEY]: {
        refreshToken: tokenSet.refreshToken,
        sessionExpiresAt: tokenSet.sessionExpiresAt,
      },
    }),
  ]);
}

export async function clearSession() {
  await Promise.all([
    storage("session", { [ACCESS_SESSION_KEY]: null }),
    storage("local", { [REFRESH_SESSION_KEY]: null }),
  ]);
}

export async function signOut() {
  try {
    const token = await getAccessToken();
    if (token) {
      await fetchWithTimeout(`${API_ORIGIN}/api/v1/auth/revoke`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    }
  } finally {
    await clearSession();
  }
}

async function tokenRequest(payload) {
  const response = await fetchWithTimeout(`${API_ORIGIN}/api/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function getAccessToken() {
  return navigator.locks.request(REFRESH_LOCK, async () => {
    const session = await getSession();
    if (!session) return null;
    if (session.accessToken && session.accessExpiresAt > Date.now() + 60_000) {
      return session.accessToken;
    }
    const tokenSet = await tokenRequest({
      grantType: "refresh_token",
      refreshToken: session.refreshToken,
      deviceId: await getDeviceId(),
    });
    if (!tokenSet) {
      await clearSession();
      return null;
    }
    await saveSession(tokenSet);
    return tokenSet.accessToken;
  });
}

export async function signIn() {
  const redirectUri = chrome.identity.getRedirectURL("oauth2");
  const state = randomString(24);
  const codeVerifier = randomString(48);
  const authorizationUrl = new URL(`${API_ORIGIN}/api/v1/auth/authorize`);
  authorizationUrl.search = new URLSearchParams({
    client: "chrome_extension",
    redirect_uri: redirectUri,
    state,
    code_challenge: await sha256Base64url(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authorizationUrl.toString(),
    interactive: true,
  });
  if (!callbackUrl) throw new Error("Google sign-in was cancelled.");
  const callback = new URL(callbackUrl);
  if (callback.searchParams.get("state") !== state) {
    throw new Error("The sign-in response could not be verified.");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("Google did not return an authorization code.");
  const tokenSet = await tokenRequest({
    grantType: "authorization_code",
    code,
    codeVerifier,
    deviceId: await getDeviceId(),
  });
  if (!tokenSet) throw new Error("The sign-in session expired. Try again.");
  await saveSession(tokenSet);
  return tokenSet;
}

export async function apiFetch(path, options = {}) {
  let token = await getAccessToken();
  if (!token) throw new Error("AUTH_REQUIRED");
  const response = await fetchWithTimeout(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (response.status === 401) {
    await clearSession();
    throw new Error("AUTH_REQUIRED");
  }
  return response;
}

async function fetchWithTimeout(url, init, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
