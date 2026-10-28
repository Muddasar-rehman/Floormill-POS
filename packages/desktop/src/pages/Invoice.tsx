import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { formatKgAsMun, type Item, type Party, type Purchase, type Sale, type Warehouse } from "shared";
import { supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type InvoiceType = "purchase" | "sale";

type SaleLine = {
  item_id: string;
  weighed_qty_kg: number;
  kaat_pct: number;
  qty_kg: number;
  rate: number;
  watta_pct: number;
  net_rate: number;
  total: number;
};

export function Invoice() {
  const { t } = useTranslation();
  const { type, id } = useParams<{ type: InvoiceType; id: string }>();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);

  const isPurchase = type === "purchase";

  useEffect(() => {
    if (!type || !id) return;
    async function load() {
      if (isPurchase) {
        const { data } = await supabase.from("purchases").select("*").eq("id", id).single();
        const row = data as Purchase | null;
        setPurchase(row);
        if (row) {
          const [partyRes, itemRes, warehouseRes] = await Promise.all([
            supabase.from("parties").select("*").eq("id", row.vendor_id).single(),
            supabase.from("items").select("*").eq("id", row.item_id).single(),
            supabase.from("warehouses").select("*").eq("id", row.warehouse_id).single(),
          ]);
          setParty(partyRes.data as Party);
          setItems(itemRes.data ? [itemRes.data as Item] : []);
          setWarehouse(warehouseRes.data as Warehouse);
        }
      } else {
        const { data } = await supabase
          .from("sales")
          .select("*, sale_items(item_id, weighed_qty_kg, kaat_pct, qty_kg, rate, watta_pct, net_rate, total)")
          .eq("id", id)
          .single();
        const row = data as (Sale & { sale_items: SaleLine[] }) | null;
        setSale(row);
        if (row) {
          setSaleLines(row.sale_items ?? []);
          const itemIds = (row.sale_items ?? []).map((l) => l.item_id);
          const [partyRes, itemsRes, warehouseRes] = await Promise.all([
            supabase.from("parties").select("*").eq("id", row.customer_id).single(),
            itemIds.length ? supabase.from("items").select("*").in("id", itemIds) : Promise.resolve({ data: [] }),
            supabase.from("warehouses").select("*").eq("id", row.warehouse_id).single(),
          ]);
          setParty(partyRes.data as Party);
          setItems((itemsRes.data as Item[]) ?? []);
          setWarehouse(warehouseRes.data as Warehouse);
        }
      }
      setLoading(false);
    }
    load();
  }, [type, id, isPurchase]);

  function itemName(itemId: string) {
    return items.find((i) => i.id === itemId)?.name ?? itemId;
  }
  function itemMunKg(itemId: string) {
    return items.find((i) => i.id === itemId)?.mun_kg ?? 40;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const txn = isPurchase ? purchase : sale;
  if (!txn) {
    return <div className="text-muted-foreground">{t("invoice.notFound")}</div>;
  }

  const label = isPurchase ? t("invoice.purchaseBill") : t("invoice.salesInvoice");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link to={isPurchase ? "/purchases" : "/sales"}>
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
              <h2 className="text-lg font-semibold">{label}</h2>
              <p className="text-sm text-muted-foreground">
                #{isPurchase ? "P" : "S"}-{txn.invoice_no}
              </p>
              <p className="text-sm text-muted-foreground">{txn.date}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{isPurchase ? t("invoice.vendor") : t("invoice.customer")}</div>
              <div className="font-medium">{party?.name}</div>
              {party?.address && <div className="text-muted-foreground">{party.address}</div>}
              {party?.contact && <div className="text-muted-foreground">{party.contact}</div>}
            </div>
            <div>
              <div className="mb-1 font-medium text-muted-foreground">{t("invoice.warehouse")}</div>
              <div className="font-medium">{warehouse?.name}</div>
              {warehouse?.location && <div className="text-muted-foreground">{warehouse.location}</div>}
            </div>
          </div>

          {isPurchase && purchase ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2">{t("invoice.item")}</th>
                    <th className="py-2 text-right">{t("invoice.quantity")}</th>
                    <th className="py-2 text-right">{t("invoice.rate")}</th>
                    <th className="py-2 text-right">{t("invoice.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-3 font-medium">{itemName(purchase.item_id)}</td>
                    <td className="py-3 text-right">{formatKgAsMun(purchase.qty_kg, itemMunKg(purchase.item_id))}</td>
                    <td className="py-3 text-right">{purchase.net_rate.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium">{purchase.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {(purchase.kaat_pct > 0 || purchase.watta_pct > 0) && (
                <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                  <div className="mb-2 font-medium text-foreground">{t("invoice.deductions")}</div>
                  <div className="grid grid-cols-2 gap-y-1">
                    <div>{t("invoice.weighedQty")}</div>
                    <div className="text-right font-medium text-foreground">{formatKgAsMun(purchase.weighed_qty_kg, itemMunKg(purchase.item_id))}</div>
                    <div>{t("invoice.kaatPct")}</div>
                    <div className="text-right font-medium text-foreground">
                      {purchase.kaat_pct} ({((purchase.weighed_qty_kg * purchase.kaat_pct) / 100).toFixed(1)} kg)
                    </div>
                    <div>{t("invoice.wattaPct")}</div>
                    <div className="text-right font-medium text-foreground">
                      {purchase.watta_pct} ({((purchase.weighed_qty_kg * purchase.watta_pct) / 100).toFixed(1)} kg)
                    </div>
                    <div>{t("invoice.netQty")}</div>
                    <div className="text-right font-medium text-foreground">{formatKgAsMun(purchase.qty_kg, itemMunKg(purchase.item_id))}</div>
                    <div>{t("invoice.grossRate")}</div>
                    <div className="text-right font-medium text-foreground">{purchase.rate.toFixed(2)}</div>
                    <div className="pt-1 font-medium text-foreground">{t("invoice.total")}</div>
                    <div className="pt-1 text-right font-semibold text-foreground">{purchase.total.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2">{t("invoice.item")}</th>
                  <th className="py-2 text-right">{t("invoice.quantity")}</th>
                  <th className="py-2 text-right">{t("sales.colKaatWatta")}</th>
                  <th className="py-2 text-right">{t("invoice.rate")}</th>
                  <th className="py-2 text-right">{t("invoice.total")}</th>
                </tr>
              </thead>
              <tbody>
                {saleLines.map((line, index) => (
                  <tr key={index} className="border-b border-border">
                    <td className="py-3 font-medium">{itemName(line.item_id)}</td>
                    <td className="py-3 text-right">{formatKgAsMun(line.qty_kg, itemMunKg(line.item_id))}</td>
                    <td className="py-3 text-right">{line.kaat_pct > 0 || line.watta_pct > 0 ? `${line.kaat_pct} / ${line.watta_pct} kg/100kg` : "-"}</td>
                    <td className="py-3 text-right">{line.net_rate.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium">{line.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-sm">
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>{t("invoice.total")}</span>
                <span>{txn.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
