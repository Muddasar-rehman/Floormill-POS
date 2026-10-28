import { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { computePartyNetBalance, computeRunningNetBalances, openingNet, type LedgerEntry, type Party } from "shared";
import { supabase } from "../../lib/supabase";
import { letterheadHtml, shareAsPdf } from "../../lib/printHtml";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { FormField } from "../../components/ui/FormField";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { colors } from "../../components/ui/theme";

const TXN_KEY: Record<string, string> = {
  purchase: "common.txnPurchase",
  sale: "common.txnSale",
  payment: "common.txnPayment",
  receipt: "common.txnReceipt",
  transfer: "common.txnTransfer",
};

export default function Ledger() {
  const { t } = useTranslation();
  const [parties, setParties] = useState<Party[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Party | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [allEntries, setAllEntries] = useState<LedgerEntry[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharingAll, setSharingAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoadingList(true);
      const [{ data: partiesData }, { data: entriesData }] = await Promise.all([
        supabase.from("parties").select("*").order("name"),
        supabase.from("ledger_entries").select("*").order("date").order("created_at"),
      ]);
      const partiesList = (partiesData as Party[]) ?? [];
      setParties(partiesList);

      const entriesByParty = new Map<string, LedgerEntry[]>();
      for (const e of (entriesData as LedgerEntry[]) ?? []) {
        const list = entriesByParty.get(e.party_id);
        if (list) list.push(e);
        else entriesByParty.set(e.party_id, [e]);
      }
      const net = new Map<string, number>();
      for (const p of partiesList) net.set(p.id, computePartyNetBalance(p, entriesByParty.get(p.id) ?? []));
      setBalances(net);
      setLoadingList(false);
    }
    load();
  }, []);

  // Full unfiltered history for the selected party, so the running balance is
  // always correct even when a date range is applied for display below.
  useEffect(() => {
    if (!selected) {
      setAllEntries([]);
      return;
    }
    setLoadingEntries(true);
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("party_id", selected.id)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setAllEntries((data as LedgerEntry[]) ?? []);
        setLoadingEntries(false);
      });
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setEntries([]);
      return;
    }
    const running = computeRunningNetBalances(selected, allEntries);
    const withRunning = allEntries.map((e, i) => ({ ...e, balance_after: running[i] }));
    setEntries(withRunning.filter((e) => (!dateFrom || e.date >= dateFrom) && (!dateTo || e.date <= dateTo)));
  }, [selected, allEntries, dateFrom, dateTo]);

  const filteredParties = useMemo(() => parties.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())), [parties, search]);

  function partyBalance(p: Party) {
    return balances.get(p.id) ?? 0;
  }

  async function handleShare() {
    if (!selected) return;
    setSharing(true);
    try {
      const rowsHtml =
        entries.length === 0 && selected.opening_balance === 0
          ? `<tr><td colspan="4" class="muted">${t("ledger.empty", { name: selected.name })}</td></tr>`
          : [
              selected.opening_balance !== 0
                ? `<tr><td>-</td><td>${t("ledger.openingBalance")}</td><td class="right">-</td><td class="right">${openingNet(selected).toFixed(2)}</td></tr>`
                : "",
              ...entries.map(
                (e) =>
                  `<tr><td>${e.date}</td><td>${t(TXN_KEY[e.txn_type] ?? e.txn_type)}</td><td class="right">${(e.debit || e.credit).toFixed(2)}</td><td class="right">${e.balance_after.toFixed(2)}</td></tr>`
              ),
            ].join("");
      const body = `<table><thead><tr><th>${t("ledger.colDate")}</th><th>${t("ledger.colType")}</th><th class="right">${t("common.amount")}</th><th class="right">${t("ledger.colBalance")}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      const html = letterheadHtml(t("ledger.statementTitle"), selected.name, body);
      await shareAsPdf(html, `Khata-${selected.name}`);
    } finally {
      setSharing(false);
    }
  }

  async function handleShareAll() {
    setSharingAll(true);
    try {
      // Always export every party, regardless of the on-screen search filter —
      // this is meant to be the full Khata summary, not just the visible subset.
      const rowsHtml =
        parties.length === 0
          ? `<tr><td colspan="2" class="muted">${t("ledger.noParties")}</td></tr>`
          : parties
              .map((p) => {
                const balance = partyBalance(p);
                const label = balance < 0 ? t("ledger.tagPayable") : balance > 0 ? t("ledger.tagReceivable") : t("ledger.tagSettled");
                return `<tr><td>${p.name}</td><td>${label}</td><td class="right">${Math.abs(balance).toFixed(2)}</td></tr>`;
              })
              .join("");
      const body = `<table><thead><tr><th>${t("ledger.selectParty")}</th><th>${t("ledger.colType")}</th><th class="right">${t("ledger.colBalance")}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
      const html = letterheadHtml(t("ledger.title"), "", body);
      await shareAsPdf(html, "Khata");
    } finally {
      setSharingAll(false);
    }
  }

  if (selected) {
    const balance = partyBalance(selected);
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <Button title={`‹ ${t("common.back")}`} variant="ghost" onPress={() => setSelected(null)} />
          <Text style={styles.name}>{selected.name}</Text>
          <Text style={styles.balanceText}>
            {balance < 0
              ? t("ledger.balancePayable", { amount: Math.abs(balance).toFixed(2) })
              : balance > 0
                ? t("ledger.balanceReceivable", { amount: balance.toFixed(2) })
                : t("ledger.balanceSettled")}
          </Text>
          <View style={styles.dateRow}>
            <FormField label={t("common.from")}>
              <Input value={dateFrom} onChangeText={setDateFrom} placeholder="YYYY-MM-DD" />
            </FormField>
            <FormField label={t("common.to")}>
              <Input value={dateTo} onChangeText={setDateTo} placeholder="YYYY-MM-DD" />
            </FormField>
          </View>
          <Button title={sharing ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShare} loading={sharing} />
        </View>
        {loadingEntries ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={entries}
            keyExtractor={(e) => e.id}
            ListEmptyComponent={<Text style={styles.empty}>{t("ledger.empty", { name: selected.name })}</Text>}
            renderItem={({ item: e }) => (
              <Card style={styles.row}>
                <View style={styles.rowTop}>
                  <Badge label={t(TXN_KEY[e.txn_type] ?? e.txn_type)} />
                  <Text style={styles.meta}>{e.date}</Text>
                </View>
                <View style={styles.rowTop}>
                  <Text style={styles.meta}>
                    {t("ledger.colDebit")}: {e.debit ? e.debit.toFixed(2) : "-"} · {t("ledger.colCredit")}: {e.credit ? e.credit.toFixed(2) : "-"}
                  </Text>
                  <Text style={styles.total}>{e.balance_after.toFixed(2)}</Text>
                </View>
              </Card>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Input placeholder={t("ledger.searchPlaceholder") ?? undefined} value={search} onChangeText={setSearch} />
        <Button title={sharingAll ? t("common.saving") : t("common.printSavePdf")} variant="outline" onPress={handleShareAll} loading={sharingAll} />
      </View>
      {loadingList ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={filteredParties}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<Text style={styles.empty}>{t("ledger.noParties")}</Text>}
          renderItem={({ item: p }) => {
            const balance = partyBalance(p);
            const isReceivable = balance > 0;
            const isPayable = balance < 0;
            return (
              <Pressable onPress={() => setSelected(p)}>
                <Card style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Badge label={isReceivable ? t("ledger.tagReceivable") : isPayable ? t("ledger.tagPayable") : t("ledger.tagSettled")} />
                  </View>
                  <Text style={[styles.balanceAmount, isReceivable ? styles.receivable : isPayable ? styles.payable : styles.meta]}>
                    {Math.abs(balance).toFixed(2)}
                  </Text>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: 16, paddingBottom: 0, gap: 10 },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textMuted, marginTop: 24 },
  row: { padding: 14, gap: 6 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "700", color: colors.text, flex: 1, marginRight: 8 },
  meta: { fontSize: 13, color: colors.textMuted },
  total: { fontSize: 15, fontWeight: "700", color: colors.text },
  balanceAmount: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  receivable: { color: "#059669" },
  payable: { color: colors.destructive },
  detailHeader: { padding: 16, gap: 8 },
  balanceText: { fontSize: 14, color: colors.textMuted },
  dateRow: { flexDirection: "row", gap: 12 },
});
