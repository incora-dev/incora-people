import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { getLeaveCalendar, type LeaveCalendarEvent } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

export default function CalendarScreen() {
  const { accessToken } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [events, setEvents] = useState<LeaveCalendarEvent[]>([]);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await accessToken();
      if (!token) return;
      setEvents((await getLeaveCalendar(token)).events);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося завантажити календар.", "Could not load calendar."),
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const monthKey = cursor.toISOString().slice(0, 7);
  const departments = useMemo(
    () =>
      [
        ...new Set(events.map((event) => event.department).filter(Boolean)),
      ].sort(),
    [events],
  );
  const visible = useMemo(
    () =>
      events.filter(
        (event) =>
          (event.startDate.startsWith(monthKey) ||
            event.endDate.startsWith(monthKey) ||
            (event.startDate < `${monthKey}-01` &&
              event.endDate > `${monthKey}-31`)) &&
          (department === "all" || event.department === department),
      ),
    [department, events, monthKey],
  );

  function changeMonth(delta: number) {
    setCursor(
      (current) =>
        new Date(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1),
        ),
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("calendar") }} />
      <Screen>
        <Eyebrow>{tr("ДОСТУПНІСТЬ КОМАНДИ", "TEAM AVAILABILITY")}</Eyebrow>
        <Text style={styles.title}>{t("teamCalendar")}</Text>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityLabel={t("previousMonth")}
            onPress={() => changeMonth(-1)}
            style={styles.monthButton}
          >
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.month}>
            {new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(cursor)}
          </Text>
          <Pressable
            accessibilityLabel={t("nextMonth")}
            onPress={() => changeMonth(1)}
            style={styles.monthButton}
          >
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>
        <View style={styles.filters}>
          <Pressable
            onPress={() => setDepartment("all")}
            style={[styles.filter, department === "all" && styles.filterActive]}
          >
            <Text style={styles.filterText}>{t("all")}</Text>
          </Pressable>
          {departments.map((item) => (
            <Pressable
              key={item}
              onPress={() => setDepartment(item)}
              style={[
                styles.filter,
                department === item && styles.filterActive,
              ]}
            >
              <Text style={styles.filterText}>{item}</Text>
            </Pressable>
          ))}
        </View>
        {loading ? <ActivityIndicator color={colors.ink} /> : null}
        {error ? (
          <Card>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t("retry")}</Text>
            </Pressable>
          </Card>
        ) : null}
        {!loading && !error && !visible.length ? (
          <Card>
            <Text style={styles.copy}>
              {tr(
                "У цьому місяці погоджених відсутностей немає.",
                "There are no approved absences this month.",
              )}
            </Text>
          </Card>
        ) : null}
        {visible.map((event) => (
          <Card key={event.id}>
            <View style={styles.eventRow}>
              <View style={[styles.dot, { backgroundColor: event.color }]} />
              <View style={styles.eventText}>
                <Text style={styles.cardTitle}>
                  {event.firstName} {event.lastName}
                </Text>
                <Text style={styles.copy}>
                  {event.typeName} · {event.department}
                </Text>
                <Text style={styles.date}>
                  {event.startDate} — {event.endDate} · {event.days}{" "}
                  {tr("дн.", "days")}
                </Text>
              </View>
            </View>
          </Card>
        ))}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  monthRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  month: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  monthButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  monthButtonText: { color: colors.ink, fontSize: 29 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filter: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  filterText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  eventRow: { flexDirection: "row", gap: 12 },
  eventText: { flex: 1 },
  dot: { borderRadius: 6, height: 12, marginTop: 5, width: 12 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  date: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 4 },
  error: { color: "#a02e25" },
  retry: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  retryText: { color: colors.ink, fontWeight: "800" },
});
