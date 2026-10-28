import { View, Text, StyleSheet } from "react-native";
import { colors } from "./theme";

type Variant = "outline" | "success" | "secondary" | "destructive";

export function Badge({ label, variant = "outline" }: { label: string; variant?: Variant }) {
  return (
    <View style={[styles.base, variantStyles[variant]]}>
      <Text style={[styles.text, textVariantStyles[variant]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, alignSelf: "flex-start" },
  text: { fontSize: 11, fontWeight: "600" },
});

const variantStyles: Record<Variant, object> = {
  outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
  success: { backgroundColor: colors.successMuted },
  secondary: { backgroundColor: colors.secondaryMuted },
  destructive: { backgroundColor: colors.destructiveMuted },
};

const textVariantStyles: Record<Variant, object> = {
  outline: { color: colors.textMuted },
  success: { color: colors.success },
  secondary: { color: colors.textMuted },
  destructive: { color: colors.destructive },
};
