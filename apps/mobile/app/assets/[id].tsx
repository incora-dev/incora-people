import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { getResources, type MobileResources } from "@/lib/api";
import { Card, colors, Eyebrow, Screen } from "@/components/screen";
import { useSession } from "@/providers/session-provider";
import { useMobileI18n } from "@/lib/i18n";

type Asset = MobileResources["assets"][number];
export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useSession();
  const { t, tr } = useMobileI18n();
  const [asset, setAsset] = useState<Asset | null>(null);
  useEffect(() => {
    void (async () => {
      const token = await accessToken();
      if (!token) return;
      setAsset(
        (await getResources(token)).assets.find(
          (item) => item.id === Number(id),
        ) ?? null,
      );
    })();
  }, [accessToken, id]);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: tr("Актив", "Asset") }}
      />
      <Screen>
        {asset ? (
          <>
            <Eyebrow>{asset.category}</Eyebrow>
            <Text style={styles.title}>{asset.name}</Text>
            <Card>
              <Text style={styles.code}>{asset.assetTag}</Text>
              <Text style={styles.copy}>
                {tr("Статус", "Status")}: {asset.status}
              </Text>
              <Text style={styles.copy}>
                {tr("Власник", "Assignee")}:{" "}
                {asset.assigneeFirstName
                  ? `${asset.assigneeFirstName} ${asset.assigneeLastName}`
                  : tr("не призначено", "not assigned")}
              </Text>
              {asset.serialNumber ? (
                <Text style={styles.copy}>
                  {tr("Серійний номер", "Serial number")}: {asset.serialNumber}
                </Text>
              ) : null}
              {asset.note ? (
                <Text style={styles.copy}>
                  {tr("Примітка", "Note")}: {asset.note}
                </Text>
              ) : null}
              {asset.latestEvent ? (
                <Text style={styles.copy}>
                  {tr("Остання дія", "Latest action")}:{" "}
                  {asset.latestEvent.eventType} · {asset.latestEvent.createdAt}
                </Text>
              ) : null}
            </Card>
          </>
        ) : (
          <Text style={styles.copy}>{t("loading")}</Text>
        )}
      </Screen>
    </>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  code: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
