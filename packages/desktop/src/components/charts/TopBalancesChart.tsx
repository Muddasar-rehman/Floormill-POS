import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ChartTooltip } from "./ChartTooltip";

export interface BalanceDatum {
  name: string;
  balance: number;
  type: "vendor" | "customer";
}

export function TopBalancesChart({ data, loading }: { data: BalanceDatum[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.chartTopBalances")}</CardTitle>
        <CardDescription>{t("dashboard.chartTopBalancesDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t("dashboard.noBalances")}</div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
                {t("dashboard.vendorPayable")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
                {t("dashboard.customerReceivable")}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 12, fill: "var(--chart-muted)" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  tick={{ fontSize: 12, fill: "var(--chart-muted)" }}
                />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip />} />
                <Bar dataKey="balance" name="Balance" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.type === "vendor" ? "var(--chart-1)" : "var(--chart-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
