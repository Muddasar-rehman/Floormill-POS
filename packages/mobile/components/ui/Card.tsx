import { View, type ViewProps } from "react-native";
import { colors } from "./theme";

export function Card({ style, ...props }: ViewProps) {
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
        style,
      ]}
      {...props}
    />
  );
}
