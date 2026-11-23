import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const DEVICE_ID_KEY = "incora.mobile.device-id";
const SESSION_KEY = "incora.mobile.session";

export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  sessionExpiresAt: string;
};

export async function getDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export async function readSession(): Promise<MobileSession | null> {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as MobileSession;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: MobileSession) {
  return SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  return SecureStore.deleteItemAsync(SESSION_KEY);
}
