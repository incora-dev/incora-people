import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { EAS_PROJECT_ID } from "@/lib/config";

const PUSH_TOKEN_KEY = "incora-people-push-token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getOrCreatePushRegistration() {
  if (!Device.isDevice || !EAS_PROJECT_ID) return null;
  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("incora-people", {
      name: "INCORA People",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#f9c400",
    });
  }

  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })
  ).data;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await SecureStore.setItemAsync(
    PUSH_TOKEN_KEY,
    JSON.stringify({ token, platform }),
  );
  return { token, platform } as const;
}

export async function readPushRegistration() {
  const raw = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      token?: string;
      platform?: "android" | "ios";
    };
    return parsed.token && parsed.platform
      ? { token: parsed.token, platform: parsed.platform }
      : null;
  } catch {
    return null;
  }
}

export async function clearPushRegistration() {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

export function addPushResponseListener(listener: (href: string) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const href = response.notification.request.content.data?.href;
    if (typeof href === "string") listener(href);
  });
}
