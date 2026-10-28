import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { todayStr, type ProfitLossResult } from "shared";
import { supabase } from "../lib/supabase";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Skeleton } from "../components/ui/skeleton";

function firstOfMonth() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}-01`;
}

export function ProfitLoss() {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());
  const [result, setResult] = useState<ProfitLossResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("fn_profit_loss", { p_date_from: dateFrom, p_date_to: dateTo })
      .then(({ data }) => {
        setResult((data as ProfitLossResult[] | null)?.[0] ?? null);
        setLoading(false);
      });
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("profitLoss.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("profitLoss.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
          <FormField label={t("common.from")}>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </FormField>
          <FormField label={t("common.to")}>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          {loading || !result ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <Row label={t("profitLoss.salesRevenue")} value={result.sales_revenue} />
              <Row label={t("profitLoss.cogs")} value={-result.cogs} />
              <Row label={t("profitLoss.grossProfit")} value={result.gross_profit} bold border />
              <Row label={t("profitLoss.operatingExpenses")} value={-result.expenses} />
              <Row label={t("profitLoss.chadaiCharges")} value={-result.chadai} />
              <Row label={t("profitLoss.commission")} value={-result.commission} />
              <Row label={t("profitLoss.netProfit")} value={result.net_profit} bold border large />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, border, large }: { label: string; value: number; bold?: boolean; border?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${border ? "border-t border-border pt-2" : ""} ${bold ? "font-semibold" : "text-muted-foreground"} ${large ? "text-base" : ""}`}>
      <span>{label}</span>
      <span className={value < 0 ? "text-destructive" : ""}>{value.toFixed(2)}</span>
    </div>
  );
}
