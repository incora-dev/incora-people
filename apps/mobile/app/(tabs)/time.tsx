import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  clockIn,
  clockOut,
  createManualTime,
  getTimeOverview,
  getTimeStatus,
  getWorkMode,
  requestTimeCorrection,
  toggleBreak,
  updateWorkMode,
  type MobileTimeOverview,
  type TimeStatus,
  type WorkModeStatus,
} from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function Time() {
  const { accessToken } = useSession();
  const { locale, t, tr } = useMobileI18n();
  const [status, setStatus] = useState<TimeStatus | null>(null);
  const [workMode, setWorkMode] = useState<WorkModeStatus | null>(null);
  const [overview, setOverview] = useState<MobileTimeOverview | null>(null);
  const [manual, setManual] = useState({ clockIn: "", clockOut: "", note: "" });
  const [timeCode, setTimeCode] = useState<
    "project" | "internal" | "learning" | "admin"
  >("internal");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [correction, setCorrection] = useState<{
    timeEntryId: number;
    requestedClockIn: string;
    requestedClockOut: string;
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    const [timeStatus, mode, timeOverview] = await Promise.all([
      getTimeStatus(token),
      getWorkMode(token),
      getTimeOverview(token),
    ]);
    setStatus(timeStatus);
    setWorkMode(mode);
    setOverview(timeOverview);
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      void refresh().catch((cause) =>
        setError(
          message(
            cause,
            tr("Не вдалося виконати дію.", "Could not complete the action."),
          ),
        ),
      );
    }, [refresh, tr]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refresh().catch((cause) =>
          setError(
            message(
              cause,
              tr("Не вдалося виконати дію.", "Could not complete the action."),
            ),
          ),
        );
      }
    });
    return () => subscription.remove();
  }, [refresh, tr]);

  async function run(action: (token: string) => Promise<unknown>) {
    const token = await accessToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await action(token);
      await refresh();
    } catch (cause) {
      setError(
        message(
          cause,
          tr("Не вдалося виконати дію.", "Could not complete the action."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!status)
    return (
      <Screen>
        <ActivityIndicator color={colors.ink} />
        <Text style={styles.copy}>
          {tr("Завантажуємо табель…", "Loading timesheet…")}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );

  return (
    <Screen>
      <Eyebrow>{tr("РОБОЧИЙ ЧАС", "WORKING TIME")}</Eyebrow>
      <Text style={styles.title}>
        {status.active
          ? tr("Робочий час триває", "Work session in progress")
          : tr("Готові почати?", "Ready to start?")}
      </Text>
      <Card>
        <Eyebrow>{tr("ФОРМАТ РОБОТИ СЬОГОДНІ", "TODAY'S WORK MODE")}</Eyebrow>
        <View style={styles.row}>
          {(["office", "remote"] as const).map((mode) => (
            <Pressable
              key={mode}
              disabled={busy}
              onPress={() => void run((token) => updateWorkMode(token, mode))}
              style={[
                styles.choice,
                workMode?.mode === mode && styles.activeChoice,
              ]}
            >
              <Text style={styles.choiceText}>
                {mode === "office" ? t("office") : t("remote")}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card>
        <Eyebrow>{tr("СТАН ТАЙМЕРА", "TIMER STATUS")}</Eyebrow>
        <Text style={styles.status}>
          {status.openBreak
            ? tr("Перерва", "On break")
            : status.active
              ? tr("Активний", "Active")
              : tr("Зупинений", "Stopped")}
        </Text>
        <Text style={styles.copy}>
          {status.entry
            ? `${tr("Початок", "Started")}: ${formatTime(status.entry.clockIn, locale)}`
            : tr(
                "Запустіть таймер на початку роботи.",
                "Start the timer when you begin work.",
              )}
        </Text>
      </Card>
      <Card>
        <Eyebrow>{tr("КАТЕГОРІЯ ЧАСУ", "TIME CATEGORY")}</Eyebrow>
        <View style={styles.wrapRow}>
          {(
            [
              ["internal", tr("Внутрішня робота", "Internal work")],
              ["learning", tr("Навчання", "Learning")],
              ["admin", tr("Адміністративне", "Administrative")],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => {
                setTimeCode(value);
                setProjectId(null);
              }}
              style={[styles.choice, timeCode === value && styles.activeChoice]}
            >
              <Text style={styles.choiceText}>{label}</Text>
            </Pressable>
          ))}
          {overview?.projects.map((project) => (
            <Pressable
              key={project.id}
              onPress={() => {
                setTimeCode("project");
                setProjectId(project.id);
              }}
              style={[
                styles.choice,
                projectId === project.id && styles.activeChoice,
              ]}
            >
              <Text style={styles.choiceText}>
                {project.code} · {project.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Pressable
        disabled={busy || !status.linked}
        onPress={() =>
          void run((token) =>
            status.active
              ? clockOut(token)
              : clockIn(token, { projectId, timeCode }),
          )
        }
        style={[styles.primary, busy && styles.disabled]}
      >
        <Text style={styles.primaryText}>
          {status.active
            ? tr("Зупинити таймер", "Stop timer")
            : tr("Запустити таймер", "Start timer")}
        </Text>
      </Pressable>
      {status.active ? (
        <Pressable
          disabled={busy}
          onPress={() =>
            void run((token) =>
              status.openBreak
                ? toggleBreak(token, {
                    action: "end",
                    breakId: status.openBreak.id,
                  })
                : toggleBreak(token, { action: "start" }),
            )
          }
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>
            {status.openBreak
              ? tr("Завершити перерву", "End break")
              : tr("Почати перерву", "Start break")}
          </Text>
        </Pressable>
      ) : null}
      <Card>
        <Eyebrow>{tr("РУЧНИЙ ЗАПИС", "MANUAL ENTRY")}</Eyebrow>
        <Text style={styles.copy}>
          {tr("Наприклад", "Example")}: 2026-07-27T09:00
        </Text>
        <TextInput
          value={manual.clockIn}
          onChangeText={(clockIn) =>
            setManual((current) => ({ ...current, clockIn }))
          }
          placeholder={tr(
            "Початок: РРРР-ММ-ДДTГГ:ХХ",
            "Start: YYYY-MM-DDTHH:MM",
          )}
          style={styles.input}
        />
        <TextInput
          value={manual.clockOut}
          onChangeText={(clockOut) =>
            setManual((current) => ({ ...current, clockOut }))
          }
          placeholder={tr("Кінець: РРРР-ММ-ДДTГГ:ХХ", "End: YYYY-MM-DDTHH:MM")}
          style={styles.input}
        />
        <TextInput
          value={manual.note}
          onChangeText={(note) =>
            setManual((current) => ({ ...current, note }))
          }
          placeholder={tr("Коментар", "Note")}
          style={styles.input}
        />
        <Pressable
          disabled={
            busy ||
            !manual.clockIn ||
            !manual.clockOut ||
            overview?.periodLocked
          }
          onPress={() =>
            void run(async (token) => {
              await createManualTime(token, {
                ...manual,
                projectId,
                timeCode,
              });
              setManual({ clockIn: "", clockOut: "", note: "" });
            })
          }
          style={[
            styles.primary,
            (busy ||
              !manual.clockIn ||
              !manual.clockOut ||
              overview?.periodLocked) &&
              styles.disabled,
          ]}
        >
          <Text style={styles.primaryText}>{tr("Додати час", "Add time")}</Text>
        </Pressable>
        {overview?.periodLocked ? (
          <Text style={styles.error}>
            {tr("Поточний табель заблоковано.", "This timesheet is locked.")}
          </Text>
        ) : null}
      </Card>
      <Card>
        <Eyebrow>{tr("ОСТАННІ ЗАПИСИ", "RECENT ENTRIES")}</Eyebrow>
        {overview?.history.slice(0, 10).map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.entrySummary}>
              <Text style={styles.entryDate}>
                {new Date(entry.clockIn).toLocaleDateString(
                  locale === "uk" ? "uk-UA" : "en-GB",
                )}
              </Text>
              <Text style={styles.entryTime}>
                {formatTime(entry.clockIn, locale)} —{" "}
                {entry.clockOut
                  ? formatTime(entry.clockOut, locale)
                  : tr("триває", "in progress")}
              </Text>
            </View>
            {entry.clockOut && !overview.periodLocked ? (
              <Pressable
                onPress={() =>
                  setCorrection({
                    timeEntryId: entry.id,
                    requestedClockIn: entry.clockIn,
                    requestedClockOut: entry.clockOut ?? "",
                    reason: "",
                  })
                }
                style={styles.smallAction}
              >
                <Text style={styles.smallActionText}>
                  {tr("Виправити", "Correct")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {!overview?.history.length ? (
          <Text style={styles.copy}>
            {tr("Записів часу ще немає.", "No time entries yet.")}
          </Text>
        ) : null}
      </Card>
      {correction ? (
        <Card>
          <Eyebrow>{tr("ЗАПИТ НА КОРИГУВАННЯ", "CORRECTION REQUEST")}</Eyebrow>
          <Text style={styles.copy}>
            {tr(
              "Змініть час і поясніть причину. Після надсилання запит перевірить менеджер.",
              "Change the time and explain why. Your manager will review the request.",
            )}
          </Text>
          <TextInput
            value={correction.requestedClockIn}
            onChangeText={(requestedClockIn) =>
              setCorrection((current) =>
                current ? { ...current, requestedClockIn } : current,
              )
            }
            placeholder={tr("Початок", "Start")}
            style={styles.input}
          />
          <TextInput
            value={correction.requestedClockOut}
            onChangeText={(requestedClockOut) =>
              setCorrection((current) =>
                current ? { ...current, requestedClockOut } : current,
              )
            }
            placeholder={tr("Кінець", "End")}
            style={styles.input}
          />
          <TextInput
            value={correction.reason}
            onChangeText={(reason) =>
              setCorrection((current) =>
                current ? { ...current, reason } : current,
              )
            }
            multiline
            placeholder={tr("Причина зміни", "Reason for change")}
            style={[styles.input, styles.reason]}
          />
          <View style={styles.row}>
            <Pressable
              disabled={busy}
              onPress={() => setCorrection(null)}
              style={styles.secondaryCompact}
            >
              <Text style={styles.secondaryText}>{t("cancel")}</Text>
            </Pressable>
            <Pressable
              disabled={busy || correction.reason.trim().length < 5}
              onPress={() =>
                void run(async (token) => {
                  await requestTimeCorrection(token, correction);
                  setCorrection(null);
                })
              }
              style={[
                styles.primaryCompact,
                (busy || correction.reason.trim().length < 5) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.primaryText}>{t("submit")}</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
      {overview?.corrections.length ? (
        <Card>
          <Eyebrow>{tr("МОЇ КОРИГУВАННЯ", "MY CORRECTIONS")}</Eyebrow>
          {overview.corrections.map((item) => (
            <Text key={item.id} style={styles.copy}>
              {item.reason} · {correctionStatus(item.status, locale)}
            </Text>
          ))}
        </Card>
      ) : null}
      {!status.linked ? (
        <Text style={styles.error}>
          {tr(
            "Акаунт не прив’язано до профілю працівника.",
            "This account is not linked to an employee profile.",
          )}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function formatTime(value: string, locale: "uk" | "en") {
  return new Date(value).toLocaleTimeString(
    locale === "uk" ? "uk-UA" : "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}
function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
function correctionStatus(status: string, locale: "uk" | "en") {
  return (
    {
      pending: locale === "uk" ? "очікує рішення" : "pending",
      approved: locale === "uk" ? "погоджено" : "approved",
      rejected: locale === "uk" ? "відхилено" : "rejected",
    }[status] ?? status
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  status: { color: colors.green, fontSize: 22, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", gap: 8 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  activeChoice: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  choiceText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  primary: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 52,
  },
  primaryText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    borderColor: colors.ink,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  primaryCompact: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  secondaryCompact: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  entry: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingTop: 9,
  },
  entrySummary: { flex: 1 },
  entryDate: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  entryTime: { color: colors.muted, fontSize: 13 },
  smallAction: {
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  smallActionText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  reason: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
  disabled: { opacity: 0.55 },
  error: { color: "#b4362a", fontSize: 14, lineHeight: 20 },
});
