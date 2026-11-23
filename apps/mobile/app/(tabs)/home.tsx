import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  getHome,
  getNotifications,
  markNotificationsRead,
  updateTask,
  type HomeData,
  type MobileNotification,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function Home() {
  const { accessToken, profile } = useSession();
  const { tr } = useMobileI18n();
  const [home, setHome] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const load = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    try {
      const [home, notificationData] = await Promise.all([
        getHome(token),
        getNotifications(token),
      ]);
      setHome(home);
      setNotifications(notificationData.notifications);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося завантажити головну.", "Could not load home."),
      );
    }
  }, [accessToken, tr]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const completeTask = async (id: number) => {
    const token = await accessToken();
    if (!token) return;
    setUpdatingTaskId(id);
    try {
      await updateTask(token, id, "done");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося оновити задачу.", "Could not update the task."),
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };
  const readAll = async () => {
    const token = await accessToken();
    if (!token) return;
    try {
      await markNotificationsRead(token, { all: true });
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr(
              "Не вдалося оновити сповіщення.",
              "Could not update notifications.",
            ),
      );
    }
  };
  const name = profile?.user.firstName || tr("колего", "colleague");
  return (
    <Screen>
      <Eyebrow>INCORA PEOPLE</Eyebrow>
      <Text style={styles.title}>
        {tr("Вітаємо", "Welcome")}, {name}.
      </Text>
      <Text style={styles.copy}>
        {tr(
          "Ваш простір для команди, часу та внутрішніх процесів.",
          "Your workspace for people, time and internal operations.",
        )}
      </Text>
      {!home ? <ActivityIndicator color={colors.ink} /> : null}
      {home ? (
        <View style={styles.stats}>
          <Metric label={tr("Команда", "People")} value={home.activePeople} />
          <Metric label={tr("Ремоут", "Remote")} value={home.remote} />
          <Metric label={tr("Відпустки", "On leave")} value={home.onLeave} />
        </View>
      ) : null}
      {home?.personalTasks.length ? (
        <Card>
          <View style={styles.sectionHeader}>
            <Eyebrow>{tr("МОЇ ЗАДАЧІ", "MY TASKS")}</Eyebrow>
            <Pressable onPress={() => router.push("/tasks")}>
              <Text style={styles.viewAll}>{tr("Усі →", "View all →")}</Text>
            </Pressable>
          </View>
          {home.personalTasks.map((task) => (
            <View key={task.id} style={styles.task}>
              <View style={styles.taskText}>
                <Text style={styles.cardTitle}>{task.title}</Text>
                {task.dueDate ? (
                  <Text style={styles.copy}>
                    {tr("До", "Due")} {task.dueDate}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityLabel={`${tr("Завершити", "Complete")} ${task.title}`}
                disabled={updatingTaskId === task.id}
                onPress={() => void completeTask(task.id)}
                style={styles.done}
              >
                <Text style={styles.doneText}>
                  {updatingTaskId === task.id ? "…" : "✓"}
                </Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      {home?.announcements.length ? (
        <Card>
          <View style={styles.sectionHeader}>
            <Eyebrow>{tr("ОГОЛОШЕННЯ", "ANNOUNCEMENTS")}</Eyebrow>
            <Pressable onPress={() => router.push("/announcements")}>
              <Text style={styles.viewAll}>{tr("Усі →", "View all →")}</Text>
            </Pressable>
          </View>
          {home.announcements.map((announcement) => (
            <View key={announcement.id} style={styles.announcement}>
              <Text style={styles.cardTitle}>
                {announcement.pinned ? `${tr("Закріплено", "Pinned")} · ` : ""}
                {announcement.title}
              </Text>
              <Text style={styles.copy}>{announcement.body}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {notifications.length ? (
        <Card>
          <View style={styles.notificationsHeader}>
            <Eyebrow>{tr("СПОВІЩЕННЯ", "NOTIFICATIONS")}</Eyebrow>
            {notifications.some((item) => !item.readAt) ? (
              <Pressable onPress={() => void readAll()}>
                <Text style={styles.readAll}>
                  {tr("Прочитати всі", "Mark all read")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {notifications.slice(0, 5).map((notification) => (
            <View
              key={notification.id}
              style={[
                styles.notification,
                !notification.readAt && styles.notificationUnread,
              ]}
            >
              <Text style={styles.cardTitle}>{notification.title}</Text>
              <Text style={styles.copy}>{notification.message}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {home ? (
        <Card>
          <Eyebrow>{tr("МОЯ ВІДПУСТКА", "MY LEAVE")}</Eyebrow>
          <Text style={styles.vacation}>
            {home.vacationAvailable.toFixed(1)}{" "}
            {tr("днів доступно", "days available")}
          </Text>
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  stats: { flexDirection: "row", gap: 8 },
  metric: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  metricValue: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 11, marginTop: 4 },
  cardTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "800",
  },
  task: { alignItems: "center", flexDirection: "row", gap: 10 },
  taskText: { flex: 1 },
  done: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 9,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  doneText: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  announcement: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 12,
  },
  notificationsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  viewAll: { color: "#745a00", fontSize: 12, fontWeight: "800" },
  readAll: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  notification: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10,
  },
  notificationUnread: {
    borderLeftColor: colors.yellow,
    borderLeftWidth: 3,
    paddingLeft: 9,
  },
  vacation: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  error: { color: "#b4362a", fontSize: 14, lineHeight: 20 },
});
