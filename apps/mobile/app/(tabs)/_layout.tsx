import { Tabs } from "expo-router";
import { colors } from "@/components/screen";
import { useMobileI18n } from "@/lib/i18n";

export default function TabsLayout() {
  const { t } = useMobileI18n();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.ink,
        tabBarActiveBackgroundColor: colors.yellow,
        tabBarInactiveTintColor: "#757575",
        tabBarStyle: {
          backgroundColor: colors.ink,
          borderTopWidth: 0,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("home") }} />
      <Tabs.Screen name="people" options={{ title: t("people") }} />
      <Tabs.Screen name="leave" options={{ title: t("leave") }} />
      <Tabs.Screen name="time" options={{ title: t("time") }} />
      <Tabs.Screen name="more" options={{ title: t("more") }} />
    </Tabs>
  );
}
