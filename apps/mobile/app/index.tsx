import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/providers/session-provider";
import { colors } from "@/components/screen";

export default function Index() {
  const { ready, session } = useSession();
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
  return <Redirect href={session ? "/(tabs)/home" : "/sign-in"} />;
}
