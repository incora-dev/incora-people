import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import {
  getBugReports,
  submitBugReport,
  type BugReport,
  type MobileUpload,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

export default function OperationsScreen() {
  const { accessToken } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<MobileUpload | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = await accessToken();
    if (token) setReports((await getBugReports(token)).reports);
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => undefined), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        tr("Потрібен доступ", "Permission required"),
        tr(
          "Дозвольте доступ до фото, щоб прикріпити скриншот.",
          "Allow photo access to attach a screenshot.",
        ),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.82,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setScreenshot({
      uri: asset.uri,
      name: asset.fileName ?? `bug-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    });
  }

  async function submit() {
    if (description.trim().length < 10 || !screenshot) {
      Alert.alert(
        tr("Додайте деталі", "Add more detail"),
        tr(
          "Опишіть проблему щонайменше десятьма символами та додайте скриншот.",
          "Describe the problem in at least ten characters and attach a screenshot.",
        ),
      );
      return;
    }
    const token = await accessToken();
    if (!token) return;
    setLoading(true);
    try {
      await submitBugReport(token, { description, screenshot });
      setDescription("");
      setScreenshot(undefined);
      await load();
      Alert.alert(
        tr("Дякуємо", "Thank you"),
        tr(
          "Повідомлення вже передано команді.",
          "Your report has been sent to the team.",
        ),
      );
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося надіслати", "Could not submit"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("support") }} />
      <Screen>
        <Eyebrow>{tr("ПІДТРИМКА", "SUPPORT")}</Eyebrow>
        <Text style={styles.title}>
          {tr("Повідомити про помилку", "Report a problem")}
        </Text>
        <Card>
          <Text style={styles.cardTitle}>
            {tr("Що сталося?", "What happened?")}
          </Text>
          <Text style={styles.copy}>
            {tr(
              "Опишіть свої дії, очікуваний результат і те, що побачили.",
              "Describe what you did, what you expected, and what happened.",
            )}
          </Text>
          <TextInput
            multiline
            onChangeText={setDescription}
            placeholder={tr("Опис проблеми", "Problem description")}
            style={[styles.input, styles.multiline]}
            value={description}
          />
          {screenshot ? (
            <Image
              alt={tr("Попередній перегляд скриншота", "Screenshot preview")}
              source={{ uri: screenshot.uri }}
              style={styles.preview}
            />
          ) : null}
          <Pressable onPress={() => void pickImage()} style={styles.secondary}>
            <Text style={styles.secondaryText}>
              {screenshot
                ? tr("Замінити скриншот", "Replace screenshot")
                : tr("Додати скриншот", "Attach screenshot")}
            </Text>
          </Pressable>
          <Pressable
            disabled={loading}
            onPress={() => void submit()}
            style={[styles.primary, loading && styles.disabled]}
          >
            <Text style={styles.primaryText}>
              {loading ? "…" : t("submit")}
            </Text>
          </Pressable>
        </Card>

        <Eyebrow>{tr("МОЇ ПОВІДОМЛЕННЯ", "MY REPORTS")}</Eyebrow>
        {reports.map((report) => (
          <Card key={report.id}>
            <Text style={styles.cardTitle}>{report.description}</Text>
            <Text
              style={[
                styles.status,
                report.status === "resolved" && styles.statusResolved,
              ]}
            >
              {report.status === "resolved"
                ? tr("Виправлено", "Resolved")
                : tr("У роботі", "In progress")}
            </Text>
            <Text style={styles.copy}>
              {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(report.createdAt))}
            </Text>
          </Card>
        ))}
        {!reports.length ? (
          <Card>
            <Text style={styles.copy}>
              {tr(
                "Ви ще не повідомляли про проблеми.",
                "You have not submitted any reports yet.",
              )}
            </Text>
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  input: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  preview: { borderRadius: 10, height: 180, width: "100%" },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryText: { color: colors.ink, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  status: {
    alignSelf: "flex-start",
    backgroundColor: "#fff0bd",
    borderRadius: 20,
    color: "#745a00",
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusResolved: { backgroundColor: "#dcf4e6", color: "#176a3c" },
});
