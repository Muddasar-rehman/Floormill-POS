import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { todayStr, type BreakevenResult } from "shared";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Skeleton } from "../components/ui/skeleton";

function firstOfMonth() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}-01`;
}

export function Breakeven() {
  const { t } = useTranslation();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());
  const [result, setResult] = useState<BreakevenResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("fn_breakeven", { p_date_from: dateFrom, p_date_to: dateTo })
      .then(({ data }) => {
        setResult((data as BreakevenResult[] | null)?.[0] ?? null);
        setLoading(false);
      });
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("breakeven.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("breakeven.subtitle")}</p>
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

      {loading || !result ? (
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t("breakeven.fixedCosts")} value={result.fixed_costs.toFixed(2)} />
          <Stat label={t("breakeven.avgPrice")} value={result.avg_price_per_kg.toFixed(2)} />
          <Stat label={t("breakeven.avgCost")} value={result.avg_cost_per_kg.toFixed(2)} />
          <Stat label={t("breakeven.contributionMargin")} value={result.contribution_per_kg.toFixed(2)} />
          <Stat label={t("breakeven.breakevenVolume")} value={result.breakeven_qty_kg.toFixed(1)} highlight />
          <Stat label={t("breakeven.breakevenRevenue")} value={result.breakeven_revenue.toFixed(2)} highlight />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/[0.03]" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
