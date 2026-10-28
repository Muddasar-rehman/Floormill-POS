import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { type Shareholder } from "shared";
import { supabase } from "../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../lib/printHtml";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { colors } from "../components/ui/theme";

export default function Shareholders() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Shareholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("shareholders").select("*").order("name");
    setRows((data as Shareholder[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const totalInvestment = rows.reduce((sum, r) => sum + r.investment_amount, 0);
  const totalRatio = rows.reduce((sum, r) => sum + r.profit_ratio_pct, 0);

  async function handleShare() {
    setSharing(true);
    try {
      const rowsHtml =
        rows.length === 0
          ? `<tr><td colspan="3" class="muted">${t("shareholders.empty")}</td></tr>`
          : rows
              .map((r) => `<tr><td>${r.name}</td><td class="right">${r.investment_amount.toFixed(2)}</td><td class="right">${r.profit_ratio_pct}%</td></tr>`)
              .join("");
      const body = `<table><thead><tr><th>${t("common.name")}</th><th class="right">${t("shareholders.colInvestment")}</th><th class="right">${t("shareholders.colRatio")}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      const html = letterheadHtml(t("shareholders.title"), t("shareholders.subtitle", { investment: totalInvestment.toFixed(2), ratio: totalRatio.toFixed(1) }), body);
      await shareAsPdf(html, "shareholders");
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t("shareholders.title") }} />
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          {t("shareholders.subtitle", { investment: totalInvestment.toFixed(2), ratio: totalRatio.toFixed(1) })}
        </Text>
        <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} />
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={styles.empty}>{t("shareholders.empty")}</Text>}
        renderItem={({ item: r }) => (
          <Card style={styles.row}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.meta}>
              {t("shareholders.colInvestment")}: {r.investment_amount.toFixed(2)} · {t("shareholders.colRatio")}: {r.profit_ratio_pct}%
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: 16, paddingBottom: 0, gap: 8 },
  subtitle: { fontSize: 13, color: colors.textMuted },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24 },
  row: { padding: 14, gap: 4 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
