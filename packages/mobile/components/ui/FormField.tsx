import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "./theme";

export function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text },
  error: { fontSize: 12, color: colors.destructive },
});
