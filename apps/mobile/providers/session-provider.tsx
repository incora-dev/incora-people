import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { API_ORIGIN, MOBILE_REDIRECT_URI } from "@/lib/config";
import {
  ApiError,
  exchangeAuthorizationCode,
  getMe,
  refreshSession,
  registerPushToken,
  revokeSession,
  unregisterPushToken,
  type ApiMe,
} from "@/lib/api";
import {
  clearPushRegistration,
  getOrCreatePushRegistration,
  readPushRegistration,
} from "@/lib/push";
import {
  clearSession,
  getDeviceId,
  readSession,
  saveSession,
  type MobileSession,
} from "@/lib/storage";

WebBrowser.maybeCompleteAuthSession();

type SessionState = {
  ready: boolean;
  authenticating: boolean;
  session: MobileSession | null;
  profile: ApiMe | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  accessToken: () => Promise<string | null>;
  reloadProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [profile, setProfile] = useState<ApiMe | null>(null);
  const [ready, setReady] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPromise = useRef<Promise<MobileSession> | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "incora-people",
    path: "auth/callback",
  });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: "incora-people-mobile",
      redirectUri: MOBILE_REDIRECT_URI || redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { client: "mobile" },
    },
    { authorizationEndpoint: `${API_ORIGIN}/api/v1/auth/authorize` },
  );

  const restore = useCallback(async () => {
    const stored = await readSession();
    if (!stored || new Date(stored.sessionExpiresAt).getTime() <= Date.now()) {
      if (stored) await clearSession();
      setReady(true);
      return;
    }
    try {
      const usable = await ensureFreshSession(stored);
      if (!usable) throw new Error("Сесію завершено.");
      setSession(usable);
      setProfile(await getMe(usable.accessToken));
    } catch {
      await clearSession();
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void restore(), 0);
    return () => clearTimeout(timer);
  }, [restore]);

  useEffect(() => {
    if (!response) return;
    const codeVerifier = request?.codeVerifier;
    if (response.type !== "success" || !codeVerifier) {
      const timer = setTimeout(() => {
        if (response.type === "error") {
          setError("Не вдалося завершити вхід через Google.");
        }
        setAuthenticating(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const code = response.params.code;
    if (!code) return;
    void (async () => {
      try {
        const next = await exchangeAuthorizationCode({
          code,
          codeVerifier,
          deviceId: await getDeviceId(),
        });
        await saveSession(next);
        setSession(next);
        setProfile(await getMe(next.accessToken));
      } catch (cause) {
        setError(messageFor(cause));
      } finally {
        setAuthenticating(false);
      }
    })();
  }, [request?.codeVerifier, response]);

  const accessToken = useCallback(async () => {
    if (!session) return null;
    if (session.accessExpiresAt > Date.now() + 60_000) {
      return session.accessToken;
    }
    refreshPromise.current ??= ensureFreshSession(session).finally(() => {
      refreshPromise.current = null;
    });
    try {
      const fresh = await refreshPromise.current;
      if (fresh.accessToken !== session.accessToken) setSession(fresh);
      return fresh.accessToken;
    } catch {
      await clearSession();
      setSession(null);
      setProfile(null);
      return null;
    }
  }, [session]);

  const signIn = useCallback(async () => {
    if (!request) return;
    setError(null);
    setAuthenticating(true);
    try {
      await promptAsync();
    } catch (cause) {
      setAuthenticating(false);
      setError(messageFor(cause));
    }
  }, [promptAsync, request]);

  const signOut = useCallback(async () => {
    try {
      const token = await accessToken();
      if (token) {
        const push = await readPushRegistration();
        if (push) await unregisterPushToken(token, push).catch(() => undefined);
        await revokeSession(token);
      }
    } catch {
      // Local sign-out must still succeed if the network or session is gone.
    } finally {
      await clearPushRegistration();
      await clearSession();
      setSession(null);
      setProfile(null);
      setError(null);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!session || !profile) return;
    let cancelled = false;
    void (async () => {
      const token = await accessToken();
      const push = await getOrCreatePushRegistration();
      if (!cancelled && token && push) {
        await registerPushToken(token, push).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, profile, session]);

  const reloadProfile = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    try {
      setProfile(await getMe(token));
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 401) await signOut();
        else setError(cause.message);
      } else {
        setError(messageFor(cause));
      }
    }
  }, [accessToken, signOut]);

  const value = useMemo(
    () => ({
      ready,
      authenticating,
      session,
      profile,
      error,
      signIn,
      signOut,
      accessToken,
      reloadProfile,
    }),
    [
      accessToken,
      authenticating,
      error,
      profile,
      ready,
      reloadProfile,
      session,
      signIn,
      signOut,
    ],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

async function ensureFreshSession(session: MobileSession) {
  if (session.accessExpiresAt > Date.now() + 60_000) return session;
  const next = await refreshSession(session, await getDeviceId());
  await saveSession(next);
  return next;
}

function messageFor(cause: unknown) {
  return cause instanceof Error ? cause.message : "Не вдалося виконати дію.";
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error("useSession must be used inside SessionProvider.");
  return value;
}
