import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatKgAsMun } from "shared";
import { supabase } from "../lib/supabase";
import { Card, CardContent } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Skeleton } from "../components/ui/skeleton";

interface StockRow {
  item_id: string;
  warehouse_id: string;
  qty_kg: number;
  items: { name: string; mun_kg: number } | null;
  warehouses: { name: string } | null;
}

export function Stock() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("item_stock")
      .select("qty_kg, items(name, mun_kg), warehouses(name)")
      .then(({ data }) => {
        setRows((data as unknown as StockRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("stock.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("stock.subtitle")}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("stock.colItem")}</TableHead>
                  <TableHead>{t("stock.colWarehouse")}</TableHead>
                  <TableHead className="text-right">{t("stock.colQuantity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.item_id}-${r.warehouse_id}`}>
                    <TableCell className="font-medium">{r.items?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.warehouses?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatKgAsMun(r.qty_kg, r.items?.mun_kg ?? 40)}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                      {t("stock.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
