import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { colors } from "../components/ui/theme";

export default function Login() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) {
    return <Redirect href="/" />;
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t("login.title") }} />
      <Text style={styles.title}>{t("login.title")}</Text>
      <Text style={styles.subtitle}>{t("login.subtitle")}</Text>
      <Input placeholder={t("login.email") ?? undefined} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Input placeholder={t("login.password") ?? undefined} secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={busy ? t("common.signingIn") : t("common.signIn")} onPress={handleSignIn} loading={busy} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12, backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 12 },
  button: { marginTop: 8 },
  error: { color: colors.destructive },
});
