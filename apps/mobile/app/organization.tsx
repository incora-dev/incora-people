import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Stack } from "expo-router";
import { getOrganization, type OrganizationData } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

export default function OrganizationScreen() {
  const { accessToken } = useSession();
  const { t } = useMobileI18n();
  const [data, setData] = useState<OrganizationData | null>(null);
  useEffect(() => {
    void (async () => {
      const token = await accessToken();
      if (token) setData(await getOrganization(token));
    })();
  }, [accessToken]);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t("organization") }} />
      <Screen>
        <Eyebrow>INCORA</Eyebrow>
        <Text style={styles.title}>{t("organization")}</Text>
        {data?.units.map((unit) => (
          <Card key={unit.id}>
            <Text style={styles.unit}>{unit.name}</Text>
            <Text style={styles.copy}>{unit.kind}</Text>
            {data.people
              .filter((person) => person.department === unit.name)
              .map((person) => (
                <Text key={person.id} style={styles.copy}>
                  • {person.firstName} {person.lastName} — {person.jobTitle}
                </Text>
              ))}
          </Card>
        ))}
        {!data ? <Text style={styles.copy}>{t("loading")}</Text> : null}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  unit: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
