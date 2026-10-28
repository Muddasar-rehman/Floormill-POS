import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import type { ProfitLossResult } from "shared";
import { supabase } from "../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../lib/printHtml";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { FormField } from "../components/ui/FormField";
import { colors } from "../components/ui/theme";

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function Row({ label, value, bold, large }: { label: string; value: number; bold?: boolean; large?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold, large && styles.large]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, large && styles.large, value < 0 && styles.negative]}>{value.toFixed(2)}</Text>
    </View>
  );
}

export default function ProfitLoss() {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<ProfitLossResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.rpc("fn_profit_loss", { p_date_from: dateFrom, p_date_to: dateTo }).then(({ data }) => {
      setResult((data as ProfitLossResult[] | null)?.[0] ?? null);
      setLoading(false);
    });
  }, [dateFrom, dateTo]);

  async function handleShare() {
    if (!result) return;
    setSharing(true);
    try {
      const body = `
        <table>
          <tbody>
            <tr><td>${t("profitLoss.salesRevenue")}</td><td class="right">${result.sales_revenue.toFixed(2)}</td></tr>
            <tr><td>${t("profitLoss.cogs")}</td><td class="right">-${result.cogs.toFixed(2)}</td></tr>
            <tr><td><strong>${t("profitLoss.grossProfit")}</strong></td><td class="right"><strong>${result.gross_profit.toFixed(2)}</strong></td></tr>
            <tr><td>${t("profitLoss.operatingExpenses")}</td><td class="right">-${result.expenses.toFixed(2)}</td></tr>
            <tr><td>${t("profitLoss.chadaiCharges")}</td><td class="right">-${result.chadai.toFixed(2)}</td></tr>
            <tr><td>${t("profitLoss.commission")}</td><td class="right">-${result.commission.toFixed(2)}</td></tr>
            <tr><td><strong>${t("profitLoss.netProfit")}</strong></td><td class="right"><strong>${result.net_profit.toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      `;
      const html = letterheadHtml(t("profitLoss.title"), `${dateFrom} – ${dateTo}`, body);
      await shareAsPdf(html, "ProfitLoss");
    } finally {
      setSharing(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("profitLoss.title") }} />
      <View style={styles.dateRow}>
        <FormField label={t("common.from")}>
          <Input value={dateFrom} onChangeText={setDateFrom} />
        </FormField>
        <FormField label={t("common.to")}>
          <Input value={dateTo} onChangeText={setDateTo} />
        </FormField>
      </View>

      <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} disabled={!result} />

      {loading || !result ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <Card style={styles.card}>
          <Row label={t("profitLoss.salesRevenue")} value={result.sales_revenue} />
          <Row label={t("profitLoss.cogs")} value={-result.cogs} />
          <Row label={t("profitLoss.grossProfit")} value={result.gross_profit} bold />
          <Row label={t("profitLoss.operatingExpenses")} value={-result.expenses} />
          <Row label={t("profitLoss.chadaiCharges")} value={-result.chadai} />
          <Row label={t("profitLoss.commission")} value={-result.commission} />
          <Row label={t("profitLoss.netProfit")} value={result.net_profit} bold large />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { paddingVertical: 24, alignItems: "center" },
  content: { padding: 16, gap: 12 },
  dateRow: { flexDirection: "row", gap: 12 },
  card: { padding: 16, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.textMuted },
  bold: { fontWeight: "700", color: colors.text },
  large: { fontSize: 16 },
  negative: { color: colors.destructive },
});
