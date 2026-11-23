import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { getPeople, type Person } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function People() {
  const { accessToken } = useSession();
  const { tr } = useMobileI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextQuery = "") => {
      const token = await accessToken();
      if (!token) return;
      setLoading(true);
      try {
        setPeople((await getPeople(token, nextQuery)).people);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : tr(
                "Не вдалося завантажити директорію.",
                "Could not load the directory.",
              ),
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken, tr],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Screen>
      <Eyebrow>{tr("ЛЮДИ", "PEOPLE")}</Eyebrow>
      <Text style={styles.title}>{tr("Команда INCORA", "INCORA team")}</Text>
      <TextInput
        accessibilityLabel={tr("Пошук людей", "Search people")}
        onChangeText={(value) => {
          setQuery(value);
          void load(value);
        }}
        placeholder={tr("Пошук людей…", "Search people…")}
        style={styles.input}
        value={query}
      />
      {loading ? <ActivityIndicator color={colors.ink} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {people.map((person) => (
        <Pressable
          key={person.id}
          onPress={() => router.push(`/people/${person.id}`)}
        >
          <Card>
            <Text style={styles.cardTitle}>
              {person.firstName} {person.lastName}
            </Text>
            <Text style={styles.copy}>{person.jobTitle}</Text>
            <Text style={styles.meta}>
              {person.department} ·{" "}
              {person.workMode === "remote"
                ? tr("Дистанційно", "Remote")
                : tr("В офісі", "In office")}
            </Text>
            <Text style={styles.open}>
              {tr("Відкрити профіль →", "Open profile →")}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 13 },
  open: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    padding: 13,
  },
  error: { color: "#b4362a", fontSize: 14 },
});
