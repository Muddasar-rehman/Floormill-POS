import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDaysStr, computePartyNetBalance, daysAgoStr, todayStr, type Expense, type LedgerEntry, type Party, type Payment, type Purchase, type Receipt, type Sale } from "shared";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { StockByItemChart, type StockByItemDatum } from "../components/charts/StockByItemChart";
import { TrendChart, type TrendDatum } from "../components/charts/TrendChart";
import { CategoryBarChart, type CategoryDatum } from "../components/charts/CategoryBarChart";
import { TopBalancesChart, type BalanceDatum } from "../components/charts/TopBalancesChart";
import { RecentActivity, type ActivityRow } from "../components/RecentActivity";

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
  munKg: number;
}

export function Dashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [stockData, setStockData] = useState<StockByItemDatum[]>([]);
  const [stockCards, setStockCards] = useState<StockCard[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [trendData, setTrendData] = useState<TrendDatum[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [expenseData, setExpenseData] = useState<CategoryDatum[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(true);
  const [balanceData, setBalanceData] = useState<BalanceDatum[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [bankAccounts, cashAccount, liabilities, parties, ledgerEntries, expensesRes, installments] = await Promise.all([
        supabase.from("bank_accounts").select("balance"),
        supabase.rpc("fn_cash_balance_as_of", { p_date: todayStr() }),
        supabase.from("liabilities").select("amount, status"),
        supabase.from("parties").select("*"),
        supabase.from("ledger_entries").select("*").order("date").order("created_at"),
        supabase.from("expenses").select("amount, date"),
        supabase.from("installments").select("paid, due_date"),
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
      const balances: BalanceDatum[] = [];
      for (const p of (parties.data as Party[]) ?? []) {
        const net = computePartyNetBalance(p, entriesByParty.get(p.id) ?? []);
        if (net < 0) {
          totalPayable += -net;
          balances.push({ name: p.name, balance: -net, type: "vendor" });
        } else if (net > 0) {
          totalReceivable += net;
          balances.push({ name: p.name, balance: net, type: "customer" });
        }
      }
      balances.sort((a, b) => b.balance - a.balance);
      setBalanceData(balances.slice(0, 6));
      setBalanceLoading(false);

      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const expensesThisMonth = ((expensesRes.data as { amount: number; date: string }[]) ?? [])
        .filter((e) => e.date.slice(0, 7) === thisMonth)
        .reduce((s, e) => s + e.amount, 0);

      const today = new Date().toDateString();
      const overdueInstallments = ((installments.data as { paid: boolean; due_date: string }[]) ?? []).filter(
        (i) => !i.paid && new Date(i.due_date) < new Date(today),
      ).length;

      setStats({
        bankBalance,
        cashBalance,
        totalPayable,
        totalReceivable,
        unpaidLiabilities,
        expensesThisMonth,
        overdueInstallments,
      });
    }
    load();
  }, []);

  useEffect(() => {
    supabase
      .from("item_stock")
      .select("qty_kg, items(name, mun_kg, key)")
      .then(({ data }) => {
        const byItem = new Map<string, number>();
        const munKgByItem = new Map<string, number>();
        const keyByItem = new Map<string, string | null>();
        for (const row of (data as unknown as { qty_kg: number; items: { name: string; mun_kg: number; key: string | null } | null }[]) ?? []) {
          const name = row.items?.name ?? "Unknown";
          byItem.set(name, (byItem.get(name) ?? 0) + row.qty_kg);
          munKgByItem.set(name, row.items?.mun_kg ?? 40);
          keyByItem.set(name, row.items?.key ?? null);
        }
        setStockData(Array.from(byItem, ([item, kg]) => ({ item, kg })).sort((a, b) => b.kg - a.kg));
        // Wheat is always shown first among the stock cards — it's the mill's primary raw material — then the rest by quantity.
        setStockCards(
          Array.from(byItem, ([item, kg]) => ({ item, kg, munKg: munKgByItem.get(item) ?? 40 })).sort((a, b) => {
            const aWheat = keyByItem.get(a.item) === "wheat";
            const bWheat = keyByItem.get(b.item) === "wheat";
            if (aWheat !== bWheat) return aWheat ? -1 : 1;
            return b.kg - a.kg;
          }),
        );
        setStockLoading(false);
      });
  }, []);

  useEffect(() => {
    const sinceStr = daysAgoStr(29);

    Promise.all([
      supabase.from("purchases").select("date, total").gte("date", sinceStr),
      supabase.from("sales").select("date, total").gte("date", sinceStr),
    ]).then(([purchasesRes, salesRes]) => {
      const byDate = new Map<string, { purchases: number; sales: number }>();
      for (let i = 0; i < 30; i++) {
        byDate.set(addDaysStr(sinceStr, i), { purchases: 0, sales: 0 });
      }
      for (const row of (purchasesRes.data as { date: string; total: number }[]) ?? []) {
        const entry = byDate.get(row.date);
        if (entry) entry.purchases += row.total;
      }
      for (const row of (salesRes.data as { date: string; total: number }[]) ?? []) {
        const entry = byDate.get(row.date);
        if (entry) entry.sales += row.total;
      }
      setTrendData(
        Array.from(byDate, ([date, v]) => ({
          date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          ...v,
        })),
      );
      setTrendLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase
      .from("expenses")
      .select("category, amount")
      .then(({ data }) => {
        const byCategory = new Map<string, number>();
        for (const row of (data as { category: string; amount: number }[]) ?? []) {
          byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount);
        }
        setExpenseData(
          Array.from(byCategory, ([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 6),
        );
        setExpenseLoading(false);
      });
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
      setActivityLoading(false);
    }
    loadActivity();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("dashboard.stockOnHand")}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {stockLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : stockCards.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground">{t("dashboard.noStock")}</p>
          ) : (
            stockCards.map((s) => <StockCard key={s.item} name={s.item} kg={s.kg} munKg={s.munKg} />)
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label={t("dashboard.statCashBalance")} value={stats?.cashBalance} money />
        <StatCard label={t("dashboard.statBankBalance")} value={stats?.bankBalance} money />
        <StatCard label={t("dashboard.statTotalPayable")} value={stats?.totalPayable} money />
        <StatCard label={t("dashboard.statTotalReceivable")} value={stats?.totalReceivable} money />
        <StatCard label={t("dashboard.statUnpaidLiabilities")} value={stats?.unpaidLiabilities} money />
        <StatCard label={t("dashboard.statExpensesMonth")} value={stats?.expensesThisMonth} money />
        <StatCard label={t("dashboard.statOverdueInstallments")} value={stats?.overdueInstallments} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StockByItemChart data={stockData} loading={stockLoading} />
        <TrendChart data={trendData} loading={trendLoading} />
        <CategoryBarChart
          title={t("dashboard.chartExpensesByCategory")}
          description={t("dashboard.chartExpensesByCategoryDesc")}
          data={expenseData}
          loading={expenseLoading}
          emptyLabel={t("dashboard.noExpenses")}
        />
        <TopBalancesChart data={balanceData} loading={balanceLoading} />
      </div>

      <RecentActivity rows={activity} loading={activityLoading} />
    </div>
  );
}

function StockCard({ name, kg }: { name: string; kg: number; munKg: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold">{kg.toFixed(2)} kg</div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, money }: { label: string; value: number | undefined; money?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {value === undefined ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="break-words text-xl font-semibold">{money ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value}</div>
        )}
      </CardContent>
    </Card>
  );
}
