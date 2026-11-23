import { Redirect } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "@/components/screen";
import { useSession } from "@/providers/session-provider";

export default function SignIn() {
  const { session, signIn, authenticating, error } = useSession();
  if (session) return <Redirect href="/(tabs)/home" />;
  return (
    <View style={styles.page}>
      <View style={styles.logo}>
        <Text style={styles.diamond}>◆</Text>
        <Text style={styles.logoText}>INCORA</Text>
        <Text style={styles.people}>PEOPLE</Text>
      </View>
      <Text style={styles.eyebrow}>ВНУТРІШНЯ ПЛАТФОРМА</Text>
      <Text style={styles.title}>Все для роботи команди — в одному місці.</Text>
      <Text style={styles.copy}>
        Увійдіть через свій Google-акаунт. Доступи визначаються вашим профілем у
        INCORA People.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={authenticating}
        onPress={() => void signIn()}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
          authenticating && styles.disabled,
        ]}
      >
        {authenticating ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Text style={styles.buttonText}>Увійти через Google</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.ink,
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  logo: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 56,
  },
  diamond: { color: colors.yellow, fontSize: 22 },
  logoText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  people: {
    borderLeftColor: "#555",
    borderLeftWidth: 1,
    color: "#ddd",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginLeft: 3,
    paddingLeft: 8,
  },
  eyebrow: {
    color: colors.yellow,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.1,
    lineHeight: 39,
    marginTop: 12,
  },
  copy: { color: "#c7c7c4", fontSize: 16, lineHeight: 24, marginTop: 16 },
  button: {
    alignItems: "center",
    backgroundColor: colors.yellow,
    borderRadius: 12,
    marginTop: 34,
    minHeight: 54,
    justifyContent: "center",
  },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.6 },
  error: { color: "#ffb5ac", marginTop: 14 },
});
