import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ChartTooltip } from "./ChartTooltip";

export interface TrendDatum {
  date: string;
  purchases: number;
  sales: number;
}

export function TrendChart({ data, loading }: { data: TrendDatum[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.chartTrend")}</CardTitle>
        <CardDescription>{t("dashboard.chartTrendDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.every((d) => d.purchases === 0 && d.sales === 0) ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t("dashboard.noTrend")}</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: "var(--chart-axis)" }}
                tick={{ fontSize: 12, fill: "var(--chart-muted)" }}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-muted)" }} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--chart-muted)" }} />
              <Line
                type="monotone"
                dataKey="purchases"
                name={t("purchases.title")}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="sales"
                name={t("sales.title")}
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
