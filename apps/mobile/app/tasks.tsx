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
  createTask,
  getTasks,
  updateTask,
  type MobileTask,
  type MobileTaskWorkspace,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";
import { useSession } from "@/providers/session-provider";

type Filter = "open" | "done" | MobileTask["category"];

export default function TasksScreen() {
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [data, setData] = useState<MobileTaskWorkspace | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<number | "create" | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "general" as MobileTask["category"],
    assigneeEmployeeId: 0,
    dueDate: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await accessToken();
      if (!token) return;
      const next = await getTasks(token);
      setData(next);
      setForm((current) => ({
        ...current,
        assigneeEmployeeId:
          current.assigneeEmployeeId || next.assignees[0]?.id || 0,
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося завантажити задачі.", "Could not load tasks."),
      );
    }
  }, [accessToken, tr]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(
    () =>
      (data?.tasks ?? []).filter((task) => {
        if (filter === "open") return task.status === "todo";
        if (filter === "done") return task.status === "done";
        return task.category === filter;
      }),
    [data?.tasks, filter],
  );

  async function toggle(task: MobileTask) {
    const token = await accessToken();
    if (!token) return;
    setBusy(task.id);
    try {
      await updateTask(
        token,
        task.id,
        task.status === "done" ? "todo" : "done",
      );
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося оновити", "Could not update"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!form.title.trim() || !form.assigneeEmployeeId) return;
    const token = await accessToken();
    if (!token) return;
    setBusy("create");
    try {
      await createTask(token, form);
      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        dueDate: "",
      }));
      setFormOpen(false);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося створити", "Could not create"),
        cause instanceof Error ? cause.message : t("retry"),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("tasks") }} />
      <Screen>
        <View style={styles.heading}>
          <View>
            <Eyebrow>{tr("РОБОЧІ ПРОЦЕСИ", "WORKFLOWS")}</Eyebrow>
            <Text style={styles.title}>{t("tasks")}</Text>
          </View>
          {data?.canCreate ? (
            <Pressable onPress={() => setFormOpen(true)} style={styles.add}>
              <Text style={styles.addText}>＋</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filters}>
          {(
            [
              ["open", t("open")],
              ["onboarding", t("onboarding")],
              ["offboarding", t("offboarding")],
              ["done", t("completed")],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.filter, filter === value && styles.filterActive]}
            >
              <Text style={styles.filterText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {formOpen ? (
          <Card>
            <Text style={styles.cardTitle}>{t("addTask")}</Text>
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
              onChangeText={(description) =>
                setForm((current) => ({ ...current, description }))
              }
              placeholder={t("description")}
              style={[styles.input, styles.multiline]}
              value={form.description}
            />
            <TextInput
              onChangeText={(dueDate) =>
                setForm((current) => ({ ...current, dueDate }))
              }
              placeholder={`${t("dueDate")}: YYYY-MM-DD`}
              style={styles.input}
              value={form.dueDate}
            />
            <Eyebrow>{t("category").toUpperCase()}</Eyebrow>
            <View style={styles.filters}>
              {(["general", "onboarding", "offboarding"] as const).map(
                (category) => (
                  <Pressable
                    key={category}
                    onPress={() =>
                      setForm((current) => ({ ...current, category }))
                    }
                    style={[
                      styles.filter,
                      form.category === category && styles.filterActive,
                    ]}
                  >
                    <Text style={styles.filterText}>
                      {t(
                        category === "general"
                          ? "general"
                          : category === "onboarding"
                            ? "onboarding"
                            : "offboarding",
                      )}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Eyebrow>{t("assignee").toUpperCase()}</Eyebrow>
            {(data?.assignees ?? []).map((person) => (
              <Pressable
                key={person.id}
                onPress={() =>
                  setForm((current) => ({
                    ...current,
                    assigneeEmployeeId: person.id,
                  }))
                }
                style={[
                  styles.assignee,
                  form.assigneeEmployeeId === person.id &&
                    styles.assigneeActive,
                ]}
              >
                <Text style={styles.assigneeName}>
                  {person.firstName} {person.lastName}
                </Text>
                <Text style={styles.copy}>{person.jobTitle}</Text>
              </Pressable>
            ))}
            <View style={styles.actions}>
              <Pressable
                onPress={() => setFormOpen(false)}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={busy === "create"}
                onPress={() => void submit()}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>
                  {busy === "create" ? "…" : t("create")}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {!data && !error ? <ActivityIndicator color={colors.ink} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {data && !visible.length ? (
          <Card>
            <Text style={styles.copy}>{t("noResults")}</Text>
          </Card>
        ) : null}
        {visible.map((task) => (
          <Card key={task.id}>
            <View style={styles.taskRow}>
              <Pressable
                accessibilityLabel={
                  task.status === "done"
                    ? tr("Відкрити задачу повторно", "Reopen task")
                    : tr("Завершити задачу", "Complete task")
                }
                disabled={busy === task.id}
                onPress={() => void toggle(task)}
                style={[
                  styles.check,
                  task.status === "done" && styles.checkDone,
                ]}
              >
                <Text style={styles.checkText}>
                  {busy === task.id ? "…" : task.status === "done" ? "✓" : ""}
                </Text>
              </Pressable>
              <View style={styles.taskText}>
                <Text style={styles.category}>{t(task.category)}</Text>
                <Text style={styles.cardTitle}>{task.title}</Text>
                {task.description ? (
                  <Text style={styles.copy}>{task.description}</Text>
                ) : null}
                <Text style={styles.meta}>
                  {task.assigneeFirstName} {task.assigneeLastName}
                  {task.dueDate ? ` · ${t("dueDate")} ${task.dueDate}` : ""}
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
  heading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  category: {
    color: "#806100",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
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
  add: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  addText: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  input: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  multiline: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" },
  assignee: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    padding: 10,
  },
  assigneeActive: { backgroundColor: "#fff6cf", borderColor: colors.yellow },
  assigneeName: { color: colors.ink, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 },
  secondary: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 9,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  primaryText: { color: colors.ink, fontWeight: "800" },
  taskRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  taskText: { flex: 1 },
  check: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 2,
    height: 34,
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  checkText: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  error: { color: "#a02e25" },
});
