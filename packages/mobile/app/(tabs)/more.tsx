import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { getStoredLanguage, setStoredLanguage } from "../../lib/i18n";
import { moreItemsForRole } from "../../lib/roles";
import { colors } from "../../components/ui/theme";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export default function More() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();

  const items = moreItemsForRole(profile?.role);

  async function toggleLanguage() {
    const current = await getStoredLanguage();
    await setStoredLanguage(current === "en" ? "ur" : "en");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t("common.more")}</Text>
        <Button title={i18n.language === "ur" ? "EN" : "اردو"} variant="outline" onPress={toggleLanguage} />
      </View>

      <Card style={styles.menuCard}>
        {items.map((item) => (
          <Pressable key={item.to} style={styles.navRow} onPress={() => router.push(item.to as never)}>
            <Text style={styles.navRowText}>{t(item.labelKey)}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </Card>

      <Button title={t("common.signOut")} variant="destructive" onPress={() => supabase.auth.signOut()} style={styles.signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  menuCard: { padding: 0 },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  navRowText: { fontSize: 15, color: colors.text },
  chevron: { fontSize: 18, color: colors.textMuted },
  signOut: { marginTop: 12 },
});
