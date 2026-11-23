import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export function Screen({ children }: PropsWithChildren) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export const colors = {
  ink: "#191919",
  yellow: "#f9c400",
  canvas: "#f5f5f2",
  muted: "#70747b",
  border: "#e1e2df",
  green: "#25975a",
};

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flexGrow: 1, gap: 14, padding: 20 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
});
