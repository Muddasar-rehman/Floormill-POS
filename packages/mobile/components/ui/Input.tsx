import { TextInput, StyleSheet, type TextInputProps } from "react-native";
import { colors } from "./theme";

export function Input(props: TextInputProps) {
  return <TextInput style={styles.input} placeholderTextColor={colors.textMuted} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
