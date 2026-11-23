import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { router } from "expo-router";
import {
  getAdminOverview,
  updateAccessPolicy,
  updateAdminBug,
  updateLeaveBalance,
  updateOrgUnitActive,
  updateLeaveType,
  updateReimbursementPolicy,
  updateUserRole,
  type ApiUser,
  type MobileAdminData,
} from "@/lib/api";
import { useMobileI18n } from "@/lib/i18n";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

const roles: ApiUser["role"][] = [
  "employee",
  "manager",
  "hr_admin",
  "super_admin",
];
export default function AdminScreen() {
  const { accessToken } = useSession();
  const { tr } = useMobileI18n();
  const [data, setData] = useState<MobileAdminData | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const token = await accessToken();
    if (token) setData(await getAdminOverview(token));
  }, [accessToken]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void load().catch((cause) =>
          Alert.alert(
            tr("Помилка", "Error"),
            cause instanceof Error
              ? cause.message
              : tr(
                  "Не вдалося завантажити налаштування.",
                  "Could not load settings.",
                ),
          ),
        ),
      0,
    );
    return () => clearTimeout(timer);
  }, [load, tr]);
  async function action(run: (token: string) => Promise<unknown>) {
    const token = await accessToken();
    if (!token) return;
    setBusy(true);
    try {
      await run(token);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося зберегти", "Could not save"),
        cause instanceof Error
          ? cause.message
          : tr("Повторіть спробу.", "Please try again."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: tr("Адміністрування", "Administration"),
        }}
      />
      <Screen>
        <Eyebrow>{tr("КЕРУВАННЯ СИСТЕМОЮ", "SYSTEM MANAGEMENT")}</Eyebrow>
        <Text style={styles.title}>
          {tr("Адміністрування", "Administration")}
        </Text>
        <View style={styles.roles}>
          <Pressable
            onPress={() => router.push("/admin-organization")}
            style={styles.resolve}
          >
            <Text style={styles.resolveText}>
              {tr("Редактор оргструктури", "Organization editor")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/team-time")}
            style={styles.resolve}
          >
            <Text style={styles.resolveText}>
              {tr("Табелі команди", "Team timesheets")}
            </Text>
          </Pressable>
        </View>
        <Card>
          <Eyebrow>{tr("КОРИСТУВАЧІ ТА РОЛІ", "USERS AND ROLES")}</Eyebrow>
          {data?.settings.people.map((person) => (
            <View key={person.userId} style={styles.item}>
              <Text style={styles.name}>
                {person.firstName || person.email} {person.lastName || ""}
              </Text>
              <Text style={styles.copy}>{person.email}</Text>
              <View style={styles.roles}>
                {roles.map((role) => (
                  <Pressable
                    key={role}
                    disabled={busy}
                    onPress={() =>
                      void action((token) =>
                        updateUserRole(token, person.userId, role),
                      )
                    }
                    style={[
                      styles.role,
                      person.role === role && styles.roleActive,
                    ]}
                  >
                    <Text style={styles.roleText}>
                      {role === "employee"
                        ? tr("Працівник", "Employee")
                        : role === "manager"
                          ? tr("Менеджер", "Manager")
                          : role === "hr_admin"
                            ? tr("HR-адміністратор", "HR administrator")
                            : tr("Суперадміністратор", "Super administrator")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Card>
        <Card>
          <Eyebrow>{tr("БАГ-ТІКЕТИ", "BUG TICKETS")}</Eyebrow>
          {data?.reports.map((report) => (
            <View key={report.id} style={styles.item}>
              <Text style={styles.name}>{report.reporterEmail}</Text>
              <Text style={styles.copy}>{report.description}</Text>
              <Pressable
                disabled={busy}
                onPress={() =>
                  void action((token) =>
                    updateAdminBug(
                      token,
                      report.id,
                      report.status === "resolved" ? "open" : "resolved",
                    ),
                  )
                }
                style={styles.resolve}
              >
                <Text style={styles.resolveText}>
                  {report.status === "resolved"
                    ? tr("Відкрити повторно", "Reopen")
                    : tr("Позначити виправленим", "Mark as resolved")}
                </Text>
              </Pressable>
            </View>
          ))}
        </Card>
        <Card>
          <Eyebrow>{tr("ПОЛІТИКИ ДОСТУПУ", "ACCESS POLICIES")}</Eyebrow>
          {data?.settings.policies.map((policy) => (
            <View key={policy.id} style={styles.item}>
              <Text style={styles.name}>{policy.label}</Text>
              <View style={styles.roles}>
                {(
                  [
                    "managePeople",
                    "approveLeave",
                    "approveTime",
                    "approveExpenses",
                    "viewAudit",
                  ] as const
                ).map((key) => (
                  <Pressable
                    key={key}
                    disabled={busy || policy.role === "super_admin"}
                    onPress={() =>
                      void action((token) =>
                        updateAccessPolicy(token, {
                          ...policy,
                          [key]: !policy[key],
                        }),
                      )
                    }
                    style={[styles.role, policy[key] && styles.roleActive]}
                  >
                    <Text style={styles.roleText}>
                      {key === "managePeople"
                        ? tr("Керування людьми", "Manage people")
                        : key === "approveLeave"
                          ? tr("Погодження відсутностей", "Approve leave")
                          : key === "approveTime"
                            ? tr("Погодження часу", "Approve time")
                            : key === "approveExpenses"
                              ? tr(
                                  "Погодження відшкодувань",
                                  "Approve reimbursements",
                                )
                              : tr("Перегляд аудиту", "View audit")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </Card>
        <Card>
          <Eyebrow>{tr("ВІДШКОДУВАННЯ", "REIMBURSEMENTS")}</Eyebrow>
          {data?.settings.expensePolicies.map((policy) => (
            <View key={policy.id} style={styles.item}>
              <Text style={styles.copy}>
                {policy.name}: {tr("до", "up to")}{" "}
                {(policy.perRequestLimit / 100).toFixed(0)} {policy.currency},{" "}
                {policy.maxRequestsPerYear}{" "}
                {tr("запитів на рік", "requests per year")}
              </Text>
              <View style={styles.roles}>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateReimbursementPolicy(token, {
                        ...policy,
                        maxRequestsPerYear: Math.max(
                          1,
                          policy.maxRequestsPerYear - 1,
                        ),
                      }),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>
                    {tr("− запит", "− request")}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateReimbursementPolicy(token, {
                        ...policy,
                        maxRequestsPerYear: policy.maxRequestsPerYear + 1,
                      }),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>
                    {tr("+ запит", "+ request")}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateReimbursementPolicy(token, {
                        ...policy,
                        enabled: !policy.enabled,
                      }),
                    )
                  }
                  style={[styles.role, policy.enabled && styles.roleActive]}
                >
                  <Text style={styles.roleText}>
                    {policy.enabled
                      ? tr("Увімкнено", "Enabled")
                      : tr("Вимкнено", "Disabled")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
        <Card>
          <Eyebrow>
            {tr("ОРГСТРУКТУРА ТА ВІДСУТНОСТІ", "ORGANIZATION AND LEAVE")}
          </Eyebrow>
          <Text style={styles.copy}>
            {data?.settings.units.length ?? 0} {tr("підрозділів", "units")} ·{" "}
            {data?.settings.types.length ?? 0}{" "}
            {tr("типів відсутностей", "leave types")} ·{" "}
            {data?.settings.balances.length ?? 0} {tr("балансів", "balances")}
          </Text>
          {data?.settings.types.map((policy) => (
            <View key={policy.id} style={styles.item}>
              <Text style={styles.name}>
                {policy.name} · {policy.defaultAllowance} {tr("дн.", "days")}
              </Text>
              <View style={styles.roles}>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateLeaveType(token, {
                        ...policy,
                        defaultAllowance: Math.max(
                          0,
                          policy.defaultAllowance - 1,
                        ),
                      }),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>{tr("−1 день", "−1 day")}</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateLeaveType(token, {
                        ...policy,
                        defaultAllowance: policy.defaultAllowance + 1,
                      }),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>{tr("+1 день", "+1 day")}</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateLeaveType(token, {
                        ...policy,
                        requiresApproval: !policy.requiresApproval,
                      }),
                    )
                  }
                  style={[
                    styles.role,
                    policy.requiresApproval && styles.roleActive,
                  ]}
                >
                  <Text style={styles.roleText}>
                    {policy.requiresApproval
                      ? tr("Потребує погодження", "Approval required")
                      : tr("Без погодження", "No approval")}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {data?.settings.units.map((unit) => (
            <View key={unit.id} style={styles.item}>
              <Text style={styles.name}>
                {unit.name} · {unit.type}
              </Text>
              <Pressable
                disabled={busy}
                onPress={() =>
                  void action((token) =>
                    updateOrgUnitActive(token, unit.id, !unit.active),
                  )
                }
                style={[styles.role, unit.active && styles.roleActive]}
              >
                <Text style={styles.roleText}>
                  {unit.active
                    ? tr("Активний", "Active")
                    : tr("Вимкнений", "Disabled")}
                </Text>
              </Pressable>
            </View>
          ))}
          {data?.settings.balances.slice(0, 30).map((balance) => (
            <View key={balance.id} style={styles.item}>
              <Text style={styles.name}>
                {balance.firstName} {balance.lastName} · {balance.typeName}
              </Text>
              <Text style={styles.copy}>
                {tr("Ліміт", "Allowance")} {balance.allowance},{" "}
                {tr("коригування", "adjustment")} {balance.adjustment},{" "}
                {tr("використано", "used")} {balance.used}
              </Text>
              <View style={styles.roles}>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateLeaveBalance(
                        token,
                        balance.id,
                        balance.allowance,
                        balance.adjustment - 1,
                      ),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>−1</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void action((token) =>
                      updateLeaveBalance(
                        token,
                        balance.id,
                        balance.allowance,
                        balance.adjustment + 1,
                      ),
                    )
                  }
                  style={styles.role}
                >
                  <Text style={styles.roleText}>+1</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
        {!data ? (
          <Text style={styles.copy}>{tr("Завантаження…", "Loading…")}</Text>
        ) : null}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  item: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 7,
    paddingTop: 11,
  },
  name: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  role: {
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  roleActive: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  roleText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  resolve: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 38,
  },
  resolveText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
});
