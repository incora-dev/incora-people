import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_ORIGIN } from "@/lib/config";

export async function downloadAndOpenFile(
  accessToken: string,
  id: string,
  name: string,
) {
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
  const result = await FileSystem.downloadAsync(
    `${API_ORIGIN}/api/v1/files/${encodeURIComponent(id)}`,
    target,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (result.status < 200 || result.status >= 300)
    throw new Error("Не вдалося завантажити файл.");
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("На цьому пристрої немає програми для відкриття файлу.");
  await Sharing.shareAsync(result.uri);
}
