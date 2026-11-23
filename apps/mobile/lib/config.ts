import Constants from "expo-constants";

const configuredOrigin = process.env.EXPO_PUBLIC_INCORA_API_ORIGIN?.trim();
export const API_ORIGIN = (
  configuredOrigin || "https://incora-people.incora-people.workers.dev"
).replace(/\/+$/, "");
const configuredProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ??
  Constants.expoConfig?.extra?.eas?.projectId;
export const EAS_PROJECT_ID =
  typeof configuredProjectId === "string" ? configuredProjectId.trim() : "";
export const MOBILE_REDIRECT_URI = "incora-people://auth/callback";
export const APP_VERSION = "0.1.0";
