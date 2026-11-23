import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

export default function AuthCallback() {
  const { error } = useSession();
  return (
    <View style={styles.page}>
      <ActivityIndicator color={colors.yellow} />
      <Text style={styles.title}>
        {error ? "Не вдалося завершити вхід" : "Завершуємо вхід…"}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
    backgroundColor: colors.ink,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  error: { color: "#ffb5ac", textAlign: "center" },
});
