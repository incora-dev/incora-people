import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { getWorkMode, updateLocale, updateWorkMode } from "@/lib/api";
import { useMobileI18n } from "@/lib/i18n";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

export default function SettingsScreen() {
  const { profile, accessToken, reloadProfile } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [nextLocale, setNextLocale] = useState<"uk" | "en">(locale);
  const [defaultMode, setDefaultMode] = useState<"office" | "remote">("office");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void accessToken().then(async (token) => {
      if (token) setDefaultMode((await getWorkMode(token)).defaultMode);
    });
  }, [accessToken]);
  async function save() {
    const token = await accessToken();
    if (!token) return;
    setSaving(true);
    try {
      await Promise.all([
        updateLocale(token, nextLocale),
        updateWorkMode(token, defaultMode, true),
      ]);
      await reloadProfile();
      Alert.alert(
        nextLocale === "uk" ? "Збережено" : "Saved",
        nextLocale === "uk"
          ? "Налаштування оновлено."
          : "Your settings were updated.",
      );
    } catch (cause) {
      Alert.alert(
        tr("Помилка", "Error"),
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося зберегти налаштування.", "Could not save settings."),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("settings") }} />
      <Screen>
        <Eyebrow>{profile?.user.email ?? "ACCOUNT"}</Eyebrow>
        <Text style={styles.title}>{t("settings")}</Text>
        <Card>
          <Text style={styles.label}>{t("language")}</Text>
          <View style={styles.row}>
            <Choice
              active={nextLocale === "uk"}
              label="Українська"
              onPress={() => setNextLocale("uk")}
            />
            <Choice
              active={nextLocale === "en"}
              label="English"
              onPress={() => setNextLocale("en")}
            />
          </View>
        </Card>
        <Card>
          <Text style={styles.label}>{t("workDefault")}</Text>
          <View style={styles.row}>
            <Choice
              active={defaultMode === "office"}
              label={t("office")}
              onPress={() => setDefaultMode("office")}
            />
            <Choice
              active={defaultMode === "remote"}
              label={t("remote")}
              onPress={() => setDefaultMode("remote")}
            />
          </View>
        </Card>
        <Pressable
          disabled={saving}
          onPress={() => void save()}
          style={[styles.save, saving && styles.disabled]}
        >
          <Text style={styles.saveText}>{saving ? "…" : t("save")}</Text>
        </Pressable>
      </Screen>
    </>
  );
}
function Choice({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, active && styles.choiceActive]}
    >
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  label: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  choice: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  choiceActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  choiceText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  save: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 52,
  },
  saveText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
