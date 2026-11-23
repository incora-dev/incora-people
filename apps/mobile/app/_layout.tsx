import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, router, useSegments, type Href } from "expo-router";
import { colors } from "@/components/screen";
import { SessionProvider } from "@/providers/session-provider";
import { useSession } from "@/providers/session-provider";
import { addPushResponseListener } from "@/lib/push";

export default function RootLayout() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}

function SessionGate() {
  const { ready, session } = useSession();
  const segments = useSegments();
  useEffect(() => {
    const subscription = addPushResponseListener((href) => {
      router.push(toMobileHref(href));
    });
    return () => subscription.remove();
  }, []);
  if (!ready) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.canvas,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  const rootSegment = String(segments[0] ?? "");
  const isPublicRoute = rootSegment === "sign-in" || rootSegment === "auth";
  if (!session && !isPublicRoute) return <Redirect href="/sign-in" />;
  if (session && isPublicRoute) return <Redirect href="/(tabs)/home" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

function toMobileHref(href: string): Href {
  const routes: Record<string, Href> = {
    "/": "/(tabs)/home",
    "/leave": "/(tabs)/leave",
    "/time": "/(tabs)/time",
    "/tasks": "/tasks",
    "/expenses": "/expenses",
    "/announcements": "/announcements",
    "/operations": "/operations",
    "/admin": "/admin",
  };
  return routes[href.split("?")[0]] ?? "/(tabs)/home";
}
