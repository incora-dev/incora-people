import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import {
  getTeamTime,
  reviewTimeCorrection,
  updateTimesheetPeriod,
  type MobileTeamTime,
} from "@/lib/api";
import { useMobileI18n } from "@/lib/i18n";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

export default function TeamTimeScreen() {
  const { accessToken } = useSession();
  const { locale, tr } = useMobileI18n();
  const [data, setData] = useState<MobileTeamTime | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const token = await accessToken();
    if (token) setData(await getTeamTime(token));
  }, [accessToken]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(key: string, action: (token: string) => Promise<unknown>) {
    const token = await accessToken();
    if (!token || busy) return;
    setBusy(key);
    try {
      await action(token);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося виконати дію", "Could not complete the action"),
        cause instanceof Error
          ? cause.message
          : tr("Повторіть спробу.", "Please try again."),
      );
    } finally {
      setBusy("");
    }
  }

  function updatePeriod(
    employeeId: number,
    status: "open" | "locked" | "approved" | "revision_required",
  ) {
    if (!data) return;
    void run(`period-${employeeId}-${status}`, (token) =>
      updateTimesheetPeriod(token, employeeId, {
        month: data.month,
        status,
        note: "",
      }),
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: tr("Табелі команди", "Team timesheets"),
        }}
      />
      <Screen>
        <Eyebrow>{data?.month ?? tr("ТАБЕЛІ", "TIMESHEETS")}</Eyebrow>
        <Text style={styles.title}>{tr("Час команди", "Team time")}</Text>
        {data?.rows.map((row) => (
          <Card key={row.employeeId}>
            <Text style={styles.name}>
              {row.firstName} {row.lastName}
            </Text>
            <Text style={styles.copy}>
              {tr(
                `${Math.round(row.workedMinutes / 60)} год із ${Math.round(row.expectedMinutes / 60)} · понаднормово ${Math.round(row.overtimeMinutes / 60)} год`,
                `${Math.round(row.workedMinutes / 60)}h of ${Math.round(row.expectedMinutes / 60)}h · overtime ${Math.round(row.overtimeMinutes / 60)}h`,
              )}
            </Text>
            <Text style={styles.copy}>
              {tr("Статус", "Status")}:{" "}
              {row.status === "open"
                ? tr("Відкритий", "Open")
                : row.status === "locked"
                  ? tr("Закритий", "Locked")
                  : row.status === "approved"
                    ? tr("Погоджений", "Approved")
                    : tr("На доопрацюванні", "Revision required")}{" "}
              · {tr("відкритих таймерів", "open timers")}: {row.openEntries} ·{" "}
              {tr("коригувань", "corrections")}: {row.pendingCorrections}
            </Text>
            <View style={styles.actions}>
              {row.status !== "revision_required" ? (
                <ActionButton
                  disabled={Boolean(busy)}
                  label={tr("На доопрацювання", "Request revision")}
                  onPress={() =>
                    updatePeriod(row.employeeId, "revision_required")
                  }
                />
              ) : null}
              {row.status !== "locked" ? (
                <ActionButton
                  disabled={Boolean(busy)}
                  label={tr("Закрити", "Lock")}
                  onPress={() => updatePeriod(row.employeeId, "locked")}
                />
              ) : null}
              {row.status !== "approved" ? (
                <ActionButton
                  disabled={Boolean(busy)}
                  label={tr("Погодити", "Approve")}
                  primary
                  onPress={() => updatePeriod(row.employeeId, "approved")}
                />
              ) : (
                <ActionButton
                  disabled={Boolean(busy)}
                  label={tr("Відкрити знову", "Reopen")}
                  onPress={() => updatePeriod(row.employeeId, "open")}
                />
              )}
            </View>
          </Card>
        ))}
        {data?.corrections.length ? (
          <Card>
            <Eyebrow>
              {tr(
                "КОРИГУВАННЯ, ЩО ОЧІКУЮТЬ РІШЕННЯ",
                "CORRECTIONS AWAITING REVIEW",
              )}
            </Eyebrow>
            {data.corrections.map((item) => (
              <View key={item.id} style={styles.correction}>
                <Text style={styles.name}>
                  {item.employeeFirstName} {item.employeeLastName}
                </Text>
                <Text style={styles.copy}>{item.reason}</Text>
                <Text style={styles.copy}>
                  {new Date(item.requestedClockIn).toLocaleString(
                    locale === "en" ? "en-GB" : "uk-UA",
                  )}{" "}
                  —{" "}
                  {new Date(item.requestedClockOut).toLocaleString(
                    locale === "en" ? "en-GB" : "uk-UA",
                  )}
                </Text>
                <View style={styles.actions}>
                  <ActionButton
                    disabled={Boolean(busy)}
                    label={tr("Відхилити", "Reject")}
                    onPress={() =>
                      void run(`correction-${item.id}-rejected`, (token) =>
                        reviewTimeCorrection(
                          token,
                          item.id,
                          "rejected",
                          tr("Відхилено менеджером", "Rejected by manager"),
                        ),
                      )
                    }
                  />
                  <ActionButton
                    disabled={Boolean(busy)}
                    label={tr("Погодити", "Approve")}
                    primary
                    onPress={() =>
                      void run(`correction-${item.id}-approved`, (token) =>
                        reviewTimeCorrection(
                          token,
                          item.id,
                          "approved",
                          tr("Погоджено менеджером", "Approved by manager"),
                        ),
                      )
                    }
                  />
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </Screen>
    </>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary && styles.primaryButton,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  name: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  correction: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  button: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  primaryButton: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
});
