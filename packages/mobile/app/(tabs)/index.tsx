import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { computePartyNetBalance, todayStr, type Expense, type LedgerEntry, type Party, type Payment, type Purchase, type Receipt, type Sale } from "shared";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { colors } from "../../components/ui/theme";

interface Stats {
  bankBalance: number;
  cashBalance: number;
  totalPayable: number;
  totalReceivable: number;
  unpaidLiabilities: number;
  expensesThisMonth: number;
  overdueInstallments: number;
}

interface StockCard {
  item: string;
  kg: number;
}

interface ActivityRow {
  id: string;
  type: "purchase" | "sale" | "payment" | "receipt" | "expense";
  date: string;
  party: string;
  amount: number;
}

const TYPE_LABEL: Record<ActivityRow["type"], string> = {
  purchase: "common.txnPurchase",
  sale: "common.txnSale",
  payment: "common.txnPayment",
  receipt: "common.txnReceipt",
  expense: "nav.expenses",
};

export default function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [stockCards, setStockCards] = useState<StockCard[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [bankAccounts, cashAccount, liabilities, parties, ledgerEntries, expensesRes, installments, stockRes] = await Promise.all([
        supabase.from("bank_accounts").select("balance"),
        supabase.rpc("fn_cash_balance_as_of", { p_date: todayStr() }),
        supabase.from("liabilities").select("amount, status"),
        supabase.from("parties").select("*"),
        supabase.from("ledger_entries").select("*").order("date").order("created_at"),
        supabase.from("expenses").select("amount, date"),
        supabase.from("installments").select("paid, due_date"),
        supabase.from("item_stock").select("qty_kg, items(name)"),
      ]);

      const bankBalance = ((bankAccounts.data as { balance: number }[]) ?? []).reduce((s, b) => s + b.balance, 0);
      const cashBalance = (cashAccount.data as number | null) ?? 0;
      const unpaidLiabilities = ((liabilities.data as { amount: number; status: string }[]) ?? [])
        .filter((l) => l.status === "unpaid")
        .reduce((s, l) => s + l.amount, 0);

      const entriesByParty = new Map<string, LedgerEntry[]>();
      for (const e of (ledgerEntries.data as LedgerEntry[]) ?? []) {
        const list = entriesByParty.get(e.party_id);
        if (list) list.push(e);
        else entriesByParty.set(e.party_id, [e]);
      }
      let totalPayable = 0;
      let totalReceivable = 0;
      for (const p of (parties.data as Party[]) ?? []) {
        const net = computePartyNetBalance(p, entriesByParty.get(p.id) ?? []);
        if (net < 0) totalPayable += -net;
        else if (net > 0) totalReceivable += net;
      }

      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const expensesThisMonth = ((expensesRes.data as { amount: number; date: string }[]) ?? [])
        .filter((e) => e.date.slice(0, 7) === thisMonth)
        .reduce((s, e) => s + e.amount, 0);

      const today = new Date().toDateString();
      const overdueInstallments = ((installments.data as { paid: boolean; due_date: string }[]) ?? []).filter(
        (i) => !i.paid && new Date(i.due_date) < new Date(today)
      ).length;

      setStats({ bankBalance, cashBalance, totalPayable, totalReceivable, unpaidLiabilities, expensesThisMonth, overdueInstallments });

      const byItem = new Map<string, number>();
      for (const row of (stockRes.data as unknown as { qty_kg: number; items: { name: string } | null }[]) ?? []) {
        const name = row.items?.name ?? "Unknown";
        byItem.set(name, (byItem.get(name) ?? 0) + row.qty_kg);
      }
      setStockCards(Array.from(byItem, ([item, kg]) => ({ item, kg })).sort((a, b) => b.kg - a.kg));

      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadActivity() {
      const [purchasesRes, salesRes, paymentsRes, receiptsRes, expensesRes, parties] = await Promise.all([
        supabase.from("purchases").select("id, date, total, vendor_id").order("date", { ascending: false }).limit(5),
        supabase.from("sales").select("id, date, total, customer_id").order("date", { ascending: false }).limit(5),
        supabase.from("payments").select("id, date, amount, vendor_id").order("date", { ascending: false }).limit(5),
        supabase.from("receipts").select("id, date, amount, customer_id").order("date", { ascending: false }).limit(5),
        supabase.from("expenses").select("id, date, amount, category").order("date", { ascending: false }).limit(5),
        supabase.from("parties").select("id, name"),
      ]);
      const partyName = (id: string) => (parties.data as { id: string; name: string }[] | null)?.find((p) => p.id === id)?.name ?? "-";

      const rows: ActivityRow[] = [
        ...((purchasesRes.data as (Purchase & { vendor_id: string })[]) ?? []).map((p) => ({
          id: p.id,
          type: "purchase" as const,
          date: p.date,
          party: partyName(p.vendor_id),
          amount: p.total,
        })),
        ...((salesRes.data as (Sale & { customer_id: string })[]) ?? []).map((s) => ({
          id: s.id,
          type: "sale" as const,
          date: s.date,
          party: partyName(s.customer_id),
          amount: s.total,
        })),
        ...((paymentsRes.data as Payment[]) ?? []).map((p) => ({
          id: p.id,
          type: "payment" as const,
          date: p.date,
          party: partyName(p.vendor_id),
          amount: p.amount,
        })),
        ...((receiptsRes.data as Receipt[]) ?? []).map((r) => ({
          id: r.id,
          type: "receipt" as const,
          date: r.date,
          party: partyName(r.customer_id),
          amount: r.amount,
        })),
        ...((expensesRes.data as (Expense & { category: string })[]) ?? []).map((e) => ({
          id: e.id,
          type: "expense" as const,
          date: e.date,
          party: e.category,
          amount: e.amount,
        })),
      ];
      rows.sort((a, b) => (a.date < b.date ? 1 : -1));
      setActivity(rows.slice(0, 10));
    }
    loadActivity();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>{t("dashboard.subtitle")}</Text>

      <View style={styles.statGrid}>
        <StatCard label={t("dashboard.statCashBalance")} value={stats?.cashBalance} money />
        <StatCard label={t("dashboard.statBankBalance")} value={stats?.bankBalance} money />
        <StatCard label={t("dashboard.statTotalPayable")} value={stats?.totalPayable} money />
        <StatCard label={t("dashboard.statTotalReceivable")} value={stats?.totalReceivable} money />
        <StatCard label={t("dashboard.statUnpaidLiabilities")} value={stats?.unpaidLiabilities} money />
        <StatCard label={t("dashboard.statExpensesMonth")} value={stats?.expensesThisMonth} money />
        <StatCard label={t("dashboard.statOverdueInstallments")} value={stats?.overdueInstallments} />
      </View>

      <Text style={styles.sectionTitle}>{t("dashboard.stockOnHand")}</Text>
      {stockCards.length === 0 ? (
        <Text style={styles.empty}>{t("dashboard.noStock")}</Text>
      ) : (
        <View style={styles.statGrid}>
          {stockCards.map((s) => (
            <Card key={s.item} style={styles.statCard}>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.item}
              </Text>
              <Text style={styles.statValue}>{s.kg.toFixed(2)} kg</Text>
            </Card>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>{t("dashboard.recentActivity")}</Text>
      {activity.length === 0 ? (
        <Text style={styles.empty}>{t("dashboard.noTrend")}</Text>
      ) : (
        activity.map((a) => (
          <Card key={`${a.type}-${a.id}`} style={styles.activityRow}>
            <View style={styles.activityTop}>
              <Badge label={t(TYPE_LABEL[a.type])} />
              <Text style={styles.meta}>{a.date}</Text>
            </View>
            <View style={styles.activityTop}>
              <Text style={styles.name}>{a.party}</Text>
              <Text style={styles.total}>{a.amount.toFixed(2)}</Text>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, money }: { label: string; value: number | undefined; money?: boolean }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statValue}>{value === undefined ? "-" : money ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  subtitle: { fontSize: 13, color: colors.textMuted },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  empty: { fontSize: 13, color: colors.textMuted },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "47%", padding: 12, gap: 4 },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  activityRow: { padding: 12, gap: 6 },
  activityTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { fontSize: 12, color: colors.textMuted },
  name: { fontSize: 14, fontWeight: "600", color: colors.text },
  total: { fontSize: 14, fontWeight: "700", color: colors.primary },
});
