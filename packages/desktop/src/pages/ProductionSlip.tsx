import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { formatKgAsMun, type Item, type ProductionBatch, type Warehouse } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type LineRow = { item_id: string; qty_kg: number; rate?: number };

export function ProductionSlip() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [batch, setBatch] = useState<ProductionBatch | null>(null);
  const [inputs, setInputs] = useState<LineRow[]>([]);
  const [outputs, setOutputs] = useState<LineRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data } = await supabase
        .from("production_batches")
        .select("*, production_inputs(item_id, qty_kg), production_outputs(item_id, qty_kg, rate)")
        .eq("id", id)
        .single();
      const row = data as (ProductionBatch & { production_inputs: LineRow[]; production_outputs: LineRow[] }) | null;
      setBatch(row);
      if (row) {
        setInputs(row.production_inputs ?? []);
        setOutputs(row.production_outputs ?? []);
        const itemIds = [...(row.production_inputs ?? []), ...(row.production_outputs ?? [])].map((r) => r.item_id);
        const [itemsRes, warehouseRes] = await Promise.all([
          itemIds.length ? supabase.from("items").select("*").in("id", itemIds) : Promise.resolve({ data: [] }),
          supabase.from("warehouses").select("*").eq("id", row.warehouse_id).single(),
        ]);
        setItems((itemsRes.data as Item[]) ?? []);
        setWarehouse(warehouseRes.data as Warehouse);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  function itemName(itemId: string) {
    return items.find((i) => i.id === itemId)?.name ?? itemId;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!batch) {
    return <div className="text-muted-foreground">{t("production.notFound")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to="/production">
            <ArrowLeft />
            {t("common.back")}
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer />
          {t("common.printSavePdf")}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-6 p-10">
          <div className="flex items-start justify-between border-b border-border pb-6">
            <div>
              <h1 className="text-xl font-semibold">The Awan Flour Mill</h1>
              <p className="text-sm text-muted-foreground">Grain Trading &amp; Warehouse Management</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-semibold">{t("production.slipTitle")}</h2>
              <p className="text-sm text-muted-foreground">#{batch.batch_no}</p>
              <p className="text-sm text-muted-foreground">{batch.date}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("common.warehouse")}</div>
              <div className="font-medium">{warehouse?.name}</div>
              {warehouse?.location && <div className="text-muted-foreground">{warehouse.location}</div>}
            </div>
            {batch.notes && (
              <div>
                <div className="mb-1 font-medium text-muted-foreground">{t("common.notes")}</div>
                <div className="font-medium">{batch.notes}</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">{t("production.inputsLabel")}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.item")}</th>
                  <th className="py-2 text-right">{t("gatePass.colQtyKg")}</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((row, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-3 font-medium">{itemName(row.item_id)}</td>
                    <td className="py-3 text-right">{formatKgAsMun(row.qty_kg, items.find((i) => i.id === row.item_id)?.mun_kg ?? 40)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">{t("production.outputsLabel")}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("common.item")}</th>
                  <th className="py-2 text-right">{t("gatePass.colQtyKg")}</th>
                  <th className="py-2 text-right">{t("production.fieldRate")}</th>
                </tr>
              </thead>
              <tbody>
                {outputs.map((row, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-3 font-medium">{itemName(row.item_id)}</td>
                    <td className="py-3 text-right">{formatKgAsMun(row.qty_kg, items.find((i) => i.id === row.item_id)?.mun_kg ?? 40)}</td>
                    <td className="py-3 text-right">{row.rate?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
