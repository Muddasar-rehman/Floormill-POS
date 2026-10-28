import { Pressable, Text, ActivityIndicator, StyleSheet, type PressableProps } from "react-native";
import { colors } from "./theme";

type Variant = "primary" | "outline" | "ghost" | "destructive";

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  style,
  ...props
}: PressableProps & { title: string; variant?: Variant; loading?: boolean }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && { opacity: 0.5 },
        pressed && !isDisabled && { opacity: 0.85 },
        style as never,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "destructive" ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.text, textVariantStyles[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  text: { fontWeight: "600", fontSize: 15 },
});

const variantStyles: Record<Variant, object> = {
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: "transparent" },
  destructive: { backgroundColor: colors.destructive },
};

const textVariantStyles: Record<Variant, object> = {
  primary: { color: colors.primaryText },
  outline: { color: colors.text },
  ghost: { color: colors.text },
  destructive: { color: colors.primaryText },
};
