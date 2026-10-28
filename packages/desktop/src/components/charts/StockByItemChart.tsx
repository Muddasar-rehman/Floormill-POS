import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ChartTooltip } from "./ChartTooltip";

export interface StockByItemDatum {
  item: string;
  kg: number;
}

export function StockByItemChart({ data, loading }: { data: StockByItemDatum[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.chartStockByItem")}</CardTitle>
        <CardDescription>{t("dashboard.chartStockByItemDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t("dashboard.noStock")}</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="item"
                tickLine={false}
                axisLine={{ stroke: "var(--chart-axis)" }}
                tick={{ fontSize: 12, fill: "var(--chart-muted)" }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--chart-muted)" }} width={48} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip />} />
              <Bar dataKey="kg" name="Stock (kg)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
