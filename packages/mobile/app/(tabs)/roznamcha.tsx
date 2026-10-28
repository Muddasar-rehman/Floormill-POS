import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { todayStr, type Party, type RoznamchaDirection, type RoznamchaEntry } from "shared";
import { supabase } from "../../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../../lib/printHtml";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { FormField } from "../../components/ui/FormField";
import { colors } from "../../components/ui/theme";

export default function Roznamcha() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<RoznamchaEntry[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [sharing, setSharing] = useState(false);

  async function load() {
    setLoading(true);
    const [entriesRes, partiesRes] = await Promise.all([
      supabase
        .from("roznamcha_entries")
        .select("*")
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("parties").select("*").order("name"),
    ]);
    setEntries((entriesRes.data as RoznamchaEntry[]) ?? []);
    setParties((partiesRes.data as Party[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  function partyName(id: string | null) {
    if (!id) return "-";
    return parties.find((p) => p.id === id)?.name ?? id;
  }

  const kharchaRows = entries.filter((e) => e.direction === "kharcha");
  const aamdanRows = entries.filter((e) => e.direction === "aamdan");
  const kharchaTotal = kharchaRows.reduce((sum, e) => sum + e.amount, 0);
  const aamdanTotal = aamdanRows.reduce((sum, e) => sum + e.amount, 0);

  async function handleShare() {
    setSharing(true);
    try {
      function rowsHtml(rows: RoznamchaEntry[]) {
        if (rows.length === 0) return `<tr><td colspan="4" class="muted">${t("roznamcha.empty")}</td></tr>`;
        return rows
          .map(
            (e) =>
              `<tr><td>${e.date}</td><td>${partyName(e.party_id)}</td><td>${e.description}</td><td class="right">${e.amount.toFixed(2)}</td></tr>`
          )
          .join("");
      }
      const body = `
        <h3>${t("roznamcha.aamdan")} (${aamdanTotal.toFixed(2)})</h3>
        <table><thead><tr><th>${t("common.date")}</th><th>${t("roznamcha.colParty")}</th><th>${t("roznamcha.colDescription")}</th><th class="right">${t("common.amount")}</th></tr></thead><tbody>${rowsHtml(aamdanRows)}</tbody></table>
        <h3 style="margin-top:20px;">${t("roznamcha.kharcha")} (${kharchaTotal.toFixed(2)})</h3>
        <table><thead><tr><th>${t("common.date")}</th><th>${t("roznamcha.colParty")}</th><th>${t("roznamcha.colDescription")}</th><th class="right">${t("common.amount")}</th></tr></thead><tbody>${rowsHtml(kharchaRows)}</tbody></table>
      `;
      const html = letterheadHtml(t("roznamcha.printTitle"), fromDate === toDate ? fromDate : `${fromDate} – ${toDate}`, body);
      await shareAsPdf(html, `Roznamcha-${fromDate}`);
    } finally {
      setSharing(false);
    }
  }

  function Section({ dir, rows, total }: { dir: RoznamchaDirection; rows: RoznamchaEntry[]; total: number }) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{dir === "kharcha" ? t("roznamcha.kharcha") : t("roznamcha.aamdan")}</Text>
          <Text style={styles.sectionTotal}>{total.toFixed(2)}</Text>
        </View>
        {rows.length === 0 ? (
          <Text style={styles.empty}>{t("roznamcha.empty")}</Text>
        ) : (
          rows.map((e) => (
            <Card key={e.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{partyName(e.party_id)}</Text>
                <Text style={styles.total}>{e.amount.toFixed(2)}</Text>
              </View>
              <Text style={styles.meta}>
                {e.date} · {e.description}
              </Text>
              {e.reference_no ? <Text style={styles.meta}>{e.reference_no}</Text> : null}
            </Card>
          ))
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.dateRow}>
            <FormField label={t("common.from")}>
              <Input value={fromDate} onChangeText={setFromDate} />
            </FormField>
            <FormField label={t("common.to")}>
              <Input value={toDate} onChangeText={setToDate} />
            </FormField>
          </View>
          <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} />
          <Section dir="aamdan" rows={aamdanRows} total={aamdanTotal} />
          <Section dir="kharcha" rows={kharchaRows} total={kharchaTotal} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 16 },
  dateRow: { flexDirection: "row", gap: 12 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  sectionTotal: { fontSize: 16, fontWeight: "700", color: colors.primary },
  empty: { textAlign: "center", color: colors.textMuted, marginVertical: 12 },
  row: { padding: 14, gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  total: { fontSize: 15, fontWeight: "700", color: colors.primary },
  meta: { fontSize: 13, color: colors.textMuted },
});
