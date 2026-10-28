import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { todayStr, type ProfitLossResult } from "shared";
import { supabase } from "../lib/supabase";
import { computeApArTotals } from "../lib/apAr";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

interface Section {
  labelKey: string;
  amount: number;
}

export function BalanceSheet() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Section[]>([]);
  const [liabilities, setLiabilities] = useState<Section[]>([]);
  const [equity, setEquity] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [bankRes, cashRes, stockRes, liabRes, shareholdersRes, apAr, plRes] = await Promise.all([
        supabase.from("bank_accounts").select("balance"),
        supabase.rpc("fn_cash_balance_as_of", { p_date: todayStr() }),
        supabase.from("item_stock").select("qty_kg, items(avg_cost)"),
        supabase.from("liabilities").select("amount").eq("status", "unpaid"),
        supabase.from("shareholders").select("investment_amount"),
        computeApArTotals(),
        supabase.rpc("fn_profit_loss", { p_date_from: "2000-01-01", p_date_to: todayStr() }),
      ]);

      const bankBalance = ((bankRes.data as { balance: number }[]) ?? []).reduce((s, b) => s + b.balance, 0);
      const cashBalance = (cashRes.data as number | null) ?? 0;
      const stockValue = ((stockRes.data as unknown as { qty_kg: number; items: { avg_cost: number } | null }[]) ?? []).reduce(
        (s, r) => s + r.qty_kg * (r.items?.avg_cost ?? 0),
        0,
      );
      const unpaidLiabilities = ((liabRes.data as { amount: number }[]) ?? []).reduce((s, l) => s + l.amount, 0);
      const shareholderCapital = ((shareholdersRes.data as { investment_amount: number }[]) ?? []).reduce(
        (s, sh) => s + sh.investment_amount,
        0,
      );
      const retainedEarnings = ((plRes.data as ProfitLossResult[] | null)?.[0]?.net_profit ?? 0);

      setAssets([
        { labelKey: "balanceSheet.bankBalances", amount: bankBalance },
        { labelKey: "balanceSheet.cashInHand", amount: cashBalance },
        { labelKey: "balanceSheet.stockValuation", amount: stockValue },
        { labelKey: "balanceSheet.accountsReceivable", amount: apAr.totalReceivable },
      ]);
      setLiabilities([
        { labelKey: "balanceSheet.accountsPayable", amount: apAr.totalPayable },
        { labelKey: "balanceSheet.otherLiabilities", amount: unpaidLiabilities },
      ]);
      setEquity([
        { labelKey: "balanceSheet.shareholderCapital", amount: shareholderCapital },
        { labelKey: "balanceSheet.retainedEarnings", amount: retainedEarnings },
      ]);
      setLoading(false);
    }
    load();
  }, []);

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);
  const totalEquity = equity.reduce((s, e) => s + e.amount, 0);
  const diff = totalAssets - (totalLiabilities + totalEquity);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("balanceSheet.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("balanceSheet.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title={t("balanceSheet.assets")} rows={assets} total={totalAssets} loading={loading} />
        <Section title={t("balanceSheet.liabilities")} rows={liabilities} total={totalLiabilities} loading={loading} />
        <Section title={t("balanceSheet.equity")} rows={equity} total={totalEquity} loading={loading} />
      </div>

      {!loading && Math.abs(diff) > 0.01 && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{t("balanceSheet.mismatchWarning", { amount: diff.toFixed(2) })}</CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, rows, total, loading }: { title: string; rows: Section[]; total: number; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {rows.map((r) => (
              <div key={r.labelKey} className="flex justify-between text-muted-foreground">
                <span>{t(r.labelKey)}</span>
                <span>{r.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground">
              <span>{t("common.total")}</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
