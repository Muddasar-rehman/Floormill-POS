import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { computeApArLists, type ApArBalance } from "../lib/apAr";
import { letterheadHtml, shareAsPdf } from "../lib/printHtml";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { colors } from "../components/ui/theme";

export default function ApAr() {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState<ApArBalance[]>([]);
  const [customers, setCustomers] = useState<ApArBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { vendors, customers } = await computeApArLists();
      setVendors(vendors);
      setCustomers(customers);
      setLoading(false);
    }
    load();
  }, []);

  const totalPayable = vendors.reduce((sum, v) => sum + v.balance, 0);
  const totalReceivable = customers.reduce((sum, c) => sum + c.balance, 0);

  async function handleShare() {
    setSharing(true);
    try {
      function rows(list: ApArBalance[]) {
        return list.map((r) => `<tr><td>${r.party.name}</td><td class="right">${r.balance.toFixed(2)}</td></tr>`).join("");
      }
      const body = `
        <h3>${t("apAr.tabPayable")} (${totalPayable.toFixed(2)})</h3>
        <table><tbody>${rows(vendors)}</tbody></table>
        <h3 style="margin-top:20px;">${t("apAr.tabReceivable")} (${totalReceivable.toFixed(2)})</h3>
        <table><tbody>${rows(customers)}</tbody></table>
      `;
      const html = letterheadHtml(t("apAr.title"), "", body);
      await shareAsPdf(html, "AP-AR");
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("apAr.title") }} />
      <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} />
      <View style={styles.statsRow}>
        <Card style={styles.stat}>
          <Text style={styles.statLabel}>{t("apAr.totalPayable")}</Text>
          <Text style={styles.statValue}>{totalPayable.toFixed(2)}</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.statLabel}>{t("apAr.totalReceivable")}</Text>
          <Text style={styles.statValue}>{totalReceivable.toFixed(2)}</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>{t("apAr.tabPayable")}</Text>
      {vendors.length === 0 ? (
        <Text style={styles.empty}>{t("apAr.emptyVendors")}</Text>
      ) : (
        vendors.map((v) => (
          <Card key={v.party.id} style={styles.row}>
            <Text style={styles.name}>{v.party.name}</Text>
            <Text style={styles.total}>{v.balance.toFixed(2)}</Text>
          </Card>
        ))
      )}

      <Text style={styles.sectionTitle}>{t("apAr.tabReceivable")}</Text>
      {customers.length === 0 ? (
        <Text style={styles.empty}>{t("apAr.emptyCustomers")}</Text>
      ) : (
        customers.map((c) => (
          <Card key={c.party.id} style={styles.row}>
            <Text style={styles.name}>{c.party.name}</Text>
            <Text style={styles.total}>{c.balance.toFixed(2)}</Text>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 10 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  stat: { flex: 1, padding: 14 },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 8 },
  empty: { textAlign: "center", color: colors.textMuted, marginVertical: 8 },
  row: { padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.text },
  total: { fontSize: 15, fontWeight: "700", color: colors.text },
});
