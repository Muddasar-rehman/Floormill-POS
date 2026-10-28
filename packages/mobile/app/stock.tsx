import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { formatKgAsMun } from "shared";
import { supabase } from "../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../lib/printHtml";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { colors } from "../components/ui/theme";

interface StockRow {
  item_id: string;
  warehouse_id: string;
  qty_kg: number;
  items: { name: string; mun_kg: number } | null;
  warehouses: { name: string } | null;
}

export default function Stock() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    supabase
      .from("item_stock")
      .select("item_id, warehouse_id, qty_kg, items(name, mun_kg), warehouses(name)")
      .then(({ data }) => {
        setRows((data as unknown as StockRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function handleShare() {
    setSharing(true);
    try {
      const rowsHtml =
        rows.length === 0
          ? `<tr><td colspan="3" class="muted">${t("stock.empty")}</td></tr>`
          : rows
              .map(
                (row) =>
                  `<tr><td>${row.items?.name ?? "-"}</td><td>${row.warehouses?.name ?? "-"}</td><td class="right">${formatKgAsMun(row.qty_kg, row.items?.mun_kg ?? 40)}</td></tr>`
              )
              .join("");
      const body = `<table><thead><tr><th>${t("common.item")}</th><th>${t("common.warehouse")}</th><th class="right">${t("dashboard.stockOnHand")}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      const html = letterheadHtml(t("stock.title"), "", body);
      await shareAsPdf(html, "Stock");
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
    <FlatList
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(row) => `${row.item_id}-${row.warehouse_id}`}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: t("stock.title") }} />
          <Button
            title={sharing ? t("common.saving") : t("common.printSavePdf")}
            variant="outline"
            onPress={handleShare}
            loading={sharing}
            style={styles.shareButton}
          />
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("stock.empty")}</Text>}
      renderItem={({ item: row }) => (
        <Card style={styles.row}>
          <Text style={styles.name}>{row.items?.name ?? "Unknown item"}</Text>
          <Text style={styles.meta}>{row.warehouses?.name ?? "Unknown warehouse"}</Text>
          <Text style={styles.meta}>{formatKgAsMun(row.qty_kg, row.items?.mun_kg ?? 40)}</Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  shareButton: { marginBottom: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24 },
  row: { padding: 14, gap: 2 },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
