import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import {
  createOrgUnit,
  getAdminOverview,
  updateOrgUnit,
  type MobileAdminData,
} from "@/lib/api";
import { useMobileI18n } from "@/lib/i18n";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

export default function AdminOrganization() {
  const { accessToken } = useSession();
  const { tr } = useMobileI18n();
  const [data, setData] = useState<MobileAdminData | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"division" | "department" | "team">(
    "department",
  );
  const [names, setNames] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    const token = await accessToken();
    if (token) setData(await getAdminOverview(token));
  }, [accessToken]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function run(action: (token: string) => Promise<unknown>) {
    const token = await accessToken();
    if (!token) return;
    try {
      await action(token);
      await load();
    } catch (cause) {
      Alert.alert(
        tr("Не вдалося зберегти", "Could not save"),
        cause instanceof Error
          ? cause.message
          : tr("Повторіть спробу.", "Please try again."),
      );
    }
  }
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: tr("Редактор оргструктури", "Organization editor"),
        }}
      />
      <Screen>
        <Eyebrow>{tr("ОРГСТРУКТУРА", "ORGANIZATION")}</Eyebrow>
        <Text style={styles.title}>{tr("Підрозділи", "Units")}</Text>
        <Card>
          <Text style={styles.heading}>
            {tr("Створити підрозділ", "Create a unit")}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={tr("Назва", "Name")}
            style={styles.input}
          />
          <View style={styles.row}>
            {(["division", "department", "team"] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setType(value)}
                style={[styles.choice, type === value && styles.active]}
              >
                <Text style={styles.choiceText}>
                  {value === "division"
                    ? tr("Дивізіон", "Division")
                    : value === "department"
                      ? tr("Відділ", "Department")
                      : tr("Команда", "Team")}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            disabled={!name.trim()}
            onPress={() =>
              void run(async (token) => {
                await createOrgUnit(token, {
                  name,
                  type,
                  parentId: null,
                  leadEmployeeId: null,
                });
                setName("");
              })
            }
            style={styles.save}
          >
            <Text style={styles.saveText}>{tr("Створити", "Create")}</Text>
          </Pressable>
        </Card>
        {data?.settings.units.map((unit) => (
          <Card key={unit.id}>
            <Text style={styles.heading}>
              {unit.type === "division"
                ? tr("Дивізіон", "Division")
                : unit.type === "department"
                  ? tr("Відділ", "Department")
                  : unit.type === "team"
                    ? tr("Команда", "Team")
                    : tr("Компанія", "Company")}
            </Text>
            <TextInput
              value={names[unit.id] ?? unit.name}
              onChangeText={(value) =>
                setNames((current) => ({ ...current, [unit.id]: value }))
              }
              style={styles.input}
            />
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  void run((token) =>
                    updateOrgUnit(token, unit.id, {
                      name: names[unit.id] ?? unit.name,
                      parentId: unit.parentId,
                      leadEmployeeId: unit.leadEmployeeId,
                      active: unit.active,
                    }),
                  )
                }
                style={styles.save}
              >
                <Text style={styles.saveText}>
                  {tr("Зберегти назву", "Save name")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  void run((token) =>
                    updateOrgUnit(token, unit.id, {
                      name: names[unit.id] ?? unit.name,
                      parentId: unit.parentId,
                      leadEmployeeId: unit.leadEmployeeId,
                      active: !unit.active,
                    }),
                  )
                }
                style={[styles.choice, unit.active && styles.active]}
              >
                <Text style={styles.choiceText}>
                  {unit.active
                    ? tr("Активний", "Active")
                    : tr("Вимкнений", "Disabled")}
                </Text>
              </Pressable>
            </View>
          </Card>
        ))}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  heading: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  input: {
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.ink,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
  },
  active: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  choiceText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  save: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  saveText: { color: colors.ink, fontWeight: "800" },
});
