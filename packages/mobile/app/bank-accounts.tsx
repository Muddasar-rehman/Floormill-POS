import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { type BankAccount } from "shared";
import { supabase } from "../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../lib/printHtml";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { colors } from "../components/ui/theme";

export default function BankAccounts() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("bank_accounts").select("*").order("bank_name");
    setRows((data as BankAccount[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const total = rows.reduce((sum, r) => sum + r.balance, 0);

  async function handleShare() {
    setSharing(true);
    try {
      const rowsHtml =
        rows.length === 0
          ? `<tr><td colspan="4" class="muted">${t("bankAccounts.empty")}</td></tr>`
          : rows
              .map(
                (r) =>
                  `<tr><td>${r.bank_name}</td><td>${r.account_title}</td><td>${r.account_number ?? ""}</td><td class="right">${r.balance.toFixed(2)}</td></tr>`
              )
              .join("");
      const body = `<table><thead><tr><th>${t("bankAccounts.fieldBankName")}</th><th>${t("bankAccounts.fieldAccountTitle")}</th><th>${t("bankAccounts.fieldAccountNumber")}</th><th class="right">${t("common.amount")}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      const html = letterheadHtml(t("bankAccounts.title"), t("bankAccounts.subtitleTotal", { amount: total.toFixed(2) }), body);
      await shareAsPdf(html, "bank-accounts");
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
      <Stack.Screen options={{ title: t("bankAccounts.title") }} />
      <View style={styles.header}>
        <Text style={styles.subtitle}>{t("bankAccounts.subtitleTotal", { amount: total.toFixed(2) })}</Text>
        <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} />
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={styles.empty}>{t("bankAccounts.empty")}</Text>}
        renderItem={({ item: r }) => (
          <Card style={styles.row}>
            <Text style={styles.name}>
              {r.bank_name} · {r.account_title}
            </Text>
            {r.account_number ? <Text style={styles.meta}>{r.account_number}</Text> : null}
            <Text style={styles.balance}>{r.balance.toFixed(2)}</Text>
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
  balance: { fontSize: 15, fontWeight: "700", color: colors.primary, marginTop: 4 },
});
