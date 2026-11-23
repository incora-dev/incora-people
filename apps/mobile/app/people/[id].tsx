import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getPerson, type PersonProfile } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      const token = await accessToken();
      if (token) setProfile(await getPerson(token, Number(id)));
    })().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : tr("Не вдалося відкрити профіль.", "Could not open the profile."),
      ),
    );
  }, [accessToken, id, tr]);
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: tr("Профіль працівника", "Employee profile"),
        }}
      />
      <Screen>
        {profile ? (
          <>
            <Eyebrow>{tr("ПРАЦІВНИК", "EMPLOYEE")}</Eyebrow>
            <Text style={styles.title}>
              {profile.employee.firstName} {profile.employee.lastName}
            </Text>
            <Card>
              <Text style={styles.role}>{profile.employee.jobTitle}</Text>
              <Text style={styles.copy}>
                {profile.employee.department}
                {profile.employee.team ? ` · ${profile.employee.team}` : ""}
              </Text>
              <Text style={styles.copy}>
                {tr("Керівник", "Manager")}:{" "}
                {profile.employee.managerName ||
                  tr("не вказано", "not specified")}
              </Text>
              <Text style={styles.copy}>
                {tr("У компанії з", "With the company since")}{" "}
                {profile.employee.startDate}
              </Text>
            </Card>
            <Pressable
              onPress={() =>
                void Linking.openURL(
                  `https://chat.google.com/u/0/#search/${encodeURIComponent(profile.employee.email)}`,
                )
              }
              style={styles.chat}
            >
              <Text style={styles.chatText}>
                {tr("Написати в Google Chat", "Message in Google Chat")}
              </Text>
            </Pressable>
            {profile.records.length ? (
              <Card>
                <Eyebrow>
                  {tr("ДОСВІД І КОМПЕТЕНЦІЇ", "EXPERIENCE AND SKILLS")}
                </Eyebrow>
                {profile.records.map((record) => (
                  <Text key={record.id} style={styles.copy}>
                    {record.title}
                    {record.details ? ` · ${record.details}` : ""}
                  </Text>
                ))}
              </Card>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>{error || t("loading")}</Text>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  role: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  chat: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 11,
    justifyContent: "center",
    minHeight: 50,
  },
  chatText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
});
