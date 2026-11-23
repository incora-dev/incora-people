import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import {
  createAnnouncement,
  getAnnouncements,
  type MobileAnnouncement,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

export default function AnnouncementsScreen() {
  const { accessToken } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [items, setItems] = useState<MobileAnnouncement[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ title: "", body: "", pinned: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await accessToken();
      if (!token) return;
      const data = await getAnnouncements(token);
      setItems(data.announcements);
      setCanCreate(data.canCreate);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(
              "Не вдалося завантажити оголошення.",
              "Could not load announcements.",
            ),
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.title} ${item.body}`.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  async function publish() {
    if (form.title.trim().length < 2 || form.body.trim().length < 2) {
      Alert.alert(
        tr("Заповніть поля", "Complete the form"),
        tr(
          "Додайте заголовок і текст оголошення.",
          "Add a title and announcement text.",
        ),
      );
      return;
    }
    setSaving(true);
    try {
      const token = await accessToken();
      if (!token) return;
      await createAnnouncement(token, {
        ...form,
        publishedAt: new Date().toISOString().slice(0, 16),
        expiresAt: "",
      });
      setForm({ title: "", body: "", pinned: false });
      setFormOpen(false);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося опублікувати", "Could not publish"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: t("announcements") }}
      />
      <Screen>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <Eyebrow>{t("companyNews").toUpperCase()}</Eyebrow>
            <Text style={styles.title}>{t("announcements")}</Text>
          </View>
          {canCreate ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFormOpen((current) => !current)}
              style={styles.primaryCompact}
            >
              <Text style={styles.primaryText}>＋</Text>
            </Pressable>
          ) : null}
        </View>

        <TextInput
          accessibilityLabel={t("search")}
          onChangeText={setQuery}
          placeholder={`${t("search")}…`}
          style={styles.input}
          value={query}
        />

        {formOpen ? (
          <Card>
            <Text style={styles.cardTitle}>{t("newAnnouncement")}</Text>
            <TextInput
              onChangeText={(title) =>
                setForm((current) => ({ ...current, title }))
              }
              placeholder={t("title")}
              style={styles.input}
              value={form.title}
            />
            <TextInput
              multiline
              onChangeText={(body) =>
                setForm((current) => ({ ...current, body }))
              }
              placeholder={t("description")}
              style={[styles.input, styles.multiline]}
              value={form.body}
            />
            <Pressable
              onPress={() =>
                setForm((current) => ({ ...current, pinned: !current.pinned }))
              }
              style={[styles.choice, form.pinned && styles.choiceActive]}
            >
              <Text style={styles.choiceText}>
                {form.pinned ? "✓ " : ""}
                {t("pinned")}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                onPress={() => setFormOpen(false)}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => void publish()}
                style={[styles.primary, saving && styles.disabled]}
              >
                <Text style={styles.primaryText}>
                  {saving ? "…" : t("publish")}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {loading ? <ActivityIndicator color={colors.ink} /> : null}
        {error ? (
          <Card>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.secondary}>
              <Text style={styles.secondaryText}>{t("retry")}</Text>
            </Pressable>
          </Card>
        ) : null}
        {!loading && !error && !visible.length ? (
          <Card>
            <Text style={styles.copy}>{t("noResults")}</Text>
          </Card>
        ) : null}
        {visible.map((item) => (
          <Card key={item.id}>
            <View style={styles.meta}>
              {item.pinned ? (
                <Text style={styles.pin}>● {t("pinned")}</Text>
              ) : (
                <View />
              )}
              <Text style={styles.date}>
                {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(item.publishedAt))}
              </Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.copy}>{item.body}</Text>
          </Card>
        ))}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headingText: { flex: 1 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: "#a02e25", fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  multiline: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
  meta: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pin: { color: "#8a6800", fontSize: 12, fontWeight: "800" },
  date: { color: colors.muted, fontSize: 12 },
  choice: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    padding: 11,
  },
  choiceActive: { backgroundColor: "#fff5c5", borderColor: colors.yellow },
  choiceText: { color: colors.ink, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8 },
  primary: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryCompact: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  primaryText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
