import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { ChartTooltip } from "./ChartTooltip";

export interface CategoryDatum {
  category: string;
  amount: number;
}

export function CategoryBarChart({
  title,
  description,
  data,
  loading,
  emptyLabel,
}: {
  title: string;
  description: string;
  data: CategoryDatum[];
  loading: boolean;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={{ fontSize: 12, fill: "var(--chart-muted)" }} />
              <YAxis
                type="category"
                dataKey="category"
                tickLine={false}
                axisLine={false}
                width={100}
                tick={{ fontSize: 12, fill: "var(--chart-muted)" }}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip />} />
              <Bar dataKey="amount" name="Amount" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
